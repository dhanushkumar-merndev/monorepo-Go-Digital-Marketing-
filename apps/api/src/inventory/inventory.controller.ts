/* Shared Zod contracts are the HTTP validation source of truth. */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createInventoryAllocationRequestSchema,
  createInventoryCatalogueRequestSchema,
  createInventoryReservationRequestSchema,
  createInventoryTransferRequestSchema,
  createInventoryUnitRequestSchema,
  endInventoryTransferRequestSchema,
  extendInventoryReservationRequestSchema,
  importInventoryUnitsRequestSchema,
  inventoryUnitListQuerySchema,
  reallocateInventoryRequestSchema,
  releaseInventoryAllocationRequestSchema,
  releaseInventoryReservationRequestSchema,
  transitionInventoryUnitRequestSchema,
  type CreateInventoryAllocationRequest,
  type CreateInventoryCatalogueRequest,
  type CreateInventoryReservationRequest,
  type CreateInventoryTransferRequest,
  type CreateInventoryUnitRequest,
  type EndInventoryTransferRequest,
  type ExtendInventoryReservationRequest,
  type ImportInventoryUnitsRequest,
  type InventoryUnitListQuery,
  type ReallocateInventoryRequest,
  type ReleaseInventoryAllocationRequest,
  type ReleaseInventoryReservationRequest,
  type TransitionInventoryUnitRequest,
} from '@gdm/contracts';
import {
  CurrentAuthorization,
  RequireClientContext,
  RequireClientModule,
  RequirePermissions,
} from '../authorization/authorization.decorators.js';
import type {
  AuthenticatedRequest,
  AuthorizationContext,
} from '../authorization/authorization.types.js';
import { resolveCorrelationId } from '../common/correlation/correlation-id.js';
import { ZodSchemaValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { InventoryService } from './inventory.service.js';

function correlation(request: AuthenticatedRequest): string {
  return resolveCorrelationId(request);
}

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
@RequireClientContext()
@RequireClientModule('INVENTORY')
export class InventoryController {
  constructor(@Inject(InventoryService) private readonly inventory: InventoryService) {}

  @Get('catalogue')
  @RequirePermissions('inventory.catalogue.read')
  @ApiOperation({ summary: 'Read the tenant vehicle catalogue' })
  catalogue(@CurrentAuthorization() context: AuthorizationContext) {
    return this.inventory.catalogue(context);
  }

  @Post('catalogue')
  @RequirePermissions('inventory.catalogue.manage')
  @ApiOperation({ summary: 'Create or update a tenant catalogue combination' })
  createCatalogue(
    @CurrentAuthorization() context: AuthorizationContext,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(createInventoryCatalogueRequestSchema))
    body: CreateInventoryCatalogueRequest,
  ) {
    return this.inventory.createCatalogue(context, body, key, correlation(request));
  }

  @Get('units')
  @RequirePermissions('inventory.units.read')
  @ApiOperation({ summary: 'List branch-scoped physical stock with masked identifiers by default' })
  units(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query(new ZodSchemaValidationPipe(inventoryUnitListQuerySchema)) query: InventoryUnitListQuery,
  ) {
    return this.inventory.list(context, query);
  }

  @Post('units')
  @RequirePermissions('inventory.units.manage')
  @ApiOperation({ summary: 'Create a physical or expected inventory unit' })
  createUnit(
    @CurrentAuthorization() context: AuthorizationContext,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(createInventoryUnitRequestSchema))
    body: CreateInventoryUnitRequest,
  ) {
    return this.inventory.createUnit(context, body, key, correlation(request));
  }

  @Post('units/import')
  @RequirePermissions('inventory.units.manage')
  @ApiOperation({ summary: 'Import a bounded idempotent batch of physical stock rows' })
  importUnits(
    @CurrentAuthorization() context: AuthorizationContext,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(importInventoryUnitsRequestSchema))
    body: ImportInventoryUnitsRequest,
  ) {
    return this.inventory.importUnits(context, body, key, correlation(request));
  }

  @Post('reservations/reconcile')
  @RequirePermissions('inventory.reservations.manage')
  @ApiOperation({ summary: 'Safely expire and release due reservations in authorized branches' })
  reconcileReservations(
    @CurrentAuthorization() context: AuthorizationContext,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.reconcileReservations(context, key, correlation(request));
  }

  @Get('units/:unitId')
  @RequirePermissions('inventory.units.read')
  @ApiOperation({
    summary: 'Read stock detail, reservation/allocation, transfer and immutable history',
  })
  detail(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('unitId', new ParseUUIDPipe()) unitId: string,
  ) {
    return this.inventory.detail(context, unitId);
  }

  @Post('units/:unitId/transition')
  @RequirePermissions('inventory.units.manage')
  @ApiOperation({ summary: 'Perform a controlled inventory state transition' })
  transition(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('unitId', new ParseUUIDPipe()) unitId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(transitionInventoryUnitRequestSchema))
    body: TransitionInventoryUnitRequest,
  ) {
    return this.inventory.transition(context, unitId, body, key, correlation(request));
  }

  @Post('units/:unitId/reservations')
  @RequirePermissions('inventory.reservations.manage')
  reserve(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('unitId', new ParseUUIDPipe()) unitId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(createInventoryReservationRequestSchema))
    body: CreateInventoryReservationRequest,
  ) {
    return this.inventory.reserve(context, unitId, body, key, correlation(request));
  }

  @Post('reservations/:reservationId/extend')
  @RequirePermissions('inventory.reservations.manage')
  extendReservation(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('reservationId', new ParseUUIDPipe()) reservationId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(extendInventoryReservationRequestSchema))
    body: ExtendInventoryReservationRequest,
  ) {
    return this.inventory.extendReservation(
      context,
      reservationId,
      body,
      key,
      correlation(request),
    );
  }

  @Post('reservations/:reservationId/release')
  @RequirePermissions('inventory.reservations.manage')
  releaseReservation(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('reservationId', new ParseUUIDPipe()) reservationId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(releaseInventoryReservationRequestSchema))
    body: ReleaseInventoryReservationRequest,
  ) {
    return this.inventory.releaseReservation(
      context,
      reservationId,
      body,
      key,
      correlation(request),
    );
  }

  @Post('units/:unitId/allocations')
  @RequirePermissions('inventory.allocations.manage')
  allocate(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('unitId', new ParseUUIDPipe()) unitId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(createInventoryAllocationRequestSchema))
    body: CreateInventoryAllocationRequest,
  ) {
    return this.inventory.allocate(context, unitId, body, key, correlation(request));
  }

  @Post('allocations/:allocationId/release')
  @RequirePermissions('inventory.allocations.manage')
  releaseAllocation(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('allocationId', new ParseUUIDPipe()) allocationId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(releaseInventoryAllocationRequestSchema))
    body: ReleaseInventoryAllocationRequest,
  ) {
    return this.inventory.releaseAllocation(context, allocationId, body, key, correlation(request));
  }

  @Post('allocations/:allocationId/reallocate')
  @RequirePermissions('inventory.allocations.reallocate')
  @ApiOperation({ summary: 'Atomically replace an allocated VIN with manager evidence' })
  reallocate(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('allocationId', new ParseUUIDPipe()) allocationId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(reallocateInventoryRequestSchema))
    body: ReallocateInventoryRequest,
  ) {
    return this.inventory.reallocate(context, allocationId, body, key, correlation(request));
  }

  @Post('units/:unitId/transfers')
  @RequirePermissions('inventory.transfers.manage')
  startTransfer(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('unitId', new ParseUUIDPipe()) unitId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(createInventoryTransferRequestSchema))
    body: CreateInventoryTransferRequest,
  ) {
    return this.inventory.startTransfer(context, unitId, body, key, correlation(request));
  }

  @Post('transfers/:transferId/complete')
  @RequirePermissions('inventory.transfers.manage')
  completeTransfer(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('transferId', new ParseUUIDPipe()) transferId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(endInventoryTransferRequestSchema))
    body: EndInventoryTransferRequest,
  ) {
    return this.inventory.endTransfer(
      context,
      transferId,
      body,
      'COMPLETED',
      key,
      correlation(request),
    );
  }

  @Post('transfers/:transferId/cancel')
  @RequirePermissions('inventory.transfers.manage')
  cancelTransfer(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('transferId', new ParseUUIDPipe()) transferId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(endInventoryTransferRequestSchema))
    body: EndInventoryTransferRequest,
  ) {
    return this.inventory.endTransfer(
      context,
      transferId,
      body,
      'CANCELLED',
      key,
      correlation(request),
    );
  }
}
