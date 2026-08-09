/* Commercial authority, immutable financial evidence and readiness rules live here. */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CancelBookingRequest,
  CommercialBookingListQuery,
  CompleteCommercialDocumentUploadRequest,
  CreateBookingRequest,
  CreateExchangeCaseRequest,
  CreateFinanceCaseRequest,
  CreateInsuranceCaseRequest,
  CreateInvoiceRequest,
  CreatePaymentEntryRequest,
  CreateQuotationRequest,
  DecideDiscountApprovalRequest,
  DecideExchangeCaseRequest,
  DecideFinanceCaseRequest,
  DisburseFinanceCaseRequest,
  InitiateCommercialDocumentUploadRequest,
  ReversePaymentEntryRequest,
  ReviseQuotationRequest,
  VerifyCommercialDocumentRequest,
  VerifyPaymentEntryRequest,
} from '@gdm/contracts';
import { schema, type DatabaseConnection } from '@gdm/database';
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { AuthorizationPolicy } from '../authorization/authorization-policy.js';
import type { AuthorizationContext } from '../authorization/authorization.types.js';
import { DATABASE_CONNECTION } from '../infrastructure/database/database.tokens.js';
import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from '../infrastructure/storage/object-storage.port.js';
import {
  DOCUMENT_SECURITY_SCANNER,
  type DocumentSecurityScanner,
} from './document-security-scanner.port.js';

type Tx = Parameters<Parameters<DatabaseConnection['db']['transaction']>[0]>[0];
type Booking = typeof schema.bookings.$inferSelect;
type Quotation = typeof schema.quotations.$inferSelect;

const REDUCTION_CATEGORIES = new Set(['DISCOUNT', 'EXCHANGE']);

function clientId(context: AuthorizationContext): string {
  if (!context.clientOrganizationId)
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      details: [],
      message: 'An active client context is required.',
      retryable: false,
    });
  return context.clientOrganizationId;
}

function badRequest(code: string, message: string): BadRequestException {
  return new BadRequestException({ code, details: [], message, retryable: false });
}

function conflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, details: [], message, retryable: false });
}

function notFound(message: string): NotFoundException {
  return new NotFoundException({ code: 'NOT_FOUND', details: [], message, retryable: false });
}

function requiredKey(key: string | undefined): string {
  const normalized = key?.trim();
  if (!normalized || normalized.length > 128)
    throw badRequest('VALIDATION_ERROR', 'A valid Idempotency-Key header is required.');
  return normalized;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}

function fingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)), 'utf8')
    .digest('hex');
}

function databaseCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const direct = (error as { code?: unknown }).code;
  if (typeof direct === 'string') return direct;
  const cause = (error as { cause?: unknown }).cause;
  return cause &&
    typeof cause === 'object' &&
    typeof (cause as { code?: unknown }).code === 'string'
    ? (cause as { code: string }).code
    : undefined;
}

function totals(components: { amount_minor: number; category: string }[]) {
  const totalMinor = components
    .filter((entry) => !REDUCTION_CATEGORIES.has(entry.category))
    .reduce((sum, entry) => sum + entry.amount_minor, 0);
  const discountMinor = components
    .filter((entry) => REDUCTION_CATEGORIES.has(entry.category))
    .reduce((sum, entry) => sum + entry.amount_minor, 0);
  if (!Number.isSafeInteger(totalMinor) || !Number.isSafeInteger(discountMinor))
    throw badRequest('AMOUNT_OUT_OF_RANGE', 'Quotation totals exceed the supported integer range.');
  if (discountMinor > totalMinor)
    throw badRequest(
      'INVALID_QUOTATION_TOTAL',
      'Discount and exchange reductions exceed the total.',
    );
  return { discountMinor, payableMinor: totalMinor - discountMinor, totalMinor };
}

function paymentStatus(payable: number, verified: number): 'PENDING' | 'PARTIAL' | 'COMPLETED' {
  if (verified <= 0) return 'PENDING';
  return verified >= payable ? 'COMPLETED' : 'PARTIAL';
}

@Injectable()
export class CommercialService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly connection: DatabaseConnection,
    @Inject(AuthorizationPolicy) private readonly policy: AuthorizationPolicy,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(DOCUMENT_SECURITY_SCANNER) private readonly scanner: DocumentSecurityScanner,
  ) {}

  async listBookings(context: AuthorizationContext, query: CommercialBookingListQuery) {
    const cid = clientId(context);
    if (query.branch_id && !this.policy.canAccessBranch(context, query.branch_id))
      return { items: [] };
    const filters = [eq(schema.bookings.clientOrganizationId, cid)];
    if (query.branch_id) filters.push(eq(schema.bookings.branchId, query.branch_id));
    if (query.status) filters.push(eq(schema.bookings.status, query.status));
    if (query.search) {
      const searchFilter = or(
        ilike(schema.bookings.bookingReference, `%${query.search}%`),
        ilike(schema.contacts.displayName, `%${query.search}%`),
      );
      if (searchFilter) filters.push(searchFilter);
    }
    const rows = await this.connection.db
      .select({ booking: schema.bookings, customerName: schema.contacts.displayName })
      .from(schema.bookings)
      .innerJoin(
        schema.contacts,
        and(
          eq(schema.contacts.clientOrganizationId, schema.bookings.clientOrganizationId),
          eq(schema.contacts.id, schema.bookings.contactId),
        ),
      )
      .where(and(...filters))
      .orderBy(desc(schema.bookings.createdAt), desc(schema.bookings.id))
      .limit(query.limit);
    const accessible = rows.filter((row) =>
      this.policy.canAccessBranch(context, row.booking.branchId),
    );
    const balances = await this.paymentBalances(
      cid,
      accessible.map((row) => row.booking.id),
    );
    return {
      items: accessible.map(({ booking, customerName }) =>
        this.bookingSummary(booking, customerName, balances.get(booking.id) ?? 0),
      ),
    };
  }

  async bookingDetail(context: AuthorizationContext, bookingId: string) {
    const cid = clientId(context);
    const booking = await this.getBooking(this.connection.db, context, cid, bookingId);
    const [
      customer,
      items,
      payments,
      finance,
      insurance,
      invoices,
      exchange,
      documents,
      allocation,
    ] = await Promise.all([
      this.connection.db
        .select()
        .from(schema.contacts)
        .where(
          and(
            eq(schema.contacts.clientOrganizationId, cid),
            eq(schema.contacts.id, booking.contactId),
          ),
        )
        .limit(1),
      this.connection.db
        .select()
        .from(schema.bookingItems)
        .where(
          and(
            eq(schema.bookingItems.clientOrganizationId, cid),
            eq(schema.bookingItems.bookingId, booking.id),
          ),
        )
        .orderBy(asc(schema.bookingItems.code)),
      this.connection.db
        .select()
        .from(schema.paymentEntries)
        .where(
          and(
            eq(schema.paymentEntries.clientOrganizationId, cid),
            eq(schema.paymentEntries.bookingId, booking.id),
          ),
        )
        .orderBy(asc(schema.paymentEntries.createdAt)),
      this.connection.db
        .select()
        .from(schema.financeCases)
        .where(
          and(
            eq(schema.financeCases.clientOrganizationId, cid),
            eq(schema.financeCases.bookingId, booking.id),
          ),
        )
        .orderBy(desc(schema.financeCases.createdAt)),
      this.connection.db
        .select()
        .from(schema.insuranceCases)
        .where(
          and(
            eq(schema.insuranceCases.clientOrganizationId, cid),
            eq(schema.insuranceCases.bookingId, booking.id),
          ),
        )
        .limit(1),
      this.connection.db
        .select()
        .from(schema.commercialInvoices)
        .where(
          and(
            eq(schema.commercialInvoices.clientOrganizationId, cid),
            eq(schema.commercialInvoices.bookingId, booking.id),
          ),
        )
        .orderBy(desc(schema.commercialInvoices.issuedAt)),
      this.connection.db
        .select()
        .from(schema.exchangeCases)
        .where(
          and(
            eq(schema.exchangeCases.clientOrganizationId, cid),
            eq(schema.exchangeCases.bookingId, booking.id),
          ),
        )
        .orderBy(desc(schema.exchangeCases.createdAt)),
      this.connection.db
        .select({
          currentVersion: schema.commercialDocuments.currentVersion,
          documentType: schema.commercialDocuments.documentType,
          expiresAt: schema.commercialDocuments.expiresAt,
          id: schema.commercialDocuments.id,
          scanStatus: schema.commercialDocumentVersions.scanStatus,
          status: schema.commercialDocuments.status,
          uploadStatus: schema.commercialDocumentVersions.uploadStatus,
          versionId: schema.commercialDocumentVersions.id,
        })
        .from(schema.commercialDocuments)
        .innerJoin(
          schema.commercialDocumentVersions,
          and(
            eq(
              schema.commercialDocumentVersions.clientOrganizationId,
              schema.commercialDocuments.clientOrganizationId,
            ),
            eq(schema.commercialDocumentVersions.documentId, schema.commercialDocuments.id),
            eq(
              schema.commercialDocumentVersions.version,
              schema.commercialDocuments.currentVersion,
            ),
          ),
        )
        .where(
          and(
            eq(schema.commercialDocuments.clientOrganizationId, cid),
            eq(schema.commercialDocuments.bookingId, booking.id),
          ),
        )
        .orderBy(desc(schema.commercialDocuments.createdAt)),
      this.connection.db
        .select({
          id: schema.inventoryAllocations.id,
          inventoryUnitId: schema.inventoryAllocations.inventoryUnitId,
          status: schema.inventoryAllocations.status,
        })
        .from(schema.inventoryAllocations)
        .where(
          and(
            eq(schema.inventoryAllocations.clientOrganizationId, cid),
            or(
              eq(schema.inventoryAllocations.bookingId, booking.id),
              eq(schema.inventoryAllocations.bookingReference, booking.bookingReference),
            ),
            eq(schema.inventoryAllocations.status, 'ACTIVE'),
          ),
        )
        .limit(1),
    ]);
    const paymentEvents =
      payments.length === 0
        ? []
        : await this.connection.db
            .select()
            .from(schema.paymentVerificationEvents)
            .where(
              and(
                eq(schema.paymentVerificationEvents.clientOrganizationId, cid),
                inArray(
                  schema.paymentVerificationEvents.paymentEntryId,
                  payments.map((entry) => entry.id),
                ),
              ),
            )
            .orderBy(asc(schema.paymentVerificationEvents.createdAt));
    const eventMap = new Map<string, (typeof paymentEvents)[number]>();
    for (const event of paymentEvents)
      if (payments.some((entry) => entry.id === event.paymentEntryId))
        eventMap.set(event.paymentEntryId, event);
    const verifiedPaid = payments.reduce((sum, entry) => {
      if (eventMap.get(entry.id)?.toStatus !== 'VERIFIED') return sum;
      return sum + (entry.kind === 'REVERSAL' ? -entry.amountMinor : entry.amountMinor);
    }, 0);
    return {
      ...this.bookingSummary(booking, customer[0]?.displayName ?? 'Unknown customer', verifiedPaid),
      allocation: allocation[0] ?? null,
      documents,
      exchange_cases: exchange,
      finance_cases: finance,
      insurance: insurance[0] ?? null,
      invoices,
      items,
      payments: payments.map((entry) => ({
        ...entry,
        status: eventMap.get(entry.id)?.toStatus ?? 'PENDING_VERIFICATION',
      })),
    };
  }

  createQuotation(
    context: AuthorizationContext,
    input: CreateQuotationRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(context, 'QUOTATION_CREATE', input, key, async (tx, cid) => {
      if (!this.policy.canAccessBranch(context, input.branch_id)) throw notFound('Lead not found.');
      if (new Date(input.expires_at) <= new Date())
        throw badRequest('INVALID_EXPIRY', 'Quotation expiry must be in the future.');
      await this.assertLeadRelationship(tx, cid, input.lead_id, input.contact_id, input.branch_id);
      const settings = await this.settings(tx, cid);
      if (settings.currency !== input.currency)
        throw badRequest(
          'CURRENCY_MISMATCH',
          'Quotation currency does not match tenant commercial settings.',
        );
      const amounts = totals(input.price_components);
      const approvalStatus =
        amounts.discountMinor > settings.discountApprovalThresholdMinor
          ? 'PENDING'
          : 'NOT_REQUIRED';
      const [quotation] = await tx
        .insert(schema.quotations)
        .values({
          approvalStatus,
          branchId: input.branch_id,
          clientOrganizationId: cid,
          contactId: input.contact_id,
          createdByMembershipId: context.membershipId,
          createdByUserId: context.userId,
          currency: input.currency,
          currentVersion: 1,
          discountMinor: amounts.discountMinor,
          expiresAt: new Date(input.expires_at),
          leadId: input.lead_id,
          payableMinor: amounts.payableMinor,
          quotationReference: input.quotation_reference,
          status: approvalStatus === 'PENDING' ? 'DRAFT' : 'ACTIVE',
          totalMinor: amounts.totalMinor,
          vehicleConfiguration: input.vehicle_configuration,
        })
        .returning();
      if (!quotation) throw new Error('Quotation insert did not return a row.');
      await this.insertQuotationVersion(
        tx,
        context,
        cid,
        quotation,
        input.price_components,
        input.notes,
        'Initial quotation',
      );
      if (approvalStatus === 'PENDING')
        await tx.insert(schema.discountApprovals).values({
          clientOrganizationId: cid,
          discountMinor: amounts.discountMinor,
          quotationId: quotation.id,
          quotationVersion: 1,
          requestedByMembershipId: context.membershipId,
          status: 'PENDING',
          thresholdMinor: settings.discountApprovalThresholdMinor,
        });
      const response = this.quotationSummary(quotation);
      await this.record(
        tx,
        context,
        cid,
        'COMMERCIAL_QUOTATION_CREATED',
        'QUOTATION',
        quotation.id,
        correlationId,
        response,
      );
      return response;
    });
  }

  reviseQuotation(
    context: AuthorizationContext,
    quotationId: string,
    input: ReviseQuotationRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'QUOTATION_REVISE',
      { quotationId, ...input },
      key,
      async (tx, cid) => {
        await this.lock(tx, schema.quotations, cid, quotationId);
        const quotation = await this.getQuotation(tx, context, cid, quotationId);
        if (quotation.currentVersion !== input.expected_version)
          throw conflict('CONFLICT', 'Quotation changed. Refresh before retrying.');
        if (quotation.status === 'SUPERSEDED' || quotation.status === 'EXPIRED')
          throw conflict('INVALID_TRANSITION', 'This quotation can no longer be revised.');
        if (new Date(input.expires_at) <= new Date())
          throw badRequest('INVALID_EXPIRY', 'Quotation expiry must be in the future.');
        const settings = await this.settings(tx, cid);
        const amounts = totals(input.price_components);
        const nextVersion = quotation.currentVersion + 1;
        const approvalStatus =
          amounts.discountMinor > settings.discountApprovalThresholdMinor
            ? 'PENDING'
            : 'NOT_REQUIRED';
        const [updated] = await tx
          .update(schema.quotations)
          .set({
            approvalStatus,
            currentVersion: nextVersion,
            discountMinor: amounts.discountMinor,
            expiresAt: new Date(input.expires_at),
            payableMinor: amounts.payableMinor,
            status: approvalStatus === 'PENDING' ? 'DRAFT' : 'ACTIVE',
            totalMinor: amounts.totalMinor,
            updatedAt: new Date(),
            vehicleConfiguration: input.vehicle_configuration,
          })
          .where(
            and(
              eq(schema.quotations.id, quotation.id),
              eq(schema.quotations.currentVersion, quotation.currentVersion),
            ),
          )
          .returning();
        if (!updated) throw conflict('CONFLICT', 'Quotation changed. Refresh before retrying.');
        await this.insertQuotationVersion(
          tx,
          context,
          cid,
          updated,
          input.price_components,
          input.notes,
          input.reason,
        );
        if (approvalStatus === 'PENDING')
          await tx.insert(schema.discountApprovals).values({
            clientOrganizationId: cid,
            discountMinor: amounts.discountMinor,
            quotationId,
            quotationVersion: nextVersion,
            requestedByMembershipId: context.membershipId,
            status: 'PENDING',
            thresholdMinor: settings.discountApprovalThresholdMinor,
          });
        const response = this.quotationSummary(updated);
        await this.record(
          tx,
          context,
          cid,
          'COMMERCIAL_QUOTATION_REVISED',
          'QUOTATION',
          quotationId,
          correlationId,
          response,
          { version: quotation.currentVersion },
          input.reason,
        );
        return response;
      },
    );
  }

  decideDiscount(
    context: AuthorizationContext,
    quotationId: string,
    input: DecideDiscountApprovalRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'DISCOUNT_DECIDE',
      { quotationId, ...input },
      key,
      async (tx, cid) => {
        await this.lock(tx, schema.quotations, cid, quotationId);
        const quotation = await this.getQuotation(tx, context, cid, quotationId);
        if (
          quotation.currentVersion !== input.expected_quotation_version ||
          quotation.approvalStatus !== 'PENDING'
        )
          throw conflict(
            'INVALID_TRANSITION',
            'The pending quotation version is no longer available for a decision.',
          );
        const [approval] = await tx
          .select()
          .from(schema.discountApprovals)
          .where(
            and(
              eq(schema.discountApprovals.clientOrganizationId, cid),
              eq(schema.discountApprovals.quotationId, quotationId),
              eq(schema.discountApprovals.quotationVersion, quotation.currentVersion),
            ),
          )
          .limit(1);
        if (!approval || approval.status !== 'PENDING')
          throw conflict('INVALID_TRANSITION', 'Discount approval is no longer pending.');
        const now = new Date();
        await tx
          .update(schema.discountApprovals)
          .set({
            decidedAt: now,
            decidedByMembershipId: context.membershipId,
            reason: input.reason,
            status: input.decision,
          })
          .where(
            and(
              eq(schema.discountApprovals.id, approval.id),
              eq(schema.discountApprovals.status, 'PENDING'),
            ),
          );
        const [updated] = await tx
          .update(schema.quotations)
          .set({
            approvalStatus: input.decision,
            status: input.decision === 'APPROVED' ? 'ACTIVE' : 'DRAFT',
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.quotations.id, quotationId),
              eq(schema.quotations.currentVersion, quotation.currentVersion),
            ),
          )
          .returning();
        if (!updated) throw conflict('CONFLICT', 'Quotation changed. Refresh before retrying.');
        const response = this.quotationSummary(updated);
        await this.record(
          tx,
          context,
          cid,
          `COMMERCIAL_DISCOUNT_${input.decision}`,
          'QUOTATION',
          quotationId,
          correlationId,
          response,
          { approval_status: 'PENDING' },
          input.reason,
        );
        return response;
      },
    );
  }

  createBooking(
    context: AuthorizationContext,
    input: CreateBookingRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(context, 'BOOKING_CREATE', input, key, async (tx, cid) => {
      await this.lock(tx, schema.quotations, cid, input.quotation_id);
      const quotation = await this.getQuotation(tx, context, cid, input.quotation_id);
      if (
        quotation.currentVersion !== input.quotation_version ||
        quotation.status !== 'ACTIVE' ||
        !['APPROVED', 'NOT_REQUIRED'].includes(quotation.approvalStatus)
      )
        throw conflict(
          'QUOTATION_NOT_BOOKABLE',
          'Only the current approved active quotation can be booked.',
        );
      if (quotation.expiresAt <= new Date())
        throw conflict('QUOTATION_EXPIRED', 'The quotation has expired.');
      const confirmedAt = new Date(input.customer_confirmed_at);
      if (confirmedAt > new Date())
        throw badRequest(
          'INVALID_CUSTOMER_CONFIRMATION',
          'Customer confirmation cannot be recorded in the future.',
        );
      if (input.expected_delivery_at && new Date(input.expected_delivery_at) <= confirmedAt)
        throw badRequest(
          'INVALID_EXPECTED_DELIVERY',
          'Expected delivery must be after customer confirmation.',
        );
      const [version] = await tx
        .select()
        .from(schema.quotationVersions)
        .where(
          and(
            eq(schema.quotationVersions.clientOrganizationId, cid),
            eq(schema.quotationVersions.quotationId, quotation.id),
            eq(schema.quotationVersions.version, input.quotation_version),
          ),
        )
        .limit(1);
      if (!version) throw notFound('Quotation version not found.');
      const components = await tx
        .select()
        .from(schema.quotationPriceComponents)
        .where(
          and(
            eq(schema.quotationPriceComponents.clientOrganizationId, cid),
            eq(schema.quotationPriceComponents.quotationVersionId, version.id),
          ),
        );
      const [booking] = await tx
        .insert(schema.bookings)
        .values({
          bookingReference: input.booking_reference,
          branchId: quotation.branchId,
          clientOrganizationId: cid,
          contactId: quotation.contactId,
          createdByMembershipId: context.membershipId,
          createdByUserId: context.userId,
          currency: quotation.currency,
          customerConfirmedAt: confirmedAt,
          expectedDeliveryAt: input.expected_delivery_at
            ? new Date(input.expected_delivery_at)
            : null,
          leadId: quotation.leadId,
          payableMinor: quotation.payableMinor,
          paymentType: input.payment_type,
          quotationId: quotation.id,
          quotationVersion: input.quotation_version,
          status: 'CONFIRMED',
        })
        .returning();
      if (!booking) throw new Error('Booking insert did not return a row.');
      if (components.length > 0)
        await tx.insert(schema.bookingItems).values(
          components.map((entry) => ({
            amountMinor: entry.amountMinor,
            bookingId: booking.id,
            clientOrganizationId: cid,
            code: entry.code,
            description: entry.label,
            quantity: 1,
          })),
        );
      const [allocation] = await tx
        .select({
          id: schema.inventoryAllocations.id,
          inventoryUnitId: schema.inventoryAllocations.inventoryUnitId,
        })
        .from(schema.inventoryAllocations)
        .where(
          and(
            eq(schema.inventoryAllocations.clientOrganizationId, cid),
            eq(schema.inventoryAllocations.bookingReference, input.booking_reference),
            eq(schema.inventoryAllocations.status, 'ACTIVE'),
          ),
        )
        .limit(1);
      if (allocation) {
        await tx
          .update(schema.inventoryAllocations)
          .set({ bookingId: booking.id })
          .where(eq(schema.inventoryAllocations.id, allocation.id));
        await tx
          .update(schema.bookings)
          .set({ selectedInventoryUnitId: allocation.inventoryUnitId, updatedAt: new Date() })
          .where(eq(schema.bookings.id, booking.id));
        booking.selectedInventoryUnitId = allocation.inventoryUnitId;
      }
      const response = {
        booking_id: booking.id,
        booking_reference: booking.bookingReference,
        status: booking.status,
        version: booking.version,
      };
      await this.record(
        tx,
        context,
        cid,
        'COMMERCIAL_BOOKING_CONFIRMED',
        'BOOKING',
        booking.id,
        correlationId,
        response,
      );
      return response;
    });
  }

  cancelBooking(
    context: AuthorizationContext,
    bookingId: string,
    input: CancelBookingRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'BOOKING_CANCEL',
      { bookingId, ...input },
      key,
      async (tx, cid) => {
        await this.lock(tx, schema.bookings, cid, bookingId);
        const booking = await this.getBooking(tx, context, cid, bookingId);
        if (booking.version !== input.expected_version)
          throw conflict('CONFLICT', 'Booking changed. Refresh before retrying.');
        if (booking.status !== 'CONFIRMED')
          throw conflict('INVALID_TRANSITION', 'Only a confirmed booking can be cancelled.');
        const verifiedPaid =
          (await this.paymentBalancesTx(tx, cid, [booking.id])).get(booking.id) ?? 0;
        if (verifiedPaid > 0 && !input.refund_settlement_note)
          throw badRequest(
            'REFUND_SETTLEMENT_REQUIRED',
            'A refund or settlement note is required when verified payments exist.',
          );
        const now = new Date();
        const [updated] = await tx
          .update(schema.bookings)
          .set({
            cancellationNotificationDecision: input.notification_decision,
            cancellationReason: input.reason,
            cancelledAt: now,
            refundSettlementNote: input.refund_settlement_note,
            status: 'CANCELLED',
            updatedAt: now,
            version: booking.version + 1,
          })
          .where(
            and(
              eq(schema.bookings.id, booking.id),
              eq(schema.bookings.version, booking.version),
              eq(schema.bookings.status, 'CONFIRMED'),
            ),
          )
          .returning();
        if (!updated) throw conflict('CONFLICT', 'Booking changed. Refresh before retrying.');
        const response = {
          booking_id: updated.id,
          status: updated.status,
          version: updated.version,
        };
        await this.record(
          tx,
          context,
          cid,
          'COMMERCIAL_BOOKING_CANCELLED',
          'BOOKING',
          booking.id,
          correlationId,
          response,
          { status: booking.status },
          input.reason,
        );
        return response;
      },
    );
  }

  createPayment(
    context: AuthorizationContext,
    bookingId: string,
    input: CreatePaymentEntryRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'PAYMENT_CREATE',
      { bookingId, ...input },
      key,
      async (tx, cid) => {
        const booking = await this.getBooking(tx, context, cid, bookingId);
        this.assertConfirmed(booking);
        if (input.currency !== booking.currency)
          throw badRequest('CURRENCY_MISMATCH', 'Payment currency must match the booking.');
        if (input.proof_document_version_id) {
          const [proof] = await tx
            .select({
              bookingId: schema.commercialDocuments.bookingId,
              uploadStatus: schema.commercialDocumentVersions.uploadStatus,
            })
            .from(schema.commercialDocumentVersions)
            .innerJoin(
              schema.commercialDocuments,
              and(
                eq(
                  schema.commercialDocuments.clientOrganizationId,
                  schema.commercialDocumentVersions.clientOrganizationId,
                ),
                eq(schema.commercialDocuments.id, schema.commercialDocumentVersions.documentId),
              ),
            )
            .where(
              and(
                eq(schema.commercialDocumentVersions.clientOrganizationId, cid),
                eq(schema.commercialDocumentVersions.id, input.proof_document_version_id),
              ),
            )
            .limit(1);
          if (!proof || proof.bookingId !== booking.id || proof.uploadStatus !== 'UPLOADED')
            throw badRequest(
              'INVALID_PAYMENT_PROOF',
              'Payment proof must be an uploaded document for this booking.',
            );
        }
        const [entry] = await tx
          .insert(schema.paymentEntries)
          .values({
            amountMinor: input.amount_minor,
            bookingId,
            clientOrganizationId: cid,
            createdByMembershipId: context.membershipId,
            createdByUserId: context.userId,
            currency: input.currency,
            kind: 'PAYMENT',
            method: input.method,
            paymentReference: input.payment_reference,
            proofDocumentVersionId: input.proof_document_version_id,
            receivedAt: new Date(input.received_at),
          })
          .returning();
        if (!entry) throw new Error('Payment insert did not return a row.');
        const response = {
          amount_minor: entry.amountMinor,
          booking_id: booking.id,
          id: entry.id,
          status: 'PENDING_VERIFICATION' as const,
        };
        await this.record(
          tx,
          context,
          cid,
          'COMMERCIAL_PAYMENT_RECORDED',
          'PAYMENT_ENTRY',
          entry.id,
          correlationId,
          response,
        );
        return response;
      },
    );
  }

  verifyPayment(
    context: AuthorizationContext,
    paymentId: string,
    input: VerifyPaymentEntryRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'PAYMENT_VERIFY',
      { paymentId, ...input },
      key,
      async (tx, cid) => {
        await this.lock(tx, schema.paymentEntries, cid, paymentId);
        const [entry] = await tx
          .select()
          .from(schema.paymentEntries)
          .where(
            and(
              eq(schema.paymentEntries.clientOrganizationId, cid),
              eq(schema.paymentEntries.id, paymentId),
            ),
          )
          .limit(1);
        if (!entry) throw notFound('Payment entry not found.');
        const booking = await this.getBooking(tx, context, cid, entry.bookingId);
        this.assertConfirmed(booking);
        const [existing] = await tx
          .select()
          .from(schema.paymentVerificationEvents)
          .where(
            and(
              eq(schema.paymentVerificationEvents.clientOrganizationId, cid),
              eq(schema.paymentVerificationEvents.paymentEntryId, entry.id),
            ),
          )
          .orderBy(desc(schema.paymentVerificationEvents.createdAt))
          .limit(1);
        if (existing)
          throw conflict(
            'PAYMENT_ALREADY_DECIDED',
            'This payment entry already has a verification decision.',
          );
        if (input.decision === 'VERIFIED') {
          const paid = (await this.paymentBalancesTx(tx, cid, [booking.id])).get(booking.id) ?? 0;
          if (paid + entry.amountMinor > booking.payableMinor)
            throw conflict(
              'BALANCE_NEGATIVE',
              'Verifying this payment would make the booking balance negative.',
            );
        }
        await tx.insert(schema.paymentVerificationEvents).values({
          actorMembershipId: context.membershipId,
          clientOrganizationId: cid,
          fromStatus: 'PENDING_VERIFICATION',
          paymentEntryId: entry.id,
          reason: input.reason,
          toStatus: input.decision,
        });
        const verifiedPaid =
          (await this.paymentBalancesTx(tx, cid, [booking.id])).get(booking.id) ?? 0;
        const response = {
          balance_minor: booking.payableMinor - verifiedPaid,
          booking_id: booking.id,
          payment_id: entry.id,
          status: input.decision,
          verified_paid_minor: verifiedPaid,
        };
        await this.record(
          tx,
          context,
          cid,
          `COMMERCIAL_PAYMENT_${input.decision}`,
          'PAYMENT_ENTRY',
          entry.id,
          correlationId,
          response,
          { status: 'PENDING_VERIFICATION' },
          input.reason,
        );
        return response;
      },
    );
  }

  reversePayment(
    context: AuthorizationContext,
    paymentId: string,
    input: ReversePaymentEntryRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'PAYMENT_REVERSE',
      { paymentId, ...input },
      key,
      async (tx, cid) => {
        await this.lock(tx, schema.paymentEntries, cid, paymentId);
        const [original] = await tx
          .select()
          .from(schema.paymentEntries)
          .where(
            and(
              eq(schema.paymentEntries.clientOrganizationId, cid),
              eq(schema.paymentEntries.id, paymentId),
            ),
          )
          .limit(1);
        if (!original || original.kind !== 'PAYMENT')
          throw notFound('Verified payment entry not found.');
        const booking = await this.getBooking(tx, context, cid, original.bookingId);
        const [verification] = await tx
          .select()
          .from(schema.paymentVerificationEvents)
          .where(
            and(
              eq(schema.paymentVerificationEvents.clientOrganizationId, cid),
              eq(schema.paymentVerificationEvents.paymentEntryId, original.id),
            ),
          )
          .orderBy(desc(schema.paymentVerificationEvents.createdAt))
          .limit(1);
        if (verification?.toStatus !== 'VERIFIED')
          throw conflict('PAYMENT_NOT_VERIFIED', 'Only a verified payment can be reversed.');
        const currentPaid =
          (await this.paymentBalancesTx(tx, cid, [booking.id])).get(booking.id) ?? 0;
        if (currentPaid - original.amountMinor < 0)
          throw conflict(
            'BALANCE_NEGATIVE',
            'This reversal would make the verified payment total negative.',
          );
        const [reversal] = await tx
          .insert(schema.paymentEntries)
          .values({
            amountMinor: original.amountMinor,
            bookingId: original.bookingId,
            clientOrganizationId: cid,
            createdByMembershipId: context.membershipId,
            createdByUserId: context.userId,
            currency: original.currency,
            kind: 'REVERSAL',
            method: original.method,
            originalEntryId: original.id,
            paymentReference: `REV-${original.paymentReference}-${randomUUID().slice(0, 8)}`,
            proofDocumentVersionId: original.proofDocumentVersionId,
            receivedAt: new Date(),
          })
          .returning();
        if (!reversal) throw new Error('Payment reversal insert did not return a row.');
        await tx.insert(schema.paymentVerificationEvents).values({
          actorMembershipId: context.membershipId,
          clientOrganizationId: cid,
          fromStatus: 'PENDING_VERIFICATION',
          paymentEntryId: reversal.id,
          reason: input.reason,
          toStatus: 'VERIFIED',
        });
        const response = {
          booking_id: booking.id,
          original_payment_id: original.id,
          reversal_id: reversal.id,
          status: 'VERIFIED' as const,
          verified_paid_minor: currentPaid - original.amountMinor,
        };
        await this.record(
          tx,
          context,
          cid,
          'COMMERCIAL_PAYMENT_REVERSED',
          'PAYMENT_ENTRY',
          reversal.id,
          correlationId,
          response,
          null,
          input.reason,
        );
        return response;
      },
    );
  }

  createFinance(
    context: AuthorizationContext,
    bookingId: string,
    input: CreateFinanceCaseRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'FINANCE_CREATE',
      { bookingId, ...input },
      key,
      async (tx, cid) => {
        const booking = await this.getBooking(tx, context, cid, bookingId);
        this.assertConfirmed(booking);
        if (booking.currency !== input.currency)
          throw badRequest('CURRENCY_MISMATCH', 'Finance currency must match the booking.');
        if (
          input.applied_amount_minor > booking.payableMinor ||
          input.down_payment_minor > booking.payableMinor ||
          input.applied_amount_minor + input.down_payment_minor > booking.payableMinor
        )
          throw badRequest(
            'INVALID_FINANCE_AMOUNT',
            'Finance application and down payment cannot exceed the booking payable amount.',
          );
        const [finance] = await tx
          .insert(schema.financeCases)
          .values({
            appliedAmountMinor: input.applied_amount_minor,
            bookingId,
            clientOrganizationId: cid,
            createdByMembershipId: context.membershipId,
            currency: input.currency,
            downPaymentMinor: input.down_payment_minor,
            partnerName: input.partner_name,
            providerReference: input.provider_reference,
            status: 'APPLIED',
          })
          .returning();
        if (!finance) throw new Error('Finance case insert did not return a row.');
        await tx.insert(schema.financeCaseEvents).values({
          actorMembershipId: context.membershipId,
          amountMinor: input.applied_amount_minor,
          clientOrganizationId: cid,
          financeCaseId: finance.id,
          fromStatus: null,
          providerReference: input.provider_reference,
          reason: 'Finance application recorded.',
          toStatus: 'APPLIED',
        });
        const response = {
          booking_id: booking.id,
          finance_case_id: finance.id,
          status: finance.status,
          version: finance.version,
        };
        await this.record(
          tx,
          context,
          cid,
          'COMMERCIAL_FINANCE_APPLIED',
          'FINANCE_CASE',
          finance.id,
          correlationId,
          response,
        );
        return response;
      },
    );
  }

  decideFinance(
    context: AuthorizationContext,
    financeCaseId: string,
    input: DecideFinanceCaseRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'FINANCE_DECIDE',
      { financeCaseId, ...input },
      key,
      async (tx, cid) => {
        await this.lock(tx, schema.financeCases, cid, financeCaseId);
        const finance = await this.getFinance(tx, context, cid, financeCaseId);
        if (finance.status !== 'APPLIED' || finance.version !== input.expected_version)
          throw conflict(
            'INVALID_TRANSITION',
            'Only the current applied finance case can be decided.',
          );
        if (
          input.decision === 'APPROVED' &&
          (input.sanctioned_amount_minor ?? 0) > finance.appliedAmountMinor
        )
          throw badRequest(
            'INVALID_SANCTION_AMOUNT',
            'Sanctioned amount cannot exceed the applied amount.',
          );
        const [updated] = await tx
          .update(schema.financeCases)
          .set({
            providerReference: input.provider_reference,
            sanctionedAmountMinor: input.sanctioned_amount_minor,
            status: input.decision,
            updatedAt: new Date(),
            version: finance.version + 1,
          })
          .where(
            and(
              eq(schema.financeCases.id, finance.id),
              eq(schema.financeCases.version, finance.version),
              eq(schema.financeCases.status, 'APPLIED'),
            ),
          )
          .returning();
        if (!updated) throw conflict('CONFLICT', 'Finance case changed. Refresh before retrying.');
        await tx.insert(schema.financeCaseEvents).values({
          actorMembershipId: context.membershipId,
          amountMinor: input.sanctioned_amount_minor,
          clientOrganizationId: cid,
          financeCaseId: finance.id,
          fromStatus: 'APPLIED',
          providerReference: input.provider_reference,
          reason: input.reason,
          toStatus: input.decision,
        });
        const response = {
          finance_case_id: finance.id,
          status: updated.status,
          version: updated.version,
        };
        await this.record(
          tx,
          context,
          cid,
          `COMMERCIAL_FINANCE_${input.decision}`,
          'FINANCE_CASE',
          finance.id,
          correlationId,
          response,
          { status: finance.status, version: finance.version },
          input.reason,
        );
        return response;
      },
    );
  }

  disburseFinance(
    context: AuthorizationContext,
    financeCaseId: string,
    input: DisburseFinanceCaseRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'FINANCE_DISBURSE',
      { financeCaseId, ...input },
      key,
      async (tx, cid) => {
        await this.lock(tx, schema.financeCases, cid, financeCaseId);
        const finance = await this.getFinance(tx, context, cid, financeCaseId);
        if (finance.status !== 'APPROVED' || finance.version !== input.expected_version)
          throw conflict(
            'INVALID_TRANSITION',
            'Only the current approved finance case can be disbursed.',
          );
        if (input.amount_minor > (finance.sanctionedAmountMinor ?? 0))
          throw badRequest(
            'INVALID_DISBURSEMENT_AMOUNT',
            'Disbursement cannot exceed the sanctioned amount.',
          );
        const [updated] = await tx
          .update(schema.financeCases)
          .set({
            disbursedAmountMinor: input.amount_minor,
            disbursedAt: new Date(input.disbursed_at),
            providerReference: input.provider_reference,
            status: 'DISBURSED',
            updatedAt: new Date(),
            version: finance.version + 1,
          })
          .where(
            and(
              eq(schema.financeCases.id, finance.id),
              eq(schema.financeCases.version, finance.version),
              eq(schema.financeCases.status, 'APPROVED'),
            ),
          )
          .returning();
        if (!updated) throw conflict('CONFLICT', 'Finance case changed. Refresh before retrying.');
        await tx.insert(schema.financeCaseEvents).values({
          actorMembershipId: context.membershipId,
          amountMinor: input.amount_minor,
          clientOrganizationId: cid,
          financeCaseId: finance.id,
          fromStatus: 'APPROVED',
          providerReference: input.provider_reference,
          reason: 'Provider disbursement recorded separately from approval.',
          toStatus: 'DISBURSED',
        });
        const response = {
          disbursed_amount_minor: input.amount_minor,
          finance_case_id: finance.id,
          status: updated.status,
          version: updated.version,
        };
        await this.record(
          tx,
          context,
          cid,
          'COMMERCIAL_FINANCE_DISBURSED',
          'FINANCE_CASE',
          finance.id,
          correlationId,
          response,
          { status: finance.status, version: finance.version },
        );
        return response;
      },
    );
  }

  createInsurance(
    context: AuthorizationContext,
    bookingId: string,
    input: CreateInsuranceCaseRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'INSURANCE_UPSERT',
      { bookingId, ...input },
      key,
      async (tx, cid) => {
        const booking = await this.getBooking(tx, context, cid, bookingId);
        this.assertConfirmed(booking);
        if (booking.currency !== input.currency)
          throw badRequest('CURRENCY_MISMATCH', 'Insurance currency must match the booking.');
        if (input.policy_generated && !input.policy_number)
          throw badRequest(
            'POLICY_NUMBER_REQUIRED',
            'A generated policy requires a policy number.',
          );
        const [insurance] = await tx
          .insert(schema.insuranceCases)
          .values({
            bookingId,
            clientOrganizationId: cid,
            createdByMembershipId: context.membershipId,
            currency: input.currency,
            insurerName: input.insurer_name,
            paymentStatus: input.payment_status,
            policyGenerated: input.policy_generated,
            policyNumber: input.policy_number,
            premiumMinor: input.premium_minor,
            quoteReference: input.quote_reference,
          })
          .onConflictDoUpdate({
            target: [schema.insuranceCases.clientOrganizationId, schema.insuranceCases.bookingId],
            set: {
              insurerName: input.insurer_name,
              paymentStatus: input.payment_status,
              policyGenerated: input.policy_generated,
              policyNumber: input.policy_number,
              premiumMinor: input.premium_minor,
              quoteReference: input.quote_reference,
              updatedAt: new Date(),
            },
          })
          .returning();
        if (!insurance) throw new Error('Insurance upsert did not return a row.');
        const response = {
          booking_id: booking.id,
          insurance_case_id: insurance.id,
          payment_status: insurance.paymentStatus,
          policy_generated: insurance.policyGenerated,
        };
        await this.record(
          tx,
          context,
          cid,
          'COMMERCIAL_INSURANCE_UPDATED',
          'INSURANCE_CASE',
          insurance.id,
          correlationId,
          response,
        );
        return response;
      },
    );
  }

  createInvoice(
    context: AuthorizationContext,
    bookingId: string,
    input: CreateInvoiceRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'INVOICE_CREATE',
      { bookingId, ...input },
      key,
      async (tx, cid) => {
        const booking = await this.getBooking(tx, context, cid, bookingId);
        this.assertConfirmed(booking);
        if (booking.currency !== input.currency || input.amount_minor !== booking.payableMinor)
          throw badRequest(
            'INVOICE_AMOUNT_MISMATCH',
            'Invoice currency and amount must match the booking payable amount.',
          );
        const [invoice] = await tx
          .insert(schema.commercialInvoices)
          .values({
            amountMinor: input.amount_minor,
            bookingId,
            clientOrganizationId: cid,
            createdByMembershipId: context.membershipId,
            currency: input.currency,
            invoiceNumber: input.invoice_number,
            issuedAt: new Date(input.issued_at),
          })
          .returning();
        if (!invoice) throw new Error('Invoice insert did not return a row.');
        const response = {
          booking_id: booking.id,
          invoice_id: invoice.id,
          invoice_number: invoice.invoiceNumber,
        };
        await this.record(
          tx,
          context,
          cid,
          'COMMERCIAL_INVOICE_RECORDED',
          'INVOICE',
          invoice.id,
          correlationId,
          response,
        );
        return response;
      },
    );
  }

  createExchange(
    context: AuthorizationContext,
    bookingId: string,
    input: CreateExchangeCaseRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'EXCHANGE_CREATE',
      { bookingId, ...input },
      key,
      async (tx, cid) => {
        const booking = await this.getBooking(tx, context, cid, bookingId);
        this.assertConfirmed(booking);
        const [exchange] = await tx
          .insert(schema.exchangeCases)
          .values({
            bookingId,
            clientOrganizationId: cid,
            createdByMembershipId: context.membershipId,
            expectedPriceMinor: input.expected_price_minor,
            makeModel: input.make_model,
            odometerKm: input.odometer_km,
            ownershipName: input.ownership_name,
            registrationNumber: input.registration_number,
            status: 'REQUESTED',
            year: input.year,
          })
          .returning();
        if (!exchange) throw new Error('Exchange case insert did not return a row.');
        await tx.insert(schema.exchangeCaseEvents).values({
          actorMembershipId: context.membershipId,
          amountMinor: input.expected_price_minor,
          clientOrganizationId: cid,
          exchangeCaseId: exchange.id,
          fromStatus: null,
          reason: 'Exchange evaluation requested.',
          toStatus: 'REQUESTED',
        });
        const response = {
          booking_id: booking.id,
          exchange_case_id: exchange.id,
          status: exchange.status,
          version: exchange.version,
        };
        await this.record(
          tx,
          context,
          cid,
          'COMMERCIAL_EXCHANGE_REQUESTED',
          'EXCHANGE_CASE',
          exchange.id,
          correlationId,
          response,
        );
        return response;
      },
    );
  }

  decideExchange(
    context: AuthorizationContext,
    exchangeCaseId: string,
    input: DecideExchangeCaseRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'EXCHANGE_DECIDE',
      { exchangeCaseId, ...input },
      key,
      async (tx, cid) => {
        await this.lock(tx, schema.exchangeCases, cid, exchangeCaseId);
        const [exchange] = await tx
          .select()
          .from(schema.exchangeCases)
          .where(
            and(
              eq(schema.exchangeCases.clientOrganizationId, cid),
              eq(schema.exchangeCases.id, exchangeCaseId),
            ),
          )
          .limit(1);
        if (!exchange) throw notFound('Exchange case not found.');
        await this.getBooking(tx, context, cid, exchange.bookingId);
        if (exchange.status !== 'REQUESTED' || exchange.version !== input.expected_version)
          throw conflict(
            'INVALID_TRANSITION',
            'Only the current requested exchange case can be decided.',
          );
        const [updated] = await tx
          .update(schema.exchangeCases)
          .set({
            decidedByMembershipId: context.membershipId,
            decisionReason: input.reason,
            evaluatedPriceMinor: input.evaluated_price_minor,
            status: input.decision,
            updatedAt: new Date(),
            version: exchange.version + 1,
          })
          .where(
            and(
              eq(schema.exchangeCases.id, exchange.id),
              eq(schema.exchangeCases.version, exchange.version),
              eq(schema.exchangeCases.status, 'REQUESTED'),
            ),
          )
          .returning();
        if (!updated) throw conflict('CONFLICT', 'Exchange case changed. Refresh before retrying.');
        await tx.insert(schema.exchangeCaseEvents).values({
          actorMembershipId: context.membershipId,
          amountMinor: input.evaluated_price_minor,
          clientOrganizationId: cid,
          exchangeCaseId: exchange.id,
          fromStatus: 'REQUESTED',
          reason: input.reason,
          toStatus: input.decision,
        });
        const response = {
          evaluated_price_minor: input.evaluated_price_minor,
          exchange_case_id: exchange.id,
          status: updated.status,
          version: updated.version,
        };
        await this.record(
          tx,
          context,
          cid,
          `COMMERCIAL_EXCHANGE_${input.decision}`,
          'EXCHANGE_CASE',
          exchange.id,
          correlationId,
          response,
          { status: exchange.status, version: exchange.version },
          input.reason,
        );
        return response;
      },
    );
  }

  async initiateDocument(
    context: AuthorizationContext,
    input: InitiateCommercialDocumentUploadRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    const extension = input.file_name.toLowerCase().split('.').pop();
    const expected: Record<string, string[]> = {
      'application/pdf': ['pdf'],
      'image/jpeg': ['jpg', 'jpeg'],
      'image/png': ['png'],
      'image/webp': ['webp'],
    };
    if (!extension || !expected[input.content_type]?.includes(extension))
      throw badRequest('FILE_TYPE_MISMATCH', 'File extension and content type do not match.');
    const created = await this.command(
      context,
      'DOCUMENT_INITIATE',
      input,
      key,
      async (tx, cid) => {
        const booking = await this.getBooking(tx, context, cid, input.booking_id);
        this.assertConfirmed(booking);
        const objectKey = `commercial/${cid}/${booking.id}/${randomUUID()}/${input.file_name.replace(/[^a-zA-Z0-9._-]/gu, '_')}`;
        const [document] = await tx
          .insert(schema.commercialDocuments)
          .values({
            bookingId: booking.id,
            clientOrganizationId: cid,
            createdByMembershipId: context.membershipId,
            documentType: input.document_type,
            expiresAt: input.expires_at ? new Date(input.expires_at) : null,
            preferredDeliveryChannel: input.preferred_delivery_channel,
            status: 'PENDING',
          })
          .returning();
        if (!document) throw new Error('Document insert did not return a row.');
        const [version] = await tx
          .insert(schema.commercialDocumentVersions)
          .values({
            checksumSha256: input.checksum_sha256?.toLowerCase() ?? null,
            clientOrganizationId: cid,
            contentLength: input.content_length,
            contentType: input.content_type,
            documentId: document.id,
            fileName: input.file_name,
            objectKey,
            scanStatus: 'PENDING',
            uploadStatus: 'PENDING_UPLOAD',
            uploaderMembershipId: context.membershipId,
            version: 1,
          })
          .returning();
        if (!version) throw new Error('Document version insert did not return a row.');
        const response = {
          content_length: version.contentLength,
          content_type: version.contentType,
          document_id: document.id,
          document_version_id: version.id,
          file_name: version.fileName,
          object_key: objectKey,
        };
        await this.record(
          tx,
          context,
          cid,
          'COMMERCIAL_DOCUMENT_UPLOAD_INITIATED',
          'COMMERCIAL_DOCUMENT',
          document.id,
          correlationId,
          { ...response, object_key: '[PRIVATE]' },
        );
        return response;
      },
    );
    const upload = await this.storage.createUploadUrl({
      ...(input.checksum_sha256 ? { checksumSha256: input.checksum_sha256 } : {}),
      contentLength: input.content_length,
      contentType: input.content_type,
      expiresInSeconds: 900,
      key: created.object_key,
    });
    return {
      document_id: created.document_id,
      document_version_id: created.document_version_id,
      upload,
    };
  }

  async completeDocument(
    context: AuthorizationContext,
    documentId: string,
    input: CompleteCommercialDocumentUploadRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    const cid = clientId(context);
    const replay = await this.replay<Record<string, unknown>>(
      context,
      'DOCUMENT_COMPLETE',
      { documentId, ...input },
      key,
    );
    if (replay) return replay;
    const preflight = await this.documentVersion(this.connection.db, context, cid, documentId);
    if (preflight.version.uploadStatus !== 'PENDING_UPLOAD')
      throw conflict('INVALID_TRANSITION', 'Document upload is not pending.');
    const metadata = await this.storage.stat(preflight.version.objectKey);
    if (
      !metadata ||
      metadata.contentLength !== preflight.version.contentLength ||
      metadata.contentType !== preflight.version.contentType
    )
      throw badRequest(
        'UPLOAD_METADATA_MISMATCH',
        'Uploaded object metadata does not match the initiated upload.',
      );
    const expectedChecksum = (
      input.checksum_sha256 ?? preflight.version.checksumSha256
    )?.toLowerCase();
    if (expectedChecksum && metadata.checksumSha256?.toLowerCase() !== expectedChecksum)
      throw badRequest('UPLOAD_CHECKSUM_MISMATCH', 'Uploaded object checksum does not match.');
    const scan = await this.scanner.scan({
      ...(expectedChecksum ? { checksumSha256: expectedChecksum } : {}),
      contentLength: preflight.version.contentLength,
      contentType: preflight.version.contentType,
      objectKey: preflight.version.objectKey,
    });
    return this.command(
      context,
      'DOCUMENT_COMPLETE',
      { documentId, ...input },
      key,
      async (tx, transactionClientId) => {
        const current = await this.documentVersion(tx, context, transactionClientId, documentId);
        if (current.version.uploadStatus !== 'PENDING_UPLOAD')
          throw conflict('INVALID_TRANSITION', 'Document upload is not pending.');
        const scanStatus = scan === 'UNAVAILABLE' ? 'PENDING_EXTERNAL_SCAN' : scan;
        await tx
          .update(schema.commercialDocumentVersions)
          .set({
            checksumSha256: expectedChecksum ?? null,
            scanStatus,
            uploadedAt: new Date(),
            uploadStatus: 'UPLOADED',
          })
          .where(
            and(
              eq(schema.commercialDocumentVersions.id, current.version.id),
              eq(schema.commercialDocumentVersions.uploadStatus, 'PENDING_UPLOAD'),
            ),
          );
        if (scan === 'REJECTED')
          await tx
            .update(schema.commercialDocuments)
            .set({ status: 'REJECTED', updatedAt: new Date() })
            .where(eq(schema.commercialDocuments.id, documentId));
        const response = {
          document_id: documentId,
          document_version_id: current.version.id,
          scan_status: scanStatus,
          status: scan === 'REJECTED' ? 'REJECTED' : 'PENDING',
        };
        await this.record(
          tx,
          context,
          transactionClientId,
          'COMMERCIAL_DOCUMENT_UPLOAD_COMPLETED',
          'COMMERCIAL_DOCUMENT',
          documentId,
          correlationId,
          response,
        );
        return response;
      },
    );
  }

  verifyDocument(
    context: AuthorizationContext,
    documentId: string,
    input: VerifyCommercialDocumentRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'DOCUMENT_VERIFY',
      { documentId, ...input },
      key,
      async (tx, cid) => {
        await this.lock(tx, schema.commercialDocuments, cid, documentId);
        const current = await this.documentVersion(tx, context, cid, documentId);
        if (current.version.uploadStatus !== 'UPLOADED')
          throw conflict('DOCUMENT_NOT_UPLOADED', 'Only an uploaded document can be verified.');
        if (input.decision === 'APPROVED' && current.version.scanStatus !== 'CLEAN')
          throw conflict(
            'DOCUMENT_SCAN_REQUIRED',
            'Approval is blocked until malware scanning reports CLEAN.',
          );
        if (current.document.status === 'APPROVED')
          throw conflict('INVALID_TRANSITION', 'An approved document cannot be decided again.');
        await tx
          .update(schema.commercialDocuments)
          .set({ status: input.decision, updatedAt: new Date() })
          .where(eq(schema.commercialDocuments.id, documentId));
        await tx.insert(schema.commercialDocumentVerificationEvents).values({
          actorMembershipId: context.membershipId,
          clientOrganizationId: cid,
          documentId,
          documentVersionId: current.version.id,
          fromStatus: current.document.status,
          reason: input.reason,
          toStatus: input.decision,
        });
        const response = {
          document_id: documentId,
          document_version_id: current.version.id,
          status: input.decision,
        };
        await this.record(
          tx,
          context,
          cid,
          `COMMERCIAL_DOCUMENT_${input.decision}`,
          'COMMERCIAL_DOCUMENT',
          documentId,
          correlationId,
          response,
          { status: current.document.status },
          input.reason,
        );
        return response;
      },
    );
  }

  async downloadDocument(context: AuthorizationContext, documentId: string, correlationId: string) {
    const cid = clientId(context);
    const current = await this.documentVersion(this.connection.db, context, cid, documentId);
    if (current.version.uploadStatus !== 'UPLOADED' || current.version.scanStatus === 'REJECTED')
      throw notFound('Document file not found.');
    if (current.document.expiresAt && current.document.expiresAt <= new Date())
      throw conflict('DOCUMENT_EXPIRED', 'This document has expired.');
    const download = await this.storage.createDownloadUrl({
      downloadFileName: current.version.fileName,
      expiresInSeconds: 300,
      key: current.version.objectKey,
    });
    await this.connection.db.transaction(async (tx) => {
      await tx.insert(schema.commercialDocumentDownloadEvents).values({
        actorMembershipId: context.membershipId,
        clientOrganizationId: cid,
        correlationId,
        documentId,
        documentVersionId: current.version.id,
        purpose: 'Authorized commercial document access.',
      });
      await this.record(
        tx,
        context,
        cid,
        'COMMERCIAL_DOCUMENT_DOWNLOADED',
        'COMMERCIAL_DOCUMENT',
        documentId,
        correlationId,
        { document_version_id: current.version.id },
      );
    });
    return { document_id: documentId, download };
  }

  async evaluateReadiness(context: AuthorizationContext, bookingId: string, correlationId: string) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const booking = await this.getBooking(tx, context, cid, bookingId);
      const settings = await this.settings(tx, cid);
      const verifiedPaid =
        (await this.paymentBalancesTx(tx, cid, [booking.id])).get(booking.id) ?? 0;
      const [allocation] = await tx
        .select()
        .from(schema.inventoryAllocations)
        .where(
          and(
            eq(schema.inventoryAllocations.clientOrganizationId, cid),
            or(
              eq(schema.inventoryAllocations.bookingId, booking.id),
              eq(schema.inventoryAllocations.bookingReference, booking.bookingReference),
            ),
            eq(schema.inventoryAllocations.status, 'ACTIVE'),
          ),
        )
        .limit(1);
      const [finance] = await tx
        .select()
        .from(schema.financeCases)
        .where(
          and(
            eq(schema.financeCases.clientOrganizationId, cid),
            eq(schema.financeCases.bookingId, booking.id),
          ),
        )
        .orderBy(desc(schema.financeCases.createdAt))
        .limit(1);
      const [insurance] = await tx
        .select()
        .from(schema.insuranceCases)
        .where(
          and(
            eq(schema.insuranceCases.clientOrganizationId, cid),
            eq(schema.insuranceCases.bookingId, booking.id),
          ),
        )
        .limit(1);
      const [invoice] = await tx
        .select()
        .from(schema.commercialInvoices)
        .where(
          and(
            eq(schema.commercialInvoices.clientOrganizationId, cid),
            eq(schema.commercialInvoices.bookingId, booking.id),
          ),
        )
        .limit(1);
      const approvedDocuments = await tx
        .select({ documentType: schema.commercialDocuments.documentType })
        .from(schema.commercialDocuments)
        .where(
          and(
            eq(schema.commercialDocuments.clientOrganizationId, cid),
            eq(schema.commercialDocuments.bookingId, booking.id),
            eq(schema.commercialDocuments.status, 'APPROVED'),
          ),
        );
      const approvedTypes = new Set(approvedDocuments.map((entry) => entry.documentType));
      const gateMinor = Math.ceil(
        (booking.payableMinor * settings.deliveryPaymentGateBasisPoints) / 10_000,
      );
      const financeRequired =
        settings.requireFinanceDisbursement && ['FINANCE', 'MIXED'].includes(booking.paymentType);
      const items: { blocking: boolean; code: string; complete: boolean; detail: string }[] = [
        {
          blocking: true,
          code: 'BOOKING_CONFIRMED',
          complete: booking.status === 'CONFIRMED',
          detail:
            booking.status === 'CONFIRMED'
              ? 'Booking is confirmed.'
              : `Booking status is ${booking.status}.`,
        },
        {
          blocking: true,
          code: 'INVENTORY_ALLOCATED',
          complete: Boolean(allocation),
          detail: allocation
            ? 'An active physical-unit allocation exists.'
            : 'No active physical-unit allocation exists.',
        },
        {
          blocking: true,
          code: 'PAYMENT_THRESHOLD',
          complete: verifiedPaid >= gateMinor,
          detail: `${verifiedPaid} of ${gateMinor} required minor units are verified.`,
        },
        {
          blocking: financeRequired,
          code: 'FINANCE_DISBURSED',
          complete: !financeRequired || finance?.status === 'DISBURSED',
          detail: financeRequired
            ? `Finance status is ${finance?.status ?? 'MISSING'}.`
            : 'Finance disbursement is not required.',
        },
        {
          blocking: settings.requireInvoice,
          code: 'INVOICE_RECORDED',
          complete: !settings.requireInvoice || Boolean(invoice),
          detail: invoice ? 'Invoice is recorded.' : 'Invoice is missing.',
        },
        {
          blocking: settings.requireInsurance,
          code: 'INSURANCE_COMPLETE',
          complete:
            !settings.requireInsurance ||
            Boolean(
              insurance?.policyGenerated &&
              ['PAID', 'NOT_APPLICABLE'].includes(insurance.paymentStatus),
            ),
          detail: insurance
            ? `Policy generated: ${insurance.policyGenerated}; payment: ${insurance.paymentStatus}.`
            : 'Insurance record is missing.',
        },
        {
          blocking: true,
          code: 'CUSTOMER_CONFIRMED',
          complete: Boolean(booking.customerConfirmedAt),
          detail: booking.customerConfirmedAt
            ? 'Customer confirmation is recorded.'
            : 'Customer confirmation is missing.',
        },
        ...settings.requiredDocumentTypes.map((documentType) => ({
          blocking: true,
          code: `DOCUMENT_${documentType}`,
          complete: approvedTypes.has(documentType),
          detail: approvedTypes.has(documentType)
            ? `${documentType} is approved.`
            : `${documentType} is not approved.`,
        })),
      ];
      const ready = items.every((entry) => !entry.blocking || entry.complete);
      const [evaluation] = await tx
        .insert(schema.deliveryReadinessEvaluations)
        .values({
          bookingId: booking.id,
          clientOrganizationId: cid,
          correlationId,
          evaluatedByMembershipId: context.membershipId,
          items,
          ready,
        })
        .returning();
      const response = {
        booking_id: booking.id,
        evaluated_at: (evaluation?.evaluatedAt ?? new Date()).toISOString(),
        items,
        ready,
      };
      await this.record(
        tx,
        context,
        cid,
        'COMMERCIAL_DELIVERY_READINESS_EVALUATED',
        'BOOKING',
        booking.id,
        correlationId,
        response,
      );
      return response;
    });
  }

  private async command<T extends Record<string, unknown>>(
    context: AuthorizationContext,
    commandType: string,
    input: unknown,
    key: string | undefined,
    operation: (tx: Tx, cid: string) => Promise<T>,
  ): Promise<T> {
    const cid = clientId(context);
    const idempotencyKey = requiredKey(key);
    const requestFingerprint = fingerprint({ commandType, input });
    try {
      return await this.connection.db.transaction(async (tx) => {
        const inserted = await tx
          .insert(schema.commercialCommandReceipts)
          .values({
            clientOrganizationId: cid,
            commandType,
            idempotencyKey,
            requestFingerprint,
            responseSnapshot: {},
          })
          .onConflictDoNothing()
          .returning({ id: schema.commercialCommandReceipts.id });
        if (inserted.length === 0) {
          const [receipt] = await tx
            .select()
            .from(schema.commercialCommandReceipts)
            .where(
              and(
                eq(schema.commercialCommandReceipts.clientOrganizationId, cid),
                eq(schema.commercialCommandReceipts.idempotencyKey, idempotencyKey),
              ),
            )
            .limit(1);
          if (
            !receipt ||
            receipt.commandType !== commandType ||
            receipt.requestFingerprint !== requestFingerprint
          )
            throw conflict(
              'IDEMPOTENCY_MISMATCH',
              'This idempotency key was used for another commercial command.',
            );
          return receipt.responseSnapshot as T;
        }
        const response = await operation(tx, cid);
        const receiptId = inserted[0]?.id;
        if (!receiptId) throw new Error('Commercial receipt insert did not return an ID.');
        await tx
          .update(schema.commercialCommandReceipts)
          .set({ responseSnapshot: response })
          .where(eq(schema.commercialCommandReceipts.id, receiptId));
        return response;
      });
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      )
        throw error;
      if (databaseCode(error) === '23505')
        throw conflict(
          'COMMERCIAL_CONFLICT',
          'The commercial reference or active workflow already exists.',
        );
      throw error;
    }
  }

  private async replay<T extends Record<string, unknown>>(
    context: AuthorizationContext,
    commandType: string,
    input: unknown,
    key: string | undefined,
  ): Promise<T | undefined> {
    const cid = clientId(context);
    const idempotencyKey = requiredKey(key);
    const requestFingerprint = fingerprint({ commandType, input });
    const [receipt] = await this.connection.db
      .select()
      .from(schema.commercialCommandReceipts)
      .where(
        and(
          eq(schema.commercialCommandReceipts.clientOrganizationId, cid),
          eq(schema.commercialCommandReceipts.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (!receipt) return undefined;
    if (receipt.commandType !== commandType || receipt.requestFingerprint !== requestFingerprint)
      throw conflict(
        'IDEMPOTENCY_MISMATCH',
        'This idempotency key was used for another commercial command.',
      );
    return receipt.responseSnapshot as T;
  }

  private async settings(tx: Tx | DatabaseConnection['db'], cid: string) {
    const [settings] = await tx
      .select()
      .from(schema.commercialSettings)
      .where(eq(schema.commercialSettings.clientOrganizationId, cid))
      .limit(1);
    if (!settings)
      throw conflict(
        'COMMERCIAL_CONFIGURATION_REQUIRED',
        'Commercial thresholds are not configured for this client.',
      );
    return settings;
  }

  private async assertLeadRelationship(
    tx: Tx,
    cid: string,
    leadId: string,
    contactId: string,
    branchId: string,
  ) {
    const [lead] = await tx
      .select({
        branchId: schema.leadOpportunities.branchId,
        contactId: schema.leadOpportunities.contactId,
      })
      .from(schema.leadOpportunities)
      .where(
        and(
          eq(schema.leadOpportunities.clientOrganizationId, cid),
          eq(schema.leadOpportunities.id, leadId),
        ),
      )
      .limit(1);
    if (!lead || lead.contactId !== contactId || lead.branchId !== branchId)
      throw notFound('Lead not found.');
  }

  private async getQuotation(
    tx: Tx,
    context: AuthorizationContext,
    cid: string,
    quotationId: string,
  ): Promise<Quotation> {
    const [quotation] = await tx
      .select()
      .from(schema.quotations)
      .where(
        and(eq(schema.quotations.clientOrganizationId, cid), eq(schema.quotations.id, quotationId)),
      )
      .limit(1);
    if (!quotation || !this.policy.canAccessBranch(context, quotation.branchId))
      throw notFound('Quotation not found.');
    return quotation;
  }

  private async getBooking(
    tx: Tx | DatabaseConnection['db'],
    context: AuthorizationContext,
    cid: string,
    bookingId: string,
  ): Promise<Booking> {
    const [booking] = await tx
      .select()
      .from(schema.bookings)
      .where(and(eq(schema.bookings.clientOrganizationId, cid), eq(schema.bookings.id, bookingId)))
      .limit(1);
    if (!booking || !this.policy.canAccessBranch(context, booking.branchId))
      throw notFound('Booking not found.');
    return booking;
  }

  private async getFinance(
    tx: Tx,
    context: AuthorizationContext,
    cid: string,
    financeCaseId: string,
  ) {
    const [finance] = await tx
      .select()
      .from(schema.financeCases)
      .where(
        and(
          eq(schema.financeCases.clientOrganizationId, cid),
          eq(schema.financeCases.id, financeCaseId),
        ),
      )
      .limit(1);
    if (!finance) throw notFound('Finance case not found.');
    await this.getBooking(tx, context, cid, finance.bookingId);
    return finance;
  }

  private assertConfirmed(booking: Booking) {
    if (booking.status !== 'CONFIRMED')
      throw conflict('INVALID_TRANSITION', 'This action requires a confirmed booking.');
  }

  private async documentVersion(
    tx: Tx | DatabaseConnection['db'],
    context: AuthorizationContext,
    cid: string,
    documentId: string,
  ) {
    const [row] = await tx
      .select({ document: schema.commercialDocuments, version: schema.commercialDocumentVersions })
      .from(schema.commercialDocuments)
      .innerJoin(
        schema.commercialDocumentVersions,
        and(
          eq(
            schema.commercialDocumentVersions.clientOrganizationId,
            schema.commercialDocuments.clientOrganizationId,
          ),
          eq(schema.commercialDocumentVersions.documentId, schema.commercialDocuments.id),
          eq(schema.commercialDocumentVersions.version, schema.commercialDocuments.currentVersion),
        ),
      )
      .where(
        and(
          eq(schema.commercialDocuments.clientOrganizationId, cid),
          eq(schema.commercialDocuments.id, documentId),
        ),
      )
      .limit(1);
    if (!row) throw notFound('Document not found.');
    await this.getBooking(tx, context, cid, row.document.bookingId);
    return row;
  }

  private async insertQuotationVersion(
    tx: Tx,
    context: AuthorizationContext,
    cid: string,
    quotation: Quotation,
    components: { amount_minor: number; category: string; code: string; label: string }[],
    notes: string | null,
    reason: string,
  ) {
    const [version] = await tx
      .insert(schema.quotationVersions)
      .values({
        clientOrganizationId: cid,
        createdByMembershipId: context.membershipId,
        createdByUserId: context.userId,
        currency: quotation.currency,
        discountMinor: quotation.discountMinor,
        expiresAt: quotation.expiresAt,
        notes,
        payableMinor: quotation.payableMinor,
        quotationId: quotation.id,
        reason,
        totalMinor: quotation.totalMinor,
        vehicleConfiguration: quotation.vehicleConfiguration,
        version: quotation.currentVersion,
      })
      .returning();
    if (!version) throw new Error('Quotation version insert did not return a row.');
    await tx.insert(schema.quotationPriceComponents).values(
      components.map((entry) => ({
        amountMinor: entry.amount_minor,
        category: entry.category,
        clientOrganizationId: cid,
        code: entry.code,
        label: entry.label,
        quotationVersionId: version.id,
      })),
    );
  }

  private quotationSummary(row: Quotation) {
    return {
      approval_status: row.approvalStatus,
      branch_id: row.branchId,
      contact_id: row.contactId,
      currency: row.currency,
      discount_minor: row.discountMinor,
      expires_at: row.expiresAt.toISOString(),
      id: row.id,
      lead_id: row.leadId,
      payable_minor: row.payableMinor,
      quotation_reference: row.quotationReference,
      status: row.status,
      total_minor: row.totalMinor,
      vehicle_configuration: row.vehicleConfiguration,
      version: row.currentVersion,
    };
  }

  private bookingSummary(row: Booking, customerName: string, verifiedPaid: number) {
    const normalized = Math.max(0, verifiedPaid);
    return {
      balance_minor: Math.max(0, row.payableMinor - normalized),
      booking_reference: row.bookingReference,
      branch_id: row.branchId,
      contact_id: row.contactId,
      currency: row.currency,
      customer_name: customerName,
      expected_delivery_at: row.expectedDeliveryAt?.toISOString() ?? null,
      id: row.id,
      lead_id: row.leadId,
      payable_minor: row.payableMinor,
      payment_status: paymentStatus(row.payableMinor, normalized),
      payment_type: row.paymentType,
      status: row.status,
      verified_paid_minor: normalized,
      version: row.version,
    };
  }

  private paymentBalances(cid: string, bookingIds: string[]) {
    return this.paymentBalancesTx(this.connection.db, cid, bookingIds);
  }

  private async paymentBalancesTx(
    tx: Tx | DatabaseConnection['db'],
    cid: string,
    bookingIds: string[],
  ) {
    const balances = new Map<string, number>();
    if (bookingIds.length === 0) return balances;
    const entries = await tx
      .select()
      .from(schema.paymentEntries)
      .where(
        and(
          eq(schema.paymentEntries.clientOrganizationId, cid),
          inArray(schema.paymentEntries.bookingId, bookingIds),
        ),
      );
    if (entries.length === 0) return balances;
    const events = await tx
      .select()
      .from(schema.paymentVerificationEvents)
      .where(
        and(
          eq(schema.paymentVerificationEvents.clientOrganizationId, cid),
          inArray(
            schema.paymentVerificationEvents.paymentEntryId,
            entries.map((entry) => entry.id),
          ),
        ),
      )
      .orderBy(asc(schema.paymentVerificationEvents.createdAt));
    const latest = new Map<string, (typeof events)[number]>();
    for (const event of events) latest.set(event.paymentEntryId, event);
    for (const entry of entries) {
      if (latest.get(entry.id)?.toStatus !== 'VERIFIED') continue;
      const amount = entry.kind === 'REVERSAL' ? -entry.amountMinor : entry.amountMinor;
      balances.set(entry.bookingId, (balances.get(entry.bookingId) ?? 0) + amount);
    }
    return balances;
  }

  private async lock(tx: Tx, table: PgTable, cid: string, id: string) {
    await tx.execute(
      sql`select id from ${table} where client_organization_id = ${cid} and id = ${id} for update`,
    );
  }

  private async record(
    tx: Tx,
    context: AuthorizationContext,
    cid: string,
    action: string,
    entityType: string,
    entityId: string,
    correlationId: string,
    summary: Record<string, unknown>,
    oldSummary: Record<string, unknown> | null = null,
    reason?: string,
  ) {
    await tx.insert(schema.outboxEvents).values({
      aggregateId: entityId,
      aggregateType: entityType,
      clientOrganizationId: cid,
      correlationId,
      eventType: action,
      payload: summary,
      scope: 'CLIENT',
    });
    await tx.insert(schema.auditEvents).values({
      action,
      actorId: context.userId,
      actorType: 'USER',
      clientOrganizationId: cid,
      correlationId,
      effectiveRole: context.roleCode,
      entityId,
      entityType,
      newSummary: summary,
      oldSummary,
      outcome: 'SUCCESS',
      reason,
      scope: 'CLIENT',
    });
  }
}
