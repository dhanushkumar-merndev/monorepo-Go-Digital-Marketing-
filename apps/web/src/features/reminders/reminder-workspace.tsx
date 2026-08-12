'use client';

import { Alert, AlertDescription, AlertTitle } from '@gdm/ui/components/alert';
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
import { Textarea } from '@gdm/ui/components/textarea';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, CalendarClock, RefreshCw, Settings2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { PageHeader } from '@/components/page-header';
import {
  readPageParameters,
  ServerPagination,
  type PageMetadata,
} from '@/components/server-pagination';
import { useAuth } from '@/features/auth/auth-provider';
import { PermissionGate } from '@/features/auth/permission-gate';
import {
  commandHeaders,
  errorMessage,
  type ReminderInstance,
  type ReminderPlan,
  type ReminderRule,
} from './reminder-types';

const views = ['upcoming', 'failed', 'suppressed', 'plans', 'rules', 'preferences'] as const;
type View = (typeof views)[number];

export function ReminderWorkspace() {
  const { api, session } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const cache = useQueryClient();
  const current = views.includes(params.get('view') as View)
    ? (params.get('view') as View)
    : 'upcoming';
  const { page, pageSize } = readPageParameters(params);
  const status =
    current === 'failed' ? 'FAILED' : current === 'suppressed' ? 'SUPPRESSED' : 'SCHEDULED';
  const rules = useQuery({
    queryKey: ['reminder-rules'],
    queryFn: () => api.request<{ rules: ReminderRule[] }>('/reminders/rules'),
  });
  const plans = useQuery({
    queryKey: ['reminder-plans', page, pageSize],
    queryFn: () =>
      api.request<{ pagination: PageMetadata; plans: ReminderPlan[] }>(
        `/reminders/plans?limit=${String(pageSize)}&page=${String(page)}`,
      ),
  });
  const reminders = useQuery({
    queryKey: ['reminder-instances', status, page, pageSize],
    queryFn: () =>
      api.request<{ pagination: PageMetadata; reminders: ReminderInstance[] }>(
        `/reminders/instances?limit=${String(pageSize)}&page=${String(page)}&status=${status}`,
      ),
  });
  const dispatch = useMutation({
    mutationFn: () =>
      api.request<{ queued: number; suppressed: number }>('/reminders/dispatch-due', {
        method: 'POST',
      }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ['reminder-instances'] }),
  });
  return (
    <PermissionGate permission="reminders.read">
      <div className="space-y-6">
        <PageHeader
          eyebrow="Customer lifecycle"
          title="Post-sale reminders"
          description="Configurable service and ownership reminders using canonical Customer Vehicles, approved templates, consent and suppression."
          actions={
            session?.permissions.includes('reminders.dispatch.manage') ? (
              <Button disabled={dispatch.isPending} onClick={() => dispatch.mutate()}>
                <RefreshCw data-icon="inline-start" /> Queue due reminders
              </Button>
            ) : null
          }
        />
        <div aria-label="Reminder views" className="flex flex-wrap gap-2" role="navigation">
          {views.map((view) => (
            <Button
              key={view}
              onClick={() =>
                router.replace(`/reminders?view=${view}&page=1&page_size=${String(pageSize)}`)
              }
              variant={current === view ? 'default' : 'outline'}
            >
              {view.replaceAll('_', ' ')}
            </Button>
          ))}
        </div>
        {dispatch.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Dispatch failed</AlertTitle>
            <AlertDescription>{errorMessage(dispatch.error)}</AlertDescription>
          </Alert>
        ) : null}
        {dispatch.isSuccess ? (
          <Alert>
            <AlertTitle>Queue scan complete</AlertTitle>
            <AlertDescription>
              {dispatch.data.queued} queued; {dispatch.data.suppressed} suppressed by current
              policy.
            </AlertDescription>
          </Alert>
        ) : null}
        {current === 'rules' ? <RulesPanel query={rules} /> : null}
        {current === 'plans' ? (
          <PlansPanel
            onPage={(value) =>
              router.replace(
                `/reminders?view=plans&page=${String(value)}&page_size=${String(pageSize)}`,
              )
            }
            onPageSize={(value) =>
              router.replace(`/reminders?view=plans&page=1&page_size=${String(value)}`)
            }
            query={plans}
          />
        ) : null}
        {current === 'preferences' ? <PreferencesPanel /> : null}
        {current === 'upcoming' || current === 'failed' || current === 'suppressed' ? (
          <InstancesPanel
            onPage={(value) =>
              router.replace(
                `/reminders?view=${current}&page=${String(value)}&page_size=${String(pageSize)}`,
              )
            }
            onPageSize={(value) =>
              router.replace(`/reminders?view=${current}&page=1&page_size=${String(value)}`)
            }
            query={reminders}
          />
        ) : null}
      </div>
    </PermissionGate>
  );
}

function LoadingCard() {
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </CardContent>
    </Card>
  );
}

function RulesPanel({
  query,
}: {
  query: ReturnType<typeof useQuery<{ rules: ReminderRule[] }, Error>>;
}) {
  const { api, session } = useAuth();
  const cache = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      const threshold = String(data.get('threshold_kind'));
      return api.request('/reminders/rules', {
        method: 'POST',
        headers: commandHeaders(),
        body: JSON.stringify({
          active: true,
          base_date_field: threshold === 'DATE' ? String(data.get('base_date_field')) : null,
          brand_name: String(data.get('brand_name') || '') || null,
          category: String(data.get('category')),
          channel: String(data.get('channel')),
          due_after_days: threshold === 'DATE' ? Number(data.get('due_value')) : null,
          due_kilometres: threshold === 'KILOMETRE' ? Number(data.get('due_value')) : null,
          model_name: String(data.get('model_name') || '') || null,
          model_year: data.get('model_year') ? Number(data.get('model_year')) : null,
          notice_days: String(data.get('notice_days'))
            .split(',')
            .map((value) => Number(value.trim())),
          reminder_type: String(data.get('reminder_type')),
          template_id: String(data.get('template_id')),
          threshold_kind: threshold,
          variant_name: String(data.get('variant_name') || '') || null,
        }),
      });
    },
    onSuccess: () => {
      setMessage('Rule saved.');
      void cache.invalidateQueries({ queryKey: ['reminder-rules'] });
    },
    onError: (error) => setMessage(errorMessage(error)),
  });
  if (query.isLoading) return <LoadingCard />;
  if (query.isError)
    return (
      <EmptyState
        title="Reminder rules unavailable"
        description={query.error.message}
        action={<Button onClick={() => void query.refetch()}>Try again</Button>}
      />
    );
  return (
    <div className="space-y-4">
      {session?.permissions.includes('reminders.rules.manage') ? (
        <Card>
          <CardHeader>
            <CardTitle>Service-plan configuration</CardTitle>
            <CardDescription>
              Fixed tenant/model rules; templates must already be approved and match the
              communication category.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 md:grid-cols-4"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                mutation.mutate(event.currentTarget);
              }}
            >
              <Field label="Reminder type" name="reminder_type" defaultValue="SERVICE_DUE" />
              <Field label="Category" name="category" defaultValue="OPERATIONAL" />
              <Field label="Channel" name="channel" defaultValue="WHATSAPP" />
              <Field label="Threshold kind" name="threshold_kind" defaultValue="DATE" />
              <Field label="Base date field" name="base_date_field" defaultValue="DELIVERY_DATE" />
              <Field
                label="Due after days / km"
                name="due_value"
                type="number"
                defaultValue="180"
              />
              <Field label="Notice days (CSV)" name="notice_days" defaultValue="30,15,7,1" />
              <Field label="Approved template UUID" name="template_id" required />
              <Field label="Manufacturer (optional)" name="brand_name" />
              <Field label="Model (optional)" name="model_name" />
              <Field label="Variant (optional)" name="variant_name" />
              <Field label="Model year (optional)" name="model_year" type="number" />
              <Button className="md:col-span-4" disabled={mutation.isPending} type="submit">
                <Settings2 data-icon="inline-start" />
                {mutation.isPending ? 'Saving…' : 'Save fixed rule'}
              </Button>
              {message ? (
                <p className="text-muted-foreground text-sm md:col-span-4">{message}</p>
              ) : null}
            </form>
          </CardContent>
        </Card>
      ) : null}
      <RuleTable rules={query.data?.rules ?? []} />
    </div>
  );
}

function RuleTable({ rules }: { rules: ReminderRule[] }) {
  if (!rules.length)
    return (
      <EmptyState
        title="No reminder rules"
        description="Create a rule only after an operational or marketing template is approved."
      />
    );
  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Threshold</TableHead>
              <TableHead>Notices</TableHead>
              <TableHead>Template</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell>{rule.reminder_type.replaceAll('_', ' ')}</TableCell>
                <TableCell>
                  {[rule.brandName, rule.modelName, rule.variantName, rule.modelYear]
                    .filter(Boolean)
                    .join(' / ') || 'All vehicles'}
                </TableCell>
                <TableCell>
                  {rule.thresholdKind === 'DATE'
                    ? `${rule.dueAfterDays ?? 0} days`
                    : `${rule.dueKilometres ?? 0} km`}
                  <p>
                    <Badge variant={rule.category === 'MARKETING' ? 'outline' : 'secondary'}>
                      {rule.category}
                    </Badge>
                  </p>
                </TableCell>
                <TableCell>{rule.noticeDays.join(', ')}</TableCell>
                <TableCell>
                  {rule.template_name}
                  <p className="text-muted-foreground text-xs">{rule.template_status}</p>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PlansPanel({
  onPage,
  onPageSize,
  query,
}: {
  onPage(page: number): void;
  onPageSize(pageSize: number): void;
  query: ReturnType<typeof useQuery<{ pagination: PageMetadata; plans: ReminderPlan[] }, Error>>;
}) {
  if (query.isLoading) return <LoadingCard />;
  if (query.isError)
    return (
      <EmptyState
        title="Customer plans unavailable"
        description={query.error.message}
        action={<Button onClick={() => void query.refetch()}>Try again</Button>}
      />
    );
  const rows = query.data?.plans ?? [];
  if (!rows.length)
    return (
      <EmptyState
        title="No customer reminder plans"
        description="Plans appear after a matching fixed rule is generated for a Customer Vehicle."
      />
    );
  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Version</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((plan) => (
              <TableRow key={plan.id}>
                <TableCell>{plan.contact_name}</TableCell>
                <TableCell>{plan.vehicle}</TableCell>
                <TableCell>
                  {plan.reminder_type.replaceAll('_', ' ')}{' '}
                  <Badge variant="outline">{plan.category}</Badge>
                </TableCell>
                <TableCell>
                  {plan.due_at
                    ? new Date(plan.due_at).toLocaleDateString()
                    : `${plan.due_kilometres} km`}
                </TableCell>
                <TableCell>{plan.schedule_version}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ServerPagination
          metadata={query.data?.pagination ?? { has_next: false, page: 1, page_size: 25 }}
          onPage={onPage}
          onPageSize={onPageSize}
        />
      </CardContent>
    </Card>
  );
}

function InstancesPanel({
  onPage,
  onPageSize,
  query,
}: {
  onPage(page: number): void;
  onPageSize(pageSize: number): void;
  query: ReturnType<
    typeof useQuery<{ pagination: PageMetadata; reminders: ReminderInstance[] }, Error>
  >;
}) {
  const { api, session } = useAuth();
  const cache = useQueryClient();
  const mutation = useMutation({
    mutationFn: (instance: ReminderInstance) =>
      api.request(`/reminders/instances/${instance.id}/reschedule`, {
        method: 'POST',
        headers: commandHeaders(),
        body: JSON.stringify({
          expected_version: instance.version,
          reason: 'Customer requested follow-up tomorrow.',
          scheduled_for: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ['reminder-instances'] }),
  });
  if (query.isLoading) return <LoadingCard />;
  if (query.isError)
    return (
      <EmptyState
        title="Reminder queue unavailable"
        description={query.error.message}
        action={<Button onClick={() => void query.refetch()}>Try again</Button>}
      />
    );
  const rows = query.data?.reminders ?? [];
  if (!rows.length)
    return (
      <EmptyState
        title="No reminders in this queue"
        description="The selected reminder state is empty."
      />
    );
  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Schedule</TableHead>
              <TableHead>Customer / vehicle</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Policy result</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{new Date(item.scheduled_for).toLocaleString()}</TableCell>
                <TableCell>
                  {item.contact_name}
                  <p className="text-muted-foreground text-xs">{item.vehicle}</p>
                </TableCell>
                <TableCell>
                  {item.reminder_type.replaceAll('_', ' ')}
                  <p>
                    <Badge variant="outline">{item.category}</Badge>
                  </p>
                </TableCell>
                <TableCell>
                  <Badge>{item.status}</Badge>
                </TableCell>
                <TableCell>
                  {item.suppression_reason ?? `${item.channel}; retry ${item.retry_count}`}
                </TableCell>
                <TableCell>
                  {session?.permissions.includes('reminders.dispatch.manage') &&
                  ['FAILED', 'SUPPRESSED', 'SCHEDULED'].includes(item.status) ? (
                    <Button
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate(item)}
                      size="sm"
                      variant="outline"
                    >
                      <CalendarClock data-icon="inline-start" />
                      Tomorrow
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ServerPagination
          metadata={query.data?.pagination ?? { has_next: false, page: 1, page_size: 25 }}
          onPage={onPage}
          onPageSize={onPageSize}
        />
      </CardContent>
    </Card>
  );
}

function PreferencesPanel() {
  const { api, session } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [consentMessage, setConsentMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      return api.request(`/reminders/vehicles/${String(data.get('vehicle_id'))}/preferences`, {
        method: 'POST',
        headers: commandHeaders(),
        body: JSON.stringify({
          expected_version: data.get('expected_version')
            ? Number(data.get('expected_version'))
            : null,
          marketing_enabled: data.get('marketing_enabled') === 'true',
          operational_enabled: data.get('operational_enabled') !== 'false',
          preferred_channel: String(data.get('preferred_channel')),
          reason: String(data.get('reason')),
        }),
      });
    },
    onSuccess: () =>
      setMessage(
        'Customer reminder preferences saved. Marketing still requires current messaging consent.',
      ),
    onError: (error) => setMessage(errorMessage(error)),
  });
  const consentMutation = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      return api.request(`/reminders/vehicles/${String(data.get('consent_vehicle_id'))}/consent`, {
        method: 'POST',
        headers: commandHeaders(),
        body: JSON.stringify({
          channel: String(data.get('consent_channel')),
          evidence: String(data.get('consent_evidence')),
          notice_version: String(data.get('notice_version')),
          source: 'POST_SALE_PREFERENCES',
          status: String(data.get('consent_status')),
        }),
      });
    },
    onSuccess: () => setConsentMessage('Append-only marketing consent evidence recorded.'),
    onError: (error) => setConsentMessage(errorMessage(error)),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Consent and reminder preferences</CardTitle>
        <CardDescription>
          Preferences do not create consent. Marketing dispatch also requires the latest
          channel/category opt-in and no active suppression.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {session?.permissions.includes('reminders.preferences.manage') ? (
          <div className="space-y-8">
            <form
              className="grid gap-3 md:grid-cols-2"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                mutation.mutate(event.currentTarget);
              }}
            >
              <Field label="Customer Vehicle UUID" name="vehicle_id" required />
              <Field
                label="Current preference version (blank if new)"
                name="expected_version"
                type="number"
              />
              <SelectField
                label="Operational reminders"
                name="operational_enabled"
                options={[
                  ['true', 'Enabled'],
                  ['false', 'Disabled'],
                ]}
              />
              <SelectField
                label="Marketing preference"
                name="marketing_enabled"
                options={[
                  ['false', 'Disabled'],
                  ['true', 'Enabled (consent still required)'],
                ]}
              />
              <SelectField
                label="Preferred channel"
                name="preferred_channel"
                options={[
                  ['WHATSAPP', 'WhatsApp'],
                  ['EMAIL', 'Email'],
                  ['SMS', 'SMS'],
                ]}
              />
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="reason">Evidence / reason</Label>
                <Textarea
                  id="reason"
                  name="reason"
                  required
                  defaultValue="Customer preference captured during post-sale follow-up."
                />
              </div>
              <Button className="md:col-span-2" disabled={mutation.isPending} type="submit">
                <BellRing data-icon="inline-start" />
                Save preferences
              </Button>
              {message ? (
                <p className="text-muted-foreground text-sm md:col-span-2">{message}</p>
              ) : null}
            </form>
            <form
              className="grid gap-3 border-t pt-6 md:grid-cols-2"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                consentMutation.mutate(event.currentTarget);
              }}
            >
              <div className="md:col-span-2">
                <h3 className="font-medium">Marketing consent evidence</h3>
                <p className="text-muted-foreground text-sm">
                  Grant, denial and withdrawal are append-only. The latest record controls
                  promotional dispatch.
                </p>
              </div>
              <Field label="Customer Vehicle UUID" name="consent_vehicle_id" required />
              <Field
                label="Notice version"
                name="notice_version"
                defaultValue="marketing-v1"
                required
              />
              <SelectField
                label="Status"
                name="consent_status"
                options={[
                  ['WITHDRAWN', 'Withdrawn'],
                  ['GRANTED', 'Granted'],
                  ['DENIED', 'Denied'],
                ]}
              />
              <SelectField
                label="Channel"
                name="consent_channel"
                options={[
                  ['WHATSAPP', 'WhatsApp'],
                  ['EMAIL', 'Email'],
                  ['SMS', 'SMS'],
                ]}
              />
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="consent_evidence">Evidence</Label>
                <Textarea
                  id="consent_evidence"
                  name="consent_evidence"
                  required
                  defaultValue="Customer preference captured with notice shown."
                />
              </div>
              <Button className="md:col-span-2" disabled={consentMutation.isPending} type="submit">
                Record consent evidence
              </Button>
              {consentMessage ? (
                <p className="text-muted-foreground text-sm md:col-span-2">{consentMessage}</p>
              ) : null}
            </form>
          </div>
        ) : (
          <EmptyState
            title="Read-only reminder access"
            description="A user with reminder preference permission must capture customer choices."
          />
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  name,
  required,
  type = 'text',
  defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <Input defaultValue={defaultValue} id={name} name={name} required={required} type={type} />
    </div>
  );
}
function SelectField({
  label,
  name,
  options,
}: {
  label: string;
  name: string;
  options: [string, string][];
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <Select defaultValue={options[0]?.[0]} name={name}>
        <SelectTrigger id={name}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([value, text]) => (
            <SelectItem key={value} value={value}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
