import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

interface LocationQueueRow {
  accuracy_m: number;
  captured_at: string;
  latitude: number;
  longitude: number;
  sample_id: string;
  test_ride_job_id: string;
}

interface CommandRow {
  command_path: string;
  idempotency_key: string;
  operation_id: string;
  payload_json: string;
}

export interface OfflineLocationSample {
  accuracy: number;
  capturedAt: string;
  clientOrganizationId: string;
  latitude: number;
  longitude: number;
  rideId: string;
  sampleId?: string;
}

export async function enqueueTestRideLocationSample(
  database: SQLiteDatabase,
  sample: OfflineLocationSample,
): Promise<string> {
  const sampleId = sample.sampleId ?? randomUUID();
  await database.runAsync(
    `INSERT OR IGNORE INTO test_ride_location_queue (
      sample_id, client_organization_id, test_ride_job_id, latitude, longitude,
      accuracy_m, captured_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    sampleId,
    sample.clientOrganizationId,
    sample.rideId,
    sample.latitude,
    sample.longitude,
    sample.accuracy,
    sample.capturedAt,
    new Date(Date.parse(sample.capturedAt) + 86_400_000).toISOString(),
  );
  return sampleId;
}

export async function enqueueTestRideCommand(
  database: SQLiteDatabase,
  command: {
    clientOrganizationId: string;
    path: string;
    payload: Record<string, unknown>;
  },
): Promise<string> {
  if (!/^\/test-rides\/[0-9a-f-]+\/(complete|cancel|no-show|tracking\/stop)$/iu.test(command.path))
    throw new Error('Unsupported offline test-ride command path.');
  const operationId = randomUUID();
  await database.runAsync(
    `INSERT INTO mobile_outbox (
      operation_id, client_organization_id, command_path, http_method, payload_json,
      idempotency_key, created_at
    ) VALUES (?, ?, ?, 'POST', ?, ?, ?)`,
    operationId,
    command.clientOrganizationId,
    `/v1${command.path}`,
    JSON.stringify(command.payload),
    operationId,
    new Date().toISOString(),
  );
  return operationId;
}

export async function replayTestRideOfflineWork(
  database: SQLiteDatabase,
  request: (path: string, init?: RequestInit) => Promise<Response>,
  clientOrganizationId: string,
): Promise<{ commandsReplayed: number; conflicts: number; locationsReplayed: number }> {
  await database.runAsync(
    `DELETE FROM test_ride_location_queue
      WHERE client_organization_id = ? AND expires_at <= ?`,
    clientOrganizationId,
    new Date().toISOString(),
  );
  const locations = await database.getAllAsync<LocationQueueRow>(
    `SELECT sample_id, test_ride_job_id, latitude, longitude, accuracy_m, captured_at
       FROM test_ride_location_queue
      WHERE client_organization_id = ? AND state IN ('QUEUED', 'FAILED')
      ORDER BY captured_at, sample_id`,
    clientOrganizationId,
  );
  let locationsReplayed = 0;
  for (const [rideId, samples] of groupByRide(locations)) {
    await database.runAsync(
      `UPDATE test_ride_location_queue
          SET state = 'REPLAYING', attempt_count = attempt_count + 1
        WHERE client_organization_id = ? AND test_ride_job_id = ? AND state IN ('QUEUED', 'FAILED')`,
      clientOrganizationId,
      rideId,
    );
    try {
      const response = await request(`/test-rides/${rideId}/location`, {
        body: JSON.stringify({
          samples: samples.map((sample) => ({
            accuracy_m: sample.accuracy_m,
            captured_at: sample.captured_at,
            idempotency_key: sample.sample_id,
            latitude: sample.latitude,
            longitude: sample.longitude,
          })),
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      if (response.ok) {
        locationsReplayed += samples.length;
        await database.runAsync(
          `DELETE FROM test_ride_location_queue
            WHERE client_organization_id = ? AND test_ride_job_id = ?`,
          clientOrganizationId,
          rideId,
        );
      } else {
        await database.runAsync(
          `UPDATE test_ride_location_queue SET state = 'FAILED', last_error_code = ?
            WHERE client_organization_id = ? AND test_ride_job_id = ?`,
          `HTTP_${String(response.status)}`,
          clientOrganizationId,
          rideId,
        );
      }
    } catch {
      await database.runAsync(
        `UPDATE test_ride_location_queue SET state = 'FAILED', last_error_code = 'NETWORK'
          WHERE client_organization_id = ? AND test_ride_job_id = ?`,
        clientOrganizationId,
        rideId,
      );
    }
  }

  const commands = await database.getAllAsync<CommandRow>(
    `SELECT operation_id, command_path, payload_json, idempotency_key
       FROM mobile_outbox
      WHERE client_organization_id = ?
        AND command_path LIKE '/v1/test-rides/%'
        AND state IN ('QUEUED', 'FAILED')
      ORDER BY created_at, operation_id`,
    clientOrganizationId,
  );
  let commandsReplayed = 0;
  let conflicts = 0;
  for (const command of commands) {
    await database.runAsync(
      `UPDATE mobile_outbox SET state = 'REPLAYING', attempt_count = attempt_count + 1,
       last_attempt_at = ? WHERE operation_id = ?`,
      new Date().toISOString(),
      command.operation_id,
    );
    try {
      const response = await request(command.command_path.replace(/^\/v1/u, ''), {
        body: command.payload_json,
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': command.idempotency_key,
        },
        method: 'POST',
      });
      if (response.ok) {
        commandsReplayed += 1;
        await database.runAsync(
          'DELETE FROM mobile_outbox WHERE operation_id = ?',
          command.operation_id,
        );
      } else if (response.status === 409) {
        conflicts += 1;
        await database.runAsync(
          `UPDATE mobile_outbox SET state = 'CONFLICT', last_error_code = 'CONFLICT'
            WHERE operation_id = ?`,
          command.operation_id,
        );
      } else {
        await database.runAsync(
          `UPDATE mobile_outbox SET state = 'FAILED', last_error_code = ? WHERE operation_id = ?`,
          `HTTP_${String(response.status)}`,
          command.operation_id,
        );
      }
    } catch {
      await database.runAsync(
        `UPDATE mobile_outbox SET state = 'FAILED', last_error_code = 'NETWORK'
          WHERE operation_id = ?`,
        command.operation_id,
      );
    }
  }
  return { commandsReplayed, conflicts, locationsReplayed };
}

function groupByRide(rows: LocationQueueRow[]): Map<string, LocationQueueRow[]> {
  const grouped = new Map<string, LocationQueueRow[]>();
  for (const row of rows) {
    const group = grouped.get(row.test_ride_job_id) ?? [];
    group.push(row);
    grouped.set(row.test_ride_job_id, group);
  }
  return grouped;
}
