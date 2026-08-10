'use client';

import { Alert, AlertDescription, AlertTitle } from '@gdm/ui/components/alert';
import { Badge } from '@gdm/ui/components/badge';
import { Button } from '@gdm/ui/components/button';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@gdm/ui/components/table';
import { useQuery } from '@tanstack/react-query';
import {
  Laptop2,
  LoaderCircle,
  LogOut,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useState } from 'react';

import { ApiClientError } from '@/features/auth/auth-api-client';
import { useAuth } from '@/features/auth/auth-provider';
import type { SessionDevice } from '@/features/auth/auth-types';

export default function SessionsPage() {
  return <SessionsPanel />;
}

export function SessionsPanel({ embedded = false }: { embedded?: boolean } = {}) {
  const auth = useAuth();
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const sessionsQuery = useQuery({
    queryFn: () => auth.listSessions(),
    queryKey: ['auth', 'sessions'],
  });

  async function revoke(session: SessionDevice) {
    setActionMessage(null);
    if (session.current) {
      await auth.logout();
      return;
    }
    await auth.revokeSession(session.id);
    setActionMessage(`${session.deviceName} was signed out.`);
    await sessionsQuery.refetch();
  }

  return (
    <div className={embedded ? 'space-y-5' : 'space-y-8'}>
      <section
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        aria-labelledby="sessions-heading"
      >
        <div>
          {embedded ? null : <Badge variant="secondary">Security</Badge>}
          <h1
            className={
              embedded
                ? 'text-xl font-semibold tracking-tight'
                : 'mt-3 text-3xl font-semibold tracking-tight'
            }
            id="sessions-heading"
          >
            Active sessions
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
            Review signed-in devices and revoke anything you do not recognize. Revocation cannot be
            undone.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={sessionsQuery.isFetching}
            onClick={() => void sessionsQuery.refetch()}
            variant="outline"
          >
            <RefreshCw
              aria-hidden="true"
              className={sessionsQuery.isFetching ? 'animate-spin' : undefined}
              data-icon="inline-start"
            />
            {sessionsQuery.isFetching ? 'Refreshing' : 'Refresh'}
          </Button>
          <LogoutAllDialog />
        </div>
      </section>

      <div aria-live="polite">
        {actionMessage === null ? null : (
          <Alert>
            <Laptop2 aria-hidden="true" />
            <AlertTitle>Session revoked</AlertTitle>
            <AlertDescription>{actionMessage}</AlertDescription>
          </Alert>
        )}
      </div>

      {sessionsQuery.isPending ? <SessionsSkeleton /> : null}
      {sessionsQuery.isError ? (
        <Card>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>Sessions could not be loaded</AlertTitle>
              <AlertDescription>
                {sessionsQuery.error instanceof ApiClientError
                  ? sessionsQuery.error.message
                  : 'Try again.'}
              </AlertDescription>
            </Alert>
            <Button onClick={() => void sessionsQuery.refetch()} variant="outline">
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {sessionsQuery.isSuccess && sessionsQuery.data.length === 0 ? (
        <EmptyState
          description="The server did not report an active device session. Refresh once; if this persists, sign in again."
          icon={<Laptop2 aria-hidden="true" className="size-5" />}
          title="No sessions reported"
        />
      ) : null}
      {sessionsQuery.isSuccess && sessionsQuery.data.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Signed-in devices</CardTitle>
            <CardDescription>
              {sessionsQuery.data.length} active or recently revoked session
              {sessionsQuery.data.length === 1 ? '' : 's'} reported.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last active</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessionsQuery.data.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {isMobileDevice(session) ? (
                          <Smartphone aria-hidden="true" className="text-muted-foreground size-4" />
                        ) : (
                          <Laptop2 aria-hidden="true" className="text-muted-foreground size-4" />
                        )}
                        <div>
                          <p className="font-medium">{session.deviceName}</p>
                          {session.ipAddress === undefined ? null : (
                            <p className="text-muted-foreground mt-0.5 text-xs">
                              IP {session.ipAddress}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {session.revokedAt === undefined ? (
                        session.current ? (
                          <StatusBadge tone="success">Current</StatusBadge>
                        ) : (
                          <StatusBadge tone="info">Active</StatusBadge>
                        )
                      ) : (
                        <StatusBadge tone="neutral">Revoked</StatusBadge>
                      )}
                    </TableCell>
                    <TableCell>{formatDateTime(session.lastSeenAt)}</TableCell>
                    <TableCell>{formatDateTime(session.expiresAt)}</TableCell>
                    <TableCell className="text-right">
                      {session.revokedAt === undefined ? (
                        <RevokeSessionDialog onConfirm={() => revoke(session)} session={session} />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Alert variant="info">
        <ShieldAlert aria-hidden="true" />
        <AlertTitle>See a device you do not recognize?</AlertTitle>
        <AlertDescription>
          Revoke it, then use “Sign out all devices” and reset your password. Audit events retain
          the security action.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function RevokeSessionDialog({
  onConfirm,
  session,
}: {
  onConfirm(): Promise<void>;
  session: SessionDevice;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : 'The session could not be revoked.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger className="border-border hover:bg-muted inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium">
        {session.current ? (
          <LogOut aria-hidden="true" className="size-3.5" />
        ) : (
          <Trash2 aria-hidden="true" className="size-3.5" />
        )}
        {session.current ? 'Sign out' : 'Revoke'}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {session.current ? 'Sign out this device?' : `Revoke ${session.deviceName}?`}
          </DialogTitle>
          <DialogDescription>
            {session.current
              ? 'You will return to sign in and any unsaved changes may be lost.'
              : 'That device will lose refresh access and must sign in again. This action is audited.'}
          </DialogDescription>
        </DialogHeader>
        {error === null ? null : (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>Action failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
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
              <LogOut aria-hidden="true" data-icon="inline-start" />
            )}
            {pending ? 'Revoking' : session.current ? 'Sign out' : 'Revoke session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LogoutAllDialog() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      await auth.logoutAll();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : 'All sessions could not be revoked.',
      );
      setPending(false);
    }
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger className="bg-destructive/10 text-destructive hover:bg-destructive/20 inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium">
        <LogOut aria-hidden="true" className="size-4" />
        Sign out all devices
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign out every device?</DialogTitle>
          <DialogDescription>
            All refresh sessions, including this device, will be revoked. You must sign in again
            everywhere. This action is audited.
          </DialogDescription>
        </DialogHeader>
        {error === null ? null : (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>Action failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
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
              <LogOut aria-hidden="true" data-icon="inline-start" />
            )}
            {pending ? 'Signing out' : 'Sign out all devices'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SessionsSkeleton() {
  return (
    <Card aria-busy="true" aria-label="Loading active sessions">
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton className="h-14 w-full" key={index} />
        ))}
      </CardContent>
    </Card>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? 'Unknown'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function isMobileDevice(session: SessionDevice): boolean {
  return /android|iphone|mobile/i.test(`${session.deviceName} ${session.userAgent ?? ''}`);
}
