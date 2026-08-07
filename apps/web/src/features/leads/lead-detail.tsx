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
import { AlertTriangle, ArrowLeft, Clock3, History, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { LEAD_STATUSES, LOST_REASONS, REJECTION_REASONS, type LeadStatus } from '@gdm/contracts';

import { useAuth } from '@/features/auth/auth-provider';
import { PermissionGate } from '@/features/auth/permission-gate';
import type { LeadSummary } from './lead-workspace';

interface LeadDetailResponse {
  lead: LeadSummary & {
    email: string | null;
    entry_method: string;
    rejection_reason: string | null;
    lost_reason: string | null;
  };
  timeline: {
    id: string;
    type: string;
    title: string;
    detail: string | null;
    occurred_at: string;
  }[];
  follow_ups: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
}

export function LeadDetail({ leadId }: { leadId: string }) {
  const { api, session } = useAuth();
  const cache = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => api.request<LeadDetailResponse>(`/leads/${leadId}`),
  });
  const refresh = () => {
    setMessage('Saved.');
    void cache.invalidateQueries({ queryKey: ['lead', leadId] });
    void cache.invalidateQueries({ queryKey: ['leads'] });
  };
  const transition = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.request(`/leads/${leadId}/transitions`, {
        body: JSON.stringify(body),
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        method: 'POST',
      }),
    onSuccess: refresh,
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Transition failed.'),
  });
  const note = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.request(`/leads/${leadId}/notes`, {
        body: JSON.stringify(body),
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        method: 'POST',
      }),
    onSuccess: refresh,
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Note failed.'),
  });
  const followUp = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.request(`/leads/${leadId}/follow-ups`, {
        body: JSON.stringify(body),
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        method: 'POST',
      }),
    onSuccess: refresh,
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Follow-up failed.'),
  });
  const assignment = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.request(`/leads/${leadId}/assignments`, { body: JSON.stringify(body), method: 'POST' }),
    onSuccess: refresh,
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Reassignment failed.'),
  });
  const task = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.request(`/leads/${leadId}/tasks`, {
        body: JSON.stringify(body),
        method: 'POST',
      }),
    onSuccess: refresh,
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'Task creation failed.'),
  });
  const completeFollowUp = useMutation({
    mutationFn: (id: string) =>
      api.request(`/leads/${leadId}/follow-ups/${id}/complete`, {
        body: JSON.stringify({ note: 'Completed from lead workspace.', outcome: 'Completed' }),
        method: 'POST',
      }),
    onSuccess: refresh,
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'Follow-up completion failed.'),
  });
  const completeTask = useMutation({
    mutationFn: (id: string) =>
      api.request(`/leads/${leadId}/tasks/${id}/complete`, {
        body: JSON.stringify({ note: 'Completed from lead workspace.' }),
        method: 'POST',
      }),
    onSuccess: refresh,
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'Task completion failed.'),
  });

  if (query.isPending)
    return (
      <div aria-label="Loading lead detail" className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (query.isError || !query.data)
    return (
      <EmptyState
        action={<Button onClick={() => void query.refetch()}>Retry</Button>}
        description="This lead may be outside your assignment scope or the service is unavailable."
        icon={<AlertTriangle className="size-5" />}
        title="Unable to load lead"
      />
    );
  const data = query.data;
  return (
    <PermissionGate permission="leads.read">
      <div className="space-y-6">
        <Link
          className="text-muted-foreground inline-flex items-center gap-2 text-sm hover:underline"
          href="/leads"
        >
          <ArrowLeft className="size-4" />
          Back to leads
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{data.lead.contact_name}</h1>
            <p className="text-muted-foreground text-sm">
              {data.lead.phone_e164} · {data.lead.vehicle_interest}
            </p>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline">{data.lead.source}</Badge>
            <Badge>{data.lead.status.replaceAll('_', ' ')}</Badge>
            <Badge variant={data.lead.sla_state === 'BREACHED' ? 'destructive' : 'secondary'}>
              {data.lead.sla_state}
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
                <CardTitle>Lifecycle action</CardTitle>
                <CardDescription>
                  Invalid transitions are rejected atomically. Rejected and Lost remain separate
                  outcomes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setMessage(null);
                    const values = new FormData(event.currentTarget);
                    const status = String(values.get('to_status')) as LeadStatus;
                    transition.mutate({
                      expected_version: data.lead.version,
                      follow_up_channel: values.get('follow_up_channel') || null,
                      lost_reason: status === 'LOST' ? values.get('lost_reason') : null,
                      next_action_at: values.get('next_action_at')
                        ? new Date(String(values.get('next_action_at'))).toISOString()
                        : null,
                      note: String(values.get('note')),
                      rejection_reason:
                        status === 'REJECTED' ? values.get('rejection_reason') : null,
                      reopen_reason: status === 'REOPENED' ? values.get('reopen_reason') : null,
                      to_status: status,
                    });
                  }}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="to_status">Next status</Label>
                      <FormSelect
                        defaultValue="CONTACT_ATTEMPT"
                        id="to_status"
                        name="to_status"
                        options={LEAD_STATUSES.map((status) => ({
                          label: status.replaceAll('_', ' '),
                          value: status,
                        }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="next_action_at">Next action</Label>
                      <Input id="next_action_at" name="next_action_at" type="datetime-local" />
                    </div>
                    <div>
                      <Label htmlFor="rejection_reason">Rejection reason</Label>
                      <FormSelect
                        id="rejection_reason"
                        name="rejection_reason"
                        options={REJECTION_REASONS.map((reason) => ({
                          label: reason.replaceAll('_', ' '),
                          value: reason,
                        }))}
                        placeholder="Not applicable"
                      />
                    </div>
                    <div>
                      <Label htmlFor="lost_reason">Lost reason</Label>
                      <FormSelect
                        id="lost_reason"
                        name="lost_reason"
                        options={LOST_REASONS.map((reason) => ({
                          label: reason.replaceAll('_', ' '),
                          value: reason,
                        }))}
                        placeholder="Not applicable"
                      />
                    </div>
                    <div>
                      <Label htmlFor="follow_up_channel">Follow-up channel</Label>
                      <FormSelect
                        id="follow_up_channel"
                        name="follow_up_channel"
                        options={['CALL', 'WHATSAPP', 'EMAIL', 'SHOWROOM'].map((value) => ({
                          label: value,
                          value,
                        }))}
                        placeholder="Not applicable"
                      />
                    </div>
                    <div>
                      <Label htmlFor="reopen_reason">Reopen reason</Label>
                      <Input id="reopen_reason" name="reopen_reason" />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="transition-note">Evidence / outcome note</Label>
                    <Textarea id="transition-note" name="note" required />
                  </div>
                  <Button disabled={transition.isPending} type="submit">
                    Record transition
                  </Button>
                </form>
              </CardContent>
            </Card>
            <Timeline items={data.timeline} />
          </div>
          <div className="space-y-6">
            <OwnerCard lead={data.lead} />
            <WorkItems
              followUps={data.follow_ups}
              onCompleteFollowUp={(id) => completeFollowUp.mutate(id)}
              onCompleteTask={(id) => completeTask.mutate(id)}
              tasks={data.tasks}
            />
            <SimpleCommand
              title="Add note"
              description="Notes append to the immutable customer timeline."
              pending={note.isPending}
              onSubmit={(values) => note.mutate({ note: String(values.get('note')) })}
            >
              <Label htmlFor="note">Note</Label>
              <Textarea id="note" name="note" required />
            </SimpleCommand>
            <SimpleCommand
              title="Schedule follow-up"
              description="Active leads retain an explicit next action."
              pending={followUp.isPending}
              onSubmit={(values) =>
                followUp.mutate({
                  channel: String(values.get('channel')),
                  due_at: new Date(String(values.get('due_at'))).toISOString(),
                  note: String(values.get('note')) || null,
                  priority: String(values.get('priority')),
                  purpose: String(values.get('purpose')),
                })
              }
            >
              <Label htmlFor="due_at">Due</Label>
              <Input id="due_at" name="due_at" required type="datetime-local" />
              <Label htmlFor="channel">Channel</Label>
              <FormSelect
                defaultValue="CALL"
                id="channel"
                name="channel"
                options={['CALL', 'WHATSAPP', 'EMAIL', 'SHOWROOM'].map((value) => ({
                  label: value,
                  value,
                }))}
              />
              <Label htmlFor="priority">Priority</Label>
              <FormSelect
                defaultValue="NORMAL"
                id="priority"
                name="priority"
                options={['NORMAL', 'HIGH', 'URGENT'].map((value) => ({ label: value, value }))}
              />
              <Label htmlFor="purpose">Purpose</Label>
              <Input id="purpose" name="purpose" required />
              <Label htmlFor="followup-note">Note</Label>
              <Textarea id="followup-note" name="note" />
            </SimpleCommand>
            <SimpleCommand
              description="Tasks remain independently assignable from the lead’s lifecycle status."
              onSubmit={(values) =>
                task.mutate({
                  due_at: new Date(String(values.get('due_at'))).toISOString(),
                  priority: String(values.get('priority')),
                  title: String(values.get('title')),
                })
              }
              pending={task.isPending}
              title="Create task"
            >
              <Label htmlFor="task-title">Title</Label>
              <Input id="task-title" name="title" required />
              <Label htmlFor="task-due-at">Due</Label>
              <Input id="task-due-at" name="due_at" required type="datetime-local" />
              <Label htmlFor="task-priority">Priority</Label>
              <FormSelect
                defaultValue="NORMAL"
                id="task-priority"
                name="priority"
                options={['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => ({
                  label: value,
                  value,
                }))}
              />
            </SimpleCommand>
            {session?.permissions.includes('leads.assign') ? (
              <SimpleCommand
                title="Reassign lead"
                description="A reason is mandatory and an append-only assignment and audit record are written."
                pending={assignment.isPending}
                onSubmit={(values) =>
                  assignment.mutate({
                    expected_version: data.lead.version,
                    membership_id: String(values.get('membership_id')),
                    reason: String(values.get('reason')),
                    transfer_relationship_owner: values.get('transfer_relationship_owner') === 'on',
                  })
                }
              >
                <Label htmlFor="membership_id">Target membership ID</Label>
                <Input id="membership_id" name="membership_id" required />
                <Label htmlFor="assignment-reason">Reason</Label>
                <Textarea id="assignment-reason" name="reason" required />
                <label className="flex items-center gap-2 text-sm">
                  <input name="transfer_relationship_owner" type="checkbox" />
                  Transfer relationship owner too
                </label>
              </SimpleCommand>
            ) : null}
          </div>
        </div>
      </div>
    </PermissionGate>
  );
}

function SimpleCommand({
  children,
  description,
  onSubmit,
  pending,
  title,
}: {
  children: ReactNode;
  description: string;
  onSubmit(values: FormData): void;
  pending: boolean;
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
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(new FormData(event.currentTarget));
            event.currentTarget.reset();
          }}
        >
          {children}
          <Button disabled={pending} type="submit">
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function FormSelect({
  defaultValue,
  id,
  name,
  options,
  placeholder = 'Select',
}: {
  defaultValue?: string;
  id: string;
  name: string;
  options: { label: string; value: string }[];
  placeholder?: string;
}) {
  return (
    <Select defaultValue={defaultValue} name={name}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Timeline({ items }: { items: LeadDetailResponse['timeline'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-5" />
          Customer timeline
        </CardTitle>
        <CardDescription>
          Lifecycle, assignment and note history is preserved in occurrence order.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">No timeline events.</p>
        ) : (
          <ol className="space-y-4 border-s ps-5">
            {items.map((item) => (
              <li className="relative" key={item.id}>
                <span className="bg-primary absolute -start-[1.55rem] top-1 size-2.5 rounded-full" />
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-muted-foreground text-xs">
                  {new Date(item.occurred_at).toLocaleString()} · {item.type}
                </p>
                {item.detail ? <p className="mt-1 text-sm">{item.detail}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
function OwnerCard({ lead }: { lead: LeadSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserRound className="size-5" />
          Ownership
        </CardTitle>
        <CardDescription>
          Relationship, current process and conversation ownership remain separate.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>Relationship: {lead.relationship_owner_id ?? 'Not frozen yet'}</p>
        <p>Current process: {lead.current_process_owner_id ?? 'Queue unassigned'}</p>
        <p>Conversation: {lead.conversation_owner_id ?? 'Queue unassigned'}</p>
        <p className="text-muted-foreground flex items-center gap-2">
          <Clock3 className="size-4" />
          SLA due {new Date(lead.sla_due_at).toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}

function WorkItems({
  followUps,
  onCompleteFollowUp,
  onCompleteTask,
  tasks,
}: {
  followUps: Record<string, unknown>[];
  onCompleteFollowUp(id: string): void;
  onCompleteTask(id: string): void;
  tasks: Record<string, unknown>[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Follow-ups and tasks</CardTitle>
        <CardDescription>
          Open work can be completed without rewriting lifecycle history.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {followUps.length === 0 && tasks.length === 0 ? (
          <p className="text-muted-foreground text-sm">No work items.</p>
        ) : null}
        {followUps.map((item) => (
          <div className="rounded-md border p-3" key={String(item.id)}>
            <p className="text-sm font-medium">Follow-up · {String(item.purpose)}</p>
            <p className="text-muted-foreground text-xs">
              {String(item.status)} · {String(item.dueAt ?? item.due_at)}
            </p>
            {item.status === 'OPEN' ? (
              <Button
                className="mt-2"
                onClick={() => onCompleteFollowUp(String(item.id))}
                variant="outline"
              >
                Complete follow-up
              </Button>
            ) : null}
          </div>
        ))}
        {tasks.map((item) => (
          <div className="rounded-md border p-3" key={String(item.id)}>
            <p className="text-sm font-medium">Task · {String(item.title)}</p>
            <p className="text-muted-foreground text-xs">
              {String(item.status)} · {String(item.dueAt ?? item.due_at)}
            </p>
            {item.status === 'OPEN' ? (
              <Button
                className="mt-2"
                onClick={() => onCompleteTask(String(item.id))}
                variant="outline"
              >
                Complete task
              </Button>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
