'use client';

import {
  DELIVERY_CHECKLIST_CODES,
  DELIVERY_PROOF_TYPES,
  DELIVERY_STATUS_CODES,
  type DeliverySummary,
} from '@gdm/contracts';
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, MapPinned, Plus, RefreshCw, TriangleAlert, Truck } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/features/auth/auth-provider';
import { PermissionGate } from '@/features/auth/permission-gate';

type DeliveryView = 'ACTIVE' | 'ALL' | 'EXCEPTIONS' | 'TODAY';

function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function viewFrom(value: string | null): DeliveryView {
  return value === 'ACTIVE' || value === 'ALL' || value === 'EXCEPTIONS' ? value : 'TODAY';
}

function commandHeaders(): HeadersInit {
  return { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() };
}

export function DeliveryWorkspace() {
  const { api, session } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const cache = useQueryClient();
  const view = viewFrom(params.get('view'));
  const status = params.get('status') ?? 'ALL';
  const date = localDate();
  const [showCreate, setShowCreate] = useState(false);
  const query = new URLSearchParams({ limit: '200' });
  if (view === 'TODAY') query.set('date', date);
  if (view === 'ACTIVE') query.set('status', 'OUT_FOR_DELIVERY');
  if (status !== 'ALL') query.set('status', status);
  const deliveries = useQuery({
    queryKey: ['deliveries', view, status, date],
    queryFn: () => api.request<{ deliveries: DeliverySummary[] }>(`/delivery?${query}`),
    refetchInterval: view === 'ACTIVE' ? 30_000 : false,
  });
  const items = (deliveries.data?.deliveries ?? []).filter((item) =>
    view === 'EXCEPTIONS' ? ['DELAYED', 'FAILED'].includes(item.status) : true,
  );
  const canManage = session?.permissions.includes('delivery.jobs.manage') ?? false;
  const canManageSettings = session?.permissions.includes('delivery.settings.manage') ?? false;

  function navigate(nextView: DeliveryView, nextStatus = status) {
    const next = new URLSearchParams({ view: nextView });
    if (nextStatus !== 'ALL') next.set('status', nextStatus);
    router.replace(`/deliveries?${next}`);
  }

  return (
    <PermissionGate permission="delivery.jobs.read">
      <div className="space-y-6">
        <PageHeader
          actions={
            canManage ? (
              <Button onClick={() => setShowCreate((open) => !open)}>
                <Plus data-icon="inline-start" />
                New delivery
              </Button>
            ) : null
          }
          description="Prepare, schedule and monitor tenant-scoped deliveries with fresh readiness checks and private proof."
          eyebrow="Operations"
          title="Delivery control"
        />
        {showCreate ? (
          <CreateDeliveryForm
            onCreated={() => {
              setShowCreate(false);
              void cache.invalidateQueries({ queryKey: ['deliveries'] });
            }}
          />
        ) : null}
        {canManageSettings ? <DeliverySettingsPanel /> : null}
        <DeliveryMetrics items={items} />
        <div aria-label="Delivery views" className="flex flex-wrap gap-2" role="navigation">
          {(['TODAY', 'ACTIVE', 'EXCEPTIONS', 'ALL'] as const).map((item) => (
            <Button
              key={item}
              onClick={() => navigate(item, item === 'ALL' ? status : 'ALL')}
              variant={view === item ? 'default' : 'outline'}
            >
              {item === 'TODAY'
                ? "Today's plan"
                : item === 'ACTIVE'
                  ? 'Active map'
                  : item === 'EXCEPTIONS'
                    ? 'Delayed / failed'
                    : 'All deliveries'}
            </Button>
          ))}
        </div>
        {view === 'ALL' ? (
          <div className="max-w-xs space-y-1">
            <Label htmlFor="delivery-status">Status</Label>
            <Select onValueChange={(value) => navigate('ALL', value ?? 'ALL')} value={status}>
              <SelectTrigger id="delivery-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {DELIVERY_STATUS_CODES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code.replaceAll('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {view === 'ACTIVE' ? (
          <ActiveDeliveryMonitor query={deliveries} />
        ) : (
          <DeliveryTable items={items} query={deliveries} />
        )}
      </div>
    </PermissionGate>
  );
}

interface DeliverySettings {
  active_timeout_minutes: number;
  location_retention_days: number;
  location_stale_seconds: number;
  required_checklist_codes: string[];
  required_proof_types: string[];
  updated_at: string;
  version: number;
}

function DeliverySettingsPanel() {
  const { api } = useAuth();
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['delivery-settings'],
    queryFn: () => api.request<DeliverySettings>('/delivery/settings'),
    enabled: open,
  });
  const mutation = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      const checklist = String(data.get('required_checklist_codes'))
        .split(',')
        .map((value) => value.trim().toUpperCase())
        .filter((value) => new Set<string>(DELIVERY_CHECKLIST_CODES).has(value));
      const proofs = String(data.get('required_proof_types'))
        .split(',')
        .map((value) => value.trim().toUpperCase())
        .filter((value) => new Set<string>(DELIVERY_PROOF_TYPES).has(value));
      return api.request('/delivery/settings', {
        body: JSON.stringify({
          active_timeout_minutes: Number(data.get('active_timeout_minutes')),
          expected_version: query.data?.version,
          location_retention_days: Number(data.get('location_retention_days')),
          location_stale_seconds: Number(data.get('location_stale_seconds')),
          reason: String(data.get('reason')),
          required_checklist_codes: checklist,
          required_proof_types: proofs,
        }),
        headers: commandHeaders(),
        method: 'POST',
      });
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Settings update failed.'),
    onSuccess: () => {
      setError(null);
      void cache.invalidateQueries({ queryKey: ['delivery-settings'] });
    },
  });
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Tenant delivery rules</CardTitle>
            <CardDescription>
              Versioned checklist, proof, timeout, retention and stale-location policy.
            </CardDescription>
          </div>
          <Button onClick={() => setOpen((value) => !value)} variant="outline">
            {open ? 'Close settings' : 'Configure rules'}
          </Button>
        </div>
      </CardHeader>
      {open ? (
        <CardContent>
          {query.isPending ? <Skeleton className="h-36 w-full" /> : null}
          {query.isError ? <DeliveryError retry={() => void query.refetch()} /> : null}
          {query.data ? (
            <form
              className="grid gap-3 md:grid-cols-2"
              key={query.data.version}
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                mutation.mutate(event.currentTarget);
              }}
            >
              <SettingsField
                defaultValue={query.data.required_checklist_codes.join(', ')}
                label="Required checklist codes"
                name="required_checklist_codes"
              />
              <SettingsField
                defaultValue={query.data.required_proof_types.join(', ')}
                label="Required proof types"
                name="required_proof_types"
              />
              <SettingsField
                defaultValue={String(query.data.active_timeout_minutes)}
                label="Active timeout minutes"
                name="active_timeout_minutes"
                type="number"
              />
              <SettingsField
                defaultValue={String(query.data.location_retention_days)}
                label="Location retention days"
                name="location_retention_days"
                type="number"
              />
              <SettingsField
                defaultValue={String(query.data.location_stale_seconds)}
                label="Stale location seconds"
                name="location_stale_seconds"
                type="number"
              />
              <SettingsField
                defaultValue="Approved delivery policy update."
                label="Change reason"
                name="reason"
              />
              <p className="text-muted-foreground text-xs md:col-span-2">
                Allowed checklist: {DELIVERY_CHECKLIST_CODES.join(', ')}. Allowed proof:{' '}
                {DELIVERY_PROOF_TYPES.join(', ')}.
              </p>
              {error ? (
                <p className="text-destructive text-sm md:col-span-2" role="alert">
                  {error}
                </p>
              ) : null}
              <Button className="md:col-span-2" disabled={mutation.isPending} type="submit">
                Save version {query.data.version + 1}
              </Button>
            </form>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

function SettingsField({
  defaultValue,
  label,
  name,
  type = 'text',
}: {
  defaultValue: string;
  label: string;
  name: string;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={`delivery-setting-${name}`}>{label}</Label>
      <Input
        defaultValue={defaultValue}
        id={`delivery-setting-${name}`}
        name={name}
        required
        type={type}
      />
    </div>
  );
}

function DeliveryMetrics({ items }: { items: DeliverySummary[] }) {
  const metrics = [
    ['Total', items.length],
    ['Out for delivery', items.filter((item) => item.status === 'OUT_FOR_DELIVERY').length],
    ['Delivered', items.filter((item) => item.status === 'DELIVERED').length],
    ['Exceptions', items.filter((item) => ['DELAYED', 'FAILED'].includes(item.status)).length],
  ] as const;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(([label, value]) => (
        <Card key={label}>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">{label}</p>
            <p className="mt-1 text-3xl font-semibold">{value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DeliveryTable({
  items,
  query,
}: {
  items: DeliverySummary[];
  query: ReturnType<typeof useQuery<{ deliveries: DeliverySummary[] }>>;
}) {
  if (query.isPending) return <DeliverySkeleton />;
  if (query.isError) return <DeliveryError retry={() => void query.refetch()} />;
  if (items.length === 0)
    return (
      <EmptyState
        description="No delivery jobs match this scoped view."
        icon={<CalendarDays className="size-5" />}
        title="No deliveries"
      />
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Delivery schedule</CardTitle>
        <CardDescription>
          Customer details are minimized to what the operation requires.
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
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Link className="font-medium hover:underline" href={`/deliveries/${item.id}`}>
                      {item.customer_name}
                    </Link>
                    <p className="text-muted-foreground text-xs">{item.booking_reference}</p>
                  </TableCell>
                  <TableCell>{new Date(item.scheduled_for).toLocaleString()}</TableCell>
                  <TableCell>{item.vehicle_label}</TableCell>
                  <TableCell>{item.assigned_name ?? 'Unassigned'}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        ['DELAYED', 'FAILED'].includes(item.status) ? 'destructive' : 'outline'
                      }
                    >
                      {item.status.replaceAll('_', ' ')}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ActiveDeliveryMonitor({
  query,
}: {
  query: ReturnType<typeof useQuery<{ deliveries: DeliverySummary[] }>>;
}) {
  if (query.isPending) return <DeliverySkeleton />;
  if (query.isError) return <DeliveryError retry={() => void query.refetch()} />;
  const items = query.data?.deliveries ?? [];
  if (items.length === 0)
    return (
      <EmptyState
        description="Only active jobs appear; location stops at terminal state or timeout."
        icon={<MapPinned className="size-5" />}
        title="No active deliveries"
      />
    );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {items.map((item) => (
        <Card key={item.id}>
          <CardHeader>
            <div className="flex justify-between gap-3">
              <div>
                <CardTitle>
                  <Link href={`/deliveries/${item.id}`}>{item.customer_name}</Link>
                </CardTitle>
                <CardDescription>
                  {item.assigned_name ?? 'Unassigned'} - {item.vehicle_label}
                </CardDescription>
              </div>
              <Badge variant={item.last_location?.stale ? 'destructive' : 'secondary'}>
                {item.last_location?.stale ? 'STALE' : item.last_location ? 'CURRENT' : 'NO FIX'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              Last update:{' '}
              {item.last_location
                ? new Date(item.last_location.captured_at).toLocaleString()
                : 'No accepted sample yet'}
            </p>
            {item.last_location ? (
              <a
                className="text-primary inline-flex items-center gap-2 text-sm font-medium underline"
                href={`https://www.google.com/maps/search/?api=1&query=${item.last_location.latitude},${item.last_location.longitude}`}
                rel="noreferrer"
                target="_blank"
              >
                <MapPinned className="size-4" />
                Open live coordinate
              </a>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CreateDeliveryForm({ onCreated }: { onCreated(): void }) {
  const { api } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      return api.request('/delivery', {
        body: JSON.stringify({
          assigned_membership_id: null,
          booking_id: String(data.get('booking_id')),
          destination_address: String(data.get('destination_address')),
          destination_latitude: null,
          destination_longitude: null,
          scheduled_for: new Date(String(data.get('scheduled_for'))).toISOString(),
        }),
        headers: commandHeaders(),
        method: 'POST',
      });
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : 'Creation failed.'),
    onSuccess: onCreated,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create from allocated booking</CardTitle>
        <CardDescription>
          The API verifies confirmed booking and canonical active vehicle allocation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 md:grid-cols-3"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            mutation.mutate(event.currentTarget);
          }}
        >
          <Field label="Booking ID" name="booking_id" />
          <Field label="Destination" name="destination_address" />
          <Field label="Planned time" name="scheduled_for" type="datetime-local" />
          {error ? (
            <p className="text-destructive text-sm md:col-span-3" role="alert">
              {error}
            </p>
          ) : null}
          <Button className="md:col-span-3" disabled={mutation.isPending} type="submit">
            <Truck data-icon="inline-start" />
            Create delivery operation
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({ label, name, type = 'text' }: { label: string; name: string; type?: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={`delivery-${name}`}>{label}</Label>
      <Input id={`delivery-${name}`} name={name} required type={type} />
    </div>
  );
}

function DeliverySkeleton() {
  return (
    <div aria-label="Loading deliveries" className="space-y-3">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-56 w-full" />
    </div>
  );
}

function DeliveryError({ retry }: { retry(): void }) {
  return (
    <EmptyState
      action={
        <Button onClick={retry} variant="outline">
          <RefreshCw data-icon="inline-start" />
          Retry
        </Button>
      }
      description="The delivery view could not be loaded."
      icon={<TriangleAlert className="size-5" />}
      title="Delivery data unavailable"
    />
  );
}
