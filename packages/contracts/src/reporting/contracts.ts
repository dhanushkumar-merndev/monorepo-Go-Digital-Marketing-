import { z } from 'zod';

export const reportRangeSchema = z.object({
  branch_id: z.string().uuid().optional(),
  from: z.string().date(),
  team_id: z.string().uuid().optional(),
  to: z.string().date(),
  timezone: z.string().trim().min(1).max(64).default('Asia/Kolkata'),
});

export const auditEventQuerySchema = reportRangeSchema.extend({
  action: z.string().trim().min(1).max(160).optional(),
  actor_id: z.string().uuid().optional(),
  correlation_id: z.string().trim().min(1).max(128).optional(),
  entity_id: z.string().trim().min(1).max(128).optional(),
  entity_type: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  page: z.coerce.number().int().min(1).default(1),
});

export const exportFormatSchema = z.enum(['CSV', 'XLSX']);
export const exportKindSchema = z.enum([
  'AUDIT_EVENTS',
  'LEAD_FUNNEL',
  'BOOKINGS',
  'DELIVERIES',
  'REGISTRATION_AGING',
  'REMINDERS',
]);
export const createExportRequestSchema = z.object({
  filters: reportRangeSchema,
  format: exportFormatSchema,
  kind: exportKindSchema,
});

export const exportListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  page: z.coerce.number().int().min(1).default(1),
});

export type AuditEventQuery = z.infer<typeof auditEventQuerySchema>;
export type CreateExportRequest = z.infer<typeof createExportRequestSchema>;
export type ExportListQuery = z.infer<typeof exportListQuerySchema>;
export type ReportRange = z.infer<typeof reportRangeSchema>;
