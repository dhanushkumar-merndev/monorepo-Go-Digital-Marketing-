/* Registration, RC document, and canonical customer-vehicle authority. */
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
  AllotRegistrationNumberRequest,
  AssignRegistrationCaseRequest,
  CloseRegistrationCaseRequest,
  CompleteRcUploadRequest,
  CorrectRegistrationCaseRequest,
  CreateDealershipCustomerVehicleRequest,
  CreateExternalCustomerVehicleRequest,
  CustomerVehicleListQuery,
  InitiateRcUploadRequest,
  MarkRcPendingRequest,
  RegistrationListQuery,
  RegistrationStatus,
  ReopenRegistrationCaseRequest,
  ReviewRcDocumentRequest,
  ShareRcRequest,
  StartRegistrationRequest,
  SubmitRtoRequest,
  UpdateCustomerVehicleCoverageRequest,
  UpdateRegistrationSettingsRequest,
} from '@gdm/contracts';
import { schema, type DatabaseConnection } from '@gdm/database';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { AuthorizationPolicy } from '../authorization/authorization-policy.js';
import type { AuthorizationContext } from '../authorization/authorization.types.js';
import { DATABASE_CONNECTION } from '../infrastructure/database/database.tokens.js';
import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from '../infrastructure/storage/object-storage.port.js';
import { RC_DOCUMENT_SCANNER, type RcDocumentScanner } from './rc-document-scanner.port.js';

type Tx = Parameters<Parameters<DatabaseConnection['db']['transaction']>[0]>[0];
type Case = typeof schema.registrationCases.$inferSelect;
type Vehicle = typeof schema.customerVehicles.$inferSelect;

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

const bad = (code: string, message: string): BadRequestException =>
  new BadRequestException({ code, details: [], message, retryable: false });
const conflict = (code: string, message: string): ConflictException =>
  new ConflictException({ code, details: [], message, retryable: false });
const missing = (message: string): NotFoundException =>
  new NotFoundException({ code: 'NOT_FOUND', details: [], message, retryable: false });

function key(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized || normalized.length > 128)
    throw bad('VALIDATION_ERROR', 'A valid Idempotency-Key header is required.');
  return normalized;
}

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, entry]) => [name, normalized(entry)]),
    );
  return value;
}

function fingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(normalized(value)), 'utf8')
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

@Injectable()
export class RegistrationService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly connection: DatabaseConnection,
    @Inject(AuthorizationPolicy) private readonly policy: AuthorizationPolicy,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(RC_DOCUMENT_SCANNER) private readonly scanner: RcDocumentScanner,
  ) {}

  async list(context: AuthorizationContext, query: RegistrationListQuery) {
    const cid = clientId(context);
    const filters = [eq(schema.registrationCases.clientOrganizationId, cid)];
    if (query.assigned_to_me)
      filters.push(eq(schema.registrationCases.assignedMembershipId, context.membershipId));
    if (query.branch_id) filters.push(eq(schema.registrationCases.branchId, query.branch_id));
    if (query.status) filters.push(eq(schema.registrationCases.status, query.status));
    const settings = await this.settings(this.connection.db, cid);
    const rows = await this.caseRows(and(...filters), query.limit);
    const cases = rows
      .filter((row) => this.canAccess(context, row.registrationCase))
      .map((row) => this.presentCase(row, settings.slaHours));
    return { cases: query.overdue_only ? cases.filter((entry) => entry.aging.overdue) : cases };
  }

  async aging(context: AuthorizationContext) {
    const result = await this.list(context, {
      assigned_to_me: false,
      limit: 200,
      overdue_only: false,
    });
    const active = result.cases.filter((entry) => entry.status !== 'CASE_CLOSED');
    const byStatus = Object.fromEntries(
      [...new Set(active.map((entry) => entry.status))].map((status) => [
        status,
        active.filter((entry) => entry.status === status).length,
      ]),
    );
    return {
      active_count: active.length,
      by_status: byStatus,
      overdue: active.filter((entry) => entry.aging.overdue),
      overdue_count: active.filter((entry) => entry.aging.overdue).length,
    };
  }

  async detail(context: AuthorizationContext, caseId: string) {
    const registrationCase = await this.accessibleCase(context, caseId);
    const cid = clientId(context);
    const [row] = await this.caseRows(
      and(
        eq(schema.registrationCases.clientOrganizationId, cid),
        eq(schema.registrationCases.id, caseId),
      ),
      1,
    );
    if (!row) throw missing('Registration case not found.');
    const [events, documents, deliveries, settings] = await Promise.all([
      this.connection.db
        .select({ actorName: schema.users.displayName, event: schema.registrationEvents })
        .from(schema.registrationEvents)
        .innerJoin(
          schema.memberships,
          eq(schema.memberships.id, schema.registrationEvents.actorMembershipId),
        )
        .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
        .where(
          and(
            eq(schema.registrationEvents.clientOrganizationId, cid),
            eq(schema.registrationEvents.registrationCaseId, caseId),
          ),
        )
        .orderBy(asc(schema.registrationEvents.createdAt), asc(schema.registrationEvents.id)),
      this.connection.db
        .select({
          createdAt: schema.rcDocuments.createdAt,
          fileName: schema.rcDocuments.fileName,
          id: schema.rcDocuments.id,
          reviewedAt: schema.rcDocuments.reviewedAt,
          reviewReason: schema.rcDocuments.reviewReason,
          scannerStatus: schema.rcDocuments.scannerStatus,
          status: schema.rcDocuments.status,
          uploadedAt: schema.rcDocuments.uploadedAt,
        })
        .from(schema.rcDocuments)
        .where(
          and(
            eq(schema.rcDocuments.clientOrganizationId, cid),
            eq(schema.rcDocuments.registrationCaseId, caseId),
          ),
        )
        .orderBy(desc(schema.rcDocuments.createdAt)),
      this.connection.db
        .select()
        .from(schema.rcDeliveryRecords)
        .where(
          and(
            eq(schema.rcDeliveryRecords.clientOrganizationId, cid),
            eq(schema.rcDeliveryRecords.registrationCaseId, caseId),
          ),
        )
        .orderBy(desc(schema.rcDeliveryRecords.deliveredAt)),
      this.settings(this.connection.db, cid),
    ]);
    const [delivery] = await this.connection.db
      .select({
        deliveredAt: schema.deliveryJobs.deliveredAt,
        id: schema.deliveryJobs.id,
        status: schema.deliveryJobs.status,
      })
      .from(schema.deliveryJobs)
      .where(
        and(
          eq(schema.deliveryJobs.clientOrganizationId, cid),
          eq(schema.deliveryJobs.bookingId, registrationCase.bookingId),
        ),
      )
      .limit(1);
    return {
      case: this.presentCase(row, settings.slaHours),
      delivery: delivery
        ? {
            delivered_at: delivery.deliveredAt?.toISOString() ?? null,
            id: delivery.id,
            status: delivery.status,
          }
        : null,
      documents: documents.map((document) => ({
        created_at: document.createdAt.toISOString(),
        file_name: document.fileName,
        id: document.id,
        review_reason: document.reviewReason,
        reviewed_at: document.reviewedAt?.toISOString() ?? null,
        scanner_status: document.scannerStatus,
        status: document.status,
        uploaded_at: document.uploadedAt?.toISOString() ?? null,
      })),
      events: events.map(({ actorName, event }) => ({
        actor_name: actorName,
        corrects_event_id: event.correctsEventId,
        created_at: event.createdAt.toISOString(),
        event_type: event.eventType,
        evidence: event.evidence,
        from_status: event.fromStatus,
        id: event.id,
        reason: event.reason,
        to_status: event.toStatus,
      })),
      rc_delivery_records: deliveries.map((deliveryRecord) => ({
        delivered_at: deliveryRecord.deliveredAt.toISOString(),
        delivery_mode: deliveryRecord.deliveryMode,
        id: deliveryRecord.id,
        rc_document_id: deliveryRecord.rcDocumentId,
        recipient: deliveryRecord.recipient,
      })),
    };
  }

  async executives(
    context: AuthorizationContext,
    branchId: string,
    tx: Tx | DatabaseConnection['db'] = this.connection.db,
  ) {
    const cid = clientId(context);
    if (!this.policy.canAccessBranch(context, branchId))
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        details: [],
        message: 'Branch access is denied.',
        retryable: false,
      });
    const rows = await tx
      .select({
        branchScopeMode: schema.memberships.branchScopeMode,
        displayName: schema.users.displayName,
        membershipId: schema.memberships.id,
        scopedBranchId: schema.membershipBranchScopes.branchId,
        userId: schema.users.id,
      })
      .from(schema.memberships)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .leftJoin(
        schema.membershipBranchScopes,
        and(
          eq(schema.membershipBranchScopes.clientOrganizationId, cid),
          eq(schema.membershipBranchScopes.membershipId, schema.memberships.id),
          eq(schema.membershipBranchScopes.branchId, branchId),
        ),
      )
      .where(
        and(
          eq(schema.memberships.clientOrganizationId, cid),
          eq(schema.memberships.status, 'ACTIVE'),
          eq(schema.roles.code, 'RC_REGISTRATION_EXECUTIVE'),
          eq(schema.users.status, 'ACTIVE'),
        ),
      );
    return {
      executives: rows
        .filter((row) => row.branchScopeMode === 'ALL' || row.scopedBranchId === branchId)
        .map((row) => ({
          display_name: row.displayName,
          membership_id: row.membershipId,
          user_id: row.userId,
        })),
    };
  }

  async getSettings(context: AuthorizationContext) {
    return this.presentSettings(await this.settings(this.connection.db, clientId(context)));
  }

  updateSettings(
    context: AuthorizationContext,
    input: UpdateRegistrationSettingsRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    return this.command(context, 'SETTINGS_UPDATE', input, idempotencyKey, async (tx, cid) => {
      const current = await this.settings(tx, cid);
      if (current.version !== input.expected_version)
        throw conflict(
          'CONCURRENT_UPDATE',
          'Registration settings changed; refresh before retrying.',
        );
      const [updated] = await tx
        .update(schema.registrationSettings)
        .set({
          slaHours: input.sla_hours,
          updatedAt: new Date(),
          updatedByMembershipId: context.membershipId,
          version: current.version + 1,
        })
        .where(
          and(
            eq(schema.registrationSettings.clientOrganizationId, cid),
            eq(schema.registrationSettings.version, current.version),
          ),
        )
        .returning();
      if (!updated)
        throw conflict('CONCURRENT_UPDATE', 'Registration settings changed concurrently.');
      const response = this.presentSettings(updated);
      await this.record(
        tx,
        context,
        cid,
        'REGISTRATION_SETTINGS_UPDATED',
        cid,
        correlationId,
        response,
        input.reason,
        'REGISTRATION_SETTINGS',
      );
      return response;
    });
  }

  create(
    context: AuthorizationContext,
    input: {
      assigned_membership_id: string | null;
      booking_id: string;
      expected_completion_at: string | null;
    },
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    return this.command(context, 'CASE_CREATE', input, idempotencyKey, async (tx, cid) => {
      const [booking] = await tx
        .select()
        .from(schema.bookings)
        .where(
          and(
            eq(schema.bookings.clientOrganizationId, cid),
            eq(schema.bookings.id, input.booking_id),
          ),
        )
        .limit(1);
      if (!booking || !this.policy.canAccessBranch(context, booking.branchId))
        throw missing('Eligible booking not found.');
      if (booking.status !== 'CONFIRMED' || !booking.selectedInventoryUnitId)
        throw conflict(
          'REGISTRATION_BOOKING_NOT_READY',
          'Registration requires a confirmed booking with an allocated vehicle.',
        );
      let assignee: { membership_id: string; user_id: string } | null = null;
      if (input.assigned_membership_id)
        assignee = await this.eligibleExecutive(
          context,
          booking.branchId,
          input.assigned_membership_id,
          tx,
        );
      const [created] = await tx
        .insert(schema.registrationCases)
        .values({
          assignedMembershipId: assignee?.membership_id ?? null,
          assignedUserId: assignee?.user_id ?? null,
          bookingId: booking.id,
          branchId: booking.branchId,
          clientOrganizationId: cid,
          contactId: booking.contactId,
          createdByMembershipId: context.membershipId,
          expectedCompletionAt: input.expected_completion_at
            ? new Date(input.expected_completion_at)
            : null,
          inventoryUnitId: booking.selectedInventoryUnitId,
        })
        .returning();
      if (!created) throw new Error('Registration case insert returned no row.');
      await this.appendTransition(
        tx,
        context,
        created,
        null,
        'DOCUMENTS_READY',
        'REGISTRATION_CASE_CREATED',
        correlationId,
        { booking_id: booking.id },
      );
      return this.caseCommandResponse(created);
    });
  }

  assign(
    context: AuthorizationContext,
    caseId: string,
    input: AssignRegistrationCaseRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'CASE_ASSIGN',
      { caseId, ...input },
      idempotencyKey,
      async (tx, cid) => {
        const current = await this.lockCase(tx, context, cid, caseId);
        this.assertVersion(current, input.expected_version);
        const assignee = await this.eligibleExecutive(
          context,
          current.branchId,
          input.assigned_membership_id,
          tx,
        );
        const updated = await this.updateCase(tx, current, current.status, {
          assignedMembershipId: assignee.membership_id,
          assignedUserId: assignee.user_id,
        });
        await this.appendTransition(
          tx,
          context,
          updated,
          current.status,
          current.status,
          'REGISTRATION_CASE_ASSIGNED',
          correlationId,
          { assigned_membership_id: assignee.membership_id },
          input.reason,
        );
        return this.caseCommandResponse(updated);
      },
    );
  }

  start(
    context: AuthorizationContext,
    caseId: string,
    input: StartRegistrationRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    return this.transition(
      context,
      caseId,
      input,
      idempotencyKey,
      correlationId,
      'REGISTRATION_START',
      ['DOCUMENTS_READY', 'REOPENED'],
      'REGISTRATION_STARTED',
      { applicationStartedAt: new Date(input.application_started_at) },
      { document_checklist_confirmed: true },
    );
  }

  submitRto(
    context: AuthorizationContext,
    caseId: string,
    input: SubmitRtoRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    return this.transition(
      context,
      caseId,
      input,
      idempotencyKey,
      correlationId,
      'RTO_SUBMITTED',
      ['REGISTRATION_STARTED'],
      'RTO_SUBMITTED',
      {
        applicationNumber: input.application_number,
        expectedCompletionAt: new Date(input.expected_completion_at),
        rtoCode: input.rto_code,
        rtoName: input.rto_name,
        rtoSubmittedAt: new Date(input.submitted_at),
      },
      { application_number: input.application_number, rto_code: input.rto_code },
    );
  }

  allotNumber(
    context: AuthorizationContext,
    caseId: string,
    input: AllotRegistrationNumberRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'REGISTRATION_NUMBER_ALLOTTED',
      { caseId, ...input },
      idempotencyKey,
      async (tx, cid) => {
        const current = await this.lockCase(tx, context, cid, caseId);
        this.assertExecutor(context, current);
        this.assertVersion(current, input.expected_version);
        this.assertStatus(current, ['RTO_SUBMITTED']);
        const permanent = input.permanent_registration_number?.toUpperCase() ?? null;
        const temporary = input.temporary_registration_number?.toUpperCase() ?? null;
        const updated = await this.updateCase(tx, current, 'NUMBER_ALLOTTED', {
          numberAllottedAt: new Date(input.allotted_at),
          permanentRegistrationNumber: permanent,
          temporaryRegistrationNumber: temporary,
        });
        const [vehicle] = await tx
          .select()
          .from(schema.customerVehicles)
          .where(
            and(
              eq(schema.customerVehicles.clientOrganizationId, cid),
              eq(schema.customerVehicles.bookingId, current.bookingId),
            ),
          )
          .limit(1);
        if (vehicle) {
          const [updatedVehicle] = await tx
            .update(schema.customerVehicles)
            .set({
              registrationCaseId: current.id,
              registrationNumber: permanent ?? temporary,
              updatedAt: new Date(),
              version: vehicle.version + 1,
            })
            .where(
              and(
                eq(schema.customerVehicles.id, vehicle.id),
                eq(schema.customerVehicles.version, vehicle.version),
              ),
            )
            .returning();
          if (!updatedVehicle)
            throw conflict('CONCURRENT_UPDATE', 'The customer vehicle changed concurrently.');
          await this.vehicleEvent(
            tx,
            context,
            updatedVehicle,
            'CUSTOMER_VEHICLE_REGISTRATION_UPDATED',
            correlationId,
            { registration_number: permanent ?? temporary },
          );
        }
        await this.appendTransition(
          tx,
          context,
          updated,
          current.status,
          'NUMBER_ALLOTTED',
          'REGISTRATION_NUMBER_ALLOTTED',
          correlationId,
          {
            evidence_reference: input.evidence_reference,
            permanent_registration_number: permanent,
            temporary_registration_number: temporary,
          },
        );
        return this.caseCommandResponse(updated);
      },
    );
  }

  markPending(
    context: AuthorizationContext,
    caseId: string,
    input: MarkRcPendingRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    return this.transition(
      context,
      caseId,
      input,
      idempotencyKey,
      correlationId,
      'RC_MARKED_PENDING',
      ['RTO_SUBMITTED', 'NUMBER_ALLOTTED'],
      'RC_PENDING',
      { expectedCompletionAt: new Date(input.expected_completion_at), pendingReason: input.reason },
      {},
      input.reason,
    );
  }

  async initiateRcUpload(
    context: AuthorizationContext,
    caseId: string,
    input: InitiateRcUploadRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    const result = await this.command(
      context,
      'RC_UPLOAD_INITIATE',
      { caseId, ...input },
      idempotencyKey,
      async (tx, cid) => {
        const current = await this.lockCase(tx, context, cid, caseId);
        this.assertExecutor(context, current);
        this.assertStatus(current, ['NUMBER_ALLOTTED', 'RC_PENDING', 'RC_RECEIVED']);
        const documentId = randomUUID();
        const storageKey = `clients/${cid}/registration/${current.id}/rc/${documentId}`;
        await tx.insert(schema.rcDocuments).values({
          checksumSha256: input.checksum_sha256,
          clientOrganizationId: cid,
          contentLength: input.content_length,
          contentType: input.content_type,
          fileName: input.file_name,
          id: documentId,
          registrationCaseId: caseId,
          status: 'PENDING_UPLOAD',
          storageKey,
          uploadedByMembershipId: context.membershipId,
        });
        await this.record(tx, context, cid, 'RC_UPLOAD_INITIATED', caseId, correlationId, {
          document_id: documentId,
        });
        return { document_id: documentId, storage_key: storageKey };
      },
    );
    const upload = await this.storage.createUploadUrl({
      checksumSha256: input.checksum_sha256,
      contentLength: input.content_length,
      contentType: input.content_type,
      key: result.storage_key,
    });
    return {
      document_id: result.document_id,
      expires_at: upload.expiresAt,
      method: upload.method,
      upload_url: upload.url,
    };
  }

  async completeRcUpload(
    context: AuthorizationContext,
    caseId: string,
    input: CompleteRcUploadRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    const cid = clientId(context);
    const [document] = await this.connection.db
      .select()
      .from(schema.rcDocuments)
      .where(
        and(
          eq(schema.rcDocuments.clientOrganizationId, cid),
          eq(schema.rcDocuments.registrationCaseId, caseId),
          eq(schema.rcDocuments.id, input.document_id),
        ),
      )
      .limit(1);
    if (!document) throw missing('RC document not found.');
    await this.accessibleCase(context, caseId);
    const metadata = await this.storage.stat(document.storageKey);
    if (
      !metadata ||
      metadata.contentLength !== document.contentLength ||
      metadata.contentType !== document.contentType ||
      metadata.checksumSha256 !== input.checksum_sha256 ||
      input.checksum_sha256 !== document.checksumSha256
    )
      throw bad(
        'UPLOAD_METADATA_MISMATCH',
        'Uploaded RC document metadata does not match initiation.',
      );
    const scan = await this.scanner.scan({
      contentType: document.contentType,
      objectKey: document.storageKey,
    });
    return this.command(
      context,
      'RC_UPLOAD_COMPLETE',
      { caseId, ...input },
      idempotencyKey,
      async (tx, transactionCid) => {
        const current = await this.lockCase(tx, context, transactionCid, caseId);
        this.assertExecutor(context, current);
        this.assertVersion(current, input.expected_version);
        this.assertStatus(current, ['NUMBER_ALLOTTED', 'RC_PENDING', 'RC_RECEIVED']);
        if (document.status !== 'PENDING_UPLOAD')
          throw conflict(
            'RC_UPLOAD_ALREADY_COMPLETED',
            'This RC upload has already been completed.',
          );
        const documentStatus = scan.status === 'REJECTED' ? 'REJECTED' : 'PENDING_SCAN';
        await tx
          .update(schema.rcDocuments)
          .set({ scannerStatus: scan.status, status: documentStatus, uploadedAt: new Date() })
          .where(eq(schema.rcDocuments.id, document.id));
        const updated = await this.updateCase(tx, current, 'RC_RECEIVED', {
          rcReceivedAt: new Date(input.received_at),
        });
        await this.appendTransition(
          tx,
          context,
          updated,
          current.status,
          'RC_RECEIVED',
          'RC_RECEIVED',
          correlationId,
          {
            document_id: document.id,
            document_status: documentStatus,
            scanner_status: scan.status,
          },
          scan.reason,
        );
        return {
          document_id: document.id,
          document_status: documentStatus,
          ...this.caseCommandResponse(updated),
        };
      },
    );
  }

  reviewDocument(
    context: AuthorizationContext,
    documentId: string,
    input: ReviewRcDocumentRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'RC_DOCUMENT_REVIEW',
      { documentId, ...input },
      idempotencyKey,
      async (tx, cid) => {
        const [document] = await tx
          .select()
          .from(schema.rcDocuments)
          .where(
            and(
              eq(schema.rcDocuments.clientOrganizationId, cid),
              eq(schema.rcDocuments.id, documentId),
            ),
          )
          .limit(1);
        if (!document) throw missing('RC document not found.');
        await this.lockCase(tx, context, cid, document.registrationCaseId);
        if (input.decision === 'VERIFIED' && document.scannerStatus !== 'CLEAN')
          throw conflict('RC_SCAN_REQUIRED', 'Only a clean scanned RC document can be verified.');
        if (!['PENDING_SCAN', 'REJECTED'].includes(document.status))
          throw conflict('RC_REVIEW_INVALID', 'This RC document is not awaiting review.');
        await tx
          .update(schema.rcDocuments)
          .set({
            reviewReason: input.reason,
            reviewedAt: new Date(),
            reviewedByMembershipId: context.membershipId,
            status: input.decision,
          })
          .where(eq(schema.rcDocuments.id, document.id));
        await this.record(
          tx,
          context,
          cid,
          `RC_DOCUMENT_${input.decision}`,
          document.registrationCaseId,
          correlationId,
          { document_id: document.id },
          input.reason,
        );
        return { document_id: document.id, status: input.decision };
      },
    );
  }

  async downloadDocument(
    context: AuthorizationContext,
    documentId: string,
    purpose: string,
    correlationId: string,
  ) {
    const cid = clientId(context);
    const [document] = await this.connection.db
      .select()
      .from(schema.rcDocuments)
      .where(
        and(
          eq(schema.rcDocuments.clientOrganizationId, cid),
          eq(schema.rcDocuments.id, documentId),
          eq(schema.rcDocuments.status, 'VERIFIED'),
        ),
      )
      .limit(1);
    if (!document || document.scannerStatus !== 'CLEAN')
      throw missing('Verified clean RC document not found.');
    await this.accessibleCase(context, document.registrationCaseId);
    const download = await this.storage.createDownloadUrl({
      downloadFileName: document.fileName,
      key: document.storageKey,
      expiresInSeconds: 300,
    });
    await this.connection.db.transaction((tx) =>
      this.record(
        tx,
        context,
        cid,
        'RC_DOCUMENT_DOWNLOADED',
        document.registrationCaseId,
        correlationId,
        { document_id: document.id, purpose },
      ),
    );
    return { expires_at: download.expiresAt, url: download.url };
  }

  async share(
    context: AuthorizationContext,
    caseId: string,
    input: ShareRcRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    const result = await this.command(
      context,
      'RC_SHARE',
      { caseId, ...input },
      idempotencyKey,
      async (tx, cid) => {
        const current = await this.lockCase(tx, context, cid, caseId);
        this.assertExecutor(context, current);
        this.assertVersion(current, input.expected_version);
        this.assertStatus(current, ['RC_RECEIVED']);
        const [document] = await tx
          .select()
          .from(schema.rcDocuments)
          .where(
            and(
              eq(schema.rcDocuments.clientOrganizationId, cid),
              eq(schema.rcDocuments.registrationCaseId, caseId),
              eq(schema.rcDocuments.status, 'VERIFIED'),
            ),
          )
          .orderBy(desc(schema.rcDocuments.reviewedAt))
          .limit(1);
        if (!document)
          throw conflict(
            'VERIFIED_RC_REQUIRED',
            'A verified RC document is required before sharing or collection.',
          );
        const now = new Date();
        const digital = ['WHATSAPP', 'EMAIL', 'SMS'].includes(input.delivery_mode);
        const linkExpiresAt = digital ? new Date(now.getTime() + 5 * 60_000) : null;
        const [deliveryRecord] = await tx
          .insert(schema.rcDeliveryRecords)
          .values({
            clientOrganizationId: cid,
            correlationId,
            deliveredAt: now,
            deliveredByMembershipId: context.membershipId,
            deliveryMode: input.delivery_mode,
            linkExpiresAt,
            purpose: input.purpose,
            rcDocumentId: document.id,
            recipient: input.recipient,
            registrationCaseId: caseId,
          })
          .returning();
        const updated = await this.updateCase(tx, current, 'RC_SHARED_COLLECTED', {
          sharedOrCollectedAt: now,
        });
        await this.appendTransition(
          tx,
          context,
          updated,
          current.status,
          'RC_SHARED_COLLECTED',
          'RC_SHARED',
          correlationId,
          {
            delivery_mode: input.delivery_mode,
            delivery_record_id: deliveryRecord?.id,
            document_id: document.id,
            recipient: input.recipient,
          },
        );
        return {
          delivery_mode: input.delivery_mode,
          delivery_record_id: deliveryRecord?.id ?? '',
          document_id: document.id,
          file_name: document.fileName,
          storage_key: document.storageKey,
          ...this.caseCommandResponse(updated),
        };
      },
    );
    if (!['WHATSAPP', 'EMAIL', 'SMS'].includes(result.delivery_mode)) {
      const { storage_key: _storageKey, file_name: _fileName, ...response } = result;
      return { ...response, download: null };
    }
    const download = await this.storage.createDownloadUrl({
      downloadFileName: result.file_name,
      expiresInSeconds: 300,
      key: result.storage_key,
    });
    const { storage_key: _storageKey, file_name: _fileName, ...response } = result;
    return { ...response, download: { expires_at: download.expiresAt, url: download.url } };
  }

  close(
    context: AuthorizationContext,
    caseId: string,
    input: CloseRegistrationCaseRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'CASE_CLOSE',
      { caseId, ...input },
      idempotencyKey,
      async (tx, cid) => {
        const current = await this.lockCase(tx, context, cid, caseId);
        this.assertVersion(current, input.expected_version);
        this.assertStatus(current, ['RC_SHARED_COLLECTED']);
        if (
          !current.applicationNumber ||
          !current.rtoCode ||
          !current.rtoSubmittedAt ||
          !current.permanentRegistrationNumber ||
          !current.rcReceivedAt ||
          !current.sharedOrCollectedAt
        )
          throw conflict(
            'REGISTRATION_CLOSURE_INCOMPLETE',
            'Application, RTO submission, permanent number, RC receipt and delivery evidence are mandatory for closure.',
          );
        const [verified] = await tx
          .select({ id: schema.rcDocuments.id })
          .from(schema.rcDocuments)
          .where(
            and(
              eq(schema.rcDocuments.clientOrganizationId, cid),
              eq(schema.rcDocuments.registrationCaseId, caseId),
              eq(schema.rcDocuments.status, 'VERIFIED'),
            ),
          )
          .limit(1);
        if (!verified)
          throw conflict(
            'REGISTRATION_CLOSURE_INCOMPLETE',
            'A verified RC copy is mandatory for closure.',
          );
        const updated = await this.updateCase(tx, current, 'CASE_CLOSED', { closedAt: new Date() });
        await this.appendTransition(
          tx,
          context,
          updated,
          current.status,
          'CASE_CLOSED',
          'REGISTRATION_CASE_CLOSED',
          correlationId,
          { document_id: verified.id },
        );
        return this.caseCommandResponse(updated);
      },
    );
  }

  reopen(
    context: AuthorizationContext,
    caseId: string,
    input: ReopenRegistrationCaseRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'CASE_REOPEN',
      { caseId, ...input },
      idempotencyKey,
      async (tx, cid) => {
        const current = await this.lockCase(tx, context, cid, caseId);
        this.assertVersion(current, input.expected_version);
        this.assertStatus(current, ['CASE_CLOSED']);
        const updated = await this.updateCase(tx, current, 'REOPENED', { reopenedAt: new Date() });
        await this.appendTransition(
          tx,
          context,
          updated,
          current.status,
          'REOPENED',
          'REGISTRATION_CASE_REOPENED',
          correlationId,
          { next_action: input.next_action },
          input.reason,
        );
        return this.caseCommandResponse(updated);
      },
    );
  }

  correct(
    context: AuthorizationContext,
    caseId: string,
    input: CorrectRegistrationCaseRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'CASE_CORRECTION',
      { caseId, ...input },
      idempotencyKey,
      async (tx, cid) => {
        const current = await this.lockCase(tx, context, cid, caseId);
        this.assertVersion(current, input.expected_version);
        const [target] = await tx
          .select()
          .from(schema.registrationEvents)
          .where(
            and(
              eq(schema.registrationEvents.clientOrganizationId, cid),
              eq(schema.registrationEvents.registrationCaseId, caseId),
              eq(schema.registrationEvents.id, input.corrected_event_id),
            ),
          )
          .limit(1);
        if (!target) throw missing('The registration event being corrected was not found.');
        const values: Partial<typeof schema.registrationCases.$inferInsert> = {};
        if ('application_number' in input) values.applicationNumber = input.application_number;
        if ('expected_completion_at' in input)
          values.expectedCompletionAt = input.expected_completion_at
            ? new Date(input.expected_completion_at)
            : null;
        if ('permanent_registration_number' in input)
          values.permanentRegistrationNumber =
            input.permanent_registration_number?.toUpperCase() ?? null;
        if ('temporary_registration_number' in input)
          values.temporaryRegistrationNumber =
            input.temporary_registration_number?.toUpperCase() ?? null;
        if ('rto_code' in input) values.rtoCode = input.rto_code;
        if ('rto_name' in input) values.rtoName = input.rto_name;
        if (Object.keys(values).length === 0)
          throw bad('VALIDATION_ERROR', 'At least one corrected field is required.');
        const updated = await this.updateCase(tx, current, current.status, values, false);
        await tx.insert(schema.registrationEvents).values({
          actorMembershipId: context.membershipId,
          clientOrganizationId: cid,
          correlationId,
          correctsEventId: target.id,
          eventType: 'REGISTRATION_CORRECTION_RECORDED',
          evidence: values,
          fromStatus: current.status,
          reason: input.reason,
          registrationCaseId: caseId,
          toStatus: current.status,
        });
        await this.record(
          tx,
          context,
          cid,
          'REGISTRATION_CORRECTION_RECORDED',
          caseId,
          correlationId,
          { corrected_event_id: target.id, fields: Object.keys(values), version: updated.version },
          input.reason,
        );
        return this.caseCommandResponse(updated);
      },
    );
  }

  async listVehicles(context: AuthorizationContext, query: CustomerVehicleListQuery) {
    const cid = clientId(context);
    const filters = [eq(schema.customerVehicles.clientOrganizationId, cid)];
    if (query.branch_id) filters.push(eq(schema.customerVehicles.branchId, query.branch_id));
    if (query.contact_id) filters.push(eq(schema.customerVehicles.contactId, query.contact_id));
    if (query.ownership_source)
      filters.push(eq(schema.customerVehicles.ownershipSource, query.ownership_source));
    const rows = await this.connection.db
      .select({ contact: schema.contacts, vehicle: schema.customerVehicles })
      .from(schema.customerVehicles)
      .innerJoin(
        schema.contacts,
        and(
          eq(schema.contacts.clientOrganizationId, cid),
          eq(schema.contacts.id, schema.customerVehicles.contactId),
        ),
      )
      .where(and(...filters))
      .orderBy(desc(schema.customerVehicles.createdAt))
      .limit(query.limit);
    return {
      vehicles: rows
        .filter((row) => this.canAccessVehicle(context, row.vehicle))
        .map((row) => this.presentVehicle(row.vehicle, row.contact.displayName)),
    };
  }

  async vehicleDetail(context: AuthorizationContext, vehicleId: string) {
    const vehicle = await this.accessibleVehicle(context, vehicleId);
    const [contact, events] = await Promise.all([
      this.connection.db
        .select()
        .from(schema.contacts)
        .where(
          and(
            eq(schema.contacts.clientOrganizationId, vehicle.clientOrganizationId),
            eq(schema.contacts.id, vehicle.contactId),
          ),
        )
        .limit(1),
      this.connection.db
        .select()
        .from(schema.customerVehicleEvents)
        .where(
          and(
            eq(schema.customerVehicleEvents.clientOrganizationId, vehicle.clientOrganizationId),
            eq(schema.customerVehicleEvents.customerVehicleId, vehicle.id),
          ),
        )
        .orderBy(asc(schema.customerVehicleEvents.createdAt)),
    ]);
    return {
      events: events.map((event) => ({
        created_at: event.createdAt.toISOString(),
        event_type: event.eventType,
        evidence: event.evidence,
        id: event.id,
        reason: event.reason,
      })),
      vehicle: this.presentVehicle(vehicle, contact[0]?.displayName ?? 'Unknown customer'),
    };
  }

  createDealershipVehicle(
    context: AuthorizationContext,
    input: CreateDealershipCustomerVehicleRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'DEALERSHIP_VEHICLE_CREATE',
      input,
      idempotencyKey,
      async (tx, cid) => {
        const [existing] = await tx
          .select()
          .from(schema.customerVehicles)
          .where(
            and(
              eq(schema.customerVehicles.clientOrganizationId, cid),
              eq(schema.customerVehicles.bookingId, input.booking_id),
            ),
          )
          .limit(1);
        if (existing) return this.presentVehicle(existing, null);
        const [source] = await tx
          .select({
            brandName: schema.inventoryBrands.name,
            booking: schema.bookings,
            delivery: schema.deliveryJobs,
            engineNumber: schema.inventoryUnits.engineNumber,
            modelName: schema.inventoryModels.name,
            registrationCase: schema.registrationCases,
            variantName: schema.inventoryVariants.name,
            vin: schema.inventoryUnits.vin,
          })
          .from(schema.bookings)
          .innerJoin(
            schema.deliveryJobs,
            and(
              eq(schema.deliveryJobs.clientOrganizationId, cid),
              eq(schema.deliveryJobs.bookingId, schema.bookings.id),
            ),
          )
          .innerJoin(
            schema.inventoryUnits,
            eq(schema.inventoryUnits.id, schema.deliveryJobs.inventoryUnitId),
          )
          .innerJoin(
            schema.inventoryVariants,
            eq(schema.inventoryVariants.id, schema.inventoryUnits.variantId),
          )
          .innerJoin(
            schema.inventoryModels,
            eq(schema.inventoryModels.id, schema.inventoryVariants.modelId),
          )
          .innerJoin(
            schema.inventoryBrands,
            eq(schema.inventoryBrands.id, schema.inventoryModels.brandId),
          )
          .leftJoin(
            schema.registrationCases,
            and(
              eq(schema.registrationCases.clientOrganizationId, cid),
              eq(schema.registrationCases.bookingId, schema.bookings.id),
            ),
          )
          .where(
            and(
              eq(schema.bookings.clientOrganizationId, cid),
              eq(schema.bookings.id, input.booking_id),
            ),
          )
          .limit(1);
        if (!source || !this.policy.canAccessBranch(context, source.booking.branchId))
          throw missing('Delivered booking not found.');
        if (source.delivery.status !== 'DELIVERED' || !source.delivery.deliveredAt)
          throw conflict(
            'DELIVERY_REQUIRED',
            'A dealership-sale customer vehicle can only be created after delivery.',
          );
        const registrationNumber =
          source.registrationCase?.permanentRegistrationNumber ??
          source.registrationCase?.temporaryRegistrationNumber ??
          null;
        if (!source.vin && !registrationNumber)
          throw conflict(
            'VEHICLE_IDENTITY_REQUIRED',
            'A VIN or registration number is required to create the customer vehicle.',
          );
        const [created] = await tx
          .insert(schema.customerVehicles)
          .values({
            bookingId: source.booking.id,
            branchId: source.booking.branchId,
            brandName: source.brandName,
            clientOrganizationId: cid,
            contactId: source.booking.contactId,
            createdByMembershipId: context.membershipId,
            deliveryDate: source.delivery.deliveredAt.toISOString().slice(0, 10),
            deliveryJobId: source.delivery.id,
            engineNumber: source.engineNumber,
            inventoryUnitId: source.delivery.inventoryUnitId,
            modelName: source.modelName,
            ownershipSource: 'DEALERSHIP_SALE',
            registrationCaseId: source.registrationCase?.id ?? null,
            registrationNumber,
            variantName: source.variantName,
            vin: source.vin,
          })
          .returning();
        if (!created) throw new Error('Customer vehicle insert returned no row.');
        await this.vehicleEvent(tx, context, created, 'CUSTOMER_VEHICLE_CREATED', correlationId, {
          booking_id: source.booking.id,
          ownership_source: 'DEALERSHIP_SALE',
        });
        return this.presentVehicle(created, null);
      },
    );
  }

  createExternalVehicle(
    context: AuthorizationContext,
    input: CreateExternalCustomerVehicleRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'EXTERNAL_VEHICLE_CREATE',
      input,
      idempotencyKey,
      async (tx, cid) => {
        if (!this.policy.canAccessBranch(context, input.branch_id))
          throw missing('Eligible branch not found.');
        const [contact] = await tx
          .select()
          .from(schema.contacts)
          .where(
            and(
              eq(schema.contacts.clientOrganizationId, cid),
              eq(schema.contacts.id, input.contact_id),
            ),
          )
          .limit(1);
        if (!contact) throw missing('Canonical customer contact not found.');
        if (!input.vin && !input.registration_number)
          throw bad('VEHICLE_IDENTITY_REQUIRED', 'A VIN or registration number is required.');
        const [created] = await tx
          .insert(schema.customerVehicles)
          .values({
            amcExpiresOn: input.amc_expires_on,
            branchId: input.branch_id,
            brandName: input.brand_name,
            clientOrganizationId: cid,
            contactId: input.contact_id,
            createdByMembershipId: context.membershipId,
            engineNumber: input.engine_number,
            insuranceExpiresOn: input.insurance_expires_on,
            insurancePolicyNumber: input.insurance_policy_number,
            modelName: input.model_name,
            ownershipSource: 'EXTERNAL',
            purchaseDate: input.purchase_date,
            registrationNumber: input.registration_number?.toUpperCase() ?? null,
            rsaExpiresOn: input.rsa_expires_on,
            variantName: input.variant_name,
            vin: input.vin?.toUpperCase() ?? null,
            warrantyExpiresOn: input.warranty_expires_on,
          })
          .returning();
        if (!created) throw new Error('External customer vehicle insert returned no row.');
        await this.vehicleEvent(
          tx,
          context,
          created,
          'EXTERNAL_CUSTOMER_VEHICLE_CREATED',
          correlationId,
          { ownership_source: 'EXTERNAL' },
        );
        return this.presentVehicle(created, contact.displayName);
      },
    );
  }

  updateVehicleCoverage(
    context: AuthorizationContext,
    vehicleId: string,
    input: UpdateCustomerVehicleCoverageRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'VEHICLE_COVERAGE_UPDATE',
      { vehicleId, ...input },
      idempotencyKey,
      async (tx, cid) => {
        await tx.execute(
          sql`select id from customer_vehicles where client_organization_id = ${cid} and id = ${vehicleId} for update`,
        );
        const [vehicle] = await tx
          .select()
          .from(schema.customerVehicles)
          .where(
            and(
              eq(schema.customerVehicles.clientOrganizationId, cid),
              eq(schema.customerVehicles.id, vehicleId),
            ),
          )
          .limit(1);
        if (!vehicle || !this.canAccessVehicle(context, vehicle))
          throw missing('Customer vehicle not found.');
        if (vehicle.version !== input.expected_version)
          throw conflict(
            'CONCURRENT_UPDATE',
            'The customer vehicle changed; refresh before retrying.',
          );
        const [updated] = await tx
          .update(schema.customerVehicles)
          .set({
            amcExpiresOn: input.amc_expires_on,
            insuranceExpiresOn: input.insurance_expires_on,
            insurancePolicyNumber: input.insurance_policy_number,
            rsaExpiresOn: input.rsa_expires_on,
            updatedAt: new Date(),
            version: vehicle.version + 1,
            warrantyExpiresOn: input.warranty_expires_on,
          })
          .where(
            and(
              eq(schema.customerVehicles.id, vehicle.id),
              eq(schema.customerVehicles.version, vehicle.version),
            ),
          )
          .returning();
        if (!updated)
          throw conflict('CONCURRENT_UPDATE', 'The customer vehicle changed concurrently.');
        await this.vehicleEvent(
          tx,
          context,
          updated,
          'CUSTOMER_VEHICLE_COVERAGE_UPDATED',
          correlationId,
          {
            amc_expires_on: input.amc_expires_on,
            insurance_expires_on: input.insurance_expires_on,
            rsa_expires_on: input.rsa_expires_on,
            warranty_expires_on: input.warranty_expires_on,
          },
          input.reason,
        );
        return this.presentVehicle(updated, null);
      },
    );
  }

  private transition<T extends { expected_version: number }>(
    context: AuthorizationContext,
    caseId: string,
    input: T,
    idempotencyKey: string | undefined,
    correlationId: string,
    eventType: string,
    allowed: RegistrationStatus[],
    target: RegistrationStatus,
    values: Partial<typeof schema.registrationCases.$inferInsert>,
    evidence: Record<string, unknown>,
    reason?: string,
  ) {
    return this.command(
      context,
      eventType,
      { caseId, ...input },
      idempotencyKey,
      async (tx, cid) => {
        const current = await this.lockCase(tx, context, cid, caseId);
        this.assertExecutor(context, current);
        this.assertVersion(current, input.expected_version);
        this.assertStatus(current, allowed);
        const updated = await this.updateCase(tx, current, target, values);
        await this.appendTransition(
          tx,
          context,
          updated,
          current.status,
          target,
          eventType,
          correlationId,
          evidence,
          reason,
        );
        return this.caseCommandResponse(updated);
      },
    );
  }

  private async command<T extends Record<string, unknown>>(
    context: AuthorizationContext,
    commandType: string,
    input: unknown,
    suppliedKey: string | undefined,
    operation: (tx: Tx, cid: string) => Promise<T>,
  ): Promise<T> {
    const cid = clientId(context);
    const idempotencyKey = key(suppliedKey);
    const requestFingerprint = fingerprint({ commandType, input });
    try {
      return await this.connection.db.transaction(async (tx) => {
        const inserted = await tx
          .insert(schema.registrationCommandReceipts)
          .values({
            actorMembershipId: context.membershipId,
            clientOrganizationId: cid,
            commandType,
            idempotencyKey,
            requestFingerprint,
            responseSnapshot: {},
          })
          .onConflictDoNothing()
          .returning({ id: schema.registrationCommandReceipts.id });
        if (inserted.length === 0) {
          const [receipt] = await tx
            .select()
            .from(schema.registrationCommandReceipts)
            .where(
              and(
                eq(schema.registrationCommandReceipts.clientOrganizationId, cid),
                eq(schema.registrationCommandReceipts.idempotencyKey, idempotencyKey),
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
              'This idempotency key was used for another registration command.',
            );
          return receipt.responseSnapshot as T;
        }
        const response = await operation(tx, cid);
        const receiptId = inserted[0]?.id;
        if (!receiptId) throw new Error('Registration receipt insert returned no ID.');
        await tx
          .update(schema.registrationCommandReceipts)
          .set({ responseSnapshot: response })
          .where(eq(schema.registrationCommandReceipts.id, receiptId));
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
          'REGISTRATION_CONFLICT',
          'The case or customer vehicle already exists, or its identity is duplicated.',
        );
      throw error;
    }
  }

  private async lockCase(
    tx: Tx,
    context: AuthorizationContext,
    cid: string,
    caseId: string,
  ): Promise<Case> {
    await tx.execute(
      sql`select id from registration_cases where client_organization_id = ${cid} and id = ${caseId} for update`,
    );
    const [registrationCase] = await tx
      .select()
      .from(schema.registrationCases)
      .where(
        and(
          eq(schema.registrationCases.clientOrganizationId, cid),
          eq(schema.registrationCases.id, caseId),
        ),
      )
      .limit(1);
    if (!registrationCase || !this.canAccess(context, registrationCase))
      throw missing('Registration case not found.');
    return registrationCase;
  }

  private async accessibleCase(context: AuthorizationContext, caseId: string): Promise<Case> {
    const cid = clientId(context);
    const [registrationCase] = await this.connection.db
      .select()
      .from(schema.registrationCases)
      .where(
        and(
          eq(schema.registrationCases.clientOrganizationId, cid),
          eq(schema.registrationCases.id, caseId),
        ),
      )
      .limit(1);
    if (!registrationCase || !this.canAccess(context, registrationCase))
      throw missing('Registration case not found.');
    return registrationCase;
  }

  private canAccess(context: AuthorizationContext, registrationCase: Case): boolean {
    return this.policy.canAccessResource(context, {
      assigneeId: registrationCase.assignedUserId,
      branchId: registrationCase.branchId,
      clientOrganizationId: registrationCase.clientOrganizationId,
    });
  }

  private assertExecutor(context: AuthorizationContext, registrationCase: Case): void {
    if (
      context.roleCode === 'RC_REGISTRATION_EXECUTIVE' &&
      (registrationCase.assignedMembershipId !== context.membershipId ||
        registrationCase.assignedUserId !== context.userId)
    )
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        details: [],
        message: 'Only the assigned RC Registration Executive can perform this action.',
        retryable: false,
      });
  }

  private assertVersion(registrationCase: Case, expected: number): void {
    if (registrationCase.version !== expected)
      throw conflict(
        'CONCURRENT_UPDATE',
        'The registration case changed; refresh before retrying.',
      );
  }

  private assertStatus(registrationCase: Case, allowed: RegistrationStatus[]): void {
    if (!allowed.includes(registrationCase.status))
      throw conflict(
        'INVALID_REGISTRATION_TRANSITION',
        `Registration status ${registrationCase.status} is not valid for this action.`,
      );
  }

  private async updateCase(
    tx: Tx,
    current: Case,
    status: RegistrationStatus,
    values: Partial<typeof schema.registrationCases.$inferInsert>,
    changeStatusAt = true,
  ): Promise<Case> {
    const [updated] = await tx
      .update(schema.registrationCases)
      .set({
        ...values,
        status,
        ...(changeStatusAt && status !== current.status ? { statusChangedAt: new Date() } : {}),
        updatedAt: new Date(),
        version: current.version + 1,
      })
      .where(
        and(
          eq(schema.registrationCases.clientOrganizationId, current.clientOrganizationId),
          eq(schema.registrationCases.id, current.id),
          eq(schema.registrationCases.version, current.version),
        ),
      )
      .returning();
    if (!updated)
      throw conflict('CONCURRENT_UPDATE', 'The registration case changed concurrently.');
    return updated;
  }

  private async appendTransition(
    tx: Tx,
    context: AuthorizationContext,
    registrationCase: Case,
    fromStatus: RegistrationStatus | null,
    toStatus: RegistrationStatus,
    eventType: string,
    correlationId: string,
    evidence: Record<string, unknown>,
    reason?: string,
  ) {
    await tx.insert(schema.registrationEvents).values({
      actorMembershipId: context.membershipId,
      clientOrganizationId: registrationCase.clientOrganizationId,
      correlationId,
      eventType,
      evidence,
      fromStatus,
      reason,
      registrationCaseId: registrationCase.id,
      toStatus,
    });
    await this.record(
      tx,
      context,
      registrationCase.clientOrganizationId,
      eventType,
      registrationCase.id,
      correlationId,
      { ...evidence, from_status: fromStatus, status: toStatus, version: registrationCase.version },
      reason,
    );
  }

  private async record(
    tx: Tx,
    context: AuthorizationContext,
    cid: string,
    action: string,
    entityId: string,
    correlationId: string,
    summary: Record<string, unknown>,
    reason?: string,
    entityType = 'REGISTRATION_CASE',
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
      outcome: 'SUCCESS',
      reason,
      scope: 'CLIENT',
    });
  }

  private async vehicleEvent(
    tx: Tx,
    context: AuthorizationContext,
    vehicle: Vehicle,
    eventType: string,
    correlationId: string,
    evidence: Record<string, unknown>,
    reason?: string,
  ) {
    await tx.insert(schema.customerVehicleEvents).values({
      actorMembershipId: context.membershipId,
      clientOrganizationId: vehicle.clientOrganizationId,
      correlationId,
      customerVehicleId: vehicle.id,
      eventType,
      evidence,
      reason,
    });
    await this.record(
      tx,
      context,
      vehicle.clientOrganizationId,
      eventType,
      vehicle.id,
      correlationId,
      evidence,
      reason,
      'CUSTOMER_VEHICLE',
    );
  }

  private async settings(tx: Tx | DatabaseConnection['db'], cid: string) {
    await tx
      .insert(schema.registrationSettings)
      .values({ clientOrganizationId: cid })
      .onConflictDoNothing();
    const [settings] = await tx
      .select()
      .from(schema.registrationSettings)
      .where(eq(schema.registrationSettings.clientOrganizationId, cid))
      .limit(1);
    if (!settings) throw new Error('Registration settings could not be resolved.');
    return settings;
  }

  private presentSettings(settings: typeof schema.registrationSettings.$inferSelect) {
    return {
      sla_hours: settings.slaHours,
      updated_at: settings.updatedAt.toISOString(),
      version: settings.version,
    };
  }

  private async caseRows(condition: ReturnType<typeof and>, limit: number) {
    return this.connection.db
      .select({
        assignedName: schema.users.displayName,
        bookingReference: schema.bookings.bookingReference,
        brandName: schema.inventoryBrands.name,
        contact: schema.contacts,
        modelName: schema.inventoryModels.name,
        registrationCase: schema.registrationCases,
        unitReference: schema.inventoryUnits.unitReference,
        variantName: schema.inventoryVariants.name,
      })
      .from(schema.registrationCases)
      .innerJoin(
        schema.bookings,
        and(
          eq(schema.bookings.clientOrganizationId, schema.registrationCases.clientOrganizationId),
          eq(schema.bookings.id, schema.registrationCases.bookingId),
        ),
      )
      .innerJoin(
        schema.contacts,
        and(
          eq(schema.contacts.clientOrganizationId, schema.registrationCases.clientOrganizationId),
          eq(schema.contacts.id, schema.registrationCases.contactId),
        ),
      )
      .innerJoin(
        schema.inventoryUnits,
        and(
          eq(
            schema.inventoryUnits.clientOrganizationId,
            schema.registrationCases.clientOrganizationId,
          ),
          eq(schema.inventoryUnits.id, schema.registrationCases.inventoryUnitId),
        ),
      )
      .innerJoin(
        schema.inventoryVariants,
        eq(schema.inventoryVariants.id, schema.inventoryUnits.variantId),
      )
      .innerJoin(
        schema.inventoryModels,
        eq(schema.inventoryModels.id, schema.inventoryVariants.modelId),
      )
      .innerJoin(
        schema.inventoryBrands,
        eq(schema.inventoryBrands.id, schema.inventoryModels.brandId),
      )
      .leftJoin(schema.users, eq(schema.users.id, schema.registrationCases.assignedUserId))
      .where(condition)
      .orderBy(asc(schema.registrationCases.statusChangedAt), asc(schema.registrationCases.id))
      .limit(limit);
  }

  private presentCase(
    row: Awaited<ReturnType<RegistrationService['caseRows']>>[number],
    slaHours: Record<string, number>,
  ) {
    const registrationCase = row.registrationCase;
    const hours = slaHours[registrationCase.status] ?? 0;
    const ageHours = Math.max(
      0,
      (Date.now() - registrationCase.statusChangedAt.getTime()) / 3_600_000,
    );
    const expectedOverdue = registrationCase.expectedCompletionAt
      ? registrationCase.expectedCompletionAt.getTime() < Date.now()
      : false;
    return {
      aging: {
        age_hours: Math.floor(ageHours * 10) / 10,
        overdue:
          registrationCase.status !== 'CASE_CLOSED' &&
          (expectedOverdue || (hours > 0 && ageHours > hours)),
        sla_hours: hours,
      },
      application_number: registrationCase.applicationNumber,
      assigned_membership_id: registrationCase.assignedMembershipId,
      assigned_name: row.assignedName,
      booking_id: registrationCase.bookingId,
      booking_reference: row.bookingReference,
      branch_id: registrationCase.branchId,
      contact_id: registrationCase.contactId,
      customer_name: row.contact.displayName,
      expected_completion_at: registrationCase.expectedCompletionAt?.toISOString() ?? null,
      id: registrationCase.id,
      inventory_unit_id: registrationCase.inventoryUnitId,
      permanent_registration_number: registrationCase.permanentRegistrationNumber,
      phone_e164: row.contact.primaryPhoneE164,
      rto_code: registrationCase.rtoCode,
      rto_name: registrationCase.rtoName,
      status: registrationCase.status,
      status_changed_at: registrationCase.statusChangedAt.toISOString(),
      temporary_registration_number: registrationCase.temporaryRegistrationNumber,
      vehicle_label: `${row.brandName} ${row.modelName} ${row.variantName} · ${row.unitReference}`,
      version: registrationCase.version,
    };
  }

  private caseCommandResponse(registrationCase: Case) {
    return {
      id: registrationCase.id,
      status: registrationCase.status,
      version: registrationCase.version,
    };
  }

  private async eligibleExecutive(
    context: AuthorizationContext,
    branchId: string,
    membershipId: string,
    tx: Tx | DatabaseConnection['db'] = this.connection.db,
  ) {
    const executive = (await this.executives(context, branchId, tx)).executives.find(
      (entry) => entry.membership_id === membershipId,
    );
    if (!executive)
      throw bad(
        'VALIDATION_ERROR',
        'The selected RC Registration Executive is not eligible for this branch.',
      );
    return executive;
  }

  private canAccessVehicle(context: AuthorizationContext, vehicle: Vehicle): boolean {
    return this.policy.canAccessResource(context, {
      branchId: vehicle.branchId,
      clientOrganizationId: vehicle.clientOrganizationId,
    });
  }

  private async accessibleVehicle(
    context: AuthorizationContext,
    vehicleId: string,
  ): Promise<Vehicle> {
    const cid = clientId(context);
    const [vehicle] = await this.connection.db
      .select()
      .from(schema.customerVehicles)
      .where(
        and(
          eq(schema.customerVehicles.clientOrganizationId, cid),
          eq(schema.customerVehicles.id, vehicleId),
        ),
      )
      .limit(1);
    if (!vehicle || !this.canAccessVehicle(context, vehicle))
      throw missing('Customer vehicle not found.');
    return vehicle;
  }

  private presentVehicle(vehicle: Vehicle, customerName: string | null) {
    return {
      amc_expires_on: vehicle.amcExpiresOn,
      booking_id: vehicle.bookingId,
      branch_id: vehicle.branchId,
      brand_name: vehicle.brandName,
      contact_id: vehicle.contactId,
      customer_name: customerName,
      delivery_date: vehicle.deliveryDate,
      delivery_job_id: vehicle.deliveryJobId,
      engine_number: vehicle.engineNumber,
      id: vehicle.id,
      insurance_expires_on: vehicle.insuranceExpiresOn,
      insurance_policy_number: vehicle.insurancePolicyNumber,
      model_name: vehicle.modelName,
      ownership_source: vehicle.ownershipSource,
      purchase_date: vehicle.purchaseDate,
      registration_case_id: vehicle.registrationCaseId,
      registration_number: vehicle.registrationNumber,
      rsa_expires_on: vehicle.rsaExpiresOn,
      variant_name: vehicle.variantName,
      version: vehicle.version,
      vin: vehicle.vin,
      warranty_expires_on: vehicle.warrantyExpiresOn,
    };
  }
}
