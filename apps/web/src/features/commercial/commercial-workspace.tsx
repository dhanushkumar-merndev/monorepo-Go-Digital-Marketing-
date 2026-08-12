'use client';

import type { BookingSummary } from '@gdm/contracts';
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
import { FilePlus2, ReceiptText, RefreshCw, Search } from 'lucide-react';
import Link from 'next/link';
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

function headers(): HeadersInit {
  return { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() };
}

function currency(value: number, code: string): string {
  return new Intl.NumberFormat('en-IN', { currency: code, style: 'currency' }).format(value / 100);
}

export function CommercialWorkspace() {
  const { api, session } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const cache = useQueryClient();
  const search = params.get('search') ?? '';
  const status = params.get('status') ?? 'ALL';
  const { page, pageSize } = readPageParameters(params);
  const [searchDraft, setSearchDraft] = useState(search);
  const [createOpen, setCreateOpen] = useState(false);
  const query = new URLSearchParams({ limit: String(pageSize), page: String(page) });
  if (search) query.set('search', search);
  if (status !== 'ALL') query.set('status', status);
  const bookings = useQuery({
    queryKey: ['commercial', 'bookings', search, status, page, pageSize],
    queryFn: () =>
      api.request<{ items: BookingSummary[]; pagination: PageMetadata }>(
        `/commercial/bookings?${query}`,
      ),
  });
  const canCreate = session?.permissions.includes('commercial.quotations.manage') ?? false;
  const canApprove = session?.permissions.includes('commercial.discounts.approve') ?? false;

  function navigate(nextSearch: string, nextStatus: string, nextPage = 1, nextPageSize = pageSize) {
    const next = new URLSearchParams({ page: String(nextPage), page_size: String(nextPageSize) });
    if (nextSearch) next.set('search', nextSearch);
    if (nextStatus !== 'ALL') next.set('status', nextStatus);
    router.replace(`/bookings${next.size ? `?${next.toString()}` : ''}`);
  }

  return (
    <PermissionGate permission="commercial.bookings.read">
      <div className="space-y-6">
        <PageHeader
          actions={
            canCreate ? (
              <Button onClick={() => setCreateOpen((open) => !open)}>
                <FilePlus2 data-icon="inline-start" />
                New commercial case
              </Button>
            ) : null
          }
          description="Versioned quotations, verified payment status, finance milestones and delivery gates remain backend-authoritative."
          eyebrow="Commercial"
          title="Bookings and billing"
        />
        {createOpen ? (
          <CreateCommercialCase
            onCreated={() => {
              setCreateOpen(false);
              void cache.invalidateQueries({ queryKey: ['commercial'] });
            }}
          />
        ) : null}
        {canApprove ? <DiscountDecision /> : null}
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-end">
            <form
              className="flex flex-1 items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                navigate(searchDraft.trim(), status);
              }}
            >
              <div className="flex-1 space-y-1">
                <Label htmlFor="commercial-search">Search bookings</Label>
                <Input
                  id="commercial-search"
                  onChange={(event) => setSearchDraft(event.target.value)}
                  placeholder="Booking reference or customer"
                  value={searchDraft}
                />
              </div>
              <Button type="submit" variant="outline">
                <Search data-icon="inline-start" />
                Search
              </Button>
            </form>
            <div className="min-w-44 space-y-1">
              <Label htmlFor="commercial-status">Status</Label>
              <Select onValueChange={(value) => navigate(search, value ?? 'ALL')} value={status}>
                <SelectTrigger id="commercial-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
        <BookingTable
          onPage={(value) => navigate(search, status, value)}
          onPageSize={(value) => navigate(search, status, 1, value)}
          query={bookings}
        />
      </div>
    </PermissionGate>
  );
}

function DiscountDecision() {
  const { api } = useAuth();
  const cache = useQueryClient();
  const [decision, setDecision] = useState('APPROVED');
  const mutation = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      return api.request(
        `/commercial/quotations/${String(data.get('quotation_id'))}/discount-decision`,
        {
          body: JSON.stringify({
            decision,
            expected_quotation_version: Number(data.get('quotation_version')),
            reason: String(data.get('reason')),
          }),
          headers: headers(),
          method: 'POST',
        },
      );
    },
    onSuccess: () => void cache.invalidateQueries({ queryKey: ['commercial'] }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Discount approval</CardTitle>
        <CardDescription>
          Decide the exact pending quotation version with retained reason evidence.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            mutation.mutate(event.currentTarget);
          }}
        >
          <Field label="Quotation ID" name="quotation_id" />
          <Field label="Quotation version" name="quotation_version" type="number" />
          <div className="space-y-1">
            <Label htmlFor="discount-decision">Decision</Label>
            <Select onValueChange={(value) => setDecision(value ?? 'APPROVED')} value={decision}>
              <SelectTrigger id="discount-decision">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="APPROVED">Approve</SelectItem>
                <SelectItem value="REJECTED">Reject</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="discount-reason">Reason</Label>
            <Textarea id="discount-reason" name="reason" required />
          </div>
          <div className="sm:col-span-2">
            <Button disabled={mutation.isPending} type="submit">
              {mutation.isPending ? 'Saving…' : 'Save decision'}
            </Button>
          </div>
        </form>
        {mutation.isSuccess ? (
          <p className="text-success mt-3 text-sm" role="status">
            Discount decision recorded.
          </p>
        ) : null}
        {mutation.isError ? (
          <p className="text-danger mt-3 text-sm" role="alert">
            {mutation.error.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function BookingTable({
  onPage,
  onPageSize,
  query,
}: {
  onPage(page: number): void;
  onPageSize(pageSize: number): void;
  query: ReturnType<typeof useQuery<{ items: BookingSummary[]; pagination: PageMetadata }>>;
}) {
  if (query.isPending)
    return (
      <div aria-label="Loading bookings" className="space-y-3">
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
            <RefreshCw data-icon="inline-start" />
            Retry
          </Button>
        }
        description={query.error.message}
        icon={<ReceiptText className="size-5" />}
        title="Bookings could not be loaded"
      />
    );
  const items = query.data?.items ?? [];
  if (items.length === 0)
    return (
      <EmptyState
        description="No branch-scoped bookings match this view."
        icon={<ReceiptText className="size-5" />}
        title="No bookings found"
      />
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Commercial bookings</CardTitle>
        <CardDescription>Only verified entries affect paid and balance status.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Booking</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((booking) => (
                <TableRow key={booking.id}>
                  <TableCell>
                    <Link className="font-medium hover:underline" href={`/bookings/${booking.id}`}>
                      {booking.booking_reference}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      v{booking.version} · {booking.payment_type}
                    </p>
                  </TableCell>
                  <TableCell>{booking.customer_name}</TableCell>
                  <TableCell>
                    {currency(booking.verified_paid_minor, booking.currency)}
                    <p className="text-muted-foreground text-xs">
                      Balance {currency(booking.balance_minor, booking.currency)}
                    </p>
                  </TableCell>
                  <TableCell>
                    {booking.expected_delivery_at
                      ? new Date(booking.expected_delivery_at).toLocaleDateString()
                      : 'Not scheduled'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{booking.status}</Badge>
                    <p className="text-muted-foreground mt-1 text-xs">{booking.payment_status}</p>
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

function CreateCommercialCase({ onCreated }: { onCreated: () => void }) {
  const { api } = useAuth();
  const [quotationId, setQuotationId] = useState<string | null>(null);
  const [paymentType, setPaymentType] = useState('FULL');
  const mutation = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const data = new FormData(form);
      const quotation = await api.request<{
        approval_status: 'APPROVED' | 'NOT_REQUIRED' | 'PENDING' | 'REJECTED';
        id: string;
        status: string;
        version: number;
      }>('/commercial/quotations', {
        body: JSON.stringify({
          branch_id: String(data.get('branch_id')),
          contact_id: String(data.get('contact_id')),
          currency: 'INR',
          expires_at: new Date(String(data.get('expires_at'))).toISOString(),
          lead_id: String(data.get('lead_id')),
          notes: String(data.get('notes') ?? '') || null,
          price_components: [
            {
              amount_minor: Number(data.get('base_minor')),
              category: 'EX_SHOWROOM',
              code: 'BASE',
              label: 'Vehicle price',
            },
            {
              amount_minor: Number(data.get('discount_minor') ?? 0),
              category: 'DISCOUNT',
              code: 'DISCOUNT',
              label: 'Discount',
            },
          ],
          quotation_reference: String(data.get('quotation_reference')),
          vehicle_configuration: String(data.get('vehicle_configuration')),
        }),
        headers: headers(),
        method: 'POST',
      });
      setQuotationId(quotation.id);
      if (quotation.status !== 'ACTIVE') return { quotation };
      const booking = await api.request<{ booking_id: string }>('/commercial/bookings', {
        body: JSON.stringify({
          booking_reference: String(data.get('booking_reference')),
          customer_confirmed_at: new Date().toISOString(),
          expected_delivery_at: data.get('expected_delivery_at')
            ? new Date(String(data.get('expected_delivery_at'))).toISOString()
            : null,
          payment_type: paymentType,
          quotation_id: quotation.id,
          quotation_version: quotation.version,
        }),
        headers: headers(),
        method: 'POST',
      });
      return { booking, quotation };
    },
    onSuccess: (result) => {
      if (result.booking) onCreated();
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create quotation</CardTitle>
        <CardDescription>
          A booking can be created from this quotation after any required discount approval.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            mutation.mutate(event.currentTarget);
          }}
        >
          <Field label="Branch ID" name="branch_id" />
          <Field label="Lead ID" name="lead_id" />
          <Field label="Contact ID" name="contact_id" />
          <Field label="Quotation reference" name="quotation_reference" />
          <Field label="Booking reference" name="booking_reference" />
          <Field label="Vehicle configuration" name="vehicle_configuration" />
          <Field label="Valid until" name="expires_at" type="datetime-local" />
          <Field
            label="Expected delivery"
            name="expected_delivery_at"
            required={false}
            type="datetime-local"
          />
          <Field label="Vehicle price (minor units)" name="base_minor" type="number" />
          <Field label="Discount (minor units)" name="discount_minor" type="number" value="0" />
          <div className="space-y-1">
            <Label htmlFor="commercial-payment-type">Payment type</Label>
            <Select onValueChange={(value) => setPaymentType(value ?? 'FULL')} value={paymentType}>
              <SelectTrigger id="commercial-payment-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FULL">Full</SelectItem>
                <SelectItem value="PARTIAL">Partial</SelectItem>
                <SelectItem value="FINANCE">Finance</SelectItem>
                <SelectItem value="INSTALLMENT">Installment</SelectItem>
                <SelectItem value="MIXED">Mixed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="commercial-notes">Notes</Label>
            <Textarea id="commercial-notes" name="notes" />
          </div>
          <div className="sm:col-span-2">
            <Button disabled={mutation.isPending} type="submit">
              {mutation.isPending ? 'Creating…' : 'Create quotation'}
            </Button>
          </div>
        </form>
        {mutation.isError ? (
          <p className="text-danger mt-3 text-sm" role="alert">
            {mutation.error.message}
          </p>
        ) : null}
        {mutation.isSuccess && !mutation.data.booking ? (
          <p className="text-warning mt-3 text-sm" role="status">
            Quotation {quotationId} is awaiting discount approval. No booking was created.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  name,
  required = true,
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
    <div className="space-y-1">
      <Label htmlFor={`commercial-${name}`}>{label}</Label>
      <Input
        defaultValue={value}
        id={`commercial-${name}`}
        name={name}
        required={required}
        type={type}
      />
    </div>
  );
}
