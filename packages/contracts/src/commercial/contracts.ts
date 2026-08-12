import { z } from 'zod';

const idSchema = z.uuid();
const nonBlank = (maximum: number) => z.string().trim().min(1).max(maximum);
const moneySchema = z.number().int().min(0).max(100_000_000_000_000);
const positiveMoneySchema = moneySchema.refine((value) => value > 0, 'Amount must be positive.');
const currencySchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/u)
  .default('INR');

export const BOOKING_STATUS_CODES = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;
export const PAYMENT_TYPE_CODES = ['FULL', 'PARTIAL', 'FINANCE', 'INSTALLMENT', 'MIXED'] as const;
export const PAYMENT_ENTRY_STATUS_CODES = [
  'PENDING_VERIFICATION',
  'VERIFIED',
  'REJECTED',
  'REVERSED',
] as const;
export const FINANCE_STATUS_CODES = ['APPLIED', 'APPROVED', 'REJECTED', 'DISBURSED'] as const;
export const DOCUMENT_STATUS_CODES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'SUPERSEDED',
] as const;

export const bookingStatusSchema = z.enum(BOOKING_STATUS_CODES);
export const paymentTypeSchema = z.enum(PAYMENT_TYPE_CODES);
export const paymentEntryStatusSchema = z.enum(PAYMENT_ENTRY_STATUS_CODES);
export const financeStatusSchema = z.enum(FINANCE_STATUS_CODES);
export const commercialDocumentStatusSchema = z.enum(DOCUMENT_STATUS_CODES);

export const priceComponentInputSchema = z.object({
  code: nonBlank(64),
  label: nonBlank(160),
  amount_minor: moneySchema,
  category: z.enum([
    'EX_SHOWROOM',
    'RTO',
    'INSURANCE',
    'ACCESSORIES',
    'TAX',
    'FEE',
    'DISCOUNT',
    'EXCHANGE',
    'OTHER',
  ]),
});

export const createQuotationRequestSchema = z.object({
  branch_id: idSchema,
  contact_id: idSchema,
  currency: currencySchema,
  expires_at: z.iso.datetime({ offset: true }),
  lead_id: idSchema,
  notes: z.string().trim().max(4000).nullable().default(null),
  price_components: z.array(priceComponentInputSchema).min(1).max(100),
  quotation_reference: nonBlank(120),
  vehicle_configuration: nonBlank(1000),
});

export const reviseQuotationRequestSchema = z.object({
  expected_version: z.number().int().min(1),
  expires_at: z.iso.datetime({ offset: true }),
  notes: z.string().trim().max(4000).nullable().default(null),
  price_components: z.array(priceComponentInputSchema).min(1).max(100),
  reason: nonBlank(1000),
  vehicle_configuration: nonBlank(1000),
});

export const decideDiscountApprovalRequestSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  expected_quotation_version: z.number().int().min(1),
  reason: nonBlank(1000),
});

export const createBookingRequestSchema = z.object({
  booking_reference: nonBlank(120),
  customer_confirmed_at: z.iso.datetime({ offset: true }),
  expected_delivery_at: z.iso.datetime({ offset: true }).nullable().default(null),
  payment_type: paymentTypeSchema,
  quotation_id: idSchema,
  quotation_version: z.number().int().min(1),
});

export const cancelBookingRequestSchema = z.object({
  expected_version: z.number().int().min(1),
  notification_decision: nonBlank(1000),
  reason: nonBlank(1000),
  refund_settlement_note: z.string().trim().max(4000).nullable().default(null),
});

export const createPaymentEntryRequestSchema = z.object({
  amount_minor: positiveMoneySchema,
  currency: currencySchema,
  method: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'FINANCE', 'OTHER']),
  payment_reference: nonBlank(160),
  proof_document_version_id: idSchema.nullable().default(null),
  received_at: z.iso.datetime({ offset: true }),
});

export const verifyPaymentEntryRequestSchema = z.object({
  decision: z.enum(['VERIFIED', 'REJECTED']),
  reason: nonBlank(1000),
});

export const reversePaymentEntryRequestSchema = z.object({
  reason: nonBlank(1000),
});

export const createFinanceCaseRequestSchema = z.object({
  applied_amount_minor: positiveMoneySchema,
  currency: currencySchema,
  down_payment_minor: moneySchema,
  partner_name: nonBlank(200),
  provider_reference: z.string().trim().max(160).nullable().default(null),
});

export const decideFinanceCaseRequestSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    expected_version: z.number().int().min(1),
    provider_reference: nonBlank(160),
    reason: nonBlank(1000),
    sanctioned_amount_minor: moneySchema.nullable().default(null),
  })
  .superRefine((value, context) => {
    if (value.decision === 'APPROVED' && !value.sanctioned_amount_minor) {
      context.addIssue({
        code: 'custom',
        message: 'An approved finance case requires a sanctioned amount.',
        path: ['sanctioned_amount_minor'],
      });
    }
  });

export const disburseFinanceCaseRequestSchema = z.object({
  amount_minor: positiveMoneySchema,
  disbursed_at: z.iso.datetime({ offset: true }),
  expected_version: z.number().int().min(1),
  provider_reference: nonBlank(160),
});

export const createInsuranceCaseRequestSchema = z.object({
  currency: currencySchema,
  insurer_name: nonBlank(200),
  payment_status: z.enum(['PENDING', 'PAID', 'NOT_APPLICABLE']),
  policy_generated: z.boolean(),
  policy_number: z.string().trim().max(160).nullable().default(null),
  premium_minor: moneySchema,
  quote_reference: nonBlank(160),
});

export const createInvoiceRequestSchema = z.object({
  amount_minor: positiveMoneySchema,
  currency: currencySchema,
  issued_at: z.iso.datetime({ offset: true }),
  invoice_number: nonBlank(160),
});

export const createExchangeCaseRequestSchema = z.object({
  expected_price_minor: moneySchema,
  make_model: nonBlank(240),
  odometer_km: z.number().int().min(0).max(5_000_000),
  ownership_name: nonBlank(200),
  registration_number: nonBlank(64),
  year: z.number().int().min(1900).max(2200),
});

export const decideExchangeCaseRequestSchema = z.object({
  decision: z.enum(['ACCEPTED', 'REJECTED']),
  evaluated_price_minor: moneySchema,
  expected_version: z.number().int().min(1),
  reason: nonBlank(1000),
});

const allowedDocumentContentType = z.enum([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const initiateCommercialDocumentUploadRequestSchema = z.object({
  booking_id: idSchema,
  checksum_sha256: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{64}$/u)
    .nullable()
    .default(null),
  content_length: z
    .number()
    .int()
    .min(1)
    .max(20 * 1024 * 1024),
  content_type: allowedDocumentContentType,
  document_type: z.enum([
    'BOOKING_FORM',
    'IDENTITY_PROOF',
    'ADDRESS_PROOF',
    'PAYMENT_PROOF',
    'FINANCE_DOCUMENT',
    'INVOICE',
    'INSURANCE_POLICY',
    'EXCHANGE_RC',
    'EXCHANGE_PHOTO',
    'OTHER',
  ]),
  expires_at: z.iso.datetime({ offset: true }).nullable().default(null),
  file_name: nonBlank(240),
  preferred_delivery_channel: z
    .enum(['WHATSAPP', 'EMAIL', 'SMS_SECURE_LINK', 'COURIER', 'PICKUP', 'ASK_EVERY_TIME'])
    .nullable()
    .default(null),
});

export const completeCommercialDocumentUploadRequestSchema = z.object({
  checksum_sha256: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{64}$/u)
    .nullable()
    .default(null),
});

export const verifyCommercialDocumentRequestSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reason: nonBlank(1000),
});

export const commercialBookingListQuerySchema = z.object({
  branch_id: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  page: z.coerce.number().int().min(1).default(1),
  search: z.string().trim().max(120).optional(),
  status: bookingStatusSchema.optional(),
});

export const quotationSummarySchema = z.object({
  approval_status: z.enum(['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED']),
  branch_id: idSchema,
  contact_id: idSchema,
  currency: currencySchema,
  discount_minor: moneySchema,
  expires_at: z.iso.datetime(),
  id: idSchema,
  lead_id: idSchema,
  payable_minor: moneySchema,
  quotation_reference: z.string(),
  status: z.enum(['DRAFT', 'ACTIVE', 'SUPERSEDED', 'EXPIRED']),
  total_minor: moneySchema,
  vehicle_configuration: z.string(),
  version: z.number().int().min(1),
});

export const bookingSummarySchema = z.object({
  balance_minor: moneySchema,
  booking_reference: z.string(),
  branch_id: idSchema,
  contact_id: idSchema,
  currency: currencySchema,
  customer_name: z.string(),
  expected_delivery_at: z.iso.datetime().nullable(),
  id: idSchema,
  lead_id: idSchema,
  payable_minor: moneySchema,
  payment_status: z.enum(['PENDING', 'PARTIAL', 'COMPLETED']),
  payment_type: paymentTypeSchema,
  status: bookingStatusSchema,
  verified_paid_minor: moneySchema,
  version: z.number().int().min(1),
});

export const readinessItemSchema = z.object({
  blocking: z.boolean(),
  code: z.string(),
  complete: z.boolean(),
  detail: z.string(),
});

export const deliveryReadinessSchema = z.object({
  booking_id: idSchema,
  evaluated_at: z.iso.datetime(),
  items: z.array(readinessItemSchema),
  ready: z.boolean(),
});

export type BookingStatus = z.infer<typeof bookingStatusSchema>;
export type CancelBookingRequest = z.infer<typeof cancelBookingRequestSchema>;
export type CommercialBookingListQuery = z.infer<typeof commercialBookingListQuerySchema>;
export type CompleteCommercialDocumentUploadRequest = z.infer<
  typeof completeCommercialDocumentUploadRequestSchema
>;
export type CreateBookingRequest = z.infer<typeof createBookingRequestSchema>;
export type CreateExchangeCaseRequest = z.infer<typeof createExchangeCaseRequestSchema>;
export type CreateFinanceCaseRequest = z.infer<typeof createFinanceCaseRequestSchema>;
export type CreateInsuranceCaseRequest = z.infer<typeof createInsuranceCaseRequestSchema>;
export type CreateInvoiceRequest = z.infer<typeof createInvoiceRequestSchema>;
export type CreatePaymentEntryRequest = z.infer<typeof createPaymentEntryRequestSchema>;
export type CreateQuotationRequest = z.infer<typeof createQuotationRequestSchema>;
export type DecideDiscountApprovalRequest = z.infer<typeof decideDiscountApprovalRequestSchema>;
export type DecideExchangeCaseRequest = z.infer<typeof decideExchangeCaseRequestSchema>;
export type DecideFinanceCaseRequest = z.infer<typeof decideFinanceCaseRequestSchema>;
export type DeliveryReadiness = z.infer<typeof deliveryReadinessSchema>;
export type DisburseFinanceCaseRequest = z.infer<typeof disburseFinanceCaseRequestSchema>;
export type InitiateCommercialDocumentUploadRequest = z.infer<
  typeof initiateCommercialDocumentUploadRequestSchema
>;
export type PaymentType = z.infer<typeof paymentTypeSchema>;
export type ReversePaymentEntryRequest = z.infer<typeof reversePaymentEntryRequestSchema>;
export type ReviseQuotationRequest = z.infer<typeof reviseQuotationRequestSchema>;
export type VerifyCommercialDocumentRequest = z.infer<typeof verifyCommercialDocumentRequestSchema>;
export type VerifyPaymentEntryRequest = z.infer<typeof verifyPaymentEntryRequestSchema>;
export type BookingSummary = z.infer<typeof bookingSummarySchema>;
export type QuotationSummary = z.infer<typeof quotationSummarySchema>;
