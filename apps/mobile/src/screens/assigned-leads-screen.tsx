import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { useAuth } from '../auth/auth-provider';
import { Alert, AppText, Badge, Button, Card, StatePanel } from '../components/ui';
import { MobileShell } from '../components/mobile-shell';
import { useAppStore } from '../store/app-store';

interface AssignedLead {
  id: string;
  contact_name: string;
  phone_e164: string;
  source: string;
  status: string;
  vehicle_interest: string;
  sla_state: string;
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`Lead request failed (${String(response.status)}).`);
  return (await response.json()) as T;
}

export function AssignedLeadsScreen() {
  const { request } = useAuth();
  const router = useRouter();
  const connectivity = useAppStore((state) => state.connectivity);
  const query = useQuery({
    queryKey: ['mobile', 'assigned-leads'],
    queryFn: async () => parseJson<{ leads: AssignedLead[] }>(await request('/leads?limit=100')),
  });
  return (
    <MobileShell title="Assigned leads">
      {connectivity === 'offline' ? (
        <Alert
          description="New notes and outcomes can be queued safely from an already-open lead. Refresh waits for connectivity."
          title="Offline"
          tone="warning"
        />
      ) : null}
      {query.isPending ? (
        <StatePanel state="loading" />
      ) : query.isError ? (
        <StatePanel actionLabel="Retry" onAction={() => void query.refetch()} state="error" />
      ) : (query.data?.leads.length ?? 0) === 0 ? (
        <StatePanel state="empty" />
      ) : (
        query.data?.leads.map((lead) => (
          <Card key={lead.id}>
            <View className="gap-2">
              <View className="flex-row flex-wrap justify-between gap-2">
                <AppText accessibilityRole="header" variant="heading">
                  {lead.contact_name}
                </AppText>
                <Badge
                  label={lead.status.replaceAll('_', ' ')}
                  tone={lead.sla_state === 'BREACHED' ? 'danger' : 'info'}
                />
              </View>
              <AppText tone="muted">
                {lead.phone_e164} · {lead.vehicle_interest}
              </AppText>
              <AppText variant="caption">Source: {lead.source}</AppText>
              <Button
                label="Open lead"
                onPress={() =>
                  router.push({ pathname: '/(app)/leads/[leadId]', params: { leadId: lead.id } })
                }
              />
            </View>
          </Card>
        ))
      )}
    </MobileShell>
  );
}

export { parseJson };
