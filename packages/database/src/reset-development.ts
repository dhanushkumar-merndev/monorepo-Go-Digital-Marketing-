import { fileURLToPath } from 'node:url';

import { createDatabaseConnection } from './connection.js';

const databaseUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (process.env.CONFIRM_DEVELOPMENT_DATABASE_RESET !== 'yes') {
  throw new Error(
    'Refusing to reset. Set CONFIRM_DEVELOPMENT_DATABASE_RESET=yes for this one command.',
  );
}

if (!databaseUrl || !supabaseUrl || !serviceRoleKey) {
  throw new Error(
    'DIRECT_DATABASE_URL (or DATABASE_URL), SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY are required.',
  );
}

const configuredSupabaseUrl = supabaseUrl;
const configuredServiceRoleKey = serviceRoleKey;

interface SupabaseUser {
  id: string;
}

function quotedIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function supabaseAdmin(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${configuredSupabaseUrl.replace(/\/$/u, '')}${path}`, {
    ...init,
    headers: {
      apikey: configuredServiceRoleKey,
      authorization: `Bearer ${configuredServiceRoleKey}`,
      ...init.headers,
    },
  });
}

const connection = createDatabaseConnection({ url: databaseUrl, maxConnections: 1 });

try {
  const authUsersResponse = await supabaseAdmin('/auth/v1/admin/users?page=1&per_page=1000');
  if (!authUsersResponse.ok) {
    throw new Error('Supabase Auth users could not be listed before reset.');
  }

  const authUsersPayload = (await authUsersResponse.json()) as { users?: SupabaseUser[] };
  for (const user of authUsersPayload.users ?? []) {
    const response = await supabaseAdmin(`/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error(`Supabase Auth user ${user.id} could not be deleted.`);
  }

  const tables = await connection.db.execute<{ table_name: string }>(
    `select table_name
       from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
        and table_name <> '__drizzle_migrations'
      order by table_name`,
  );
  const tableNames = tables.map((table) => table.table_name);

  if (tableNames.length > 0) {
    await connection.db.execute(
      `truncate table ${tableNames.map(quotedIdentifier).join(', ')} restart identity cascade`,
    );
  }

  process.stdout.write(
    `Deleted ${String(authUsersPayload.users?.length ?? 0)} Supabase Auth users and truncated ${String(tableNames.length)} development application tables.\n`,
  );
} finally {
  await connection.close();
}
