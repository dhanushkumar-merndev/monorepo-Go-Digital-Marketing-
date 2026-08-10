'use client';

import type { AgencyDashboardResponse } from '@gdm/contracts';
import { Alert, AlertDescription, AlertTitle } from '@gdm/ui/components/alert';
import { Button } from '@gdm/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gdm/ui/components/card';
import { EmptyState } from '@gdm/ui/components/empty-state';
import { Input } from '@gdm/ui/components/input';
import { Label } from '@gdm/ui/components/label';
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
import { ChartNoAxesCombined, RefreshCw, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import { useAuth } from '@/features/auth/auth-provider';

interface DashboardRange {
  from: string;
  timezone: string;
  to: string;
}

const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
const todayParts = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: browserTimezone,
  year: 'numeric',
}).formatToParts(new Date());
const todayPart = (type: Intl.DateTimeFormatPartTypes) =>
  todayParts.find((part) => part.type === type)?.value ?? '';
const today = `${todayPart('year')}-${todayPart('month')}-${todayPart('day')}`;
const initialRange: DashboardRange = {
  from: `${today.slice(0, 8)}01`,
  timezone: browserTimezone,
  to: today,
};

export function AgencyKpiDashboard() {
  const { api } = useAuth();
  const [draftRange, setDraftRange] = useState(initialRange);
  const [range, setRange] = useState(initialRange);
  const query = new URLSearchParams({
    from: range.from,
    timezone: range.timezone,
    to: range.to,
  }).toString();
  const dashboard = useQuery({
    queryFn: () =>
      api.request<AgencyDashboardResponse>(`/administration/agency-dashboard?${query}`),
    queryKey: ['agency-dashboard', range.from, range.to, range.timezone],
  });

  return (
    <section aria-labelledby="agency-performance-heading" className="space-y-4">
      <div className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold" id="agency-performance-heading">
            Performance overview
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Client lead activity for the selected date range.
          </p>
        </div>
        <form
          className="bg-card flex flex-wrap items-end gap-2 rounded-lg border p-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (
              range.from === draftRange.from &&
              range.to === draftRange.to &&
              range.timezone === draftRange.timezone
            ) {
              void dashboard.refetch();
            } else {
              setRange({ ...draftRange });
            }
          }}
        >
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="agency-kpi-from">
              From
            </Label>
            <Input
              id="agency-kpi-from"
              max={draftRange.to}
              onChange={(event) =>
                setDraftRange((current) => ({ ...current, from: event.target.value }))
              }
              type="date"
              value={draftRange.from}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="agency-kpi-to">
              To
            </Label>
            <Input
              id="agency-kpi-to"
              min={draftRange.from}
              onChange={(event) =>
                setDraftRange((current) => ({ ...current, to: event.target.value }))
              }
              type="date"
              value={draftRange.to}
            />
          </div>
          <Button disabled={dashboard.isFetching} type="submit" variant="outline">
            <RefreshCw
              aria-hidden="true"
              className={dashboard.isFetching ? 'animate-spin' : undefined}
              data-icon="inline-start"
            />
            {dashboard.isFetching ? 'Refreshing' : 'Apply'}
          </Button>
        </form>
      </div>

      {dashboard.isPending ? <AgencyDashboardSkeleton /> : null}
      {dashboard.isError ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Client KPIs could not be loaded</AlertTitle>
          <AlertDescription>
            {dashboard.error instanceof Error
              ? dashboard.error.message
              : 'The agency report is temporarily unavailable.'}
          </AlertDescription>
        </Alert>
      ) : null}
      {dashboard.data ? <AgencyDashboardContent data={dashboard.data} /> : null}
    </section>
  );
}

function AgencyDashboardContent({ data }: { data: AgencyDashboardResponse }) {
  const totals = data.totals;
  const needsAttention = totals.new + totals.pending_review;
  const cards = [
    ['Clients', totals.client_organizations, 'Active scope'],
    ['Leads received', totals.leads_received, 'Selected range'],
    ['Needs attention', needsAttention, `${totals.new} new · ${totals.pending_review} pending`],
    ['In progress', totals.in_progress, 'Sales pipeline'],
    ['Converted', totals.converted, `${formatRate(totals.conversion_rate)} conversion`],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(([title, value, detail]) => (
          <Card className="h-full" key={title}>
            <CardHeader className="gap-1">
              <CardDescription>{title}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
              <p className="text-muted-foreground text-xs">{detail}</p>
            </CardHeader>
          </Card>
        ))}
      </div>

      {data.clients.length === 0 ? (
        <EmptyState
          description="Create a client organization to begin tracking agency performance."
          icon={<ChartNoAxesCombined aria-hidden="true" className="size-5" />}
          title="No client organizations"
        />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <ClientVolumeChart clients={data.clients} />
            <PipelineChart data={data} />
          </div>
          <ClientKpiTable data={data} />
        </>
      )}
    </div>
  );
}

function ClientVolumeChart({ clients }: { clients: AgencyDashboardResponse['clients'] }) {
  const maximum = Math.max(1, ...clients.map((client) => client.leads_received));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lead volume by client</CardTitle>
        <CardDescription>Received and converted leads.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {clients.map((client) => {
          const totalWidth = (client.leads_received / maximum) * 100;
          const convertedWidth = (client.converted / maximum) * 100;
          return (
            <div className="space-y-2" key={client.client_organization.id}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium">
                  {client.client_organization.display_name}
                </span>
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {client.leads_received} leads · {client.converted} converted
                </span>
              </div>
              <div
                aria-label={`${client.client_organization.display_name}: ${client.leads_received} leads, ${client.converted} converted`}
                className="bg-muted relative h-3 overflow-hidden rounded-full"
                role="img"
              >
                <div
                  className="bg-primary/35 absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${String(totalWidth)}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-emerald-500"
                  style={{ width: `${String(convertedWidth)}%` }}
                />
              </div>
            </div>
          );
        })}
        <div className="text-muted-foreground flex gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="bg-primary/35 size-2.5 rounded-full" /> Received
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-emerald-500" /> Converted
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function PipelineChart({ data }: { data: AgencyDashboardResponse }) {
  const total = data.totals.leads_received;
  const segments = [
    ['New', data.totals.new, 'bg-sky-500'],
    ['Pending', data.totals.pending_review, 'bg-amber-500'],
    ['In progress', data.totals.in_progress, 'bg-violet-500'],
    ['Converted', data.totals.converted, 'bg-emerald-500'],
    ['Lost', data.totals.lost, 'bg-slate-500'],
    ['Rejected', data.totals.rejected, 'bg-rose-500'],
  ] as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Agency lead pipeline</CardTitle>
        <CardDescription>Lead status distribution.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div
          aria-label={segments.map(([label, value]) => `${label}: ${String(value)}`).join(', ')}
          className="bg-muted flex h-5 overflow-hidden rounded-full"
          role="img"
        >
          {segments.map(([label, value, color]) => (
            <div
              className={color}
              key={label}
              style={{ width: total === 0 ? '0%' : `${String((value / total) * 100)}%` }}
              title={`${label}: ${String(value)}`}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {segments.map(([label, value, color]) => (
            <div className="flex items-center gap-2" key={label}>
              <span aria-hidden="true" className={`size-2.5 rounded-full ${color}`} />
              <div>
                <p className="text-muted-foreground text-xs">{label}</p>
                <p className="text-sm font-semibold tabular-nums">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ClientKpiTable({ data }: { data: AgencyDashboardResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Client KPI breakdown</CardTitle>
        <CardDescription>Performance by client.</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">New</TableHead>
              <TableHead className="text-right">Pending</TableHead>
              <TableHead className="text-right">In progress</TableHead>
              <TableHead className="text-right">Converted</TableHead>
              <TableHead className="text-right">Conversion</TableHead>
              <TableHead className="text-right">Lost / rejected</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.clients.map((client) => (
              <TableRow key={client.client_organization.id}>
                <TableCell className="font-medium">
                  {client.client_organization.display_name}
                </TableCell>
                <TableCell>
                  <StatusBadge
                    tone={
                      client.client_organization.status === 'ACTIVE'
                        ? 'success'
                        : client.client_organization.status === 'PENDING'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {titleCase(client.client_organization.status)}
                  </StatusBadge>
                </TableCell>
                <NumericCell value={client.leads_received} />
                <NumericCell value={client.new} />
                <NumericCell value={client.pending_review} />
                <NumericCell value={client.in_progress} />
                <NumericCell value={client.converted} />
                <TableCell className="text-right font-medium tabular-nums">
                  {formatRate(client.conversion_rate)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {client.lost} / {client.rejected}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function NumericCell({ value }: { value: number }) {
  return <TableCell className="text-right tabular-nums">{value}</TableCell>;
}

function AgencyDashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading client performance" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton className="h-28" key={index} />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}

function formatRate(value: number): string {
  return `${value.toFixed(1)}%`;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}
