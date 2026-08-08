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
  assignTestRideRequestSchema,
  bookTestRideRequestSchema,
  completeTestRideRequestSchema,
  confirmTestRideRequestSchema,
  createTestRideRequestSchema,
  endTestRideRequestSchema,
  recordTestRideLocationsRequestSchema,
  startTestRideRequestSchema,
  stopTestRideTrackingRequestSchema,
  testRideListQuerySchema,
  type AssignTestRideRequest,
  type BookTestRideRequest,
  type CompleteTestRideRequest,
  type ConfirmTestRideRequest,
  type CreateTestRideRequest,
  type EndTestRideRequest,
  type RecordTestRideLocationsRequest,
  type StartTestRideRequest,
  type StopTestRideTrackingRequest,
  type TestRideListQuery,
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
import { TestRidesService } from './test-rides.service.js';

function correlation(request: AuthenticatedRequest): string {
  return resolveCorrelationId(request);
}

@ApiTags('test rides')
@ApiBearerAuth()
@Controller('test-rides')
@RequireClientContext()
@RequireClientModule('TEST_RIDES')
export class TestRidesController {
  constructor(@Inject(TestRidesService) private readonly rides: TestRidesService) {}

  @Get()
  @RequirePermissions('test_rides.read')
  @ApiOperation({ summary: 'List scoped test rides with stale-aware current location' })
  list(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query(new ZodSchemaValidationPipe(testRideListQuerySchema)) query: TestRideListQuery,
  ) {
    return this.rides.list(context, query);
  }

  @Post()
  @RequirePermissions('test_rides.schedule')
  @ApiOperation({ summary: 'Schedule a tenant-scoped test-ride request for a canonical Lead' })
  create(
    @CurrentAuthorization() context: AuthorizationContext,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(createTestRideRequestSchema)) body: CreateTestRideRequest,
  ) {
    return this.rides.create(context, body, idempotencyKey, correlation(request));
  }

  @Get('executives')
  @RequirePermissions('test_rides.assign')
  @ApiOperation({ summary: 'List active eligible Test Ride Executives for a scoped branch' })
  executives(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query('branch_id', new ParseUUIDPipe()) branchId: string,
  ) {
    return this.rides.executives(context, branchId);
  }

  @Get('active')
  @RequirePermissions('test_rides.active_map.read')
  @ApiOperation({ summary: 'List ACTIVE jobs only for the manager monitoring workspace' })
  active(@CurrentAuthorization() context: AuthorizationContext) {
    return this.rides.list(context, { assigned_to_me: false, limit: 200, status: 'ACTIVE' });
  }

  @Post('tracking/reconcile')
  @RequirePermissions('test_rides.active_map.read')
  @ApiOperation({ summary: 'Stop expired tracking and purge expired location samples' })
  reconcileTracking(
    @CurrentAuthorization() context: AuthorizationContext,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.rides.reconcileTracking(context, correlation(request));
  }

  @Get(':rideId')
  @RequirePermissions('test_rides.read')
  detail(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('rideId', new ParseUUIDPipe()) rideId: string,
  ) {
    return this.rides.detail(context, rideId);
  }

  @Post(':rideId/book')
  @RequirePermissions('test_rides.schedule')
  book(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('rideId', new ParseUUIDPipe()) rideId: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(bookTestRideRequestSchema)) body: BookTestRideRequest,
  ) {
    return this.rides.book(context, rideId, body, correlation(request));
  }

  @Post(':rideId/confirm')
  @RequirePermissions('test_rides.schedule')
  confirm(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('rideId', new ParseUUIDPipe()) rideId: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(confirmTestRideRequestSchema)) body: ConfirmTestRideRequest,
  ) {
    return this.rides.confirm(context, rideId, body, correlation(request));
  }

  @Post(':rideId/assign')
  @RequirePermissions('test_rides.assign')
  assign(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('rideId', new ParseUUIDPipe()) rideId: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(assignTestRideRequestSchema)) body: AssignTestRideRequest,
  ) {
    return this.rides.assign(context, rideId, body, correlation(request));
  }

  @Post(':rideId/start')
  @RequirePermissions('test_rides.execute')
  start(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('rideId', new ParseUUIDPipe()) rideId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(startTestRideRequestSchema)) body: StartTestRideRequest,
  ) {
    return this.rides.start(context, rideId, body, idempotencyKey, correlation(request));
  }

  @Post(':rideId/location')
  @RequirePermissions('test_rides.location.write')
  locations(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('rideId', new ParseUUIDPipe()) rideId: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(recordTestRideLocationsRequestSchema))
    body: RecordTestRideLocationsRequest,
  ) {
    return this.rides.locations(context, rideId, body, correlation(request));
  }

  @Post(':rideId/tracking/stop')
  @RequirePermissions('test_rides.execute')
  stopTracking(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('rideId', new ParseUUIDPipe()) rideId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(stopTestRideTrackingRequestSchema))
    body: StopTestRideTrackingRequest,
  ) {
    return this.rides.stopTracking(context, rideId, body, idempotencyKey, correlation(request));
  }

  @Post(':rideId/complete')
  @RequirePermissions('test_rides.execute')
  complete(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('rideId', new ParseUUIDPipe()) rideId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(completeTestRideRequestSchema)) body: CompleteTestRideRequest,
  ) {
    return this.rides.complete(context, rideId, body, idempotencyKey, correlation(request));
  }

  @Post(':rideId/cancel')
  @RequirePermissions('test_rides.cancel')
  cancel(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('rideId', new ParseUUIDPipe()) rideId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(endTestRideRequestSchema)) body: EndTestRideRequest,
  ) {
    return this.rides.cancel(context, rideId, body, idempotencyKey, correlation(request));
  }

  @Post(':rideId/no-show')
  @RequirePermissions('test_rides.cancel')
  noShow(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('rideId', new ParseUUIDPipe()) rideId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(endTestRideRequestSchema)) body: EndTestRideRequest,
  ) {
    return this.rides.noShow(context, rideId, body, idempotencyKey, correlation(request));
  }
}
