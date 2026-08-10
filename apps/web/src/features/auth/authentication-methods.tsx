'use client';

import { Alert, AlertDescription, AlertTitle } from '@gdm/ui/components/alert';
import { Badge } from '@gdm/ui/components/badge';
import { Button, buttonVariants } from '@gdm/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gdm/ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@gdm/ui/components/dialog';
import { EmptyState } from '@gdm/ui/components/empty-state';
import { Skeleton } from '@gdm/ui/components/skeleton';
import { StatusBadge } from '@gdm/ui/components/status-badge';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Link2,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Unlink,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import {
  googleLinkErrorMessage,
  googleUnlinkErrorMessage,
  type AuthenticationErrorMessage,
} from './google-auth-errors';
import { GoogleIdentityButton } from './google-identity-services';
import { useAuth } from './auth-provider';
import { hasPermission, type AuthenticationMethod, type GoogleCredentialInput } from './auth-types';

export function AuthenticationMethodsScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const auth = useAuth();
  const supabase = getSupabaseBrowserClient();
  const [message, setMessage] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<AuthenticationErrorMessage | null>(null);
  const methodsQuery = useQuery({
    queryFn: () => auth.listAuthenticationMethods(),
    queryKey: ['auth', 'methods'],
  });
  const canManage = auth.session !== null && hasPermission(auth.session, 'account.profile.update');

  if (supabase !== null) {
    return <SupabaseAuthenticationMethodsScreen canManage={canManage} embedded={embedded} />;
  }

  async function connectGoogle(input: GoogleCredentialInput) {
    setMessage(null);
    setLinkError(null);
    await auth.linkGoogleIdentity(input);
    await methodsQuery.refetch();
    setMessage('Google is now connected as a sign-in method.');
  }

  async function unlinkGoogle() {
    setMessage(null);
    setLinkError(null);
    const result = await auth.unlinkGoogleIdentity();
    if (result.currentSessionRevoked) return;
    await methodsQuery.refetch();
    setMessage('Google was disconnected. Your other sign-in method remains active.');
  }

  const methods = methodsQuery.data ?? [];
  const googleMethod = methods.find((method) => method.provider === 'GOOGLE');

  return (
    <div className={embedded ? 'space-y-5' : 'space-y-8'}>
      {embedded ? null : (
        <section aria-labelledby="authentication-methods-heading">
          <Link className={buttonVariants({ size: 'sm', variant: 'ghost' })} href="/profile">
            <ArrowLeft aria-hidden="true" data-icon="inline-start" />
            Back to profile
          </Link>
          <Badge className="mt-5" variant="secondary">
            Account security
          </Badge>
          <h1
            className="mt-3 text-3xl font-semibold tracking-tight"
            id="authentication-methods-heading"
          >
            Sign-in methods
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
            Review and manage the ways you can sign in to your account.
          </p>
        </section>
      )}

      <div aria-live="polite" className="space-y-3">
        {message === null ? null : (
          <Alert>
            <CheckCircle2 aria-hidden="true" className="text-[var(--status-success-foreground)]" />
            <AlertTitle>Sign-in methods updated</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        {linkError === null ? null : (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>{linkError.title}</AlertTitle>
            <AlertDescription>{linkError.description}</AlertDescription>
          </Alert>
        )}
      </div>

      {methodsQuery.isPending ? <AuthenticationMethodsSkeleton /> : null}
      {methodsQuery.isError ? (
        <Card>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>Sign-in methods could not be loaded</AlertTitle>
              <AlertDescription>
                No authentication method was changed. Check your connection and try again.
              </AlertDescription>
            </Alert>
            <Button onClick={() => void methodsQuery.refetch()} variant="outline">
              <RefreshCw aria-hidden="true" data-icon="inline-start" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {methodsQuery.isSuccess && methods.length === 0 ? (
        <EmptyState
          description="The server did not report a valid sign-in method. No changes are available; contact your administrator."
          icon={<KeyRound aria-hidden="true" className="size-5" />}
          title="No sign-in methods reported"
        />
      ) : null}
      {methodsQuery.isSuccess && methods.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {methods.map((method) => (
            <AuthenticationMethodCard
              canManage={canManage}
              key={method.provider}
              method={method}
              onUnlinkGoogle={unlinkGoogle}
            />
          ))}
        </div>
      ) : null}

      {methodsQuery.isSuccess && methods.length > 0 && !googleMethod?.connected && canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 aria-hidden="true" className="text-primary size-4" />
              Connect Google
            </CardTitle>
            <CardDescription>Add your Google account as another way to sign in.</CardDescription>
          </CardHeader>
          <CardContent className="max-w-sm space-y-4">
            <GoogleIdentityButton
              ariaLabel="Connect Google account"
              createChallenge={auth.createGoogleLinkChallenge}
              onCredential={connectGoogle}
              onFailure={(error) => setLinkError(googleLinkErrorMessage(error))}
              text="continue_with"
            />
          </CardContent>
        </Card>
      ) : null}

      {!canManage && methodsQuery.isSuccess ? (
        <Alert variant="info">
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>Read-only authentication settings</AlertTitle>
          <AlertDescription>
            Your current role can view these methods but cannot connect or disconnect them.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function SupabaseAuthenticationMethodsScreen({
  canManage,
  embedded,
}: {
  canManage: boolean;
  embedded: boolean;
}) {
  const [email, setEmail] = useState<string | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data, error: userError }) => {
      if (userError || !data.user) {
        setError('Your sign-in session is unavailable. Sign in again to manage your account.');
        return;
      }
      setEmail(data.user.email ?? null);
      setGoogleConnected(
        data.user.identities?.some((identity) => identity.provider === 'google') ?? false,
      );
    });
  }, [supabase]);

  async function connectGoogle() {
    if (!supabase) return;
    setError(null);
    const { error: linkError } = await supabase.auth.linkIdentity({
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=account-settings`,
      },
      provider: 'google',
    });
    if (linkError) setError(linkError.message);
  }

  return (
    <div className={embedded ? 'space-y-5' : 'space-y-8'}>
      {embedded ? null : (
        <section aria-labelledby="authentication-methods-heading">
          <Link className={buttonVariants({ size: 'sm', variant: 'ghost' })} href="/profile">
            <ArrowLeft aria-hidden="true" data-icon="inline-start" />
            Back to profile
          </Link>
          <h1
            className="mt-5 text-3xl font-semibold tracking-tight"
            id="authentication-methods-heading"
          >
            Sign-in methods
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
            Review and manage the ways you can sign in to your account.
          </p>
        </section>
      )}
      {error ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Google connection unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        <SupabaseMethodCard
          allowPasswordReset={canManage}
          connected
          title="Email and password"
          {...(email ? { email } : {})}
        />
        <SupabaseMethodCard connected={googleConnected} title="Google" />
      </div>
      {embedded ? null : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck aria-hidden="true" className="text-primary size-4" />
              Two-step verification
            </CardTitle>
            <CardDescription>
              Every CRM role must use an authenticator app. A six-digit code is required after both
              Google and password sign-in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {canManage ? (
              <Link href="/auth/mfa?returnTo=%2F%3Fsettings%3Dmfa">
                <Button>
                  <ShieldCheck data-icon="inline-start" />
                  Configure two-step verification
                </Button>
              </Link>
            ) : (
              <Button disabled>
                <ShieldCheck data-icon="inline-start" />
                Configure two-step verification
              </Button>
            )}
          </CardContent>
        </Card>
      )}
      {!googleConnected && canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 aria-hidden="true" className="text-primary size-4" />
              Connect Google
            </CardTitle>
            <CardDescription>Add Google as another way to sign in.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => void connectGoogle()}>
              <Link2 data-icon="inline-start" />
              Continue with Google
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function SupabaseMethodCard({
  allowPasswordReset = false,
  connected,
  email,
  title,
}: {
  allowPasswordReset?: boolean;
  connected: boolean;
  email?: string;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <KeyRound aria-hidden="true" className="text-primary size-4" />
              {title}
            </CardTitle>
            <CardDescription className="mt-1.5">
              {title === 'Google'
                ? 'Use your Google account to sign in.'
                : 'Use your email and password to sign in.'}
            </CardDescription>
          </div>
          <StatusBadge tone={connected ? 'success' : 'neutral'}>
            {connected ? 'Connected' : 'Not connected'}
          </StatusBadge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {email ? (
          <dl className="divide-border divide-y text-sm">
            <MethodRow label="Account" value={email} />
          </dl>
        ) : (
          <p className="text-muted-foreground text-sm">This method is not connected.</p>
        )}
        {allowPasswordReset && email ? (
          <Link
            className={buttonVariants({ size: 'sm', variant: 'outline' })}
            href="/forgot-password"
          >
            <KeyRound aria-hidden="true" data-icon="inline-start" />
            Update password
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AuthenticationMethodCard({
  canManage,
  method,
  onUnlinkGoogle,
}: {
  canManage: boolean;
  method: AuthenticationMethod;
  onUnlinkGoogle(): Promise<void>;
}) {
  const google = method.provider === 'GOOGLE';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              {google ? (
                <Link2 aria-hidden="true" className="text-primary size-4" />
              ) : (
                <KeyRound aria-hidden="true" className="text-primary size-4" />
              )}
              {google ? 'Google' : 'Email and password'}
            </CardTitle>
            <CardDescription className="mt-1.5">
              {google
                ? 'Use your Google account to sign in.'
                : 'Use your email and password to sign in.'}
            </CardDescription>
          </div>
          <StatusBadge tone={method.connected ? 'success' : 'neutral'}>
            {method.connected ? 'Connected' : 'Not connected'}
          </StatusBadge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {method.connected ? (
          <dl className="divide-border divide-y text-sm">
            {method.email === undefined ? null : <MethodRow label="Account" value={method.email} />}
            {method.linkedAt === undefined ? null : (
              <MethodRow label="Connected" value={formatDateTime(method.linkedAt)} />
            )}
            {method.lastUsedAt === undefined ? null : (
              <MethodRow label="Last used" value={formatDateTime(method.lastUsedAt)} />
            )}
          </dl>
        ) : (
          <p className="text-muted-foreground text-sm">
            This method cannot currently authenticate your account.
          </p>
        )}

        {google && method.connected && canManage ? (
          <div className="space-y-2">
            <UnlinkGoogleDialog disabled={!method.canUnlink} onConfirm={onUnlinkGoogle} />
            {method.canUnlink ? null : (
              <p className="text-muted-foreground text-xs leading-5">
                {unlinkBlockDescription(method.unlinkBlockReason)}
              </p>
            )}
          </div>
        ) : null}
        {!google && method.connected && canManage ? (
          <Link
            className={buttonVariants({ size: 'sm', variant: 'outline' })}
            href="/forgot-password"
          >
            <KeyRound aria-hidden="true" data-icon="inline-start" />
            Update password
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}

function UnlinkGoogleDialog({
  disabled,
  onConfirm,
}: {
  disabled: boolean;
  onConfirm(): Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AuthenticationErrorMessage | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (caught) {
      setError(googleUnlinkErrorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        className="border-border text-destructive hover:bg-destructive/10 inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium disabled:pointer-events-none disabled:opacity-50"
        disabled={disabled}
      >
        <Unlink aria-hidden="true" className="size-4" />
        Disconnect Google
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disconnect Google?</DialogTitle>
          <DialogDescription>
            Google will no longer sign in to this CRM account. Your other valid authentication
            method remains available. This security action is audited.
          </DialogDescription>
        </DialogHeader>
        {error === null ? null : (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>{error.title}</AlertTitle>
            <AlertDescription>{error.description}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button disabled={pending} onClick={() => setOpen(false)} variant="outline">
            Cancel
          </Button>
          <Button disabled={pending} onClick={() => void confirm()} variant="destructive">
            {pending ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" data-icon="inline-start" />
            ) : (
              <Unlink aria-hidden="true" data-icon="inline-start" />
            )}
            {pending ? 'Disconnecting' : 'Disconnect Google'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AuthenticationMethodsSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading sign-in methods"
      className="grid gap-4 lg:grid-cols-2"
    >
      {Array.from({ length: 2 }, (_, index) => (
        <Card key={index}>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-9 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function MethodRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[7rem_1fr] sm:gap-3">
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</dt>
      <dd className="font-medium break-words">{value}</dd>
    </div>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? 'Unknown'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function unlinkBlockDescription(reason: string | undefined): string {
  return reason === 'LAST_LOGIN_METHOD'
    ? 'Connect another valid sign-in method before disconnecting Google.'
    : 'Google cannot be disconnected while it is required to access this account.';
}
