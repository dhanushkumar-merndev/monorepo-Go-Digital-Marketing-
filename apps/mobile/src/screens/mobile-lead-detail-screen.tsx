import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
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
