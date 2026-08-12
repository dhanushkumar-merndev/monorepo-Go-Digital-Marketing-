import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { memberships } from './authorization.js';
import { inventoryUnits } from './inventory.js';
import { contacts, leadOpportunities } from './leads.js';
import { branches, clientOrganizations } from './organizations.js';

const money = (name: string) => bigint(name, { mode: 'number' });

export const quotationStatusEnum = pgEnum('quotation_status', [
  'DRAFT',
  'ACTIVE',
  'SUPERSEDED',
  'EXPIRED',
]);
export const commercialApprovalStatusEnum = pgEnum('commercial_approval_status', [
  'NOT_REQUIRED',
  'PENDING',
  'APPROVED',
  'REJECTED',
]);
export const bookingStatusEnum = pgEnum('booking_status', ['DRAFT', 'CONFIRMED', 'CANCELLED']);
export const bookingPaymentTypeEnum = pgEnum('booking_payment_type', [
  'FULL',
  'PARTIAL',
  'FINANCE',
  'INSTALLMENT',
  'MIXED',
]);
export const paymentEntryKindEnum = pgEnum('payment_entry_kind', ['PAYMENT', 'REVERSAL']);
export const paymentEntryStatusEnum = pgEnum('payment_entry_status', [
  'PENDING_VERIFICATION',
  'VERIFIED',
  'REJECTED',
  'REVERSED',
]);
export const financeCaseStatusEnum = pgEnum('finance_case_status', [
  'APPLIED',
  'APPROVED',
  'REJECTED',
  'DISBURSED',
]);
export const insurancePaymentStatusEnum = pgEnum('insurance_payment_status', [
  'PENDING',
  'PAID',
  'NOT_APPLICABLE',
]);
export const exchangeCaseStatusEnum = pgEnum('exchange_case_status', [
  'REQUESTED',
  'ACCEPTED',
  'REJECTED',
]);
export const commercialDocumentStatusEnum = pgEnum('commercial_document_status', [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'SUPERSEDED',
]);
export const commercialDocumentUploadStatusEnum = pgEnum('commercial_document_upload_status', [
  'PENDING_UPLOAD',
  'UPLOADED',
  'FAILED',
]);

export const commercialSettings = pgTable(
  'commercial_settings',
  {
    clientOrganizationId: uuid('client_organization_id').primaryKey(),
    currency: varchar('currency', { length: 3 }).default('INR').notNull(),
    discountApprovalThresholdMinor: money('discount_approval_threshold_minor').notNull(),
    deliveryPaymentGateBasisPoints: integer('delivery_payment_gate_basis_points').notNull(),
    requireFinanceDisbursement: boolean('require_finance_disbursement').default(true).notNull(),
    requireInvoice: boolean('require_invoice').default(true).notNull(),
    requireInsurance: boolean('require_insurance').default(true).notNull(),
    requiredDocumentTypes: jsonb('required_document_types').$type<string[]>().default([]).notNull(),
    version: integer('version').default(1).notNull(),
    effectiveAt: timestamp('effective_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedByMembershipId: uuid('updated_by_membership_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
      name: 'commercial_settings_client_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.updatedByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'commercial_settings_actor_tenant_fk',
    }).onDelete('restrict'),
    check('commercial_settings_discount_check', sql`${table.discountApprovalThresholdMinor} >= 0`),
    check(
      'commercial_settings_payment_gate_check',
      sql`${table.deliveryPaymentGateBasisPoints} between 0 and 10000`,
    ),
    check('commercial_settings_version_check', sql`${table.version} >= 1`),
  ],
);

export const quotations = pgTable(
  'quotations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    leadId: uuid('lead_id').notNull(),
    quotationReference: varchar('quotation_reference', { length: 120 }).notNull(),
    status: quotationStatusEnum('status').default('DRAFT').notNull(),
    approvalStatus: commercialApprovalStatusEnum('approval_status').notNull(),
    currentVersion: integer('current_version').default(1).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    totalMinor: money('total_minor').notNull(),
    discountMinor: money('discount_minor').notNull(),
    payableMinor: money('payable_minor').notNull(),
    vehicleConfiguration: text('vehicle_configuration').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdByUserId: uuid('created_by_user_id').notNull(),
    createdByMembershipId: uuid('created_by_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.branchId],
      foreignColumns: [branches.clientOrganizationId, branches.id],
      name: 'quotations_branch_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.contactId],
      foreignColumns: [contacts.clientOrganizationId, contacts.id],
      name: 'quotations_contact_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.leadId],
      foreignColumns: [leadOpportunities.clientOrganizationId, leadOpportunities.id],
      name: 'quotations_lead_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.createdByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'quotations_creator_membership_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.createdByUserId, table.createdByMembershipId],
      foreignColumns: [memberships.userId, memberships.id],
      name: 'quotations_creator_user_membership_fk',
    }).onDelete('restrict'),
    unique('quotations_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('quotations_client_reference_uidx').on(
      table.clientOrganizationId,
      table.quotationReference,
    ),
    index('quotations_lead_created_idx').on(
      table.clientOrganizationId,
      table.leadId,
      table.createdAt,
    ),
    check(
      'quotations_amounts_check',
      sql`
      ${table.totalMinor} >= 0 and ${table.discountMinor} >= 0 and ${table.payableMinor} >= 0
      and ${table.payableMinor} = ${table.totalMinor} - ${table.discountMinor}
    `,
    ),
    check('quotations_version_check', sql`${table.currentVersion} >= 1`),
  ],
);

export const quotationVersions = pgTable(
  'quotation_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    quotationId: uuid('quotation_id').notNull(),
    version: integer('version').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    totalMinor: money('total_minor').notNull(),
    discountMinor: money('discount_minor').notNull(),
    payableMinor: money('payable_minor').notNull(),
    vehicleConfiguration: text('vehicle_configuration').notNull(),
    notes: text('notes'),
    reason: text('reason'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdByUserId: uuid('created_by_user_id').notNull(),
    createdByMembershipId: uuid('created_by_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.quotationId],
      foreignColumns: [quotations.clientOrganizationId, quotations.id],
      name: 'quotation_versions_quotation_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.createdByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'quotation_versions_actor_tenant_fk',
    }).onDelete('restrict'),
    unique('quotation_versions_client_id_unique').on(table.clientOrganizationId, table.id),
    unique('quotation_versions_number_unique').on(
      table.clientOrganizationId,
      table.quotationId,
      table.version,
    ),
    check(
      'quotation_versions_amounts_check',
      sql`
      ${table.totalMinor} >= 0 and ${table.discountMinor} >= 0 and ${table.payableMinor} >= 0
      and ${table.payableMinor} = ${table.totalMinor} - ${table.discountMinor}
    `,
    ),
  ],
);

export const quotationPriceComponents = pgTable(
  'quotation_price_components',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    quotationVersionId: uuid('quotation_version_id').notNull(),
    code: varchar('code', { length: 64 }).notNull(),
    label: varchar('label', { length: 160 }).notNull(),
    category: varchar('category', { length: 32 }).notNull(),
    amountMinor: money('amount_minor').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.quotationVersionId],
      foreignColumns: [quotationVersions.clientOrganizationId, quotationVersions.id],
      name: 'quotation_components_version_tenant_fk',
    }).onDelete('restrict'),
    uniqueIndex('quotation_components_version_code_uidx').on(
      table.clientOrganizationId,
      table.quotationVersionId,
      table.code,
    ),
    check('quotation_components_amount_check', sql`${table.amountMinor} >= 0`),
  ],
);

export const discountApprovals = pgTable(
  'discount_approvals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    quotationId: uuid('quotation_id').notNull(),
    quotationVersion: integer('quotation_version').notNull(),
    discountMinor: money('discount_minor').notNull(),
    thresholdMinor: money('threshold_minor').notNull(),
    status: commercialApprovalStatusEnum('status').default('PENDING').notNull(),
    requestedByMembershipId: uuid('requested_by_membership_id').notNull(),
    decidedByMembershipId: uuid('decided_by_membership_id'),
    reason: text('reason'),
    requestedAt: timestamp('requested_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.quotationId],
      foreignColumns: [quotations.clientOrganizationId, quotations.id],
      name: 'discount_approvals_quotation_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.requestedByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'discount_approvals_requester_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.decidedByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'discount_approvals_decider_tenant_fk',
    }).onDelete('restrict'),
    unique('discount_approvals_version_unique').on(
      table.clientOrganizationId,
      table.quotationId,
      table.quotationVersion,
    ),
    index('discount_approvals_queue_idx').on(
      table.clientOrganizationId,
      table.status,
      table.requestedAt,
    ),
  ],
);

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    leadId: uuid('lead_id').notNull(),
    quotationId: uuid('quotation_id').notNull(),
    quotationVersion: integer('quotation_version').notNull(),
    bookingReference: varchar('booking_reference', { length: 120 }).notNull(),
    status: bookingStatusEnum('status').default('CONFIRMED').notNull(),
    paymentType: bookingPaymentTypeEnum('payment_type').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    payableMinor: money('payable_minor').notNull(),
    selectedInventoryUnitId: uuid('selected_inventory_unit_id'),
    expectedDeliveryAt: timestamp('expected_delivery_at', { withTimezone: true, mode: 'date' }),
    customerConfirmedAt: timestamp('customer_confirmed_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    cancellationReason: text('cancellation_reason'),
    refundSettlementNote: text('refund_settlement_note'),
    cancellationNotificationDecision: text('cancellation_notification_decision'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
    version: integer('version').default(1).notNull(),
    createdByUserId: uuid('created_by_user_id').notNull(),
    createdByMembershipId: uuid('created_by_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.branchId],
      foreignColumns: [branches.clientOrganizationId, branches.id],
      name: 'bookings_branch_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.contactId],
      foreignColumns: [contacts.clientOrganizationId, contacts.id],
      name: 'bookings_contact_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.leadId],
      foreignColumns: [leadOpportunities.clientOrganizationId, leadOpportunities.id],
      name: 'bookings_lead_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.quotationId],
      foreignColumns: [quotations.clientOrganizationId, quotations.id],
      name: 'bookings_quotation_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.selectedInventoryUnitId],
      foreignColumns: [inventoryUnits.clientOrganizationId, inventoryUnits.id],
      name: 'bookings_inventory_unit_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.createdByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'bookings_creator_membership_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.createdByUserId, table.createdByMembershipId],
      foreignColumns: [memberships.userId, memberships.id],
      name: 'bookings_creator_user_membership_fk',
    }).onDelete('restrict'),
    unique('bookings_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('bookings_client_reference_uidx').on(
      table.clientOrganizationId,
      table.bookingReference,
    ),
    uniqueIndex('bookings_quotation_version_uidx').on(
      table.clientOrganizationId,
      table.quotationId,
      table.quotationVersion,
    ),
    index('bookings_client_branch_status_idx').on(
      table.clientOrganizationId,
      table.branchId,
      table.status,
      table.createdAt,
    ),
    index('bookings_lead_created_idx').on(
      table.clientOrganizationId,
      table.leadId,
      table.createdAt,
    ),
    index('bookings_client_created_idx').on(table.clientOrganizationId, table.createdAt, table.id),
    check('bookings_payable_check', sql`${table.payableMinor} >= 0`),
    check('bookings_version_check', sql`${table.version} >= 1`),
  ],
);

export const bookingItems = pgTable(
  'booking_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    bookingId: uuid('booking_id').notNull(),
    code: varchar('code', { length: 64 }).notNull(),
    description: varchar('description', { length: 240 }).notNull(),
    quantity: integer('quantity').default(1).notNull(),
    amountMinor: money('amount_minor').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.bookingId],
      foreignColumns: [bookings.clientOrganizationId, bookings.id],
      name: 'booking_items_booking_tenant_fk',
    }).onDelete('restrict'),
    uniqueIndex('booking_items_booking_code_uidx').on(
      table.clientOrganizationId,
      table.bookingId,
      table.code,
    ),
    check('booking_items_quantity_check', sql`${table.quantity} >= 1`),
    check('booking_items_amount_check', sql`${table.amountMinor} >= 0`),
  ],
);

export const paymentEntries = pgTable(
  'payment_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    bookingId: uuid('booking_id').notNull(),
    kind: paymentEntryKindEnum('kind').default('PAYMENT').notNull(),
    originalEntryId: uuid('original_entry_id'),
    amountMinor: money('amount_minor').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    method: varchar('method', { length: 32 }).notNull(),
    paymentReference: varchar('payment_reference', { length: 160 }).notNull(),
    proofDocumentVersionId: uuid('proof_document_version_id'),
    receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdByUserId: uuid('created_by_user_id').notNull(),
    createdByMembershipId: uuid('created_by_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.bookingId],
      foreignColumns: [bookings.clientOrganizationId, bookings.id],
      name: 'payment_entries_booking_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.originalEntryId],
      foreignColumns: [table.clientOrganizationId, table.id],
      name: 'payment_entries_original_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.createdByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'payment_entries_creator_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.createdByUserId, table.createdByMembershipId],
      foreignColumns: [memberships.userId, memberships.id],
      name: 'payment_entries_creator_user_membership_fk',
    }).onDelete('restrict'),
    unique('payment_entries_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('payment_entries_reference_uidx').on(
      table.clientOrganizationId,
      table.paymentReference,
    ),
    uniqueIndex('payment_entries_one_reversal_uidx')
      .on(table.clientOrganizationId, table.originalEntryId)
      .where(sql`${table.kind} = 'REVERSAL'`),
    index('payment_entries_booking_created_idx').on(
      table.clientOrganizationId,
      table.bookingId,
      table.createdAt,
    ),
    check('payment_entries_amount_check', sql`${table.amountMinor} > 0`),
    check(
      'payment_entries_original_check',
      sql`(${table.kind} = 'PAYMENT' and ${table.originalEntryId} is null) or (${table.kind} = 'REVERSAL' and ${table.originalEntryId} is not null)`,
    ),
  ],
);

export const paymentVerificationEvents = pgTable(
  'payment_verification_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    paymentEntryId: uuid('payment_entry_id').notNull(),
    fromStatus: paymentEntryStatusEnum('from_status'),
    toStatus: paymentEntryStatusEnum('to_status').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.paymentEntryId],
      foreignColumns: [paymentEntries.clientOrganizationId, paymentEntries.id],
      name: 'payment_verification_events_entry_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.actorMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'payment_verification_events_actor_tenant_fk',
    }).onDelete('restrict'),
    index('payment_verification_events_timeline_idx').on(
      table.clientOrganizationId,
      table.paymentEntryId,
      table.createdAt,
    ),
  ],
);

export const financeCases = pgTable(
  'finance_cases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    bookingId: uuid('booking_id').notNull(),
    partnerName: varchar('partner_name', { length: 200 }).notNull(),
    providerReference: varchar('provider_reference', { length: 160 }),
    currency: varchar('currency', { length: 3 }).notNull(),
    appliedAmountMinor: money('applied_amount_minor').notNull(),
    downPaymentMinor: money('down_payment_minor').notNull(),
    sanctionedAmountMinor: money('sanctioned_amount_minor'),
    disbursedAmountMinor: money('disbursed_amount_minor'),
    disbursedAt: timestamp('disbursed_at', { withTimezone: true, mode: 'date' }),
    status: financeCaseStatusEnum('status').default('APPLIED').notNull(),
    version: integer('version').default(1).notNull(),
    createdByMembershipId: uuid('created_by_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.bookingId],
      foreignColumns: [bookings.clientOrganizationId, bookings.id],
      name: 'finance_cases_booking_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.createdByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'finance_cases_creator_tenant_fk',
    }).onDelete('restrict'),
    uniqueIndex('finance_cases_active_booking_uidx')
      .on(table.clientOrganizationId, table.bookingId)
      .where(sql`${table.status} in ('APPLIED', 'APPROVED')`),
    unique('finance_cases_client_id_unique').on(table.clientOrganizationId, table.id),
    index('finance_cases_client_created_idx').on(
      table.clientOrganizationId,
      table.createdAt,
      table.id,
    ),
    check(
      'finance_cases_amounts_check',
      sql`${table.appliedAmountMinor} > 0 and ${table.downPaymentMinor} >= 0 and coalesce(${table.sanctionedAmountMinor}, 0) >= 0 and coalesce(${table.disbursedAmountMinor}, 0) >= 0`,
    ),
    check('finance_cases_version_check', sql`${table.version} >= 1`),
  ],
);

export const financeCaseEvents = pgTable(
  'finance_case_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    financeCaseId: uuid('finance_case_id').notNull(),
    fromStatus: financeCaseStatusEnum('from_status'),
    toStatus: financeCaseStatusEnum('to_status').notNull(),
    providerReference: varchar('provider_reference', { length: 160 }),
    amountMinor: money('amount_minor'),
    reason: text('reason'),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.financeCaseId],
      foreignColumns: [financeCases.clientOrganizationId, financeCases.id],
      name: 'finance_case_events_case_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.actorMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'finance_case_events_actor_tenant_fk',
    }).onDelete('restrict'),
    index('finance_case_events_timeline_idx').on(
      table.clientOrganizationId,
      table.financeCaseId,
      table.occurredAt,
    ),
  ],
);

export const insuranceCases = pgTable(
  'insurance_cases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    bookingId: uuid('booking_id').notNull(),
    insurerName: varchar('insurer_name', { length: 200 }).notNull(),
    quoteReference: varchar('quote_reference', { length: 160 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    premiumMinor: money('premium_minor').notNull(),
    paymentStatus: insurancePaymentStatusEnum('payment_status').notNull(),
    policyGenerated: boolean('policy_generated').default(false).notNull(),
    policyNumber: varchar('policy_number', { length: 160 }),
    createdByMembershipId: uuid('created_by_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.bookingId],
      foreignColumns: [bookings.clientOrganizationId, bookings.id],
      name: 'insurance_cases_booking_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.createdByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'insurance_cases_creator_tenant_fk',
    }).onDelete('restrict'),
    uniqueIndex('insurance_cases_booking_uidx').on(table.clientOrganizationId, table.bookingId),
    unique('insurance_cases_client_id_unique').on(table.clientOrganizationId, table.id),
    index('insurance_cases_client_created_idx').on(
      table.clientOrganizationId,
      table.createdAt,
      table.id,
    ),
    check('insurance_cases_premium_check', sql`${table.premiumMinor} >= 0`),
  ],
);

export const commercialInvoices = pgTable(
  'commercial_invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    bookingId: uuid('booking_id').notNull(),
    invoiceNumber: varchar('invoice_number', { length: 160 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    amountMinor: money('amount_minor').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdByMembershipId: uuid('created_by_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.bookingId],
      foreignColumns: [bookings.clientOrganizationId, bookings.id],
      name: 'commercial_invoices_booking_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.createdByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'commercial_invoices_creator_tenant_fk',
    }).onDelete('restrict'),
    uniqueIndex('commercial_invoices_number_uidx').on(
      table.clientOrganizationId,
      table.invoiceNumber,
    ),
    unique('commercial_invoices_client_id_unique').on(table.clientOrganizationId, table.id),
    check('commercial_invoices_amount_check', sql`${table.amountMinor} > 0`),
  ],
);

export const exchangeCases = pgTable(
  'exchange_cases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    bookingId: uuid('booking_id').notNull(),
    makeModel: varchar('make_model', { length: 240 }).notNull(),
    registrationNumber: varchar('registration_number', { length: 64 }).notNull(),
    year: integer('year').notNull(),
    odometerKm: integer('odometer_km').notNull(),
    ownershipName: varchar('ownership_name', { length: 200 }).notNull(),
    expectedPriceMinor: money('expected_price_minor').notNull(),
    evaluatedPriceMinor: money('evaluated_price_minor'),
    status: exchangeCaseStatusEnum('status').default('REQUESTED').notNull(),
    decisionReason: text('decision_reason'),
    version: integer('version').default(1).notNull(),
    createdByMembershipId: uuid('created_by_membership_id').notNull(),
    decidedByMembershipId: uuid('decided_by_membership_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.bookingId],
      foreignColumns: [bookings.clientOrganizationId, bookings.id],
      name: 'exchange_cases_booking_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.createdByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'exchange_cases_creator_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.decidedByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'exchange_cases_decider_tenant_fk',
    }).onDelete('restrict'),
    unique('exchange_cases_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('exchange_cases_active_booking_uidx')
      .on(table.clientOrganizationId, table.bookingId)
      .where(sql`${table.status} = 'REQUESTED'`),
    check(
      'exchange_cases_values_check',
      sql`${table.year} between 1900 and 2200 and ${table.odometerKm} >= 0 and ${table.expectedPriceMinor} >= 0 and coalesce(${table.evaluatedPriceMinor}, 0) >= 0 and ${table.version} >= 1`,
    ),
  ],
);

export const exchangeCaseEvents = pgTable(
  'exchange_case_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    exchangeCaseId: uuid('exchange_case_id').notNull(),
    fromStatus: exchangeCaseStatusEnum('from_status'),
    toStatus: exchangeCaseStatusEnum('to_status').notNull(),
    amountMinor: money('amount_minor'),
    reason: text('reason'),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.exchangeCaseId],
      foreignColumns: [exchangeCases.clientOrganizationId, exchangeCases.id],
      name: 'exchange_case_events_case_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.actorMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'exchange_case_events_actor_tenant_fk',
    }).onDelete('restrict'),
  ],
);

export const commercialDocuments = pgTable(
  'commercial_documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    bookingId: uuid('booking_id').notNull(),
    documentType: varchar('document_type', { length: 64 }).notNull(),
    status: commercialDocumentStatusEnum('status').default('PENDING').notNull(),
    currentVersion: integer('current_version').default(1).notNull(),
    preferredDeliveryChannel: varchar('preferred_delivery_channel', { length: 32 }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    createdByMembershipId: uuid('created_by_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.bookingId],
      foreignColumns: [bookings.clientOrganizationId, bookings.id],
      name: 'commercial_documents_booking_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.createdByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'commercial_documents_creator_tenant_fk',
    }).onDelete('restrict'),
    unique('commercial_documents_client_id_unique').on(table.clientOrganizationId, table.id),
    index('commercial_documents_booking_type_idx').on(
      table.clientOrganizationId,
      table.bookingId,
      table.documentType,
      table.status,
    ),
    check('commercial_documents_version_check', sql`${table.currentVersion} >= 1`),
  ],
);

export const commercialDocumentVersions = pgTable(
  'commercial_document_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    documentId: uuid('document_id').notNull(),
    version: integer('version').notNull(),
    objectKey: text('object_key').notNull(),
    fileName: varchar('file_name', { length: 240 }).notNull(),
    contentType: varchar('content_type', { length: 120 }).notNull(),
    contentLength: bigint('content_length', { mode: 'number' }).notNull(),
    checksumSha256: varchar('checksum_sha256', { length: 64 }),
    uploadStatus: commercialDocumentUploadStatusEnum('upload_status')
      .default('PENDING_UPLOAD')
      .notNull(),
    scanStatus: varchar('scan_status', { length: 32 }).default('PENDING').notNull(),
    uploaderMembershipId: uuid('uploader_membership_id').notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.documentId],
      foreignColumns: [commercialDocuments.clientOrganizationId, commercialDocuments.id],
      name: 'commercial_document_versions_document_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.uploaderMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'commercial_document_versions_uploader_tenant_fk',
    }).onDelete('restrict'),
    unique('commercial_document_versions_client_id_unique').on(
      table.clientOrganizationId,
      table.id,
    ),
    unique('commercial_document_versions_number_unique').on(
      table.clientOrganizationId,
      table.documentId,
      table.version,
    ),
    check(
      'commercial_document_versions_length_check',
      sql`${table.contentLength} > 0 and ${table.contentLength} <= 20971520`,
    ),
  ],
);

export const commercialDocumentVerificationEvents = pgTable(
  'commercial_document_verification_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    documentId: uuid('document_id').notNull(),
    documentVersionId: uuid('document_version_id').notNull(),
    fromStatus: commercialDocumentStatusEnum('from_status'),
    toStatus: commercialDocumentStatusEnum('to_status').notNull(),
    reason: text('reason').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.documentId],
      foreignColumns: [commercialDocuments.clientOrganizationId, commercialDocuments.id],
      name: 'commercial_document_verifications_document_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.documentVersionId],
      foreignColumns: [
        commercialDocumentVersions.clientOrganizationId,
        commercialDocumentVersions.id,
      ],
      name: 'commercial_document_verifications_version_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.actorMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'commercial_document_verifications_actor_tenant_fk',
    }).onDelete('restrict'),
    index('commercial_document_verifications_timeline_idx').on(
      table.clientOrganizationId,
      table.documentId,
      table.createdAt,
    ),
  ],
);

export const commercialDocumentDownloadEvents = pgTable(
  'commercial_document_download_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    documentId: uuid('document_id').notNull(),
    documentVersionId: uuid('document_version_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    purpose: text('purpose').notNull(),
    correlationId: varchar('correlation_id', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.documentId],
      foreignColumns: [commercialDocuments.clientOrganizationId, commercialDocuments.id],
      name: 'commercial_document_downloads_document_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.documentVersionId],
      foreignColumns: [
        commercialDocumentVersions.clientOrganizationId,
        commercialDocumentVersions.id,
      ],
      name: 'commercial_document_downloads_version_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.actorMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'commercial_document_downloads_actor_tenant_fk',
    }).onDelete('restrict'),
    index('commercial_document_downloads_timeline_idx').on(
      table.clientOrganizationId,
      table.documentId,
      table.createdAt,
    ),
  ],
);

export const deliveryReadinessEvaluations = pgTable(
  'delivery_readiness_evaluations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    bookingId: uuid('booking_id').notNull(),
    ready: boolean('ready').notNull(),
    items: jsonb('items').$type<Record<string, unknown>[]>().notNull(),
    evaluatedByMembershipId: uuid('evaluated_by_membership_id'),
    correlationId: varchar('correlation_id', { length: 128 }).notNull(),
    evaluatedAt: timestamp('evaluated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.bookingId],
      foreignColumns: [bookings.clientOrganizationId, bookings.id],
      name: 'delivery_readiness_booking_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.evaluatedByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'delivery_readiness_actor_tenant_fk',
    }).onDelete('restrict'),
    index('delivery_readiness_timeline_idx').on(
      table.clientOrganizationId,
      table.bookingId,
      table.evaluatedAt,
    ),
  ],
);

export const commercialCommandReceipts = pgTable(
  'commercial_command_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    commandType: varchar('command_type', { length: 100 }).notNull(),
    requestFingerprint: varchar('request_fingerprint', { length: 64 }).notNull(),
    responseSnapshot: jsonb('response_snapshot').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
      name: 'commercial_command_receipts_client_fk',
    }).onDelete('restrict'),
    uniqueIndex('commercial_command_receipts_key_uidx').on(
      table.clientOrganizationId,
      table.idempotencyKey,
    ),
  ],
);
