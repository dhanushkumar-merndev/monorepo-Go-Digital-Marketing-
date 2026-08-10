'use client';

import { Alert, AlertDescription, AlertTitle } from '@gdm/ui/components/alert';
import { Button } from '@gdm/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gdm/ui/components/card';
import { StatusBadge } from '@gdm/ui/components/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@gdm/ui/components/table';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { ApiClientError } from './auth-api-client';
import { useAuth } from './auth-provider';

const permissionVerbs: Record<string, string> = {
  approve: 'Approve',
  assign: 'Assign',
  cancel: 'Cancel',
  configure: 'Configure',
  correct: 'Correct',
  create: 'Create',
  delete: 'Delete',
  export: 'Export',
  manage: 'Manage',
  publish: 'Publish',
  read: 'View',
  record: 'Record',
  review: 'Review',
  revoke: 'End',
  retry: 'Retry',
  select: 'Switch',
  send: 'Send',
  update: 'Update',
  upload: 'Upload',
  verify: 'Verify',
};

const permissionTerms: Record<string, string> = {
  ai: 'AI',
  creatives: 'creative suggestions',
  support_elevation: 'temporary client support access',
  test_rides: 'test rides',
  transcripts: 'transcript suggestions',
};

const roleGuide = [
  {
    description: 'Manages agency clients and temporary client support access.',
    name: 'Agency Admin',
    workspace: 'Agency web',
  },
  {
    description: 'Manages users, roles, branches and settings for one client.',
    name: 'Client Admin',
    workspace: 'Client web',
  },
  {
    description: 'Oversees client operations and approved exceptions.',
    name: 'Manager',
    workspace: 'Client web',
  },
  {
    description: 'Supervises sales activity for assigned branches and teams.',
    name: 'Sales Manager',
    workspace: 'Client web',
  },
  {
    description: 'Contacts, qualifies and hands off assigned leads.',
    name: 'Telecaller',
    workspace: 'Client web',
  },
  {
    description: 'Works on owned or assigned leads.',
    name: 'Salesperson',
    workspace: 'Mobile',
  },
  {
    description: 'Carries out assigned test rides.',
    name: 'Test Ride Executive',
    workspace: 'Mobile',
  },
  {
    description: 'Manages assigned stock and vehicle allocations.',
    name: 'Inventory Executive',
    workspace: 'Client web',
  },
  {
    description: 'Handles booking, billing and customer documents.',
    name: 'Billing and Documentation Executive',
    workspace: 'Client web',
  },
  {
    description: 'Carries out assigned vehicle deliveries.',
    name: 'Delivery Executive',
    workspace: 'Mobile',
  },
  {
    description: 'Handles registration and RC cases.',
    name: 'RC and Registration Executive',
    workspace: 'Client web',
  },
  {
    description: 'Supervises assigned team members and their lead workload.',
    name: 'Team Manager',
    workspace: 'Client web',
  },
] as const;

export function AccountProfileSettings() {
  const auth = useAuth();
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
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
      setMessage('Your profile is up to date.');
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Your profile could not be refreshed. Try again.',
      );
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Your profile</h2>
          <p className="text-muted-foreground mt-1 text-sm">Personal details and account access.</p>
        </div>
        <Button disabled={refreshing} onClick={() => void refresh()} size="sm" variant="outline">
          {refreshing ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" data-icon="inline-start" />
          ) : (
            <RefreshCw aria-hidden="true" data-icon="inline-start" />
          )}
          {refreshing ? 'Refreshing' : 'Refresh'}
        </Button>
      </div>

      <div aria-live="polite">
        {message ? (
          <Alert>
            <CheckCircle2 aria-hidden="true" />
            <AlertTitle>Profile refreshed</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>Profile unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <UserRound aria-hidden="true" className="text-primary size-4" />
              Personal details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-border divide-y">
              <ProfileRow label="Name" value={session.user.displayName} />
              <ProfileRow label="Email" value={session.user.email} />
              <ProfileRow
                label="Status"
                value={<StatusBadge tone="success">{titleCase(session.user.status)}</StatusBadge>}
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck aria-hidden="true" className="text-primary size-4" />
              Access
            </CardTitle>
            <CardDescription>Company, role and assigned work areas.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-border divide-y">
              <ProfileRow label="Company" value={membership.clientOrganization.name} />
              <ProfileRow
                label="Role"
                value={
                  <Button
                    aria-expanded={permissionsOpen}
                    className="h-8 px-2"
                    onClick={() => setPermissionsOpen((current) => !current)}
                    size="sm"
                    variant="outline"
                  >
                    {membership.roleName}
                    {permissionsOpen ? (
                      <ChevronUp aria-hidden="true" data-icon="inline-end" />
                    ) : (
                      <ChevronDown aria-hidden="true" data-icon="inline-end" />
                    )}
                  </Button>
                }
              />
              <ProfileRow
                label="Branches"
                value={
                  membership.branchNames.length === 0
                    ? 'No specific branch limit'
                    : membership.branchNames.join(', ')
                }
              />
              <ProfileRow
                label="Teams"
                value={
                  membership.teamNames.length === 0
                    ? 'No specific team limit'
                    : membership.teamNames.join(', ')
                }
              />
              <ProfileRow
                label="All roles"
                value={
                  <Button
                    aria-expanded={rolesOpen}
                    className="h-8 px-2"
                    onClick={() => setRolesOpen((current) => !current)}
                    size="sm"
                    variant="outline"
                  >
                    View all {roleGuide.length} roles
                    {rolesOpen ? (
                      <ChevronUp aria-hidden="true" data-icon="inline-end" />
                    ) : (
                      <ChevronDown aria-hidden="true" data-icon="inline-end" />
                    )}
                  </Button>
                }
              />
            </dl>
          </CardContent>
        </Card>
      </div>

      {permissionsOpen ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>{membership.roleName} permissions</CardTitle>
            <CardDescription>What this role can view and manage.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {session.permissions.length === 0 ? (
              <p className="text-muted-foreground px-5 py-4 text-sm">
                No permissions are assigned to this role.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[48%]">Permission ID</TableHead>
                    <TableHead>Explanation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {session.permissions.map((permission) => (
                    <TableRow key={permission}>
                      <TableCell className="font-mono text-xs break-all">{permission}</TableCell>
                      <TableCell className="text-sm">{explainPermission(permission)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {rolesOpen ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>All account roles</CardTitle>
            <CardDescription>
              Profile, sign-in security, two-step verification and session controls apply to every
              role.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Workspace</TableHead>
                  <TableHead>What the role does</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roleGuide.map((role) => (
                  <TableRow key={role.name}>
                    <TableCell className="font-medium">
                      <div className="flex flex-wrap items-center gap-2">
                        {role.name}
                        {role.name === membership.roleName ? (
                          <StatusBadge tone="info">Current</StatusBadge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{role.workspace}</TableCell>
                    <TableCell className="text-sm">{role.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[6rem_1fr] sm:items-center sm:gap-3">
      <dt className="text-muted-foreground text-xs font-medium uppercase">{label}</dt>
      <dd className="text-sm font-medium break-words">{value}</dd>
    </div>
  );
}

export function explainPermission(permission: string): string {
  if (permission === '*') return 'Full access to all available features.';
  const parts = permission.split('.');
  const action = parts.pop() ?? 'use';
  const subject = parts.map((part) => permissionTerms[part] ?? part.replaceAll('_', ' ')).join(' ');
  const verb = permissionVerbs[action] ?? titleCase(action);
  return `${verb} ${subject || 'this feature'}.`;
}

function titleCase(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
