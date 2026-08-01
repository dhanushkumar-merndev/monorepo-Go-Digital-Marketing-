import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

if (databaseUrl === undefined || databaseUrl.trim() === '') {
  throw new Error(
    'DIRECT_DATABASE_URL or DATABASE_URL is required for Drizzle commands. Copy .env.example to .env.',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: {
    url: databaseUrl,
  },
  migrations: {
    schema: 'drizzle',
    table: '__drizzle_migrations',
  },
  strict: true,
  verbose: true,
});
