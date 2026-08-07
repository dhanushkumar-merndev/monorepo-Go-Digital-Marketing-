import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

export interface OfflineLeadCommand {
  baseVersion?: number;
  clientOrganizationId: string;
  path: string;
  payload: Record<string, unknown>;
}

interface OutboxRow {
  operation_id: string;
  command_path: string;
  payload_json: string;
  idempotency_key: string;
}

export async function enqueueOfflineLeadCommand(
  database: SQLiteDatabase,
  command: OfflineLeadCommand,
): Promise<string> {
  const operationId = randomUUID();
  await database.runAsync(
    `INSERT INTO mobile_outbox (
      operation_id, client_organization_id, command_path, http_method, payload_json,
      idempotency_key, base_version, created_at
    ) VALUES (?, ?, ?, 'POST', ?, ?, ?, ?)`,
    operationId,
    command.clientOrganizationId,
    `/v1${command.path}`,
    JSON.stringify(command.payload),
    operationId,
    command.baseVersion ?? null,
    new Date().toISOString(),
  );
  return operationId;
}

export async function replayLeadOutbox(
  database: SQLiteDatabase,
  request: (path: string, init?: RequestInit) => Promise<Response>,
  clientOrganizationId: string,
): Promise<{ conflicts: number; replayed: number }> {
  const rows = await database.getAllAsync<OutboxRow>(
    `SELECT operation_id, command_path, payload_json, idempotency_key
       FROM mobile_outbox
      WHERE client_organization_id = ? AND state IN ('QUEUED', 'FAILED')
      ORDER BY created_at, operation_id`,
    clientOrganizationId,
  );
  let conflicts = 0;
  let replayed = 0;
  for (const row of rows) {
    await database.runAsync(
      `UPDATE mobile_outbox SET state = 'REPLAYING', attempt_count = attempt_count + 1,
       last_attempt_at = ? WHERE operation_id = ?`,
      new Date().toISOString(),
      row.operation_id,
    );
    try {
      const response = await request(row.command_path.replace(/^\/v1/u, ''), {
        body: row.payload_json,
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': row.idempotency_key },
        method: 'POST',
      });
      if (response.status === 409) {
        conflicts += 1;
        await database.runAsync(
          `UPDATE mobile_outbox SET state = 'CONFLICT', last_error_code = 'CONFLICT' WHERE operation_id = ?`,
          row.operation_id,
        );
      } else if (response.ok) {
        replayed += 1;
        await database.runAsync(
          `DELETE FROM mobile_outbox WHERE operation_id = ?`,
          row.operation_id,
        );
      } else {
        await database.runAsync(
          `UPDATE mobile_outbox SET state = 'FAILED', last_error_code = ? WHERE operation_id = ?`,
          `HTTP_${String(response.status)}`,
          row.operation_id,
        );
      }
    } catch {
      await database.runAsync(
        `UPDATE mobile_outbox SET state = 'FAILED', last_error_code = 'NETWORK' WHERE operation_id = ?`,
        row.operation_id,
      );
    }
  }
  return { conflicts, replayed };
}
