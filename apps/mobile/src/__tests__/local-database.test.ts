import { migrateLocalDatabase, type LocalDatabase } from '../data/local-database';

describe('migrateLocalDatabase', () => {
  it('creates the platform outbox and temporary Phase 6 location queue', async () => {
    const statements: string[] = [];
    const database: LocalDatabase = {
      execAsync: jest.fn(async (statement: string) => {
        statements.push(statement);
      }),
      withTransactionAsync: jest.fn(async (operation: () => Promise<void>) => operation()),
    };

    await migrateLocalDatabase(database);

    const sql = statements.join('\n');
    expect(sql).toContain('PRAGMA journal_mode = WAL');
    expect(sql).toContain('mobile_schema_migrations');
    expect(sql).toContain('mobile_outbox');
    expect(sql).toContain('client_organization_id TEXT NOT NULL');
    expect(sql).toContain('UNIQUE (client_organization_id, idempotency_key)');
    expect(sql).toContain('test_ride_location_queue');
    expect(sql).toContain('active_test_ride_tracking');
    expect(sql).toContain('expires_at TEXT NOT NULL');
    expect(sql).not.toMatch(/contact_name|phone_e164|customer_location/i);
    expect(sql).not.toMatch(/access_token|refresh_token|password|credential/i);
    expect(database.withTransactionAsync).toHaveBeenCalledTimes(1);
  });
});
