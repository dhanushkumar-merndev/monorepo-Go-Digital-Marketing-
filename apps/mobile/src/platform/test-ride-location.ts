import * as Location from 'expo-location';
import { openDatabaseAsync } from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';

import { MOBILE_DATABASE_NAME, migrateLocalDatabase } from '../data/local-database';
import { enqueueTestRideLocationSample } from '../data/test-ride-offline';

export const TEST_RIDE_LOCATION_TASK = 'gdm-test-ride-active-location';

interface ActiveTrackingRow {
  client_organization_id: string;
  test_ride_job_id: string;
  tracking_expires_at: string;
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  TEST_RIDE_LOCATION_TASK,
  async ({ data, error }) => {
    const database = await openDatabaseAsync(MOBILE_DATABASE_NAME);
    await migrateLocalDatabase(database);
    if (error || !data) {
      if (await Location.hasStartedLocationUpdatesAsync(TEST_RIDE_LOCATION_TASK))
        await Location.stopLocationUpdatesAsync(TEST_RIDE_LOCATION_TASK);
      await database.runAsync('DELETE FROM active_test_ride_tracking WHERE singleton_id = 1');
      return;
    }
    const active = await database.getFirstAsync<ActiveTrackingRow>(
      `SELECT client_organization_id, test_ride_job_id, tracking_expires_at
         FROM active_test_ride_tracking WHERE singleton_id = 1`,
    );
    if (!active || Date.parse(active.tracking_expires_at) <= Date.now()) {
      if (await Location.hasStartedLocationUpdatesAsync(TEST_RIDE_LOCATION_TASK))
        await Location.stopLocationUpdatesAsync(TEST_RIDE_LOCATION_TASK);
      await database.runAsync('DELETE FROM active_test_ride_tracking WHERE singleton_id = 1');
      return;
    }
    for (const location of data.locations) {
      await enqueueTestRideLocationSample(database, {
        accuracy: Math.max(1, location.coords.accuracy ?? 100),
        capturedAt: new Date(location.timestamp).toISOString(),
        clientOrganizationId: active.client_organization_id,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        rideId: active.test_ride_job_id,
      });
    }
  },
);

export async function startTestRideLocationTracking(input: {
  clientOrganizationId: string;
  rideId: string;
  trackingExpiresAt: string;
}): Promise<void> {
  await requireTestRideLocationPermission();
  const database = await openDatabaseAsync(MOBILE_DATABASE_NAME);
  await migrateLocalDatabase(database);
  await database.runAsync(
    `INSERT INTO active_test_ride_tracking (
       singleton_id, client_organization_id, test_ride_job_id, tracking_expires_at, started_at
     ) VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(singleton_id) DO UPDATE SET
       client_organization_id = excluded.client_organization_id,
       test_ride_job_id = excluded.test_ride_job_id,
       tracking_expires_at = excluded.tracking_expires_at,
       started_at = excluded.started_at`,
    input.clientOrganizationId,
    input.rideId,
    input.trackingExpiresAt,
    new Date().toISOString(),
  );
  if (await Location.hasStartedLocationUpdatesAsync(TEST_RIDE_LOCATION_TASK))
    await Location.stopLocationUpdatesAsync(TEST_RIDE_LOCATION_TASK);
  await Location.startLocationUpdatesAsync(TEST_RIDE_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    deferredUpdatesDistance: 20,
    deferredUpdatesInterval: 45_000,
    distanceInterval: 20,
    foregroundService: {
      killServiceOnDestroy: true,
      notificationBody: 'Location is shared only for your active assigned test ride.',
      notificationColor: '#175cd3',
      notificationTitle: 'Test ride tracking active',
    },
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: false,
    timeInterval: 45_000,
  });
}

export async function requireTestRideLocationPermission(): Promise<void> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error('Foreground location permission is required.');
}

export async function stopTestRideLocationTracking(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(TEST_RIDE_LOCATION_TASK))
    await Location.stopLocationUpdatesAsync(TEST_RIDE_LOCATION_TASK);
  const database = await openDatabaseAsync(MOBILE_DATABASE_NAME);
  await migrateLocalDatabase(database);
  await database.runAsync('DELETE FROM active_test_ride_tracking WHERE singleton_id = 1');
}
