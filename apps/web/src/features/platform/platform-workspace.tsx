'use client';

import type { AnalyticsPlatformResponse } from '@gdm/contracts';
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
import { Input } from '@gdm/ui/components/input';
import { Label } from '@gdm/ui/components/label';
import { Skeleton } from '@gdm/ui/components/skeleton';
import { StatusBadge } from '@gdm/ui/components/status-badge';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleDashed,
  Clock3,
  KeyRound,
  LockKeyhole,
  PlugZap,
  Plus,
  RefreshCw,
  Server,
  Settings2,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, type ReactNode, useMemo, useState } from 'react';

import { SearchableVirtualTable } from '@/components/searchable-virtual-table';
import { fetchApiHealth } from '@/lib/api-health';
import { useAuth } from '@/features/auth/auth-provider';
import { hasPermission } from '@/features/auth/auth-types';
import { AnalyticsChart } from '@/features/analytics/analytics-chart';
import { SupportElevationControl } from '@/features/tenancy/support-elevation';

import { PlatformLeadTrendChart } from './platform-lead-trend-chart';

type PlatformPage =
  | 'api-health'
  | 'clients'
  | 'integrations'
  | 'onboarding'
  | 'overview'
  | 'security'
  | 'settings'
  | 'support'
  | 'users';

interface ClientOrganization {
  code: string;
  display_name: string;
  id: string;
  status: string;
  timezone: string;
}

export function PlatformWorkspace({ page }: { page: PlatformPage }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const platform =
    auth.session?.currentMembership?.roleCode === 'AGENCY_ADMIN' &&
    auth.session.supportElevation === null;
  const canReadClients =
    auth.session !== null && hasPermission(auth.session, 'organization.clients.read');
  const clients = useQuery({
    queryKey: ['platform', 'clients'],
    queryFn: () => auth.api.request<{ client_organizations: ClientOrganization[] }>('/clients'),
    enabled: platform && canReadClients,
  });
  const clientLifecycle = useMutation({
    mutationFn: ({ path, init }: { path: string; init: RequestInit }) =>
      auth.api.request(path, init),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['platform', 'clients'] }),
  });
  const range = useMemo(() => last30Days(), []);
  const overviewAnalytics = useQuery({
    queryKey: ['platform', 'overview-analytics', range.from, range.to],
    queryFn: () =>
      auth.api.request<AnalyticsPlatformResponse>(
        `/analytics/platform?from=${range.from}&to=${range.to}&timezone=${encodeURIComponent(range.timezone)}&compare=PREVIOUS_PERIOD`,
      ),
    enabled: platform && page === 'overview',
  });

  if (!platform) {
    return (
      <Alert variant="destructive">
        <LockKeyhole aria-hidden="true" />
        <AlertTitle>Platform workspace required</AlertTitle>
        <AlertDescription>
          End client support access or use an Agency Admin account.
        </AlertDescription>
      </Alert>
    );
  }

  const organizations = clients.data?.client_organizations ?? [];
  const active = organizations.filter((client) => client.status === 'ACTIVE');
  const pending = organizations.filter((client) => client.status === 'PENDING');
  const suspended = organizations.filter((client) => client.status === 'SUSPENDED');

  return (
    <div className="space-y-6">
      {clients.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Platform data could not be loaded</AlertTitle>
          <AlertDescription>
            {clients.error instanceof Error ? clients.error.message : 'Try again shortly.'}
          </AlertDescription>
        </Alert>
      ) : null}

      {page === 'overview' ? (
        <Overview
          active={active.length}
          analyticsError={overviewAnalytics.isError}
          analyticsLoading={overviewAnalytics.isLoading}
          leadTrend={overviewAnalytics.data?.lead_trend ?? null}
          loading={clients.isLoading}
          pending={pending.length}
          series={overviewAnalytics.data?.series ?? []}
          suspended={suspended.length}
        />
      ) : null}
      {page === 'clients' ? (
        <Clients clients={organizations} loading={clients.isLoading} mutation={clientLifecycle} />
      ) : null}
      {page === 'onboarding' ? <Onboarding clients={pending} loading={clients.isLoading} /> : null}
      {page === 'integrations' ? <Integrations /> : null}
      {page === 'api-health' ? <ApiHealth /> : null}
      {page === 'support' ? <Support /> : null}
      {page === 'users' ? <PlatformUsers /> : null}
      {page === 'security' ? <Security /> : null}
      {page === 'settings' ? <Settings /> : null}
    </div>
  );
}

function Overview(props: {
  active: number;
  analyticsError: boolean;
  analyticsLoading: boolean;
  leadTrend: AnalyticsPlatformResponse['lead_trend'] | null;
  loading: boolean;
  pending: number;
  series: AnalyticsPlatformResponse['series'];
  suspended: number;
}) {
  return (
    <>
      <section
        aria-label="Current platform attention"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <Stat
          icon={<Building2 />}
          label="Active clients"
          loading={props.loading}
          value={props.active}
        />
        <Stat
          icon={<Clock3 />}
          label="Awaiting activation"
          loading={props.loading}
          value={props.pending}
        />
        <Stat
          icon={<LockKeyhole />}
          label="Suspended clients"
          loading={props.loading}
          value={props.suspended}
        />
        <Stat icon={<Activity />} label="API connection" value="Available" />
      </section>
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Trends</h2>
            <p className="text-muted-foreground text-sm">Last 30 days across all clients.</p>
          </div>
          <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} href="/analytics">
            Open full analytics <ArrowRight />
          </Link>
        </div>
        {props.analyticsError ? (
          <Alert variant="destructive">
            <AlertTitle>Trends could not be loaded</AlertTitle>
            <AlertDescription>Try again shortly.</AlertDescription>
          </Alert>
        ) : props.analyticsLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        ) : props.series.length === 0 ? (
          <Boundary title="No trend data for this period">
            Client activity for the last 30 days has not produced any chartable data yet.
          </Boundary>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {props.series.map((series) => (
              <Card key={series.code}>
                <CardHeader>
                  <CardTitle className="text-base">{series.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <AnalyticsChart series={series} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {!props.analyticsLoading && !props.analyticsError && props.leadTrend ? (
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">Leads received</CardTitle>
                <CardDescription>Daily volume by client for the selected period.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-6">
                {props.leadTrend.series.map((line) => (
                  <div key={line.client_id}>
                    <p className="text-muted-foreground text-xs">{line.client_name}</p>
                    <p className="text-lg font-semibold">
                      {line.values.reduce((total, value) => total + value, 0)}
                    </p>
                  </div>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <PlatformLeadTrendChart trend={props.leadTrend} />
            </CardContent>
          </Card>
        ) : null}
      </section>
      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Work areas</h2>
          <p className="text-muted-foreground text-sm">
            Each area has a distinct operational purpose.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Action href="/platform/onboarding" icon={<CircleDashed />} title="Continue onboarding">
            Review clients that are not live.
          </Action>
          <Action href="/platform/support" icon={<ShieldCheck />} title="Start support access">
            Open a reasoned, time-limited tenant session.
          </Action>
          <Action href="/platform/integrations" icon={<PlugZap />} title="Integration readiness">
            Review currently available health boundaries.
          </Action>
          <Action href="/platform/users" icon={<UserCog />} title="Platform identities">
            Review agency-user capability status.
          </Action>
          <Action href="/platform/security" icon={<KeyRound />} title="Security & audit">
            Open security controls without client data.
          </Action>
          <Action href="/analytics" icon={<Activity />} title="Platform analytics">
            Open trends and period comparisons.
          </Action>
        </div>
      </section>
    </>
  );
}

type ClientMutation = ReturnType<
  typeof useMutation<unknown, Error, { path: string; init: RequestInit }>
>;

function Clients({
  clients,
  loading,
  mutation,
}: {
  clients: ClientOrganization[];
  loading: boolean;
  mutation: ClientMutation;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Client directory</h2>
          <p className="text-muted-foreground text-sm">Live platform-owned organization records.</p>
        </div>
        <CreateClientDialog mutation={mutation} />
      </div>
      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <SearchableVirtualTable
          columns={clientColumns(mutation)}
          emptyMessage="No clients match this search."
          getKey={(client) => client.id}
          getSearchText={(client) =>
            `${client.display_name} ${client.code} ${client.status} ${client.timezone}`
          }
          items={clients}
          searchPlaceholder="Search clients"
        />
      )}
    </section>
  );
}

function CreateClientDialog({ mutation }: { mutation: ClientMutation }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: '',
    display_name: '',
    legal_name: '',
    timezone: 'Asia/Kolkata',
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate(
      {
        init: {
          body: JSON.stringify(form),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
        path: '/administration/clients',
      },
      {
        onSuccess: () => {
          setOpen(false);
          setForm({ code: '', display_name: '', legal_name: '', timezone: 'Asia/Kolkata' });
        },
      },
    );
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger className={buttonVariants()}>
        <Plus data-icon="inline-start" />
        Add client
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create client</DialogTitle>
          <DialogDescription>
            Creates the company in Pending setup. Activate it, start support access, then invite its
            Client Admin by name and email.
          </DialogDescription>
        </DialogHeader>
        <form className="mt-4 space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="client-code">Code</Label>
            <Input
              id="client-code"
              onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
              required
              value={form.code}
            />
            <p className="text-muted-foreground text-xs leading-5">
              A short internal reference unique within this agency (e.g. HRTG). It isn’t used for
              sign-in, doesn’t affect whether the client is live, and can’t be changed here later.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-display-name">Display name</Label>
            <Input
              id="client-display-name"
              onChange={(event) => setForm({ ...form, display_name: event.target.value })}
              required
              value={form.display_name}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-legal-name">Legal name</Label>
            <Input
              id="client-legal-name"
              onChange={(event) => setForm({ ...form, legal_name: event.target.value })}
              required
              value={form.legal_name}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-timezone">Timezone</Label>
            <Input
              id="client-timezone"
              onChange={(event) => setForm({ ...form, timezone: event.target.value })}
              required
              value={form.timezone}
            />
          </div>
          {mutation.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Client could not be created</AlertTitle>
              <AlertDescription>
                {mutation.error instanceof Error ? mutation.error.message : 'Try again.'}
              </AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button onClick={() => setOpen(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={mutation.isPending} type="submit">
              <Plus data-icon="inline-start" />
              Create client
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function clientColumns(mutation: ClientMutation) {
  return [
    {
      header: 'Client',
      id: 'client',
      render: (client: ClientOrganization) => (
        <span className="font-medium">{client.display_name}</span>
      ),
    },
    {
      header: 'Code',
      id: 'code',
      render: (client: ClientOrganization) => (
        <span className="text-muted-foreground">{client.code}</span>
      ),
    },
    {
      header: 'Timezone',
      id: 'timezone',
      render: (client: ClientOrganization) => client.timezone,
    },
    {
      className: 'text-right',
      header: 'Status',
      id: 'status',
      render: (client: ClientOrganization) => (
        <span className="flex items-center justify-end gap-2">
          <Badge variant="outline">{client.status}</Badge>
          <Button
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({
                init: {
                  body: JSON.stringify({
                    reason:
                      client.status === 'PENDING'
                        ? 'Agency approved the client for onboarding.'
                        : client.status === 'SUSPENDED'
                          ? 'Agency restored client access.'
                          : 'Agency suspended client access.',
                    status: client.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                  }),
                  headers: { 'content-type': 'application/json' },
                  method: 'PATCH',
                },
                path: `/administration/clients/${client.id}/status`,
              })
            }
            size="sm"
            variant="outline"
          >
            {client.status === 'PENDING'
              ? 'Activate'
              : client.status === 'SUSPENDED'
                ? 'Reactivate'
                : 'Suspend'}
          </Button>
        </span>
      ),
    },
  ];
}

function Onboarding({ clients, loading }: { clients: ClientOrganization[]; loading: boolean }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Clients awaiting activation</h2>
      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : clients.length === 0 ? (
        <Boundary title="Onboarding queue is clear">
          There are no clients in Pending state.
        </Boundary>
      ) : (
        clients.map((client) => (
          <Card key={client.id}>
            <CardHeader>
              <CardTitle className="text-base">{client.display_name}</CardTitle>
              <CardDescription>
                Created but not live. Complete tenant configuration through audited support access,
                then activate from the client directory.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Badge variant="secondary">Pending</Badge>
              <Link
                className={buttonVariants({ size: 'sm', variant: 'outline' })}
                href="/platform/support"
              >
                Start support access
              </Link>
              <Link className={buttonVariants({ size: 'sm' })} href="/platform/clients">
                Open lifecycle controls
              </Link>
            </CardContent>
          </Card>
        ))
      )}
    </section>
  );
}

interface ProviderHealth {
  display_name: string;
  failure_summary: string | null;
  last_failure_at: string | null;
  last_success_at: string | null;
  provider: string;
  status: string;
  webhook_state: string;
}
interface ClientHealth {
  client_id: string;
  client_name: string;
  client_status: string;
  health: string;
  providers: ProviderHealth[];
}

function Integrations() {
  const { api } = useAuth();
  const [selected, setSelected] = useState<ClientHealth | null>(null);
  const query = useQuery({
    queryKey: ['platform', 'integration-health'],
    queryFn: () =>
      api.request<{ clients: ClientHealth[]; generated_at: string }>(
        '/administration/platform/integration-health',
      ),
    refetchInterval: 60_000,
  });
  const columns = useMemo(
    () => [
      {
        header: 'Client',
        id: 'client',
        render: (client: ClientHealth) => <span className="font-medium">{client.client_name}</span>,
      },
      {
        header: 'Providers',
        id: 'providers',
        render: (client: ClientHealth) => client.providers.length,
      },
      {
        header: 'Health',
        id: 'health',
        render: (client: ClientHealth) => (
          <StatusBadge tone={healthTone(client.health)}>{client.health}</StatusBadge>
        ),
      },
      {
        className: 'text-right',
        header: 'Details',
        id: 'details',
        render: (client: ClientHealth) => (
          <Button onClick={() => setSelected(client)} size="sm" variant="outline">
            View providers
          </Button>
        ),
      },
    ],
    [],
  );
  return (
    <div className="space-y-4">
      {query.isLoading ? <Skeleton className="h-72 w-full" /> : null}
      {query.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Integration health unavailable</AlertTitle>
          <AlertDescription>{query.error.message}</AlertDescription>
        </Alert>
      ) : null}
      {query.data ? (
        <SearchableVirtualTable
          columns={columns}
          emptyMessage="No clients match this search."
          getKey={(client) => client.client_id}
          getSearchText={(client) =>
            `${client.client_name} ${client.client_status} ${client.health} ${client.providers.map((provider) => provider.provider).join(' ')}`
          }
          items={query.data.clients}
          searchPlaceholder="Search clients or providers"
        />
      ) : null}
      {selected ? (
        <Card>
          <CardHeader>
            <CardTitle>{selected.client_name} providers</CardTitle>
            <CardDescription>
              Sanitized operational state; credentials are never returned.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selected.providers.length === 0 ? (
              <p className="text-muted-foreground text-sm">No providers are configured.</p>
            ) : (
              <div className="divide-y rounded-lg border">
                {selected.providers.map((provider) => (
                  <div className="grid gap-2 p-4 md:grid-cols-[1fr_auto]" key={provider.provider}>
                    <div>
                      <p className="font-medium">{provider.display_name}</p>
                      <p className="text-muted-foreground text-sm">
                        {provider.provider} · webhook {provider.webhook_state}
                      </p>
                      {provider.failure_summary ? (
                        <p className="mt-2 text-sm text-red-700">{provider.failure_summary}</p>
                      ) : null}
                    </div>
                    <StatusBadge tone={healthTone(provider.status)}>{provider.status}</StatusBadge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ApiHealth() {
  const query = useQuery({
    queryFn: ({ signal }) => fetchApiHealth(signal),
    queryKey: ['api-health'],
    refetchInterval: 30_000,
  });
  const rows = query.data
    ? [{ name: 'NestJS API', status: query.data.status }, ...query.data.checks]
    : [];
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button disabled={query.isFetching} onClick={() => void query.refetch()} variant="outline">
          <RefreshCw className={query.isFetching ? 'animate-spin' : undefined} />
          Refresh health
        </Button>
      </div>
      {query.isLoading ? <Skeleton className="h-64 w-full" /> : null}
      {query.isError ? (
        <Alert variant="destructive">
          <Server />
          <AlertTitle>Backend API unavailable</AlertTitle>
          <AlertDescription>{query.error.message}</AlertDescription>
        </Alert>
      ) : null}
      {query.data ? (
        <div className="bg-card overflow-x-auto rounded-xl border">
          <div className="bg-muted/35 text-muted-foreground grid min-w-[42rem] grid-cols-[1fr_10rem_12rem] border-b px-4 py-3 text-xs font-semibold uppercase">
            <span>Service check</span>
            <span>Status</span>
            <span>Last checked</span>
          </div>
          {rows.map((row) => (
            <div
              className="grid min-w-[42rem] grid-cols-[1fr_10rem_12rem] items-center border-b px-4 py-4 text-sm last:border-0"
              key={row.name}
            >
              <span className="font-medium">{row.name}</span>
              <StatusBadge tone={healthTone(row.status)}>{row.status}</StatusBadge>
              <span className="text-muted-foreground">
                {new Date(query.data.checkedAt).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <p className="text-muted-foreground text-xs">
        The API process and reported dependencies are monitored. Protected business routes are not
        invoked as synthetic checks.
      </p>
    </div>
  );
}

function healthTone(status: string): 'danger' | 'neutral' | 'success' | 'warning' {
  const value = status.toUpperCase();
  if (['ACTIVE', 'HEALTHY', 'OK', 'READY', 'UP'].includes(value)) return 'success';
  if (['DEGRADED', 'DOWN', 'ERROR', 'FAILED', 'DISCONNECTED', 'UNHEALTHY'].includes(value))
    return 'danger';
  if (['PENDING', 'PENDING_APPROVAL'].includes(value)) return 'warning';
  return 'neutral';
}
function Support() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Start temporary client access</CardTitle>
        <CardDescription>
          The existing control requires a reason, grants short-lived access and exposes the active
          support state.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-w-sm">
          <SupportElevationControl />
        </div>
      </CardContent>
    </Card>
  );
}
function PlatformUsers() {
  return (
    <Boundary icon={<Users />} title="Agency user directory is not exposed yet">
      Current APIs manage dealership users only inside a tenant. A platform-user contract,
      permission policy and immutable audit events are required before this page can safely list or
      modify agency identities.
    </Boundary>
  );
}
function Security() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Action href="/sessions" icon={<ShieldCheck />} title="My active sessions">
        Review and revoke devices for the signed-in account.
      </Action>
      <Action href="/profile/authentication" icon={<KeyRound />} title="Authentication methods">
        Manage MFA and connected sign-in methods.
      </Action>
      <Boundary icon={<LockKeyhole />} title="Cross-client audit remains protected">
        Tenant audit events are available only after entering that tenant through audited support
        access.
      </Boundary>
    </div>
  );
}
function Settings() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Action href="/profile" icon={<UserCog />} title="My profile">
        Update the signed-in administrator profile.
      </Action>
      <Action href="/profile/authentication" icon={<KeyRound />} title="Account security">
        Manage authentication methods and MFA.
      </Action>
      <Boundary icon={<Settings2 />} title="Agency policy settings need contracts">
        No platform-settings endpoint exists yet, so retention, branding and provider defaults are
        not presented as saved configuration.
      </Boundary>
    </div>
  );
}

function last30Days(): { from: string; timezone: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
  const iso = (value: Date) =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  return {
    from: iso(from),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
    to: iso(now),
  };
}

function Stat({
  icon,
  label,
  loading = false,
  value,
}: {
  icon: ReactNode;
  label: string;
  loading?: boolean;
  value: number | string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <span className="text-primary [&_svg]:size-5">{icon}</span>
        <div>
          <p className="text-muted-foreground text-sm">{label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-16" />
          ) : (
            <p className="text-2xl font-semibold">{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
function Action({
  children,
  href,
  icon,
  title,
}: {
  children: ReactNode;
  href: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <Link
      className="focus-visible:ring-ring group rounded-xl outline-none focus-visible:ring-2"
      href={href}
    >
      <Card className="group-hover:border-primary/40 h-full transition-colors">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="text-primary [&_svg]:size-5">{icon}</span>
            {title}
            <ArrowRight className="ml-auto size-4" />
          </CardTitle>
          <CardDescription>{children}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}
function Boundary({
  children,
  icon = <CheckCircle2 />,
  title,
}: {
  children: ReactNode;
  icon?: ReactNode;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="text-primary [&_svg]:size-5">{icon}</span>
          {title}
        </CardTitle>
        <CardDescription>{children}</CardDescription>
      </CardHeader>
    </Card>
  );
}
