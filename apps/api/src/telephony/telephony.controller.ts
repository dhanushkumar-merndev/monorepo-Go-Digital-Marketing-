/* Shared Zod contracts remain the HTTP validation source of truth. */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  approveCallOutcomeExceptionRequestSchema,
  beginManualRecordingUploadRequestSchema,
  callListQuerySchema,
  completeManualRecordingUploadRequestSchema,
  configureTelephonyConnectionRequestSchema,
  recordCallOutcomeRequestSchema,
  recordingTargetQuerySchema,
  startCallRequestSchema,
  type ApproveCallOutcomeExceptionRequest,
  type BeginManualRecordingUploadRequest,
  type CallListQuery,
  type CompleteManualRecordingUploadRequest,
  type ConfigureTelephonyConnectionRequest,
  type RecordCallOutcomeRequest,
  type RecordingTargetQuery,
  type StartCallRequest,
} from '@gdm/contracts';
import type { Request } from 'express';
import {
  CurrentAuthorization,
  Public,
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
import { TelephonyService } from './telephony.service.js';

function correlation(request: AuthenticatedRequest): string {
  return resolveCorrelationId(request);
}

@ApiTags('telephony')
@ApiBearerAuth()
@Controller('telephony')
@RequireClientContext()
@RequireClientModule('LEADS')
export class TelephonyController {
  constructor(@Inject(TelephonyService) private readonly telephony: TelephonyService) {}

  @Get('connections')
  @RequirePermissions('telephony.connections.manage')
  @ApiOperation({ summary: 'Read the tenant development telephony connection configuration' })
  connection(@CurrentAuthorization() context: AuthorizationContext) {
    return this.telephony.getConnection(context);
  }

  @Put('connections/development')
  @RequirePermissions('telephony.connections.manage')
  @ApiOperation({ summary: 'Enable or disable the tenant development telephony adapter' })
  configureConnection(
    @CurrentAuthorization() context: AuthorizationContext,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(configureTelephonyConnectionRequestSchema))
    body: ConfigureTelephonyConnectionRequest,
  ) {
    return this.telephony.configureConnection(context, body, correlation(request));
  }

  @Get('health')
  @RequirePermissions('telephony.health.read')
  @ApiOperation({ summary: 'Read provider and webhook health without exposing credentials' })
  health(
    @CurrentAuthorization() context: AuthorizationContext,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.telephony.health(context, correlation(request));
  }

  @Post('reconcile')
  @RequirePermissions('telephony.reconciliation.manage')
  @ApiOperation({ summary: 'Reconcile missed provider events idempotently' })
  reconcile(
    @CurrentAuthorization() context: AuthorizationContext,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.telephony.reconcile(context, correlation(request));
  }

  @Get('calls')
  @RequirePermissions('telephony.calls.read')
  @ApiOperation({ summary: 'List call history within lead assignment scope' })
  calls(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query(new ZodSchemaValidationPipe(callListQuerySchema)) query: CallListQuery,
  ) {
    return this.telephony.calls(context, query);
  }

  @Get('calls/:callId')
  @RequirePermissions('telephony.calls.read')
  @ApiOperation({ summary: 'Read a scoped call timeline and outcome state' })
  detail(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('callId', new ParseUUIDPipe()) callId: string,
  ) {
    return this.telephony.detail(context, callId);
  }

  @Post('calls/:callId/outcome')
  @RequirePermissions('telephony.outcomes.manage')
  @ApiOperation({ summary: 'Record an outcome and optional callback for a scoped call' })
  outcome(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('callId', new ParseUUIDPipe()) callId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(recordCallOutcomeRequestSchema))
    body: RecordCallOutcomeRequest,
  ) {
    return this.telephony.recordOutcome(
      context,
      callId,
      body,
      idempotencyKey,
      correlation(request),
    );
  }

  @Post('calls/:callId/outcome-exception')
  @RequirePermissions('telephony.outcomes.override')
  @ApiOperation({ summary: 'Approve a reasoned supervisor exception for a completed call outcome' })
  outcomeException(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('callId', new ParseUUIDPipe()) callId: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(approveCallOutcomeExceptionRequestSchema))
    body: ApproveCallOutcomeExceptionRequest,
  ) {
    return this.telephony.approveOutcomeException(context, callId, body, correlation(request));
  }

  @Get('calls/:callId/recordings/:recordingId/access')
  @RequirePermissions('telephony.recordings.read')
  @ApiOperation({
    summary: 'Issue a short-lived private recording URL after scope and consent checks',
  })
  recordingAccess(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('callId', new ParseUUIDPipe()) callId: string,
    @Param('recordingId', new ParseUUIDPipe()) recordingId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.telephony.recordingAccess(context, callId, recordingId, correlation(request));
  }

  @Get('recording-targets')
  @RequirePermissions('telephony.recordings.upload')
  @ApiOperation({
    summary: 'Search authorized canonical Lead and Contact targets for a recording upload',
  })
  recordingTargets(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query(new ZodSchemaValidationPipe(recordingTargetQuerySchema)) query: RecordingTargetQuery,
  ) {
    return this.telephony.recordingTargets(context, query.search);
  }

  @Post('recordings/manual-uploads')
  @RequirePermissions('telephony.recordings.upload')
  @ApiOperation({
    summary: 'Create a private signed upload for an authorized manual call recording',
  })
  beginManualRecordingUpload(
    @CurrentAuthorization() context: AuthorizationContext,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(beginManualRecordingUploadRequestSchema))
    body: BeginManualRecordingUploadRequest,
  ) {
    return this.telephony.beginManualRecordingUpload(
      context,
      body,
      idempotencyKey,
      correlation(request),
    );
  }

  @Post('recordings/:recordingId/complete')
  @RequirePermissions('telephony.recordings.upload')
  @ApiOperation({
    summary: 'Verify uploaded audio metadata before making a manual recording available',
  })
  completeManualRecordingUpload(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('recordingId', new ParseUUIDPipe()) recordingId: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(completeManualRecordingUploadRequestSchema))
    body: CompleteManualRecordingUploadRequest,
  ) {
    return this.telephony.completeManualRecordingUpload(
      context,
      recordingId,
      body,
      correlation(request),
    );
  }
}

@ApiTags('telephony webhooks')
@Controller('telephony/webhooks')
export class TelephonyWebhooksController {
  constructor(@Inject(TelephonyService) private readonly telephony: TelephonyService) {}

  @Public()
  @Post(':provider/:connectionKey')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Verify, durably deduplicate and process a provider call event' })
  webhook(
    @Param('provider') provider: string,
    @Param('connectionKey') connectionKey: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() request: Request & { rawBody?: Buffer },
    @Body() payload: unknown,
  ) {
    return this.telephony.receiveWebhook({
      connectionKey,
      correlationId: resolveCorrelationId(request as AuthenticatedRequest),
      headers,
      payload,
      providerCode: provider,
      ...(request.rawBody ? { rawBody: request.rawBody.toString('utf8') } : {}),
    });
  }
}

@ApiTags('lead calls')
@ApiBearerAuth()
@Controller('leads/:leadId/calls')
@RequireClientContext()
@RequireClientModule('LEADS')
export class LeadCallsController {
  constructor(@Inject(TelephonyService) private readonly telephony: TelephonyService) {}

  @Post()
  @RequirePermissions('telephony.calls.start')
  @ApiOperation({ summary: 'Start an approved provider call or expose a tel: fallback' })
  start(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(startCallRequestSchema)) body: StartCallRequest,
  ) {
    return this.telephony.startCall(context, leadId, body, idempotencyKey, correlation(request));
  }
}
