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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@gdm/ui/components/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { AlertTriangle, ListFilter, Plus, RefreshCw, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import { LEAD_SOURCE_CODES, type LeadSource, type LeadStatus } from '@gdm/contracts';

import { PermissionGate } from '@/features/auth/permission-gate';
import { useAuth } from '@/features/auth/auth-provider';

export interface LeadSummary {
  id: string;
  contact_name: string;
  phone_e164: string;
  source: LeadSource;
  campaign_name: string | null;
  vehicle_interest: string;
  status: LeadStatus;
  sla_state: 'OPEN' | 'MET' | 'WARNING' | 'BREACHED';
  sla_due_at: string;
  relationship_owner_id: string | null;
  current_process_owner_id: string | null;
  conversation_owner_id: string | null;
  next_action_at: string | null;
  version: number;
}
interface DuplicateCandidate {
  id: string;
  contactId: string;
  candidateContactId: string;
  leadId: string;
  matchType: string;
  matchValueMasked: string;
  status: string;
}

type View = 'INBOX' | 'ASSIGNMENT' | 'FOLLOW_UP' | 'SLA' | 'REJECTED' | 'LOST' | 'DUPLICATES';

const views: { label: string; value: View }[] = [
  { label: 'Lead inbox', value: 'INBOX' },
  { label: 'Assignment queue', value: 'ASSIGNMENT' },
  { label: 'Follow-ups', value: 'FOLLOW_UP' },
  { label: 'SLA breaches', value: 'SLA' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Lost', value: 'LOST' },
  { label: 'Duplicate review', value: 'DUPLICATES' },
];

export function LeadWorkspace() {
  const { api, session } = useAuth();
  const cache = useQueryClient();
  const [view, setView] = useState<View>('INBOX');
  const [source, setSource] = useState('ALL');
  const [campaign, setCampaign] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const query = useMemo(() => {
    const parameters = new URLSearchParams({ limit: '100' });
    if (source !== 'ALL') parameters.set('source', source);
    if (campaign) parameters.set('campaign', campaign);
    if (search) parameters.set('search', search);
    if (view === 'ASSIGNMENT') parameters.set('status', 'PENDING_REVIEW');
    if (view === 'FOLLOW_UP') parameters.set('status', 'FOLLOW_UP');
    if (view === 'SLA') parameters.set('sla', 'BREACHED');
    if (view === 'REJECTED') parameters.set('history_status', 'REJECTED');
    if (view === 'LOST') parameters.set('history_status', 'LOST');
    return parameters.toString();
  }, [campaign, search, source, view]);
  const leads = useQuery({
    queryKey: ['leads', query],
    queryFn: () => api.request<{ leads: LeadSummary[] }>(`/leads?${query}`),
    enabled: view !== 'DUPLICATES',
  });
  const duplicates = useQuery({
    queryKey: ['lead-duplicates'],
    queryFn: () => api.request<{ candidates: DuplicateCandidate[] }>('/leads/duplicates'),
    enabled: view === 'DUPLICATES',
  });
  const canCreate = session?.permissions.includes('leads.create') ?? false;

  return (
    <PermissionGate permission="leads.read">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Capture, qualify, assign and act before the SLA expires.
            </p>
          </div>
          {canCreate ? (
            <Button onClick={() => setShowCreate((value) => !value)}>
              <Plus data-icon="inline-start" />
              New lead
            </Button>
          ) : null}
        </div>

        <div aria-label="Lead workspace views" className="flex flex-wrap gap-2" role="navigation">
          {views.map((item) => (
            <Button
              key={item.value}
              onClick={() => setView(item.value)}
              variant={view === item.value ? 'default' : 'outline'}
            >
              {item.label}
            </Button>
          ))}
        </div>

        {showCreate ? (
          <ManualLeadForm
            onCreated={() => {
              setShowCreate(false);
              void cache.invalidateQueries({ queryKey: ['leads'] });
            }}
          />
        ) : null}

        {view === 'DUPLICATES' ? (
          <DuplicateReview query={duplicates} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{views.find((item) => item.value === view)?.label}</CardTitle>
              <CardDescription>
                Only records allowed by your tenant, branch, team and assignment scope are returned.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <Label htmlFor="lead-source">Source</Label>
                  <FormSelect
                    id="lead-source"
                    onValueChange={setSource}
                    options={[
                      { label: 'All sources', value: 'ALL' },
                      ...LEAD_SOURCE_CODES.map((item) => ({
                        label: item.replaceAll('_', ' '),
                        value: item,
                      })),
                    ]}
                    value={source}
                  />
                </div>
                <div>
                  <Label htmlFor="lead-campaign">Campaign</Label>
                  <Input
                    id="lead-campaign"
                    onChange={(event) => setCampaign(event.target.value)}
                    placeholder="Campaign name"
                    value={campaign}
                  />
                </div>
                <div>
                  <Label htmlFor="lead-search">Search</Label>
                  <Input
                    id="lead-search"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Name, phone or vehicle"
                    value={search}
                  />
                </div>
              </div>
              {leads.isPending ? (
                <LeadSkeleton />
              ) : leads.isError ? (
                <QueryError retry={() => void leads.refetch()} />
              ) : (
                <LeadTable leads={leads.data?.leads ?? []} />
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </PermissionGate>
  );
}

function LeadTable({ leads }: { leads: LeadSummary[] }) {
  const helper = createColumnHelper<LeadSummary>();
  const columns = useMemo(
    () => [
      helper.accessor('contact_name', {
        header: 'Customer',
        cell: (info) => (
          <div>
            <Link
              className="font-medium underline-offset-4 hover:underline"
              href={`/leads/${info.row.original.id}`}
            >
              {info.getValue()}
            </Link>
            <p className="text-muted-foreground text-xs">{info.row.original.phone_e164}</p>
          </div>
        ),
      }),
      helper.accessor('source', { header: 'Source' }),
      helper.accessor('vehicle_interest', { header: 'Vehicle' }),
      helper.accessor('status', {
        header: 'Status',
        cell: (info) => <Badge variant="outline">{info.getValue().replaceAll('_', ' ')}</Badge>,
      }),
      helper.accessor('sla_state', {
        header: 'SLA',
        cell: (info) => (
          <Badge variant={info.getValue() === 'BREACHED' ? 'destructive' : 'secondary'}>
            {info.getValue()}
          </Badge>
        ),
      }),
      helper.accessor('next_action_at', {
        header: 'Next action',
        cell: (info) => {
          const value = info.getValue();
          return value ? new Date(value).toLocaleString() : '—';
        },
      }),
    ],
    [helper],
  );
  // TanStack Table intentionally returns callable table state; React Compiler cannot memoize it.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({ columns, data: leads, getCoreRowModel: getCoreRowModel() });
  if (leads.length === 0)
    return (
      <EmptyState
        description="No leads match this view and filter set."
        icon={<UsersRound className="size-5" />}
        title="No leads found"
      />
    );
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ManualLeadForm({ onCreated }: { onCreated(): void }) {
  const { api } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const branches = useQuery({
    queryKey: ['administration', 'branches', 'lead-create'],
    queryFn: () =>
      api.request<{ branches: { id: string; name: string; active: boolean }[] }>(
        '/administration/branches',
      ),
  });
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.request('/leads', {
        body: JSON.stringify(body),
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        method: 'POST',
      }),
    onSuccess: onCreated,
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Lead creation failed.'),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    mutation.mutate({
      branch_id: String(data.get('branch_id')),
      consent: {
        evidence: 'Captured by authenticated staff during manual entry.',
        granted: data.get('consent') === 'on',
        notice_version: 'staff-lead-response-v1',
        purpose: 'LEAD_RESPONSE',
      },
      name: String(data.get('name')),
      phone: String(data.get('phone')),
      source: String(data.get('source')),
      source_name: data.get('source_name') ? String(data.get('source_name')) : null,
      vehicle_interest: String(data.get('vehicle_interest')),
    });
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Manual lead creation</CardTitle>
        <CardDescription>
          Manual is the entry method. Select the customer’s actual source.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
          <Field label="Name" name="name" />
          <Field label="Indian mobile" name="phone" />
          <Field label="Vehicle interest" name="vehicle_interest" />
          <div>
            <Label htmlFor="branch_id">Branch</Label>
            <FormSelect
              defaultValue={branches.data?.branches.find((branch) => branch.active)?.id}
              id="branch_id"
              name="branch_id"
              options={(branches.data?.branches ?? [])
                .filter((branch) => branch.active)
                .map((branch) => ({ label: branch.name, value: branch.id }))}
            />
            {branches.isError ? (
              <p className="text-destructive mt-1 text-xs">Unable to load eligible branches.</p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="source">Source</Label>
            <FormSelect
              defaultValue="META"
              id="source"
              name="source"
              options={LEAD_SOURCE_CODES.map((item) => ({ label: item, value: item }))}
            />
          </div>
          <Field label="Source detail (required for OTHER)" name="source_name" required={false} />
          <label className="flex items-center gap-2 text-sm">
            <input name="consent" required type="checkbox" />
            Customer consent evidence recorded
          </label>
          <div className="md:col-span-2">
            {error ? (
              <p className="text-destructive mb-2 text-sm" role="alert">
                {error}
              </p>
            ) : null}
            <Button disabled={mutation.isPending} type="submit">
              {mutation.isPending ? 'Creating…' : 'Create lead'}
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
  value,
}: {
  label: string;
  name: string;
  required?: boolean;
  value?: string;
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input defaultValue={value} id={name} name={name} required={required} />
    </div>
  );
}
function DuplicateReview({
  query,
}: {
  query: ReturnType<typeof useQuery<{ candidates: DuplicateCandidate[] }>>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Duplicate candidate review</CardTitle>
        <CardDescription>
          Review only—contacts are never destructively or silently merged.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <LeadSkeleton />
        ) : query.isError ? (
          <QueryError retry={() => void query.refetch()} />
        ) : (query.data?.candidates.length ?? 0) === 0 ? (
          <EmptyState
            description="Potential duplicate contacts will appear here for explicit review."
            icon={<ListFilter className="size-5" />}
            title="No duplicate candidates"
          />
        ) : (
          <div className="space-y-2">
            {query.data?.candidates.map((item) => (
              <DuplicateCandidateReview candidate={item} key={item.id} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DuplicateCandidateReview({ candidate }: { candidate: DuplicateCandidate }) {
  const { api } = useAuth();
  const cache = useQueryClient();
  const [canonicalContactId, setCanonicalContactId] = useState(candidate.contactId);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (resolution: 'LINK_CANONICAL' | 'KEEP_SEPARATE' | 'DISMISS') =>
      api.request(`/leads/duplicates/${candidate.id}/resolve`, {
        body: JSON.stringify({
          canonical_contact_id: resolution === 'LINK_CANONICAL' ? canonicalContactId : null,
          reason,
          resolution,
        }),
        method: 'POST',
      }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ['lead-duplicates'] }),
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Duplicate review failed.'),
  });
  return (
    <div className="space-y-3 rounded-md border p-3 text-sm">
      <p>
        <b>{candidate.matchType}</b> · {candidate.matchValueMasked}
      </p>
      <p className="text-muted-foreground text-xs">
        Contacts {candidate.contactId} and {candidate.candidateContactId}; lead {candidate.leadId}
      </p>
      <div>
        <Label htmlFor={`canonical-${candidate.id}`}>Canonical contact</Label>
        <FormSelect
          id={`canonical-${candidate.id}`}
          onValueChange={setCanonicalContactId}
          options={[
            { label: candidate.contactId, value: candidate.contactId },
            { label: candidate.candidateContactId, value: candidate.candidateContactId },
          ]}
          value={canonicalContactId}
        />
      </div>
      <div>
        <Label htmlFor={`duplicate-reason-${candidate.id}`}>Review reason</Label>
        <Input
          id={`duplicate-reason-${candidate.id}`}
          onChange={(event) => setReason(event.target.value)}
          required
          value={reason}
        />
      </div>
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!reason || mutation.isPending}
          onClick={() => mutation.mutate('LINK_CANONICAL')}
          size="sm"
        >
          Link canonical
        </Button>
        <Button
          disabled={!reason || mutation.isPending}
          onClick={() => mutation.mutate('KEEP_SEPARATE')}
          size="sm"
          variant="outline"
        >
          Keep separate
        </Button>
        <Button
          disabled={!reason || mutation.isPending}
          onClick={() => mutation.mutate('DISMISS')}
          size="sm"
          variant="outline"
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
function QueryError({ retry }: { retry(): void }) {
  return (
    <EmptyState
      action={
        <Button onClick={retry} variant="outline">
          <RefreshCw data-icon="inline-start" />
          Retry
        </Button>
      }
      description="The lead service could not be reached. No success state has been inferred."
      icon={<AlertTriangle className="size-5" />}
      title="Unable to load leads"
    />
  );
}
function LeadSkeleton() {
  return (
    <div aria-label="Loading leads" className="space-y-3">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

function FormSelect({
  defaultValue,
  id,
  name,
  onValueChange,
  options,
  value,
}: {
  defaultValue?: string | undefined;
  id: string;
  name?: string;
  onValueChange?(value: string): void;
  options: { label: string; value: string }[];
  value?: string;
}) {
  return (
    <Select
      defaultValue={defaultValue}
      name={name}
      onValueChange={(next) => {
        if (next !== null) onValueChange?.(next);
      }}
      value={value}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder="Select" />
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
