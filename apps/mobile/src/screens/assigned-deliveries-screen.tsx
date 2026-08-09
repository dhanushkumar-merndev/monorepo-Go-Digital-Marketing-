import type { DeliverySummary } from '@gdm/contracts';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { View } from 'react-native';

import { useAuth } from '../auth/auth-provider';
import { MobileShell } from '../components/mobile-shell';
import { Alert, AppText, Badge, Button, Card, StatePanel } from '../components/ui';
import { replayDeliveryOfflineWork } from '../data/delivery-offline';
import { useAppStore } from '../store/app-store';
import { useAuthStore } from '../store/auth-store';
import { useDeliveryUiStore } from '../store/delivery-ui.store';
import { parseJson } from './assigned-leads-screen';

export function AssignedDeliveriesScreen() {
  const { request } = useAuth();
  const database = useSQLiteContext();
  const router = useRouter();
  const principal = useAuthStore((state) => state.principal);
  const connectivity = useAppStore((state) => state.connectivity);
  const filter = useDeliveryUiStore((state) => state.filter);
  const setFilter = useDeliveryUiStore((state) => state.setFilter);
  const permitted = principal?.permissions.includes('delivery.jobs.read') ?? false;
  const query = useQuery({
    queryKey: ['mobile', 'assigned-deliveries'],
    queryFn: async () =>
      parseJson<{ deliveries: DeliverySummary[] }>(
        await request('/delivery?assigned_to_me=true&limit=100'),
      ),
    enabled: permitted,
  });
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const deliveries = (query.data?.deliveries ?? []).filter((delivery) => {
    const scheduled = new Date(delivery.scheduled_for);
    return filter === 'TODAY'
      ? scheduled >= todayStart && scheduled < tomorrowStart
      : scheduled >= tomorrowStart;
  });
  return (
    <MobileShell title="Deliveries">
      {!permitted ? (
        <Alert
          description="Your active role does not include delivery access."
          title="Deliveries unavailable"
          tone="warning"
        />
      ) : null}
      {connectivity === 'offline' ? (
        <Alert
          description="Active location samples and terminal commands remain tenant-bound in SQLite until replay. Starting a delivery requires connectivity."
          title="Offline-safe delivery work"
          tone="warning"
        />
      ) : null}
      <View className="flex-row gap-2">
        <Button
          className="flex-1"
          label="Today"
          onPress={() => setFilter('TODAY')}
          variant={filter === 'TODAY' ? 'primary' : 'secondary'}
        />
        <Button
          className="flex-1"
          label="Upcoming"
          onPress={() => setFilter('UPCOMING')}
          variant={filter === 'UPCOMING' ? 'primary' : 'secondary'}
        />
      </View>
      {permitted && query.isPending ? <StatePanel state="loading" /> : null}
      {permitted && query.isError ? (
        <StatePanel actionLabel="Retry" onAction={() => void query.refetch()} state="error" />
      ) : null}
      {permitted && !query.isPending && deliveries.length === 0 ? (
        <StatePanel state="empty" />
      ) : null}
      {deliveries.map((delivery) => (
        <Card key={delivery.id}>
          <View className="gap-2">
            <View className="flex-row flex-wrap justify-between gap-2">
              <AppText accessibilityRole="header" variant="heading">
                {delivery.customer_name}
              </AppText>
              <Badge
                label={delivery.status.replaceAll('_', ' ')}
                tone={
                  delivery.status === 'OUT_FOR_DELIVERY'
                    ? 'success'
                    : ['DELAYED', 'FAILED'].includes(delivery.status)
                      ? 'warning'
                      : 'info'
                }
              />
            </View>
            <AppText tone="muted">{delivery.vehicle_label}</AppText>
            <AppText variant="caption">
              {new Date(delivery.scheduled_for).toLocaleString()} · {delivery.destination_address}
            </AppText>
            <Button
              label="Open delivery"
              onPress={() =>
                router.push({
                  pathname: '/(app)/deliveries/[jobId]',
                  params: { jobId: delivery.id },
                })
              }
            />
          </View>
        </Card>
      ))}
      {connectivity === 'online' && principal ? (
        <Button
          label="Replay failed/offline work"
          onPress={() => {
            void replayDeliveryOfflineWork(database, request, principal.clientOrganizationId).then(
              () => void query.refetch(),
            );
          }}
          variant="secondary"
        />
      ) : null}
    </MobileShell>
  );
}
