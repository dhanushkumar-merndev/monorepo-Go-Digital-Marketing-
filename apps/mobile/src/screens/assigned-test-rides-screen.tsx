import type { TestRideSummary } from '@gdm/contracts';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { useAuth } from '../auth/auth-provider';
import { Alert, AppText, Badge, Button, Card, StatePanel } from '../components/ui';
import { MobileShell } from '../components/mobile-shell';
import { replayTestRideOfflineWork } from '../data/test-ride-offline';
import { useSQLiteContext } from 'expo-sqlite';
import { useAppStore } from '../store/app-store';
import { useAuthStore } from '../store/auth-store';
import { useTestRidesUiStore } from '../store/test-rides-ui.store';
import { parseJson } from './assigned-leads-screen';

export function AssignedTestRidesScreen() {
  const { request } = useAuth();
  const database = useSQLiteContext();
  const router = useRouter();
  const principal = useAuthStore((state) => state.principal);
  const connectivity = useAppStore((state) => state.connectivity);
  const filter = useTestRidesUiStore((state) => state.filter);
  const setFilter = useTestRidesUiStore((state) => state.setFilter);
  const permitted = principal?.permissions.includes('test_rides.read') ?? false;
  const query = useQuery({
    queryKey: ['mobile', 'assigned-test-rides'],
    queryFn: async () =>
      parseJson<{ rides: TestRideSummary[] }>(
        await request('/test-rides?assigned_to_me=true&limit=100'),
      ),
    enabled: permitted,
  });
  const today = new Date().toDateString();
  const rides = (query.data?.rides ?? []).filter((ride) =>
    filter === 'TODAY' ? new Date(ride.scheduled_start_at).toDateString() === today : true,
  );
  return (
    <MobileShell title="Test rides">
      {!permitted ? (
        <Alert
          description="Your active role does not include test-ride access."
          title="Test rides unavailable"
          tone="warning"
        />
      ) : null}
      {connectivity === 'offline' ? (
        <Alert
          description="Active samples and terminal commands remain tenant-bound in SQLite until replay. Start requires a connection."
          title="Offline-safe work"
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
      {permitted && !query.isPending && rides.length === 0 ? <StatePanel state="empty" /> : null}
      {rides.map((ride) => (
        <Card key={ride.id}>
          <View className="gap-2">
            <View className="flex-row flex-wrap justify-between gap-2">
              <AppText accessibilityRole="header" variant="heading">
                {ride.contact_name}
              </AppText>
              <Badge
                label={ride.status.replaceAll('_', ' ')}
                tone={ride.status === 'ACTIVE' ? 'success' : 'info'}
              />
            </View>
            <AppText tone="muted">
              {ride.vehicle_model} · {ride.demo_vehicle_reference}
            </AppText>
            <AppText variant="caption">
              {new Date(ride.scheduled_start_at).toLocaleString()} · {ride.customer_location}
            </AppText>
            <Button
              label="Open ride"
              onPress={() =>
                router.push({
                  pathname: '/(app)/test-rides/[rideId]',
                  params: { rideId: ride.id },
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
            void replayTestRideOfflineWork(database, request, principal.clientOrganizationId).then(
              () => void query.refetch(),
            );
          }}
          variant="secondary"
        />
      ) : null}
    </MobileShell>
  );
}
