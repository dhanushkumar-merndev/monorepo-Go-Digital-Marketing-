import { eq } from 'drizzle-orm';

import { createDatabaseConnection } from './connection.js';
import { users } from './schema/index.js';

const databaseUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const password = process.env.SEED_DEVELOPMENT_PASSWORD;

if (!databaseUrl || !supabaseUrl || !serviceRoleKey || !password) {
  throw new Error(
    'DIRECT_DATABASE_URL (or DATABASE_URL), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SEED_DEVELOPMENT_PASSWORD are required.',
  );
}
const configuredSupabaseUrl = supabaseUrl;

interface SupabaseUser {
  email?: string;
  id: string;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${configuredSupabaseUrl.replace(/\/$/u, '')}${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
      ...init.headers,
    },
  });
}

const connection = createDatabaseConnection({ url: databaseUrl, maxConnections: 1 });

try {
  const existingResponse = await request('/auth/v1/admin/users?page=1&per_page=1000');
  if (!existingResponse.ok) throw new Error('Supabase Auth users could not be listed.');
  const existingPayload = (await existingResponse.json()) as { users?: SupabaseUser[] };
  const existingByEmail = new Map<string, SupabaseUser>();
  for (const user of existingPayload.users ?? []) {
    if (user.email) existingByEmail.set(user.email.trim().toLowerCase(), user);
  }
  const crmUsers = await connection.db
    .select({
      displayName: users.displayName,
      email: users.primaryEmailNormalized,
      id: users.id,
      supabaseAuthUserId: users.supabaseAuthUserId,
    })
    .from(users);

  let created = 0;
  let linked = 0;
  for (const crmUser of crmUsers) {
    let supabaseUser = existingByEmail.get(crmUser.email);
    if (!supabaseUser) {
      const response = await request('/auth/v1/admin/users', {
        body: JSON.stringify({
          app_metadata: { crm_user_id: crmUser.id },
          email: crmUser.email,
          email_confirm: true,
          password,
          user_metadata: { display_name: crmUser.displayName },
        }),
        method: 'POST',
      });
      if (!response.ok)
        throw new Error(`Supabase Auth user could not be created for ${crmUser.email}.`);
      supabaseUser = (await response.json()) as SupabaseUser;
      created += 1;
    }

    if (crmUser.supabaseAuthUserId !== supabaseUser.id) {
      await connection.db
        .update(users)
        .set({ supabaseAuthUserId: supabaseUser.id, updatedAt: new Date() })
        .where(eq(users.id, crmUser.id));
      linked += 1;
    }
  }

  process.stdout.write(
    `Created ${String(created)} and linked ${String(linked)} Supabase Auth development users.\n`,
  );
} finally {
  await connection.close();
}
