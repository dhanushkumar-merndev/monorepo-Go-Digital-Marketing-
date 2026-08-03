'use client';

import { Button } from '@gdm/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gdm/ui/components/card';
import { EmptyState } from '@gdm/ui/components/empty-state';
import { Input } from '@gdm/ui/components/input';
import { Label } from '@gdm/ui/components/label';
import { Skeleton } from '@gdm/ui/components/skeleton';
import { StatusBadge } from '@gdm/ui/components/status-badge';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, RefreshCw, Settings2, Users } from 'lucide-react';
import { type FormEvent, useState } from 'react';

import { ApiClientError, authApiClient } from '@/features/auth/auth-api-client';
import { hasPermission } from '@/features/auth/auth-types';
import { useAuth } from '@/features/auth/auth-provider';

interface Client {
  id: string;
  display_name: string;
  legal_name: string;
  status: string;
  timezone: string;
}
interface Branch {
  id: string;
  code: string;
  name: string;
  timezone: string;
  active: boolean;
}
interface Team {
  id: string;
  code: string;
  name: string;
  branch_id: string;
  active: boolean;
}
interface User {
  membership_id: string;
  display_name: string;
  email: string;
  role_code: string;
  membership_status: string;
}
interface Flag {
  module: string;
  enabled: boolean;
  reason: string | null;
}
const api = <T,>(path: string, init?: RequestInit) => authApiClient.request<T>(path, init);
const body = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(data),
});
const errorText = (error: unknown) =>
  error instanceof ApiClientError
    ? error.message
    : 'The requested administration operation failed.';

export function AdministrationConsole() {
  const auth = useAuth();
  const cache = useQueryClient();
  const session = auth.session;
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const agency = session !== null && hasPermission(session, 'platform.clients.manage');
  const client = session !== null && hasPermission(session, 'organization.settings.manage');
  const clients = useQuery({
    queryKey: ['admin', 'clients'],
    queryFn: () => api<{ client_organizations: Client[] }>('/clients'),
    enabled: agency,
  });
  const branches = useQuery({
    queryKey: ['admin', 'branches'],
    queryFn: () => api<{ branches: Branch[] }>('/branches'),
    enabled: client,
  });
  const teams = useQuery({
    queryKey: ['admin', 'teams'],
    queryFn: () => api<{ teams: Team[] }>('/teams'),
    enabled: client,
  });
  const users = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api<{ users: User[] }>('/users'),
    enabled: client,
  });
  const flags = useQuery({
    queryKey: ['admin', 'flags'],
    queryFn: () => api<{ flags: Flag[] }>('/administration/module-flags'),
    enabled: client,
  });
  const settings = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () =>
      api<{ lead_assignment_ready: boolean; retention_policy: Record<string, unknown> }>(
        '/administration/settings',
      ),
    enabled: client,
  });
  const integrations = useQuery({
    queryKey: ['admin', 'integrations'],
    queryFn: () =>
      api<{ integrations: { integration: string; status: string; detail: string | null }[] }>(
        '/administration/integrations/readiness',
      ),
    enabled: client,
  });
  const audit = useQuery({
    queryKey: ['admin', 'audit'],
    queryFn: () =>
      api<{
        events: {
          action: string;
          entity_type: string;
          created_at: string;
          reason: string | null;
        }[];
      }>('/administration/audit'),
    enabled: client,
  });
  const mutation = useMutation({
    mutationFn: ({ path, init }: { path: string; init: RequestInit }) => api(path, init),
    onSuccess: () => {
      setFailure(null);
      setNotice('Saved. The API has enforced the change and recorded it in the audit timeline.');
      void cache.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => {
      setNotice(null);
      setFailure(errorText(e));
    },
  });
  if (session === null) return null;
  if (!agency && !client)
    return (
      <EmptyState
        description="Your current role has no administrative permission."
        title="Administration unavailable"
      />
    );
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm">Agency and dealership operations</p>
          <h1 className="text-3xl font-semibold tracking-tight">Administration</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
            Tenant-scoped lifecycle, user, scope and configuration controls. Historical references
            are preserved and sensitive changes are audited.
          </p>
        </div>
        <Button
          onClick={() => void cache.invalidateQueries({ queryKey: ['admin'] })}
          variant="outline"
        >
          <RefreshCw data-icon="inline-start" />
          Refresh
        </Button>
      </header>
      {notice ? (
        <p
          className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800"
          role="status"
        >
          {notice}
        </p>
      ) : null}
      {failure ? (
        <p
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-sm"
          role="alert"
        >
          {failure}
        </p>
      ) : null}
      {agency ? <Agency clients={clients} mutation={mutation} /> : null}
      {client ? (
        <ClientAdmin
          audit={audit}
          branches={branches}
          flags={flags}
          integrations={integrations}
          mutation={mutation}
          settings={settings}
          teams={teams}
          users={users}
        />
      ) : null}
    </div>
  );
}

function Agency({
  clients,
  mutation,
}: {
  clients: ReturnType<typeof useQuery<{ client_organizations: Client[] }>>;
  mutation: ReturnType<typeof useMutation<unknown, Error, { path: string; init: RequestInit }>>;
}) {
  const [form, setForm] = useState({
    code: '',
    display_name: '',
    legal_name: '',
    timezone: 'Asia/Kolkata',
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate({ path: '/administration/clients', init: body('POST', form) });
  };
  return (
    <section className="grid gap-5 lg:grid-cols-[1fr_22rem]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-5" />
            Agency client list
          </CardTitle>
          <CardDescription>
            Suspension revokes current client sessions; no data is hard-deleted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {clients.isLoading ? (
            <Skeleton className="h-36 w-full" />
          ) : clients.isError ? (
            <EmptyState description={errorText(clients.error)} title="Clients could not load" />
          ) : clients.data?.client_organizations.length ? (
            clients.data.client_organizations.map((item) => (
              <div
                className="border-border flex flex-wrap justify-between gap-3 rounded-md border p-3"
                key={item.id}
              >
                <span>
                  <b>{item.display_name}</b>
                  <small className="text-muted-foreground block">
                    {item.legal_name} · {item.timezone}
                  </small>
                </span>
                <span className="flex gap-2">
                  <StatusBadge tone={item.status === 'ACTIVE' ? 'success' : 'warning'}>
                    {item.status}
                  </StatusBadge>
                  <Button
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.mutate({
                        path: `/administration/clients/${item.id}/status`,
                        init: body('PATCH', {
                          status: item.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED',
                          reason:
                            item.status === 'SUSPENDED'
                              ? 'Agency restored client access.'
                              : 'Agency suspended client access.',
                        }),
                      })
                    }
                    size="sm"
                    variant="outline"
                  >
                    {item.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
                  </Button>
                </span>
              </div>
            ))
          ) : (
            <EmptyState
              description="Create a dealership to begin its controlled onboarding."
              title="No clients yet"
            />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Create client</CardTitle>
          <CardDescription>
            Clients begin pending with all modules off and integration placeholders disconnected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={submit}>
            <Field
              label="Code"
              value={form.code}
              onChange={(code) => setForm({ ...form, code: code.toUpperCase() })}
            />
            <Field
              label="Display name"
              value={form.display_name}
              onChange={(display_name) => setForm({ ...form, display_name })}
            />
            <Field
              label="Legal name"
              value={form.legal_name}
              onChange={(legal_name) => setForm({ ...form, legal_name })}
            />
            <Field
              label="Timezone"
              value={form.timezone}
              onChange={(timezone) => setForm({ ...form, timezone })}
            />
            <Button className="w-full" disabled={mutation.isPending} type="submit">
              <Plus data-icon="inline-start" />
              Create client
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}

function ClientAdmin({
  branches,
  teams,
  users,
  flags,
  settings,
  integrations,
  audit,
  mutation,
}: {
  branches: ReturnType<typeof useQuery<{ branches: Branch[] }>>;
  teams: ReturnType<typeof useQuery<{ teams: Team[] }>>;
  users: ReturnType<typeof useQuery<{ users: User[] }>>;
  flags: ReturnType<typeof useQuery<{ flags: Flag[] }>>;
  settings: ReturnType<
    typeof useQuery<{ lead_assignment_ready: boolean; retention_policy: Record<string, unknown> }>
  >;
  integrations: ReturnType<
    typeof useQuery<{
      integrations: { integration: string; status: string; detail: string | null }[];
    }>
  >;
  audit: ReturnType<
    typeof useQuery<{
      events: { action: string; entity_type: string; created_at: string; reason: string | null }[];
    }>
  >;
  mutation: ReturnType<typeof useMutation<unknown, Error, { path: string; init: RequestInit }>>;
}) {
  const [branch, setBranch] = useState({ code: '', name: '', timezone: 'Asia/Kolkata' });
  const [team, setTeam] = useState({ branch_id: '', code: '', name: '' });
  const [invite, setInvite] = useState({ display_name: '', email: '', role_code: 'SALESPERSON' });
  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2">
        <Settings2 className="size-5" />
        <h2 className="text-xl font-semibold">Client setup and access</h2>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Branch management and working hours</CardTitle>
            <CardDescription>
              Branch moves are not an edit route, so historical ownership is never silently
              rewritten. Use the API working-hours endpoint for the versioned 7-day schedule.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {branches.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              branches.data?.branches.map((item) => (
                <p className="flex justify-between text-sm" key={item.id}>
                  <span>
                    {item.name} <span className="text-muted-foreground">{item.code}</span>
                  </span>
                  <StatusBadge tone={item.active ? 'success' : 'neutral'}>
                    {item.active ? 'Active' : 'Inactive'}
                  </StatusBadge>
                </p>
              ))
            )}
            <form
              className="grid gap-2 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate({ path: '/administration/branches', init: body('POST', branch) });
              }}
            >
              <Field
                label="Branch code"
                value={branch.code}
                onChange={(code) => setBranch({ ...branch, code })}
              />
              <Field
                label="Branch name"
                value={branch.name}
                onChange={(name) => setBranch({ ...branch, name })}
              />
              <Field
                label="Timezone"
                value={branch.timezone}
                onChange={(timezone) => setBranch({ ...branch, timezone })}
              />
              <Button disabled={mutation.isPending} type="submit">
                Add branch
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Team management</CardTitle>
            <CardDescription>Teams are scoped to an existing branch.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {teams.data?.teams.length ? (
              teams.data.teams.map((item) => (
                <p className="text-sm" key={item.id}>
                  {item.name}{' '}
                  <span className="text-muted-foreground">
                    {item.code} · branch {item.branch_id}
                  </span>
                </p>
              ))
            ) : (
              <EmptyState
                description="Create a branch, then add its first team."
                title="No teams yet"
              />
            )}
            <form
              className="grid gap-2 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate({ path: '/administration/teams', init: body('POST', team) });
              }}
            >
              <Field
                label="Branch ID"
                value={team.branch_id}
                onChange={(branch_id) => setTeam({ ...team, branch_id })}
              />
              <Field
                label="Team code"
                value={team.code}
                onChange={(code) => setTeam({ ...team, code })}
              />
              <Field
                label="Team name"
                value={team.name}
                onChange={(name) => setTeam({ ...team, name })}
              />
              <Button disabled={mutation.isPending} type="submit">
                Add team
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>User directory and invitation</CardTitle>
            <CardDescription>
              Invitation delivery is explicitly unavailable until a provider is approved; the
              pending membership is still created for the existing activation flow.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {users.data?.users.map((item) => (
              <p className="flex justify-between text-sm" key={item.membership_id}>
                <span>
                  <b>{item.display_name}</b>{' '}
                  <span className="text-muted-foreground">
                    {item.email} · {item.role_code}
                  </span>
                </span>
                <StatusBadge tone={item.membership_status === 'ACTIVE' ? 'success' : 'warning'}>
                  {item.membership_status}
                </StatusBadge>
              </p>
            ))}
            <form
              className="grid gap-2 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate({
                  path: '/administration/users/invitations',
                  init: body('POST', {
                    ...invite,
                    branch_scope_mode: 'ALL',
                    branch_ids: [],
                    team_scope_mode: 'NONE',
                    team_ids: [],
                    assignment_scope: 'OWNED_OR_ASSIGNED',
                  }),
                });
              }}
            >
              <Field
                label="Employee name"
                value={invite.display_name}
                onChange={(display_name) => setInvite({ ...invite, display_name })}
              />
              <Field
                label="Email"
                type="email"
                value={invite.email}
                onChange={(email) => setInvite({ ...invite, email })}
              />
              <Field
                label="Role code"
                value={invite.role_code}
                onChange={(role_code) => setInvite({ ...invite, role_code })}
              />
              <Button disabled={mutation.isPending} type="submit">
                <Users data-icon="inline-start" />
                Create invitation
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Module feature flags</CardTitle>
            <CardDescription>
              The backend controls access; this screen merely reflects and changes the enforced
              state.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {flags.isLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : (
              flags.data?.flags.map((item) => (
                <div className="flex items-center justify-between text-sm" key={item.module}>
                  <span>{item.module}</span>
                  <Button
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.mutate({
                        path: `/administration/module-flags/${item.module}`,
                        init: body('PUT', {
                          enabled: !item.enabled,
                          reason: item.enabled
                            ? 'Disabled by Client Admin.'
                            : 'Enabled by Client Admin.',
                        }),
                      })
                    }
                    size="sm"
                    variant="outline"
                  >
                    {item.enabled ? 'Disable' : 'Enable'}
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Lead readiness, retention and integrations</CardTitle>
            <CardDescription>
              Provider configuration is deliberately unavailable in this phase; readiness remains an
              honest placeholder.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({
                  path: '/administration/settings',
                  init: body('PUT', {
                    lead_assignment_ready: !(settings.data?.lead_assignment_ready ?? false),
                    retention_policy: settings.data?.retention_policy ?? {
                      audit_log_days: 365,
                      export_days: 30,
                      recording_days: 180,
                    },
                  }),
                })
              }
              variant="secondary"
            >
              Lead assignment: {settings.data?.lead_assignment_ready ? 'ready' : 'not ready'}
            </Button>
            {integrations.isLoading ? <Skeleton className="h-20 w-full" /> : null}
            {integrations.data?.integrations.map((item) => (
              <p className="text-sm" key={item.integration}>
                {item.integration}
                <span className="text-muted-foreground float-right">{item.status}</span>
              </p>
            ))}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Permission and account audit timeline</CardTitle>
          <CardDescription>
            Role, scope, status and configuration changes retain old/new summaries.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {audit.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : audit.data?.events.length ? (
            audit.data.events.map((item, index) => (
              <p
                className="border-border border-b py-2 text-sm"
                key={`${item.created_at}-${index}`}
              >
                <b>{item.action}</b> · {item.entity_type}
                <span className="text-muted-foreground float-right">
                  {new Date(item.created_at).toLocaleString()}
                </span>
              </p>
            ))
          ) : (
            <EmptyState
              description="New administrative changes will appear here."
              title="No audit events"
            />
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  type?: string;
}) {
  const id = `admin-${label.replaceAll(/[^a-z0-9]/giu, '-').toLowerCase()}`;
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        onChange={(event) => onChange(event.target.value)}
        required
        type={type}
        value={value}
      />
    </div>
  );
}
