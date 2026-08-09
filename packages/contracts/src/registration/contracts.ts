import { z } from 'zod';

const id = z.uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().default(null);
const queryBoolean = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((value) => value === 'true'),
]);

export const REGISTRATION_STATUS_CODES = [
  'DOCUMENTS_READY',
  'REGISTRATION_STARTED',
  'RTO_SUBMITTED',
  'NUMBER_ALLOTTED',
  'RC_PENDING',
  'RC_RECEIVED',
  'RC_SHARED_COLLECTED',
  'CASE_CLOSED',
  'REOPENED',
] as const;
export const RC_DOCUMENT_STATUS_CODES = [
  'PENDING_UPLOAD',
  'PENDING_SCAN',
  'VERIFIED',
  'REJECTED',
] as const;
export const RC_DELIVERY_MODES = ['WHATSAPP', 'EMAIL', 'SMS', 'COURIER', 'PICKUP'] as const;
export const VEHICLE_OWNERSHIP_SOURCES = ['DEALERSHIP_SALE', 'EXTERNAL'] as const;

export const registrationStatusSchema = z.enum(REGISTRATION_STATUS_CODES);
export const rcDeliveryModeSchema = z.enum(RC_DELIVERY_MODES);
export const vehicleOwnershipSourceSchema = z.enum(VEHICLE_OWNERSHIP_SOURCES);

export const registrationListQuerySchema = z.object({
  assigned_to_me: queryBoolean.default(false),
  branch_id: id.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  overdue_only: queryBoolean.default(false),
  status: registrationStatusSchema.optional(),
});

export const createRegistrationCaseRequestSchema = z.object({
  assigned_membership_id: id.nullable().default(null),
  booking_id: id,
  expected_completion_at: z.iso.datetime({ offset: true }).nullable().default(null),
});

export const assignRegistrationCaseRequestSchema = z.object({
  assigned_membership_id: id,
  expected_version: z.number().int().min(1),
  reason: text(1000),
});

export const startRegistrationRequestSchema = z.object({
  application_started_at: z.iso.datetime({ offset: true }),
  document_checklist_confirmed: z.literal(true),
  expected_version: z.number().int().min(1),
});

export const submitRtoRequestSchema = z.object({
  application_number: text(100),
  expected_completion_at: z.iso.datetime({ offset: true }),
  expected_version: z.number().int().min(1),
  rto_code: text(32),
  rto_name: text(160),
  submitted_at: z.iso.datetime({ offset: true }),
});

export const allotRegistrationNumberRequestSchema = z
  .object({
    allotted_at: z.iso.datetime({ offset: true }),
    evidence_reference: text(500),
    expected_version: z.number().int().min(1),
    permanent_registration_number: optionalText(32),
    temporary_registration_number: optionalText(32),
  })
  .refine(
    (value) => value.permanent_registration_number || value.temporary_registration_number,
    'A temporary or permanent registration number is required.',
  );

export const markRcPendingRequestSchema = z.object({
  expected_completion_at: z.iso.datetime({ offset: true }),
  expected_version: z.number().int().min(1),
  reason: text(1000),
});

export const initiateRcUploadRequestSchema = z.object({
  checksum_sha256: z.string().regex(/^[A-Za-z0-9+/]{43}=$/u),
  content_length: z
    .number()
    .int()
    .positive()
    .max(20 * 1024 * 1024),
  content_type: z.enum(['image/jpeg', 'image/png', 'application/pdf']),
  file_name: text(240),
});

export const completeRcUploadRequestSchema = z.object({
  checksum_sha256: z.string().regex(/^[A-Za-z0-9+/]{43}=$/u),
  document_id: id,
  expected_version: z.number().int().min(1),
  received_at: z.iso.datetime({ offset: true }),
});

export const reviewRcDocumentRequestSchema = z.object({
  decision: z.enum(['VERIFIED', 'REJECTED']),
  reason: text(1000),
});

export const shareRcRequestSchema = z.object({
  delivery_mode: rcDeliveryModeSchema,
  expected_version: z.number().int().min(1),
  purpose: text(500),
  recipient: text(240),
});

export const closeRegistrationCaseRequestSchema = z.object({
  expected_version: z.number().int().min(1),
});

export const reopenRegistrationCaseRequestSchema = z.object({
  expected_version: z.number().int().min(1),
  next_action: text(1000),
  reason: text(1000),
});

export const correctRegistrationCaseRequestSchema = z.object({
  application_number: optionalText(100).optional(),
  corrected_event_id: id,
  expected_completion_at: z.iso.datetime({ offset: true }).nullable().optional(),
  expected_version: z.number().int().min(1),
  permanent_registration_number: optionalText(32).optional(),
  reason: text(1000),
  rto_code: optionalText(32).optional(),
  rto_name: optionalText(160).optional(),
  temporary_registration_number: optionalText(32).optional(),
});

export const registrationDocumentDownloadQuerySchema = z.object({ purpose: text(500) });

export const updateRegistrationSettingsRequestSchema = z.object({
  expected_version: z.number().int().min(1),
  reason: text(1000),
  sla_hours: z.record(registrationStatusSchema, z.number().int().min(1).max(8760)),
});

export const customerVehicleListQuerySchema = z.object({
  branch_id: id.optional(),
  contact_id: id.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  ownership_source: vehicleOwnershipSourceSchema.optional(),
});

export const createExternalCustomerVehicleRequestSchema = z.object({
  amc_expires_on: z.iso.date().nullable().default(null),
  brand_name: text(120),
  branch_id: id,
  contact_id: id,
  engine_number: optionalText(80),
  insurance_expires_on: z.iso.date().nullable().default(null),
  insurance_policy_number: optionalText(100),
  model_name: text(120),
  purchase_date: z.iso.date().nullable().default(null),
  registration_number: optionalText(32),
  rsa_expires_on: z.iso.date().nullable().default(null),
  variant_name: text(160),
  vin: optionalText(80),
  warranty_expires_on: z.iso.date().nullable().default(null),
});

export const createDealershipCustomerVehicleRequestSchema = z.object({
  booking_id: id,
});

export const updateCustomerVehicleCoverageRequestSchema = z.object({
  amc_expires_on: z.iso.date().nullable(),
  expected_version: z.number().int().min(1),
  insurance_expires_on: z.iso.date().nullable(),
  insurance_policy_number: optionalText(100),
  reason: text(1000),
  rsa_expires_on: z.iso.date().nullable(),
  warranty_expires_on: z.iso.date().nullable(),
});

export type RegistrationStatus = z.infer<typeof registrationStatusSchema>;
export type RegistrationListQuery = z.infer<typeof registrationListQuerySchema>;
export type CreateRegistrationCaseRequest = z.infer<typeof createRegistrationCaseRequestSchema>;
export type AssignRegistrationCaseRequest = z.infer<typeof assignRegistrationCaseRequestSchema>;
export type StartRegistrationRequest = z.infer<typeof startRegistrationRequestSchema>;
export type SubmitRtoRequest = z.infer<typeof submitRtoRequestSchema>;
export type AllotRegistrationNumberRequest = z.infer<typeof allotRegistrationNumberRequestSchema>;
export type MarkRcPendingRequest = z.infer<typeof markRcPendingRequestSchema>;
export type InitiateRcUploadRequest = z.infer<typeof initiateRcUploadRequestSchema>;
export type CompleteRcUploadRequest = z.infer<typeof completeRcUploadRequestSchema>;
export type ReviewRcDocumentRequest = z.infer<typeof reviewRcDocumentRequestSchema>;
export type ShareRcRequest = z.infer<typeof shareRcRequestSchema>;
export type CloseRegistrationCaseRequest = z.infer<typeof closeRegistrationCaseRequestSchema>;
export type ReopenRegistrationCaseRequest = z.infer<typeof reopenRegistrationCaseRequestSchema>;
export type CorrectRegistrationCaseRequest = z.infer<typeof correctRegistrationCaseRequestSchema>;
export type UpdateRegistrationSettingsRequest = z.infer<
  typeof updateRegistrationSettingsRequestSchema
>;
export type CustomerVehicleListQuery = z.infer<typeof customerVehicleListQuerySchema>;
export type CreateExternalCustomerVehicleRequest = z.infer<
  typeof createExternalCustomerVehicleRequestSchema
>;
export type CreateDealershipCustomerVehicleRequest = z.infer<
  typeof createDealershipCustomerVehicleRequestSchema
>;
export type UpdateCustomerVehicleCoverageRequest = z.infer<
  typeof updateCustomerVehicleCoverageRequestSchema
>;
