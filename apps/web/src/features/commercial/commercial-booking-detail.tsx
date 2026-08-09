'use client';

import type { BookingSummary, DeliveryReadiness } from '@gdm/contracts';
import { Badge } from '@gdm/ui/components/badge';
import { Button, buttonVariants } from '@gdm/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gdm/ui/components/card';
import { EmptyState } from '@gdm/ui/components/empty-state';
import { Input } from '@gdm/ui/components/input';
import { Label } from '@gdm/ui/components/label';
import { Skeleton } from '@gdm/ui/components/skeleton';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, CircleAlert, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import type { FormEvent } from 'react';

import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/features/auth/auth-provider';
import { PermissionGate } from '@/features/auth/permission-gate';
import { CommercialMilestoneForms } from './commercial-milestone-forms';

interface PaymentRow {
  amountMinor: number;
  createdAt: string;
  id: string;
  kind: 'PAYMENT' | 'REVERSAL';
  method: string;
  paymentReference: string;
  status: 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED' | 'REVERSED';
}

interface BookingDetail extends BookingSummary {
  allocation: { id: string; inventoryUnitId: string; status: string } | null;
  documents: {
    documentType: string;
    id: string;
    scanStatus: string;
    status: string;
    uploadStatus: string;
  }[];
  exchange_cases: { id: string; status: string; version: number }[];
  finance_cases: { id: string; partnerName: string; status: string; version: number }[];
  insurance: { insurerName: string; paymentStatus: string; policyGenerated: boolean } | null;
  invoices: { id: string; invoiceNumber: string }[];
  items: { amountMinor: number; code: string; description: string; quantity: number }[];
  payments: PaymentRow[];
}

function headers(): HeadersInit {
  return { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() };
}

function money(value: number, code: string): string {
  return new Intl.NumberFormat('en-IN', { currency: code, style: 'currency' }).format(value / 100);
}

export function CommercialBookingDetail({ bookingId }: { bookingId: string }) {
  const { api, session } = useAuth();
  const cache = useQueryClient();
  const booking = useQuery({
    queryKey: ['commercial', 'booking', bookingId],
    queryFn: () => api.request<BookingDetail>(`/commercial/bookings/${bookingId}`),
  });
  const readiness = useMutation({
    mutationFn: () =>
      api.request<DeliveryReadiness>(`/commercial/bookings/${bookingId}/readiness/evaluate`, {
        method: 'POST',
      }),
  });
  const payment = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      return api.request(`/commercial/bookings/${bookingId}/payments`, {
        body: JSON.stringify({
          amount_minor: Number(data.get('amount_minor')),
          currency: booking.data?.currency ?? 'INR',
          method: String(data.get('method') ?? 'UPI'),
          payment_reference: String(data.get('payment_reference')),
          proof_document_version_id: null,
          received_at: new Date(String(data.get('received_at'))).toISOString(),
        }),
        headers: headers(),
        method: 'POST',
      });
    },
    onSuccess: () =>
      void cache.invalidateQueries({ queryKey: ['commercial', 'booking', bookingId] }),
  });
  const verify = useMutation({
    mutationFn: ({ id, decision }: { decision: 'VERIFIED' | 'REJECTED'; id: string }) =>
      api.request(`/commercial/payments/${id}/verify`, {
        body: JSON.stringify({
          decision,
          reason:
            decision === 'VERIFIED'
              ? 'Evidence reviewed in the billing workspace.'
              : 'Evidence did not match the payment.',
        }),
        headers: headers(),
        method: 'POST',
      }),
    onSuccess: () =>
      void cache.invalidateQueries({ queryKey: ['commercial', 'booking', bookingId] }),
  });
  const verifyDocument = useMutation({
    mutationFn: ({ decision, id }: { decision: 'APPROVED' | 'REJECTED'; id: string }) =>
      api.request(`/commercial/documents/${id}/verify`, {
        body: JSON.stringify({
          decision,
          reason:
            decision === 'APPROVED'
              ? 'Scanned document reviewed in the commercial workspace.'
              : 'Document evidence was rejected during review.',
        }),
        headers: headers(),
        method: 'POST',
      }),
    onSuccess: () =>
      void cache.invalidateQueries({ queryKey: ['commercial', 'booking', bookingId] }),
  });

  if (booking.isPending)
    return (
      <div aria-label="Loading booking" className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (booking.isError || !booking.data)
    return (
      <EmptyState
        action={
          <Button onClick={() => void booking.refetch()} variant="outline">
            <RefreshCw data-icon="inline-start" />
            Retry
          </Button>
        }
        description={booking.error?.message ?? 'Booking not found.'}
        icon={<CircleAlert className="size-5" />}
        title="Booking unavailable"
      />
    );
  const detail = booking.data;
  return (
    <PermissionGate permission="commercial.bookings.read">
      <div className="space-y-6">
        <PageHeader
          actions={
            <Link className={buttonVariants({ variant: 'outline' })} href="/bookings">
              <ArrowLeft data-icon="inline-start" />
              Bookings
            </Link>
          }
          description={`${detail.customer_name} · ${detail.payment_type} · Version ${detail.version}`}
          eyebrow="Commercial booking"
          title={detail.booking_reference}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Metric label="Payable" value={money(detail.payable_minor, detail.currency)} />
          <Metric
            label="Verified paid"
            value={money(detail.verified_paid_minor, detail.currency)}
          />
          <Metric label="Balance" value={money(detail.balance_minor, detail.currency)} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Price breakdown</CardTitle>
            <CardDescription>Immutable snapshot of the booked quotation version.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {detail.items.map((item) => (
              <div
                className="flex items-center justify-between gap-4 border-b py-2 last:border-0"
                key={item.code}
              >
                <span>
                  <span className="font-medium">{item.description}</span>
                  <span className="text-muted-foreground block text-xs">
                    {item.code} · Qty {item.quantity}
                  </span>
                </span>
                <span>{money(item.amountMinor, detail.currency)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Payment evidence</CardTitle>
              <CardDescription>
                Proof upload never marks an entry paid; a separate authorized verification is
                required.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {detail.payments.length === 0 ? (
                <p className="text-muted-foreground text-sm">No payment entries.</p>
              ) : (
                detail.payments.map((entry) => (
                  <div
                    className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"
                    key={entry.id}
                  >
                    <div className="flex-1">
                      <p className="font-medium">
                        {money(entry.amountMinor, detail.currency)} · {entry.method}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {entry.paymentReference} · {entry.kind}
                      </p>
                    </div>
                    <Badge variant="outline">{entry.status}</Badge>
                    {entry.status === 'PENDING_VERIFICATION' &&
                    session?.permissions.includes('commercial.payments.verify') ? (
                      <div className="flex gap-2">
                        <Button
                          disabled={verify.isPending}
                          onClick={() => verify.mutate({ decision: 'VERIFIED', id: entry.id })}
                          size="sm"
                        >
                          Verify
                        </Button>
                        <Button
                          disabled={verify.isPending}
                          onClick={() => verify.mutate({ decision: 'REJECTED', id: entry.id })}
                          size="sm"
                          variant="outline"
                        >
                          Reject
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
              {session?.permissions.includes('commercial.payments.record') &&
              detail.status === 'CONFIRMED' ? (
                <form
                  className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2"
                  onSubmit={(event: FormEvent<HTMLFormElement>) => {
                    event.preventDefault();
                    payment.mutate(event.currentTarget);
                  }}
                >
                  <Field label="Amount (minor units)" name="amount_minor" type="number" />
                  <Field label="Payment reference" name="payment_reference" />
                  <Field label="Method" name="method" value="UPI" />
                  <Field label="Received at" name="received_at" type="datetime-local" />
                  <div className="sm:col-span-2">
                    <Button disabled={payment.isPending} type="submit">
                      {payment.isPending ? 'Recording…' : 'Record pending payment'}
                    </Button>
                  </div>
                  {payment.isError ? (
                    <p className="text-danger text-sm sm:col-span-2" role="alert">
                      {payment.error.message}
                    </p>
                  ) : null}
                </form>
              ) : null}
            </CardContent>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Delivery readiness</CardTitle>
                <CardDescription>
                  Computed from canonical records, never from a client assertion.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button disabled={readiness.isPending} onClick={() => readiness.mutate()}>
                  {readiness.isPending ? 'Evaluating…' : 'Evaluate readiness'}
                </Button>
                {readiness.isError ? (
                  <p className="text-danger text-sm" role="alert">
                    {readiness.error.message}
                  </p>
                ) : null}
                {readiness.data ? (
                  <div className="space-y-2">
                    <Badge variant="outline">{readiness.data.ready ? 'READY' : 'BLOCKED'}</Badge>
                    {readiness.data.items.map((item) => (
                      <div className="flex gap-2 text-sm" key={item.code}>
                        {item.complete ? (
                          <CheckCircle2 className="text-success mt-0.5 size-4" />
                        ) : (
                          <CircleAlert className="text-danger mt-0.5 size-4" />
                        )}
                        <span>
                          <span className="font-medium">{item.code.replaceAll('_', ' ')}</span>
                          <span className="text-muted-foreground block text-xs">{item.detail}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Dependencies</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>Finance: {detail.finance_cases[0]?.status ?? 'Missing'}</p>
                <p>
                  Insurance:{' '}
                  {detail.insurance
                    ? `${detail.insurance.policyGenerated ? 'Policy generated' : 'Policy pending'} · ${detail.insurance.paymentStatus}`
                    : 'Missing'}
                </p>
                <p>Invoices: {detail.invoices.length}</p>
                <p>
                  Allocation:{' '}
                  {detail.allocation
                    ? `${detail.allocation.inventoryUnitId} · ${detail.allocation.status}`
                    : 'Missing'}
                </p>
                <p>
                  Approved documents:{' '}
                  {detail.documents.filter((document) => document.status === 'APPROVED').length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Document checklist</CardTitle>
                <CardDescription>
                  Private versions and scanner status are shown without exposing object keys.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {detail.documents.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No documents uploaded.</p>
                ) : (
                  detail.documents.map((document) => (
                    <div className="rounded-lg border p-3" key={document.id}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">
                          {document.documentType.replaceAll('_', ' ')}
                        </span>
                        <Badge variant="outline">{document.status}</Badge>
                      </div>
                      <p className="text-muted-foreground mt-1 text-xs">
                        Upload {document.uploadStatus} · Scan {document.scanStatus}
                      </p>
                      {session?.permissions.includes('commercial.documents.verify') &&
                      document.status !== 'APPROVED' ? (
                        <div className="mt-3 flex gap-2">
                          <Button
                            disabled={verifyDocument.isPending || document.scanStatus !== 'CLEAN'}
                            onClick={() =>
                              verifyDocument.mutate({ decision: 'APPROVED', id: document.id })
                            }
                            size="sm"
                          >
                            Approve
                          </Button>
                          <Button
                            disabled={verifyDocument.isPending}
                            onClick={() =>
                              verifyDocument.mutate({ decision: 'REJECTED', id: document.id })
                            }
                            size="sm"
                            variant="outline"
                          >
                            Reject
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
                {verifyDocument.isError ? (
                  <p className="text-danger text-sm" role="alert">
                    {verifyDocument.error.message}
                  </p>
                ) : null}
              </CardContent>
            </Card>
            <CommercialMilestoneForms booking={detail} bookingId={bookingId} />
          </div>
        </div>
      </div>
    </PermissionGate>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  name,
  type = 'text',
  value,
}: {
  label: string;
  name: string;
  type?: string;
  value?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={`booking-${name}`}>{label}</Label>
      <Input defaultValue={value} id={`booking-${name}`} name={name} required type={type} />
    </div>
  );
}
