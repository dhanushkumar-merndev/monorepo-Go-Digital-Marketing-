'use client';

import type {
  AnalyticsMetric,
  AnalyticsOverviewResponse,
  AnalyticsPlatformResponse,
  BranchListResponse,
  TeamListResponse,
  TenantUserListResponse,
} from '@gdm/contracts';
import { Alert, AlertDescription, AlertTitle } from '@gdm/ui/components/alert';
import { Badge } from '@gdm/ui/components/badge';
import { Button } from '@gdm/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gdm/ui/components/card';
import { EmptyState } from '@gdm/ui/components/empty-state';
import { Input } from '@gdm/ui/components/input';
import { Label } from '@gdm/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@gdm/ui/components/select';
import { Skeleton } from '@gdm/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@gdm/ui/components/table';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Clock3, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/features/auth/auth-provider';
import { hasPermission } from '@/features/auth/auth-types';
import { AnalyticsChart } from './analytics-chart';
import { useDebouncedValue } from './use-debounced-value';

type Preset = '7D' | '30D' | 'MTD' | 'CUSTOM';

export function AnalyticsWorkspace({ compact = false }: { compact?: boolean }) {
  const { api, session } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const platform =
    session?.currentMembership?.roleCode === 'AGENCY_ADMIN' && session.supportElevation === null;
  const canFilterBranches =
    session !== null && !platform && hasPermission(session, 'organization.branches.read');
  const canFilterTeams =
    session !== null && !platform && hasPermission(session, 'organization.teams.read');
  const canFilterUsers =
    session !== null && !platform && hasPermission(session, 'organization.users.read');
  const defaults = useMemo(() => presetRange('30D'), []);
  const from = search.get('from') ?? defaults.from;
  const to = search.get('to') ?? defaults.to;
  const compare = search.get('compare') ?? 'PREVIOUS_PERIOD';
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  const [model, setModel] = useState(search.get('model') ?? '');
  const [channel, setChannel] = useState(search.get('channel') ?? '');
  const debouncedModel = useDebouncedValue(model);
  const debouncedChannel = useDebouncedValue(channel);

  const setParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(search.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  useEffect(() => {
    if (debouncedModel !== (search.get('model') ?? ''))
      setParams({ model: debouncedModel || null });
    // setParams intentionally derives the latest URL values from the active search snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedModel]);
  useEffect(() => {
    if (debouncedChannel !== (search.get('channel') ?? ''))
      setParams({ channel: debouncedChannel || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedChannel]);

  const query = useMemo(() => {
    const value = new URLSearchParams({ compare, from, timezone, to });
    if (!platform) {
      for (const key of [
        'branch_id',
        'department_id',
        'team_id',
        'user_id',
        'source',
        'model',
        'channel',
      ]) {
        const filter = search.get(key);
        if (filter) value.set(key, filter);
      }
    }
    return value.toString();
  }, [compare, from, platform, search, timezone, to]);
  const analytics = useQuery({
    queryKey: ['analytics', platform ? 'platform' : 'overview', query],
    queryFn: () =>
      api.request<AnalyticsOverviewResponse | AnalyticsPlatformResponse>(
        `/analytics/${platform ? 'platform' : 'overview'}?${query}`,
      ),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const branches = useQuery({
    queryKey: ['analytics', 'filter-options', 'branches'],
    queryFn: () => api.request<BranchListResponse>('/branches'),
    enabled: canFilterBranches,
    staleTime: 60_000,
  });
  const teams = useQuery({
    queryKey: ['analytics', 'filter-options', 'teams'],
    queryFn: () => api.request<TeamListResponse>('/teams'),
    enabled: canFilterTeams,
    staleTime: 60_000,
  });
  const users = useQuery({
    queryKey: ['analytics', 'filter-options', 'users'],
    queryFn: () => api.request<TenantUserListResponse>('/users?limit=100&page=1'),
    enabled: canFilterUsers,
    staleTime: 60_000,
  });

  return (
    <div className={compact ? 'space-y-5' : 'space-y-6'}>
      {compact || platform ? null : (
        <PageHeader
          description={
            platform
              ? 'Privacy-safe platform aggregates across clients. No Lead or customer records are returned.'
              : 'Server-authoritative performance, operational flow, and attention signals constrained to your effective scope.'
          }
          eyebrow={platform ? 'Agency platform' : 'Role-aware workspace'}
          title={platform ? 'Platform analytics' : 'Analytics'}
        />
      )}
      <FilterBar
        branch={search.get('branch_id') ?? 'ALL'}
        branches={branches.data?.branches ?? []}
        channel={channel}
        compare={compare}
        from={from}
        model={model}
        onChannel={setChannel}
        onBranch={(value) =>
          setParams({
            branch_id: value === 'ALL' ? null : value,
            team_id: null,
            user_id: null,
          })
        }
        onCompare={(value) => setParams({ compare: value })}
        onDates={(next) => setParams(next)}
        onModel={setModel}
        onReset={() => {
          const range = presetRange('30D');
          setModel('');
          setChannel('');
          router.replace(`${pathname}?from=${range.from}&to=${range.to}&compare=PREVIOUS_PERIOD`, {
            scroll: false,
          });
        }}
        onSource={(value) => setParams({ source: value === 'ALL' ? null : value })}
        onTeam={(value) => setParams({ team_id: value === 'ALL' ? null : value, user_id: null })}
        onUser={(value) => setParams({ user_id: value === 'ALL' ? null : value })}
        platform={platform}
        source={search.get('source') ?? 'ALL'}
        team={search.get('team_id') ?? 'ALL'}
        teams={teams.data?.teams ?? []}
        to={to}
        user={search.get('user_id') ?? 'ALL'}
        users={users.data?.users ?? []}
      />
      {analytics.isError ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Analytics could not be loaded</AlertTitle>
          <AlertDescription>
            {analytics.error instanceof Error ? analytics.error.message : 'Try again shortly.'}
            <Button
              className="ms-3"
              onClick={() => void analytics.refetch()}
              size="sm"
              variant="outline"
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {analytics.isLoading ? (
        <AnalyticsSkeleton />
      ) : analytics.data ? (
        <AnalyticsContent data={analytics.data} compact={compact} />
      ) : null}
    </div>
  );
}

function FilterBar(props: {
  branch: string;
  branches: BranchListResponse['branches'];
  channel: string;
  compare: string;
  from: string;
  model: string;
  onBranch(value: string): void;
  onChannel(value: string): void;
  onCompare(value: string): void;
  onDates(value: Record<string, string>): void;
  onModel(value: string): void;
  onReset(): void;
  onSource(value: string): void;
  onTeam(value: string): void;
  onUser(value: string): void;
  platform: boolean;
  source: string;
  team: string;
  teams: TeamListResponse['teams'];
  to: string;
  user: string;
  users: TenantUserListResponse['users'];
}) {
  const selectedPreset = inferPreset(props.from, props.to);
  const visibleTeams =
    props.branch === 'ALL'
      ? props.teams
      : props.teams.filter((team) => team.branch_id === props.branch);
  return (
    <section
      aria-label="Analytics filters"
      className="bg-card border-border space-y-4 rounded-xl border p-4 shadow-[var(--shadow-xs)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(['7D', '30D', 'MTD'] as const).map((preset) => (
            <Button
              key={preset}
              onClick={() => props.onDates(presetRange(preset))}
              size="sm"
              variant={selectedPreset === preset ? 'default' : 'outline'}
            >
              {preset === 'MTD' ? 'Month to date' : `Last ${preset.slice(0, -1)} days`}
            </Button>
          ))}
        </div>
        {props.platform ? (
          <Button onClick={props.onReset} size="sm" variant="ghost">
            <RotateCcw />
            Reset
          </Button>
        ) : null}
      </div>
      <div
        className={
          props.platform
            ? 'grid gap-3 md:grid-cols-3'
            : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6'
        }
      >
        <FilterField id="analytics-from" label="From">
          <Input
            id="analytics-from"
            max={props.to}
            onChange={(event) => props.onDates({ from: event.target.value, to: props.to })}
            type="date"
            value={props.from}
          />
        </FilterField>
        <FilterField id="analytics-to" label="To">
          <Input
            id="analytics-to"
            min={props.from}
            onChange={(event) => props.onDates({ from: props.from, to: event.target.value })}
            type="date"
            value={props.to}
          />
        </FilterField>
        <FilterField id="analytics-compare" label="Compare">
          <Select onValueChange={(value) => props.onCompare(value ?? 'NONE')} value={props.compare}>
            <SelectTrigger id="analytics-compare">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">No comparison</SelectItem>
              <SelectItem value="PREVIOUS_PERIOD">Previous period</SelectItem>
              <SelectItem value="PREVIOUS_MONTH">Previous month</SelectItem>
              <SelectItem value="PREVIOUS_YEAR">Previous year</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        {props.platform ? null : (
          <>
            {props.branches.length ? (
              <FilterField id="analytics-branch" label="Branch">
                <Select
                  onValueChange={(value) => props.onBranch(value ?? 'ALL')}
                  value={props.branch}
                >
                  <SelectTrigger id="analytics-branch">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All permitted branches</SelectItem>
                    {props.branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
            ) : null}
            {visibleTeams.length ? (
              <FilterField id="analytics-team" label="Team">
                <Select onValueChange={(value) => props.onTeam(value ?? 'ALL')} value={props.team}>
                  <SelectTrigger id="analytics-team">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All permitted teams</SelectItem>
                    {visibleTeams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
            ) : null}
            {props.users.length ? (
              <FilterField id="analytics-user" label="User">
                <Select onValueChange={(value) => props.onUser(value ?? 'ALL')} value={props.user}>
                  <SelectTrigger id="analytics-user">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All permitted users</SelectItem>
                    {props.users.map((user) => (
                      <SelectItem key={user.membership_id} value={user.membership_id}>
                        {user.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
            ) : null}
            <FilterField id="analytics-source" label="Lead source">
              <Select
                onValueChange={(value) => props.onSource(value ?? 'ALL')}
                value={props.source}
              >
                <SelectTrigger id="analytics-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All sources</SelectItem>
                  {['META', 'WHATSAPP_AD', 'GOOGLE_ADS', 'WEBSITE', 'WALK_IN', 'OTHER'].map(
                    (source) => (
                      <SelectItem key={source} value={source}>
                        {humanize(source)}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField id="analytics-model" label="Vehicle model">
              <Input
                id="analytics-model"
                onChange={(event) => props.onModel(event.target.value)}
                placeholder="All models"
                value={props.model}
              />
            </FilterField>
            <FilterField id="analytics-channel" label="Channel">
              <Select
                onValueChange={(value) => props.onChannel(value === 'ALL' ? '' : (value ?? ''))}
                value={props.channel || 'ALL'}
              >
                <SelectTrigger id="analytics-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All channels</SelectItem>
                  {['WHATSAPP', 'EMAIL', 'SMS'].map((channel) => (
                    <SelectItem key={channel} value={channel}>
                      {humanize(channel)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          </>
        )}
      </div>
      {props.platform ? null : (
        <div className="flex justify-between gap-3 text-xs">
          <span className="text-muted-foreground">
            Dates are interpreted in the reporting timezone and the URL is shareable.
          </span>
          <Button onClick={props.onReset} size="sm" variant="ghost">
            <RotateCcw />
            Reset
          </Button>
        </div>
      )}
    </section>
  );
}

function FilterField({
  children,
  id,
  label,
}: {
  children: React.ReactNode;
  id: string;
  label: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function AnalyticsContent({
  compact,
  data,
}: {
  compact: boolean;
  data: AnalyticsOverviewResponse | AnalyticsPlatformResponse;
}) {
  const hasData = data.metrics.some(
    (metric) => metric.state === 'AVAILABLE' && metric.value !== null,
  );
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="outline">{humanize(data.scope)}</Badge>
        <span className="text-muted-foreground flex items-center gap-1 text-xs">
          <Clock3 className="size-3.5" />
          Generated {new Date(data.freshness.generated_at).toLocaleString()} · {data.range.timezone}
        </span>
      </div>
      {hasData ? (
        <MetricGrid metrics={data.metrics} />
      ) : (
        <EmptyState
          description="There are no authoritative records for this range and effective scope."
          title="No analytics data"
        />
      )}
      {data.attention.length ? (
        <Card className="border-amber-300 bg-amber-50/40">
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <CardDescription>Prioritized exceptions within your authorized scope.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 md:grid-cols-2">
              {data.attention.map((item) => (
                <li
                  className="flex items-center justify-between gap-3 rounded-lg border bg-white p-3"
                  key={item.code}
                >
                  <span className="text-sm">{item.label}</span>
                  <Badge variant={item.severity === 'CRITICAL' ? 'destructive' : 'secondary'}>
                    {item.count}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      {data.series.length ? (
        <section aria-label="Analytics visualizations" className="grid gap-4 lg:grid-cols-2">
          {data.series.slice(0, compact ? 2 : 6).map((series) => (
            <Card key={series.code}>
              <CardHeader>
                <CardTitle>{series.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <AnalyticsChart series={series} />
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}
      {'clients' in data && !compact ? <ClientComparison clients={data.clients} /> : null}
    </>
  );
}

function MetricGrid({ metrics }: { metrics: AnalyticsMetric[] }) {
  return (
    <section
      aria-label="Key performance indicators"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {metrics.map((metric) => {
        const content = (
          <Card className="h-full">
            <CardHeader>
              <CardDescription>{metric.label}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {metric.value === null ? '—' : formatMetric(metric.value, metric.unit)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-xs leading-5">{metric.definition}</p>
              <Comparison metric={metric} />
            </CardContent>
          </Card>
        );
        const href = drilldownHref(metric.code);
        return href && metric.drilldown === 'RECORD_DRILLDOWN' ? (
          <Link
            className="rounded-xl outline-none focus-visible:ring-2"
            href={href}
            key={metric.code}
          >
            {content}
          </Link>
        ) : (
          <div key={metric.code}>{content}</div>
        );
      })}
    </section>
  );
}

function Comparison({ metric }: { metric: AnalyticsMetric }) {
  if (!metric.comparison)
    return <p className="text-muted-foreground mt-3 text-xs">No comparable prior value</p>;
  const delta = metric.comparison.value;
  if (delta === null)
    return <p className="text-muted-foreground mt-3 text-xs">Comparison unavailable</p>;
  const positive = delta >= 0;
  const favorable =
    metric.direction === 'NEUTRAL' ||
    (positive ? metric.direction === 'HIGHER_IS_BETTER' : metric.direction === 'LOWER_IS_BETTER');
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <p
      className={`mt-3 flex items-center gap-1 text-xs font-medium ${favorable ? 'text-emerald-700' : 'text-red-700'}`}
    >
      <Icon className="size-3.5" />
      {positive ? '+' : ''}
      {delta.toFixed(1)}
      {metric.comparison.change_kind === 'PERCENTAGE_POINTS'
        ? ' pp'
        : metric.comparison.change_kind === 'PERCENT_CHANGE'
          ? '%'
          : ''}{' '}
      vs comparison
    </p>
  );
}

function ClientComparison({ clients }: { clients: AnalyticsPlatformResponse['clients'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Client comparison</CardTitle>
        <CardDescription>
          Aggregate operational health only; no customer or Lead-level data.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Leads</TableHead>
              <TableHead>Bookings</TableHead>
              <TableHead>Deliveries</TableHead>
              <TableHead>Conversion</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>Integrations</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client) => (
              <TableRow key={client.client_id}>
                <TableCell className="font-medium">{client.client_name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{humanize(client.status)}</Badge>
                </TableCell>
                <TableCell>{client.leads}</TableCell>
                <TableCell>{client.bookings}</TableCell>
                <TableCell>{client.deliveries}</TableCell>
                <TableCell>{client.lead_to_booking_rate.toFixed(1)}%</TableCell>
                <TableCell>
                  {client.active_users}/{client.users}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={client.integration_health === 'DEGRADED' ? 'destructive' : 'secondary'}
                  >
                    {humanize(client.integration_health)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AnalyticsSkeleton() {
  return (
    <div aria-label="Loading analytics" className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((key) => (
          <Skeleton className="h-40" key={key} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}

function presetRange(preset: Exclude<Preset, 'CUSTOM'>): { from: string; to: string } {
  const now = new Date();
  const to = localDate(now);
  const fromDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    preset === 'MTD' ? 1 : now.getDate() - (preset === '7D' ? 6 : 29),
  );
  return { from: localDate(fromDate), to };
}

function inferPreset(from: string, to: string): Preset {
  for (const preset of ['7D', '30D', 'MTD'] as const) {
    const range = presetRange(preset);
    if (range.from === from && range.to === to) return preset;
  }
  return 'CUSTOM';
}

function localDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMetric(value: number, unit: AnalyticsMetric['unit']): string {
  if (unit === 'PERCENT') return `${value.toFixed(1)}%`;
  if (unit === 'MONEY_MINOR')
    return new Intl.NumberFormat('en-IN', {
      currency: 'INR',
      maximumFractionDigits: 0,
      style: 'currency',
    }).format(value / 100);
  if (unit === 'SECONDS') return `${Math.round(value)} sec`;
  if (unit === 'MINUTES') return `${Math.round(value)} min`;
  return new Intl.NumberFormat('en-IN').format(value);
}

function drilldownHref(code: string): string | null {
  if (code.includes('lead') || code === 'active_pipeline') return '/leads';
  if (code.includes('call')) return '/telephony';
  if (code.includes('ride')) return '/test-rides';
  if (code.includes('inventory')) return '/inventory';
  if (code.includes('booking')) return '/bookings';
  if (code.includes('deliver')) return '/deliveries';
  if (code.includes('registration')) return '/registrations';
  return null;
}

function humanize(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}
