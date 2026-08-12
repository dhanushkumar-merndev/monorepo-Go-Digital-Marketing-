'use client';

import { Badge } from '@gdm/ui/components/badge';
import { Button, buttonVariants } from '@gdm/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gdm/ui/components/card';
import { EmptyState } from '@gdm/ui/components/empty-state';
import { Input } from '@gdm/ui/components/input';
import { Label } from '@gdm/ui/components/label';
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
import { ArrowLeft, CarFront, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';

import { PageHeader } from '@/components/page-header';
import { ServerPagination, type PageMetadata } from '@/components/server-pagination';
import { useAuth } from '@/features/auth/auth-provider';
import { PermissionGate } from '@/features/auth/permission-gate';
import { commandHeaders, errorMessage, type CustomerVehicle } from './registration-types';

export function CustomerVehicleWorkspace() {
  const { api, session } = useAuth();
  const cache = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const query = useQuery({
    queryKey: ['customer-vehicles', page, pageSize],
    queryFn: () =>
      api.request<{ pagination: PageMetadata; vehicles: CustomerVehicle[] }>(
        `/customer-vehicles?limit=${String(pageSize)}&page=${String(page)}`,
      ),
  });
  return (
    <PermissionGate permission="customer_vehicles.read">
      <div className="space-y-6">
        <Link className={buttonVariants({ variant: 'ghost' })} href="/registrations">
          <ArrowLeft data-icon="inline-start" />
          Registration & RC
        </Link>
        <PageHeader
          eyebrow="Customer ownership"
          title="Customer vehicles"
          description="Canonical dealership-delivered and authorized external vehicles, linked to the existing customer contact."
          actions={
            session?.permissions.includes('customer_vehicles.manage') ? (
              <Button onClick={() => setShowCreate((value) => !value)}>
                <Plus data-icon="inline-start" />
                Add external vehicle
              </Button>
            ) : null
          }
        />
        {showCreate ? (
          <ExternalVehicleForm
            onCreated={() => {
              setShowCreate(false);
              void cache.invalidateQueries({ queryKey: ['customer-vehicles'] });
            }}
          />
        ) : null}
        <VehicleTable
          onPage={setPage}
          onPageSize={(value) => {
            setPageSize(value);
            setPage(1);
          }}
          query={query}
        />
      </div>
    </PermissionGate>
  );
}

function VehicleTable({
  onPage,
  onPageSize,
  query,
}: {
  onPage(page: number): void;
  onPageSize(pageSize: number): void;
  query: ReturnType<
    typeof useQuery<{ pagination: PageMetadata; vehicles: CustomerVehicle[] }, Error>
  >;
}) {
  if (query.isLoading)
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  if (query.isError)
    return (
      <EmptyState
        title="Customer vehicles unavailable"
        description={query.error.message}
        action={<Button onClick={() => void query.refetch()}>Try again</Button>}
      />
    );
  const vehicles = query.data?.vehicles ?? [];
  if (!vehicles.length)
    return (
      <EmptyState
        title="No customer vehicles"
        description="Delivered dealership vehicles and authorized external vehicles will appear here."
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
              <TableHead>Identity</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Coverage</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {vehicles.map((vehicle) => (
              <TableRow key={vehicle.id}>
                <TableCell>{vehicle.customer_name ?? 'Canonical contact'}</TableCell>
                <TableCell>
                  {vehicle.brand_name} {vehicle.model_name}
                  <p className="text-muted-foreground text-xs">{vehicle.variant_name}</p>
                </TableCell>
                <TableCell>{vehicle.registration_number ?? vehicle.vin ?? '—'}</TableCell>
                <TableCell>
                  <Badge
                    variant={vehicle.ownership_source === 'EXTERNAL' ? 'outline' : 'secondary'}
                  >
                    {vehicle.ownership_source.replaceAll('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell>
                  {vehicle.insurance_expires_on ?? vehicle.warranty_expires_on ?? 'Not recorded'}
                </TableCell>
                <TableCell>
                  <Link
                    className={buttonVariants({ size: 'sm', variant: 'outline' })}
                    href={`/customer-vehicles/${vehicle.id}`}
                  >
                    Open
                  </Link>
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

function ExternalVehicleForm({ onCreated }: { onCreated: () => void }) {
  const { api } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      const optional = (name: string) => String(data.get(name) || '') || null;
      return api.request('/customer-vehicles/external', {
        method: 'POST',
        headers: commandHeaders(),
        body: JSON.stringify({
          amc_expires_on: optional('amc_expires_on'),
          brand_name: String(data.get('brand_name')),
          branch_id: String(data.get('branch_id')),
          contact_id: String(data.get('contact_id')),
          engine_number: optional('engine_number'),
          insurance_expires_on: optional('insurance_expires_on'),
          insurance_policy_number: optional('insurance_policy_number'),
          model_name: String(data.get('model_name')),
          purchase_date: optional('purchase_date'),
          registration_number: optional('registration_number'),
          rsa_expires_on: optional('rsa_expires_on'),
          variant_name: String(data.get('variant_name')),
          vin: optional('vin'),
          warranty_expires_on: optional('warranty_expires_on'),
        }),
      });
    },
    onSuccess: onCreated,
    onError: (error) => setMessage(errorMessage(error)),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Add authorized external vehicle</CardTitle>
        <CardDescription>
          External ownership never receives a dealership booking, delivery or inventory identity.
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
          <Field label="Branch ID" name="branch_id" required />
          <Field label="Contact ID" name="contact_id" required />
          <Field label="Brand" name="brand_name" required />
          <Field label="Model" name="model_name" required />
          <Field label="Variant" name="variant_name" required />
          <Field label="VIN" name="vin" />
          <Field label="Registration number" name="registration_number" />
          <Field label="Engine number" name="engine_number" />
          <Field label="Purchase date" name="purchase_date" type="date" />
          <Field label="Insurance policy" name="insurance_policy_number" />
          <Field label="Insurance expiry" name="insurance_expires_on" type="date" />
          <Field label="Warranty expiry" name="warranty_expires_on" type="date" />
          <Field label="AMC expiry" name="amc_expires_on" type="date" />
          <Field label="RSA expiry" name="rsa_expires_on" type="date" />
          {message ? <p className="text-destructive text-sm md:col-span-3">{message}</p> : null}
          <Button className="md:col-span-3" disabled={mutation.isPending} type="submit">
            <CarFront data-icon="inline-start" />
            {mutation.isPending ? 'Saving…' : 'Add external vehicle'}
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
