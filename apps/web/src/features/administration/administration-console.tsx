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
  department_id: string;
  active: boolean;
}
interface Department {
  id: string;
  branch_id: string;
  code: string;
  name: string;
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
interface WorkingHour {
  closes_at: string | null;
  day_of_week: number;
  is_closed: boolean;
  opens_at: string | null;
}
interface MembershipDetail {
  user: User & {
    assignment_scope: string;
    branch_ids: string[];
    branch_scope_mode: string;
    department_ids: string[];
    department_scope_mode: string;
    job_title: string | null;
    team_ids: string[];
    team_scope_mode: string;
  };
}
interface Hierarchy {
  departments: Department[];
  teams: Team[];
  team_memberships: { id: string; membership_id: string; team_id: string }[];
  team_manager_assignments: {
    id: string;
    manager_membership_id: string;
    team_id: string;
  }[];
  reporting_lines: {
    id: string;
    manager_membership_id: string;
    subordinate_membership_id: string;
  }[];
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
  const hierarchy = useQuery({
    queryKey: ['admin', 'hierarchy'],
    queryFn: () => api<Hierarchy>('/administration/hierarchy'),
    enabled: client,
  });
  const flags = useQuery({
    queryKey: ['admin', 'flags'],
    queryFn: () => api<{ flags: Flag[] }>('/administration/module-flags'),
    enabled: client,
  });
  const profile = useQuery({
    queryKey: ['admin', 'profile'],
    queryFn: () => api<{ client_organization: Client }>('/administration/client-profile'),
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
          hierarchy={hierarchy}
          mutation={mutation}
          profile={profile}
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
  hierarchy,
  audit,
  profile,
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
  hierarchy: ReturnType<typeof useQuery<Hierarchy>>;
  audit: ReturnType<
    typeof useQuery<{
      events: { action: string; entity_type: string; created_at: string; reason: string | null }[];
    }>
  >;
  profile: ReturnType<typeof useQuery<{ client_organization: Client }>>;
  mutation: ReturnType<typeof useMutation<unknown, Error, { path: string; init: RequestInit }>>;
}) {
  const [branch, setBranch] = useState({ code: '', name: '', timezone: 'Asia/Kolkata' });
  const [department, setDepartment] = useState({ branch_id: '', code: '', name: '' });
  const [team, setTeam] = useState({ branch_id: '', department_id: '', code: '', name: '' });
  const [invite, setInvite] = useState({
    display_name: '',
    email: '',
    job_title: 'Sales Consultant',
    role_code: 'SALESPERSON',
  });
  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2">
        <Settings2 className="size-5" />
        <h2 className="text-xl font-semibold">Client setup and access</h2>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <ClientProfile profile={profile} mutation={mutation} />
        <Card>
          <CardHeader>
            <CardTitle>Branch management and working hours</CardTitle>
            <CardDescription>
              Branch moves are not an edit route, so historical ownership is never silently
              rewritten. Select a branch below to maintain its versioned weekly schedule.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {branches.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              branches.data?.branches.map((item) => (
                <div className="flex justify-between gap-2 text-sm" key={item.id}>
                  <span>
                    {item.name} <span className="text-muted-foreground">{item.code}</span>
                  </span>
                  <StatusBadge tone={item.active ? 'success' : 'neutral'}>
                    {item.active ? 'Active' : 'Inactive'}
                  </StatusBadge>
                </div>
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
            <WorkingHoursEditor branches={branches.data?.branches ?? []} mutation={mutation} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Department management</CardTitle>
            <CardDescription>
              Departments sit between a branch and its teams and are enforced by tenant-safe
              relationships.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {hierarchy.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : hierarchy.isError ? (
              <EmptyState
                description={errorText(hierarchy.error)}
                title="Hierarchy could not load"
              />
            ) : hierarchy.data?.departments.length ? (
              hierarchy.data.departments.map((item) => (
                <p className="text-sm" key={item.id}>
                  {item.name}{' '}
                  <span className="text-muted-foreground">
                    {item.code} · branch {item.branch_id}
                  </span>
                </p>
              ))
            ) : (
              <EmptyState
                description="Create a branch, then its first department."
                title="No departments yet"
              />
            )}
            <form
              className="grid gap-2 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate({
                  path: '/administration/departments',
                  init: body('POST', department),
                });
              }}
            >
              <Field
                label="Department branch ID"
                value={department.branch_id}
                onChange={(branch_id) => setDepartment({ ...department, branch_id })}
              />
              <Field
                label="Department code"
                value={department.code}
                onChange={(code) => setDepartment({ ...department, code })}
              />
              <Field
                label="Department name"
                value={department.name}
                onChange={(name) => setDepartment({ ...department, name })}
              />
              <Button disabled={mutation.isPending} type="submit">
                Add department
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Team management</CardTitle>
            <CardDescription>
              Teams are scoped to an existing branch and department.
            </CardDescription>
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
                label="Department ID"
                value={team.department_id}
                onChange={(department_id) => setTeam({ ...team, department_id })}
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
              <div
                className="flex flex-wrap justify-between gap-2 text-sm"
                key={item.membership_id}
              >
                <span>
                  <b>{item.display_name}</b>{' '}
                  <span className="text-muted-foreground">
                    {item.email} · {item.role_code}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge tone={item.membership_status === 'ACTIVE' ? 'success' : 'warning'}>
                    {item.membership_status}
                  </StatusBadge>
                  <Button
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.mutate({
                        path: `/administration/memberships/${item.membership_id}/status`,
                        init: body('PATCH', {
                          status: item.membership_status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                          reason:
                            item.membership_status === 'ACTIVE'
                              ? 'Client Admin suspended access.'
                              : 'Client Admin reactivated access.',
                        }),
                      })
                    }
                    size="sm"
                    variant="outline"
                  >
                    {item.membership_status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
                  </Button>
                </span>
              </div>
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
                    department_scope_mode: 'ALL',
                    department_ids: [],
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
                label="Job title"
                value={invite.job_title}
                onChange={(job_title) => setInvite({ ...invite, job_title })}
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
            <MembershipEditor
              branches={branches.data?.branches ?? []}
              departments={hierarchy.data?.departments ?? []}
              mutation={mutation}
              teams={teams.data?.teams ?? []}
              users={users.data?.users ?? []}
            />
            <HierarchyEditor
              hierarchy={hierarchy.data}
              mutation={mutation}
              users={users.data?.users ?? []}
            />
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

function ClientProfile({
  profile,
  mutation,
}: {
  profile: ReturnType<typeof useQuery<{ client_organization: Client }>>;
  mutation: ReturnType<typeof useMutation<unknown, Error, { path: string; init: RequestInit }>>;
}) {
  const [editedForm, setEditedForm] = useState<{
    display_name: string;
    legal_name: string;
    timezone: string;
  } | null>(null);
  const client = profile.data?.client_organization;
  const form =
    editedForm ??
    (client
      ? {
          display_name: client.display_name,
          legal_name: client.legal_name,
          timezone: client.timezone,
        }
      : { display_name: '', legal_name: '', timezone: '' });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dealership profile</CardTitle>
        <CardDescription>
          Profile changes are tenant-scoped and retain old/new audit values.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {profile.isLoading ? <Skeleton className="h-32 w-full" /> : null}
        {profile.isError ? (
          <EmptyState description={errorText(profile.error)} title="Profile could not load" />
        ) : null}
        {!profile.isLoading && !profile.isError ? (
          <form
            className="grid gap-2 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate({ path: '/administration/client-profile', init: body('PUT', form) });
            }}
          >
            <Field
              label="Dealership name"
              value={form.display_name}
              onChange={(display_name) => setEditedForm({ ...form, display_name })}
            />
            <Field
              label="Legal name"
              value={form.legal_name}
              onChange={(legal_name) => setEditedForm({ ...form, legal_name })}
            />
            <Field
              label="Timezone"
              value={form.timezone}
              onChange={(timezone) => setEditedForm({ ...form, timezone })}
            />
            <Button disabled={mutation.isPending} type="submit">
              Save profile
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const defaultHours: WorkingHour[] = weekdayNames.map((_, day) => ({
  day_of_week: day,
  is_closed: day === 0,
  opens_at: day === 0 ? null : '09:00',
  closes_at: day === 0 ? null : '18:00',
}));

function WorkingHoursEditor({
  branches,
  mutation,
}: {
  branches: Branch[];
  mutation: ReturnType<typeof useMutation<unknown, Error, { path: string; init: RequestInit }>>;
}) {
  const [branchId, setBranchId] = useState('');
  const [editedHours, setEditedHours] = useState<WorkingHour[] | null>(null);
  const workingHours = useQuery({
    queryKey: ['admin', 'working-hours', branchId],
    queryFn: () =>
      api<{ hours: WorkingHour[] }>(`/administration/branches/${branchId}/working-hours`),
    enabled: Boolean(branchId),
  });
  if (!branches.length) return null;
  const hours =
    editedHours ?? (workingHours.data?.hours.length === 7 ? workingHours.data.hours : defaultHours);
  const updateHour = (day: number, value: Partial<WorkingHour>) =>
    setEditedHours(hours.map((hour) => (hour.day_of_week === day ? { ...hour, ...value } : hour)));
  return (
    <div className="border-border space-y-3 rounded-md border p-3">
      <Label htmlFor="working-hours-branch">Working hours branch</Label>
      <select
        className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
        id="working-hours-branch"
        onChange={(event) => {
          setBranchId(event.target.value);
          setEditedHours(null);
        }}
        value={branchId}
      >
        <option value="">Select a branch</option>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
      {workingHours.isError ? (
        <p className="text-destructive text-sm" role="alert">
          {errorText(workingHours.error)}
        </p>
      ) : null}
      {branchId ? (
        <div className="space-y-2">
          {hours.map((hour) => (
            <div
              className="grid grid-cols-[6rem_1fr_1fr_auto] items-end gap-2"
              key={hour.day_of_week}
            >
              <span className="pb-2 text-sm">{weekdayNames[hour.day_of_week]}</span>
              <Field
                label="Opens"
                type="time"
                value={hour.opens_at ?? ''}
                onChange={(opens_at) => updateHour(hour.day_of_week, { opens_at })}
              />
              <Field
                label="Closes"
                type="time"
                value={hour.closes_at ?? ''}
                onChange={(closes_at) => updateHour(hour.day_of_week, { closes_at })}
              />
              <Button
                onClick={() =>
                  updateHour(hour.day_of_week, {
                    is_closed: !hour.is_closed,
                    opens_at: hour.is_closed ? '09:00' : null,
                    closes_at: hour.is_closed ? '18:00' : null,
                  })
                }
                size="sm"
                type="button"
                variant={hour.is_closed ? 'secondary' : 'outline'}
              >
                {hour.is_closed ? 'Closed' : 'Open'}
              </Button>
            </div>
          ))}
          <Button
            disabled={mutation.isPending || workingHours.isLoading}
            onClick={() =>
              mutation.mutate({
                path: `/administration/branches/${branchId}/working-hours`,
                init: body('PUT', {
                  hours: hours.map((hour) => ({
                    ...hour,
                    opens_at: hour.is_closed ? null : hour.opens_at,
                    closes_at: hour.is_closed ? null : hour.closes_at,
                  })),
                }),
              })
            }
            type="button"
          >
            Save working hours
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function HierarchyEditor({
  hierarchy,
  users,
  mutation,
}: {
  hierarchy: Hierarchy | undefined;
  users: User[];
  mutation: ReturnType<typeof useMutation<unknown, Error, { path: string; init: RequestInit }>>;
}) {
  const [teamMember, setTeamMember] = useState({ membership_id: '', reason: '', team_id: '' });
  const [teamManager, setTeamManager] = useState({
    manager_membership_id: '',
    reason: '',
    team_id: '',
  });
  const [reporting, setReporting] = useState({
    manager_membership_id: '',
    reason: '',
    subordinate_membership_id: '',
  });
  if (!hierarchy) return <Skeleton className="h-32 w-full" />;
  return (
    <div className="border-border space-y-4 rounded-md border p-3">
      <div>
        <Label>Team and reporting hierarchy</Label>
        <p className="text-muted-foreground mt-1 text-xs">
          Every assignment requires a reason. Replacements preserve the previous relationship.
        </p>
      </div>
      {hierarchy.team_memberships.length ? (
        hierarchy.team_memberships.map((item) => (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs" key={item.id}>
            <span>
              Member {item.membership_id} · team {item.team_id}
            </span>
            <Button
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({
                  path: `/administration/team-memberships/${item.id}/end`,
                  init: body('PATCH', {
                    reason: 'Removed through the hierarchy administration screen.',
                  }),
                })
              }
              size="sm"
              type="button"
              variant="outline"
            >
              End membership
            </Button>
          </div>
        ))
      ) : (
        <p className="text-muted-foreground text-xs">No active team memberships.</p>
      )}
      <form
        className="grid gap-2 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate({
            path: `/administration/teams/${teamMember.team_id}/members`,
            init: body('POST', {
              membership_id: teamMember.membership_id,
              reason: teamMember.reason,
            }),
          });
        }}
      >
        <HierarchySelect
          label="Team for member"
          onChange={(team_id) => setTeamMember({ ...teamMember, team_id })}
          options={hierarchy.teams.map((item) => ({ label: item.name, value: item.id }))}
          value={teamMember.team_id}
        />
        <HierarchySelect
          label="Member"
          onChange={(membership_id) => setTeamMember({ ...teamMember, membership_id })}
          options={users.map((item) => ({ label: item.display_name, value: item.membership_id }))}
          value={teamMember.membership_id}
        />
        <Field
          label="Team membership reason"
          onChange={(reason) => setTeamMember({ ...teamMember, reason })}
          value={teamMember.reason}
        />
        <Button disabled={mutation.isPending} type="submit">
          Assign team member
        </Button>
      </form>
      <form
        className="grid gap-2 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate({
            path: `/administration/teams/${teamManager.team_id}/manager`,
            init: body('PUT', {
              manager_membership_id: teamManager.manager_membership_id,
              reason: teamManager.reason,
            }),
          });
        }}
      >
        <HierarchySelect
          label="Managed team"
          onChange={(team_id) => setTeamManager({ ...teamManager, team_id })}
          options={hierarchy.teams.map((item) => ({ label: item.name, value: item.id }))}
          value={teamManager.team_id}
        />
        <HierarchySelect
          label="Team Manager"
          onChange={(manager_membership_id) =>
            setTeamManager({ ...teamManager, manager_membership_id })
          }
          options={users
            .filter((item) => item.role_code === 'TEAM_MANAGER')
            .map((item) => ({ label: item.display_name, value: item.membership_id }))}
          value={teamManager.manager_membership_id}
        />
        <Field
          label="Manager replacement reason"
          onChange={(reason) => setTeamManager({ ...teamManager, reason })}
          value={teamManager.reason}
        />
        <Button disabled={mutation.isPending} type="submit">
          Set Team Manager
        </Button>
      </form>
      <form
        className="grid gap-2 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate({
            path: `/administration/memberships/${reporting.subordinate_membership_id}/reporting-manager`,
            init: body('PUT', {
              manager_membership_id: reporting.manager_membership_id,
              reason: reporting.reason,
            }),
          });
        }}
      >
        <HierarchySelect
          label="Reporting employee"
          onChange={(subordinate_membership_id) =>
            setReporting({ ...reporting, subordinate_membership_id })
          }
          options={users.map((item) => ({ label: item.display_name, value: item.membership_id }))}
          value={reporting.subordinate_membership_id}
        />
        <HierarchySelect
          label="Reporting manager"
          onChange={(manager_membership_id) =>
            setReporting({ ...reporting, manager_membership_id })
          }
          options={users.map((item) => ({ label: item.display_name, value: item.membership_id }))}
          value={reporting.manager_membership_id}
        />
        <Field
          label="Reporting change reason"
          onChange={(reason) => setReporting({ ...reporting, reason })}
          value={reporting.reason}
        />
        <Button disabled={mutation.isPending} type="submit">
          Set reporting manager
        </Button>
      </form>
    </div>
  );
}

function HierarchySelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange(value: string): void;
  options: { label: string; value: string }[];
  value: string;
}) {
  const id = `admin-${label.replaceAll(/[^a-z0-9]/giu, '-').toLowerCase()}`;
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <select
        className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        required
        value={value}
      >
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function MembershipEditor({
  branches,
  departments,
  teams,
  users,
  mutation,
}: {
  branches: Branch[];
  departments: Department[];
  teams: Team[];
  users: User[];
  mutation: ReturnType<typeof useMutation<unknown, Error, { path: string; init: RequestInit }>>;
}) {
  const [membershipId, setMembershipId] = useState('');
  const detail = useQuery({
    queryKey: ['admin', 'membership', membershipId],
    queryFn: () => api<MembershipDetail>(`/administration/memberships/${membershipId}`),
    enabled: Boolean(membershipId),
  });
  const [editedForm, setEditedForm] = useState<{
    assignment_scope: string;
    branch_ids: string;
    branch_scope_mode: string;
    department_ids: string;
    department_scope_mode: string;
    job_title: string;
    role_code: string;
    team_ids: string;
    team_scope_mode: string;
  } | null>(null);
  const detailUser = detail.data?.user;
  const form =
    editedForm ??
    (detailUser
      ? {
          assignment_scope: detailUser.assignment_scope,
          branch_ids: detailUser.branch_ids.join(', '),
          branch_scope_mode: detailUser.branch_scope_mode,
          department_ids: detailUser.department_ids.join(', '),
          department_scope_mode: detailUser.department_scope_mode,
          job_title: detailUser.job_title ?? '',
          role_code: detailUser.role_code,
          team_ids: detailUser.team_ids.join(', '),
          team_scope_mode: detailUser.team_scope_mode,
        }
      : {
          assignment_scope: 'OWNED_OR_ASSIGNED',
          branch_ids: '',
          branch_scope_mode: 'ALL',
          department_ids: '',
          department_scope_mode: 'ALL',
          job_title: '',
          role_code: '',
          team_ids: '',
          team_scope_mode: 'NONE',
        });
  const ids = (value: string) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  return (
    <div className="border-border space-y-3 rounded-md border p-3">
      <Label htmlFor="membership-editor">Role and scope assignment</Label>
      <select
        className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
        id="membership-editor"
        onChange={(event) => {
          setMembershipId(event.target.value);
          setEditedForm(null);
        }}
        value={membershipId}
      >
        <option value="">Select an employee</option>
        {users.map((user) => (
          <option key={user.membership_id} value={user.membership_id}>
            {user.display_name} ({user.role_code})
          </option>
        ))}
      </select>
      {membershipId && detail.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {detail.isError ? (
        <p className="text-destructive text-sm" role="alert">
          {errorText(detail.error)}
        </p>
      ) : null}
      {detail.data ? (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({
              path: `/administration/memberships/${membershipId}`,
              init: body('PUT', {
                ...form,
                branch_ids: ids(form.branch_ids),
                department_ids: ids(form.department_ids),
                job_title: form.job_title.trim() || null,
                team_ids: ids(form.team_ids),
              }),
            });
          }}
        >
          <Field
            label="Job title"
            value={form.job_title}
            onChange={(job_title) => setEditedForm({ ...form, job_title })}
          />
          <p className="text-muted-foreground text-xs">
            Available departments:{' '}
            {departments.map((item) => `${item.name} (${item.id})`).join(', ') || 'none'}
          </p>
          <Field
            label="Department scope mode (ALL, SELECTED, NONE)"
            value={form.department_scope_mode}
            onChange={(department_scope_mode) => setEditedForm({ ...form, department_scope_mode })}
          />
          <Field
            label="Selected department IDs (comma separated)"
            value={form.department_ids}
            onChange={(department_ids) => setEditedForm({ ...form, department_ids })}
          />
          <Field
            label="Role code"
            value={form.role_code}
            onChange={(role_code) => setEditedForm({ ...form, role_code })}
          />
          <p className="text-muted-foreground text-xs">
            Available branches:{' '}
            {branches.map((branch) => `${branch.name} (${branch.id})`).join(', ') || 'none'}
          </p>
          <Field
            label="Branch scope mode (ALL, SELECTED, NONE)"
            value={form.branch_scope_mode}
            onChange={(branch_scope_mode) => setEditedForm({ ...form, branch_scope_mode })}
          />
          <Field
            label="Selected branch IDs (comma separated)"
            value={form.branch_ids}
            onChange={(branch_ids) => setEditedForm({ ...form, branch_ids })}
          />
          <p className="text-muted-foreground text-xs">
            Available teams: {teams.map((team) => `${team.name} (${team.id})`).join(', ') || 'none'}
          </p>
          <Field
            label="Team scope mode (ALL, SELECTED, NONE)"
            value={form.team_scope_mode}
            onChange={(team_scope_mode) => setEditedForm({ ...form, team_scope_mode })}
          />
          <Field
            label="Selected team IDs (comma separated)"
            value={form.team_ids}
            onChange={(team_ids) => setEditedForm({ ...form, team_ids })}
          />
          <Field
            label="Assignment scope (ALL, OWNED_OR_ASSIGNED, NONE)"
            value={form.assignment_scope}
            onChange={(assignment_scope) => setEditedForm({ ...form, assignment_scope })}
          />
          <Button disabled={mutation.isPending} type="submit">
            Save role and scopes
          </Button>
        </form>
      ) : null}
    </div>
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
