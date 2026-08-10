'use client';

import { Button } from '@gdm/ui/components/button';
import { LoaderCircle, LogIn } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { authApiClient } from './auth-api-client';

interface ClearSessionSignInButtonProps {
  href: string;
  label: string;
}

/** Clears the API refresh cookie and browser Supabase session before another sign-in attempt. */
export function ClearSessionSignInButton({ href, label }: ClearSessionSignInButtonProps) {
  const router = useRouter();
  const [clearing, setClearing] = useState(false);

  async function clearSessionAndContinue() {
    setClearing(true);
    try {
      await authApiClient.logout();
    } catch {
      // logout() clears local credentials in its finally block. Continue to sign-in
      // even when a previously revoked server session cannot be reached.
    } finally {
      router.replace(href);
      router.refresh();
    }
  }

  return (
    <Button className="w-full" disabled={clearing} onClick={() => void clearSessionAndContinue()}>
      {clearing ? (
        <LoaderCircle aria-hidden="true" className="animate-spin" />
      ) : (
        <LogIn aria-hidden="true" />
      )}
      {clearing ? 'Clearing session…' : label}
    </Button>
  );
}
