/* Test-ride workflow and location authority live only in this backend service. */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { createHash, createHmac } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AssignTestRideRequest,
  BookTestRideRequest,
  CompleteTestRideRequest,
  ConfirmTestRideRequest,
  CreateTestRideRequest,
  EndTestRideRequest,
  RecordTestRideLocationsRequest,
  StartTestRideRequest,
  StopTestRideTrackingRequest,
  TestRideListQuery,
  TestRideStatus,
} from '@gdm/contracts';
import { schema, type DatabaseConnection } from '@gdm/database';
import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import { AuthorizationPolicy } from '../authorization/authorization-policy.js';
import {
  authorizationScopeCondition,
  pageMetadata,
  pageOffset,
} from '../authorization/authorization-scope.sql.js';
import type { AuthorizationContext } from '../authorization/authorization.types.js';
import { DATABASE_CONNECTION } from '../infrastructure/database/database.tokens.js';
import {
  TEST_RIDES_RUNTIME_CONFIG,
  type TestRidesRuntimeConfig,
} from './test-rides-runtime-config.js';

type Job = typeof schema.testRideJobs.$inferSelect;
type Lead = typeof schema.leadOpportunities.$inferSelect;
type Tx = Parameters<Parameters<DatabaseConnection['db']['transaction']>[0]>[0];

interface ScopedJob {
  departmentId: string | null;
  job: Job;
  lead: Lead;
}

function clientId(context: AuthorizationContext): string {
  if (!context.clientOrganizationId) {
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      details: [],
      message: 'An active client context is required.',
      retryable: false,
    });
  }
  return context.clientOrganizationId;
}

function conflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, details: [], message, retryable: false });
}

function badRequest(code: string, message: string): BadRequestException {
  return new BadRequestException({ code, details: [], message, retryable: false });
}

function forbidden(message: string): ForbiddenException {
  return new ForbiddenException({
    code: 'FORBIDDEN',
    details: [],
    message,
    retryable: false,
  });
}

function notFound(message: string): NotFoundException {
  return new NotFoundException({ code: 'NOT_FOUND', details: [], message, retryable: false });
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

function fingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)), 'utf8')
    .digest('hex');
}

function requiredIdempotencyKey(key: string | undefined): string {
  const normalized = key?.trim();
  if (!normalized || normalized.length > 128)
    throw badRequest('VALIDATION_ERROR', 'A valid Idempotency-Key header is required.');
  return normalized;
}

function checklistComplete(checklist: Record<string, boolean | undefined>): boolean {
  return Object.values(checklist).every((value) => value === true);
}

@Injectable()
export class TestRidesService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly connection: DatabaseConnection,
    @Inject(AuthorizationPolicy) private readonly policy: AuthorizationPolicy,
    @Inject(TEST_RIDES_RUNTIME_CONFIG) private readonly config: TestRidesRuntimeConfig,
  ) {}

  async list(context: AuthorizationContext, query: TestRideListQuery) {
    const cid = clientId(context);
    await this.expireTracking(cid, new Date(), `test-ride-list-${context.sessionId}`);
    const conditions: SQL[] = [
      eq(schema.testRideJobs.clientOrganizationId, cid),
      authorizationScopeCondition(context, {
        assignee: schema.testRideJobs.executiveUserId,
        branch: schema.testRideJobs.branchId,
        department: schema.teams.departmentId,
        owner: schema.leadOpportunities.relationshipOwnerId,
        team: schema.testRideJobs.teamId,
      }),
    ];
    if (query.status) conditions.push(eq(schema.testRideJobs.status, query.status));
    if (query.assigned_to_me)
      conditions.push(eq(schema.testRideJobs.executiveMembershipId, context.membershipId));
    if (query.date) {
      conditions.push(
        sql`(${schema.testRideJobs.scheduledStartAt} at time zone ${schema.branches.timezone})::date = ${query.date}::date`,
      );
    }
    if (query.from_date)
      conditions.push(
        sql`(${schema.testRideJobs.scheduledStartAt} at time zone ${schema.branches.timezone})::date >= ${query.from_date}::date`,
      );
    const rows = await this.connection.db
      .select({
        contact: schema.contacts,
        departmentId: schema.teams.departmentId,
        executiveName: schema.users.displayName,
        job: schema.testRideJobs,
        lead: schema.leadOpportunities,
      })
      .from(schema.testRideJobs)
      .innerJoin(
        schema.leadOpportunities,
        and(
          eq(schema.leadOpportunities.clientOrganizationId, cid),
          eq(schema.leadOpportunities.id, schema.testRideJobs.leadId),
        ),
      )
      .innerJoin(
        schema.contacts,
        and(
          eq(schema.contacts.clientOrganizationId, cid),
          eq(schema.contacts.id, schema.testRideJobs.contactId),
        ),
      )
      .innerJoin(
        schema.branches,
        and(
          eq(schema.branches.clientOrganizationId, cid),
          eq(schema.branches.id, schema.testRideJobs.branchId),
        ),
      )
      .leftJoin(schema.teams, eq(schema.teams.id, schema.testRideJobs.teamId))
      .leftJoin(schema.users, eq(schema.users.id, schema.testRideJobs.executiveUserId))
      .where(and(...conditions))
      .orderBy(asc(schema.testRideJobs.scheduledStartAt), asc(schema.testRideJobs.id))
      .limit(query.limit + 1)
      .offset(pageOffset(query.page, query.limit));
    const accessible = rows.filter((row) =>
      this.canAccess(context, row.job, row.lead, row.departmentId),
    );
    const allowed = accessible.slice(0, query.limit);
    const locations = await this.latestLocations(
      cid,
      allowed.map((row) => row.job.id),
    );
    return {
      pagination: pageMetadata(query.page, query.limit, accessible.length),
      rides: allowed.map((row) =>
        this.presentSummary(row.job, row.contact, row.executiveName, locations.get(row.job.id)),
      ),
    };
  }

  async detail(context: AuthorizationContext, rideId: string) {
    const scoped = await this.accessibleJob(context, rideId);
    const cid = clientId(context);
    await this.expireTracking(cid, new Date(), `test-ride-detail-${context.sessionId}`);
    const [contact] = await this.connection.db
      .select()
      .from(schema.contacts)
      .where(
        and(
          eq(schema.contacts.clientOrganizationId, cid),
          eq(schema.contacts.id, scoped.job.contactId),
        ),
      )
      .limit(1);
    if (!contact) throw notFound('Test ride not found.');
    const [executive] = scoped.job.executiveUserId
      ? await this.connection.db
          .select({ name: schema.users.displayName })
          .from(schema.users)
          .where(eq(schema.users.id, scoped.job.executiveUserId))
          .limit(1)
      : [];
    const events = await this.connection.db
      .select({ event: schema.testRideEvents, actorName: schema.users.displayName })
      .from(schema.testRideEvents)
      .leftJoin(schema.users, eq(schema.users.id, schema.testRideEvents.actorUserId))
      .where(
        and(
          eq(schema.testRideEvents.clientOrganizationId, cid),
          eq(schema.testRideEvents.testRideJobId, rideId),
        ),
      )
      .orderBy(asc(schema.testRideEvents.createdAt), asc(schema.testRideEvents.id));
    const locations = await this.latestLocations(cid, [rideId]);
    const refreshed = await this.jobById(cid, rideId);
    if (!refreshed) throw notFound('Test ride not found.');
    return {
      events: events.map(({ actorName, event }) => ({
        actor_name: actorName,
        created_at: event.createdAt.toISOString(),
        event_type: event.eventType,
        from_status: event.fromStatus,
        id: event.id,
        reason: event.reason,
        to_status: event.toStatus,
      })),
      ride: {
        ...this.presentSummary(refreshed, contact, executive?.name ?? null, locations.get(rideId)),
        cancellation_reason: refreshed.cancellationReason,
        completion_evidence: refreshed.completionEvidence,
        confirmed_at: refreshed.confirmedAt?.toISOString() ?? null,
        end_odometer_km: refreshed.endOdometerKm,
        feedback: refreshed.feedback,
        no_show_reason: refreshed.noShowReason,
        notes: refreshed.notes,
        otp_required: refreshed.otpRequired,
        start_odometer_km: refreshed.startOdometerKm,
        tracking_expires_at: refreshed.trackingExpiresAt?.toISOString() ?? null,
      },
    };
  }

  async create(
    context: AuthorizationContext,
    input: CreateTestRideRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    const cid = clientId(context);
    const idempotencyKey = requiredIdempotencyKey(key);
    const lead = await this.accessibleLead(context, input.lead_id);
    if (lead.lead.branchId !== input.branch_id)
      throw badRequest('VALIDATION_ERROR', 'The ride branch must match the canonical Lead branch.');
    const otpHash = input.otp_code ? this.otpHash(cid, input.otp_code) : null;
    const [inventoryFlag] = await this.connection.db
      .select({ enabled: schema.clientModuleFlags.enabled })
      .from(schema.clientModuleFlags)
      .where(
        and(
          eq(schema.clientModuleFlags.clientOrganizationId, cid),
          eq(schema.clientModuleFlags.module, 'INVENTORY'),
        ),
      )
      .limit(1);
    const [canonicalDemoUnit] = await this.connection.db
      .select({ id: schema.inventoryUnits.id, status: schema.inventoryUnits.status })
      .from(schema.inventoryUnits)
      .where(
        and(
          eq(schema.inventoryUnits.clientOrganizationId, cid),
          eq(schema.inventoryUnits.branchId, input.branch_id),
          eq(schema.inventoryUnits.unitReference, input.demo_vehicle_reference),
        ),
      )
      .limit(1);
    if (inventoryFlag?.enabled && (!canonicalDemoUnit || canonicalDemoUnit.status !== 'DEMO'))
      throw conflict(
        'DEMO_VEHICLE_UNAVAILABLE',
        'An enabled inventory tenant must schedule an authorized canonical demo unit.',
      );
    const job = await this.connection.db.transaction(async (tx) => {
      const requestFingerprint = fingerprint(input);
      const claimed = await tx
        .insert(schema.testRideCommandReceipts)
        .values({
          clientOrganizationId: cid,
          commandType: 'CREATE',
          idempotencyKey,
          requestFingerprint,
          responseSnapshot: {},
          testRideJobId: null,
        })
        .onConflictDoNothing()
        .returning({ id: schema.testRideCommandReceipts.id });
      if (claimed.length === 0) {
        const [receipt] = await tx
          .select()
          .from(schema.testRideCommandReceipts)
          .where(
            and(
              eq(schema.testRideCommandReceipts.clientOrganizationId, cid),
              eq(schema.testRideCommandReceipts.idempotencyKey, idempotencyKey),
            ),
          )
          .limit(1);
        if (
          !receipt ||
          receipt.commandType !== 'CREATE' ||
          receipt.requestFingerprint !== requestFingerprint ||
          !receipt.testRideJobId
        )
          throw conflict(
            'IDEMPOTENCY_MISMATCH',
            'This idempotency key was used for another command.',
          );
        return receipt.responseSnapshot as {
          id: string;
          status: TestRideStatus;
          version: number;
        };
      }
      const [inserted] = await tx
        .insert(schema.testRideJobs)
        .values({
          branchId: input.branch_id,
          clientOrganizationId: cid,
          contactId: lead.lead.contactId,
          createdBy: context.userId,
          customerLocation: input.customer_location,
          demoVehicleReference: input.demo_vehicle_reference,
          inventoryUnitId: canonicalDemoUnit?.id ?? null,
          leadId: input.lead_id,
          notes: input.notes,
          otpHash,
          otpRequired: otpHash !== null,
          scheduledEndAt: new Date(input.scheduled_end_at),
          scheduledStartAt: new Date(input.scheduled_start_at),
          teamId: lead.teamId,
          vehicleModel: input.vehicle_model,
        })
        .returning();
      if (!inserted) throw new Error('Test ride insert did not return a row.');
      await this.appendTransition(
        tx,
        context,
        inserted,
        null,
        'REQUESTED',
        'RIDE_REQUESTED',
        correlationId,
        {
          customer_location: input.customer_location,
          vehicle_model: input.vehicle_model,
        },
      );
      const response = { id: inserted.id, status: inserted.status, version: inserted.version };
      const receiptId = claimed.at(0)?.id;
      if (!receiptId) throw new Error('Test-ride create receipt insert did not return an ID.');
      await tx
        .update(schema.testRideCommandReceipts)
        .set({ responseSnapshot: response, testRideJobId: inserted.id })
        .where(eq(schema.testRideCommandReceipts.id, receiptId));
      return response;
    });
    return job;
  }

  async book(
    context: AuthorizationContext,
    rideId: string,
    input: BookTestRideRequest,
    correlationId: string,
  ) {
    const scoped = await this.accessibleJob(context, rideId);
    this.assertVersionAndStatus(scoped.job, input.expected_version, ['REQUESTED']);
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      if (scoped.job.inventoryUnitId) {
        await tx.execute(sql`
          select ${schema.inventoryUnits.id}
          from ${schema.inventoryUnits}
          where ${schema.inventoryUnits.clientOrganizationId} = ${cid}
            and ${schema.inventoryUnits.id} = ${scoped.job.inventoryUnitId}
          for update
        `);
        const [canonicalDemo] = await tx
          .select({
            branchId: schema.inventoryUnits.branchId,
            status: schema.inventoryUnits.status,
          })
          .from(schema.inventoryUnits)
          .where(
            and(
              eq(schema.inventoryUnits.clientOrganizationId, cid),
              eq(schema.inventoryUnits.id, scoped.job.inventoryUnitId),
            ),
          )
          .limit(1);
        if (
          !canonicalDemo ||
          canonicalDemo.branchId !== scoped.job.branchId ||
          canonicalDemo.status !== 'DEMO'
        )
          throw conflict(
            'DEMO_VEHICLE_UNAVAILABLE',
            'The canonical demo unit is not available for test-ride booking.',
          );
      }
      await this.lockAllocation(
        tx,
        cid,
        scoped.job.branchId,
        'VEHICLE',
        scoped.job.demoVehicleReference,
      );
      const conflicting = await tx
        .select({ id: schema.demoVehicleBookings.id })
        .from(schema.demoVehicleBookings)
        .where(
          and(
            eq(schema.demoVehicleBookings.clientOrganizationId, cid),
            eq(schema.demoVehicleBookings.branchId, scoped.job.branchId),
            scoped.job.inventoryUnitId
              ? eq(schema.demoVehicleBookings.inventoryUnitId, scoped.job.inventoryUnitId)
              : eq(
                  schema.demoVehicleBookings.demoVehicleReference,
                  scoped.job.demoVehicleReference,
                ),
            eq(schema.demoVehicleBookings.status, 'HELD'),
            lt(schema.demoVehicleBookings.scheduledStartAt, scoped.job.scheduledEndAt),
            gt(schema.demoVehicleBookings.scheduledEndAt, scoped.job.scheduledStartAt),
          ),
        )
        .limit(1);
      if (conflicting.length > 0)
        throw conflict(
          'VEHICLE_SCHEDULE_CONFLICT',
          'The demo vehicle is already booked for this time.',
        );
      await tx.insert(schema.demoVehicleBookings).values({
        branchId: scoped.job.branchId,
        clientOrganizationId: cid,
        demoVehicleReference: scoped.job.demoVehicleReference,
        inventoryUnitId: scoped.job.inventoryUnitId,
        scheduledEndAt: scoped.job.scheduledEndAt,
        scheduledStartAt: scoped.job.scheduledStartAt,
        testRideJobId: rideId,
      });
      const updated = await this.updateStatus(tx, scoped.job, input.expected_version, 'BOOKED', {});
      await this.appendTransition(
        tx,
        context,
        updated,
        'REQUESTED',
        'BOOKED',
        'RIDE_BOOKED',
        correlationId,
        {
          demo_vehicle_reference: updated.demoVehicleReference,
        },
      );
      return { id: rideId, status: updated.status, version: updated.version };
    });
  }

  async confirm(
    context: AuthorizationContext,
    rideId: string,
    input: ConfirmTestRideRequest,
    correlationId: string,
  ) {
    const scoped = await this.accessibleJob(context, rideId);
    this.assertVersionAndStatus(scoped.job, input.expected_version, ['BOOKED']);
    return this.connection.db.transaction(async (tx) => {
      const updated = await this.updateStatus(
        tx,
        scoped.job,
        input.expected_version,
        'CUSTOMER_CONFIRMED',
        { confirmationChannel: input.channel, confirmedAt: new Date(input.confirmed_at) },
      );
      await this.appendTransition(
        tx,
        context,
        updated,
        'BOOKED',
        'CUSTOMER_CONFIRMED',
        'CUSTOMER_CONFIRMED',
        correlationId,
        { channel: input.channel, confirmed_at: input.confirmed_at },
      );
      return { id: rideId, status: updated.status, version: updated.version };
    });
  }

  async executives(context: AuthorizationContext, branchId: string) {
    const cid = clientId(context);
    if (!this.policy.canAccessBranch(context, branchId))
      throw forbidden('Branch access is denied.');
    const rows = await this.connection.db
      .select({
        branchScopeMode: schema.memberships.branchScopeMode,
        displayName: schema.users.displayName,
        membershipId: schema.memberships.id,
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
          eq(schema.roles.code, 'TEST_RIDE_EXECUTIVE'),
          eq(schema.users.status, 'ACTIVE'),
          or(
            eq(schema.memberships.branchScopeMode, 'ALL'),
            sql`${schema.membershipBranchScopes.branchId} is not null`,
          ),
        ),
      )
      .orderBy(asc(schema.users.displayName));
    return {
      executives: rows.map((row) => ({
        display_name: row.displayName,
        membership_id: row.membershipId,
        user_id: row.userId,
      })),
    };
  }

  async assign(
    context: AuthorizationContext,
    rideId: string,
    input: AssignTestRideRequest,
    correlationId: string,
  ) {
    const scoped = await this.accessibleJob(context, rideId);
    this.assertVersionAndStatus(scoped.job, input.expected_version, [
      'CUSTOMER_CONFIRMED',
      'EXECUTIVE_ASSIGNED',
    ]);
    const cid = clientId(context);
    const eligible = (await this.executives(context, scoped.job.branchId)).executives.find(
      (candidate) => candidate.membership_id === input.executive_membership_id,
    );
    if (!eligible)
      throw badRequest(
        'VALIDATION_ERROR',
        'The selected executive is not eligible for this branch.',
      );
    return this.connection.db.transaction(async (tx) => {
      await this.lockAllocation(
        tx,
        cid,
        scoped.job.branchId,
        'EXECUTIVE',
        input.executive_membership_id,
      );
      const overlap = await tx
        .select({ id: schema.testRideJobs.id })
        .from(schema.testRideJobs)
        .where(
          and(
            eq(schema.testRideJobs.clientOrganizationId, cid),
            eq(schema.testRideJobs.executiveMembershipId, input.executive_membership_id),
            inArray(schema.testRideJobs.status, ['EXECUTIVE_ASSIGNED', 'ACTIVE']),
            lt(schema.testRideJobs.scheduledStartAt, scoped.job.scheduledEndAt),
            gt(schema.testRideJobs.scheduledEndAt, scoped.job.scheduledStartAt),
            sql`${schema.testRideJobs.id} <> ${rideId}`,
          ),
        )
        .limit(1);
      if (overlap.length > 0)
        throw conflict(
          'EXECUTIVE_SCHEDULE_CONFLICT',
          'The executive already has an overlapping ride.',
        );
      const previous = scoped.job.status;
      const updated = await this.updateStatus(
        tx,
        scoped.job,
        input.expected_version,
        'EXECUTIVE_ASSIGNED',
        {
          assignedAt: new Date(),
          assignedBy: context.userId,
          executiveMembershipId: eligible.membership_id,
          executiveUserId: eligible.user_id,
        },
      );
      await this.appendTransition(
        tx,
        context,
        updated,
        previous,
        'EXECUTIVE_ASSIGNED',
        previous === 'EXECUTIVE_ASSIGNED' ? 'RIDE_REASSIGNED' : 'RIDE_ASSIGNED',
        correlationId,
        { executive_membership_id: eligible.membership_id },
        input.reason,
      );
      return { id: rideId, status: updated.status, version: updated.version };
    });
  }

  async start(
    context: AuthorizationContext,
    rideId: string,
    input: StartTestRideRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    const idempotencyKey = requiredIdempotencyKey(key);
    return this.idempotentCommand(
      context,
      rideId,
      'START',
      idempotencyKey,
      input,
      async (tx, job) => {
        this.assertAssignedExecutive(context, job);
        this.assertVersionAndStatus(job, input.expected_version, ['EXECUTIVE_ASSIGNED']);
        if (!checklistComplete(input.checklist))
          throw badRequest('CHECKLIST_REQUIRED', 'Every start checklist item must be confirmed.');
        if (
          job.otpRequired &&
          this.otpHash(clientId(context), input.otp_code ?? '') !== job.otpHash
        )
          throw badRequest('OTP_INVALID', 'The test-ride start OTP is invalid.');
        const activeOther = await tx
          .select({ id: schema.testRideJobs.id })
          .from(schema.testRideJobs)
          .where(
            and(
              eq(schema.testRideJobs.clientOrganizationId, clientId(context)),
              eq(schema.testRideJobs.executiveMembershipId, context.membershipId),
              eq(schema.testRideJobs.status, 'ACTIVE'),
            ),
          )
          .limit(1);
        if (activeOther.length > 0)
          throw conflict(
            'ACTIVE_RIDE_EXISTS',
            'Finish the currently active test ride before starting another.',
          );
        const now = new Date();
        const expiresAt = new Date(now.getTime() + this.config.activeTimeoutMinutes * 60_000);
        const updated = await this.updateStatus(tx, job, input.expected_version, 'ACTIVE', {
          startChecklist: input.checklist,
          startOdometerKm: input.odometer_km,
          startedAt: now,
          trackingExpiresAt: expiresAt,
          trackingStartedAt: now,
          trackingStoppedAt: null,
        });
        const [session] = await tx
          .insert(schema.testRideLocationSessions)
          .values({
            clientOrganizationId: clientId(context),
            executiveMembershipId: context.membershipId,
            executiveUserId: context.userId,
            expiresAt,
            startedAt: now,
            testRideJobId: rideId,
          })
          .returning();
        if (!session) throw new Error('Location session insert did not return a row.');
        await this.appendTransition(
          tx,
          context,
          updated,
          'EXECUTIVE_ASSIGNED',
          'ACTIVE',
          'RIDE_STARTED',
          correlationId,
          {
            disclosure_acknowledged: true,
            location_session_id: session.id,
            tracking_expires_at: expiresAt.toISOString(),
          },
        );
        return {
          id: rideId,
          location_session_id: session.id,
          status: updated.status,
          tracking_expires_at: expiresAt.toISOString(),
          version: updated.version,
        };
      },
    );
  }

  async locations(
    context: AuthorizationContext,
    rideId: string,
    input: RecordTestRideLocationsRequest,
    correlationId: string,
  ) {
    const scoped = await this.accessibleJob(context, rideId);
    this.assertAssignedExecutive(context, scoped.job);
    const now = new Date();
    if (scoped.job.status !== 'ACTIVE' || scoped.job.trackingStoppedAt)
      throw conflict(
        'LOCATION_NOT_ACTIVE',
        'Location is accepted only for an active, tracking ride.',
      );
    if (!scoped.job.trackingExpiresAt || scoped.job.trackingExpiresAt <= now) {
      await this.expireTracking(clientId(context), now, correlationId);
      throw conflict('LOCATION_NOT_ACTIVE', 'The location session has timed out.');
    }
    const [session] = await this.connection.db
      .select()
      .from(schema.testRideLocationSessions)
      .where(
        and(
          eq(schema.testRideLocationSessions.clientOrganizationId, clientId(context)),
          eq(schema.testRideLocationSessions.testRideJobId, rideId),
          eq(schema.testRideLocationSessions.executiveMembershipId, context.membershipId),
          isNull(schema.testRideLocationSessions.stoppedAt),
        ),
      )
      .limit(1);
    if (!session) throw conflict('LOCATION_NOT_ACTIVE', 'No active tracking session exists.');
    for (const sample of input.samples) {
      const capturedAt = new Date(sample.captured_at);
      if (
        capturedAt < session.startedAt ||
        capturedAt > session.expiresAt ||
        capturedAt > new Date(now.getTime() + 300_000)
      )
        throw badRequest(
          'INVALID_LOCATION_TIME',
          'A location sample falls outside the active tracking window.',
        );
    }
    const expiresAt = new Date(now.getTime() + this.config.locationRetentionDays * 86_400_000);
    const inserted = await this.connection.db
      .insert(schema.testRideLocationSamples)
      .values(
        input.samples.map((sample) => ({
          accuracyMeters: sample.accuracy_m,
          capturedAt: new Date(sample.captured_at),
          clientOrganizationId: clientId(context),
          executiveUserId: context.userId,
          expiresAt,
          idempotencyKey: sample.idempotency_key,
          latitude: sample.latitude,
          locationSessionId: session.id,
          longitude: sample.longitude,
          testRideJobId: rideId,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: schema.testRideLocationSamples.id });
    if (inserted.length > 0) {
      await this.connection.db.insert(schema.auditEvents).values({
        action: 'TEST_RIDE_LOCATION_BATCH_ACCEPTED',
        actorId: context.userId,
        actorType: 'USER',
        clientOrganizationId: clientId(context),
        correlationId,
        effectiveRole: context.roleCode,
        entityId: rideId,
        entityType: 'TEST_RIDE',
        newSummary: { accepted_samples: inserted.length },
        outcome: 'SUCCESS',
        scope: 'CLIENT',
      });
    }
    return { accepted: inserted.length, duplicates: input.samples.length - inserted.length };
  }

  async stopTracking(
    context: AuthorizationContext,
    rideId: string,
    input: StopTestRideTrackingRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    const idempotencyKey = requiredIdempotencyKey(key);
    return this.idempotentCommand(
      context,
      rideId,
      'STOP_TRACKING',
      idempotencyKey,
      input,
      async (tx, job) => {
        this.assertAssignedExecutive(context, job);
        this.assertVersionAndStatus(job, input.expected_version, ['ACTIVE']);
        if (job.trackingStoppedAt)
          throw conflict('LOCATION_NOT_ACTIVE', 'Tracking is already stopped for this ride.');
        const now = new Date();
        await this.stopSession(tx, clientId(context), rideId, now, input.reason);
        const updated = await this.updateSameStatus(tx, job, input.expected_version, {
          trackingStoppedAt: now,
        });
        await this.appendTransition(
          tx,
          context,
          updated,
          'ACTIVE',
          'ACTIVE',
          'TRACKING_STOPPED',
          correlationId,
          {
            reason: input.reason,
          },
        );
        return {
          id: rideId,
          status: updated.status,
          tracking_active: false,
          version: updated.version,
        };
      },
    );
  }

  async complete(
    context: AuthorizationContext,
    rideId: string,
    input: CompleteTestRideRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    const idempotencyKey = requiredIdempotencyKey(key);
    return this.idempotentCommand(
      context,
      rideId,
      'COMPLETE',
      idempotencyKey,
      input,
      async (tx, job) => {
        this.assertAssignedExecutive(context, job);
        this.assertVersionAndStatus(job, input.expected_version, ['ACTIVE']);
        if (!checklistComplete(input.checklist))
          throw badRequest('CHECKLIST_REQUIRED', 'Every completion checklist item is required.');
        if (job.startOdometerKm === null || input.end_odometer_km < job.startOdometerKm)
          throw badRequest(
            'ODOMETER_INVALID',
            'End kilometres cannot be below the recorded start.',
          );
        const now = new Date();
        await this.stopSession(tx, clientId(context), rideId, now, 'COMPLETED');
        const updated = await this.updateStatus(tx, job, input.expected_version, 'COMPLETED', {
          completedAt: now,
          completionChecklist: input.checklist,
          completionEvidence: input.completion_evidence,
          endOdometerKm: input.end_odometer_km,
          feedback: input.feedback,
          trackingStoppedAt: now,
        });
        await tx
          .update(schema.demoVehicleBookings)
          .set({ releasedAt: now, status: 'COMPLETED' })
          .where(
            and(
              eq(schema.demoVehicleBookings.clientOrganizationId, clientId(context)),
              eq(schema.demoVehicleBookings.testRideJobId, rideId),
              eq(schema.demoVehicleBookings.status, 'HELD'),
            ),
          );
        await this.appendTransition(
          tx,
          context,
          updated,
          'ACTIVE',
          'COMPLETED',
          'RIDE_COMPLETED',
          correlationId,
          {
            completion_evidence: input.completion_evidence,
            end_odometer_km: input.end_odometer_km,
          },
        );
        return { id: rideId, status: updated.status, version: updated.version };
      },
    );
  }

  async cancel(
    context: AuthorizationContext,
    rideId: string,
    input: EndTestRideRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    const idempotencyKey = requiredIdempotencyKey(key);
    return this.idempotentCommand(
      context,
      rideId,
      'CANCEL',
      idempotencyKey,
      input,
      async (tx, job) => {
        if (context.roleCode === 'TEST_RIDE_EXECUTIVE') this.assertAssignedExecutive(context, job);
        this.assertVersionAndStatus(job, input.expected_version, [
          'REQUESTED',
          'BOOKED',
          'CUSTOMER_CONFIRMED',
          'EXECUTIVE_ASSIGNED',
          'ACTIVE',
        ]);
        const now = new Date();
        await this.stopSession(tx, clientId(context), rideId, now, 'CANCELLED');
        const updated = await this.updateStatus(tx, job, input.expected_version, 'CANCELLED', {
          cancellationReason: `${input.reason}: ${input.note}`,
          cancelledAt: now,
          trackingStoppedAt: job.trackingStartedAt ? now : job.trackingStoppedAt,
        });
        await this.releaseBooking(tx, clientId(context), rideId, now);
        await this.appendTransition(
          tx,
          context,
          updated,
          job.status,
          'CANCELLED',
          'RIDE_CANCELLED',
          correlationId,
          {
            reason_code: input.reason,
          },
          input.note,
        );
        return { id: rideId, status: updated.status, version: updated.version };
      },
    );
  }

  async noShow(
    context: AuthorizationContext,
    rideId: string,
    input: EndTestRideRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    const idempotencyKey = requiredIdempotencyKey(key);
    return this.idempotentCommand(
      context,
      rideId,
      'NO_SHOW',
      idempotencyKey,
      input,
      async (tx, job) => {
        if (context.roleCode === 'TEST_RIDE_EXECUTIVE') this.assertAssignedExecutive(context, job);
        this.assertVersionAndStatus(job, input.expected_version, [
          'BOOKED',
          'CUSTOMER_CONFIRMED',
          'EXECUTIVE_ASSIGNED',
        ]);
        const now = new Date();
        const updated = await this.updateStatus(tx, job, input.expected_version, 'NO_SHOW', {
          noShowAt: now,
          noShowReason: `${input.reason}: ${input.note}`,
        });
        await this.releaseBooking(tx, clientId(context), rideId, now);
        await this.appendTransition(
          tx,
          context,
          updated,
          job.status,
          'NO_SHOW',
          'RIDE_NO_SHOW',
          correlationId,
          {
            reason_code: input.reason,
          },
          input.note,
        );
        return { id: rideId, status: updated.status, version: updated.version };
      },
    );
  }

  async reconcileTracking(context: AuthorizationContext, correlationId: string) {
    const cid = clientId(context);
    const now = new Date();
    const stopped = await this.expireTracking(cid, now, correlationId);
    const deletedLocations = await this.purgeExpiredLocations(cid, now, correlationId);
    return { deleted_locations: deletedLocations, stopped };
  }

  private async purgeExpiredLocations(
    cid: string,
    now: Date,
    correlationId: string,
  ): Promise<number> {
    const deleted = await this.connection.db
      .delete(schema.testRideLocationSamples)
      .where(
        and(
          eq(schema.testRideLocationSamples.clientOrganizationId, cid),
          lte(schema.testRideLocationSamples.expiresAt, now),
        ),
      )
      .returning({ id: schema.testRideLocationSamples.id });
    if (deleted.length > 0)
      await this.connection.db.insert(schema.auditEvents).values({
        action: 'TEST_RIDE_EXPIRED_LOCATIONS_PURGED',
        actorType: 'SYSTEM',
        clientOrganizationId: cid,
        correlationId,
        entityId: cid,
        entityType: 'TEST_RIDE_LOCATION_RETENTION',
        newSummary: { deleted_samples: deleted.length },
        outcome: 'SUCCESS',
        scope: 'CLIENT',
      });
    return deleted.length;
  }

  private async expireTracking(cid: string, now: Date, correlationId: string): Promise<number> {
    const expired = await this.connection.db
      .select()
      .from(schema.testRideJobs)
      .where(
        and(
          eq(schema.testRideJobs.clientOrganizationId, cid),
          eq(schema.testRideJobs.status, 'ACTIVE'),
          isNull(schema.testRideJobs.trackingStoppedAt),
          lte(schema.testRideJobs.trackingExpiresAt, now),
        ),
      );
    for (const job of expired) {
      await this.connection.db.transaction(async (tx) => {
        await this.stopSession(tx, cid, job.id, now, 'TIMEOUT');
        const updated = await this.updateSameStatus(tx, job, job.version, {
          trackingStoppedAt: now,
        });
        await tx.insert(schema.testRideEvents).values({
          clientOrganizationId: cid,
          eventType: 'TRACKING_TIMED_OUT',
          evidence: { tracking_expires_at: job.trackingExpiresAt?.toISOString() ?? null },
          fromStatus: 'ACTIVE',
          reason: 'Configured active tracking timeout reached.',
          testRideJobId: job.id,
          toStatus: 'ACTIVE',
        });
        await this.systemEvidence(
          tx,
          cid,
          updated.id,
          'TEST_RIDE_TRACKING_TIMED_OUT',
          correlationId,
          {
            tracking_stopped_at: now.toISOString(),
          },
        );
      });
    }
    return expired.length;
  }

  private async idempotentCommand<T extends Record<string, unknown>>(
    context: AuthorizationContext,
    rideId: string,
    commandType: string,
    idempotencyKey: string,
    request: unknown,
    operation: (tx: Tx, job: Job) => Promise<T>,
  ): Promise<T> {
    const cid = clientId(context);
    await this.accessibleJob(context, rideId);
    return this.connection.db.transaction(async (tx) => {
      const requestFingerprint = fingerprint(request);
      const inserted = await tx
        .insert(schema.testRideCommandReceipts)
        .values({
          clientOrganizationId: cid,
          commandType,
          idempotencyKey,
          requestFingerprint,
          responseSnapshot: {},
          testRideJobId: rideId,
        })
        .onConflictDoNothing()
        .returning({ id: schema.testRideCommandReceipts.id });
      if (inserted.length === 0) {
        const [receipt] = await tx
          .select()
          .from(schema.testRideCommandReceipts)
          .where(
            and(
              eq(schema.testRideCommandReceipts.clientOrganizationId, cid),
              eq(schema.testRideCommandReceipts.idempotencyKey, idempotencyKey),
            ),
          )
          .limit(1);
        if (
          !receipt ||
          receipt.requestFingerprint !== requestFingerprint ||
          receipt.commandType !== commandType
        )
          throw conflict(
            'IDEMPOTENCY_MISMATCH',
            'This idempotency key was used for another command.',
          );
        return receipt.responseSnapshot as T;
      }
      const job = await this.jobByIdTx(tx, cid, rideId);
      if (!job) throw notFound('Test ride not found.');
      const response = await operation(tx, job);
      const receiptId = inserted.at(0)?.id;
      if (!receiptId) throw new Error('Test-ride command receipt insert did not return an ID.');
      await tx
        .update(schema.testRideCommandReceipts)
        .set({ responseSnapshot: response })
        .where(eq(schema.testRideCommandReceipts.id, receiptId));
      return response;
    });
  }

  private async accessibleJob(context: AuthorizationContext, rideId: string): Promise<ScopedJob> {
    const cid = clientId(context);
    const [row] = await this.connection.db
      .select({
        departmentId: schema.teams.departmentId,
        job: schema.testRideJobs,
        lead: schema.leadOpportunities,
      })
      .from(schema.testRideJobs)
      .innerJoin(
        schema.leadOpportunities,
        and(
          eq(schema.leadOpportunities.clientOrganizationId, cid),
          eq(schema.leadOpportunities.id, schema.testRideJobs.leadId),
        ),
      )
      .leftJoin(schema.teams, eq(schema.teams.id, schema.testRideJobs.teamId))
      .where(
        and(eq(schema.testRideJobs.clientOrganizationId, cid), eq(schema.testRideJobs.id, rideId)),
      )
      .limit(1);
    if (!row || !this.canAccess(context, row.job, row.lead, row.departmentId))
      throw notFound('Test ride not found.');
    return row;
  }

  private async accessibleLead(context: AuthorizationContext, leadId: string) {
    const cid = clientId(context);
    const [row] = await this.connection.db
      .select({
        departmentId: schema.teams.departmentId,
        lead: schema.leadOpportunities,
        teamId: schema.assignmentQueues.teamId,
      })
      .from(schema.leadOpportunities)
      .leftJoin(
        schema.assignmentQueues,
        and(
          eq(schema.assignmentQueues.clientOrganizationId, cid),
          eq(schema.assignmentQueues.id, schema.leadOpportunities.assignmentQueueId),
        ),
      )
      .leftJoin(schema.teams, eq(schema.teams.id, schema.assignmentQueues.teamId))
      .where(
        and(
          eq(schema.leadOpportunities.clientOrganizationId, cid),
          eq(schema.leadOpportunities.id, leadId),
        ),
      )
      .limit(1);
    if (!row || !this.canAccessLead(context, row.lead, row.teamId, row.departmentId))
      throw notFound('Lead not found.');
    return row;
  }

  private canAccess(
    context: AuthorizationContext,
    job: Job,
    lead: Lead,
    departmentId: string | null,
  ): boolean {
    if (context.roleCode === 'TEST_RIDE_EXECUTIVE')
      return (
        context.clientOrganizationId === job.clientOrganizationId &&
        job.executiveMembershipId === context.membershipId &&
        job.executiveUserId === context.userId &&
        this.policy.canAccessBranch(context, job.branchId)
      );
    if (context.roleCode === 'SALESPERSON')
      return (
        context.clientOrganizationId === job.clientOrganizationId &&
        this.policy.canAccessBranch(context, job.branchId) &&
        (lead.relationshipOwnerId === context.userId ||
          lead.currentProcessOwnerId === context.userId)
      );
    return this.policy.canAccessResource(context, {
      assigneeId: job.executiveUserId,
      branchId: job.branchId,
      clientOrganizationId: job.clientOrganizationId,
      departmentId,
      ownerId: lead.relationshipOwnerId,
      teamId: job.teamId,
    });
  }

  private canAccessLead(
    context: AuthorizationContext,
    lead: Lead,
    teamId: string | null,
    departmentId: string | null,
  ): boolean {
    if (context.roleCode === 'SALESPERSON')
      return (
        context.clientOrganizationId === lead.clientOrganizationId &&
        this.policy.canAccessBranch(context, lead.branchId) &&
        (lead.relationshipOwnerId === context.userId ||
          lead.currentProcessOwnerId === context.userId)
      );
    return this.policy.canAccessResource(context, {
      assigneeId: lead.currentProcessOwnerId,
      branchId: lead.branchId,
      clientOrganizationId: lead.clientOrganizationId,
      departmentId,
      ownerId: lead.relationshipOwnerId,
      teamId,
    });
  }

  private assertAssignedExecutive(context: AuthorizationContext, job: Job): void {
    if (
      context.roleCode !== 'TEST_RIDE_EXECUTIVE' ||
      job.executiveMembershipId !== context.membershipId ||
      job.executiveUserId !== context.userId
    )
      throw forbidden('Only the assigned Test Ride Executive may execute this job.');
  }

  private assertVersionAndStatus(
    job: Job,
    expectedVersion: number,
    statuses: TestRideStatus[],
  ): void {
    if (job.version !== expectedVersion)
      throw conflict('CONFLICT', 'The test ride changed. Refresh before retrying.');
    if (!statuses.includes(job.status))
      throw conflict('INVALID_TRANSITION', `A ${job.status} ride cannot perform this transition.`);
  }

  private async jobById(cid: string, rideId: string): Promise<Job | undefined> {
    const [job] = await this.connection.db
      .select()
      .from(schema.testRideJobs)
      .where(
        and(eq(schema.testRideJobs.clientOrganizationId, cid), eq(schema.testRideJobs.id, rideId)),
      )
      .limit(1);
    return job;
  }

  private async jobByIdTx(tx: Tx, cid: string, rideId: string): Promise<Job | undefined> {
    const [job] = await tx
      .select()
      .from(schema.testRideJobs)
      .where(
        and(eq(schema.testRideJobs.clientOrganizationId, cid), eq(schema.testRideJobs.id, rideId)),
      )
      .limit(1);
    return job;
  }

  private async updateStatus(
    tx: Tx,
    job: Job,
    expectedVersion: number,
    status: TestRideStatus,
    values: Partial<Job>,
  ): Promise<Job> {
    const [updated] = await tx
      .update(schema.testRideJobs)
      .set({ ...values, status, updatedAt: new Date(), version: expectedVersion + 1 })
      .where(
        and(
          eq(schema.testRideJobs.clientOrganizationId, job.clientOrganizationId),
          eq(schema.testRideJobs.id, job.id),
          eq(schema.testRideJobs.version, expectedVersion),
          eq(schema.testRideJobs.status, job.status),
        ),
      )
      .returning();
    if (!updated) throw conflict('CONFLICT', 'The test ride changed. Refresh before retrying.');
    return updated;
  }

  private async lockAllocation(
    tx: Tx,
    cid: string,
    branchId: string,
    resourceType: 'VEHICLE' | 'EXECUTIVE',
    resourceReference: string,
  ): Promise<void> {
    await tx
      .insert(schema.testRideAllocationLocks)
      .values({
        branchId,
        clientOrganizationId: cid,
        resourceReference,
        resourceType,
      })
      .onConflictDoNothing();
    await tx.execute(sql`
      select ${schema.testRideAllocationLocks.id}
      from ${schema.testRideAllocationLocks}
      where ${schema.testRideAllocationLocks.clientOrganizationId} = ${cid}
        and ${schema.testRideAllocationLocks.branchId} = ${branchId}
        and ${schema.testRideAllocationLocks.resourceType} = ${resourceType}
        and ${schema.testRideAllocationLocks.resourceReference} = ${resourceReference}
      for update
    `);
  }

  private updateSameStatus(
    tx: Tx,
    job: Job,
    expectedVersion: number,
    values: Partial<Job>,
  ): Promise<Job> {
    return this.updateStatus(tx, job, expectedVersion, job.status, values);
  }

  private async appendTransition(
    tx: Tx,
    context: AuthorizationContext,
    job: Job,
    fromStatus: TestRideStatus | null,
    toStatus: TestRideStatus,
    eventType: string,
    correlationId: string,
    evidence: Record<string, unknown>,
    reason?: string,
  ): Promise<void> {
    await tx.insert(schema.testRideEvents).values({
      actorMembershipId: context.membershipId,
      actorUserId: context.userId,
      clientOrganizationId: job.clientOrganizationId,
      eventType,
      evidence,
      fromStatus,
      reason: reason ?? null,
      testRideJobId: job.id,
      toStatus,
    });
    await tx.insert(schema.outboxEvents).values({
      aggregateId: job.id,
      aggregateType: 'TEST_RIDE',
      clientOrganizationId: job.clientOrganizationId,
      correlationId,
      eventType: `TEST_RIDE_${eventType}`,
      payload: { lead_id: job.leadId, status: toStatus, ...evidence },
      scope: 'CLIENT',
    });
    await tx.insert(schema.auditEvents).values({
      action: `TEST_RIDE_${eventType}`,
      actorId: context.userId,
      actorType: 'USER',
      clientOrganizationId: job.clientOrganizationId,
      correlationId,
      effectiveRole: context.roleCode,
      entityId: job.id,
      entityType: 'TEST_RIDE',
      newSummary: { status: toStatus, version: job.version, ...evidence },
      oldSummary: fromStatus ? { status: fromStatus } : null,
      outcome: 'SUCCESS',
      reason: reason ?? null,
      scope: 'CLIENT',
    });
  }

  private async systemEvidence(
    tx: Tx,
    cid: string,
    rideId: string,
    action: string,
    correlationId: string,
    summary: Record<string, unknown>,
  ): Promise<void> {
    await tx.insert(schema.outboxEvents).values({
      aggregateId: rideId,
      aggregateType: 'TEST_RIDE',
      clientOrganizationId: cid,
      correlationId,
      eventType: action,
      payload: summary,
      scope: 'CLIENT',
    });
    await tx.insert(schema.auditEvents).values({
      action,
      actorType: 'SYSTEM',
      clientOrganizationId: cid,
      correlationId,
      effectiveRole: 'SYSTEM',
      entityId: rideId,
      entityType: 'TEST_RIDE',
      newSummary: summary,
      outcome: 'SUCCESS',
      scope: 'CLIENT',
    });
  }

  private async stopSession(
    tx: Tx,
    cid: string,
    rideId: string,
    stoppedAt: Date,
    reason:
      'CANCELLED' | 'COMPLETED' | 'MANUAL_STOP' | 'NO_SHOW' | 'PERMISSION_REVOKED' | 'TIMEOUT',
  ): Promise<void> {
    await tx
      .update(schema.testRideLocationSessions)
      .set({ stopReason: reason, stoppedAt })
      .where(
        and(
          eq(schema.testRideLocationSessions.clientOrganizationId, cid),
          eq(schema.testRideLocationSessions.testRideJobId, rideId),
          isNull(schema.testRideLocationSessions.stoppedAt),
        ),
      );
  }

  private async releaseBooking(
    tx: Tx,
    cid: string,
    rideId: string,
    releasedAt: Date,
  ): Promise<void> {
    await tx
      .update(schema.demoVehicleBookings)
      .set({ releasedAt, status: 'RELEASED' })
      .where(
        and(
          eq(schema.demoVehicleBookings.clientOrganizationId, cid),
          eq(schema.demoVehicleBookings.testRideJobId, rideId),
          eq(schema.demoVehicleBookings.status, 'HELD'),
        ),
      );
  }

  private otpHash(cid: string, otp: string): string {
    return createHmac('sha256', this.config.otpPepper)
      .update(`${cid}:${otp}`, 'utf8')
      .digest('hex');
  }

  private async latestLocations(cid: string, rideIds: string[]) {
    const result = new Map<string, typeof schema.testRideLocationSamples.$inferSelect>();
    if (rideIds.length === 0) return result;
    const rows = await this.connection.db
      .select()
      .from(schema.testRideLocationSamples)
      .where(
        and(
          eq(schema.testRideLocationSamples.clientOrganizationId, cid),
          inArray(schema.testRideLocationSamples.testRideJobId, rideIds),
        ),
      )
      .orderBy(
        desc(schema.testRideLocationSamples.capturedAt),
        desc(schema.testRideLocationSamples.id),
      );
    for (const row of rows) if (!result.has(row.testRideJobId)) result.set(row.testRideJobId, row);
    return result;
  }

  private presentSummary(
    job: Job,
    contact: typeof schema.contacts.$inferSelect,
    executiveName: string | null,
    location: typeof schema.testRideLocationSamples.$inferSelect | undefined,
  ) {
    const stale = location
      ? Date.now() - location.capturedAt.getTime() > this.config.locationStaleSeconds * 1000
      : false;
    return {
      branch_id: job.branchId,
      contact_id: job.contactId,
      contact_name: contact.displayName,
      customer_location: job.customerLocation,
      demo_vehicle_reference: job.demoVehicleReference,
      executive_membership_id: job.executiveMembershipId,
      executive_name: executiveName,
      executive_user_id: job.executiveUserId,
      id: job.id,
      inventory_unit_id: job.inventoryUnitId,
      last_location: location
        ? {
            accuracy_m: location.accuracyMeters,
            captured_at: location.capturedAt.toISOString(),
            latitude: location.latitude,
            longitude: location.longitude,
            stale,
          }
        : null,
      lead_id: job.leadId,
      phone_e164: contact.primaryPhoneE164,
      scheduled_end_at: job.scheduledEndAt.toISOString(),
      scheduled_start_at: job.scheduledStartAt.toISOString(),
      status: job.status,
      tracking_active:
        job.status === 'ACTIVE' && job.trackingStartedAt !== null && job.trackingStoppedAt === null,
      vehicle_model: job.vehicleModel,
      version: job.version,
    };
  }
}
