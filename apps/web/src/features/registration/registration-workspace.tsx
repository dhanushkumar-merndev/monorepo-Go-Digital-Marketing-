'use client';

import { REGISTRATION_STATUS_CODES } from '@gdm/contracts';
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Car, ClockAlert, FileCheck2, Plus, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';

import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/features/auth/auth-provider';
import { PermissionGate } from '@/features/auth/permission-gate';
import { commandHeaders, errorMessage, type RegistrationCaseSummary } from './registration-types';

export function RegistrationWorkspace() {
  const { api, session } = useAuth();
  const cache = useQueryClient();
  const [status, setStatus] = useState('ALL');
  const [overdue, setOverdue] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const queryString = new URLSearchParams({ limit: '200', overdue_only: String(overdue) });
  if (status !== 'ALL') queryString.set('status', status);
  const queue = useQuery({
    queryKey: ['registration-cases', status, overdue],
    queryFn: () =>
      api.request<{ cases: RegistrationCaseSummary[] }>(`/registration-cases?${queryString}`),
  });
  const aging = useQuery({
    queryKey: ['registration-aging'],
    queryFn: () =>
      api.request<{
        active_count: number;
        overdue_count: number;
        by_status: Record<string, number>;
      }>('/registration-cases/aging'),
  });
  const canManage = session?.permissions.includes('registration.cases.manage') ?? false;

  return (
    <PermissionGate permission="registration.cases.read">
      <div className="space-y-6">
        <PageHeader
          actions={
            <div className="flex gap-2">
              <Link className={buttonVariants({ variant: 'outline' })} href="/customer-vehicles">
                <Car data-icon="inline-start" />
                Customer vehicles
              </Link>
              {canManage ? (
                <Button onClick={() => setShowCreate((value) => !value)}>
                  <Plus data-icon="inline-start" />
                  New case
                </Button>
              ) : null}
            </div>
          }
          description="Advance registration and RC work independently from delivery, with immutable history and tenant SLA aging."
          eyebrow="Post-booking operations"
          title="Registration & RC"
        />
        {showCreate ? (
          <CreateCase
            onCreated={() => {
              setShowCreate(false);
              void cache.invalidateQueries({ queryKey: ['registration-cases'] });
              void cache.invalidateQueries({ queryKey: ['registration-aging'] });
            }}
          />
        ) : null}
        <div className="grid gap-4 md:grid-cols-3">
          <Metric
            icon={FileCheck2}
            label="Active cases"
            value={aging.data?.active_count}
            loading={aging.isLoading}
          />
          <Metric
            icon={ClockAlert}
            label="Overdue"
            value={aging.data?.overdue_count}
            loading={aging.isLoading}
            danger
          />
          <Metric
            icon={Car}
            label="RC pending"
            value={aging.data?.by_status.RC_PENDING ?? 0}
            loading={aging.isLoading}
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64 space-y-1">
            <Label>Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value ?? 'ALL')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {REGISTRATION_STATUS_CODES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code.replaceAll('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant={overdue ? 'default' : 'outline'}
            onClick={() => setOverdue((value) => !value)}
          >
            <ClockAlert data-icon="inline-start" />
            Overdue only
          </Button>
          <Button variant="ghost" onClick={() => void queue.refetch()} disabled={queue.isFetching}>
            <RefreshCw
              className={queue.isFetching ? 'animate-spin' : ''}
              data-icon="inline-start"
            />
            Refresh
          </Button>
        </div>
        <QueueTable query={queue} />
        {session?.permissions.includes('registration.settings.manage') ? (
          <RegistrationSettings />
        ) : null}
      </div>
    </PermissionGate>
  );
}

function Metric({
  danger,
  icon: Icon,
  label,
  loading,
  value,
}: {
  danger?: boolean;
  icon: typeof Car;
  label: string;
  loading: boolean;
  value: number | undefined;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardDescription>{label}</CardDescription>
        <Icon className={danger ? 'text-destructive size-5' : 'text-muted-foreground size-5'} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className="text-3xl font-semibold">{value ?? 0}</p>
        )}
      </CardContent>
    </Card>
  );
}

function QueueTable({
  query,
}: {
  query: ReturnType<typeof useQuery<{ cases: RegistrationCaseSummary[] }, Error>>;
}) {
  if (query.isLoading)
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          {[1, 2, 3].map((item) => (
            <Skeleton className="h-12 w-full" key={item} />
          ))}
        </CardContent>
      </Card>
    );
  if (query.isError)
    return (
      <EmptyState
        title="Registration queue unavailable"
        description={query.error.message}
        action={<Button onClick={() => void query.refetch()}>Try again</Button>}
      />
    );
  const cases = query.data?.cases ?? [];
  if (cases.length === 0)
    return (
      <EmptyState
        title="No registration cases"
        description="No cases match the selected status and aging filters."
      />
    );
  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer / booking</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Aging</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {cases.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>
                  <p className="font-medium">{entry.customer_name}</p>
                  <p className="text-muted-foreground text-xs">{entry.booking_reference}</p>
                </TableCell>
                <TableCell>{entry.vehicle_label}</TableCell>
                <TableCell>
                  <Badge variant={entry.aging.overdue ? 'destructive' : 'secondary'}>
                    {entry.status.replaceAll('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell>{entry.assigned_name ?? 'Unassigned'}</TableCell>
                <TableCell>
                  <span className={entry.aging.overdue ? 'text-destructive font-medium' : ''}>
                    {entry.aging.age_hours}h / {entry.aging.sla_hours || '—'}h
                  </span>
                </TableCell>
                <TableCell>
                  <Link
                    className={buttonVariants({ size: 'sm', variant: 'outline' })}
                    href={`/registrations/${entry.id}`}
                  >
                    Open
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CreateCase({ onCreated }: { onCreated: () => void }) {
  const { api } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      return api.request('/registration-cases', {
        method: 'POST',
        headers: commandHeaders(),
        body: JSON.stringify({
          assigned_membership_id: String(data.get('assigned_membership_id') || '') || null,
          booking_id: String(data.get('booking_id')),
          expected_completion_at: data.get('expected_completion_at')
            ? new Date(String(data.get('expected_completion_at'))).toISOString()
            : null,
        }),
      });
    },
    onSuccess: onCreated,
    onError: (error) => setMessage(errorMessage(error)),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create registration case</CardTitle>
        <CardDescription>
          Uses the existing confirmed booking, canonical contact and allocated physical vehicle.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 md:grid-cols-3"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            mutation.mutate(event.currentTarget);
          }}
        >
          <Field label="Booking ID" name="booking_id" required />
          <Field label="RC executive membership ID" name="assigned_membership_id" />
          <Field label="Expected completion" name="expected_completion_at" type="datetime-local" />
          {message ? <p className="text-destructive text-sm md:col-span-3">{message}</p> : null}
          <Button className="md:col-span-3" disabled={mutation.isPending} type="submit">
            {mutation.isPending ? 'Creating…' : 'Create case'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function RegistrationSettings() {
  const { api } = useAuth();
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['registration-settings'],
    queryFn: () =>
      api.request<{ sla_hours: Record<string, number>; version: number }>(
        '/registration-cases/settings',
      ),
    enabled: open,
  });
  const mutation = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      const sla = Object.fromEntries(
        REGISTRATION_STATUS_CODES.map((status) => [status, Number(data.get(status) || 48)]),
      );
      return api.request('/registration-cases/settings', {
        method: 'POST',
        headers: commandHeaders(),
        body: JSON.stringify({
          expected_version: query.data?.version,
          reason: String(data.get('reason')),
          sla_hours: sla,
        }),
      });
    },
    onSuccess: () => {
      setMessage('SLA settings saved.');
      void cache.invalidateQueries({ queryKey: ['registration-settings'] });
      void cache.invalidateQueries({ queryKey: ['registration-aging'] });
    },
    onError: (error) => setMessage(errorMessage(error)),
  });
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Registration SLA settings</CardTitle>
          <CardDescription>Tenant-configured hours drive the aging dashboard.</CardDescription>
        </div>
        <Button variant="outline" onClick={() => setOpen((value) => !value)}>
          {open ? 'Close' : 'Configure'}
        </Button>
      </CardHeader>
      {open ? (
        <CardContent>
          {query.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : query.isError ? (
            <p className="text-destructive text-sm">{query.error.message}</p>
          ) : (
            <form
              className="grid gap-3 md:grid-cols-3"
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate(event.currentTarget);
              }}
            >
              {REGISTRATION_STATUS_CODES.map((status) => (
                <Field
                  defaultValue={String(query.data?.sla_hours[status] ?? 48)}
                  key={status}
                  label={`${status.replaceAll('_', ' ')} hours`}
                  name={status}
                  type="number"
                />
              ))}
              <Field label="Change reason" name="reason" required />
              <Button className="md:col-span-3" disabled={mutation.isPending}>
                Save settings
              </Button>
              {message ? <p className="text-sm md:col-span-3">{message}</p> : null}
            </form>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}

function Field({
  defaultValue,
  label,
  name,
  required,
  type = 'text',
}: {
  defaultValue?: string;
  label: string;
  name: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <Input defaultValue={defaultValue} id={name} name={name} required={required} type={type} />
    </div>
  );
}
