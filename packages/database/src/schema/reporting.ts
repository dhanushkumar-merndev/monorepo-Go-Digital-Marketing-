import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { memberships } from './authorization.js';
import { clientOrganizations } from './organizations.js';

export const exportFormatEnum = pgEnum('export_format', ['CSV', 'XLSX']);
export const exportKindEnum = pgEnum('export_kind', [
  'AUDIT_EVENTS',
  'LEAD_FUNNEL',
  'BOOKINGS',
  'DELIVERIES',
  'REGISTRATION_AGING',
  'REMINDERS',
]);
export const exportStatusEnum = pgEnum('export_status', [
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'EXPIRED',
]);

export const exportJobs = pgTable(
  'export_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    requestedByMembershipId: uuid('requested_by_membership_id').notNull(),
    kind: exportKindEnum('kind').notNull(),
    format: exportFormatEnum('format').notNull(),
    filters: jsonb('filters').$type<Record<string, unknown>>().notNull(),
    scopeSnapshot: jsonb('scope_snapshot').$type<Record<string, unknown>>().notNull(),
    status: exportStatusEnum('status').default('QUEUED').notNull(),
    objectKey: text('object_key'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    failureCode: varchar('failure_code', { length: 100 }),
    failureMessage: text('failure_message'),
    correlationId: varchar('correlation_id', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
      name: 'export_jobs_client_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.requestedByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'export_jobs_requester_tenant_fk',
    }).onDelete('restrict'),
    check(
      'export_jobs_expiry_check',
      sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.createdAt}`,
    ),
    index('export_jobs_client_created_idx').on(table.clientOrganizationId, table.createdAt),
    index('export_jobs_status_idx').on(table.status, table.createdAt),
  ],
);
