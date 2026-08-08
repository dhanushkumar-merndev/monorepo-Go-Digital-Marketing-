import type { TestRideDetail } from '@gdm/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '../auth/auth-provider';
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
import { MobileShell } from '../components/mobile-shell';
import { enqueueTestRideCommand, replayTestRideOfflineWork } from '../data/test-ride-offline';
import {
  requireTestRideLocationPermission,
  startTestRideLocationTracking,
  stopTestRideLocationTracking,
} from '../platform/test-ride-location';
import { useAppStore } from '../store/app-store';
import { useAuthStore } from '../store/auth-store';
import { useTestRidesUiStore } from '../store/test-rides-ui.store';
import { parseJson } from './assigned-leads-screen';

const startChecks = [
  'customer_briefed',
  'documents_verified',
  'exterior_checked',
  'fuel_or_charge_checked',
  'interior_checked',
  'safety_equipment_checked',
] as const;
const completionChecks = [...startChecks, 'vehicle_returned'] as const;

export function MobileTestRideDetailScreen() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { request } = useAuth();
  const database = useSQLiteContext();
  const cache = useQueryClient();
  const principal = useAuthStore((state) => state.principal);
  const connectivity = useAppStore((state) => state.connectivity);
  const disclosureRideId = useTestRidesUiStore((state) => state.disclosureRideId);
  const setDisclosureRideId = useTestRidesUiStore((state) => state.setDisclosureRideId);
  const [odometer, setOdometer] = useState('');
  const [otp, setOtp] = useState('');
  const [feedback, setFeedback] = useState('');
  const [evidence, setEvidence] = useState('');
  const [reason, setReason] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['mobile', 'test-ride', rideId],
    queryFn: async () => parseJson<TestRideDetail>(await request(`/test-rides/${rideId}`)),
    enabled: Boolean(rideId),
    refetchInterval: 60_000,
  });

  const command = useMutation({
    mutationFn: async (input: {
      path: string;
      payload: Record<string, unknown>;
      queueOffline: boolean;
    }) => {
      if (!principal || !rideId) throw new Error('No active ride session.');
      if (connectivity === 'offline') {
        if (!input.queueOffline) throw new Error('Starting a ride requires server authorization.');
        await stopTestRideLocationTracking();
        await enqueueTestRideCommand(database, {
          clientOrganizationId: principal.clientOrganizationId,
          path: `/test-rides/${rideId}/${input.path}`,
          payload: input.payload,
        });
        return { queued: true, response: null };
      }
      await replayTestRideOfflineWork(database, request, principal.clientOrganizationId);
      const response = await request(`/test-rides/${rideId}/${input.path}`, {
        body: JSON.stringify(input.payload),
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
        method: 'POST',
      });
      if (!response.ok) throw new Error(`Ride command rejected (${String(response.status)}).`);
      await stopTestRideLocationTracking();
      return { queued: false, response: await parseJson<Record<string, unknown>>(response) };
    },
    onError: (caught) =>
      setMessage(caught instanceof Error ? caught.message : 'Ride action failed.'),
    onSuccess: (result) => {
      setMessage(result.queued ? 'Saved safely for exactly-once replay.' : 'Ride updated.');
      setDisclosureRideId(null);
      setChecked(new Set());
      void cache.invalidateQueries({ queryKey: ['mobile', 'test-ride', rideId] });
      void cache.invalidateQueries({ queryKey: ['mobile', 'assigned-test-rides'] });
    },
  });

  if (query.isPending)
    return (
      <MobileShell title="Test ride">
        <StatePanel state="loading" />
      </MobileShell>
    );
  if (query.isError || !query.data || !rideId)
    return (
      <MobileShell title="Test ride">
        <StatePanel actionLabel="Retry" onAction={() => void query.refetch()} state="error" />
      </MobileShell>
    );
  const ride = query.data.ride;
  const checklist = (names: readonly string[]) =>
    Object.fromEntries(names.map((name) => [name, checked.has(name)]));
  const toggle = (name: string) =>
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  async function startRide() {
    if (!principal) return;
    try {
      await requireTestRideLocationPermission();
      const response = await request(`/test-rides/${rideId}/start`, {
        body: JSON.stringify({
          checklist: checklist(startChecks),
          disclosure_acknowledged: true,
          expected_version: ride.version,
          odometer_km: Number(odometer),
          otp_code: otp || null,
        }),
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
        method: 'POST',
      });
      if (!response.ok) throw new Error(`Start rejected (${String(response.status)}).`);
      const result = await parseJson<{ tracking_expires_at: string; version: number }>(response);
      try {
        await startTestRideLocationTracking({
          clientOrganizationId: principal.clientOrganizationId,
          rideId,
          trackingExpiresAt: result.tracking_expires_at,
        });
      } catch (caught) {
        await stopTestRideLocationTracking();
        try {
          await request(`/test-rides/${rideId}/tracking/stop`, {
            body: JSON.stringify({
              expected_version: result.version,
              reason: 'PERMISSION_REVOKED',
            }),
            headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
            method: 'POST',
          });
        } catch {
          // The server-side tracking timeout remains the fail-safe when compensation cannot connect.
        }
        throw caught;
      }
      setMessage('Ride started. The ongoing notification shows while location tracking is active.');
      setDisclosureRideId(null);
      setChecked(new Set());
      await query.refetch();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Unable to start the ride.');
    }
  }

  async function terminal(
    path: 'cancel' | 'complete' | 'no-show' | 'tracking/stop',
    payload: Record<string, unknown>,
  ) {
    command.mutate({ path, payload, queueOffline: true });
  }

  return (
    <MobileShell title={ride.contact_name}>
      {connectivity === 'offline' ? (
        <Alert
          description="Tracking stops immediately on this device. Completion/cancel/no-show replays with one durable idempotency key."
          title="Offline"
          tone="warning"
        />
      ) : null}
      {message ? <Alert description={message} title="Test ride action" tone="info" /> : null}
      <Card>
        <View className="gap-2">
          <Badge
            label={ride.status.replaceAll('_', ' ')}
            tone={ride.status === 'ACTIVE' ? 'success' : 'info'}
          />
          <AppText variant="heading">{ride.vehicle_model}</AppText>
          <AppText tone="muted">
            {ride.demo_vehicle_reference} · {new Date(ride.scheduled_start_at).toLocaleString()}
          </AppText>
          <AppText>{ride.customer_location}</AppText>
          <View className="flex-row flex-wrap gap-2">
            <Button
              label="Call customer"
              onPress={() => void Linking.openURL(`tel:${ride.phone_e164}`)}
              variant="secondary"
            />
            <Button
              label="Navigate"
              onPress={() =>
                void Linking.openURL(
                  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ride.customer_location)}`,
                )
              }
              variant="secondary"
            />
          </View>
        </View>
      </Card>

      {ride.status === 'EXECUTIVE_ASSIGNED' ? (
        <Card>
          <View className="gap-3">
            <AppText accessibilityRole="header" variant="heading">
              Start checklist
            </AppText>
            <ChecklistButtons checked={checked} names={startChecks} toggle={toggle} />
            <TextField
              keyboardType="number-pad"
              label="Start kilometres"
              onChangeText={setOdometer}
              value={odometer}
            />
            {ride.otp_required ? (
              <TextField
                keyboardType="number-pad"
                label="Customer start OTP"
                onChangeText={setOtp}
                secureTextEntry
                value={otp}
              />
            ) : null}
            <Button
              disabled={
                connectivity === 'offline' || checked.size < startChecks.length || !odometer
              }
              label="Review location disclosure"
              onPress={() => setDisclosureRideId(rideId)}
            />
          </View>
        </Card>
      ) : null}

      {disclosureRideId === rideId ? (
        <PermissionDisclosure
          actionLabel="I understand — start ride"
          bullets={[
            'Updates target every 30–60 seconds while this assigned ride is ACTIVE.',
            'An ongoing Android notification remains visible.',
            'Tracking stops on completion, cancellation, manual stop, timeout or revoked permission.',
          ]}
          description="Your location is shared with authorized managers only for this active assigned job. It is not an off-duty employee history."
          loading={command.isPending}
          onRequest={() => void startRide()}
          statusLabel="Not started"
          statusTone="warning"
          title="Active test-ride location"
        />
      ) : null}

      {ride.status === 'ACTIVE' ? (
        <Card>
          <View className="gap-3">
            <AppText accessibilityRole="header" variant="heading">
              Active tracking
            </AppText>
            <Badge
              label={ride.tracking_active ? 'TRACKING ACTIVE' : 'TRACKING STOPPED'}
              tone={ride.tracking_active ? 'success' : 'warning'}
            />
            {ride.last_location ? (
              <AppText tone="muted" variant="caption">
                Last accepted {new Date(ride.last_location.captured_at).toLocaleString()} · accuracy
                ±{Math.round(ride.last_location.accuracy_m)} m
                {ride.last_location.stale ? ' · STALE' : ''}
              </AppText>
            ) : null}
            {ride.tracking_active ? (
              <Button
                label="Stop tracking manually"
                onPress={() =>
                  void terminal('tracking/stop', {
                    expected_version: ride.version,
                    reason: 'MANUAL_STOP',
                  })
                }
                variant="danger"
              />
            ) : null}
          </View>
        </Card>
      ) : null}

      {ride.status === 'ACTIVE' ? (
        <Card>
          <View className="gap-3">
            <AppText accessibilityRole="header" variant="heading">
              Complete ride
            </AppText>
            <ChecklistButtons checked={checked} names={completionChecks} toggle={toggle} />
            <TextField
              keyboardType="number-pad"
              label="End kilometres"
              onChangeText={setOdometer}
              value={odometer}
            />
            <TextField
              label="Customer feedback"
              multiline
              onChangeText={setFeedback}
              value={feedback}
            />
            <TextField
              description="Record condition/return evidence; do not include unnecessary sensitive data."
              label="Completion evidence"
              multiline
              onChangeText={setEvidence}
              value={evidence}
            />
            <Button
              disabled={
                checked.size < completionChecks.length || !odometer || !feedback || !evidence
              }
              label="Complete and stop tracking"
              onPress={() =>
                void terminal('complete', {
                  checklist: checklist(completionChecks),
                  completion_evidence: evidence,
                  end_odometer_km: Number(odometer),
                  expected_version: ride.version,
                  feedback,
                })
              }
            />
          </View>
        </Card>
      ) : null}

      {['BOOKED', 'CUSTOMER_CONFIRMED', 'EXECUTIVE_ASSIGNED', 'ACTIVE'].includes(ride.status) ? (
        <Card>
          <View className="gap-3">
            <AppText accessibilityRole="header" variant="heading">
              Exception outcome
            </AppText>
            <TextField
              label="Mandatory reason / contact attempt evidence"
              multiline
              onChangeText={setReason}
              value={reason}
            />
            {ride.status !== 'ACTIVE' ? (
              <Button
                disabled={!reason}
                label="Record no-show"
                onPress={() =>
                  void terminal('no-show', {
                    expected_version: ride.version,
                    note: reason,
                    reason: 'CUSTOMER_UNAVAILABLE',
                  })
                }
                variant="secondary"
              />
            ) : null}
            <Button
              disabled={!reason}
              label="Cancel and stop tracking"
              onPress={() =>
                void terminal('cancel', {
                  expected_version: ride.version,
                  note: reason,
                  reason: 'OTHER',
                })
              }
              variant="danger"
            />
          </View>
        </Card>
      ) : null}

      <Card>
        <View className="gap-3">
          <AppText accessibilityRole="header" variant="heading">
            Ride timeline
          </AppText>
          {query.data.events.map((event) => (
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

function ChecklistButtons({
  checked,
  names,
  toggle,
}: {
  checked: Set<string>;
  names: readonly string[];
  toggle(name: string): void;
}) {
  return (
    <View className="gap-2">
      {names.map((name) => (
        <Button
          key={name}
          label={`${checked.has(name) ? '✓' : '○'} ${name.replaceAll('_', ' ')}`}
          onPress={() => toggle(name)}
          variant={checked.has(name) ? 'primary' : 'secondary'}
        />
      ))}
    </View>
  );
}
