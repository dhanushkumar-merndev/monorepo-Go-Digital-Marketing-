'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { publicEnvironment } from './env';

let client: SupabaseClient | null | undefined;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  if (!publicEnvironment.supabaseUrl || !publicEnvironment.supabasePublishableKey) {
    client = null;
    return client;
  }

  client = createClient(publicEnvironment.supabaseUrl, publicEnvironment.supabasePublishableKey, {
    // OAuth callbacks are exchanged exactly once by /auth/callback. Automatic
    // detection here would race that explicit exchange and consume the PKCE code twice.
    auth: { detectSessionInUrl: false, flowType: 'pkce', persistSession: true },
  });
  return client;
}
