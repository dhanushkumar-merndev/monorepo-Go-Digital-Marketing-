import type { SQLiteDatabase } from 'expo-sqlite';

export const MOBILE_DATABASE_NAME = 'gdm-mobile.db';

export type LocalDatabase = Pick<SQLiteDatabase, 'execAsync' | 'withTransactionAsync'>;

const platformSchema = `
  CREATE TABLE IF NOT EXISTS mobile_schema_migrations (
    version INTEGER PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mobile_outbox (
    operation_id TEXT PRIMARY KEY NOT NULL,
    client_organization_id TEXT NOT NULL,
    command_path TEXT NOT NULL CHECK (command_path LIKE '/v1/%'),
    http_method TEXT NOT NULL CHECK (http_method IN ('POST', 'PATCH', 'DELETE')),
    payload_json TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    base_version INTEGER,
    state TEXT NOT NULL DEFAULT 'QUEUED'
      CHECK (state IN ('QUEUED', 'REPLAYING', 'CONFLICT', 'FAILED')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    created_at TEXT NOT NULL,
    last_attempt_at TEXT,
    last_error_code TEXT,
    UNIQUE (client_organization_id, idempotency_key)
  );

  CREATE INDEX IF NOT EXISTS mobile_outbox_replay_idx
    ON mobile_outbox (client_organization_id, state, created_at, operation_id);

  INSERT OR IGNORE INTO mobile_schema_migrations (version, applied_at)
    VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
`;

export async function migrateLocalDatabase(database: LocalDatabase): Promise<void> {
  await database.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await database.withTransactionAsync(async () => {
    await database.execAsync(platformSchema);
  });
}
