import type { DeliverySummary } from '@gdm/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { useAuth } from '../auth/auth-provider';
import { MobileShell } from '../components/mobile-shell';
import {
  Alert,
  AppText,
  Badge,
  Button,
  Card,
  PermissionDisclosure,
  StatePanel,
  TextField,
} from '../components/ui';
import { enqueueDeliveryCommand } from '../data/delivery-offline';
import {
  requireDeliveryLocationPermission,
  startDeliveryLocationTracking,
  stopDeliveryLocationTracking,
} from '../platform/delivery-location';
import { useAppStore } from '../store/app-store';
import { useAuthStore } from '../store/auth-store';
import { useDeliveryUiStore } from '../store/delivery-ui.store';
import { parseJson } from './assigned-leads-screen';

interface DeliveryDetail {
  checklist: {
    checked: boolean;
    checked_at: string | null;
    code: string;
    note: string | null;
    required: boolean;
  }[];
  delivery: DeliverySummary;
  events: {
    actor_name: string | null;
    created_at: string;
    event_type: string;
    id: string;
    reason: string | null;
  }[];
  proofs: {
    created_at: string;
    file_name: string | null;
    id: string;
    proof_type: string;
    received_by: string | null;
    scanner_status: string | null;
    status: string;
  }[];
  required_proof_types: string[];
  tracking_expires_at: string | null;
}

export function MobileDeliveryDetailScreen() {
  const params = useLocalSearchParams<{ jobId?: string }>();
  const jobId = params.jobId;
  const { request } = useAuth();
  const database = useSQLiteContext();
  const cache = useQueryClient();
  const principal = useAuthStore((state) => state.principal);
  const connectivity = useAppStore((state) => state.connectivity);
  const disclosureJobId = useDeliveryUiStore((state) => state.disclosureJobId);
  const setDisclosureJobId = useDeliveryUiStore((state) => state.setDisclosureJobId);
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [requestedFor, setRequestedFor] = useState('');
  const [otp, setOtp] = useState('');
  const [proofType, setProofType] = useState<'PHOTO' | 'SIGNATURE'>('PHOTO');
  const query = useQuery({
    queryKey: ['mobile', 'delivery', jobId],
    queryFn: async () => parseJson<DeliveryDetail>(await request(`/delivery/${jobId}`)),
    enabled: Boolean(jobId),
  });
  const command = useMutation({
    mutationFn: async ({
      path,
      payload,
      queueOffline,
    }: {
      path: string;
      payload: Record<string, unknown>;
      queueOffline: boolean;
    }) => {
      if (!jobId || !principal) throw new Error('No delivery is selected.');
      const idempotencyKey = randomUUID();
      if (queueOffline) await stopDeliveryLocationTracking();
      if (queueOffline && connectivity === 'offline') {
        await enqueueDeliveryCommand(database, {
          clientOrganizationId: principal.clientOrganizationId,
          operationId: idempotencyKey,
          path: `/delivery/${jobId}/${path}`,
          payload,
        });
        return { queued: true };
      }
      let response: Response;
      try {
        response = await request(`/delivery/${jobId}/${path}`, {
          body: JSON.stringify(payload),
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
          method: 'POST',
        });
      } catch (error) {
        if (!queueOffline) throw error;
        await enqueueDeliveryCommand(database, {
          clientOrganizationId: principal.clientOrganizationId,
          operationId: idempotencyKey,
          path: `/delivery/${jobId}/${path}`,
          payload,
        });
        return { queued: true };
      }
      if (queueOffline && response.status >= 500) {
        await enqueueDeliveryCommand(database, {
          clientOrganizationId: principal.clientOrganizationId,
          operationId: idempotencyKey,
          path: `/delivery/${jobId}/${path}`,
          payload,
        });
        return { queued: true };
      }
      if (!response.ok) throw new Error(`Delivery action rejected (${String(response.status)}).`);
      return { queued: false };
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'Delivery action failed.'),
    onSuccess: (result) => {
      setMessage(
        result.queued ? 'Saved to the tenant-scoped offline outbox.' : 'Delivery updated.',
      );
      setReason('');
      void cache.invalidateQueries({ queryKey: ['mobile', 'delivery', jobId] });
      void cache.invalidateQueries({ queryKey: ['mobile', 'assigned-deliveries'] });
    },
  });

  if (query.isPending)
    return (
      <MobileShell title="Delivery">
        <StatePanel state="loading" />
      </MobileShell>
    );
  if (query.isError || !query.data || !jobId)
    return (
      <MobileShell title="Delivery">
        <StatePanel actionLabel="Retry" onAction={() => void query.refetch()} state="error" />
      </MobileShell>
    );
  const detail = query.data;
  const delivery = detail.delivery;
  const selectedJobId = jobId;

  async function startDelivery() {
    if (!principal) return;
    try {
      await requireDeliveryLocationPermission();
      const response = await request(`/delivery/${jobId}/start`, {
        body: JSON.stringify({ disclosure_acknowledged: true, expected_version: delivery.version }),
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
        method: 'POST',
      });
      const started = await parseJson<{ tracking_expires_at: string; version: number }>(response);
      try {
        await startDeliveryLocationTracking({
          clientOrganizationId: principal.clientOrganizationId,
          jobId: selectedJobId,
          trackingExpiresAt: started.tracking_expires_at,
        });
      } catch (error) {
        await stopDeliveryLocationTracking();
        try {
          await request(`/delivery/${jobId}/fail`, {
            body: JSON.stringify({
              expected_version: started.version,
              reason: 'Device foreground location could not start.',
            }),
            headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
            method: 'POST',
          });
        } catch {
          // The server timeout remains the fail-safe when compensation cannot connect.
        }
        throw error;
      }
      setDisclosureJobId(null);
      setMessage(
        'Delivery started. The ongoing notification remains visible while tracking is active.',
      );
      await query.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start delivery.');
    }
  }

  async function updateChecklist(code: string, checked: boolean) {
    const response = await request(`/delivery/${jobId}/checklist`, {
      body: JSON.stringify({ checked, code, expected_version: delivery.version, note: null }),
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
      method: 'POST',
    });
    if (!response.ok) throw new Error(`Checklist update rejected (${String(response.status)}).`);
    await query.refetch();
  }

  async function uploadProof() {
    if (connectivity === 'offline') throw new Error('Private proof uploads require connectivity.');
    const picked = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ['image/jpeg', 'image/png', 'application/pdf'],
    });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    if (!asset?.mimeType || asset.size === undefined)
      throw new Error('The selected proof lacks safe MIME or size metadata.');
    const fileResponse = await fetch(asset.uri);
    const blob = await fileResponse.blob();
    const digest = await Crypto.digest(
      Crypto.CryptoDigestAlgorithm.SHA256,
      await blob.arrayBuffer(),
    );
    const checksum = bytesToBase64(new Uint8Array(digest));
    const begin = await parseJson<{
      method: 'PUT';
      proof_id: string;
      upload_url: string;
    }>(
      await request(`/delivery/${jobId}/proofs/initiate`, {
        body: JSON.stringify({
          checksum_sha256: checksum,
          content_length: asset.size,
          content_type: asset.mimeType,
          file_name: asset.name,
          proof_type: proofType,
        }),
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
        method: 'POST',
      }),
    );
    const stored = await fetch(begin.upload_url, {
      body: blob,
      headers: { 'Content-Type': asset.mimeType, 'x-amz-checksum-sha256': checksum },
      method: begin.method,
    });
    if (!stored.ok) throw new Error('Private object storage rejected the proof upload.');
    const complete = await request(`/delivery/${jobId}/proofs/complete`, {
      body: JSON.stringify({
        checksum_sha256: checksum,
        expected_version: delivery.version,
        proof_id: begin.proof_id,
      }),
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
      method: 'POST',
    });
    if (!complete.ok) throw new Error(`Proof completion rejected (${String(complete.status)}).`);
    setMessage('Proof uploaded privately and awaits clean scan/review.');
    await query.refetch();
  }

  return (
    <MobileShell title={delivery.customer_name}>
      {connectivity === 'offline' ? (
        <Alert
          description="Location stops immediately on this device. Completion, delay, failure and reschedule replay with stable idempotency keys."
          title="Offline"
          tone="warning"
        />
      ) : null}
      {message ? <Alert description={message} title="Delivery action" tone="info" /> : null}
      <Card>
        <View className="gap-2">
          <Badge label={delivery.status.replaceAll('_', ' ')} tone="info" />
          <AppText variant="heading">{delivery.vehicle_label}</AppText>
          <AppText tone="muted">
            {delivery.booking_reference} · {new Date(delivery.scheduled_for).toLocaleString()}
          </AppText>
          <AppText>{delivery.destination_address}</AppText>
          <View className="flex-row flex-wrap gap-2">
            <Button
              label="Call customer"
              onPress={() => void Linking.openURL(`tel:${delivery.phone_e164}`)}
              variant="secondary"
            />
            <Button
              label="Navigate"
              onPress={() =>
                void Linking.openURL(
                  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    delivery.destination_latitude !== null &&
                      delivery.destination_longitude !== null
                      ? `${String(delivery.destination_latitude)},${String(delivery.destination_longitude)}`
                      : delivery.destination_address,
                  )}`,
                )
              }
              variant="secondary"
            />
          </View>
        </View>
      </Card>

      {['VEHICLE_ALLOCATED', 'VEHICLE_PREPARATION'].includes(delivery.status) ? (
        <Card>
          <View className="gap-3">
            <AppText accessibilityRole="header" variant="heading">
              Preparation checklist
            </AppText>
            {detail.checklist.map((item) => (
              <Button
                key={item.code}
                label={`${item.checked ? '✓' : '○'} ${item.code.replaceAll('_', ' ')}`}
                onPress={() =>
                  void updateChecklist(item.code, !item.checked).catch((error: unknown) =>
                    setMessage(error instanceof Error ? error.message : 'Checklist update failed.'),
                  )
                }
                variant={item.checked ? 'primary' : 'secondary'}
              />
            ))}
          </View>
        </Card>
      ) : null}

      {delivery.status === 'DELIVERY_SCHEDULED' ? (
        <Card>
          <View className="gap-3">
            <AppText accessibilityRole="header" variant="heading">
              Start delivery
            </AppText>
            <Button
              disabled={connectivity === 'offline'}
              label="Review location disclosure"
              onPress={() => setDisclosureJobId(jobId)}
            />
          </View>
        </Card>
      ) : null}

      {disclosureJobId === jobId ? (
        <PermissionDisclosure
          actionLabel="I understand — start delivery"
          bullets={[
            'Updates target every 30–60 seconds only while this delivery is active.',
            'An ongoing Android notification remains visible.',
            'Tracking stops on completion, delay, failure, reschedule, timeout or terminal session loss.',
          ]}
          description="Your active-job location is visible only to authorized delivery managers. It is not an off-duty employee history."
          loading={command.isPending}
          onRequest={() => void startDelivery()}
          statusLabel="Not started"
          statusTone="warning"
          title="Active delivery location"
        />
      ) : null}

      {delivery.status === 'OUT_FOR_DELIVERY' ? (
        <Card>
          <View className="gap-3">
            <AppText accessibilityRole="header" variant="heading">
              Completion proof
            </AppText>
            <AppText tone="muted" variant="caption">
              Required: {detail.required_proof_types.join(', ')}. Permanent RC is not required here.
            </AppText>
            <TextField label="Received by" onChangeText={setReceivedBy} value={receivedBy} />
            <View className="flex-row gap-2">
              <Button
                className="flex-1"
                label="Photo"
                onPress={() => setProofType('PHOTO')}
                variant={proofType === 'PHOTO' ? 'primary' : 'secondary'}
              />
              <Button
                className="flex-1"
                label="Signature"
                onPress={() => setProofType('SIGNATURE')}
                variant={proofType === 'SIGNATURE' ? 'primary' : 'secondary'}
              />
            </View>
            <Button
              label={`Upload ${proofType.toLowerCase()} proof`}
              onPress={() =>
                void uploadProof().catch((error: unknown) =>
                  setMessage(error instanceof Error ? error.message : 'Proof upload failed.'),
                )
              }
              variant="secondary"
            />
            <TextField
              keyboardType="number-pad"
              label="Customer OTP"
              onChangeText={setOtp}
              secureTextEntry
              value={otp}
            />
            <View className="flex-row gap-2">
              <Button
                className="flex-1"
                disabled={connectivity === 'offline'}
                label="Send OTP"
                onPress={() =>
                  command.mutate({
                    path: 'otp/request',
                    payload: { expected_version: delivery.version },
                    queueOffline: false,
                  })
                }
                variant="secondary"
              />
              <Button
                className="flex-1"
                disabled={connectivity === 'offline' || otp.length !== 6}
                label="Verify OTP"
                onPress={() =>
                  command.mutate({
                    path: 'otp/verify',
                    payload: { code: otp, expected_version: delivery.version },
                    queueOffline: false,
                  })
                }
                variant="secondary"
              />
            </View>
            <Button
              disabled={!receivedBy}
              label="Complete and stop tracking"
              onPress={() =>
                command.mutate({
                  path: 'complete',
                  payload: { expected_version: delivery.version, received_by: receivedBy },
                  queueOffline: true,
                })
              }
            />
          </View>
        </Card>
      ) : null}

      {['DELIVERY_SCHEDULED', 'OUT_FOR_DELIVERY', 'DELAYED', 'FAILED'].includes(delivery.status) ? (
        <Card>
          <View className="gap-3">
            <AppText accessibilityRole="header" variant="heading">
              Delay, failure or reschedule
            </AppText>
            <TextField label="Mandatory reason" multiline onChangeText={setReason} value={reason} />
            {['DELIVERY_SCHEDULED', 'OUT_FOR_DELIVERY'].includes(delivery.status) ? (
              <View className="flex-row gap-2">
                <Button
                  className="flex-1"
                  disabled={!reason}
                  label="Delayed"
                  onPress={() =>
                    command.mutate({
                      path: 'delay',
                      payload: { expected_version: delivery.version, reason },
                      queueOffline: true,
                    })
                  }
                  variant="secondary"
                />
                <Button
                  className="flex-1"
                  disabled={!reason}
                  label="Failed"
                  onPress={() =>
                    command.mutate({
                      path: 'fail',
                      payload: { expected_version: delivery.version, reason },
                      queueOffline: true,
                    })
                  }
                  variant="danger"
                />
              </View>
            ) : null}
            <TextField
              description="ISO timestamp with offset, for example 2026-09-16T11:00:00+05:30"
              label="Requested new time"
              onChangeText={setRequestedFor}
              value={requestedFor}
            />
            <Button
              disabled={!reason || !requestedFor}
              label="Request reschedule"
              onPress={() =>
                command.mutate({
                  path: 'reschedule',
                  payload: {
                    expected_version: delivery.version,
                    reason,
                    requested_for: requestedFor,
                  },
                  queueOffline: true,
                })
              }
              variant="secondary"
            />
          </View>
        </Card>
      ) : null}

      <Card>
        <View className="gap-3">
          <AppText accessibilityRole="header" variant="heading">
            Proof and audit timeline
          </AppText>
          {detail.proofs.map((proof) => (
            <View className="border-l-2 border-primary pl-3" key={proof.id}>
              <AppText variant="label">
                {proof.proof_type} · {proof.status}
              </AppText>
              <AppText tone="muted" variant="caption">
                {new Date(proof.created_at).toLocaleString()}
              </AppText>
            </View>
          ))}
          {detail.events.map((event) => (
            <View className="border-l-2 border-primary pl-3" key={event.id}>
              <AppText variant="label">{event.event_type.replaceAll('_', ' ')}</AppText>
              <AppText tone="muted" variant="caption">
                {new Date(event.created_at).toLocaleString()} · {event.actor_name ?? 'System'}
              </AppText>
              {event.reason ? <AppText>{event.reason}</AppText> : null}
            </View>
          ))}
        </View>
      </Card>
    </MobileShell>
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
