'use client';

import { Button, buttonVariants } from '@gdm/ui/components/button';
import { Badge } from '@gdm/ui/components/badge';
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
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileUp,
  History,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent, type ReactNode } from 'react';

import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/features/auth/auth-provider';
import { PermissionGate } from '@/features/auth/permission-gate';
import {
  commandHeaders,
  errorMessage,
  type RegistrationDetailResponse,
} from './registration-types';

interface CommandInput {
  body: Record<string, unknown>;
  path: string;
}

export function RegistrationDetail({ caseId }: { caseId: string }) {
  const { api, session } = useAuth();
  const cache = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: ['registration-case', caseId],
    queryFn: () => api.request<RegistrationDetailResponse>(`/registration-cases/${caseId}`),
  });
  const mutation = useMutation({
    mutationFn: ({ body, path }: CommandInput) =>
      api.request(`/registration-cases/${caseId}/${path}`, {
        method: 'POST',
        headers: commandHeaders(),
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setMessage('Saved.');
      void cache.invalidateQueries({ queryKey: ['registration-case', caseId] });
      void cache.invalidateQueries({ queryKey: ['registration-cases'] });
      void cache.invalidateQueries({ queryKey: ['registration-aging'] });
    },
    onError: (error) => setMessage(errorMessage(error)),
  });

  if (detail.isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  if (detail.isError || !detail.data)
    return (
      <EmptyState
        title="Registration case unavailable"
        description={detail.error?.message ?? 'The case could not be loaded.'}
        action={
          <Link className={buttonVariants()} href="/registrations">
            Back to queue
          </Link>
        }
      />
    );
  const data = detail.data;
  const item = data.case;
  const latestRcDelivery = data.rc_delivery_records[0];
  const permissions = session?.permissions ?? [];
  const canExecute = permissions.includes('registration.cases.execute');

  const submit = (
    path: string,
    form: HTMLFormElement,
    transform: (data: FormData) => Record<string, unknown>,
  ) => {
    setMessage(null);
    mutation.mutate({
      path,
      body: { expected_version: item.version, ...transform(new FormData(form)) },
    });
  };

  return (
    <PermissionGate permission="registration.cases.read">
      <div className="space-y-6">
        <Link className={buttonVariants({ variant: 'ghost' })} href="/registrations">
          <ArrowLeft data-icon="inline-start" />
          Registration queue
        </Link>
        <PageHeader
          description={`${item.customer_name} · ${item.vehicle_label}`}
          eyebrow={item.booking_reference}
          title="Registration case"
        />
        <div className="grid gap-4 md:grid-cols-4">
          <Fact label="Status">
            <Badge variant={item.aging.overdue ? 'destructive' : 'secondary'}>
              {item.status.replaceAll('_', ' ')}
            </Badge>
          </Fact>
          <Fact label="Owner">{item.assigned_name ?? 'Unassigned'}</Fact>
          <Fact label="Aging">
            <span className={item.aging.overdue ? 'text-destructive font-medium' : ''}>
              {item.aging.age_hours}h / {item.aging.sla_hours || '—'}h
            </span>
          </Fact>
          <Fact label="Delivery">
            {data.delivery ? data.delivery.status.replaceAll('_', ' ') : 'Not scheduled'}
          </Fact>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>RTO record</CardTitle>
            <CardDescription>
              Registration and delivery are displayed together but advance on independent histories.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <Fact label="RTO">
              {item.rto_name ? `${item.rto_name} (${item.rto_code})` : 'Not recorded'}
            </Fact>
            <Fact label="Application">{item.application_number ?? 'Not recorded'}</Fact>
            <Fact label="Expected completion">
              {item.expected_completion_at
                ? new Date(item.expected_completion_at).toLocaleString()
                : 'Not recorded'}
            </Fact>
            <Fact label="Temporary number">
              {item.temporary_registration_number ?? 'Not allotted'}
            </Fact>
            <Fact label="Permanent number">
              {item.permanent_registration_number ?? 'Not allotted'}
            </Fact>
            <Fact label="RC delivery evidence">
              {latestRcDelivery
                ? `${latestRcDelivery.delivery_mode} · ${latestRcDelivery.recipient}`
                : 'Not delivered'}
            </Fact>
          </CardContent>
        </Card>
        {message ? (
          <p
            aria-live="polite"
            className={
              message === 'Saved.' ? 'text-sm text-emerald-700' : 'text-destructive text-sm'
            }
          >
            {message}
          </p>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-2">
          {permissions.includes('registration.cases.assign') ? (
            <AssignmentCard
              branchId={item.branch_id}
              current={item.assigned_membership_id}
              disabled={mutation.isPending}
              onSubmit={(form) =>
                submit('assign', form, (fd) => ({
                  assigned_membership_id: String(fd.get('assigned_membership_id')),
                  reason: String(fd.get('reason')),
                }))
              }
            />
          ) : null}
          {canExecute && ['DOCUMENTS_READY', 'REOPENED'].includes(item.status) ? (
            <ActionCard
              title="Start registration"
              description="Confirms the required registration documents and starts workflow aging."
              button="Start registration"
              disabled={mutation.isPending}
              onSubmit={(form) =>
                submit('start', form, (fd) => ({
                  application_started_at: new Date(
                    String(fd.get('application_started_at')),
                  ).toISOString(),
                  document_checklist_confirmed: true,
                }))
              }
            >
              <Field
                label="Application started at"
                name="application_started_at"
                type="datetime-local"
                required
              />
            </ActionCard>
          ) : null}
          {canExecute && item.status === 'REGISTRATION_STARTED' ? (
            <ActionCard
              title="Submit to RTO"
              description="Records the government office and application reference without attempting government automation."
              button="Record submission"
              disabled={mutation.isPending}
              onSubmit={(form) =>
                submit('rto-submit', form, (fd) => ({
                  application_number: String(fd.get('application_number')),
                  expected_completion_at: new Date(
                    String(fd.get('expected_completion_at')),
                  ).toISOString(),
                  rto_code: String(fd.get('rto_code')),
                  rto_name: String(fd.get('rto_name')),
                  submitted_at: new Date(String(fd.get('submitted_at'))).toISOString(),
                }))
              }
            >
              <Field label="RTO name" name="rto_name" required />
              <Field label="RTO code" name="rto_code" required />
              <Field label="Application number" name="application_number" required />
              <Field label="Submitted at" name="submitted_at" type="datetime-local" required />
              <Field
                label="Expected completion"
                name="expected_completion_at"
                type="datetime-local"
                required
              />
            </ActionCard>
          ) : null}
          {canExecute && item.status === 'RTO_SUBMITTED' ? (
            <ActionCard
              title="Record number allotment"
              description="Evidence and at least one temporary or permanent number are mandatory."
              button="Record allotment"
              disabled={mutation.isPending}
              onSubmit={(form) =>
                submit('number-allotment', form, (fd) => ({
                  allotted_at: new Date(String(fd.get('allotted_at'))).toISOString(),
                  evidence_reference: String(fd.get('evidence_reference')),
                  permanent_registration_number:
                    String(fd.get('permanent_registration_number') || '') || null,
                  temporary_registration_number:
                    String(fd.get('temporary_registration_number') || '') || null,
                }))
              }
            >
              <Field label="Temporary registration" name="temporary_registration_number" />
              <Field label="Permanent registration" name="permanent_registration_number" />
              <Field label="Allotted at" name="allotted_at" type="datetime-local" required />
              <Field label="Evidence reference" name="evidence_reference" required />
            </ActionCard>
          ) : null}
          {canExecute && ['RTO_SUBMITTED', 'NUMBER_ALLOTTED'].includes(item.status) ? (
            <ActionCard
              title="Mark RC pending"
              description="A reason and revised expected date feed manager aging queues."
              button="Mark pending"
              disabled={mutation.isPending}
              onSubmit={(form) =>
                submit('rc-pending', form, (fd) => ({
                  expected_completion_at: new Date(
                    String(fd.get('expected_completion_at')),
                  ).toISOString(),
                  reason: String(fd.get('reason')),
                }))
              }
            >
              <Field label="Pending reason" name="reason" required />
              <Field
                label="Revised expected date"
                name="expected_completion_at"
                type="datetime-local"
                required
              />
            </ActionCard>
          ) : null}
          {permissions.includes('registration.documents.upload') &&
          ['NUMBER_ALLOTTED', 'RC_PENDING', 'RC_RECEIVED'].includes(item.status) ? (
            <RcUpload caseId={caseId} version={item.version} onDone={() => void detail.refetch()} />
          ) : null}
          {permissions.includes('registration.documents.share') && item.status === 'RC_RECEIVED' ? (
            <ActionCard
              title="Share or collect RC"
              description="Digital modes return a five-minute private signed link; every action is audited."
              button="Record delivery"
              disabled={mutation.isPending}
              onSubmit={(form) =>
                submit('share', form, (fd) => ({
                  delivery_mode: String(fd.get('delivery_mode')),
                  purpose: String(fd.get('purpose')),
                  recipient: String(fd.get('recipient')),
                }))
              }
            >
              <div className="space-y-1">
                <Label>Delivery mode</Label>
                <Select name="delivery_mode" defaultValue="WHATSAPP">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['WHATSAPP', 'EMAIL', 'SMS', 'COURIER', 'PICKUP'].map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {mode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Field label="Recipient" name="recipient" required />
              <Field label="Purpose" name="purpose" required />
            </ActionCard>
          ) : null}
          {permissions.includes('registration.cases.close') &&
          item.status === 'RC_SHARED_COLLECTED' ? (
            <Card>
              <CardHeader>
                <CardTitle>Close case</CardTitle>
                <CardDescription>
                  The API rechecks the application, RTO submission, permanent number, verified RC
                  and delivery evidence.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({ path: 'close', body: { expected_version: item.version } })
                  }
                >
                  <CheckCircle2 data-icon="inline-start" />
                  Close complete case
                </Button>
              </CardContent>
            </Card>
          ) : null}
          {permissions.includes('registration.cases.reopen') && item.status === 'CASE_CLOSED' ? (
            <ActionCard
              title="Reopen case"
              description="The prior closure remains in immutable history."
              button="Reopen case"
              disabled={mutation.isPending}
              onSubmit={(form) =>
                submit('reopen', form, (fd) => ({
                  next_action: String(fd.get('next_action')),
                  reason: String(fd.get('reason')),
                }))
              }
            >
              <Field label="Reason" name="reason" required />
              <Field label="Next action" name="next_action" required />
            </ActionCard>
          ) : null}
          {permissions.includes('registration.cases.manage') && data.events.length > 0 ? (
            <ActionCard
              title="Append correction"
              description="Never edits a prior event; the new event references the record being corrected."
              button="Record correction"
              disabled={mutation.isPending}
              onSubmit={(form) =>
                submit('corrections', form, (fd) => ({
                  application_number: String(fd.get('application_number') || '') || undefined,
                  corrected_event_id: String(fd.get('corrected_event_id')),
                  permanent_registration_number:
                    String(fd.get('permanent_registration_number') || '') || undefined,
                  reason: String(fd.get('reason')),
                }))
              }
            >
              <div className="space-y-1">
                <Label>Event to correct</Label>
                <Select name="corrected_event_id" defaultValue={data.events.at(-1)?.id}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {data.events.map((event) => (
                      <SelectItem key={event.id} value={event.id}>
                        {event.event_type} · {new Date(event.created_at).toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Field label="Corrected application number" name="application_number" />
              <Field label="Corrected permanent number" name="permanent_registration_number" />
              <Field label="Correction reason" name="reason" required />
            </ActionCard>
          ) : null}
          {permissions.includes('customer_vehicles.manage') &&
          data.delivery?.status === 'DELIVERED' ? (
            <Card>
              <CardHeader>
                <CardTitle>Create customer vehicle</CardTitle>
                <CardDescription>
                  Idempotently creates the delivered dealership vehicle; duplicates by booking, VIN
                  and registration are blocked.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() =>
                    void api
                      .request('/customer-vehicles/dealership', {
                        method: 'POST',
                        headers: commandHeaders(),
                        body: JSON.stringify({ booking_id: item.booking_id }),
                      })
                      .then(() => setMessage('Customer vehicle created.'))
                      .catch((error: unknown) => setMessage(errorMessage(error)))
                  }
                >
                  <ShieldCheck data-icon="inline-start" />
                  Create / resolve vehicle
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
        <Documents
          caseId={caseId}
          documents={data.documents}
          canReview={permissions.includes('registration.documents.review')}
          onChanged={() => void detail.refetch()}
        />
        <Timeline events={data.events} />
      </div>
    </PermissionGate>
  );
}

function Fact({ children, label }: { children: ReactNode; label: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">{label}</p>
        <div className="mt-2 text-sm">{children}</div>
      </CardContent>
    </Card>
  );
}

function ActionCard({
  button,
  children,
  description,
  disabled,
  onSubmit,
  title,
}: {
  button: string;
  children: ReactNode;
  description: string;
  disabled: boolean;
  onSubmit: (form: HTMLFormElement) => void;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            onSubmit(event.currentTarget);
          }}
        >
          {children}
          <Button disabled={disabled} type="submit">
            {disabled ? 'Saving…' : button}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  name,
  required,
  type = 'text',
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} required={required} type={type} />
    </div>
  );
}

function AssignmentCard({
  branchId,
  current,
  disabled,
  onSubmit,
}: {
  branchId: string;
  current: string | null;
  disabled: boolean;
  onSubmit: (form: HTMLFormElement) => void;
}) {
  const { api } = useAuth();
  const query = useQuery({
    queryKey: ['registration-executives', branchId],
    queryFn: () =>
      api.request<{ executives: { display_name: string; membership_id: string }[] }>(
        `/registration-cases/executives?branch_id=${branchId}`,
      ),
  });
  return (
    <ActionCard
      title="Assign RC executive"
      description="Only active executives with branch scope are selectable."
      button="Assign"
      disabled={disabled || query.isLoading}
      onSubmit={onSubmit}
    >
      <div className="space-y-1">
        <Label>Executive</Label>
        <Select
          name="assigned_membership_id"
          defaultValue={current ?? query.data?.executives[0]?.membership_id}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select executive" />
          </SelectTrigger>
          <SelectContent>
            {query.data?.executives.map((executive) => (
              <SelectItem key={executive.membership_id} value={executive.membership_id}>
                {executive.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Field label="Assignment reason" name="reason" required />
    </ActionCard>
  );
}

async function checksum(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function RcUpload({
  caseId,
  onDone,
  version,
}: {
  caseId: string;
  onDone: () => void;
  version: number;
}) {
  const { api } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async (file: File) => {
      const digest = await checksum(file);
      const initiation = await api.request<{ document_id: string; upload_url: string }>(
        `/registration-cases/${caseId}/rc-copy/initiate`,
        {
          method: 'POST',
          headers: commandHeaders(),
          body: JSON.stringify({
            checksum_sha256: digest,
            content_length: file.size,
            content_type: file.type,
            file_name: file.name,
          }),
        },
      );
      const response = await fetch(initiation.upload_url, {
        method: 'PUT',
        headers: { 'content-type': file.type, 'x-amz-checksum-sha256': digest },
        body: file,
      });
      if (!response.ok) throw new Error('Private RC upload failed.');
      return api.request(`/registration-cases/${caseId}/rc-copy/complete`, {
        method: 'POST',
        headers: commandHeaders(),
        body: JSON.stringify({
          checksum_sha256: digest,
          document_id: initiation.document_id,
          expected_version: version,
          received_at: new Date().toISOString(),
        }),
      });
    },
    onSuccess: () => {
      setMessage('RC uploaded and submitted for malware review.');
      onDone();
    },
    onError: (error) => setMessage(errorMessage(error)),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload RC copy</CardTitle>
        <CardDescription>
          PDF, JPEG or PNG up to 20 MB. The object stays private and verification fails closed until
          scanning reports clean.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const file = new FormData(event.currentTarget).get('rc_file');
            if (file instanceof File && file.size > 0) mutation.mutate(file);
          }}
        >
          <Input
            accept="application/pdf,image/jpeg,image/png"
            name="rc_file"
            required
            type="file"
          />
          <Button disabled={mutation.isPending} type="submit">
            <FileUp data-icon="inline-start" />
            {mutation.isPending ? 'Uploading…' : 'Upload RC'}
          </Button>
          {message ? <p className="text-sm">{message}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}

function Documents({
  canReview,
  caseId,
  documents,
  onChanged,
}: {
  canReview: boolean;
  caseId: string;
  documents: RegistrationDetailResponse['documents'];
  onChanged: () => void;
}) {
  const { api } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const review = async (id: string, decision: 'VERIFIED' | 'REJECTED') => {
    const reason = window.prompt(`Reason for ${decision.toLowerCase()}`);
    if (!reason) return;
    try {
      await api.request(`/registration-cases/documents/${id}/review`, {
        method: 'POST',
        headers: commandHeaders(),
        body: JSON.stringify({ decision, reason }),
      });
      onChanged();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };
  const download = async (id: string) => {
    const purpose = window.prompt('Download purpose');
    if (!purpose) return;
    try {
      const result = await api.request<{ url: string }>(
        `/registration-cases/documents/${id}/download?purpose=${encodeURIComponent(purpose)}`,
      );
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Private RC documents</CardTitle>
        <CardDescription>
          Government documents are never placed in persisted browser state; access and delivery are
          audited.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {documents.length === 0 ? (
          <p className="text-muted-foreground text-sm">No RC document uploaded.</p>
        ) : (
          documents.map((document) => (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              key={document.id}
            >
              <div>
                <p className="font-medium">{document.file_name}</p>
                <p className="text-muted-foreground text-xs">
                  {document.status} · scanner {document.scanner_status ?? 'not run'}
                </p>
              </div>
              {canReview ? (
                <div className="flex gap-2">
                  {document.status === 'PENDING_SCAN' || document.status === 'REJECTED' ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void review(document.id, 'VERIFIED')}
                      >
                        Verify
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => void review(document.id, 'REJECTED')}
                      >
                        Reject
                      </Button>
                    </>
                  ) : null}
                  {document.status === 'VERIFIED' ? (
                    <Button size="sm" variant="outline" onClick={() => void download(document.id)}>
                      <Download data-icon="inline-start" />
                      Download
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))
        )}
        {message ? <p className="text-destructive text-sm">{message}</p> : null}
        <span className="sr-only">Case {caseId}</span>
      </CardContent>
    </Card>
  );
}

function Timeline({ events }: { events: RegistrationDetailResponse['events'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-5" />
          Immutable timeline
        </CardTitle>
        <CardDescription>
          Corrections add linked events and never rewrite prior evidence.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-4">
          {events.map((event) => (
            <li className="border-l-2 pl-4" key={event.id}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{event.event_type.replaceAll('_', ' ')}</p>
                {event.corrects_event_id ? (
                  <Badge variant="outline">
                    <RotateCcw className="mr-1 size-3" />
                    Correction
                  </Badge>
                ) : null}
              </div>
              <p className="text-muted-foreground text-xs">
                {new Date(event.created_at).toLocaleString()} · {event.actor_name}
              </p>
              {event.reason ? <p className="mt-1 text-sm">{event.reason}</p> : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
