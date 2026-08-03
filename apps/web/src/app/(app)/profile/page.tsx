'use client';

import { Alert, AlertDescription, AlertTitle } from '@gdm/ui/components/alert';
import { Badge } from '@gdm/ui/components/badge';
import { Button, buttonVariants } from '@gdm/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gdm/ui/components/card';
import {
  CheckCircle2,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { ApiClientError } from '@/features/auth/auth-api-client';
import { useAuth } from '@/features/auth/auth-provider';

export default function ProfilePage() {
  const auth = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const session = auth.session;
  const membership = session?.currentMembership;

  if (session === null || membership === undefined || membership === null) return null;

  async function refresh() {
    setRefreshing(true);
    setMessage(null);
    setError(null);
    try {
      await auth.refreshProfile();
      setMessage('Profile and access context refreshed.');
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Profile could not be refreshed. Try again.',
      );
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-8">
      <section
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        aria-labelledby="profile-heading"
      >
        <div>
          <Badge variant="secondary">Account</Badge>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight" id="profile-heading">
            User profile
          </h1>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            Identity and effective access reported by the authoritative API.
          </p>
        </div>
        <Button disabled={refreshing} onClick={() => void refresh()} variant="outline">
          {refreshing ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" data-icon="inline-start" />
          ) : (
            <RefreshCw aria-hidden="true" data-icon="inline-start" />
          )}
          {refreshing ? 'Refreshing' : 'Refresh profile'}
        </Button>
      </section>

      <div aria-live="polite">
        {message === null ? null : (
          <Alert>
            <CheckCircle2 aria-hidden="true" className="text-[var(--status-success-foreground)]" />
            <AlertTitle>Profile refreshed</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        {error === null ? null : (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>Profile unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound aria-hidden="true" className="text-primary size-4" />
              Identity
            </CardTitle>
            <CardDescription>Your global account identity.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-border divide-y">
              <ProfileRow label="Name" value={session.user.displayName} />
              <ProfileRow label="Email" value={session.user.email} />
              <ProfileRow label="Account status" value={session.user.status} />
              <ProfileRow label="User ID" mono value={session.user.id} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck aria-hidden="true" className="text-primary size-4" />
              Current membership
            </CardTitle>
            <CardDescription>Tenant, role, branch and team scope for this session.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-border divide-y">
              <ProfileRow label="Client" value={membership.clientOrganization.name} />
              <ProfileRow label="Role" value={membership.roleName} />
              <ProfileRow
                label="Branches"
                value={
                  membership.branchNames.length === 0
                    ? 'No named branch scope'
                    : membership.branchNames.join(', ')
                }
              />
              <ProfileRow
                label="Teams"
                value={
                  membership.teamNames.length === 0
                    ? 'No named team scope'
                    : membership.teamNames.join(', ')
                }
              />
              <ProfileRow label="Membership ID" mono value={membership.id} />
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound aria-hidden="true" className="text-primary size-4" />
            Sign-in methods
          </CardTitle>
          <CardDescription>
            Review your email/password and connected Google authentication methods.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link className={buttonVariants({ variant: 'outline' })} href="/profile/authentication">
            Manage sign-in methods
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Effective permissions</CardTitle>
          <CardDescription>
            UI visibility is based on these codes. The backend independently re-checks every action.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {session.permissions.length === 0 ? (
            <p className="border-border text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-sm">
              No permission codes were returned. Protected actions remain hidden and server access
              remains default-deny.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {session.permissions.map((permission) => (
                <li key={permission}>
                  <Badge variant="outline">{permission}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProfileRow({
  label,
  mono = false,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</dt>
      <dd className={mono ? 'font-mono text-xs break-all' : 'text-sm font-medium break-words'}>
        {value}
      </dd>
    </div>
  );
}
