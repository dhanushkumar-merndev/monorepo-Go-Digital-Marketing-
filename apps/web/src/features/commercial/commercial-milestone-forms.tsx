'use client';

import { Button } from '@gdm/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gdm/ui/components/card';
import { Input } from '@gdm/ui/components/input';
import { Label } from '@gdm/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@gdm/ui/components/select';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';

import { useAuth } from '@/features/auth/auth-provider';

interface CommercialMilestoneBooking {
  currency: string;
  exchange_cases: { id: string; status: string; version: number }[];
  finance_cases: { id: string; status: string; version: number }[];
  payable_minor: number;
}

function headers(): HeadersInit {
  return { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() };
}

export function CommercialMilestoneForms({
  booking,
  bookingId,
}: {
  booking: CommercialMilestoneBooking;
  bookingId: string;
}) {
  const { api, session } = useAuth();
  const cache = useQueryClient();
  const [insurancePayment, setInsurancePayment] = useState('PENDING');
  const [documentType, setDocumentType] = useState('BOOKING_FORM');
  const [financeDecision, setFinanceDecision] = useState('APPROVED');
  const [exchangeDecisionValue, setExchangeDecisionValue] = useState('ACCEPTED');
  const activeFinance = booking.finance_cases[0];
  const activeExchange = booking.exchange_cases[0];
  const refresh = () =>
    void cache.invalidateQueries({ queryKey: ['commercial', 'booking', bookingId] });
  const finance = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      return api.request(`/commercial/bookings/${bookingId}/finance`, {
        body: JSON.stringify({
          applied_amount_minor: Number(data.get('applied_amount_minor')),
          currency: booking.currency,
          down_payment_minor: Number(data.get('down_payment_minor')),
          partner_name: String(data.get('partner_name')),
          provider_reference: String(data.get('provider_reference') ?? '') || null,
        }),
        headers: headers(),
        method: 'POST',
      });
    },
    onSuccess: refresh,
  });
  const financeDecisionMutation = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      if (!activeFinance) throw new Error('Finance case is missing.');
      const data = new FormData(form);
      return api.request(`/commercial/finance/${activeFinance.id}/decision`, {
        body: JSON.stringify({
          decision: financeDecision,
          expected_version: activeFinance.version,
          provider_reference: String(data.get('decision_provider_reference')),
          reason: String(data.get('decision_reason')),
          sanctioned_amount_minor:
            financeDecision === 'APPROVED' ? Number(data.get('sanctioned_amount_minor')) : null,
        }),
        headers: headers(),
        method: 'POST',
      });
    },
    onSuccess: refresh,
  });
  const disbursement = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      if (!activeFinance) throw new Error('Finance case is missing.');
      const data = new FormData(form);
      return api.request(`/commercial/finance/${activeFinance.id}/disburse`, {
        body: JSON.stringify({
          amount_minor: Number(data.get('disbursed_amount_minor')),
          disbursed_at: new Date(String(data.get('disbursed_at'))).toISOString(),
          expected_version: activeFinance.version,
          provider_reference: String(data.get('disbursement_provider_reference')),
        }),
        headers: headers(),
        method: 'POST',
      });
    },
    onSuccess: refresh,
  });
  const invoice = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      return api.request(`/commercial/bookings/${bookingId}/invoices`, {
        body: JSON.stringify({
          amount_minor: booking.payable_minor,
          currency: booking.currency,
          invoice_number: String(data.get('invoice_number')),
          issued_at: new Date(String(data.get('issued_at'))).toISOString(),
        }),
        headers: headers(),
        method: 'POST',
      });
    },
    onSuccess: refresh,
  });
  const insurance = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      const policyNumber = String(data.get('policy_number') ?? '') || null;
      return api.request(`/commercial/bookings/${bookingId}/insurance`, {
        body: JSON.stringify({
          currency: booking.currency,
          insurer_name: String(data.get('insurer_name')),
          payment_status: insurancePayment,
          policy_generated: Boolean(policyNumber),
          policy_number: policyNumber,
          premium_minor: Number(data.get('premium_minor')),
          quote_reference: String(data.get('quote_reference')),
        }),
        headers: headers(),
        method: 'POST',
      });
    },
    onSuccess: refresh,
  });
  const exchange = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      return api.request(`/commercial/bookings/${bookingId}/exchange`, {
        body: JSON.stringify({
          expected_price_minor: Number(data.get('expected_price_minor')),
          make_model: String(data.get('make_model')),
          odometer_km: Number(data.get('odometer_km')),
          ownership_name: String(data.get('ownership_name')),
          registration_number: String(data.get('registration_number')),
          year: Number(data.get('year')),
        }),
        headers: headers(),
        method: 'POST',
      });
    },
    onSuccess: refresh,
  });
  const exchangeDecision = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      if (!activeExchange) throw new Error('Exchange case is missing.');
      const data = new FormData(form);
      return api.request(`/commercial/exchange/${activeExchange.id}/decision`, {
        body: JSON.stringify({
          decision: exchangeDecisionValue,
          evaluated_price_minor: Number(data.get('evaluated_price_minor')),
          expected_version: activeExchange.version,
          reason: String(data.get('exchange_reason')),
        }),
        headers: headers(),
        method: 'POST',
      });
    },
    onSuccess: refresh,
  });
  const document = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const data = new FormData(form);
      const file = data.get('file');
      if (!(file instanceof File) || file.size === 0) throw new Error('Select a document file.');
      const initiated = await api.request<{
        document_id: string;
        upload: { method: 'PUT'; url: string };
      }>('/commercial/documents/uploads', {
        body: JSON.stringify({
          booking_id: bookingId,
          checksum_sha256: null,
          content_length: file.size,
          content_type: file.type,
          document_type: documentType,
          expires_at: null,
          file_name: file.name,
          preferred_delivery_channel: null,
        }),
        headers: headers(),
        method: 'POST',
      });
      const uploaded = await fetch(initiated.upload.url, {
        body: file,
        headers: { 'content-type': file.type },
        method: initiated.upload.method,
      });
      if (!uploaded.ok) throw new Error('Private object upload failed.');
      return api.request(`/commercial/documents/${initiated.document_id}/complete`, {
        body: JSON.stringify({ checksum_sha256: null }),
        headers: headers(),
        method: 'POST',
      });
    },
    onSuccess: refresh,
  });
  return (
    <div className="space-y-4">
      {session?.permissions.includes('commercial.finance.manage') && !activeFinance ? (
        <ActionForm
          description="Approval and disbursement remain separate later actions."
          error={finance.error}
          onSubmit={(form) => finance.mutate(form)}
          pending={finance.isPending}
          success={finance.isSuccess}
          title="Finance application"
        >
          <Field label="Partner" name="partner_name" />
          <Field label="Provider reference" name="provider_reference" required={false} />
          <Field label="Applied amount" name="applied_amount_minor" type="number" />
          <Field label="Down payment" name="down_payment_minor" type="number" />
        </ActionForm>
      ) : null}
      {session?.permissions.includes('commercial.finance.manage') &&
      activeFinance?.status === 'APPLIED' ? (
        <ActionForm
          error={financeDecisionMutation.error}
          onSubmit={(form) => financeDecisionMutation.mutate(form)}
          pending={financeDecisionMutation.isPending}
          success={financeDecisionMutation.isSuccess}
          title="Finance decision"
        >
          <div className="space-y-1">
            <Label htmlFor="finance-decision">Decision</Label>
            <Select
              onValueChange={(value) => setFinanceDecision(value ?? 'APPROVED')}
              value={financeDecision}
            >
              <SelectTrigger id="finance-decision">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="APPROVED">Approve</SelectItem>
                <SelectItem value="REJECTED">Reject</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Field label="Provider reference" name="decision_provider_reference" />
          <Field
            label="Sanctioned amount"
            name="sanctioned_amount_minor"
            required={financeDecision === 'APPROVED'}
            type="number"
          />
          <Field label="Decision reason" name="decision_reason" />
        </ActionForm>
      ) : null}
      {session?.permissions.includes('commercial.finance.manage') &&
      activeFinance?.status === 'APPROVED' ? (
        <ActionForm
          error={disbursement.error}
          onSubmit={(form) => disbursement.mutate(form)}
          pending={disbursement.isPending}
          success={disbursement.isSuccess}
          title="Finance disbursement"
        >
          <Field label="Disbursed amount" name="disbursed_amount_minor" type="number" />
          <Field label="Disbursed at" name="disbursed_at" type="datetime-local" />
          <Field label="Provider reference" name="disbursement_provider_reference" />
        </ActionForm>
      ) : null}
      {session?.permissions.includes('commercial.insurance.manage') ? (
        <ActionForm
          error={insurance.error}
          onSubmit={(form) => insurance.mutate(form)}
          pending={insurance.isPending}
          success={insurance.isSuccess}
          title="Insurance status"
        >
          <Field label="Insurer" name="insurer_name" />
          <Field label="Quote reference" name="quote_reference" />
          <Field label="Premium" name="premium_minor" type="number" />
          <Field label="Policy number (optional)" name="policy_number" required={false} />
          <div className="space-y-1">
            <Label htmlFor="insurance-payment">Payment status</Label>
            <Select
              onValueChange={(value) => setInsurancePayment(value ?? 'PENDING')}
              value={insurancePayment}
            >
              <SelectTrigger id="insurance-payment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="PAID">Paid</SelectItem>
                <SelectItem value="NOT_APPLICABLE">Not applicable</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </ActionForm>
      ) : null}
      {session?.permissions.includes('commercial.invoices.manage') ? (
        <ActionForm
          description="Amount is fixed to the canonical booking payable amount."
          error={invoice.error}
          onSubmit={(form) => invoice.mutate(form)}
          pending={invoice.isPending}
          success={invoice.isSuccess}
          title="Invoice"
        >
          <Field label="Invoice number" name="invoice_number" />
          <Field label="Issued at" name="issued_at" type="datetime-local" />
        </ActionForm>
      ) : null}
      {session?.permissions.includes('commercial.exchange.manage') && !activeExchange ? (
        <ActionForm
          error={exchange.error}
          onSubmit={(form) => exchange.mutate(form)}
          pending={exchange.isPending}
          success={exchange.isSuccess}
          title="Exchange evaluation"
        >
          <Field label="Make and model" name="make_model" />
          <Field label="Registration" name="registration_number" />
          <Field label="Year" name="year" type="number" />
          <Field label="Odometer km" name="odometer_km" type="number" />
          <Field label="Ownership name" name="ownership_name" />
          <Field label="Expected value" name="expected_price_minor" type="number" />
        </ActionForm>
      ) : null}
      {session?.permissions.includes('commercial.exchange.approve') &&
      activeExchange?.status === 'REQUESTED' ? (
        <ActionForm
          error={exchangeDecision.error}
          onSubmit={(form) => exchangeDecision.mutate(form)}
          pending={exchangeDecision.isPending}
          success={exchangeDecision.isSuccess}
          title="Exchange approval"
        >
          <div className="space-y-1">
            <Label htmlFor="exchange-decision">Decision</Label>
            <Select
              onValueChange={(value) => setExchangeDecisionValue(value ?? 'ACCEPTED')}
              value={exchangeDecisionValue}
            >
              <SelectTrigger id="exchange-decision">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACCEPTED">Accept</SelectItem>
                <SelectItem value="REJECTED">Reject</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Field label="Evaluated value" name="evaluated_price_minor" type="number" />
          <Field label="Decision reason" name="exchange_reason" />
        </ActionForm>
      ) : null}
      {session?.permissions.includes('commercial.documents.upload') ? (
        <ActionForm
          description="Files stay private. Approval remains blocked until the configured scanner reports CLEAN."
          error={document.error}
          onSubmit={(form) => document.mutate(form)}
          pending={document.isPending}
          success={document.isSuccess}
          title="Private document"
        >
          <div className="space-y-1">
            <Label htmlFor="document-type">Document type</Label>
            <Select
              onValueChange={(value) => setDocumentType(value ?? 'BOOKING_FORM')}
              value={documentType}
            >
              <SelectTrigger id="document-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BOOKING_FORM">Booking form</SelectItem>
                <SelectItem value="IDENTITY_PROOF">Identity proof</SelectItem>
                <SelectItem value="ADDRESS_PROOF">Address proof</SelectItem>
                <SelectItem value="PAYMENT_PROOF">Payment proof</SelectItem>
                <SelectItem value="FINANCE_DOCUMENT">Finance document</SelectItem>
                <SelectItem value="INVOICE">Invoice</SelectItem>
                <SelectItem value="INSURANCE_POLICY">Insurance policy</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="commercial-document-file">PDF or image</Label>
            <Input
              accept="application/pdf,image/jpeg,image/png,image/webp"
              id="commercial-document-file"
              name="file"
              required
              type="file"
            />
          </div>
        </ActionForm>
      ) : null}
    </div>
  );
}

function ActionForm({
  children,
  description,
  error,
  onSubmit,
  pending,
  success,
  title,
}: {
  children: ReactNode;
  description?: string;
  error: Error | null;
  onSubmit: (form: HTMLFormElement) => void;
  pending: boolean;
  success: boolean;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            onSubmit(event.currentTarget);
          }}
        >
          {children}
          <div className="sm:col-span-2">
            <Button disabled={pending} type="submit">
              {pending ? 'Saving…' : `Save ${title.toLowerCase()}`}
            </Button>
          </div>
        </form>
        {success ? (
          <p className="text-success mt-3 text-sm" role="status">
            Saved successfully.
          </p>
        ) : null}
        {error ? (
          <p className="text-danger mt-3 text-sm" role="alert">
            {error.message}
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
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={`milestone-${name}`}>{label}</Label>
      <Input id={`milestone-${name}`} name={name} required={required} type={type} />
    </div>
  );
}
