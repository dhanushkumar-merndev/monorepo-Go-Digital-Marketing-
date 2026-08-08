'use client';

import type { InventoryUnitDetail } from '@gdm/contracts';
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
import { ArrowLeft, History, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import { PageHeader } from '@/components/page-header';
import { PermissionGate } from '@/features/auth/permission-gate';
import { useAuth } from '@/features/auth/auth-provider';

interface Branch {
  active: boolean;
  id: string;
  name: string;
}

interface Command {
  body: Record<string, unknown>;
  path: string;
}

export function InventoryUnitDetailView({ unitId }: { unitId: string }) {
  const { api, session } = useAuth();
  const cache = useQueryClient();
  const [success, setSuccess] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: ['inventory', 'unit', unitId],
    queryFn: () => api.request<InventoryUnitDetail>(`/inventory/units/${unitId}`),
  });
  const branches = useQuery({
    queryKey: ['organization', 'branches'],
    queryFn: () => api.request<{ branches: Branch[] }>('/administration/branches'),
  });
  const mutation = useMutation({
    mutationFn: ({ body, path }: Command) =>
      api.request(path, {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        method: 'POST',
      }),
    onSuccess: (_data, variables) => {
      setSuccess(
        `Accepted ${variables.path.split('/').at(-1)?.replaceAll('-', ' ') ?? 'inventory command'}.`,
      );
      void cache.invalidateQueries({ queryKey: ['inventory'] });
    },
  });

  if (detail.isPending)
    return (
      <div className="space-y-4" aria-label="Loading inventory unit">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  if (detail.isError)
    return (
      <EmptyState
        action={
          <Button onClick={() => void detail.refetch()} variant="outline">
            <RefreshCw data-icon="inline-start" /> Retry
          </Button>
        }
        description={detail.error.message}
        icon={<History className="size-5" />}
        title="Inventory unit unavailable"
      />
    );
  const data = detail.data;
  const unit = data.unit;
  const canManage = session?.permissions.includes('inventory.units.manage') ?? false;
  const canCorrect = session?.permissions.includes('inventory.corrections.manage') ?? false;
  const canReserve = session?.permissions.includes('inventory.reservations.manage') ?? false;
  const canAllocate = session?.permissions.includes('inventory.allocations.manage') ?? false;
  const canReallocate = session?.permissions.includes('inventory.allocations.reallocate') ?? false;
  const canTransfer = session?.permissions.includes('inventory.transfers.manage') ?? false;
  const activeTransfer = data.transfers.find((transfer) => transfer.latest_event === 'STARTED');

  return (
    <PermissionGate permission="inventory.units.read">
      <div className="space-y-6">
        <PageHeader
          actions={
            <Link className={buttonVariants({ variant: 'outline' })} href="/inventory">
              <ArrowLeft data-icon="inline-start" /> Back to stock
            </Link>
          }
          description={`${unit.model_name} · ${unit.variant_name} · ${unit.branch_name}`}
          eyebrow="Physical stock"
          title={unit.unit_reference}
        />

        {success ? (
          <p className="text-success text-sm" role="status">
            {success}
          </p>
        ) : null}
        {mutation.isError ? (
          <p className="text-danger text-sm" role="alert">
            {mutation.error.message}
          </p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Stock identity</CardTitle>
                  <CardDescription>
                    Full identifiers appear only for authorized roles.
                  </CardDescription>
                </div>
                <Badge variant="outline">{unit.status.replaceAll('_', ' ')}</Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Fact label="VIN" value={unit.vin ?? 'Pending'} />
              <Fact label="Chassis" value={unit.chassis_number ?? 'Pending'} />
              <Fact label="Engine / motor" value={unit.engine_number ?? 'Pending'} />
              <Fact label="Colour" value={unit.colour_name} />
              <Fact label="Ownership" value={unit.ownership_type} />
              <Fact label="Odometer" value={`${unit.current_odometer_km} km`} />
              <Fact
                label="Received"
                value={
                  unit.received_at ? new Date(unit.received_at).toLocaleString() : 'Not received'
                }
              />
              <Fact
                label="Expected"
                value={
                  unit.expected_arrival_at
                    ? new Date(unit.expected_arrival_at).toLocaleString()
                    : '—'
                }
              />
              <Fact
                label="Age"
                value={unit.age_days === null ? 'Not aging yet' : `${unit.age_days} day(s)`}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Current commitment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Fact
                label="Reservation"
                value={
                  data.active_reservation?.booking_reference ??
                  data.active_reservation?.id ??
                  'None'
                }
              />
              <Fact
                label="Reservation expiry"
                value={
                  data.active_reservation
                    ? new Date(data.active_reservation.expires_at).toLocaleString()
                    : '—'
                }
              />
              <Fact
                label="Allocation"
                value={data.active_allocation?.booking_reference ?? 'None'}
              />
              <Fact label="Version" value={String(unit.version)} />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {canManage ? (
            <TransitionForm
              canCorrect={canCorrect}
              disabled={mutation.isPending}
              mutate={mutation.mutate}
              unit={data}
            />
          ) : null}
          {canReserve ? (
            <ReservationForm disabled={mutation.isPending} mutate={mutation.mutate} unit={data} />
          ) : null}
          {canAllocate ? (
            <AllocationForm
              canReallocate={canReallocate}
              disabled={mutation.isPending}
              mutate={mutation.mutate}
              unit={data}
            />
          ) : null}
          {canTransfer ? (
            <TransferForm
              branches={branches.data?.branches ?? []}
              disabled={mutation.isPending || branches.isPending}
              mutate={mutation.mutate}
              {...(activeTransfer ? { transferId: activeTransfer.id } : {})}
              unit={data}
            />
          ) : null}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Immutable history</CardTitle>
            <CardDescription>
              Status, correction, allocation and transfer evidence is chronological and append-only.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.history.length === 0 ? (
              <EmptyState
                description="No status evidence has been appended yet."
                icon={<History className="size-5" />}
                title="No history"
              />
            ) : (
              <ol className="space-y-4 border-l pl-5">
                {data.history.map((event) => (
                  <li className="relative text-sm" key={event.id}>
                    <span className="bg-primary absolute top-1.5 -left-[1.45rem] size-2 rounded-full" />
                    <p className="font-medium">{event.event_type.replaceAll('_', ' ')}</p>
                    <p className="text-muted-foreground">
                      {event.from_status ?? 'Created'} → {event.to_status}
                    </p>
                    <p className="text-muted-foreground">
                      {new Date(event.created_at).toLocaleString()} · {event.actor_name ?? 'System'}
                    </p>
                    {event.reason ? <p>{event.reason}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </PermissionGate>
  );
}

function TransitionForm({
  canCorrect,
  disabled,
  mutate,
  unit,
}: FormProps & { canCorrect: boolean }) {
  const actions = [
    'RECEIVE',
    'DESIGNATE_DEMO',
    'AUTHORIZE_DEMO_SALE',
    'BLOCK',
    'UNBLOCK',
    'CANCEL',
    'REMOVE',
    'DELIVER',
  ].filter(
    (action) =>
      canCorrect ||
      (action !== 'AUTHORIZE_DEMO_SALE' &&
        action !== 'BLOCK' &&
        action !== 'UNBLOCK' &&
        action !== 'CANCEL' &&
        action !== 'REMOVE' &&
        action !== 'DELIVER'),
  );
  return (
    <ActionCard
      description="Delivered cannot return to available; demo sale, cancel and remove require manager correction permission."
      title="Controlled status"
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          mutate({
            body: {
              action: String(data.get('action')),
              expected_version: unit.unit.version,
              reason: String(data.get('reason')),
              ...(data.get('action') === 'RECEIVE'
                ? {
                    chassis_number: optionalText(data, 'chassis_number'),
                    current_odometer_km: Number(data.get('current_odometer_km')),
                    engine_number: optionalText(data, 'engine_number'),
                    received_at: new Date().toISOString(),
                    vin: optionalText(data, 'vin'),
                  }
                : {}),
            },
            path: `/inventory/units/${unit.unit.id}/transition`,
          });
        }}
      >
        <Select name="action" required>
          <SelectTrigger>
            <SelectValue placeholder="Choose transition" />
          </SelectTrigger>
          <SelectContent>
            {actions.map((action) => (
              <SelectItem key={action} value={action}>
                {action.replaceAll('_', ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {unit.unit.status === 'EXPECTED' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="VIN at receipt"
              name="vin"
              required
              value={unit.unit.vin ?? undefined}
            />
            <TextField
              label="Chassis at receipt"
              name="chassis_number"
              required
              value={unit.unit.chassis_number ?? undefined}
            />
            <TextField
              label="Engine / motor number"
              name="engine_number"
              value={unit.unit.engine_number ?? undefined}
            />
            <TextField
              label="Odometer kilometres"
              name="current_odometer_km"
              required
              type="number"
              value={String(unit.unit.current_odometer_km)}
            />
          </div>
        ) : null}
        <Reason />
        <Button disabled={disabled} type="submit">
          Apply status
        </Button>
      </form>
    </ActionCard>
  );
}

function ReservationForm({ disabled, mutate, unit }: FormProps) {
  const active = unit.active_reservation;
  return (
    <ActionCard
      description="Reservations require a future expiry and release with retained evidence."
      title="Reservation"
    >
      {active ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            mutate({
              body: { expected_version: unit.unit.version, reason: String(data.get('reason')) },
              path: `/inventory/reservations/${active.id}/release`,
            });
          }}
        >
          <p className="text-sm">Active until {new Date(active.expires_at).toLocaleString()}</p>
          <Reason />
          <Button disabled={disabled} type="submit" variant="outline">
            Release reservation
          </Button>
        </form>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            mutate({
              body: {
                booking_reference: String(data.get('booking_reference')),
                expected_version: unit.unit.version,
                expires_at: new Date(String(data.get('expires_at'))).toISOString(),
                lead_id: null,
                reason: String(data.get('reason')),
              },
              path: `/inventory/units/${unit.unit.id}/reservations`,
            });
          }}
        >
          <TextField label="Booking reference" name="booking_reference" required />
          <TextField label="Expires at" name="expires_at" required type="datetime-local" />
          <Reason />
          <Button disabled={disabled || unit.unit.status !== 'AVAILABLE'} type="submit">
            Reserve unit
          </Button>
        </form>
      )}
    </ActionCard>
  );
}

function AllocationForm({
  canReallocate,
  disabled,
  mutate,
  unit,
}: FormProps & { canReallocate: boolean }) {
  const active = unit.active_allocation;
  return (
    <ActionCard
      description="Allocation requires a confirmed external booking/readiness assertion; this module never modifies payment."
      title="Allocation"
    >
      {active ? (
        <div className="space-y-4">
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              mutate({
                body: { expected_version: unit.unit.version, reason: String(data.get('reason')) },
                path: `/inventory/allocations/${active.id}/release`,
              });
            }}
          >
            <p className="text-sm">Allocated to {active.booking_reference}</p>
            <Reason />
            <Button disabled={disabled} type="submit" variant="outline">
              Release allocation
            </Button>
          </form>
          {canReallocate ? (
            <form
              className="space-y-3 border-t pt-4"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                mutate({
                  body: {
                    customer_communication_decision: String(
                      data.get('customer_communication_decision'),
                    ),
                    expected_from_version: unit.unit.version,
                    expected_to_version: Number(data.get('expected_to_version')),
                    reason: String(data.get('reason')),
                    to_inventory_unit_id: String(data.get('to_inventory_unit_id')),
                  },
                  path: `/inventory/allocations/${active.id}/reallocate`,
                });
              }}
            >
              <TextField label="Replacement unit ID" name="to_inventory_unit_id" required />
              <TextField
                label="Replacement version"
                name="expected_to_version"
                required
                type="number"
              />
              <TextField
                label="Customer communication decision"
                name="customer_communication_decision"
                required
              />
              <Reason />
              <Button disabled={disabled} type="submit">
                Reallocate VIN
              </Button>
            </form>
          ) : null}
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            mutate({
              body: {
                booking_reference: String(data.get('booking_reference')),
                expected_version: unit.unit.version,
                readiness_asserted: data.get('readiness_asserted') === 'on',
                reason: String(data.get('reason')),
              },
              path: `/inventory/units/${unit.unit.id}/allocations`,
            });
          }}
        >
          <TextField label="Confirmed booking reference" name="booking_reference" required />
          <label className="flex items-center gap-2 text-sm">
            <input name="readiness_asserted" required type="checkbox" /> Booking/readiness evidence
            verified
          </label>
          <Reason />
          <Button
            disabled={disabled || !['AVAILABLE', 'RESERVED'].includes(unit.unit.status)}
            type="submit"
          >
            Allocate VIN
          </Button>
        </form>
      )}
    </ActionCard>
  );
}

function TransferForm({
  branches,
  disabled,
  mutate,
  transferId,
  unit,
}: FormProps & { branches: Branch[]; transferId?: string }) {
  return (
    <ActionCard
      description="Transfer headers and events are immutable; completion atomically changes branch and restores the prior stock state."
      title="Branch transfer"
    >
      {transferId ? (
        <div className="flex flex-wrap gap-3">
          {(['complete', 'cancel'] as const).map((action) => (
            <form
              key={action}
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                mutate({
                  body: { expected_version: unit.unit.version, reason: String(data.get('reason')) },
                  path: `/inventory/transfers/${transferId}/${action}`,
                });
              }}
            >
              <Reason />
              <Button
                className="mt-3"
                disabled={disabled}
                type="submit"
                variant={action === 'cancel' ? 'outline' : 'default'}
              >
                {action === 'complete' ? 'Complete transfer' : 'Cancel transfer'}
              </Button>
            </form>
          ))}
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            mutate({
              body: {
                expected_version: unit.unit.version,
                reason: String(data.get('reason')),
                reference: String(data.get('reference')),
                to_branch_id: String(data.get('to_branch_id')),
              },
              path: `/inventory/units/${unit.unit.id}/transfers`,
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="to_branch_id">Destination branch</Label>
            <Select name="to_branch_id" required>
              <SelectTrigger id="to_branch_id">
                <SelectValue placeholder="Choose branch" />
              </SelectTrigger>
              <SelectContent>
                {branches
                  .filter((branch) => branch.active && branch.id !== unit.unit.branch_id)
                  .map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <TextField label="Transfer reference" name="reference" required />
          <Reason />
          <Button
            disabled={disabled || !['AVAILABLE', 'DEMO', 'BLOCKED'].includes(unit.unit.status)}
            type="submit"
          >
            Start transfer
          </Button>
        </form>
      )}
    </ActionCard>
  );
}

interface FormProps {
  disabled: boolean;
  mutate: (command: Command) => void;
  unit: InventoryUnitDetail;
}

function ActionCard({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
      <p className="mt-1 text-sm font-medium break-words">{value}</p>
    </div>
  );
}

function Reason() {
  return (
    <div className="space-y-2">
      <Label>Reason</Label>
      <Textarea aria-label="Reason" name="reason" required />
    </div>
  );
}

function TextField({
  label,
  name,
  required = false,
  type = 'text',
  value,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  value?: string | undefined;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input defaultValue={value} id={name} name={name} required={required} type={type} />
    </div>
  );
}

function optionalText(data: FormData, name: string): string | undefined {
  const value = String(data.get(name) ?? '').trim();
  return value.length > 0 ? value : undefined;
}
