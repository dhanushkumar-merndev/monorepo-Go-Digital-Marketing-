import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '../auth/auth-provider';
import { Alert, AppText, Badge, Button, Card, StatePanel, TextField } from '../components/ui';
import { MobileShell } from '../components/mobile-shell';
import { enqueueOfflineLeadCommand, replayLeadOutbox } from '../data/lead-outbox';
import { useAppStore } from '../store/app-store';
import { useAuthStore } from '../store/auth-store';
import { parseJson } from './assigned-leads-screen';

interface MobileLeadDetail {
  lead: {
    branch_id: string;
    id: string;
    contact_name: string;
    phone_e164: string;
    status: string;
    source: string;
    vehicle_interest: string;
    version: number;
    next_action_at: string | null;
  };
  timeline: { id: string; title: string; detail: string | null; occurred_at: string }[];
}

interface MobileCallSummary {
  created_at: string;
  id: string;
  origin: 'PROVIDER' | 'TEL_FALLBACK';
  outcome_requirement: 'NOT_REQUIRED' | 'REQUIRED' | 'RECORDED' | 'EXCEPTION';
  status: string;
}

export function MobileLeadDetailScreen() {
  const { leadId } = useLocalSearchParams<{ leadId: string }>();
  const { request } = useAuth();
  const database = useSQLiteContext();
  const cache = useQueryClient();
  const principal = useAuthStore((state) => state.principal);
  const connectivity = useAppStore((state) => state.connectivity);
  const [note, setNote] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [callOutcome, setCallOutcome] = useState('INTERESTED');
  const query = useQuery({
    queryKey: ['mobile', 'lead', leadId],
    queryFn: async () => parseJson<MobileLeadDetail>(await request(`/leads/${leadId}`)),
    enabled: Boolean(leadId),
  });
  const command = useMutation({
    mutationFn: async (input: {
      path: string;
      payload: Record<string, unknown>;
      version: number;
    }) => {
      if (!principal) throw new Error('No active client session.');
      if (connectivity === 'offline') {
        await enqueueOfflineLeadCommand(database, {
          baseVersion: input.version,
          clientOrganizationId: principal.clientOrganizationId,
          path: input.path,
          payload: input.payload,
        });
        return { queued: true };
      }
      const response = await request(input.path, {
        body: JSON.stringify(input.payload),
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
        method: 'POST',
      });
      if (!response.ok) throw new Error(`Command rejected (${String(response.status)}).`);
      return { queued: false };
    },
    onSuccess: (result) => {
      setMessage(result.queued ? 'Saved to the tenant-scoped local outbox for replay.' : 'Saved.');
      setNote('');
      void cache.invalidateQueries({ queryKey: ['mobile', 'lead', leadId] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Command failed.'),
  });
  const callHistory = useQuery({
    queryKey: ['mobile', 'lead-calls', leadId],
    queryFn: async () =>
      parseJson<{ calls: MobileCallSummary[] }>(
        await request(`/telephony/calls?lead_id=${leadId}`),
      ),
    enabled: Boolean(leadId),
  });
  const startCall = useMutation({
    mutationFn: async (mode: 'PROVIDER' | 'TEL_FALLBACK') => {
      if (connectivity === 'offline')
        throw new Error(
          'Calls are not queued offline because a later replay could dial unexpectedly.',
        );
      const response = await request(`/leads/${leadId}/calls`, {
        body: JSON.stringify({ mode }),
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
        method: 'POST',
      });
      if (!response.ok) throw new Error(`Call action rejected (${String(response.status)}).`);
      return parseJson<{ id: string; tel_uri?: string }>(response);
    },
    onSuccess: (result) => {
      setSelectedCallId(result.id);
      if (result.tel_uri) {
        void Linking.openURL(result.tel_uri).catch(() =>
          setMessage('Unable to open the device dialer.'),
        );
        setMessage(
          'Device dialer launched. Duration, answered status and recording are not available from tel:.',
        );
      } else {
        setMessage('Provider call requested. Provider webhook status is authoritative.');
      }
      void cache.invalidateQueries({ queryKey: ['mobile', 'lead-calls', leadId] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Call action failed.'),
  });
  if (query.isPending)
    return (
      <MobileShell title="Lead detail">
        <StatePanel state="loading" />
      </MobileShell>
    );
  if (query.isError || !query.data)
    return (
      <MobileShell title="Lead detail">
        <StatePanel actionLabel="Retry" onAction={() => void query.refetch()} state="error" />
      </MobileShell>
    );
  const lead = query.data.lead;
  const transition = (toStatus: string, evidence: string, extra: Record<string, unknown> = {}) =>
    command.mutate({
      path: `/leads/${lead.id}/transitions`,
      payload: {
        expected_version: lead.version,
        next_action_at: nextAction ? new Date(nextAction).toISOString() : null,
        note: evidence,
        to_status: toStatus,
        ...extra,
      },
      version: lead.version,
    });
  return (
    <MobileShell title={lead.contact_name}>
      {connectivity === 'offline' ? (
        <Alert
          description="Commands are queued with idempotency keys and the lead base version. Conflicts are never silently overwritten."
          title="Offline outbox active"
          tone="warning"
        />
      ) : null}
      {message ? <Alert description={message} title="Lead action" tone="info" /> : null}
      <Card>
        <View className="gap-2">
          <Badge label={lead.status.replaceAll('_', ' ')} tone="info" />
          <AppText variant="heading">{lead.phone_e164}</AppText>
          <AppText tone="muted">
            {lead.vehicle_interest} · {lead.source}
          </AppText>
        </View>
      </Card>
      {principal?.permissions.includes('test_rides.schedule') ? (
        <ScheduleTestRideCard
          branchId={lead.branch_id}
          connectivity={connectivity}
          leadId={lead.id}
          onMessage={setMessage}
          request={request}
          vehicleInterest={lead.vehicle_interest}
        />
      ) : null}
      <Card>
        <View className="gap-3">
          <AppText accessibilityRole="header" variant="heading">
            Calling
          </AppText>
          <AppText tone="muted" variant="caption">
            Provider calling records authoritative status. The device dialer fallback cannot confirm
            duration, answer state or recording and uses no restricted Android permissions.
          </AppText>
          <View className="flex-row flex-wrap gap-2">
            <Button
              disabled={connectivity === 'offline' || startCall.isPending}
              label="Provider call"
              onPress={() => startCall.mutate('PROVIDER')}
            />
            <Button
              disabled={connectivity === 'offline' || startCall.isPending}
              label="Use phone dialer"
              onPress={() => startCall.mutate('TEL_FALLBACK')}
              variant="secondary"
            />
          </View>
          {connectivity === 'offline' ? (
            <Alert
              description="Call-start actions never enter the offline outbox because replaying later could place an unintended call. Existing notes, transitions and outcomes remain conflict-safe queued commands."
              title="Calling needs a connection"
              tone="warning"
            />
          ) : null}
          {selectedCallId ? (
            <View className="gap-2 rounded-md border border-border p-3">
              <AppText variant="label">Post-call outcome</AppText>
              <TextField
                description="Use CALLBACK and the next-action time above to create a callback follow-up."
                label="Outcome"
                onChangeText={setCallOutcome}
                placeholder="INTERESTED, CALLBACK, NO_ANSWER…"
                value={callOutcome}
              />
              <Button
                disabled={!callOutcome || command.isPending}
                label="Record call outcome"
                onPress={() =>
                  command.mutate({
                    path: `/telephony/calls/${selectedCallId}/outcome`,
                    payload: {
                      callback_due_at:
                        callOutcome === 'CALLBACK' && nextAction
                          ? new Date(nextAction).toISOString()
                          : null,
                      note: note || null,
                      outcome: callOutcome,
                    },
                    version: lead.version,
                  })
                }
              />
            </View>
          ) : null}
        </View>
      </Card>
      <Card>
        <View className="gap-3">
          <AppText accessibilityRole="header" variant="heading">
            Qualification and outcome
          </AppText>
          <TextField
            label="Evidence / outcome note"
            multiline
            onChangeText={setNote}
            value={note}
          />
          <TextField
            description="ISO date/time, used for follow-up and active transitions."
            label="Next action"
            onChangeText={setNextAction}
            placeholder="2026-08-08T10:00:00+05:30"
            value={nextAction}
          />
          <View className="flex-row flex-wrap gap-2">
            <Button
              disabled={!note}
              label="Contact attempt"
              onPress={() => transition('CONTACT_ATTEMPT', note)}
            />
            <Button
              disabled={!note || !nextAction}
              label="Accept"
              onPress={() => transition('ACCEPTED', note)}
            />
            <Button
              disabled={!note}
              label="Reject"
              onPress={() =>
                transition('REJECTED', note, { rejection_reason: 'NOT_INTERESTED_FIRST_CONTACT' })
              }
              variant="danger"
            />
            <Button
              disabled={!note || !nextAction}
              label="Schedule follow-up"
              onPress={() =>
                command.mutate({
                  path: `/leads/${lead.id}/follow-ups`,
                  payload: {
                    channel: 'CALL',
                    due_at: new Date(nextAction).toISOString(),
                    note,
                    priority: 'NORMAL',
                    purpose: note,
                  },
                  version: lead.version,
                })
              }
            />
            <Button
              disabled={!note || !nextAction}
              label="Showroom update"
              onPress={() => transition('SHOWROOM_VISIT', note)}
            />
          </View>
        </View>
      </Card>
      <Card>
        <View className="gap-3">
          <AppText accessibilityRole="header" variant="heading">
            Assigned-lead call history
          </AppText>
          {callHistory.isPending ? <AppText tone="muted">Loading calls…</AppText> : null}
          {callHistory.isError ? (
            <AppText tone="muted">
              Call history is unavailable. Pull to refresh this lead later.
            </AppText>
          ) : null}
          {(callHistory.data?.calls.length ?? 0) === 0 && !callHistory.isPending ? (
            <AppText tone="muted">No calls have been recorded for this lead.</AppText>
          ) : null}
          {callHistory.data?.calls.map((item) => (
            <View className="rounded-md border border-border p-3" key={item.id}>
              <AppText variant="label">
                {item.status.replaceAll('_', ' ')} · {item.origin.replaceAll('_', ' ')}
              </AppText>
              <AppText tone="muted" variant="caption">
                {new Date(item.created_at).toLocaleString()} ·{' '}
                {item.outcome_requirement.replaceAll('_', ' ')}
              </AppText>
            </View>
          ))}
        </View>
      </Card>
      <Card>
        <View className="gap-3">
          <AppText accessibilityRole="header" variant="heading">
            Append note
          </AppText>
          <TextField label="Note" multiline onChangeText={setNote} value={note} />
          <Button
            disabled={!note}
            label="Save note"
            onPress={() =>
              command.mutate({
                path: `/leads/${lead.id}/notes`,
                payload: { note },
                version: lead.version,
              })
            }
          />
        </View>
      </Card>
      {connectivity === 'online' && principal ? (
        <Button
          label="Replay offline work"
          onPress={() => {
            void replayLeadOutbox(database, request, principal.clientOrganizationId).then(
              (result) => {
                setMessage(
                  `Replayed ${String(result.replayed)}; conflicts ${String(result.conflicts)}.`,
                );
                void query.refetch();
              },
            );
          }}
          variant="secondary"
        />
      ) : null}
      <Card>
        <View className="gap-3">
          <AppText accessibilityRole="header" variant="heading">
            Customer timeline
          </AppText>
          {query.data.timeline.map((item) => (
            <View className="border-l-2 border-primary pl-3" key={item.id}>
              <AppText variant="label">{item.title}</AppText>
              <AppText tone="muted" variant="caption">
                {new Date(item.occurred_at).toLocaleString()}
              </AppText>
              {item.detail ? <AppText>{item.detail}</AppText> : null}
            </View>
          ))}
        </View>
      </Card>
    </MobileShell>
  );
}

function ScheduleTestRideCard({
  branchId,
  connectivity,
  leadId,
  onMessage,
  request,
  vehicleInterest,
}: {
  branchId: string;
  connectivity: 'offline' | 'online' | 'unknown';
  leadId: string;
  onMessage(message: string): void;
  request(path: string, init?: RequestInit): Promise<Response>;
  vehicleInterest: string;
}) {
  const [vehicleModel, setVehicleModel] = useState(vehicleInterest);
  const [vehicleReference, setVehicleReference] = useState('');
  const [location, setLocation] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [notes, setNotes] = useState('');
  const mutation = useMutation({
    mutationFn: async () => {
      if (connectivity !== 'online')
        throw new Error('Scheduling needs a connection so vehicle availability is checked now.');
      const response = await request('/test-rides', {
        body: JSON.stringify({
          branch_id: branchId,
          customer_location: location,
          demo_vehicle_reference: vehicleReference,
          lead_id: leadId,
          notes: notes || null,
          otp_code: null,
          scheduled_end_at: new Date(endAt).toISOString(),
          scheduled_start_at: new Date(startAt).toISOString(),
          vehicle_model: vehicleModel,
        }),
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': randomUUID(),
        },
        method: 'POST',
      });
      if (!response.ok) throw new Error(`Test-ride request rejected (${String(response.status)}).`);
    },
    onError: (caught) =>
      onMessage(caught instanceof Error ? caught.message : 'Unable to schedule the test ride.'),
    onSuccess: () => onMessage('Test-ride request created. A manager can book and assign it.'),
  });
  const valid = vehicleModel && vehicleReference && location && startAt && endAt;
  return (
    <Card>
      <View className="gap-3">
        <AppText accessibilityRole="header" variant="heading">
          Schedule test ride
        </AppText>
        <TextField label="Vehicle model" onChangeText={setVehicleModel} value={vehicleModel} />
        <TextField
          label="Demo vehicle reference"
          onChangeText={setVehicleReference}
          value={vehicleReference}
        />
        <TextField label="Customer location" onChangeText={setLocation} value={location} />
        <TextField
          description="ISO date/time with offset"
          label="Start"
          onChangeText={setStartAt}
          placeholder="2026-08-09T10:00:00+05:30"
          value={startAt}
        />
        <TextField
          description="ISO date/time with offset"
          label="End"
          onChangeText={setEndAt}
          placeholder="2026-08-09T11:00:00+05:30"
          value={endAt}
        />
        <TextField label="Customer notes" multiline onChangeText={setNotes} value={notes} />
        <Button
          disabled={!valid || connectivity !== 'online' || mutation.isPending}
          label="Create ride request"
          loading={mutation.isPending}
          onPress={() => mutation.mutate()}
        />
      </View>
    </Card>
  );
}
