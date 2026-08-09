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
  allotRegistrationNumberRequestSchema,
  assignRegistrationCaseRequestSchema,
  closeRegistrationCaseRequestSchema,
  completeRcUploadRequestSchema,
  correctRegistrationCaseRequestSchema,
  createRegistrationCaseRequestSchema,
  initiateRcUploadRequestSchema,
  markRcPendingRequestSchema,
  registrationDocumentDownloadQuerySchema,
  registrationListQuerySchema,
  reopenRegistrationCaseRequestSchema,
  reviewRcDocumentRequestSchema,
  shareRcRequestSchema,
  startRegistrationRequestSchema,
  submitRtoRequestSchema,
  updateRegistrationSettingsRequestSchema,
  type AllotRegistrationNumberRequest,
  type AssignRegistrationCaseRequest,
  type CloseRegistrationCaseRequest,
  type CompleteRcUploadRequest,
  type CorrectRegistrationCaseRequest,
  type InitiateRcUploadRequest,
  type MarkRcPendingRequest,
  type RegistrationListQuery,
  type ReopenRegistrationCaseRequest,
  type ReviewRcDocumentRequest,
  type ShareRcRequest,
  type StartRegistrationRequest,
  type SubmitRtoRequest,
  type UpdateRegistrationSettingsRequest,
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
import { RegistrationService } from './registration.service.js';

const correlation = (request: AuthenticatedRequest): string => resolveCorrelationId(request);

@ApiTags('registration')
@ApiBearerAuth()
@Controller('registration-cases')
@RequireClientContext()
@RequireClientModule('DELIVERY_RC')
export class RegistrationController {
  constructor(@Inject(RegistrationService) private readonly registration: RegistrationService) {}

  @Get()
  @RequirePermissions('registration.cases.read')
  list(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query(new ZodSchemaValidationPipe(registrationListQuerySchema)) query: RegistrationListQuery,
  ) {
    return this.registration.list(context, query);
  }

  @Get('aging')
  @RequirePermissions('registration.aging.read')
  aging(@CurrentAuthorization() context: AuthorizationContext) {
    return this.registration.aging(context);
  }

  @Get('executives')
  @RequirePermissions('registration.cases.assign')
  executives(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query('branch_id', new ParseUUIDPipe()) branchId: string,
  ) {
    return this.registration.executives(context, branchId);
  }

  @Get('settings')
  @RequirePermissions('registration.settings.manage')
  settings(@CurrentAuthorization() context: AuthorizationContext) {
    return this.registration.getSettings(context);
  }

  @Post('settings')
  @RequirePermissions('registration.settings.manage')
  updateSettings(
    @CurrentAuthorization() context: AuthorizationContext,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(updateRegistrationSettingsRequestSchema))
    body: UpdateRegistrationSettingsRequest,
  ) {
    return this.registration.updateSettings(context, body, key, correlation(request));
  }

  @Post()
  @RequirePermissions('registration.cases.manage')
  @ApiOperation({ summary: 'Create one registration case for a confirmed allocated booking' })
  create(
    @CurrentAuthorization() context: AuthorizationContext,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(createRegistrationCaseRequestSchema))
    body: {
      assigned_membership_id: string | null;
      booking_id: string;
      expected_completion_at: string | null;
    },
  ) {
    return this.registration.create(context, body, key, correlation(request));
  }

  @Get(':caseId')
  @RequirePermissions('registration.cases.read')
  detail(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('caseId', new ParseUUIDPipe()) caseId: string,
  ) {
    return this.registration.detail(context, caseId);
  }

  @Post(':caseId/assign')
  @RequirePermissions('registration.cases.assign')
  assign(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('caseId', new ParseUUIDPipe()) caseId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(assignRegistrationCaseRequestSchema))
    body: AssignRegistrationCaseRequest,
  ) {
    return this.registration.assign(context, caseId, body, key, correlation(request));
  }

  @Post(':caseId/start')
  @RequirePermissions('registration.cases.execute')
  start(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('caseId', new ParseUUIDPipe()) caseId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(startRegistrationRequestSchema))
    body: StartRegistrationRequest,
  ) {
    return this.registration.start(context, caseId, body, key, correlation(request));
  }

  @Post(':caseId/rto-submit')
  @RequirePermissions('registration.cases.execute')
  submitRto(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('caseId', new ParseUUIDPipe()) caseId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(submitRtoRequestSchema)) body: SubmitRtoRequest,
  ) {
    return this.registration.submitRto(context, caseId, body, key, correlation(request));
  }

  @Post(':caseId/number-allotment')
  @RequirePermissions('registration.cases.execute')
  allotNumber(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('caseId', new ParseUUIDPipe()) caseId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(allotRegistrationNumberRequestSchema))
    body: AllotRegistrationNumberRequest,
  ) {
    return this.registration.allotNumber(context, caseId, body, key, correlation(request));
  }

  @Post(':caseId/rc-pending')
  @RequirePermissions('registration.cases.execute')
  pending(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('caseId', new ParseUUIDPipe()) caseId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(markRcPendingRequestSchema)) body: MarkRcPendingRequest,
  ) {
    return this.registration.markPending(context, caseId, body, key, correlation(request));
  }

  @Post(':caseId/rc-copy/initiate')
  @RequirePermissions('registration.documents.upload')
  initiateRc(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('caseId', new ParseUUIDPipe()) caseId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(initiateRcUploadRequestSchema)) body: InitiateRcUploadRequest,
  ) {
    return this.registration.initiateRcUpload(context, caseId, body, key, correlation(request));
  }

  @Post(':caseId/rc-copy/complete')
  @RequirePermissions('registration.documents.upload')
  completeRc(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('caseId', new ParseUUIDPipe()) caseId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(completeRcUploadRequestSchema)) body: CompleteRcUploadRequest,
  ) {
    return this.registration.completeRcUpload(context, caseId, body, key, correlation(request));
  }

  @Post(':caseId/share')
  @RequirePermissions('registration.documents.share')
  share(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('caseId', new ParseUUIDPipe()) caseId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(shareRcRequestSchema)) body: ShareRcRequest,
  ) {
    return this.registration.share(context, caseId, body, key, correlation(request));
  }

  @Post(':caseId/close')
  @RequirePermissions('registration.cases.close')
  close(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('caseId', new ParseUUIDPipe()) caseId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(closeRegistrationCaseRequestSchema))
    body: CloseRegistrationCaseRequest,
  ) {
    return this.registration.close(context, caseId, body, key, correlation(request));
  }

  @Post(':caseId/reopen')
  @RequirePermissions('registration.cases.reopen')
  reopen(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('caseId', new ParseUUIDPipe()) caseId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(reopenRegistrationCaseRequestSchema))
    body: ReopenRegistrationCaseRequest,
  ) {
    return this.registration.reopen(context, caseId, body, key, correlation(request));
  }

  @Post(':caseId/corrections')
  @RequirePermissions('registration.cases.manage')
  correct(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('caseId', new ParseUUIDPipe()) caseId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(correctRegistrationCaseRequestSchema))
    body: CorrectRegistrationCaseRequest,
  ) {
    return this.registration.correct(context, caseId, body, key, correlation(request));
  }

  @Post('documents/:documentId/review')
  @RequirePermissions('registration.documents.review')
  review(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(reviewRcDocumentRequestSchema)) body: ReviewRcDocumentRequest,
  ) {
    return this.registration.reviewDocument(context, documentId, body, key, correlation(request));
  }

  @Get('documents/:documentId/download')
  @RequirePermissions('registration.documents.review')
  download(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Req() request: AuthenticatedRequest,
    @Query(new ZodSchemaValidationPipe(registrationDocumentDownloadQuerySchema))
    query: { purpose: string },
  ) {
    return this.registration.downloadDocument(
      context,
      documentId,
      query.purpose,
      correlation(request),
    );
  }
}
