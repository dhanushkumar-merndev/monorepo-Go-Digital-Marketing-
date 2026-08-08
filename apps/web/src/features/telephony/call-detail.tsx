'use client';

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
import { Textarea } from '@gdm/ui/components/textarea';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, FileAudio, PhoneCall } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { TELEPHONY_CALL_OUTCOMES } from '@gdm/contracts';

import { useAuth } from '@/features/auth/auth-provider';
import { PermissionGate } from '@/features/auth/permission-gate';

interface CallDetailResponse {
  call: {
    id: string;
    lead_id: string;
    status: string;
    provider: string;
    outcome_requirement: string;
    duration_seconds: number | null;
    started_at: string | null;
    ended_at: string | null;
  };
  events: { id: string; event_type: string; occurred_at: string; status: string | null }[];
  outcome: {
    callback_follow_up_id: string | null;
    created_at: string;
    note: string | null;
    outcome: string;
  } | null;
  recordings: {
    id: string;
    availability: string;
    recorded_at: string | null;
    retention_expires_at: string | null;
    source: 'PROVIDER' | 'MANUAL_UPLOAD';
  }[];
  exception: { reason: string; created_at: string } | null;
}

export function CallDetail({ callId }: { callId: string }) {
  const { api, session } = useAuth();
  const cache = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['telephony', 'call', callId],
    queryFn: () => api.request<CallDetailResponse>(`/telephony/calls/${callId}`),
  });
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ['telephony'] });
    setMessage('Saved.');
  };
  const outcome = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.request(`/telephony/calls/${callId}/outcome`, {
        body: JSON.stringify(body),
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        method: 'POST',
      }),
    onSuccess: refresh,
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'Outcome was not recorded.'),
  });
  const exception = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.request(`/telephony/calls/${callId}/outcome-exception`, {
        body: JSON.stringify(body),
        method: 'POST',
      }),
    onSuccess: refresh,
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'Exception was not saved.'),
  });
  const recording = useMutation({
    mutationFn: (recordingId: string) =>
      api.request<{ url: string }>(`/telephony/calls/${callId}/recordings/${recordingId}/access`),
    onSuccess: (response) => {
      window.open(response.url, '_blank', 'noopener,noreferrer');
      setMessage('A short-lived private recording URL was issued.');
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'Recording is unavailable.'),
  });
  if (query.isPending)
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  if (query.isError || !query.data)
    return (
      <EmptyState
        action={<Button onClick={() => void query.refetch()}>Retry</Button>}
        description="This call may be outside your lead scope or the service is unavailable."
        icon={<AlertTriangle className="size-5" />}
        title="Unable to load call"
      />
    );
  const data = query.data;
  return (
    <PermissionGate permission="telephony.calls.read">
      <div className="space-y-6">
        <Link
          className="text-muted-foreground inline-flex items-center gap-2 text-sm hover:underline"
          href="/telephony"
        >
          <ArrowLeft className="size-4" />
          Back to calling
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Call detail</h1>
            <p className="text-muted-foreground text-sm">
              Lead {data.call.lead_id} · {data.call.provider}
            </p>
          </div>
          <div className="flex gap-2">
            <Badge>{data.call.status}</Badge>
            <Badge
              variant={data.call.outcome_requirement === 'REQUIRED' ? 'destructive' : 'secondary'}
            >
              {data.call.outcome_requirement.replaceAll('_', ' ')}
            </Badge>
          </div>
        </div>
        {message ? (
          <p className="rounded-md border p-3 text-sm" role="status">
            {message}
          </p>
        ) : null}
        <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PhoneCall className="size-5" /> Provider timeline
                </CardTitle>
                <CardDescription>
                  Provider statuses are preserved as append-only evidence.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.events.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No call events.</p>
                ) : (
                  <ol className="space-y-3 border-s ps-5">
                    {data.events.map((event) => (
                      <li className="relative" key={event.id}>
                        <span className="bg-primary absolute -start-[1.45rem] top-1 size-2 rounded-full" />
                        <p className="text-sm font-medium">{event.event_type}</p>
                        <p className="text-muted-foreground text-xs">
                          {new Date(event.occurred_at).toLocaleString()} ·{' '}
                          {event.status ?? 'Evidence'}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileAudio className="size-5" /> Recording access
                </CardTitle>
                <CardDescription>
                  Downloads require both recording permission and current consent/retention
                  validation.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.recordings.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No recording reference.</p>
                ) : (
                  data.recordings.map((item) => (
                    <div
                      className="flex items-center justify-between rounded-md border p-3"
                      key={item.id}
                    >
                      <span className="text-sm">
                        {item.source.replaceAll('_', ' ')} · {item.availability}
                      </span>
                      {session?.permissions.includes('telephony.recordings.read') ? (
                        <Button
                          disabled={item.availability !== 'AVAILABLE' || recording.isPending}
                          onClick={() => recording.mutate(item.id)}
                          size="sm"
                          variant="outline"
                        >
                          Open private recording
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-xs">Permission required</span>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
          <div className="space-y-6">
            <OutcomeCard
              call={data.call}
              onSubmit={(body) => outcome.mutate(body)}
              pending={outcome.isPending}
            />
            <PermissionGate permission="telephony.outcomes.override">
              <Card>
                <CardHeader>
                  <CardTitle>Supervisor exception</CardTitle>
                  <CardDescription>
                    Use only when a completed provider call cannot obtain an outcome. This is
                    audited.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    className="space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const values = new FormData(event.currentTarget);
                      exception.mutate({ reason: String(values.get('reason')) });
                    }}
                  >
                    <Label htmlFor="exception-reason">Reason</Label>
                    <Textarea id="exception-reason" name="reason" required />
                    <Button
                      disabled={data.call.outcome_requirement !== 'REQUIRED' || exception.isPending}
                      type="submit"
                      variant="outline"
                    >
                      Approve exception
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </PermissionGate>
          </div>
        </div>
      </div>
    </PermissionGate>
  );
}

function OutcomeCard({
  call,
  onSubmit,
  pending,
}: {
  call: CallDetailResponse['call'];
  onSubmit(body: Record<string, unknown>): void;
  pending: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Post-call outcome</CardTitle>
        <CardDescription>
          Completed provider calls require an outcome unless a supervisor records an exception.
          Callback creates a lead follow-up.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            const selection = String(values.get('outcome'));
            onSubmit({
              callback_due_at:
                selection === 'CALLBACK' && values.get('callback_due_at')
                  ? new Date(String(values.get('callback_due_at'))).toISOString()
                  : null,
              note: String(values.get('note')) || null,
              outcome: selection,
            });
          }}
        >
          <Label htmlFor="call-outcome">Outcome</Label>
          <Select defaultValue="INTERESTED" name="outcome">
            <SelectTrigger id="call-outcome">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TELEPHONY_CALL_OUTCOMES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value.replaceAll('_', ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label htmlFor="callback-due">Callback due (required only for Callback)</Label>
          <Input id="callback-due" name="callback_due_at" type="datetime-local" />
          <Label htmlFor="outcome-note">Note</Label>
          <Textarea id="outcome-note" name="note" />
          <Button
            disabled={
              pending ||
              call.outcome_requirement === 'EXCEPTION' ||
              call.outcome_requirement === 'RECORDED'
            }
            type="submit"
          >
            {pending ? 'Recording…' : 'Record outcome'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
