'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

export default function SupabaseAuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    const parameters = new URLSearchParams(window.location.search);
    const code = parameters.get('code');
    const next = parameters.get('next') === 'account-settings' ? '/?settings=methods' : '/';
    if (!client || !code) {
      router.replace('/login?reason=oauth');
      return;
    }
    void client.auth.exchangeCodeForSession(code).then(({ error }) => {
      router.replace(
        error ? '/login?reason=oauth' : `/auth/mfa?returnTo=${encodeURIComponent(next)}`,
      );
    });
  }, [router]);

  return <p className="text-muted-foreground p-8 text-sm">Completing secure sign-in…</p>;
}
