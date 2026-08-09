import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

interface LocationQueueRow {
  accuracy_m: number;
  captured_at: string;
  delivery_job_id: string;
  latitude: number;
  longitude: number;
  sample_id: string;
}

interface CommandRow {
  command_path: string;
  idempotency_key: string;
  operation_id: string;
  payload_json: string;
}

export async function enqueueDeliveryLocationSample(
  database: SQLiteDatabase,
  sample: {
    accuracy: number;
    capturedAt: string;
    clientOrganizationId: string;
    jobId: string;
    latitude: number;
    longitude: number;
    sampleId?: string;
  },
): Promise<string> {
  const sampleId = sample.sampleId ?? randomUUID();
  await database.runAsync(
    `INSERT OR IGNORE INTO delivery_location_queue (
      sample_id, client_organization_id, delivery_job_id, latitude, longitude,
      accuracy_m, captured_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    sampleId,
    sample.clientOrganizationId,
    sample.jobId,
    sample.latitude,
    sample.longitude,
    sample.accuracy,
    sample.capturedAt,
    new Date(Date.parse(sample.capturedAt) + 86_400_000).toISOString(),
  );
  return sampleId;
}

export async function enqueueDeliveryCommand(
  database: SQLiteDatabase,
  command: {
    clientOrganizationId: string;
    operationId?: string;
    path: string;
    payload: Record<string, unknown>;
  },
): Promise<string> {
  if (!/^\/delivery\/[0-9a-f-]+\/(complete|delay|fail|reschedule)$/iu.test(command.path))
    throw new Error('Unsupported offline delivery command path.');
  const operationId = command.operationId ?? randomUUID();
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

export async function replayDeliveryOfflineWork(
  database: SQLiteDatabase,
  request: (path: string, init?: RequestInit) => Promise<Response>,
  clientOrganizationId: string,
): Promise<{ commandsReplayed: number; conflicts: number; locationsReplayed: number }> {
  await database.runAsync(
    `DELETE FROM delivery_location_queue
      WHERE client_organization_id = ? AND expires_at <= ?`,
    clientOrganizationId,
    new Date().toISOString(),
  );
  const locations = await database.getAllAsync<LocationQueueRow>(
    `SELECT sample_id, delivery_job_id, latitude, longitude, accuracy_m, captured_at
       FROM delivery_location_queue
      WHERE client_organization_id = ? AND state IN ('QUEUED', 'FAILED')
      ORDER BY captured_at, sample_id`,
    clientOrganizationId,
  );
  let locationsReplayed = 0;
  for (const [jobId, samples] of groupByJob(locations)) {
    await database.runAsync(
      `UPDATE delivery_location_queue
          SET state = 'REPLAYING', attempt_count = attempt_count + 1
        WHERE client_organization_id = ? AND delivery_job_id = ?
          AND state IN ('QUEUED', 'FAILED')`,
      clientOrganizationId,
      jobId,
    );
    try {
      const response = await request(`/delivery/${jobId}/location`, {
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
          `DELETE FROM delivery_location_queue
            WHERE client_organization_id = ? AND delivery_job_id = ?`,
          clientOrganizationId,
          jobId,
        );
      } else {
        await database.runAsync(
          `UPDATE delivery_location_queue SET state = 'FAILED', last_error_code = ?
            WHERE client_organization_id = ? AND delivery_job_id = ?`,
          `HTTP_${String(response.status)}`,
          clientOrganizationId,
          jobId,
        );
      }
    } catch {
      await database.runAsync(
        `UPDATE delivery_location_queue SET state = 'FAILED', last_error_code = 'NETWORK'
          WHERE client_organization_id = ? AND delivery_job_id = ?`,
        clientOrganizationId,
        jobId,
      );
    }
  }

  const commands = await database.getAllAsync<CommandRow>(
    `SELECT operation_id, command_path, payload_json, idempotency_key
       FROM mobile_outbox
      WHERE client_organization_id = ?
        AND command_path LIKE '/v1/delivery/%'
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

function groupByJob(rows: LocationQueueRow[]): Map<string, LocationQueueRow[]> {
  const grouped = new Map<string, LocationQueueRow[]>();
  for (const row of rows) {
    const group = grouped.get(row.delivery_job_id) ?? [];
    group.push(row);
    grouped.set(row.delivery_job_id, group);
  }
  return grouped;
}
