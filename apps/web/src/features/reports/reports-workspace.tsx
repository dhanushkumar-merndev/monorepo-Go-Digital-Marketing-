'use client';

import { Alert, AlertDescription } from '@gdm/ui/components/alert';
import { Badge } from '@gdm/ui/components/badge';
import { Button } from '@gdm/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gdm/ui/components/card';
import { EmptyState } from '@gdm/ui/components/empty-state';
import { Input } from '@gdm/ui/components/input';
import { Label } from '@gdm/ui/components/label';
import { Skeleton } from '@gdm/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@gdm/ui/components/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileBarChart2, ScrollText } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { ServerPagination, type PageMetadata } from '@/components/server-pagination';
import { useAuth } from '@/features/auth/auth-provider';
import { PermissionGate } from '@/features/auth/permission-gate';

interface Dashboard {
  metrics: {
    bookings: { by_status: Record<string, number>; total: number };
    deliveries: { by_status: Record<string, number>; total: number };
    funnel: { by_status: Record<string, number>; leads: number };
    registration: { overdue: number; total: number };
    reminders: { by_status: Record<string, number>; total: number };
  };
}
interface Audit {
  id: string;
  action: string;
  actorId: string | null;
  entityType: string;
  entityId: string;
  outcome: string;
  correlationId: string;
  createdAt: string;
  reason: string | null;
}
interface ExportJob {
  id: string;
  kind: string;
  format: string;
  status: string;
  createdAt: string;
  expiresAt: string | null;
}
const today = new Date().toISOString().slice(0, 10);
const firstDay = `${today.slice(0, 8)}01`;

export function ReportsWorkspace() {
  const { api } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const cache = useQueryClient();
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(25);
  const [exportPage, setExportPage] = useState(1);
  const [exportPageSize, setExportPageSize] = useState(25);
  const from = params.get('from') ?? firstDay;
  const to = params.get('to') ?? today;
  const view = params.get('view') === 'audit' ? 'audit' : 'dashboard';
  const query = useMemo(
    () =>
      new URLSearchParams({
        from,
        to,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
      }).toString(),
    [from, to],
  );
  const dashboard = useQuery({
    queryKey: ['reports-dashboard', query],
    queryFn: () => api.request<Dashboard>(`/reports/dashboard?${query}`),
    enabled: view === 'dashboard',
  });
  const audit = useQuery({
    queryKey: ['report-audit', query, auditPage, auditPageSize],
    queryFn: () =>
      api.request<{ events: Audit[]; pagination: PageMetadata }>(
        `/reports/audit-events?${query}&limit=${String(auditPageSize)}&page=${String(auditPage)}`,
      ),
    enabled: view === 'audit',
  });
  const exports = useQuery({
    queryKey: ['report-exports', exportPage, exportPageSize],
    queryFn: () =>
      api.request<{ exports: ExportJob[]; pagination: PageMetadata }>(
        `/reports/exports?limit=${String(exportPageSize)}&page=${String(exportPage)}`,
      ),
  });
  const createExport = useMutation({
    mutationFn: (format: 'CSV' | 'XLSX') =>
      api.request('/reports/exports', {
        method: 'POST',
        body: JSON.stringify({
          filters: {
            from,
            to,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
          },
          format,
          kind: view === 'audit' ? 'AUDIT_EVENTS' : 'LEAD_FUNNEL',
        }),
      }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ['report-exports'] }),
  });
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    router.replace(`/reports?${next.toString()}`);
  };
  const error = dashboard.error ?? audit.error ?? exports.error ?? createExport.error;
  return (
    <PermissionGate permission="reports.read">
      <div className="space-y-6">
        <PageHeader
          description="Authoritative, timezone-bound operational KPIs. Every result is filtered by your live tenant and branch scope."
          title="Reports & audit"
        />
        <div className="bg-card flex flex-wrap items-end gap-3 rounded-lg border p-4">
          <div>
            <Label htmlFor="from">From</Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(event) => set('from', event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              type="date"
              value={to}
              onChange={(event) => set('to', event.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => set('view', 'dashboard')}
              variant={view === 'dashboard' ? 'default' : 'outline'}
            >
              <FileBarChart2 />
              Dashboard
            </Button>
            <Button
              onClick={() => set('view', 'audit')}
              variant={view === 'audit' ? 'default' : 'outline'}
            >
              <ScrollText />
              Audit explorer
            </Button>
          </div>
          <PermissionGate permission="reports.export">
            <div className="ms-auto flex gap-2">
              <Button
                disabled={createExport.isPending}
                onClick={() => createExport.mutate('CSV')}
                variant="outline"
              >
                <Download />
                CSV
              </Button>
              <Button disabled={createExport.isPending} onClick={() => createExport.mutate('XLSX')}>
                <Download />
                XLSX
              </Button>
            </div>
          </PermissionGate>
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {error instanceof Error ? error.message : 'Report data could not be loaded.'}
            </AlertDescription>
          </Alert>
        ) : null}
        {view === 'dashboard' ? (
          <DashboardPanel data={dashboard.data} loading={dashboard.isLoading} />
        ) : (
          <AuditPanel
            data={audit.data?.events}
            loading={audit.isLoading}
            metadata={audit.data?.pagination}
            onPage={setAuditPage}
            onPageSize={(value) => {
              setAuditPageSize(value);
              setAuditPage(1);
            }}
          />
        )}
        <Card>
          <CardHeader>
            <CardTitle>Export jobs</CardTitle>
            <CardDescription>
              Private exports expire after 24 hours. A download link is created only when the scoped
              worker job completes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {exports.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : exports.data?.exports.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Report</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exports.data.exports.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell>{job.kind}</TableCell>
                      <TableCell>{job.format}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            job.status === 'COMPLETED'
                              ? 'success'
                              : job.status === 'FAILED'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {job.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(job.createdAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                description="Create a CSV or XLSX export for the selected view."
                title="No export jobs yet"
              />
            )}
            {exports.data?.pagination ? (
              <ServerPagination
                metadata={exports.data.pagination}
                onPage={setExportPage}
                onPageSize={(value) => {
                  setExportPageSize(value);
                  setExportPage(1);
                }}
              />
            ) : null}
          </CardContent>
        </Card>
      </div>
    </PermissionGate>
  );
}

function DashboardPanel({ data, loading }: { data: Dashboard | undefined; loading: boolean }) {
  if (loading)
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3, 4, 5].map((key) => (
          <Skeleton className="h-36" key={key} />
        ))}
      </div>
    );
  if (!data)
    return <EmptyState description="Choose a valid reporting range." title="No report data" />;
  const cards = [
    ['Leads', data.metrics.funnel.leads, data.metrics.funnel.by_status],
    ['Bookings', data.metrics.bookings.total, data.metrics.bookings.by_status],
    ['Deliveries', data.metrics.deliveries.total, data.metrics.deliveries.by_status],
    [
      'Registration',
      data.metrics.registration.total,
      { overdue: data.metrics.registration.overdue },
    ],
    ['Reminders', data.metrics.reminders.total, data.metrics.reminders.by_status],
  ] as const;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map(([title, total, breakdown]) => (
        <Card key={title}>
          <CardHeader>
            <CardDescription>{title}</CardDescription>
            <CardTitle className="text-3xl">{total}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Object.entries(breakdown).map(([key, value]) => (
              <Badge key={key} variant="secondary">
                {key}: {value}
              </Badge>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
function AuditPanel({
  data,
  loading,
  metadata,
  onPage,
  onPageSize,
}: {
  data: Audit[] | undefined;
  loading: boolean;
  metadata: PageMetadata | undefined;
  onPage(page: number): void;
  onPageSize(pageSize: number): void;
}) {
  if (loading) return <Skeleton className="h-80 w-full" />;
  if (!data?.length)
    return (
      <EmptyState
        description="No immutable audit events match this range and your tenant scope."
        title="No audit events"
      />
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Immutable audit events</CardTitle>
        <CardDescription>
          Actor, entity, correlation ID and outcome are server-authoritative. Sensitive summaries
          remain minimized.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Correlation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((event) => (
              <TableRow key={event.id}>
                <TableCell>{new Date(event.createdAt).toLocaleString()}</TableCell>
                <TableCell>{event.action}</TableCell>
                <TableCell>{event.entityType}</TableCell>
                <TableCell>{event.actorId ?? 'System'}</TableCell>
                <TableCell className="max-w-40 truncate">{event.correlationId}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {metadata ? (
          <ServerPagination metadata={metadata} onPage={onPage} onPageSize={onPageSize} />
        ) : null}
      </CardContent>
    </Card>
  );
}
