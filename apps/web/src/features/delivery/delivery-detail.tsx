'use client';

import type { DeliverySummary } from '@gdm/contracts';
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
import { Textarea } from '@gdm/ui/components/textarea';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Download,
  MapPinned,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/features/auth/auth-provider';
import { PermissionGate } from '@/features/auth/permission-gate';

interface DeliveryDetail {
  checklist: {
    checked: boolean;
    checked_at: string | null;
    code: string;
    note: string | null;
    required: boolean;
  }[];
  delivery: DeliverySummary;
  events: {
    actor_name: string | null;
    created_at: string;
    event_type: string;
    from_status: string | null;
    id: string;
    reason: string | null;
    to_status: string;
  }[];
  proofs: {
    created_at: string;
    file_name: string | null;
    id: string;
    proof_type: string;
    received_by: string | null;
    scanner_status: string | null;
    status: string;
  }[];
  required_proof_types: string[];
  reschedule: { requested_for: string | null; status: string };
  tracking_expires_at: string | null;
}

interface Executive {
  display_name: string;
  membership_id: string;
  user_id: string;
}

function headers(): HeadersInit {
  return { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() };
}

export function DeliveryDetailView({ jobId }: { jobId: string }) {
  const { api, session } = useAuth();
  const query = useQuery({
    queryKey: ['delivery', jobId],
    queryFn: () => api.request<DeliveryDetail>(`/delivery/${jobId}`),
  });
  if (query.isPending)
    return (
      <div aria-label="Loading delivery" className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  if (query.isError || !query.data)
    return (
      <EmptyState
        action={
          <Button onClick={() => void query.refetch()} variant="outline">
            <RefreshCw data-icon="inline-start" />
            Retry
          </Button>
        }
        description="This job is unavailable or outside your branch scope."
        icon={<TriangleAlert className="size-5" />}
        title="Delivery unavailable"
      />
    );
  const detail = query.data;
  const job = detail.delivery;
  return (
    <PermissionGate permission="delivery.jobs.read">
      <div className="space-y-6">
        <PageHeader
          actions={
            <Link className={buttonVariants({ variant: 'outline' })} href="/deliveries">
              <ArrowLeft data-icon="inline-start" />
              Deliveries
            </Link>
          }
          description={`${job.booking_reference} - ${new Date(job.scheduled_for).toLocaleString()}`}
          eyebrow="Delivery operation"
          title={job.customer_name}
        />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_23rem]">
          <div className="space-y-4">
            <DeliveryFacts detail={detail} />
            <Checklist
              detail={detail}
              canManage={session?.permissions.includes('delivery.checklists.manage') ?? false}
            />
            <ProofReview
              detail={detail}
              canReview={session?.permissions.includes('delivery.proofs.review') ?? false}
            />
            <Timeline detail={detail} />
          </div>
          <DeliveryActions detail={detail} permissions={session?.permissions ?? []} />
        </div>
      </div>
    </PermissionGate>
  );
}

function DeliveryFacts({ detail }: { detail: DeliveryDetail }) {
  const job = detail.delivery;
  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>{job.vehicle_label}</CardTitle>
              <CardDescription>{job.destination_address}</CardDescription>
            </div>
            <Badge variant={['DELAYED', 'FAILED'].includes(job.status) ? 'destructive' : 'outline'}>
              {job.status.replaceAll('_', ' ')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <Fact label="Customer phone" value={job.phone_e164} />
          <Fact label="Executive" value={job.assigned_name ?? 'Unassigned'} />
          <Fact label="Required proof" value={detail.required_proof_types.join(', ')} />
          <Fact
            label="Tracking"
            value={
              job.tracking_active
                ? `Active until ${detail.tracking_expires_at ? new Date(detail.tracking_expires_at).toLocaleString() : 'timeout'}`
                : 'Stopped / not started'
            }
          />
        </CardContent>
      </Card>
      {job.last_location ? (
        <Card>
          <CardHeader>
            <CardTitle>Latest active-job location</CardTitle>
            <CardDescription>
              {new Date(job.last_location.captured_at).toLocaleString()} - accuracy +/-
              {Math.round(job.last_location.accuracy_m)} m
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Badge variant={job.last_location.stale ? 'destructive' : 'secondary'}>
              {job.last_location.stale ? 'STALE' : 'CURRENT'}
            </Badge>
            <a
              className={buttonVariants({ variant: 'outline' })}
              href={`https://www.google.com/maps/search/?api=1&query=${job.last_location.latitude},${job.last_location.longitude}`}
              rel="noreferrer"
              target="_blank"
            >
              <MapPinned data-icon="inline-start" />
              Open map
            </a>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function Checklist({ detail, canManage }: { detail: DeliveryDetail; canManage: boolean }) {
  const { api } = useAuth();
  const cache = useQueryClient();
  const job = detail.delivery;
  const mutation = useMutation({
    mutationFn: ({ checked, code }: { checked: boolean; code: string }) =>
      api.request(`/delivery/${job.id}/checklist`, {
        body: JSON.stringify({ checked, code, expected_version: job.version, note: null }),
        headers: headers(),
        method: 'POST',
      }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ['delivery', job.id] }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preparation readiness</CardTitle>
        <CardDescription>
          Accessories, PDI and vehicle/document condition remain operational state, separate from
          the Lead pipeline.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {detail.checklist.map((item) => (
          <Button
            disabled={
              !canManage ||
              mutation.isPending ||
              !['VEHICLE_ALLOCATED', 'VEHICLE_PREPARATION'].includes(job.status)
            }
            key={item.code}
            onClick={() => mutation.mutate({ checked: !item.checked, code: item.code })}
            variant={item.checked ? 'default' : 'outline'}
          >
            {item.checked ? 'Complete: ' : 'Pending: '}
            {item.code.replaceAll('_', ' ')}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

function ProofReview({ detail, canReview }: { detail: DeliveryDetail; canReview: boolean }) {
  const { api } = useAuth();
  const cache = useQueryClient();
  const [reason, setReason] = useState('Proof reviewed against the delivery record.');
  const review = useMutation({
    mutationFn: ({ decision, proofId }: { decision: 'REJECTED' | 'VERIFIED'; proofId: string }) =>
      api.request(`/delivery/proofs/${proofId}/review`, {
        body: JSON.stringify({ decision, reason }),
        headers: headers(),
        method: 'POST',
      }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ['delivery', detail.delivery.id] }),
  });
  const download = useMutation({
    mutationFn: (proofId: string) =>
      api.request<{ download_url: string; expires_at: string }>(
        `/delivery/proofs/${proofId}/download?purpose=${encodeURIComponent('Manager proof review')}`,
      ),
    onSuccess: (result) => window.open(result.download_url, '_blank', 'noopener,noreferrer'),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Private completion proof</CardTitle>
        <CardDescription>
          Signed downloads are short-lived and every access is audited. Permanent RC is not a
          delivery prerequisite.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {canReview ? (
          <div className="space-y-1">
            <Label htmlFor="proof-review-reason">Review reason</Label>
            <Textarea
              id="proof-review-reason"
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            />
          </div>
        ) : null}
        {detail.proofs.length === 0 ? (
          <p className="text-muted-foreground text-sm">No proof captured yet.</p>
        ) : (
          detail.proofs.map((proof) => (
            <div
              className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
              key={proof.id}
            >
              <div>
                <p className="font-medium">{proof.proof_type.replaceAll('_', ' ')}</p>
                <p className="text-muted-foreground text-xs">
                  {proof.received_by ?? proof.file_name ?? 'Protected evidence'} - {proof.status}
                  {proof.scanner_status ? ` / scan ${proof.scanner_status}` : ''}
                </p>
              </div>
              {canReview ? (
                <div className="flex flex-wrap gap-2">
                  {proof.file_name ? (
                    <Button
                      disabled={download.isPending}
                      onClick={() => download.mutate(proof.id)}
                      size="sm"
                      variant="outline"
                    >
                      <Download data-icon="inline-start" />
                      Download
                    </Button>
                  ) : null}
                  {proof.status === 'PENDING_SCAN' ? (
                    <>
                      <Button
                        disabled={!reason || proof.scanner_status !== 'CLEAN' || review.isPending}
                        onClick={() => review.mutate({ decision: 'VERIFIED', proofId: proof.id })}
                        size="sm"
                      >
                        <ShieldCheck data-icon="inline-start" />
                        Verify
                      </Button>
                      <Button
                        disabled={!reason || review.isPending}
                        onClick={() => review.mutate({ decision: 'REJECTED', proofId: proof.id })}
                        size="sm"
                        variant="destructive"
                      >
                        Reject
                      </Button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function DeliveryActions({
  detail,
  permissions,
}: {
  detail: DeliveryDetail;
  permissions: string[];
}) {
  const { api } = useAuth();
  const cache = useQueryClient();
  const job = detail.delivery;
  const [executive, setExecutive] = useState(job.assigned_membership_id ?? '');
  const [reason, setReason] = useState('Operational delivery update.');
  const [scheduledFor, setScheduledFor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const canAssign = permissions.includes('delivery.jobs.assign');
  const canManage = permissions.includes('delivery.jobs.manage');
  const canCancel = permissions.includes('delivery.jobs.cancel');
  const canApprove = permissions.includes('delivery.reschedules.approve');
  const executives = useQuery({
    queryKey: ['delivery-executives', job.branch_id],
    queryFn: () =>
      api.request<{ executives: Executive[] }>(`/delivery/executives?branch_id=${job.branch_id}`),
    enabled: canAssign,
  });
  const mutation = useMutation({
    mutationFn: ({ body, path }: { body: Record<string, unknown>; path: string }) =>
      api.request(`/delivery/${job.id}/${path}`, {
        body: JSON.stringify({ expected_version: job.version, ...body }),
        headers: headers(),
        method: 'POST',
      }),
    onError: (caught) => setError(caught instanceof Error ? caught.message : 'Action rejected.'),
    onSuccess: () => {
      setError(null);
      void cache.invalidateQueries({ queryKey: ['delivery', job.id] });
      void cache.invalidateQueries({ queryKey: ['deliveries'] });
    },
  });
  const act = (path: string, body: Record<string, unknown> = {}) => mutation.mutate({ body, path });
  const prep = ['VEHICLE_ALLOCATED', 'VEHICLE_PREPARATION'].includes(job.status);
  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Manager controls</CardTitle>
        <CardDescription>
          Versioned API transitions reject stale or invalid workflow changes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {canAssign && !['DELIVERED', 'CANCELLED'].includes(job.status) ? (
          <div className="space-y-2">
            <Label htmlFor="delivery-executive">Delivery executive</Label>
            <Select onValueChange={(value) => value && setExecutive(value)} value={executive}>
              <SelectTrigger id="delivery-executive">
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
            <Button
              className="w-full"
              disabled={!executive || !reason || mutation.isPending}
              onClick={() => act('assign', { assigned_membership_id: executive, reason })}
            >
              {job.assigned_membership_id ? 'Reassign' : 'Assign'}
            </Button>
          </div>
        ) : null}
        {canManage && prep ? (
          <Button
            className="w-full"
            disabled={
              mutation.isPending || detail.checklist.some((item) => item.required && !item.checked)
            }
            onClick={() => act('ready')}
          >
            Mark ready for delivery
          </Button>
        ) : null}
        {canManage && job.status === 'READY_FOR_DELIVERY' ? (
          <div className="space-y-2">
            <Label htmlFor="delivery-schedule">Schedule</Label>
            <Input
              id="delivery-schedule"
              onChange={(event) => setScheduledFor(event.target.value)}
              type="datetime-local"
              value={scheduledFor}
            />
            <Button
              className="w-full"
              disabled={!scheduledFor || mutation.isPending}
              onClick={() =>
                act('schedule', { scheduled_for: new Date(scheduledFor).toISOString() })
              }
            >
              Schedule delivery
            </Button>
          </div>
        ) : null}
        {canApprove && detail.reschedule.status === 'PENDING' ? (
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">
              Requested:{' '}
              {detail.reschedule.requested_for
                ? new Date(detail.reschedule.requested_for).toLocaleString()
                : 'No time'}
            </p>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={!reason || mutation.isPending}
                onClick={() => act('reschedule-decision', { decision: 'APPROVED', reason })}
              >
                Approve
              </Button>
              <Button
                className="flex-1"
                disabled={!reason || mutation.isPending}
                onClick={() => act('reschedule-decision', { decision: 'REJECTED', reason })}
                variant="destructive"
              >
                Reject
              </Button>
            </div>
          </div>
        ) : null}
        {canAssign || canManage || canCancel || canApprove ? (
          <div className="space-y-1">
            <Label htmlFor="delivery-action-reason">Mandatory reason</Label>
            <Textarea
              id="delivery-action-reason"
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            />
          </div>
        ) : null}
        {canCancel && !['DELIVERED', 'CANCELLED'].includes(job.status) ? (
          <Button
            className="w-full"
            disabled={!reason || mutation.isPending}
            onClick={() => act('cancel', { reason })}
            variant="destructive"
          >
            Cancel delivery
          </Button>
        ) : null}
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Timeline({ detail }: { detail: DeliveryDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Immutable delivery timeline</CardTitle>
        <CardDescription>
          Workflow changes retain actor, reason and exact transition.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {detail.events.map((event) => (
          <div className="border-primary border-l-2 pl-3" key={event.id}>
            <p className="font-medium">{event.event_type.replaceAll('_', ' ')}</p>
            <p className="text-muted-foreground text-xs">
              {new Date(event.created_at).toLocaleString()} - {event.actor_name ?? 'System'} -{' '}
              {(event.from_status ?? 'CREATED').replaceAll('_', ' ')} to{' '}
              {event.to_status.replaceAll('_', ' ')}
            </p>
            {event.reason ? <p className="mt-1 text-sm">{event.reason}</p> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs font-medium uppercase">{label}</p>
      <p className="mt-1">{value}</p>
    </div>
  );
}
