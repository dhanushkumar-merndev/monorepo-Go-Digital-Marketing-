import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

describe('local database recovery drill', () => {
  it('restores a migrated data-directory snapshot with rows, migration state and constraints intact', async () => {
    const source = new PGlite();
    let restored: PGlite | undefined;

    try {
      await migrate(drizzle(source), { migrationsFolder });
      await source.exec(`
          insert into agencies (id, code, legal_name, display_name)
          values (
            '10000000-0000-4000-8000-000000000001',
            'RECOVERY_AGENCY',
            'Recovery Agency Private Limited',
            'Recovery Agency'
          );

          insert into client_organizations (
            id, agency_id, code, legal_name, display_name, status, timezone
          ) values (
            '10000000-0000-4000-8000-000000000002',
            '10000000-0000-4000-8000-000000000001',
            'RECOVERY_CLIENT',
            'Recovery Motors Private Limited',
            'Recovery Motors',
            'ACTIVE',
            'Asia/Kolkata'
          );
        `);

      const migrationCountBefore = await source.query<{ count: number }>(
        'select count(*)::int as count from drizzle.__drizzle_migrations',
      );
      const snapshot = await source.dumpDataDir();
      await source.close();

      restored = new PGlite({ loadDataDir: snapshot });
      await restored.waitReady;

      const clientRows = await restored.query<{
        code: string;
        display_name: string;
        timezone: string;
      }>(`
          select code, display_name, timezone
          from client_organizations
          where id = '10000000-0000-4000-8000-000000000002'
        `);
      const migrationCountAfter = await restored.query<{ count: number }>(
        'select count(*)::int as count from drizzle.__drizzle_migrations',
      );

      expect(clientRows.rows).toEqual([
        {
          code: 'RECOVERY_CLIENT',
          display_name: 'Recovery Motors',
          timezone: 'Asia/Kolkata',
        },
      ]);
      expect(migrationCountAfter.rows[0]?.count).toBe(migrationCountBefore.rows[0]?.count);
      await expect(
        restored.exec(`
            insert into client_organizations (
              agency_id, code, legal_name, display_name, status, timezone
            ) values (
              '10000000-0000-4000-8000-000000000099',
              'BROKEN_CLIENT',
              'Broken Client Private Limited',
              'Broken Client',
              'ACTIVE',
              'Asia/Kolkata'
            )
          `),
      ).rejects.toThrow();
    } finally {
      if (!source.closed) await source.close();
      if (restored && !restored.closed) await restored.close();
    }
  }, 60_000);
});
