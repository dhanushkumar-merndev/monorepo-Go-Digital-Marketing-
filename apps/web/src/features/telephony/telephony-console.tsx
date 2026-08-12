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
import {
  Activity,
  AlertTriangle,
  FileAudio,
  PhoneCall,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { useAuth } from '@/features/auth/auth-provider';
import { PermissionGate } from '@/features/auth/permission-gate';
import { PageHeader } from '@/components/page-header';
import { ServerPagination, type PageMetadata } from '@/components/server-pagination';
import { useDebouncedValue } from '@/features/analytics/use-debounced-value';

interface ConnectionResponse {
  connection: {
    connection_key: string;
    display_name: string;
    last_health_at: string | null;
    last_reconciled_at: string | null;
    last_webhook_at: string | null;
    provider: string;
    status: 'ACTIVE' | 'DISABLED' | 'PENDING_APPROVAL' | 'DEGRADED';
  } | null;
}

interface HealthResponse {
  configured: boolean;
  detail?: string | null;
  healthy: boolean;
  webhook_last_at: string | null;
}

interface CallSummary {
  created_at: string;
  duration_seconds: number | null;
  id: string;
  lead_id: string;
  origin: 'PROVIDER' | 'TEL_FALLBACK' | 'MANUAL_UPLOAD';
  outcome_requirement: 'NOT_REQUIRED' | 'REQUIRED' | 'RECORDED' | 'EXCEPTION';
  provider: string;
  status: string;
}

interface RecordingTarget {
  consent_record_id: string | null;
  contact_id: string;
  contact_name: string;
  email: string | null;
  lead_id: string;
  phone: string;
}

export function TelephonyConsole() {
  const { api, session } = useAuth();
  const cache = useQueryClient();
  const [missingOnly, setMissingOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [message, setMessage] = useState<string | null>(null);
  const connection = useQuery({
    queryKey: ['telephony', 'connection'],
    queryFn: () => api.request<ConnectionResponse>('/telephony/connections'),
    enabled: session?.permissions.includes('telephony.connections.manage') ?? false,
  });
  const health = useQuery({
    queryKey: ['telephony', 'health'],
    queryFn: () => api.request<HealthResponse>('/telephony/health'),
    enabled: session?.permissions.includes('telephony.health.read') ?? false,
  });
  const calls = useQuery({
    queryKey: ['telephony', 'calls', missingOnly, page, pageSize],
    queryFn: () =>
      api.request<{ calls: CallSummary[]; pagination: PageMetadata }>(
        `/telephony/calls?missing_outcome=${String(missingOnly)}&limit=${String(pageSize)}&page=${String(page)}`,
      ),
  });
  const configure = useMutation({
    mutationFn: (active: boolean) =>
      api.request<ConnectionResponse>('/telephony/connections/development', {
        body: JSON.stringify({ active, display_name: 'Development telephony' }),
        method: 'PUT',
      }),
    onSuccess: () => {
      setMessage('Development connection updated. No live provider credentials were stored.');
      void cache.invalidateQueries({ queryKey: ['telephony'] });
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'Connection update failed.'),
  });
  const reconcile = useMutation({
    mutationFn: () =>
      api.request<{ recovered_events: number }>('/telephony/reconcile', { method: 'POST' }),
    onSuccess: (result) => {
      setMessage(
        `Reconciliation processed successfully; recovered ${String(result.recovered_events)} event(s).`,
      );
      void cache.invalidateQueries({ queryKey: ['telephony'] });
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'Reconciliation failed.'),
  });

  return (
    <PermissionGate permission="telephony.calls.read">
      <div className="space-y-6">
        <PageHeader
          description="Provider events are authoritative. The development adapter is only for safe contract testing; normal users can focus on customer calls and outcomes."
          eyebrow="Phase 4"
          title="Calling workspace"
        />
        {message ? (
          <p className="rounded-md border p-3 text-sm" role="status">
            {message}
          </p>
        ) : null}
        <div className="grid gap-6 lg:grid-cols-2">
          <ConnectionCard
            connection={connection}
            disabled={configure.isPending}
            onChange={(active) => configure.mutate(active)}
          />
          <HealthCard
            health={health}
            onReconcile={() => reconcile.mutate()}
            pending={reconcile.isPending}
          />
        </div>
        <PermissionGate permission="telephony.recordings.upload">
          <ManualRecordingUpload onMessage={setMessage} />
        </PermissionGate>
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <PhoneCall className="size-5" /> Call timeline
              </CardTitle>
              <CardDescription>
                Only calls linked to leads in your current tenant and assignment scope appear here.
              </CardDescription>
            </div>
            <Button
              aria-pressed={missingOnly}
              onClick={() => {
                setMissingOnly((value) => !value);
                setPage(1);
              }}
              size="sm"
              variant={missingOnly ? 'default' : 'outline'}
            >
              Missing outcomes
            </Button>
          </CardHeader>
          <CardContent>
            {calls.isPending ? <CallSkeleton /> : null}
            {calls.isError ? (
              <RetryState onRetry={() => void calls.refetch()} title="Unable to load calls" />
            ) : null}
            {calls.data && calls.data.calls.length === 0 ? (
              <EmptyState
                description="Calls and missing outcome work will appear here after provider or tel: activity."
                icon={<PhoneCall className="size-5" />}
                title="No calls found"
              />
            ) : null}
            {calls.data && calls.data.calls.length > 0 ? (
              <div className="divide-y rounded-md border">
                {calls.data.calls.map((call) => (
                  <Link
                    className="hover:bg-muted/50 block p-4"
                    href={`/telephony/calls/${call.id}`}
                    key={call.id}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {call.status.replaceAll('_', ' ')} · {call.provider}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {new Date(call.created_at).toLocaleString()} · Lead {call.lead_id}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="outline">{call.origin.replaceAll('_', ' ')}</Badge>
                        <Badge
                          variant={
                            call.outcome_requirement === 'REQUIRED' ? 'destructive' : 'secondary'
                          }
                        >
                          {call.outcome_requirement.replaceAll('_', ' ')}
                        </Badge>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : null}
            {calls.data ? (
              <ServerPagination
                metadata={calls.data.pagination}
                onPage={setPage}
                onPageSize={(value) => {
                  setPageSize(value);
                  setPage(1);
                }}
              />
            ) : null}
          </CardContent>
        </Card>
      </div>
    </PermissionGate>
  );
}

function ManualRecordingUpload({ onMessage }: { onMessage(message: string): void }) {
  const { api } = useAuth();
  const cache = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [target, setTarget] = useState<RecordingTarget | null>(null);
  const targets = useQuery({
    queryKey: ['telephony', 'recording-targets', debouncedSearch],
    queryFn: () =>
      api.request<{ targets: RecordingTarget[] }>(
        `/telephony/recording-targets?search=${encodeURIComponent(debouncedSearch)}`,
      ),
    enabled: debouncedSearch.trim().length >= 2,
  });
  const upload = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      if (!target) throw new Error('Select an authorized Lead before uploading.');
      if (!target.consent_record_id)
        throw new Error('This Contact has no active recording consent. Upload is blocked.');
      const values = new FormData(form);
      const file = values.get('recording');
      if (!(file instanceof File) || file.size === 0)
        throw new Error('Choose a non-empty audio file.');
      const contentType = file.type.toLowerCase();
      const outcome = values.get('outcome');
      if (
        !['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/wave'].includes(contentType)
      )
        throw new Error('Choose an MP3, M4A/MP4, or WAV audio file.');
      const begin = await api.request<{
        recording_id: string;
        upload: { method: 'PUT'; url: string };
      }>('/telephony/recordings/manual-uploads', {
        body: JSON.stringify({
          call_date_at: new Date(String(values.get('call_date_at'))).toISOString(),
          call_direction: String(values.get('call_direction')),
          consent_record_id: target.consent_record_id,
          content_length: file.size,
          content_type: contentType,
          duration_seconds: values.get('duration_seconds')
            ? Number(values.get('duration_seconds'))
            : null,
          lead_id: target.lead_id,
          notes: String(values.get('notes')) || null,
          original_filename: file.name,
          outcome: typeof outcome === 'string' && outcome ? outcome : null,
        }),
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        method: 'POST',
      });
      const stored = await fetch(begin.upload.url, {
        body: file,
        headers: { 'Content-Type': contentType },
        method: begin.upload.method,
      });
      if (!stored.ok) throw new Error('Private object storage rejected the recording upload.');
      await api.request(`/telephony/recordings/${begin.recording_id}/complete`, {
        body: JSON.stringify({
          expected_content_length: file.size,
          expected_content_type: contentType,
        }),
        method: 'POST',
      });
    },
    onSuccess: () => {
      onMessage('Recording uploaded and linked to the selected Lead.');
      void cache.invalidateQueries({ queryKey: ['telephony'] });
    },
    onError: (error) =>
      onMessage(error instanceof Error ? error.message : 'Recording upload failed.'),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileAudio className="size-5" /> Upload call recording
        </CardTitle>
        <CardDescription>
          Upload an already-obtained recording only with active recording consent. This is not SIM
          or microphone capture; the file stays private in object storage.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 lg:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            upload.mutate(event.currentTarget);
          }}
        >
          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="recording-target-search">Find Lead or Contact</Label>
            <Input
              id="recording-target-search"
              onChange={(event) => {
                setSearch(event.target.value);
                setTarget(null);
              }}
              placeholder="Lead ID, customer name, phone, or email"
              value={search}
            />
            {targets.isFetching ? (
              <p className="text-muted-foreground text-xs">Searching…</p>
            ) : null}
            {targets.data?.targets.map((item) => (
              <Button
                className="mt-2 mr-2"
                key={item.lead_id}
                onClick={() => setTarget(item)}
                size="sm"
                type="button"
                variant={target?.lead_id === item.lead_id ? 'default' : 'outline'}
              >
                {item.contact_name} · {item.phone}
              </Button>
            ))}
            {target && !target.consent_record_id ? (
              <p className="text-destructive text-xs">
                No active recording consent for this Contact.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="recording-file">Audio file</Label>
            <Input
              accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/wave"
              id="recording-file"
              name="recording"
              required
              type="file"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recording-date">Call date/time</Label>
            <Input
              defaultValue={new Date().toISOString().slice(0, 16)}
              id="recording-date"
              name="call_date_at"
              required
              type="datetime-local"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recording-direction">Direction</Label>
            <Select defaultValue="OUTBOUND" name="call_direction">
              <SelectTrigger id="recording-direction">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OUTBOUND">Outbound</SelectItem>
                <SelectItem value="INBOUND">Inbound</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="recording-duration">Duration seconds (optional)</Label>
            <Input id="recording-duration" min="0" name="duration_seconds" type="number" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recording-outcome">Outcome (optional)</Label>
            <Select name="outcome">
              <SelectTrigger id="recording-outcome">
                <SelectValue placeholder="No outcome" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INTERESTED">Interested</SelectItem>
                <SelectItem value="NO_ANSWER">No answer</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="recording-notes">Notes</Label>
            <Textarea id="recording-notes" name="notes" />
          </div>
          <div className="flex items-end lg:col-span-2">
            <Button disabled={upload.isPending || !target?.consent_record_id} type="submit">
              {upload.isPending ? 'Uploading…' : 'Upload recording'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ConnectionCard({
  connection,
  disabled,
  onChange,
}: {
  connection: ReturnType<typeof useQuery<ConnectionResponse>>;
  disabled: boolean;
  onChange(active: boolean): void;
}) {
  if (connection.isPending)
    return (
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  if (connection.isError)
    return (
      <Card>
        <CardContent className="p-6">
          <RetryState onRetry={() => void connection.refetch()} title="Connection unavailable" />
        </CardContent>
      </Card>
    );
  const current = connection.data?.connection;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connection configuration</CardTitle>
        <CardDescription>
          Only the signed development adapter is configurable in this phase.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-md border p-3">
          <div>
            <p className="text-sm font-medium">Development adapter</p>
            <p className="text-muted-foreground text-xs">
              No provider secret is exposed to this browser.
            </p>
          </div>
          <Button
            aria-pressed={current?.status === 'ACTIVE'}
            disabled={disabled}
            onClick={() => onChange(current?.status !== 'ACTIVE')}
            size="sm"
            variant={current?.status === 'ACTIVE' ? 'default' : 'outline'}
          >
            {current?.status === 'ACTIVE' ? 'Enabled' : 'Enable'}
          </Button>
        </div>
        {current ? (
          <p className="text-muted-foreground text-xs">
            Webhook key: {current.connection_key} · Last reconciliation:{' '}
            {current.last_reconciled_at
              ? new Date(current.last_reconciled_at).toLocaleString()
              : 'Never'}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            Not configured. Enable it to exercise provider-call and webhook flows in development.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function HealthCard({
  health,
  onReconcile,
  pending,
}: {
  health: ReturnType<typeof useQuery<HealthResponse>>;
  onReconcile(): void;
  pending: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="size-5" /> Webhook health and reconciliation
        </CardTitle>
        <CardDescription>
          Missed provider events are restored idempotently without duplicating call evidence.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {health.isPending ? <Skeleton className="h-12 w-full" /> : null}
        {health.isError ? (
          <RetryState onRetry={() => void health.refetch()} title="Health unavailable" />
        ) : null}
        {health.data ? (
          <div className="flex items-start gap-3 rounded-md border p-3">
            <ShieldCheck className="text-primary mt-0.5 size-5" />
            <div>
              <p className="font-medium">
                {health.data.healthy ? 'Adapter healthy' : 'Adapter unavailable'}
              </p>
              <p className="text-muted-foreground text-xs">
                {health.data.detail ?? 'No health detail is available.'}
              </p>
            </div>
          </div>
        ) : null}
        <Button
          disabled={pending || !health.data?.configured}
          onClick={onReconcile}
          variant="outline"
        >
          <RefreshCw data-icon="inline-start" />
          {pending ? 'Reconciling…' : 'Run reconciliation'}
        </Button>
      </CardContent>
    </Card>
  );
}

function RetryState({ onRetry, title }: { onRetry(): void; title: string }) {
  return (
    <EmptyState
      action={
        <Button onClick={onRetry} variant="outline">
          Retry
        </Button>
      }
      description="No success state has been inferred; try again when the service is reachable."
      icon={<AlertTriangle className="size-5" />}
      title={title}
    />
  );
}

function CallSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}
