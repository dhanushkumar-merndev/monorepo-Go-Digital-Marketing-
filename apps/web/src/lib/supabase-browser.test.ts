import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClient = vi.hoisted(() =>
  vi.fn((_url: string, _key: string, _options: unknown) => ({ auth: {} })),
);

vi.mock('@supabase/supabase-js', () => ({ createClient }));
vi.mock('./env', () => ({
  publicEnvironment: {
    supabasePublishableKey: 'publishable-key-with-valid-length',
    supabaseUrl: 'https://project.supabase.co',
  },
}));

describe('getSupabaseBrowserClient', () => {
  beforeEach(() => vi.clearAllMocks());

  it('leaves PKCE callback exchange to the dedicated callback page', async () => {
    const { getSupabaseBrowserClient } = await import('./supabase-browser');

    getSupabaseBrowserClient();

    expect(createClient).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'publishable-key-with-valid-length',
      {
        auth: { detectSessionInUrl: false, flowType: 'pkce', persistSession: true },
      },
    );
  });
});
