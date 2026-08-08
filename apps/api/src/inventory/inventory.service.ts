/* Inventory authority, concurrency and correction policy live only in this backend service. */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateInventoryAllocationRequest,
  CreateInventoryCatalogueRequest,
  CreateInventoryReservationRequest,
  CreateInventoryTransferRequest,
  CreateInventoryUnitRequest,
  EndInventoryTransferRequest,
  ExtendInventoryReservationRequest,
  ImportInventoryUnitsRequest,
  InventoryUnitListQuery,
  InventoryUnitStatus,
  ReallocateInventoryRequest,
  ReleaseInventoryAllocationRequest,
  ReleaseInventoryReservationRequest,
  TransitionInventoryUnitRequest,
} from '@gdm/contracts';
import { schema, type DatabaseConnection } from '@gdm/database';
import { and, asc, desc, eq, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import { AuthorizationPolicy } from '../authorization/authorization-policy.js';
import type { AuthorizationContext } from '../authorization/authorization.types.js';
import { DATABASE_CONNECTION } from '../infrastructure/database/database.tokens.js';

type Tx = Parameters<Parameters<DatabaseConnection['db']['transaction']>[0]>[0];
type Unit = typeof schema.inventoryUnits.$inferSelect;

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

function badRequest(code: string, message: string): BadRequestException {
  return new BadRequestException({ code, details: [], message, retryable: false });
}

function conflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, details: [], message, retryable: false });
}

function forbidden(message: string): ForbiddenException {
  return new ForbiddenException({ code: 'FORBIDDEN', details: [], message, retryable: false });
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

function maskIdentity(value: string | null): string | null {
  if (!value) return null;
  const visible = value.slice(-4);
  return `${'•'.repeat(Math.min(8, Math.max(4, value.length - visible.length)))}${visible}`;
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
export class InventoryService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly connection: DatabaseConnection,
    @Inject(AuthorizationPolicy) private readonly policy: AuthorizationPolicy,
  ) {}

  async catalogue(context: AuthorizationContext) {
    const cid = clientId(context);
    const [brands, models, variants, colours] = await Promise.all([
      this.connection.db
        .select()
        .from(schema.inventoryBrands)
        .where(
          and(
            eq(schema.inventoryBrands.clientOrganizationId, cid),
            eq(schema.inventoryBrands.active, true),
          ),
        )
        .orderBy(asc(schema.inventoryBrands.name)),
      this.connection.db
        .select()
        .from(schema.inventoryModels)
        .where(
          and(
            eq(schema.inventoryModels.clientOrganizationId, cid),
            eq(schema.inventoryModels.active, true),
          ),
        )
        .orderBy(asc(schema.inventoryModels.name)),
      this.connection.db
        .select()
        .from(schema.inventoryVariants)
        .where(
          and(
            eq(schema.inventoryVariants.clientOrganizationId, cid),
            eq(schema.inventoryVariants.active, true),
          ),
        )
        .orderBy(asc(schema.inventoryVariants.name)),
      this.connection.db
        .select()
        .from(schema.inventoryColours)
        .where(
          and(
            eq(schema.inventoryColours.clientOrganizationId, cid),
            eq(schema.inventoryColours.active, true),
          ),
        )
        .orderBy(asc(schema.inventoryColours.name)),
    ]);
    return {
      brands: brands.map((row) => ({ code: row.code, id: row.id, name: row.name })),
      colours: colours.map((row) => ({ code: row.code, id: row.id, name: row.name })),
      models: models.map((row) => ({
        brand_id: row.brandId,
        code: row.code,
        id: row.id,
        name: row.name,
      })),
      variants: variants.map((row) => ({
        code: row.code,
        fuel_powertrain: row.fuelPowertrain,
        id: row.id,
        model_id: row.modelId,
        model_year: row.modelYear,
        name: row.name,
      })),
    };
  }

  createCatalogue(
    context: AuthorizationContext,
    input: CreateInventoryCatalogueRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(context, 'CATALOGUE_CREATE', input, key, async (tx, cid) => {
      const [brand] = await tx
        .insert(schema.inventoryBrands)
        .values({ clientOrganizationId: cid, code: input.brand_code, name: input.brand_name })
        .onConflictDoUpdate({
          target: [schema.inventoryBrands.clientOrganizationId, schema.inventoryBrands.code],
          set: { active: true, name: input.brand_name, updatedAt: new Date() },
        })
        .returning();
      if (!brand) throw new Error('Catalogue brand upsert did not return a row.');
      const [model] = await tx
        .insert(schema.inventoryModels)
        .values({
          brandId: brand.id,
          clientOrganizationId: cid,
          code: input.model_code,
          name: input.model_name,
        })
        .onConflictDoUpdate({
          target: [
            schema.inventoryModels.clientOrganizationId,
            schema.inventoryModels.brandId,
            schema.inventoryModels.code,
          ],
          set: { active: true, name: input.model_name, updatedAt: new Date() },
        })
        .returning();
      if (!model) throw new Error('Catalogue model upsert did not return a row.');
      const [variant] = await tx
        .insert(schema.inventoryVariants)
        .values({
          clientOrganizationId: cid,
          code: input.variant_code,
          fuelPowertrain: input.fuel_powertrain,
          modelId: model.id,
          modelYear: input.model_year,
          name: input.variant_name,
        })
        .onConflictDoUpdate({
          target: [
            schema.inventoryVariants.clientOrganizationId,
            schema.inventoryVariants.modelId,
            schema.inventoryVariants.code,
          ],
          set: {
            active: true,
            fuelPowertrain: input.fuel_powertrain,
            modelYear: input.model_year,
            name: input.variant_name,
            updatedAt: new Date(),
          },
        })
        .returning();
      const [colour] = await tx
        .insert(schema.inventoryColours)
        .values({ clientOrganizationId: cid, code: input.colour_code, name: input.colour_name })
        .onConflictDoUpdate({
          target: [schema.inventoryColours.clientOrganizationId, schema.inventoryColours.code],
          set: { active: true, name: input.colour_name, updatedAt: new Date() },
        })
        .returning();
      if (!variant || !colour) throw new Error('Catalogue upsert did not return all rows.');
      const response = {
        brand_id: brand.id,
        colour_id: colour.id,
        model_id: model.id,
        variant_id: variant.id,
      };
      await this.recordAuditOnly(
        tx,
        context,
        cid,
        'INVENTORY_CATALOGUE_CREATED',
        variant.id,
        correlationId,
        response,
      );
      return response;
    });
  }

  async list(context: AuthorizationContext, query: InventoryUnitListQuery) {
    const cid = clientId(context);
    if (query.branch_id && !this.policy.canAccessBranch(context, query.branch_id))
      throw forbidden('Branch access is denied.');
    const conditions: SQL[] = [eq(schema.inventoryUnits.clientOrganizationId, cid)];
    if (context.branchScopeMode === 'NONE') return { units: [] };
    if (context.branchScopeMode === 'SELECTED') {
      const branchIds = [...context.branchIds];
      if (branchIds.length === 0) return { units: [] };
      conditions.push(inArray(schema.inventoryUnits.branchId, branchIds));
    }
    if (query.branch_id) conditions.push(eq(schema.inventoryUnits.branchId, query.branch_id));
    if (query.status) conditions.push(eq(schema.inventoryUnits.status, query.status));
    if (query.search) {
      const searchCondition = or(
        ilike(schema.inventoryUnits.unitReference, `%${query.search}%`),
        ilike(schema.inventoryUnits.vin, `%${query.search}%`),
        ilike(schema.inventoryModels.name, `%${query.search}%`),
        ilike(schema.inventoryVariants.name, `%${query.search}%`),
      );
      if (searchCondition) conditions.push(searchCondition);
    }
    const rows = await this.unitRows(and(...conditions), query.limit);
    const sensitive = context.permissionCodes.has('inventory.units.sensitive.read');
    return {
      units: rows
        .filter((row) => this.policy.canAccessBranch(context, row.unit.branchId))
        .map((row) => this.presentUnit(row, sensitive)),
    };
  }

  createUnit(
    context: AuthorizationContext,
    input: CreateInventoryUnitRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(context, 'UNIT_CREATE', input, key, async (tx, cid) =>
      this.createUnitTx(tx, context, cid, input, correlationId),
    );
  }

  importUnits(
    context: AuthorizationContext,
    input: ImportInventoryUnitsRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(context, 'UNIT_IMPORT', input, key, async (tx, cid) => {
      const units = [];
      for (const row of input.rows) {
        units.push(
          await this.createUnitTx(
            tx,
            context,
            cid,
            row,
            correlationId,
            input.source_batch_reference,
          ),
        );
      }
      return { imported: units.length, units };
    });
  }

  async detail(context: AuthorizationContext, unitId: string) {
    const cid = clientId(context);
    const unitRow = await this.accessibleUnitRow(context, unitId);
    const sensitive = context.permissionCodes.has('inventory.units.sensitive.read');
    const [history, activeReservation, activeAllocation, transfers] = await Promise.all([
      this.connection.db
        .select({ actorName: schema.users.displayName, event: schema.inventoryUnitStatusHistory })
        .from(schema.inventoryUnitStatusHistory)
        .leftJoin(schema.users, eq(schema.users.id, schema.inventoryUnitStatusHistory.actorUserId))
        .where(
          and(
            eq(schema.inventoryUnitStatusHistory.clientOrganizationId, cid),
            eq(schema.inventoryUnitStatusHistory.inventoryUnitId, unitId),
          ),
        )
        .orderBy(
          asc(schema.inventoryUnitStatusHistory.createdAt),
          asc(schema.inventoryUnitStatusHistory.id),
        ),
      this.connection.db
        .select()
        .from(schema.inventoryReservations)
        .where(
          and(
            eq(schema.inventoryReservations.clientOrganizationId, cid),
            eq(schema.inventoryReservations.inventoryUnitId, unitId),
            eq(schema.inventoryReservations.status, 'ACTIVE'),
          ),
        )
        .limit(1),
      this.connection.db
        .select()
        .from(schema.inventoryAllocations)
        .where(
          and(
            eq(schema.inventoryAllocations.clientOrganizationId, cid),
            eq(schema.inventoryAllocations.inventoryUnitId, unitId),
            eq(schema.inventoryAllocations.status, 'ACTIVE'),
          ),
        )
        .limit(1),
      this.connection.db
        .select({
          eventType: schema.inventoryTransferEvents.eventType,
          transfer: schema.inventoryTransfers,
        })
        .from(schema.inventoryTransfers)
        .innerJoin(
          schema.inventoryTransferEvents,
          and(
            eq(schema.inventoryTransferEvents.clientOrganizationId, cid),
            eq(schema.inventoryTransferEvents.transferId, schema.inventoryTransfers.id),
          ),
        )
        .where(
          and(
            eq(schema.inventoryTransfers.clientOrganizationId, cid),
            eq(schema.inventoryTransfers.inventoryUnitId, unitId),
          ),
        )
        .orderBy(
          desc(schema.inventoryTransfers.createdAt),
          desc(schema.inventoryTransferEvents.createdAt),
        ),
    ]);
    const latestTransfers = new Map<string, (typeof transfers)[number]>();
    for (const row of transfers)
      if (!latestTransfers.has(row.transfer.id)) latestTransfers.set(row.transfer.id, row);
    const reservation = activeReservation[0];
    const allocation = activeAllocation[0];
    return {
      active_allocation: allocation
        ? {
            booking_reference: allocation.bookingReference,
            id: allocation.id,
            status: allocation.status,
          }
        : null,
      active_reservation: reservation
        ? {
            booking_reference: reservation.bookingReference,
            expires_at: reservation.expiresAt.toISOString(),
            id: reservation.id,
            lead_id: reservation.leadId,
            status: reservation.status,
          }
        : null,
      history: history.map(({ actorName, event }) => ({
        actor_name: actorName,
        created_at: event.createdAt.toISOString(),
        event_type: event.eventType,
        from_status: event.fromStatus,
        id: event.id,
        reason: event.reason,
        to_status: event.toStatus,
      })),
      transfers: [...latestTransfers.values()].map(({ eventType, transfer }) => ({
        created_at: transfer.createdAt.toISOString(),
        from_branch_id: transfer.fromBranchId,
        id: transfer.id,
        latest_event: eventType,
        reference: transfer.reference,
        to_branch_id: transfer.toBranchId,
      })),
      unit: {
        ...this.presentUnit(unitRow, sensitive),
        acquisition_reference: unitRow.unit.acquisitionReference,
        blocked_reason: unitRow.unit.blockedReason,
        condition_notes: unitRow.unit.conditionNotes,
        current_odometer_km: unitRow.unit.currentOdometerKm,
        ownership_type: unitRow.unit.ownershipType,
        service_due_at: unitRow.unit.serviceDueAt?.toISOString() ?? null,
      },
    };
  }

  transition(
    context: AuthorizationContext,
    unitId: string,
    input: TransitionInventoryUnitRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      `UNIT_${input.action}`,
      { unitId, ...input },
      key,
      async (tx, cid) => {
        const unit = await this.lockAndGetUnit(tx, context, cid, unitId);
        this.assertVersion(unit, input.expected_version);
        const protectedActions = new Set([
          'AUTHORIZE_DEMO_SALE',
          'BLOCK',
          'UNBLOCK',
          'CANCEL',
          'REMOVE',
          'DELIVER',
        ]);
        if (
          protectedActions.has(input.action) &&
          !context.permissionCodes.has('inventory.corrections.manage')
        )
          throw forbidden('This controlled inventory correction requires manager permission.');

        let target: InventoryUnitStatus;
        const values: Partial<Unit> = {};
        switch (input.action) {
          case 'RECEIVE':
            this.assertStatus(unit, ['EXPECTED']);
            if (!(input.vin ?? unit.vin) || !(input.chassis_number ?? unit.chassisNumber))
              throw conflict(
                'INVENTORY_IDENTITY_REQUIRED',
                'VIN and chassis are required before receipt.',
              );
            target = 'AVAILABLE';
            values.chassisNumber = input.chassis_number ?? unit.chassisNumber;
            values.currentOdometerKm = input.current_odometer_km ?? unit.currentOdometerKm;
            values.engineNumber = input.engine_number ?? unit.engineNumber;
            values.receivedAt = new Date(input.received_at ?? new Date().toISOString());
            values.vin = input.vin ?? unit.vin;
            break;
          case 'DESIGNATE_DEMO':
            this.assertStatus(unit, ['AVAILABLE']);
            target = 'DEMO';
            break;
          case 'AUTHORIZE_DEMO_SALE':
            this.assertStatus(unit, ['DEMO']);
            target = 'AVAILABLE';
            break;
          case 'BLOCK':
            this.assertStatus(unit, ['AVAILABLE', 'DEMO']);
            target = 'BLOCKED';
            values.blockedReason = input.reason;
            break;
          case 'UNBLOCK': {
            this.assertStatus(unit, ['BLOCKED']);
            const [blockedEvent] = await tx
              .select({ fromStatus: schema.inventoryUnitStatusHistory.fromStatus })
              .from(schema.inventoryUnitStatusHistory)
              .where(
                and(
                  eq(schema.inventoryUnitStatusHistory.clientOrganizationId, cid),
                  eq(schema.inventoryUnitStatusHistory.inventoryUnitId, unitId),
                  eq(schema.inventoryUnitStatusHistory.toStatus, 'BLOCKED'),
                ),
              )
              .orderBy(
                desc(schema.inventoryUnitStatusHistory.createdAt),
                desc(schema.inventoryUnitStatusHistory.id),
              )
              .limit(1);
            target = blockedEvent?.fromStatus === 'DEMO' ? 'DEMO' : 'AVAILABLE';
            values.blockedReason = null;
            break;
          }
          case 'CANCEL':
            this.assertStatus(unit, ['EXPECTED', 'AVAILABLE', 'DEMO', 'BLOCKED']);
            target = 'CANCELLED';
            break;
          case 'REMOVE':
            this.assertStatus(unit, ['EXPECTED', 'AVAILABLE', 'DEMO', 'BLOCKED', 'CANCELLED']);
            target = 'REMOVED';
            break;
          case 'DELIVER': {
            this.assertStatus(unit, ['ALLOCATED']);
            const [allocation] = await tx
              .select()
              .from(schema.inventoryAllocations)
              .where(
                and(
                  eq(schema.inventoryAllocations.clientOrganizationId, cid),
                  eq(schema.inventoryAllocations.inventoryUnitId, unitId),
                  eq(schema.inventoryAllocations.status, 'ACTIVE'),
                ),
              )
              .limit(1);
            if (!allocation)
              throw conflict(
                'INVENTORY_ALLOCATION_REQUIRED',
                'Delivery requires an active allocation.',
              );
            await tx
              .update(schema.inventoryAllocations)
              .set({ releasedAt: new Date(), status: 'DELIVERED' })
              .where(eq(schema.inventoryAllocations.id, allocation.id));
            target = 'DELIVERED';
            break;
          }
        }
        const updated = await this.updateUnit(tx, unit, target, values);
        await this.recordTransition(
          tx,
          context,
          updated,
          unit.status,
          target,
          `UNIT_${input.action}`,
          input.reason,
          correlationId,
          {},
        );
        return { id: updated.id, status: updated.status, version: updated.version };
      },
    );
  }

  reserve(
    context: AuthorizationContext,
    unitId: string,
    input: CreateInventoryReservationRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(context, 'RESERVE', { unitId, ...input }, key, async (tx, cid) => {
      const unit = await this.lockAndGetUnit(tx, context, cid, unitId);
      this.assertVersion(unit, input.expected_version);
      this.assertStatus(unit, ['AVAILABLE']);
      const expiresAt = new Date(input.expires_at);
      if (expiresAt <= new Date())
        throw badRequest('VALIDATION_ERROR', 'Reservation expiry must be in the future.');
      if (input.lead_id) {
        const [lead] = await tx
          .select({ branchId: schema.leadOpportunities.branchId })
          .from(schema.leadOpportunities)
          .where(
            and(
              eq(schema.leadOpportunities.clientOrganizationId, cid),
              eq(schema.leadOpportunities.id, input.lead_id),
            ),
          )
          .limit(1);
        if (!lead || lead.branchId !== unit.branchId)
          throw notFound('Lead not found in the inventory branch.');
      }
      const [reservation] = await tx
        .insert(schema.inventoryReservations)
        .values({
          bookingReference: input.booking_reference,
          clientOrganizationId: cid,
          createdByMembershipId: context.membershipId,
          createdByUserId: context.userId,
          expiresAt,
          inventoryUnitId: unitId,
          leadId: input.lead_id,
          reason: input.reason,
        })
        .returning();
      if (!reservation) throw new Error('Reservation insert did not return a row.');
      const updated = await this.updateUnit(tx, unit, 'RESERVED', {});
      await this.recordTransition(
        tx,
        context,
        updated,
        unit.status,
        'RESERVED',
        'UNIT_RESERVED',
        input.reason,
        correlationId,
        {
          booking_reference: input.booking_reference,
          expires_at: input.expires_at,
          reservation_id: reservation.id,
        },
      );
      return {
        id: reservation.id,
        inventory_unit_id: unitId,
        status: reservation.status,
        unit_version: updated.version,
      };
    });
  }

  extendReservation(
    context: AuthorizationContext,
    reservationId: string,
    input: ExtendInventoryReservationRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'RESERVATION_EXTEND',
      { reservationId, ...input },
      key,
      async (tx, cid) => {
        const reservation = await this.reservationById(tx, cid, reservationId);
        if (!reservation) throw notFound('Reservation not found.');
        const unit = await this.lockAndGetUnit(tx, context, cid, reservation.inventoryUnitId);
        this.assertVersion(unit, input.expected_version);
        if (reservation.status !== 'ACTIVE' || unit.status !== 'RESERVED')
          throw conflict('INVALID_TRANSITION', 'Only an active reservation may be extended.');
        const expiresAt = new Date(input.expires_at);
        if (expiresAt <= reservation.expiresAt || expiresAt <= new Date())
          throw badRequest(
            'VALIDATION_ERROR',
            'The new expiry must extend the active reservation.',
          );
        await tx
          .update(schema.inventoryReservations)
          .set({ expiresAt })
          .where(eq(schema.inventoryReservations.id, reservationId));
        const updated = await this.updateUnit(tx, unit, unit.status, {});
        await this.recordTransition(
          tx,
          context,
          updated,
          unit.status,
          unit.status,
          'RESERVATION_EXTENDED',
          input.reason,
          correlationId,
          {
            expires_at: input.expires_at,
            reservation_id: reservationId,
          },
        );
        return {
          expires_at: input.expires_at,
          id: reservationId,
          status: 'ACTIVE',
          unit_version: updated.version,
        };
      },
    );
  }

  releaseReservation(
    context: AuthorizationContext,
    reservationId: string,
    input: ReleaseInventoryReservationRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'RESERVATION_RELEASE',
      { reservationId, ...input },
      key,
      async (tx, cid) => {
        const reservation = await this.reservationById(tx, cid, reservationId);
        if (!reservation) throw notFound('Reservation not found.');
        const unit = await this.lockAndGetUnit(tx, context, cid, reservation.inventoryUnitId);
        this.assertVersion(unit, input.expected_version);
        if (reservation.status !== 'ACTIVE' || unit.status !== 'RESERVED')
          throw conflict('INVALID_TRANSITION', 'Only an active reserved unit may be released.');
        const now = new Date();
        await tx
          .update(schema.inventoryReservations)
          .set({ releasedAt: now, releasedReason: input.reason, status: 'RELEASED' })
          .where(eq(schema.inventoryReservations.id, reservationId));
        const updated = await this.updateUnit(tx, unit, 'AVAILABLE', {});
        await this.recordTransition(
          tx,
          context,
          updated,
          'RESERVED',
          'AVAILABLE',
          'RESERVATION_RELEASED',
          input.reason,
          correlationId,
          {
            reservation_id: reservationId,
          },
        );
        return { id: reservationId, status: 'RELEASED', unit_version: updated.version };
      },
    );
  }

  reconcileReservations(
    context: AuthorizationContext,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(context, 'RESERVATION_RECONCILE', {}, key, async (tx, cid) => ({
      expired: await this.expireReservationsTx(tx, cid, new Date(), correlationId, context),
    }));
  }

  async reconcileAllReservations(now: Date): Promise<{ expired: number }> {
    const tenants = await this.connection.db
      .selectDistinct({ clientOrganizationId: schema.inventoryReservations.clientOrganizationId })
      .from(schema.inventoryReservations)
      .where(
        and(
          eq(schema.inventoryReservations.status, 'ACTIVE'),
          lte(schema.inventoryReservations.expiresAt, now),
        ),
      );
    let expired = 0;
    for (const tenant of tenants) {
      expired += await this.connection.db.transaction((tx) =>
        this.expireReservationsTx(
          tx,
          tenant.clientOrganizationId,
          now,
          `inventory-reservation-monitor:${now.toISOString()}`,
        ),
      );
    }
    return { expired };
  }

  allocate(
    context: AuthorizationContext,
    unitId: string,
    input: CreateInventoryAllocationRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(context, 'ALLOCATE', { unitId, ...input }, key, async (tx, cid) => {
      const unit = await this.lockAndGetUnit(tx, context, cid, unitId);
      this.assertVersion(unit, input.expected_version);
      this.assertStatus(unit, ['AVAILABLE', 'RESERVED']);
      let reservationId: string | null = null;
      if (unit.status === 'RESERVED') {
        const [reservation] = await tx
          .select()
          .from(schema.inventoryReservations)
          .where(
            and(
              eq(schema.inventoryReservations.clientOrganizationId, cid),
              eq(schema.inventoryReservations.inventoryUnitId, unitId),
              eq(schema.inventoryReservations.status, 'ACTIVE'),
            ),
          )
          .limit(1);
        if (!reservation)
          throw conflict(
            'INVENTORY_RESERVATION_REQUIRED',
            'Reserved stock has no active reservation.',
          );
        if (reservation.expiresAt <= new Date())
          throw conflict(
            'RESERVATION_EXPIRED',
            'The reservation expired; reconcile before allocation.',
          );
        if (
          reservation.bookingReference &&
          reservation.bookingReference !== input.booking_reference
        )
          throw conflict(
            'BOOKING_REFERENCE_MISMATCH',
            'The reservation belongs to another booking.',
          );
        reservationId = reservation.id;
      }
      const [allocation] = await tx
        .insert(schema.inventoryAllocations)
        .values({
          allocatedByMembershipId: context.membershipId,
          allocatedByUserId: context.userId,
          bookingReference: input.booking_reference,
          clientOrganizationId: cid,
          inventoryUnitId: unitId,
          readinessAsserted: input.readiness_asserted,
          reason: input.reason,
        })
        .returning();
      if (!allocation) throw new Error('Allocation insert did not return a row.');
      if (reservationId) {
        await tx
          .update(schema.inventoryReservations)
          .set({
            releasedAt: new Date(),
            releasedReason: 'Converted to allocation.',
            status: 'CONVERTED',
          })
          .where(eq(schema.inventoryReservations.id, reservationId));
      }
      const updated = await this.updateUnit(tx, unit, 'ALLOCATED', {});
      await this.recordTransition(
        tx,
        context,
        updated,
        unit.status,
        'ALLOCATED',
        'VEHICLE_ALLOCATED',
        input.reason,
        correlationId,
        {
          allocation_id: allocation.id,
          booking_reference: input.booking_reference,
        },
      );
      return {
        id: allocation.id,
        inventory_unit_id: unitId,
        status: allocation.status,
        unit_version: updated.version,
      };
    });
  }

  releaseAllocation(
    context: AuthorizationContext,
    allocationId: string,
    input: ReleaseInventoryAllocationRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'ALLOCATION_RELEASE',
      { allocationId, ...input },
      key,
      async (tx, cid) => {
        const allocation = await this.allocationById(tx, cid, allocationId);
        if (!allocation) throw notFound('Allocation not found.');
        const unit = await this.lockAndGetUnit(tx, context, cid, allocation.inventoryUnitId);
        this.assertVersion(unit, input.expected_version);
        if (allocation.status !== 'ACTIVE' || unit.status !== 'ALLOCATED')
          throw conflict('INVALID_TRANSITION', 'Only an active allocated unit may be released.');
        await tx
          .update(schema.inventoryAllocations)
          .set({ releasedAt: new Date(), status: 'RELEASED' })
          .where(eq(schema.inventoryAllocations.id, allocationId));
        const updated = await this.updateUnit(tx, unit, 'AVAILABLE', {});
        await this.recordTransition(
          tx,
          context,
          updated,
          'ALLOCATED',
          'AVAILABLE',
          'ALLOCATION_RELEASED',
          input.reason,
          correlationId,
          {
            allocation_id: allocationId,
            booking_reference: allocation.bookingReference,
          },
        );
        return { id: allocationId, status: 'RELEASED', unit_version: updated.version };
      },
    );
  }

  reallocate(
    context: AuthorizationContext,
    allocationId: string,
    input: ReallocateInventoryRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(context, 'REALLOCATE', { allocationId, ...input }, key, async (tx, cid) => {
      const allocation = await this.allocationById(tx, cid, allocationId);
      if (!allocation || allocation.status !== 'ACTIVE')
        throw notFound('Active allocation not found.');
      if (allocation.inventoryUnitId === input.to_inventory_unit_id)
        throw badRequest('VALIDATION_ERROR', 'Reallocation requires a different physical unit.');
      const ids = [allocation.inventoryUnitId, input.to_inventory_unit_id].sort();
      for (const id of ids) await this.lockUnit(tx, cid, id);
      const from = await this.unitById(tx, cid, allocation.inventoryUnitId);
      const to = await this.unitById(tx, cid, input.to_inventory_unit_id);
      if (!from || !to) throw notFound('Inventory unit not found.');
      this.assertAccessibleUnit(context, from);
      this.assertAccessibleUnit(context, to);
      this.assertVersion(from, input.expected_from_version);
      this.assertVersion(to, input.expected_to_version);
      this.assertStatus(from, ['ALLOCATED']);
      this.assertStatus(to, ['AVAILABLE']);
      await tx
        .update(schema.inventoryAllocations)
        .set({
          customerCommunicationDecision: input.customer_communication_decision,
          releasedAt: new Date(),
          status: 'REPLACED',
        })
        .where(eq(schema.inventoryAllocations.id, allocationId));
      const [replacement] = await tx
        .insert(schema.inventoryAllocations)
        .values({
          allocatedByMembershipId: context.membershipId,
          allocatedByUserId: context.userId,
          bookingReference: allocation.bookingReference,
          clientOrganizationId: cid,
          customerCommunicationDecision: input.customer_communication_decision,
          inventoryUnitId: to.id,
          readinessAsserted: true,
          reason: input.reason,
          replacesAllocationId: allocationId,
        })
        .returning();
      if (!replacement) throw new Error('Replacement allocation insert did not return a row.');
      const fromUpdated = await this.updateUnit(tx, from, 'AVAILABLE', {});
      const toUpdated = await this.updateUnit(tx, to, 'ALLOCATED', {});
      await this.recordTransition(
        tx,
        context,
        fromUpdated,
        'ALLOCATED',
        'AVAILABLE',
        'VIN_REALLOCATED_FROM',
        input.reason,
        correlationId,
        {
          booking_reference: allocation.bookingReference,
          customer_communication_decision: input.customer_communication_decision,
          replacement_allocation_id: replacement.id,
          to_inventory_unit_id: to.id,
        },
      );
      await this.recordTransition(
        tx,
        context,
        toUpdated,
        'AVAILABLE',
        'ALLOCATED',
        'VIN_REALLOCATED_TO',
        input.reason,
        correlationId,
        {
          booking_reference: allocation.bookingReference,
          customer_communication_decision: input.customer_communication_decision,
          previous_allocation_id: allocationId,
        },
      );
      return {
        from_unit_version: fromUpdated.version,
        id: replacement.id,
        inventory_unit_id: to.id,
        status: replacement.status,
        to_unit_version: toUpdated.version,
      };
    });
  }

  startTransfer(
    context: AuthorizationContext,
    unitId: string,
    input: CreateInventoryTransferRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(context, 'TRANSFER_START', { unitId, ...input }, key, async (tx, cid) => {
      const unit = await this.lockAndGetUnit(tx, context, cid, unitId);
      this.assertVersion(unit, input.expected_version);
      this.assertStatus(unit, ['AVAILABLE', 'DEMO', 'BLOCKED']);
      if (!this.policy.canAccessBranch(context, input.to_branch_id))
        throw forbidden('Destination branch access is denied.');
      if (input.to_branch_id === unit.branchId)
        throw badRequest(
          'VALIDATION_ERROR',
          'Transfer destination must differ from the current branch.',
        );
      const [branch] = await tx
        .select({ id: schema.branches.id })
        .from(schema.branches)
        .where(
          and(
            eq(schema.branches.clientOrganizationId, cid),
            eq(schema.branches.id, input.to_branch_id),
            eq(schema.branches.active, true),
          ),
        )
        .limit(1);
      if (!branch) throw notFound('Destination branch not found.');
      const [transfer] = await tx
        .insert(schema.inventoryTransfers)
        .values({
          clientOrganizationId: cid,
          fromBranchId: unit.branchId,
          initiatedByMembershipId: context.membershipId,
          initiatedByUserId: context.userId,
          inventoryUnitId: unitId,
          priorStatus: unit.status as 'AVAILABLE' | 'BLOCKED' | 'DEMO',
          reason: input.reason,
          reference: input.reference,
          toBranchId: input.to_branch_id,
        })
        .returning();
      if (!transfer) throw new Error('Transfer insert did not return a row.');
      await tx.insert(schema.inventoryTransferEvents).values({
        actorMembershipId: context.membershipId,
        actorUserId: context.userId,
        clientOrganizationId: cid,
        eventType: 'STARTED',
        evidence: { reference: input.reference },
        inventoryUnitId: unitId,
        reason: input.reason,
        transferId: transfer.id,
      });
      const updated = await this.updateUnit(tx, unit, 'IN_TRANSFER', {});
      await this.recordTransition(
        tx,
        context,
        updated,
        unit.status,
        'IN_TRANSFER',
        'TRANSFER_STARTED',
        input.reason,
        correlationId,
        {
          from_branch_id: unit.branchId,
          to_branch_id: input.to_branch_id,
          transfer_id: transfer.id,
        },
      );
      return { id: transfer.id, status: 'STARTED', unit_version: updated.version };
    });
  }

  endTransfer(
    context: AuthorizationContext,
    transferId: string,
    input: EndInventoryTransferRequest,
    terminal: 'CANCELLED' | 'COMPLETED',
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      `TRANSFER_${terminal}`,
      { transferId, terminal, ...input },
      key,
      async (tx, cid) => {
        const [transfer] = await tx
          .select()
          .from(schema.inventoryTransfers)
          .where(
            and(
              eq(schema.inventoryTransfers.clientOrganizationId, cid),
              eq(schema.inventoryTransfers.id, transferId),
            ),
          )
          .limit(1);
        if (!transfer) throw notFound('Transfer not found.');
        const unit = await this.lockAndGetUnit(tx, context, cid, transfer.inventoryUnitId);
        this.assertVersion(unit, input.expected_version);
        this.assertStatus(unit, ['IN_TRANSFER']);
        if (
          !this.policy.canAccessBranch(context, transfer.fromBranchId) ||
          !this.policy.canAccessBranch(context, transfer.toBranchId)
        )
          throw forbidden('Both transfer branches must be in scope.');
        const [existingTerminal] = await tx
          .select({ id: schema.inventoryTransferEvents.id })
          .from(schema.inventoryTransferEvents)
          .where(
            and(
              eq(schema.inventoryTransferEvents.clientOrganizationId, cid),
              eq(schema.inventoryTransferEvents.transferId, transferId),
              inArray(schema.inventoryTransferEvents.eventType, ['COMPLETED', 'CANCELLED']),
            ),
          )
          .limit(1);
        if (existingTerminal) throw conflict('INVALID_TRANSITION', 'The transfer already ended.');
        await tx.insert(schema.inventoryTransferEvents).values({
          actorMembershipId: context.membershipId,
          actorUserId: context.userId,
          clientOrganizationId: cid,
          eventType: terminal,
          inventoryUnitId: unit.id,
          reason: input.reason,
          transferId,
        });
        const target = transfer.priorStatus as 'AVAILABLE' | 'BLOCKED' | 'DEMO';
        const updated = await this.updateUnit(tx, unit, target, {
          ...(terminal === 'COMPLETED' ? { branchId: transfer.toBranchId } : {}),
        });
        await this.recordTransition(
          tx,
          context,
          updated,
          'IN_TRANSFER',
          target,
          `TRANSFER_${terminal}`,
          input.reason,
          correlationId,
          {
            branch_id: updated.branchId,
            transfer_id: transferId,
          },
        );
        return { id: transferId, status: terminal, unit_version: updated.version };
      },
    );
  }

  private async createUnitTx(
    tx: Tx,
    context: AuthorizationContext,
    cid: string,
    input: CreateInventoryUnitRequest,
    correlationId: string,
    sourceBatchReference?: string,
  ) {
    if (!this.policy.canAccessBranch(context, input.branch_id))
      throw forbidden('Branch access is denied.');
    const [catalogue] = await tx
      .select({ colourId: schema.inventoryColours.id, variantId: schema.inventoryVariants.id })
      .from(schema.inventoryVariants)
      .innerJoin(
        schema.inventoryColours,
        and(
          eq(schema.inventoryColours.clientOrganizationId, cid),
          eq(schema.inventoryColours.id, input.colour_id),
          eq(schema.inventoryColours.active, true),
        ),
      )
      .where(
        and(
          eq(schema.inventoryVariants.clientOrganizationId, cid),
          eq(schema.inventoryVariants.id, input.variant_id),
          eq(schema.inventoryVariants.active, true),
        ),
      )
      .limit(1);
    if (!catalogue) throw notFound('Catalogue variant or colour not found.');
    try {
      const [unit] = await tx
        .insert(schema.inventoryUnits)
        .values({
          acquisitionReference: input.acquisition_reference,
          branchId: input.branch_id,
          chassisNumber: input.chassis_number,
          clientOrganizationId: cid,
          colourId: input.colour_id,
          conditionNotes: input.condition_notes,
          createdByMembershipId: context.membershipId,
          createdByUserId: context.userId,
          currentOdometerKm: input.current_odometer_km,
          engineNumber: input.engine_number,
          expectedArrivalAt: input.expected_arrival_at ? new Date(input.expected_arrival_at) : null,
          ownershipType: input.ownership_type,
          receivedAt: input.received_at
            ? new Date(input.received_at)
            : input.status === 'AVAILABLE' || input.status === 'DEMO'
              ? new Date()
              : null,
          serviceDueAt: input.service_due_at ? new Date(input.service_due_at) : null,
          status: input.status,
          unitReference: input.unit_reference,
          variantId: input.variant_id,
          vin: input.vin,
        })
        .returning();
      if (!unit) throw new Error('Inventory unit insert did not return a row.');
      const rideLinks = await tx
        .update(schema.testRideJobs)
        .set({ inventoryUnitId: unit.id })
        .where(
          and(
            eq(schema.testRideJobs.clientOrganizationId, cid),
            eq(schema.testRideJobs.branchId, unit.branchId),
            eq(schema.testRideJobs.demoVehicleReference, unit.unitReference),
            sql`${schema.testRideJobs.inventoryUnitId} is null`,
          ),
        )
        .returning({ id: schema.testRideJobs.id });
      await tx
        .update(schema.demoVehicleBookings)
        .set({ inventoryUnitId: unit.id })
        .where(
          and(
            eq(schema.demoVehicleBookings.clientOrganizationId, cid),
            eq(schema.demoVehicleBookings.branchId, unit.branchId),
            eq(schema.demoVehicleBookings.demoVehicleReference, unit.unitReference),
            sql`${schema.demoVehicleBookings.inventoryUnitId} is null`,
          ),
        );
      await this.recordTransition(
        tx,
        context,
        unit,
        null,
        unit.status,
        'UNIT_CREATED',
        'Physical stock created.',
        correlationId,
        {
          legacy_test_ride_links: rideLinks.length,
          source_batch_reference: sourceBatchReference ?? null,
          unit_reference: unit.unitReference,
        },
      );
      return { id: unit.id, status: unit.status, version: unit.version };
    } catch (error) {
      if (databaseCode(error) === '23505')
        throw conflict(
          'INVENTORY_IDENTITY_CONFLICT',
          'VIN, chassis, engine or unit reference already exists for this tenant.',
        );
      throw error;
    }
  }

  private async unitRows(where: SQL | undefined, limit: number) {
    return this.connection.db
      .select({
        branchName: schema.branches.name,
        colourName: schema.inventoryColours.name,
        modelName: schema.inventoryModels.name,
        unit: schema.inventoryUnits,
        variantName: schema.inventoryVariants.name,
      })
      .from(schema.inventoryUnits)
      .innerJoin(
        schema.branches,
        and(
          eq(schema.branches.clientOrganizationId, schema.inventoryUnits.clientOrganizationId),
          eq(schema.branches.id, schema.inventoryUnits.branchId),
        ),
      )
      .innerJoin(
        schema.inventoryVariants,
        and(
          eq(
            schema.inventoryVariants.clientOrganizationId,
            schema.inventoryUnits.clientOrganizationId,
          ),
          eq(schema.inventoryVariants.id, schema.inventoryUnits.variantId),
        ),
      )
      .innerJoin(
        schema.inventoryModels,
        and(
          eq(
            schema.inventoryModels.clientOrganizationId,
            schema.inventoryUnits.clientOrganizationId,
          ),
          eq(schema.inventoryModels.id, schema.inventoryVariants.modelId),
        ),
      )
      .innerJoin(
        schema.inventoryColours,
        and(
          eq(
            schema.inventoryColours.clientOrganizationId,
            schema.inventoryUnits.clientOrganizationId,
          ),
          eq(schema.inventoryColours.id, schema.inventoryUnits.colourId),
        ),
      )
      .where(where)
      .orderBy(
        asc(schema.inventoryUnits.status),
        desc(schema.inventoryUnits.receivedAt),
        asc(schema.inventoryUnits.id),
      )
      .limit(limit);
  }

  private async accessibleUnitRow(context: AuthorizationContext, unitId: string) {
    const cid = clientId(context);
    const rows = await this.unitRows(
      and(
        eq(schema.inventoryUnits.clientOrganizationId, cid),
        eq(schema.inventoryUnits.id, unitId),
      ),
      1,
    );
    const row = rows[0];
    if (!row || !this.policy.canAccessBranch(context, row.unit.branchId))
      throw notFound('Inventory unit not found.');
    return row;
  }

  private presentUnit(
    row: Awaited<ReturnType<InventoryService['unitRows']>>[number],
    sensitive: boolean,
  ) {
    const ageDays = row.unit.receivedAt
      ? Math.max(0, Math.floor((Date.now() - row.unit.receivedAt.getTime()) / 86_400_000))
      : null;
    return {
      age_days: ageDays,
      branch_id: row.unit.branchId,
      branch_name: row.branchName,
      chassis_number: sensitive ? row.unit.chassisNumber : maskIdentity(row.unit.chassisNumber),
      colour_id: row.unit.colourId,
      colour_name: row.colourName,
      engine_number: sensitive ? row.unit.engineNumber : maskIdentity(row.unit.engineNumber),
      expected_arrival_at: row.unit.expectedArrivalAt?.toISOString() ?? null,
      id: row.unit.id,
      model_name: row.modelName,
      received_at: row.unit.receivedAt?.toISOString() ?? null,
      status: row.unit.status,
      unit_reference: row.unit.unitReference,
      variant_id: row.unit.variantId,
      variant_name: row.variantName,
      version: row.unit.version,
      vin: sensitive ? row.unit.vin : maskIdentity(row.unit.vin),
    };
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
          .insert(schema.inventoryCommandReceipts)
          .values({
            clientOrganizationId: cid,
            commandType,
            idempotencyKey,
            requestFingerprint,
            responseSnapshot: {},
          })
          .onConflictDoNothing()
          .returning({ id: schema.inventoryCommandReceipts.id });
        if (inserted.length === 0) {
          const [receipt] = await tx
            .select()
            .from(schema.inventoryCommandReceipts)
            .where(
              and(
                eq(schema.inventoryCommandReceipts.clientOrganizationId, cid),
                eq(schema.inventoryCommandReceipts.idempotencyKey, idempotencyKey),
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
              'This idempotency key was used for another inventory command.',
            );
          return receipt.responseSnapshot as T;
        }
        const response = await operation(tx, cid);
        const receiptId = inserted[0]?.id;
        if (!receiptId) throw new Error('Inventory receipt insert did not return an ID.');
        await tx
          .update(schema.inventoryCommandReceipts)
          .set({ responseSnapshot: response })
          .where(eq(schema.inventoryCommandReceipts.id, receiptId));
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
          'INVENTORY_CONFLICT',
          'The requested reservation, allocation or identity is already active.',
        );
      throw error;
    }
  }

  private async lockUnit(tx: Tx, cid: string, unitId: string): Promise<void> {
    await tx.execute(sql`
      select ${schema.inventoryUnits.id}
      from ${schema.inventoryUnits}
      where ${schema.inventoryUnits.clientOrganizationId} = ${cid}
        and ${schema.inventoryUnits.id} = ${unitId}
      for update
    `);
  }

  private async lockAndGetUnit(
    tx: Tx,
    context: AuthorizationContext,
    cid: string,
    unitId: string,
  ): Promise<Unit> {
    await this.lockUnit(tx, cid, unitId);
    const unit = await this.unitById(tx, cid, unitId);
    if (!unit) throw notFound('Inventory unit not found.');
    this.assertAccessibleUnit(context, unit);
    return unit;
  }

  private assertAccessibleUnit(context: AuthorizationContext, unit: Unit): void {
    if (
      context.clientOrganizationId !== unit.clientOrganizationId ||
      !this.policy.canAccessBranch(context, unit.branchId)
    )
      throw notFound('Inventory unit not found.');
  }

  private async unitById(tx: Tx, cid: string, unitId: string): Promise<Unit | undefined> {
    const [unit] = await tx
      .select()
      .from(schema.inventoryUnits)
      .where(
        and(
          eq(schema.inventoryUnits.clientOrganizationId, cid),
          eq(schema.inventoryUnits.id, unitId),
        ),
      )
      .limit(1);
    return unit;
  }

  private reservationById(tx: Tx, cid: string, reservationId: string) {
    return tx
      .select()
      .from(schema.inventoryReservations)
      .where(
        and(
          eq(schema.inventoryReservations.clientOrganizationId, cid),
          eq(schema.inventoryReservations.id, reservationId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
  }

  private allocationById(tx: Tx, cid: string, allocationId: string) {
    return tx
      .select()
      .from(schema.inventoryAllocations)
      .where(
        and(
          eq(schema.inventoryAllocations.clientOrganizationId, cid),
          eq(schema.inventoryAllocations.id, allocationId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
  }

  private assertVersion(unit: Unit, expectedVersion: number): void {
    if (unit.version !== expectedVersion)
      throw conflict('CONFLICT', 'The inventory unit changed. Refresh before retrying.');
  }

  private assertStatus(unit: Unit, allowed: InventoryUnitStatus[]): void {
    if (!allowed.includes(unit.status))
      throw conflict('INVALID_TRANSITION', `A ${unit.status} unit cannot perform this transition.`);
  }

  private async updateUnit(
    tx: Tx,
    unit: Unit,
    status: InventoryUnitStatus,
    values: Partial<Unit>,
  ): Promise<Unit> {
    const [updated] = await tx
      .update(schema.inventoryUnits)
      .set({ ...values, status, updatedAt: new Date(), version: unit.version + 1 })
      .where(
        and(
          eq(schema.inventoryUnits.clientOrganizationId, unit.clientOrganizationId),
          eq(schema.inventoryUnits.id, unit.id),
          eq(schema.inventoryUnits.version, unit.version),
          eq(schema.inventoryUnits.status, unit.status),
        ),
      )
      .returning();
    if (!updated)
      throw conflict('CONFLICT', 'The inventory unit changed. Refresh before retrying.');
    return updated;
  }

  private async recordTransition(
    tx: Tx,
    context: AuthorizationContext | undefined,
    unit: Unit,
    fromStatus: InventoryUnitStatus | null,
    toStatus: InventoryUnitStatus,
    eventType: string,
    reason: string,
    correlationId: string,
    evidence: Record<string, unknown>,
  ): Promise<void> {
    await tx.insert(schema.inventoryUnitStatusHistory).values({
      actorMembershipId: context?.membershipId ?? null,
      actorUserId: context?.userId ?? null,
      clientOrganizationId: unit.clientOrganizationId,
      eventType,
      evidence,
      fromStatus,
      inventoryUnitId: unit.id,
      reason,
      toStatus,
    });
    await tx.insert(schema.outboxEvents).values({
      aggregateId: unit.id,
      aggregateType: 'INVENTORY_UNIT',
      clientOrganizationId: unit.clientOrganizationId,
      correlationId,
      eventType: `INVENTORY_${eventType}`,
      payload: { branch_id: unit.branchId, status: toStatus, version: unit.version, ...evidence },
      scope: 'CLIENT',
    });
    await tx.insert(schema.auditEvents).values({
      action: `INVENTORY_${eventType}`,
      actorId: context?.userId ?? null,
      actorType: context ? 'USER' : 'SYSTEM',
      clientOrganizationId: unit.clientOrganizationId,
      correlationId,
      effectiveRole: context?.roleCode ?? null,
      entityId: unit.id,
      entityType: 'INVENTORY_UNIT',
      newSummary: {
        branch_id: unit.branchId,
        status: toStatus,
        version: unit.version,
        ...evidence,
      },
      oldSummary: fromStatus ? { status: fromStatus } : null,
      outcome: 'SUCCESS',
      reason,
      scope: 'CLIENT',
    });
  }

  private async recordAuditOnly(
    tx: Tx,
    context: AuthorizationContext,
    cid: string,
    action: string,
    entityId: string,
    correlationId: string,
    summary: Record<string, unknown>,
  ): Promise<void> {
    await tx.insert(schema.outboxEvents).values({
      aggregateId: entityId,
      aggregateType: 'INVENTORY_CATALOGUE',
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
      entityType: 'INVENTORY_CATALOGUE',
      newSummary: summary,
      outcome: 'SUCCESS',
      scope: 'CLIENT',
    });
  }

  private async expireReservationsTx(
    tx: Tx,
    cid: string,
    now: Date,
    correlationId: string,
    context?: AuthorizationContext,
  ): Promise<number> {
    const expired = await tx
      .select({
        id: schema.inventoryReservations.id,
        unitId: schema.inventoryReservations.inventoryUnitId,
      })
      .from(schema.inventoryReservations)
      .where(
        and(
          eq(schema.inventoryReservations.clientOrganizationId, cid),
          eq(schema.inventoryReservations.status, 'ACTIVE'),
          lte(schema.inventoryReservations.expiresAt, now),
        ),
      )
      .orderBy(asc(schema.inventoryReservations.expiresAt), asc(schema.inventoryReservations.id))
      .limit(500);
    let count = 0;
    for (const candidate of expired) {
      await this.lockUnit(tx, cid, candidate.unitId);
      const reservation = await this.reservationById(tx, cid, candidate.id);
      const unit = await this.unitById(tx, cid, candidate.unitId);
      if (
        !reservation ||
        !unit ||
        (context !== undefined && !this.policy.canAccessBranch(context, unit.branchId)) ||
        reservation.status !== 'ACTIVE' ||
        reservation.expiresAt > now
      )
        continue;
      await tx
        .update(schema.inventoryReservations)
        .set({ releasedAt: now, releasedReason: 'Reservation expired.', status: 'EXPIRED' })
        .where(eq(schema.inventoryReservations.id, reservation.id));
      if (unit.status === 'RESERVED') {
        const updated = await this.updateUnit(tx, unit, 'AVAILABLE', {});
        await this.recordTransition(
          tx,
          context,
          updated,
          'RESERVED',
          'AVAILABLE',
          'RESERVATION_EXPIRED',
          'Reservation expiry elapsed.',
          correlationId,
          {
            reservation_id: reservation.id,
          },
        );
      }
      count += 1;
    }
    return count;
  }
}
