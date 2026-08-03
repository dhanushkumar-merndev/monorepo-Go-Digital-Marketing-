import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import * as schema from './schema/index.js';

export interface MigratedPGliteTestDatabase {
  client: PGlite;
  close(): Promise<void>;
  db: PgliteDatabase<typeof schema>;
}

/**
 * Creates an in-memory PostgreSQL-compatible database with every reviewed
 * migration applied. This is a test-only package subpath and is never imported
 * by an application runtime bundle.
 */
export async function createMigratedPGliteTestDatabase(): Promise<MigratedPGliteTestDatabase> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
  });
  return {
    client,
    close: () => client.close(),
    db,
  };
}
