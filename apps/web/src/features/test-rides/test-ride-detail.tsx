'use client';

import type { TestRideDetail } from '@gdm/contracts';
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, MapPinned } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { PermissionGate } from '@/features/auth/permission-gate';
import { useAuth } from '@/features/auth/auth-provider';

interface Executive {
  display_name: string;
  membership_id: string;
  user_id: string;
}

export function TestRideDetailView({ rideId }: { rideId: string }) {
  const { api, session } = useAuth();
  const query = useQuery({
    queryKey: ['test-ride', rideId],
    queryFn: () => api.request<TestRideDetail>(`/test-rides/${rideId}`),
  });
  if (query.isPending)
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (query.isError || !query.data)
    return (
      <EmptyState
        description="The ride is unavailable or outside your scope."
        icon={<AlertTriangle className="size-5" />}
        title="Unable to load ride"
      />
    );
  const ride = query.data.ride;
  return (
    <PermissionGate permission="test_rides.read">
      <div className="space-y-6">
        <PageHeader
          eyebrow="Test ride"
          title={ride.contact_name}
          description={`${ride.vehicle_model} · ${new Date(ride.scheduled_start_at).toLocaleString()}`}
          actions={
            <Link className={buttonVariants({ variant: 'outline' })} href="/test-rides">
              <ArrowLeft data-icon="inline-start" />
              Back
            </Link>
          }
        />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between gap-3">
                  <div>
                    <CardTitle>Ride details</CardTitle>
                    <CardDescription>{ride.customer_location}</CardDescription>
                  </div>
                  <Badge variant="outline">{ride.status.replaceAll('_', ' ')}</Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                <Fact label="Customer phone" value={ride.phone_e164} />
                <Fact label="Demo vehicle" value={ride.demo_vehicle_reference} />
                <Fact label="Executive" value={ride.executive_name ?? 'Unassigned'} />
                <Fact
                  label="Tracking"
                  value={ride.tracking_active ? 'Active' : 'Stopped / not started'}
                />
                <Fact
                  label="Start kilometres"
                  value={ride.start_odometer_km?.toString() ?? 'Not recorded'}
                />
                <Fact
                  label="End kilometres"
                  value={ride.end_odometer_km?.toString() ?? 'Not recorded'}
                />
              </CardContent>
            </Card>
            {ride.last_location ? (
              <Card>
                <CardHeader>
                  <CardTitle>Current active-job location</CardTitle>
                  <CardDescription>
                    {new Date(ride.last_location.captured_at).toLocaleString()} · accuracy ±
                    {Math.round(ride.last_location.accuracy_m)} m
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-3">
                  <Badge variant={ride.last_location.stale ? 'destructive' : 'secondary'}>
                    {ride.last_location.stale ? 'STALE' : 'CURRENT'}
                  </Badge>
                  <a
                    className={buttonVariants({ variant: 'outline' })}
                    href={`https://www.google.com/maps/search/?api=1&query=${ride.last_location.latitude},${ride.last_location.longitude}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <MapPinned data-icon="inline-start" />
                    Open map
                  </a>
                </CardContent>
              </Card>
            ) : null}
            <RideTimeline detail={query.data} />
          </div>
          <RideActions
            detail={query.data}
            canAssign={session?.permissions.includes('test_rides.assign') ?? false}
            canSchedule={session?.permissions.includes('test_rides.schedule') ?? false}
          />
        </div>
      </div>
    </PermissionGate>
  );
}

function RideActions({
  detail,
  canAssign,
  canSchedule,
}: {
  detail: TestRideDetail;
  canAssign: boolean;
  canSchedule: boolean;
}) {
  const { api } = useAuth();
  const cache = useQueryClient();
  const ride = detail.ride;
  const [executive, setExecutive] = useState('');
  const [reason, setReason] = useState('Operational assignment');
  const [error, setError] = useState<string | null>(null);
  const executives = useQuery({
    queryKey: ['test-ride-executives', ride.branch_id],
    queryFn: () =>
      api.request<{ executives: Executive[] }>(
        `/test-rides/executives?branch_id=${ride.branch_id}`,
      ),
    enabled: canAssign,
  });
  const mutation = useMutation({
    mutationFn: ({ path, body }: { path: string; body: Record<string, unknown> }) =>
      api.request(`/test-rides/${ride.id}/${path}`, {
        body: JSON.stringify(body),
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        method: 'POST',
      }),
    onError: (caught) => setError(caught instanceof Error ? caught.message : 'Action failed.'),
    onSuccess: () => {
      setError(null);
      void cache.invalidateQueries({ queryKey: ['test-ride', ride.id] });
      void cache.invalidateQueries({ queryKey: ['test-rides'] });
    },
  });
  const act = (path: string, body: Record<string, unknown> = {}) =>
    mutation.mutate({ path, body: { expected_version: ride.version, ...body } });
  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Workflow actions</CardTitle>
        <CardDescription>
          Backend transition and version checks remain authoritative.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {canSchedule && ride.status === 'REQUESTED' ? (
          <Button className="w-full" disabled={mutation.isPending} onClick={() => act('book')}>
            Book vehicle and time
          </Button>
        ) : null}
        {canSchedule && ride.status === 'BOOKED' ? (
          <Button
            className="w-full"
            disabled={mutation.isPending}
            onClick={() =>
              act('confirm', { channel: 'CALL', confirmed_at: new Date().toISOString() })
            }
          >
            Record customer confirmation
          </Button>
        ) : null}
        {canAssign &&
        (ride.status === 'CUSTOMER_CONFIRMED' || ride.status === 'EXECUTIVE_ASSIGNED') ? (
          <div className="space-y-2">
            <Label htmlFor="ride-executive">Executive</Label>
            <Select onValueChange={(value) => value && setExecutive(value)} value={executive}>
              <SelectTrigger id="ride-executive">
                <SelectValue placeholder="Select executive" />
              </SelectTrigger>
              <SelectContent>
                {(executives.data?.executives ?? []).map((item) => (
                  <SelectItem key={item.membership_id} value={item.membership_id}>
                    {item.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label htmlFor="ride-assignment-reason">Reason</Label>
            <Input
              id="ride-assignment-reason"
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            />
            <Button
              className="w-full"
              disabled={!executive || !reason || mutation.isPending}
              onClick={() => act('assign', { executive_membership_id: executive, reason })}
            >
              {ride.status === 'EXECUTIVE_ASSIGNED' ? 'Reassign' : 'Assign'}
            </Button>
          </div>
        ) : null}
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        {ride.status === 'ACTIVE' ? (
          <p className="text-muted-foreground text-sm">
            Completion, manual tracking stop and no-show evidence are recorded by the assigned
            executive in mobile.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RideTimeline({ detail }: { detail: TestRideDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Append-only timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {detail.events.length === 0 ? (
          <p className="text-muted-foreground text-sm">No events.</p>
        ) : (
          <ol className="space-y-4 border-s ps-5">
            {detail.events.map((event) => (
              <li key={event.id}>
                <p className="text-sm font-medium">{event.event_type.replaceAll('_', ' ')}</p>
                <p className="text-muted-foreground text-xs">
                  {new Date(event.created_at).toLocaleString()} · {event.actor_name ?? 'System'}
                  {event.reason ? ` · ${event.reason}` : ''}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
