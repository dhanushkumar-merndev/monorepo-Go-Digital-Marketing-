'use client';

import type { InventoryCatalogue, InventoryUnitSummary } from '@gdm/contracts';
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
import { Boxes, FileUp, PackagePlus, RefreshCw, Warehouse } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { PageHeader } from '@/components/page-header';
import { ServerPagination, type PageMetadata } from '@/components/server-pagination';
import { PermissionGate } from '@/features/auth/permission-gate';
import { useAuth } from '@/features/auth/auth-provider';
import { useInventoryUiStore } from './inventory-ui.store';
import { INVENTORY_VIEWS, parseInventoryView, type InventoryView } from './inventory-url-state';

interface Branch {
  active: boolean;
  id: string;
  name: string;
}

const viewLabels: Record<InventoryView, string> = {
  AGING: 'Aging',
  ALLOCATIONS: 'Allocation queue',
  CATALOGUE: 'Catalogue',
  DEMOS: 'Demos',
  EXPECTED: 'Expected arrivals',
  IMPORT: 'Import',
  RESERVATIONS: 'Reservations',
  STOCK: 'Stock',
  TRANSFERS: 'Transfers',
};

const viewStatuses: Partial<Record<InventoryView, string>> = {
  ALLOCATIONS: 'ALLOCATED',
  DEMOS: 'DEMO',
  EXPECTED: 'EXPECTED',
  RESERVATIONS: 'RESERVED',
  TRANSFERS: 'IN_TRANSFER',
};

function mutationHeaders(): HeadersInit {
  return { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() };
}

export function InventoryWorkspace() {
  const { api, session } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const cache = useQueryClient();
  const view = parseInventoryView(searchParams.get('view'));
  const search = searchParams.get('search') ?? '';
  const page = positiveInteger(searchParams.get('page'), 1);
  const pageSize = allowedPageSize(searchParams.get('page_size'));
  const [searchDraft, setSearchDraft] = useState(search);
  const createUnitOpen = useInventoryUiStore((state) => state.createUnitOpen);
  const setCreateUnitOpen = useInventoryUiStore((state) => state.setCreateUnitOpen);
  const density = useInventoryUiStore((state) => state.density);
  const setDensity = useInventoryUiStore((state) => state.setDensity);
  const canManageUnits = session?.permissions.includes('inventory.units.manage') ?? false;
  const status = viewStatuses[view];
  const query = new URLSearchParams({ limit: String(pageSize), page: String(page) });
  if (view === 'AGING') query.set('min_age_days', '30');
  if (status) query.set('status', status);
  if (search) query.set('search', search);
  const units = useQuery({
    queryKey: ['inventory', 'units', view, search, page, pageSize],
    queryFn: () =>
      api.request<{ pagination: PageMetadata; units: InventoryUnitSummary[] }>(
        `/inventory/units?${query}`,
      ),
    enabled: view !== 'CATALOGUE' && view !== 'IMPORT',
  });
  const catalogue = useQuery({
    queryKey: ['inventory', 'catalogue'],
    queryFn: () => api.request<InventoryCatalogue>('/inventory/catalogue'),
  });
  const branches = useQuery({
    queryKey: ['organization', 'branches'],
    queryFn: () => api.request<{ branches: Branch[] }>('/administration/branches'),
  });
  const reconcile = useMutation({
    mutationFn: () =>
      api.request<{ expired: number }>('/inventory/reservations/reconcile', {
        headers: mutationHeaders(),
        method: 'POST',
      }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ['inventory'] }),
  });

  function navigate(
    nextView: InventoryView,
    nextSearch = search,
    nextPage = 1,
    nextPageSize = pageSize,
  ) {
    const next = new URLSearchParams({
      page: String(nextPage),
      page_size: String(nextPageSize),
      view: nextView,
    });
    if (nextSearch) next.set('search', nextSearch);
    router.replace(`/inventory?${next.toString()}`);
  }

  return (
    <PermissionGate permission="inventory.units.read">
      <div className="space-y-6">
        <PageHeader
          actions={
            canManageUnits ? (
              <Button onClick={() => setCreateUnitOpen(!createUnitOpen)}>
                <PackagePlus data-icon="inline-start" />
                Add stock
              </Button>
            ) : null
          }
          description="Physical stock, reservations, allocations and transfers remain backend-authoritative and branch scoped."
          eyebrow="Operations"
          title="Vehicle inventory"
        />

        <div aria-label="Inventory views" className="flex flex-wrap gap-2" role="navigation">
          {INVENTORY_VIEWS.map((item) => (
            <Button
              key={item}
              onClick={() => navigate(item, item === 'STOCK' ? search : '')}
              variant={view === item ? 'default' : 'outline'}
            >
              {viewLabels[item]}
            </Button>
          ))}
        </div>

        {createUnitOpen ? (
          <CreateUnitForm
            branches={branches.data?.branches ?? []}
            catalogue={catalogue.data}
            disabled={branches.isPending || catalogue.isPending}
            onCreated={() => {
              setCreateUnitOpen(false);
              void cache.invalidateQueries({ queryKey: ['inventory'] });
            }}
          />
        ) : null}

        {view === 'CATALOGUE' ? (
          <CataloguePanel query={catalogue} />
        ) : view === 'IMPORT' ? (
          <ImportPanel
            onImported={() => void cache.invalidateQueries({ queryKey: ['inventory'] })}
          />
        ) : (
          <>
            <Card>
              <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-end">
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    navigate(view, searchDraft.trim());
                  }}
                >
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="inventory-search">Search stock</Label>
                    <Input
                      id="inventory-search"
                      onChange={(event) => setSearchDraft(event.target.value)}
                      placeholder="Reference, VIN, model or variant"
                      value={searchDraft}
                    />
                  </div>
                  <Button type="submit" variant="outline">
                    Search
                  </Button>
                </form>
                <Button
                  onClick={() => setDensity(density === 'comfortable' ? 'compact' : 'comfortable')}
                  variant="outline"
                >
                  {density === 'comfortable' ? 'Compact rows' : 'Comfortable rows'}
                </Button>
                {view === 'RESERVATIONS' &&
                session?.permissions.includes('inventory.reservations.manage') ? (
                  <Button
                    disabled={reconcile.isPending}
                    onClick={() => reconcile.mutate()}
                    variant="outline"
                  >
                    <RefreshCw data-icon="inline-start" />
                    {reconcile.isPending ? 'Releasing…' : 'Release expired'}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
            {reconcile.isSuccess ? (
              <p className="text-success text-sm" role="status">
                Released {reconcile.data.expired} expired reservation(s).
              </p>
            ) : null}
            {reconcile.isError ? (
              <p className="text-danger text-sm" role="alert">
                {reconcile.error.message}
              </p>
            ) : null}
            <StockTable
              density={density}
              onPage={(value) => navigate(view, search, value)}
              onPageSize={(value) => navigate(view, search, 1, value)}
              query={units}
              view={view}
            />
          </>
        )}
      </div>
    </PermissionGate>
  );
}

function StockTable({
  density,
  onPage,
  onPageSize,
  query,
  view,
}: {
  density: 'comfortable' | 'compact';
  onPage(page: number): void;
  onPageSize(pageSize: number): void;
  query: ReturnType<typeof useQuery<{ pagination: PageMetadata; units: InventoryUnitSummary[] }>>;
  view: InventoryView;
}) {
  if (query.isPending)
    return (
      <div className="space-y-3" aria-label="Loading inventory">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  if (query.isError)
    return (
      <EmptyState
        action={
          <Button onClick={() => void query.refetch()} variant="outline">
            <RefreshCw data-icon="inline-start" /> Retry
          </Button>
        }
        description={query.error.message}
        icon={<Warehouse className="size-5" />}
        title="Inventory could not be loaded"
      />
    );
  const units = query.data?.units ?? [];
  if (units.length === 0)
    return (
      <EmptyState
        description="No branch-scoped physical units match this view."
        icon={<Boxes className="size-5" />}
        title="No inventory found"
      />
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{viewLabels[view]}</CardTitle>
        <CardDescription>
          VIN, chassis and engine values are masked unless the active role has sensitive-stock
          access.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unit</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>VIN / chassis</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Arrival / age</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.map((unit) => (
                <TableRow className={density === 'compact' ? 'h-9' : undefined} key={unit.id}>
                  <TableCell>
                    <Link className="font-medium hover:underline" href={`/inventory/${unit.id}`}>
                      {unit.unit_reference}
                    </Link>
                    <p className="text-muted-foreground text-xs">v{unit.version}</p>
                  </TableCell>
                  <TableCell>
                    {unit.model_name}
                    <p className="text-muted-foreground text-xs">
                      {unit.variant_name} · {unit.colour_name}
                    </p>
                  </TableCell>
                  <TableCell>{unit.branch_name}</TableCell>
                  <TableCell>
                    {unit.vin ?? 'Pending VIN'}
                    <p className="text-muted-foreground text-xs">
                      {unit.chassis_number ?? 'Pending chassis'}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{unit.status.replaceAll('_', ' ')}</Badge>
                  </TableCell>
                  <TableCell>
                    {unit.expected_arrival_at
                      ? new Date(unit.expected_arrival_at).toLocaleDateString()
                      : unit.received_at
                        ? new Date(unit.received_at).toLocaleDateString()
                        : '—'}
                    <p className="text-muted-foreground text-xs">
                      {unit.age_days === null ? 'Not received' : `${unit.age_days} day(s)`}
                    </p>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ServerPagination
          metadata={query.data?.pagination ?? { has_next: false, page: 1, page_size: 25 }}
          onPage={onPage}
          onPageSize={onPageSize}
        />
      </CardContent>
    </Card>
  );
}

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function allowedPageSize(value: string | null): number {
  const parsed = positiveInteger(value, 25);
  return [25, 50, 100].includes(parsed) ? parsed : 25;
}

function CreateUnitForm({
  branches,
  catalogue,
  disabled,
  onCreated,
}: {
  branches: Branch[];
  catalogue: InventoryCatalogue | undefined;
  disabled: boolean;
  onCreated: () => void;
}) {
  const { api } = useAuth();
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.request('/inventory/units', {
        body: JSON.stringify(body),
        headers: mutationHeaders(),
        method: 'POST',
      }),
    onSuccess: onCreated,
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const status = String(data.get('status'));
    mutation.mutate({
      acquisition_reference: String(data.get('acquisition_reference') ?? '') || null,
      branch_id: String(data.get('branch_id')),
      chassis_number: String(data.get('chassis_number') ?? '') || null,
      colour_id: String(data.get('colour_id')),
      condition_notes: String(data.get('condition_notes') ?? '') || null,
      current_odometer_km: Number(data.get('current_odometer_km') ?? 0),
      engine_number: String(data.get('engine_number') ?? '') || null,
      expected_arrival_at:
        status === 'EXPECTED'
          ? new Date(String(data.get('expected_arrival_at'))).toISOString()
          : null,
      ownership_type: String(data.get('ownership_type')),
      received_at: status === 'EXPECTED' ? null : new Date().toISOString(),
      service_due_at: null,
      status,
      unit_reference: String(data.get('unit_reference')),
      variant_id: String(data.get('variant_id')),
      vin: String(data.get('vin') ?? '') || null,
    });
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create physical stock</CardTitle>
        <CardDescription>
          Expected units may omit VIN; available/demo units require VIN and chassis.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={submit}>
          <SelectField
            label="Branch"
            name="branch_id"
            options={branches.filter((row) => row.active)}
          />
          <SelectField label="Variant" name="variant_id" options={catalogue?.variants ?? []} />
          <SelectField label="Colour" name="colour_id" options={catalogue?.colours ?? []} />
          <Field label="Unit reference" name="unit_reference" required />
          <Field label="VIN" name="vin" />
          <Field label="Chassis" name="chassis_number" />
          <Field label="Engine / motor" name="engine_number" />
          <Field label="Ownership type" name="ownership_type" required />
          <Field label="Acquisition reference" name="acquisition_reference" />
          <Field label="Odometer km" name="current_odometer_km" type="number" value="0" />
          <Field label="Expected arrival" name="expected_arrival_at" type="datetime-local" />
          <div className="space-y-2">
            <Label htmlFor="inventory-status">Initial state</Label>
            <Select defaultValue="EXPECTED" name="status">
              <SelectTrigger id="inventory-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EXPECTED">Expected</SelectItem>
                <SelectItem value="AVAILABLE">Available</SelectItem>
                <SelectItem value="DEMO">Demo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2 xl:col-span-3">
            <Label htmlFor="condition_notes">Condition notes</Label>
            <Textarea id="condition_notes" name="condition_notes" />
          </div>
          <div className="md:col-span-2 xl:col-span-3">
            <Button disabled={disabled || mutation.isPending} type="submit">
              {mutation.isPending ? 'Creating…' : 'Create unit'}
            </Button>
          </div>
          {mutation.isError ? (
            <p className="text-danger md:col-span-2 xl:col-span-3" role="alert">
              {mutation.error.message}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

function CataloguePanel({ query }: { query: ReturnType<typeof useQuery<InventoryCatalogue>> }) {
  const { api, session } = useAuth();
  const cache = useQueryClient();
  const open = useInventoryUiStore((state) => state.catalogueFormOpen);
  const setOpen = useInventoryUiStore((state) => state.setCatalogueFormOpen);
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.request('/inventory/catalogue', {
        body: JSON.stringify(body),
        headers: mutationHeaders(),
        method: 'POST',
      }),
    onSuccess: () => {
      setOpen(false);
      void cache.invalidateQueries({ queryKey: ['inventory', 'catalogue'] });
    },
  });
  if (query.isPending) return <Skeleton className="h-48 w-full" />;
  if (query.isError)
    return (
      <EmptyState
        description={query.error.message}
        icon={<Boxes className="size-5" />}
        title="Catalogue unavailable"
      />
    );
  return (
    <div className="space-y-4">
      {session?.permissions.includes('inventory.catalogue.manage') ? (
        <Button onClick={() => setOpen(!open)} variant="outline">
          {open ? 'Close catalogue form' : 'Add catalogue combination'}
        </Button>
      ) : null}
      {open ? (
        <Card>
          <CardContent className="pt-6">
            <form
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                mutation.mutate({
                  brand_code: String(data.get('brand_code')),
                  brand_name: String(data.get('brand_name')),
                  colour_code: String(data.get('colour_code')),
                  colour_name: String(data.get('colour_name')),
                  fuel_powertrain: String(data.get('fuel_powertrain')),
                  model_code: String(data.get('model_code')),
                  model_name: String(data.get('model_name')),
                  model_year: Number(data.get('model_year')),
                  variant_code: String(data.get('variant_code')),
                  variant_name: String(data.get('variant_name')),
                });
              }}
            >
              {[
                'brand_code',
                'brand_name',
                'model_code',
                'model_name',
                'variant_code',
                'variant_name',
                'colour_code',
                'colour_name',
                'fuel_powertrain',
              ].map((name) => (
                <Field key={name} label={name.replaceAll('_', ' ')} name={name} required />
              ))}
              <Field label="model year" name="model_year" required type="number" value="2026" />
              <Button disabled={mutation.isPending} type="submit">
                Save catalogue
              </Button>
              {mutation.isError ? (
                <p className="text-danger" role="alert">
                  {mutation.error.message}
                </p>
              ) : null}
            </form>
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['Brands', query.data?.brands.length ?? 0],
          ['Models', query.data?.models.length ?? 0],
          ['Variants', query.data?.variants.length ?? 0],
          ['Colours', query.data?.colours.length ?? 0],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardTitle>{value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Variants</CardTitle>
        </CardHeader>
        <CardContent>
          {(query.data?.variants ?? []).length === 0 ? (
            <EmptyState
              description="Create the first catalogue combination before stock intake."
              icon={<Boxes className="size-5" />}
              title="Catalogue is empty"
            />
          ) : (
            <ul className="divide-y">
              {query.data?.variants.map((variant) => (
                <li className="flex justify-between gap-4 py-3 text-sm" key={variant.id}>
                  <span className="font-medium">{variant.name}</span>
                  <span className="text-muted-foreground">
                    {variant.fuel_powertrain} · {variant.model_year}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ImportPanel({ onImported }: { onImported: () => void }) {
  const { api, session } = useAuth();
  const [payload, setPayload] = useState('[]');
  const [parseError, setParseError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (body: unknown) =>
      api.request<{ imported: number }>('/inventory/units/import', {
        body: JSON.stringify(body),
        headers: mutationHeaders(),
        method: 'POST',
      }),
    onSuccess: onImported,
  });
  if (!session?.permissions.includes('inventory.units.manage'))
    return (
      <EmptyState
        description="Stock import requires inventory unit management permission."
        icon={<FileUp className="size-5" />}
        title="Import unavailable"
      />
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Import stock rows</CardTitle>
        <CardDescription>
          Paste a JSON array of the same validated fields used by Create stock. Maximum 100 rows per
          idempotent batch.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="inventory-import">Validated JSON rows</Label>
          <Textarea
            className="min-h-64 font-mono text-xs"
            id="inventory-import"
            onChange={(event) => setPayload(event.target.value)}
            value={payload}
          />
        </div>
        <Button
          disabled={mutation.isPending}
          onClick={() => {
            try {
              setParseError(null);
              mutation.mutate({
                rows: JSON.parse(payload),
                source_batch_reference: `WEB-${new Date().toISOString()}`,
              });
            } catch {
              setParseError('Invalid JSON. Enter an array of stock rows.');
            }
          }}
        >
          <FileUp data-icon="inline-start" /> {mutation.isPending ? 'Importing…' : 'Import rows'}
        </Button>
        {parseError ? (
          <p className="text-danger" role="alert">
            {parseError}
          </p>
        ) : null}
        {mutation.isSuccess ? (
          <p className="text-success" role="status">
            Imported {mutation.data.imported} row(s).
          </p>
        ) : null}
        {mutation.isError ? (
          <p className="text-danger" role="alert">
            {mutation.error.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Field({
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
  value?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input defaultValue={value} id={name} name={name} required={required} type={type} />
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
  options: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Select name={name} required>
        <SelectTrigger id={name}>
          <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
