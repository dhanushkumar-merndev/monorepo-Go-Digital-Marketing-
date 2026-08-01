import { migrateLocalDatabase, type LocalDatabase } from '../data/local-database';

describe('migrateLocalDatabase', () => {
  it('creates only platform migration and outbox structures', async () => {
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
    expect(sql).not.toMatch(/lead|booking|delivery|customer/i);
    expect(database.withTransactionAsync).toHaveBeenCalledTimes(1);
  });
});
