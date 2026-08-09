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
  assignDeliveryRequestSchema,
  completeDeliveryProofUploadRequestSchema,
  completeDeliveryRequestSchema,
  createDeliveryJobRequestSchema,
  decideDeliveryRescheduleSchema,
  deliveryExceptionRequestSchema,
  deliveryListQuerySchema,
  deliveryProofDownloadQuerySchema,
  initiateDeliveryProofUploadRequestSchema,
  markDeliveryReadyRequestSchema,
  recordDeliveryLocationsRequestSchema,
  recordReceivedByProofRequestSchema,
  requestDeliveryOtpRequestSchema,
  requestDeliveryRescheduleSchema,
  reviewDeliveryProofRequestSchema,
  scheduleDeliveryRequestSchema,
  startDeliveryRequestSchema,
  updateDeliveryChecklistRequestSchema,
  updateDeliverySettingsRequestSchema,
  verifyDeliveryOtpRequestSchema,
  type AssignDeliveryRequest,
  type CompleteDeliveryProofUploadRequest,
  type CompleteDeliveryRequest,
  type CreateDeliveryJobRequest,
  type DecideDeliveryReschedule,
  type DeliveryExceptionRequest,
  type DeliveryListQuery,
  type InitiateDeliveryProofUploadRequest,
  type MarkDeliveryReadyRequest,
  type RecordDeliveryLocationsRequest,
  type RecordReceivedByProofRequest,
  type RequestDeliveryOtpRequest,
  type RequestDeliveryReschedule,
  type ReviewDeliveryProofRequest,
  type ScheduleDeliveryRequest,
  type StartDeliveryRequest,
  type UpdateDeliveryChecklistRequest,
  type UpdateDeliverySettingsRequest,
  type VerifyDeliveryOtpRequest,
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
import { DeliveryService } from './delivery.service.js';

function correlation(request: AuthenticatedRequest): string {
  return resolveCorrelationId(request);
}

@ApiTags('delivery')
@ApiBearerAuth()
@Controller('delivery')
@RequireClientContext()
@RequireClientModule('DELIVERY_RC')
export class DeliveryController {
  constructor(@Inject(DeliveryService) private readonly delivery: DeliveryService) {}

  @Get()
  @RequirePermissions('delivery.jobs.read')
  list(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query(new ZodSchemaValidationPipe(deliveryListQuerySchema)) query: DeliveryListQuery,
  ) {
    return this.delivery.list(context, query);
  }

  @Get('active')
  @RequirePermissions('delivery.active_map.read')
  active(@CurrentAuthorization() context: AuthorizationContext) {
    return this.delivery.active(context);
  }

  @Get('executives')
  @RequirePermissions('delivery.jobs.assign')
  executives(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query('branch_id', new ParseUUIDPipe()) branchId: string,
  ) {
    return this.delivery.executives(context, branchId);
  }

  @Get('settings')
  @RequirePermissions('delivery.settings.manage')
  settings(@CurrentAuthorization() context: AuthorizationContext) {
    return this.delivery.getSettings(context);
  }

  @Post('settings')
  @RequirePermissions('delivery.settings.manage')
  updateSettings(
    @CurrentAuthorization() context: AuthorizationContext,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(updateDeliverySettingsRequestSchema))
    body: UpdateDeliverySettingsRequest,
  ) {
    return this.delivery.updateSettings(context, body, key, correlation(request));
  }

  @Post('tracking/reconcile')
  @RequirePermissions('delivery.active_map.read')
  reconcile(
    @CurrentAuthorization() context: AuthorizationContext,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.delivery.reconcile(context, correlation(request));
  }

  @Post()
  @RequirePermissions('delivery.jobs.manage')
  @ApiOperation({ summary: 'Create one delivery operation for a confirmed allocated booking' })
  create(
    @CurrentAuthorization() context: AuthorizationContext,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(createDeliveryJobRequestSchema))
    body: CreateDeliveryJobRequest,
  ) {
    return this.delivery.create(context, body, key, correlation(request));
  }

  @Get(':jobId')
  @RequirePermissions('delivery.jobs.read')
  detail(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
  ) {
    return this.delivery.detail(context, jobId);
  }

  @Post(':jobId/assign')
  @RequirePermissions('delivery.jobs.assign')
  assign(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(assignDeliveryRequestSchema)) body: AssignDeliveryRequest,
  ) {
    return this.delivery.assign(context, jobId, body, key, correlation(request));
  }

  @Post(':jobId/checklist')
  @RequirePermissions('delivery.checklists.manage')
  checklist(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(updateDeliveryChecklistRequestSchema))
    body: UpdateDeliveryChecklistRequest,
  ) {
    return this.delivery.checklist(context, jobId, body, key, correlation(request));
  }

  @Post(':jobId/ready')
  @RequirePermissions('delivery.jobs.manage')
  ready(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(markDeliveryReadyRequestSchema))
    body: MarkDeliveryReadyRequest,
  ) {
    return this.delivery.markReady(context, jobId, body, key, correlation(request));
  }

  @Post(':jobId/schedule')
  @RequirePermissions('delivery.jobs.manage')
  schedule(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(scheduleDeliveryRequestSchema)) body: ScheduleDeliveryRequest,
  ) {
    return this.delivery.schedule(context, jobId, body, key, correlation(request));
  }

  @Post(':jobId/start')
  @RequirePermissions('delivery.jobs.execute')
  start(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(startDeliveryRequestSchema)) body: StartDeliveryRequest,
  ) {
    return this.delivery.start(context, jobId, body, key, correlation(request));
  }

  @Post(':jobId/location')
  @RequirePermissions('delivery.location.write')
  location(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(recordDeliveryLocationsRequestSchema))
    body: RecordDeliveryLocationsRequest,
  ) {
    return this.delivery.locations(context, jobId, body, correlation(request));
  }

  @Post(':jobId/proofs/received-by')
  @RequirePermissions('delivery.proofs.upload')
  receivedBy(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(recordReceivedByProofRequestSchema))
    body: RecordReceivedByProofRequest,
  ) {
    return this.delivery.receivedBy(context, jobId, body, key, correlation(request));
  }

  @Post(':jobId/proofs/initiate')
  @RequirePermissions('delivery.proofs.upload')
  initiateProof(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(initiateDeliveryProofUploadRequestSchema))
    body: InitiateDeliveryProofUploadRequest,
  ) {
    return this.delivery.initiateProofUpload(context, jobId, body, key, correlation(request));
  }

  @Post(':jobId/proofs/complete')
  @RequirePermissions('delivery.proofs.upload')
  completeProof(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(completeDeliveryProofUploadRequestSchema))
    body: CompleteDeliveryProofUploadRequest,
  ) {
    return this.delivery.completeProofUpload(context, jobId, body, key, correlation(request));
  }

  @Post(':jobId/otp/request')
  @RequirePermissions('delivery.proofs.upload')
  requestOtp(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(requestDeliveryOtpRequestSchema))
    body: RequestDeliveryOtpRequest,
  ) {
    return this.delivery.requestOtp(context, jobId, body, correlation(request));
  }

  @Post(':jobId/otp/verify')
  @RequirePermissions('delivery.proofs.upload')
  verifyOtp(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(verifyDeliveryOtpRequestSchema))
    body: VerifyDeliveryOtpRequest,
  ) {
    return this.delivery.verifyOtp(context, jobId, body, key, correlation(request));
  }

  @Post(':jobId/complete')
  @RequirePermissions('delivery.jobs.execute')
  complete(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(completeDeliveryRequestSchema)) body: CompleteDeliveryRequest,
  ) {
    return this.delivery.complete(context, jobId, body, key, correlation(request));
  }

  @Post(':jobId/delay')
  @RequirePermissions('delivery.jobs.execute')
  delay(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(deliveryExceptionRequestSchema))
    body: DeliveryExceptionRequest,
  ) {
    return this.delivery.delay(context, jobId, body, key, correlation(request));
  }

  @Post(':jobId/fail')
  @RequirePermissions('delivery.jobs.execute')
  fail(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(deliveryExceptionRequestSchema))
    body: DeliveryExceptionRequest,
  ) {
    return this.delivery.fail(context, jobId, body, key, correlation(request));
  }

  @Post(':jobId/cancel')
  @RequirePermissions('delivery.jobs.cancel')
  cancel(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(deliveryExceptionRequestSchema))
    body: DeliveryExceptionRequest,
  ) {
    return this.delivery.cancel(context, jobId, body, key, correlation(request));
  }

  @Post(':jobId/reschedule')
  @RequirePermissions('delivery.jobs.execute')
  requestReschedule(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(requestDeliveryRescheduleSchema))
    body: RequestDeliveryReschedule,
  ) {
    return this.delivery.requestReschedule(context, jobId, body, key, correlation(request));
  }

  @Post(':jobId/reschedule-decision')
  @RequirePermissions('delivery.reschedules.approve')
  decideReschedule(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(decideDeliveryRescheduleSchema))
    body: DecideDeliveryReschedule,
  ) {
    return this.delivery.decideReschedule(context, jobId, body, key, correlation(request));
  }

  @Post('proofs/:proofId/review')
  @RequirePermissions('delivery.proofs.review')
  reviewProof(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('proofId', new ParseUUIDPipe()) proofId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(reviewDeliveryProofRequestSchema))
    body: ReviewDeliveryProofRequest,
  ) {
    return this.delivery.reviewProof(context, proofId, body, key, correlation(request));
  }

  @Get('proofs/:proofId/download')
  @RequirePermissions('delivery.proofs.review')
  downloadProof(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('proofId', new ParseUUIDPipe()) proofId: string,
    @Req() request: AuthenticatedRequest,
    @Query(new ZodSchemaValidationPipe(deliveryProofDownloadQuerySchema))
    query: { purpose: string },
  ) {
    return this.delivery.proofDownload(context, proofId, query.purpose, correlation(request));
  }
}
