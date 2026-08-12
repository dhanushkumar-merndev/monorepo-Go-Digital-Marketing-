'use client';

import type { TestRideSummary } from '@gdm/contracts';
import { Badge } from '@gdm/ui/components/badge';
import { Button, buttonVariants } from '@gdm/ui/components/button';
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
import { Textarea } from '@gdm/ui/components/textarea';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, MapPinned, Plus, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { PageHeader } from '@/components/page-header';
import {
  readPageParameters,
  ServerPagination,
  type PageMetadata,
} from '@/components/server-pagination';
import { PermissionGate } from '@/features/auth/permission-gate';
import { useAuth } from '@/features/auth/auth-provider';
import { useTestRidesUiStore } from './test-rides-ui.store';
import { localCalendarDate, parseRideView, type RideView } from './test-rides-url-state';

interface LeadOption {
  branch_id: string;
  contact_name: string;
  id: string;
  vehicle_interest: string;
}

export function TestRidesWorkspace() {
  const { api, session } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const cache = useQueryClient();
  const scheduleOpen = useTestRidesUiStore((state) => state.scheduleOpen);
  const setScheduleOpen = useTestRidesUiStore((state) => state.setScheduleOpen);
  const view = parseRideView(search.get('view'));
  const { page, pageSize } = readPageParameters(search);
  const date = localCalendarDate(new Date());
  const query = new URLSearchParams({ limit: String(pageSize), page: String(page) });
  if (view === 'ACTIVE') query.set('status', 'ACTIVE');
  if (view === 'TODAY') query.set('date', date);
  const queryString = query.toString();
  const rides = useQuery({
    queryKey: ['test-rides', view, date, page, pageSize],
    queryFn: () =>
      api.request<{ pagination: PageMetadata; rides: TestRideSummary[] }>(
        `/test-rides?${queryString}`,
      ),
  });
  const canSchedule = session?.permissions.includes('test_rides.schedule') ?? false;

  function navigate(next: RideView, nextPage = 1, nextPageSize = pageSize) {
    router.replace(
      `/test-rides?view=${next}&page=${String(nextPage)}&page_size=${String(nextPageSize)}`,
    );
  }

  return (
    <PermissionGate permission="test_rides.read">
      <div className="space-y-6">
        <PageHeader
          actions={
            canSchedule ? (
              <Button onClick={() => setScheduleOpen(!scheduleOpen)}>
                <Plus data-icon="inline-start" />
                Schedule ride
              </Button>
            ) : null
          }
          description="Schedule, assign and monitor test rides without turning location into employee history."
          eyebrow="Operations"
          title="Test rides"
        />

        <div aria-label="Test ride views" className="flex flex-wrap gap-2" role="navigation">
          {(['TODAY', 'ACTIVE', 'ALL'] as const).map((item) => (
            <Button
              key={item}
              onClick={() => navigate(item)}
              variant={view === item ? 'default' : 'outline'}
            >
              {item === 'TODAY'
                ? "Today's rides"
                : item === 'ACTIVE'
                  ? 'Active location'
                  : 'All rides'}
            </Button>
          ))}
        </div>

        {scheduleOpen ? (
          <ScheduleRideForm
            onCreated={() => {
              setScheduleOpen(false);
              void cache.invalidateQueries({ queryKey: ['test-rides'] });
            }}
          />
        ) : null}

        {view === 'ACTIVE' ? (
          <ActiveRideMonitor query={rides} />
        ) : (
          <RideTable
            onPage={(value) => navigate(view, value)}
            onPageSize={(value) => navigate(view, 1, value)}
            query={rides}
          />
        )}
      </div>
    </PermissionGate>
  );
}

function RideTable({
  onPage,
  onPageSize,
  query,
}: {
  onPage(page: number): void;
  onPageSize(pageSize: number): void;
  query: ReturnType<typeof useQuery<{ pagination: PageMetadata; rides: TestRideSummary[] }>>;
}) {
  if (query.isPending) return <RideSkeleton />;
  if (query.isError) return <RideQueryError retry={() => void query.refetch()} />;
  const rides = query.data?.rides ?? [];
  if (rides.length === 0)
    return (
      <EmptyState
        description="No test rides match this scoped view."
        icon={<CalendarDays className="size-5" />}
        title="No rides found"
      />
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Scheduled operations</CardTitle>
        <CardDescription>
          Times display in your browser locale; API records remain UTC.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Executive</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rides.map((ride) => (
                <TableRow key={ride.id}>
                  <TableCell>
                    <Link className="font-medium hover:underline" href={`/test-rides/${ride.id}`}>
                      {ride.contact_name}
                    </Link>
                    <p className="text-muted-foreground text-xs">{ride.phone_e164}</p>
                  </TableCell>
                  <TableCell>{new Date(ride.scheduled_start_at).toLocaleString()}</TableCell>
                  <TableCell>
                    {ride.vehicle_model}
                    <p className="text-muted-foreground text-xs">{ride.demo_vehicle_reference}</p>
                  </TableCell>
                  <TableCell>{ride.executive_name ?? 'Unassigned'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{ride.status.replaceAll('_', ' ')}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ServerPagination
          metadata={query.data?.pagination ?? { has_next: false, page: 1, page_size: 25 }}
          onPage={onPage}
          onPageSize={onPageSize}
        />
      </CardContent>
    </Card>
  );
}

function ActiveRideMonitor({
  query,
}: {
  query: ReturnType<typeof useQuery<{ pagination: PageMetadata; rides: TestRideSummary[] }>>;
}) {
  const showDetails = useTestRidesUiStore((state) => state.showLocationDetails);
  const setShowDetails = useTestRidesUiStore((state) => state.setShowLocationDetails);
  if (query.isPending) return <RideSkeleton />;
  if (query.isError) return <RideQueryError retry={() => void query.refetch()} />;
  const rides = (query.data?.rides ?? []).filter((ride) => ride.status === 'ACTIVE');
  if (rides.length === 0)
    return (
      <EmptyState
        description="Only ACTIVE jobs appear here. Completed and off-duty history is excluded."
        icon={<MapPinned className="size-5" />}
        title="No active rides"
      />
    );
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowDetails(!showDetails)} variant="outline">
          {showDetails ? 'Hide coordinates' : 'Show coordinates'}
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {rides.map((ride) => {
          const location = ride.last_location;
          return (
            <Card key={ride.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{ride.contact_name}</CardTitle>
                    <CardDescription>
                      {ride.executive_name ?? 'Unassigned'} · {ride.vehicle_model}
                    </CardDescription>
                  </div>
                  <Badge variant={location?.stale ? 'destructive' : 'secondary'}>
                    {!ride.tracking_active
                      ? 'TRACKING STOPPED'
                      : location?.stale
                        ? 'STALE'
                        : 'ACTIVE'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {location ? (
                  <>
                    <p>
                      Last update {new Date(location.captured_at).toLocaleString()} · accuracy ±
                      {Math.round(location.accuracy_m)} m
                    </p>
                    {showDetails ? (
                      <p className="text-muted-foreground font-mono text-xs">
                        {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                      </p>
                    ) : null}
                    <a
                      className={buttonVariants({ variant: 'outline' })}
                      href={`https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <MapPinned data-icon="inline-start" /> Open map
                    </a>
                  </>
                ) : (
                  <p className="text-muted-foreground">No accepted location sample yet.</p>
                )}
                <Link
                  className={buttonVariants({ variant: 'ghost' })}
                  href={`/test-rides/${ride.id}`}
                >
                  Open ride detail
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ScheduleRideForm({ onCreated }: { onCreated(): void }) {
  const { api } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const leads = useQuery({
    queryKey: ['leads', 'test-ride-options'],
    queryFn: () => api.request<{ leads: LeadOption[] }>('/leads?limit=100'),
  });
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.request('/test-rides', {
        body: JSON.stringify(body),
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        method: 'POST',
      }),
    onError: (caught) => setError(caught instanceof Error ? caught.message : 'Scheduling failed.'),
    onSuccess: onCreated,
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const lead = leads.data?.leads.find((item) => item.id === data.get('lead_id'));
    if (!lead) {
      setError('Select an available Lead.');
      return;
    }
    mutation.mutate({
      branch_id: lead.branch_id,
      customer_location: String(data.get('customer_location')),
      demo_vehicle_reference: String(data.get('demo_vehicle_reference')),
      lead_id: lead.id,
      notes: data.get('notes') ? String(data.get('notes')) : null,
      otp_code: data.get('otp_code') ? String(data.get('otp_code')) : null,
      scheduled_end_at: new Date(String(data.get('scheduled_end_at'))).toISOString(),
      scheduled_start_at: new Date(String(data.get('scheduled_start_at'))).toISOString(),
      vehicle_model: String(data.get('vehicle_model')),
    });
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule a test ride</CardTitle>
        <CardDescription>The Lead supplies canonical customer and branch identity.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
          <div className="md:col-span-2">
            <Label htmlFor="ride-lead">Lead</Label>
            <Select name="lead_id" required>
              <SelectTrigger id="ride-lead">
                <SelectValue placeholder="Select a Lead" />
              </SelectTrigger>
              <SelectContent>
                {(leads.data?.leads ?? []).map((lead) => (
                  <SelectItem key={lead.id} value={lead.id}>
                    {lead.contact_name} · {lead.vehicle_interest}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {leads.isError ? (
              <p className="text-destructive mt-1 text-xs">Lead options could not load.</p>
            ) : null}
          </div>
          <Field label="Vehicle model" name="vehicle_model" />
          <Field label="Demo vehicle reference" name="demo_vehicle_reference" />
          <Field label="Start" name="scheduled_start_at" type="datetime-local" />
          <Field label="End" name="scheduled_end_at" type="datetime-local" />
          <Field label="Customer location" name="customer_location" />
          <Field label="Optional start OTP (4–8 digits)" name="otp_code" required={false} />
          <div className="md:col-span-2">
            <Label htmlFor="ride-notes">Notes</Label>
            <Textarea id="ride-notes" name="notes" />
          </div>
          <div className="md:col-span-2">
            {error ? (
              <p className="text-destructive mb-2 text-sm" role="alert">
                {error}
              </p>
            ) : null}
            <Button disabled={mutation.isPending || leads.isPending} type="submit">
              {mutation.isPending ? 'Scheduling…' : 'Create request'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  name,
  required = true,
  type = 'text',
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div>
      <Label htmlFor={`ride-${name}`}>{label}</Label>
      <Input id={`ride-${name}`} name={name} required={required} type={type} />
    </div>
  );
}

function RideQueryError({ retry }: { retry(): void }) {
  return (
    <EmptyState
      action={
        <Button onClick={retry} variant="outline">
          <RefreshCw data-icon="inline-start" />
          Retry
        </Button>
      }
      description="The test-ride service could not be reached."
      icon={<AlertTriangle className="size-5" />}
      title="Unable to load rides"
    />
  );
}

function RideSkeleton() {
  return (
    <div aria-label="Loading test rides" className="space-y-3">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
