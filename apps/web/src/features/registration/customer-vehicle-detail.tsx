'use client';

import { Badge } from '@gdm/ui/components/badge';
import { Button, buttonVariants } from '@gdm/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gdm/ui/components/card';
import { EmptyState } from '@gdm/ui/components/empty-state';
import { Input } from '@gdm/ui/components/input';
import { Label } from '@gdm/ui/components/label';
import { Skeleton } from '@gdm/ui/components/skeleton';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, History } from 'lucide-react';
import Link from 'next/link';
import type { FormEvent, ReactNode } from 'react';

import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/features/auth/auth-provider';
import { PermissionGate } from '@/features/auth/permission-gate';
import { commandHeaders, type CustomerVehicle } from './registration-types';

interface VehicleDetailResponse {
  events: {
    created_at: string;
    event_type: string;
    evidence: Record<string, unknown>;
    id: string;
    reason: string | null;
  }[];
  vehicle: CustomerVehicle;
}

export function CustomerVehicleDetail({ vehicleId }: { vehicleId: string }) {
  const { api, session } = useAuth();
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['customer-vehicle', vehicleId],
    queryFn: () => api.request<VehicleDetailResponse>(`/customer-vehicles/${vehicleId}`),
  });
  const mutation = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      const optional = (name: string) => String(data.get(name) || '') || null;
      return api.request(`/customer-vehicles/${vehicleId}/coverage`, {
        method: 'POST',
        headers: commandHeaders(),
        body: JSON.stringify({
          amc_expires_on: optional('amc_expires_on'),
          expected_version: query.data?.vehicle.version,
          insurance_expires_on: optional('insurance_expires_on'),
          insurance_policy_number: optional('insurance_policy_number'),
          reason: String(data.get('reason')),
          rsa_expires_on: optional('rsa_expires_on'),
          warranty_expires_on: optional('warranty_expires_on'),
        }),
      });
    },
    onSuccess: () => void cache.invalidateQueries({ queryKey: ['customer-vehicle', vehicleId] }),
  });
  if (query.isLoading) return <Skeleton className="h-96 w-full" />;
  if (query.isError || !query.data)
    return (
      <EmptyState
        title="Customer vehicle unavailable"
        description={query.error?.message ?? 'The vehicle could not be loaded.'}
        action={
          <Link className={buttonVariants()} href="/customer-vehicles">
            Back
          </Link>
        }
      />
    );
  const { events, vehicle } = query.data;
  return (
    <PermissionGate permission="customer_vehicles.read">
      <div className="space-y-6">
        <Link className={buttonVariants({ variant: 'ghost' })} href="/customer-vehicles">
          <ArrowLeft data-icon="inline-start" />
          Customer vehicles
        </Link>
        <PageHeader
          eyebrow={vehicle.ownership_source.replaceAll('_', ' ')}
          title={`${vehicle.brand_name} ${vehicle.model_name}`}
          description={`${vehicle.customer_name ?? 'Canonical customer'} · ${vehicle.variant_name}`}
        />
        <div className="grid gap-4 md:grid-cols-4">
          <Fact label="Registration">{vehicle.registration_number ?? 'Not recorded'}</Fact>
          <Fact label="VIN">{vehicle.vin ?? 'Not recorded'}</Fact>
          <Fact label="Engine">{vehicle.engine_number ?? 'Not recorded'}</Fact>
          <Fact label="Source">
            <Badge variant={vehicle.ownership_source === 'EXTERNAL' ? 'outline' : 'secondary'}>
              {vehicle.ownership_source.replaceAll('_', ' ')}
            </Badge>
          </Fact>
        </div>
        {session?.permissions.includes('customer_vehicles.manage') ? (
          <Card>
            <CardHeader>
              <CardTitle>Coverage and ownership services</CardTitle>
              <CardDescription>
                Phase 10 stores policy and coverage dates. Reminder scheduling belongs to Phase 11.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-3 md:grid-cols-3"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  mutation.mutate(event.currentTarget);
                }}
              >
                <Field
                  defaultValue={vehicle.insurance_policy_number}
                  label="Insurance policy"
                  name="insurance_policy_number"
                />
                <Field
                  defaultValue={vehicle.insurance_expires_on}
                  label="Insurance expiry"
                  name="insurance_expires_on"
                  type="date"
                />
                <Field
                  defaultValue={vehicle.warranty_expires_on}
                  label="Warranty expiry"
                  name="warranty_expires_on"
                  type="date"
                />
                <Field
                  defaultValue={vehicle.amc_expires_on}
                  label="AMC expiry"
                  name="amc_expires_on"
                  type="date"
                />
                <Field
                  defaultValue={vehicle.rsa_expires_on}
                  label="RSA expiry"
                  name="rsa_expires_on"
                  type="date"
                />
                <Field label="Change reason" name="reason" required />
                <Button className="md:col-span-3" disabled={mutation.isPending} type="submit">
                  {mutation.isPending ? 'Saving…' : 'Save coverage'}
                </Button>
                {mutation.isError ? (
                  <p className="text-destructive text-sm md:col-span-3">{mutation.error.message}</p>
                ) : null}
                {mutation.isSuccess ? (
                  <p className="text-sm text-emerald-700 md:col-span-3">Coverage saved.</p>
                ) : null}
              </form>
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="size-5" />
              Vehicle history
            </CardTitle>
            <CardDescription>Ownership and coverage events remain append-only.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {events.map((event) => (
                <li className="border-l-2 pl-4" key={event.id}>
                  <p className="font-medium">{event.event_type.replaceAll('_', ' ')}</p>
                  <p className="text-muted-foreground text-xs">
                    {new Date(event.created_at).toLocaleString()}
                  </p>
                  {event.reason ? <p className="text-sm">{event.reason}</p> : null}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </PermissionGate>
  );
}

function Fact({ children, label }: { children: ReactNode; label: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-muted-foreground text-xs uppercase">{label}</p>
        <div className="mt-2 text-sm">{children}</div>
      </CardContent>
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
  defaultValue?: string | null;
  label: string;
  name: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <Input
        defaultValue={defaultValue ?? ''}
        id={name}
        name={name}
        required={required}
        type={type}
      />
    </div>
  );
}
