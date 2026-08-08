import { z } from 'zod';

const idSchema = z.uuid();
const nonBlank = (maximum: number) => z.string().trim().min(1).max(maximum);
const normalizedIdentity = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .transform((value) => value.toUpperCase().replaceAll(/\s+/gu, ''));

export const INVENTORY_UNIT_STATUS_CODES = [
  'EXPECTED',
  'AVAILABLE',
  'RESERVED',
  'ALLOCATED',
  'DEMO',
  'IN_TRANSFER',
  'DELIVERED',
  'BLOCKED',
  'CANCELLED',
  'REMOVED',
] as const;

export const inventoryUnitStatusSchema = z.enum(INVENTORY_UNIT_STATUS_CODES);
export const inventoryReservationStatusSchema = z.enum([
  'ACTIVE',
  'RELEASED',
  'EXPIRED',
  'CANCELLED',
  'CONVERTED',
]);
export const inventoryAllocationStatusSchema = z.enum([
  'ACTIVE',
  'RELEASED',
  'REPLACED',
  'DELIVERED',
]);

export const createInventoryCatalogueRequestSchema = z.object({
  brand_code: nonBlank(64),
  brand_name: nonBlank(160),
  colour_code: nonBlank(64),
  colour_name: nonBlank(120),
  fuel_powertrain: nonBlank(80),
  model_code: nonBlank(64),
  model_name: nonBlank(160),
  model_year: z.number().int().min(1900).max(2200),
  variant_code: nonBlank(64),
  variant_name: nonBlank(160),
});

export const inventoryUnitInputSchema = z
  .object({
    acquisition_reference: z.string().trim().max(120).nullable().default(null),
    branch_id: idSchema,
    chassis_number: normalizedIdentity(80).nullable().default(null),
    colour_id: idSchema,
    condition_notes: z.string().trim().max(4000).nullable().default(null),
    current_odometer_km: z.number().int().min(0).max(2_000_000).default(0),
    engine_number: normalizedIdentity(80).nullable().default(null),
    expected_arrival_at: z.iso.datetime({ offset: true }).nullable().default(null),
    ownership_type: nonBlank(64),
    received_at: z.iso.datetime({ offset: true }).nullable().default(null),
    service_due_at: z.iso.datetime({ offset: true }).nullable().default(null),
    status: z.enum(['EXPECTED', 'AVAILABLE', 'DEMO']).default('EXPECTED'),
    unit_reference: nonBlank(100),
    variant_id: idSchema,
    vin: normalizedIdentity(64).nullable().default(null),
  })
  .superRefine((value, context) => {
    if (value.status !== 'EXPECTED' && (!value.vin || !value.chassis_number)) {
      context.addIssue({
        code: 'custom',
        message: 'VIN and chassis number are required for available or demo stock.',
        path: ['vin'],
      });
    }
    if (value.status === 'EXPECTED' && !value.expected_arrival_at) {
      context.addIssue({
        code: 'custom',
        message: 'Expected stock requires an expected arrival timestamp.',
        path: ['expected_arrival_at'],
      });
    }
  });

export const createInventoryUnitRequestSchema = inventoryUnitInputSchema;
export const importInventoryUnitsRequestSchema = z.object({
  rows: z.array(inventoryUnitInputSchema).min(1).max(100),
  source_batch_reference: nonBlank(120),
});

export const inventoryUnitListQuerySchema = z.object({
  branch_id: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  search: z.string().trim().max(100).optional(),
  status: inventoryUnitStatusSchema.optional(),
});

export const transitionInventoryUnitRequestSchema = z.object({
  action: z.enum([
    'RECEIVE',
    'DESIGNATE_DEMO',
    'AUTHORIZE_DEMO_SALE',
    'BLOCK',
    'UNBLOCK',
    'CANCEL',
    'REMOVE',
    'DELIVER',
  ]),
  expected_version: z.number().int().min(1),
  reason: nonBlank(1000),
  chassis_number: normalizedIdentity(80).optional(),
  current_odometer_km: z.number().int().min(0).max(2_000_000).optional(),
  engine_number: normalizedIdentity(80).optional(),
  received_at: z.iso.datetime({ offset: true }).optional(),
  vin: normalizedIdentity(64).optional(),
});

export const createInventoryReservationRequestSchema = z
  .object({
    booking_reference: z.string().trim().min(1).max(120).nullable().default(null),
    expected_version: z.number().int().min(1),
    expires_at: z.iso.datetime({ offset: true }),
    lead_id: idSchema.nullable().default(null),
    reason: nonBlank(1000),
  })
  .refine((value) => value.booking_reference !== null || value.lead_id !== null, {
    message: 'A Lead or booking reference is required.',
    path: ['booking_reference'],
  });

export const releaseInventoryReservationRequestSchema = z.object({
  expected_version: z.number().int().min(1),
  reason: nonBlank(1000),
});

export const extendInventoryReservationRequestSchema = z.object({
  expected_version: z.number().int().min(1),
  expires_at: z.iso.datetime({ offset: true }),
  reason: nonBlank(1000),
});

export const createInventoryAllocationRequestSchema = z.object({
  booking_reference: nonBlank(120),
  expected_version: z.number().int().min(1),
  readiness_asserted: z.literal(true),
  reason: nonBlank(1000),
});

export const reallocateInventoryRequestSchema = z.object({
  customer_communication_decision: nonBlank(1000),
  expected_from_version: z.number().int().min(1),
  expected_to_version: z.number().int().min(1),
  reason: nonBlank(1000),
  to_inventory_unit_id: idSchema,
});

export const releaseInventoryAllocationRequestSchema = z.object({
  expected_version: z.number().int().min(1),
  reason: nonBlank(1000),
});

export const createInventoryTransferRequestSchema = z.object({
  expected_version: z.number().int().min(1),
  reason: nonBlank(1000),
  reference: nonBlank(120),
  to_branch_id: idSchema,
});

export const endInventoryTransferRequestSchema = z.object({
  expected_version: z.number().int().min(1),
  reason: nonBlank(1000),
});

export const inventoryCatalogueSchema = z.object({
  brands: z.array(z.object({ code: z.string(), id: idSchema, name: z.string() })),
  colours: z.array(z.object({ code: z.string(), id: idSchema, name: z.string() })),
  models: z.array(
    z.object({ brand_id: idSchema, code: z.string(), id: idSchema, name: z.string() }),
  ),
  variants: z.array(
    z.object({
      code: z.string(),
      fuel_powertrain: z.string(),
      id: idSchema,
      model_id: idSchema,
      model_year: z.number().int(),
      name: z.string(),
    }),
  ),
});

export const inventoryUnitSummarySchema = z.object({
  age_days: z.number().int().min(0).nullable(),
  branch_id: idSchema,
  branch_name: z.string(),
  chassis_number: z.string().nullable(),
  colour_id: idSchema,
  colour_name: z.string(),
  engine_number: z.string().nullable(),
  expected_arrival_at: z.iso.datetime().nullable(),
  id: idSchema,
  model_name: z.string(),
  received_at: z.iso.datetime().nullable(),
  status: inventoryUnitStatusSchema,
  unit_reference: z.string(),
  variant_id: idSchema,
  variant_name: z.string(),
  version: z.number().int().min(1),
  vin: z.string().nullable(),
});

export const inventoryUnitDetailSchema = z.object({
  active_allocation: z
    .object({
      booking_reference: z.string(),
      id: idSchema,
      status: inventoryAllocationStatusSchema,
    })
    .nullable(),
  active_reservation: z
    .object({
      booking_reference: z.string().nullable(),
      expires_at: z.iso.datetime(),
      id: idSchema,
      lead_id: idSchema.nullable(),
      status: inventoryReservationStatusSchema,
    })
    .nullable(),
  history: z.array(
    z.object({
      actor_name: z.string().nullable(),
      created_at: z.iso.datetime(),
      event_type: z.string(),
      from_status: inventoryUnitStatusSchema.nullable(),
      id: idSchema,
      reason: z.string().nullable(),
      to_status: inventoryUnitStatusSchema,
    }),
  ),
  transfers: z.array(
    z.object({
      created_at: z.iso.datetime(),
      from_branch_id: idSchema,
      id: idSchema,
      latest_event: z.enum(['STARTED', 'COMPLETED', 'CANCELLED']),
      reference: z.string(),
      to_branch_id: idSchema,
    }),
  ),
  unit: inventoryUnitSummarySchema.extend({
    acquisition_reference: z.string().nullable(),
    blocked_reason: z.string().nullable(),
    condition_notes: z.string().nullable(),
    current_odometer_km: z.number().int().min(0),
    ownership_type: z.string(),
    service_due_at: z.iso.datetime().nullable(),
  }),
});

export type CreateInventoryAllocationRequest = z.infer<
  typeof createInventoryAllocationRequestSchema
>;
export type CreateInventoryCatalogueRequest = z.infer<typeof createInventoryCatalogueRequestSchema>;
export type CreateInventoryReservationRequest = z.infer<
  typeof createInventoryReservationRequestSchema
>;
export type CreateInventoryTransferRequest = z.infer<typeof createInventoryTransferRequestSchema>;
export type CreateInventoryUnitRequest = z.infer<typeof createInventoryUnitRequestSchema>;
export type EndInventoryTransferRequest = z.infer<typeof endInventoryTransferRequestSchema>;
export type ExtendInventoryReservationRequest = z.infer<
  typeof extendInventoryReservationRequestSchema
>;
export type ImportInventoryUnitsRequest = z.infer<typeof importInventoryUnitsRequestSchema>;
export type InventoryCatalogue = z.infer<typeof inventoryCatalogueSchema>;
export type InventoryUnitDetail = z.infer<typeof inventoryUnitDetailSchema>;
export type InventoryUnitListQuery = z.infer<typeof inventoryUnitListQuerySchema>;
export type InventoryUnitStatus = z.infer<typeof inventoryUnitStatusSchema>;
export type InventoryUnitSummary = z.infer<typeof inventoryUnitSummarySchema>;
export type ReallocateInventoryRequest = z.infer<typeof reallocateInventoryRequestSchema>;
export type ReleaseInventoryAllocationRequest = z.infer<
  typeof releaseInventoryAllocationRequestSchema
>;
export type ReleaseInventoryReservationRequest = z.infer<
  typeof releaseInventoryReservationRequestSchema
>;
export type TransitionInventoryUnitRequest = z.infer<typeof transitionInventoryUnitRequestSchema>;
