'use client';

import { Alert, AlertDescription, AlertTitle } from '@gdm/ui/components/alert';
import { Button } from '@gdm/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gdm/ui/components/card';
import { Skeleton } from '@gdm/ui/components/skeleton';
import { LogIn, RefreshCw, ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { TenantSelector } from '@/features/tenancy/tenant-selector';

import { useAuth, useLoginRedirect } from './auth-provider';

export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const loginRedirect = useLoginRedirect();
  const router = useRouter();

  useEffect(() => {
    if (auth.status === 'anonymous') {
      router.replace(loginRedirect);
    }
  }, [auth.status, loginRedirect, router]);

  if (auth.status === 'loading' || auth.status === 'anonymous' || auth.status === 'expired') {
    return <AuthLoading />;
  }

  if (auth.status === 'error') {
    return (
      <main className="grid min-h-screen place-items-center px-4 py-12">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Session check unavailable</CardTitle>
            <CardDescription>
              The dashboard could not verify your session. No protected data has been shown.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <ShieldAlert aria-hidden="true" />
              <AlertTitle>Could not reach authentication service</AlertTitle>
              <AlertDescription>{auth.error?.message}</AlertDescription>
            </Alert>
            <Button onClick={() => void auth.retryInitialization()}>
              <RefreshCw aria-hidden="true" data-icon="inline-start" />
              Retry session check
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (auth.session === null) {
    return <AuthLoading />;
  }

  if (auth.session.currentMembership === null && auth.session.memberships.length > 0) {
    return (
      <main className="grid min-h-screen place-items-center px-4 py-12">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Choose your client workspace</CardTitle>
            <CardDescription>
              Your session is valid. Select one of your active memberships before entering the
              dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <TenantSelector presentation="full" />
            <Button onClick={() => void auth.logout().catch(() => undefined)} variant="outline">
              <LogIn aria-hidden="true" data-icon="inline-start" />
              Sign in with another account
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (auth.session.currentMembership === null) {
    return (
      <main className="grid min-h-screen place-items-center px-4 py-12">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>No active client access</CardTitle>
            <CardDescription>
              Your identity is valid, but it has no active membership. Ask an administrator to
              restore your access.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => void auth.logout().catch(() => undefined)} variant="outline">
              <LogIn aria-hidden="true" data-icon="inline-start" />
              Sign in with another account
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return children;
}

function AuthLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Verifying secure session"
      className="grid min-h-screen place-items-center px-4 py-12"
    >
      <Card className="w-full max-w-md">
        <CardHeader>
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-full" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-3/4" />
        </CardContent>
      </Card>
    </main>
  );
}
