import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { createDatabaseConnection } from './connection.js';

const databaseUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

if (databaseUrl === undefined || databaseUrl.trim() === '') {
  throw new Error(
    'DIRECT_DATABASE_URL or DATABASE_URL is required to run migrations. Copy .env.example to .env.',
  );
}

const connection = createDatabaseConnection({ url: databaseUrl, maxConnections: 1 });

try {
  await migrate(connection.db, { migrationsFolder: 'migrations' });
} finally {
  await connection.close();
}
