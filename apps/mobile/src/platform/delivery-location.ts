import * as Location from 'expo-location';
import { openDatabaseAsync } from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';

import { enqueueDeliveryLocationSample } from '../data/delivery-offline';
import { MOBILE_DATABASE_NAME, migrateLocalDatabase } from '../data/local-database';

export const DELIVERY_LOCATION_TASK = 'gdm-delivery-active-location';

interface ActiveTrackingRow {
  client_organization_id: string;
  delivery_job_id: string;
  tracking_expires_at: string;
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  DELIVERY_LOCATION_TASK,
  async ({ data, error }) => {
    const database = await openDatabaseAsync(MOBILE_DATABASE_NAME);
    await migrateLocalDatabase(database);
    if (error || !data) {
      if (await Location.hasStartedLocationUpdatesAsync(DELIVERY_LOCATION_TASK))
        await Location.stopLocationUpdatesAsync(DELIVERY_LOCATION_TASK);
      await database.runAsync('DELETE FROM active_delivery_tracking WHERE singleton_id = 1');
      return;
    }
    const active = await database.getFirstAsync<ActiveTrackingRow>(
      `SELECT client_organization_id, delivery_job_id, tracking_expires_at
         FROM active_delivery_tracking WHERE singleton_id = 1`,
    );
    if (!active || Date.parse(active.tracking_expires_at) <= Date.now()) {
      if (await Location.hasStartedLocationUpdatesAsync(DELIVERY_LOCATION_TASK))
        await Location.stopLocationUpdatesAsync(DELIVERY_LOCATION_TASK);
      await database.runAsync('DELETE FROM active_delivery_tracking WHERE singleton_id = 1');
      return;
    }
    for (const location of data.locations) {
      await enqueueDeliveryLocationSample(database, {
        accuracy: Math.max(1, location.coords.accuracy ?? 100),
        capturedAt: new Date(location.timestamp).toISOString(),
        clientOrganizationId: active.client_organization_id,
        jobId: active.delivery_job_id,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    }
  },
);

export async function requireDeliveryLocationPermission(): Promise<void> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error('Foreground location permission is required.');
}

export async function startDeliveryLocationTracking(input: {
  clientOrganizationId: string;
  jobId: string;
  trackingExpiresAt: string;
}): Promise<void> {
  await requireDeliveryLocationPermission();
  const database = await openDatabaseAsync(MOBILE_DATABASE_NAME);
  await migrateLocalDatabase(database);
  await database.runAsync(
    `INSERT INTO active_delivery_tracking (
       singleton_id, client_organization_id, delivery_job_id, tracking_expires_at, started_at
     ) VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(singleton_id) DO UPDATE SET
       client_organization_id = excluded.client_organization_id,
       delivery_job_id = excluded.delivery_job_id,
       tracking_expires_at = excluded.tracking_expires_at,
       started_at = excluded.started_at`,
    input.clientOrganizationId,
    input.jobId,
    input.trackingExpiresAt,
    new Date().toISOString(),
  );
  if (await Location.hasStartedLocationUpdatesAsync(DELIVERY_LOCATION_TASK))
    await Location.stopLocationUpdatesAsync(DELIVERY_LOCATION_TASK);
  await Location.startLocationUpdatesAsync(DELIVERY_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    deferredUpdatesDistance: 20,
    deferredUpdatesInterval: 45_000,
    distanceInterval: 20,
    foregroundService: {
      killServiceOnDestroy: true,
      notificationBody: 'Location is shared only for your active assigned delivery.',
      notificationColor: '#175cd3',
      notificationTitle: 'Delivery tracking active',
    },
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: false,
    timeInterval: 45_000,
  });
}

export async function stopDeliveryLocationTracking(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(DELIVERY_LOCATION_TASK))
    await Location.stopLocationUpdatesAsync(DELIVERY_LOCATION_TASK);
  const database = await openDatabaseAsync(MOBILE_DATABASE_NAME);
  await migrateLocalDatabase(database);
  await database.runAsync('DELETE FROM active_delivery_tracking WHERE singleton_id = 1');
}
