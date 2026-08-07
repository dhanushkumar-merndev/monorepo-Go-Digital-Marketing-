/* Shared Zod contracts are the controller-boundary source of validation truth. */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  assignLeadRequestSchema,
  completeFollowUpRequestSchema,
  completeLeadTaskRequestSchema,
  createFollowUpRequestSchema,
  createLeadNoteRequestSchema,
  createLeadRequestSchema,
  createLeadTaskRequestSchema,
  leadListQuerySchema,
  leadTransitionRequestSchema,
  publicLeadFormRequestSchema,
  resolveDuplicateRequestSchema,
  updateLeadSlaSettingsRequestSchema,
  type AssignLeadRequest,
  type CompleteFollowUpRequest,
  type CompleteLeadTaskRequest,
  type CreateFollowUpRequest,
  type CreateLeadNoteRequest,
  type CreateLeadRequest,
  type CreateLeadTaskRequest,
  type LeadListQuery,
  type LeadTransitionRequest,
  type PublicLeadFormRequest,
  type ResolveDuplicateRequest,
  type UpdateLeadSlaSettingsRequest,
} from '@gdm/contracts';
import type { Request } from 'express';
import { AuthenticationRateLimiter } from '../auth/authentication-rate-limiter.js';
import {
  CurrentAuthorization,
  Public,
  RequireClientContext,
  RequireClientModule,
  RequirePermissions,
} from '../authorization/authorization.decorators.js';
import { ClientModuleAccessService } from '../authorization/client-module-access.service.js';
import type {
  AuthenticatedRequest,
  AuthorizationContext,
} from '../authorization/authorization.types.js';
import { resolveCorrelationId } from '../common/correlation/correlation-id.js';
import { ZodSchemaValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { BOT_PROTECTION, type BotProtectionPort } from './bot-protection.port.js';
import { LEADS_RUNTIME_CONFIG, type LeadsRuntimeConfig } from './leads-runtime-config.js';
import { LeadsService } from './leads.service.js';

function correlation(request: AuthenticatedRequest): string {
  return resolveCorrelationId(request);
}

@ApiTags('public leads')
@Controller('public/lead-forms')
export class PublicLeadFormsController {
  constructor(
    @Inject(LeadsService) private readonly leads: LeadsService,
    @Inject(AuthenticationRateLimiter) private readonly rateLimiter: AuthenticationRateLimiter,
    @Inject(ClientModuleAccessService) private readonly modules: ClientModuleAccessService,
    @Inject(BOT_PROTECTION) private readonly botProtection: BotProtectionPort,
    @Inject(LEADS_RUNTIME_CONFIG) private readonly config: LeadsRuntimeConfig,
  ) {}

  @Public()
  @Post(':clientFormKey')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Capture a consented public lead idempotently' })
  async capture(
    @Param('clientFormKey') formKey: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Body(new ZodSchemaValidationPipe(publicLeadFormRequestSchema)) body: PublicLeadFormRequest,
  ) {
    const form = await this.leads.publicForm(formKey);
    await this.modules.assertEnabled(form.clientOrganizationId, 'LEADS');
    await this.rateLimiter.assertAllowed(
      'public-lead-form',
      `${form.id}:${request.ip ?? 'unknown'}`,
      form.rateLimitPerMinute,
      this.config.publicRateLimitWindowSeconds * 1000,
    );
    if (body.consent.notice_version !== form.consentNoticeVersion)
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [{ field: 'consent.notice_version', reason: 'The active form notice changed.' }],
        message: 'Consent evidence is stale.',
        retryable: false,
      });
    if (form.botProtectionEnabled && !(await this.botProtection.verify(body.bot_token, request.ip)))
      throw new ServiceUnavailableException({
        code: 'PROVIDER_UNAVAILABLE',
        details: [],
        message: 'Bot protection verification failed.',
        retryable: true,
      });
    return this.leads.createPublic(
      form,
      body,
      idempotencyKey,
      resolveCorrelationId(request as AuthenticatedRequest),
    );
  }
}

@ApiTags('leads')
@ApiBearerAuth()
@Controller('leads')
@RequireClientContext()
@RequireClientModule('LEADS')
export class LeadsController {
  constructor(@Inject(LeadsService) private readonly leads: LeadsService) {}

  @Get()
  @RequirePermissions('leads.read')
  @ApiOperation({ summary: 'List leads within effective tenant and assignment scope' })
  list(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query(new ZodSchemaValidationPipe(leadListQuerySchema)) query: LeadListQuery,
  ) {
    return this.leads.list(context, query);
  }

  @Post()
  @RequirePermissions('leads.create')
  @Header('Cache-Control', 'no-store')
  create(
    @CurrentAuthorization() context: AuthorizationContext,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(createLeadRequestSchema)) body: CreateLeadRequest,
  ) {
    return this.leads.createManual(context, body, key, correlation(request));
  }

  @Get('duplicates')
  @RequirePermissions('leads.duplicates.manage')
  duplicateQueue(@CurrentAuthorization() context: AuthorizationContext) {
    return this.leads.duplicateQueue(context);
  }

  @Post('duplicates/:candidateId/resolve')
  @RequirePermissions('leads.duplicates.manage')
  resolveDuplicate(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('candidateId', new ParseUUIDPipe()) candidateId: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(resolveDuplicateRequestSchema)) body: ResolveDuplicateRequest,
  ) {
    return this.leads.resolveDuplicate(context, candidateId, body, correlation(request));
  }

  @Post('sla/reconcile')
  @RequirePermissions('leads.sla.manage')
  reconcileSla(
    @CurrentAuthorization() context: AuthorizationContext,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.leads.reconcileSla(context, new Date(), correlation(request));
  }

  @Get('sla/settings')
  @RequirePermissions('leads.sla.manage')
  slaSettings(@CurrentAuthorization() context: AuthorizationContext) {
    return this.leads.slaSettings(context);
  }

  @Post('sla/settings')
  @RequirePermissions('leads.sla.manage')
  updateSlaSettings(
    @CurrentAuthorization() context: AuthorizationContext,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(updateLeadSlaSettingsRequestSchema))
    body: UpdateLeadSlaSettingsRequest,
  ) {
    return this.leads.updateSlaSettings(context, body, correlation(request));
  }

  @Get(':leadId')
  @RequirePermissions('leads.read')
  detail(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
  ) {
    return this.leads.detail(context, leadId);
  }

  @Post(':leadId/transitions')
  @RequirePermissions('leads.transition')
  transition(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(leadTransitionRequestSchema)) body: LeadTransitionRequest,
  ) {
    return this.leads.transition(context, leadId, body, key, correlation(request));
  }

  @Post(':leadId/assignments')
  @RequirePermissions('leads.assign')
  assign(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(assignLeadRequestSchema)) body: AssignLeadRequest,
  ) {
    return this.leads.assign(context, leadId, body, correlation(request));
  }

  @Post(':leadId/follow-ups')
  @RequirePermissions('leads.followups.manage')
  followUp(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(createFollowUpRequestSchema)) body: CreateFollowUpRequest,
  ) {
    return this.leads.addFollowUp(context, leadId, body, key, correlation(request));
  }

  @Post(':leadId/notes')
  @RequirePermissions('leads.notes.create')
  note(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(createLeadNoteRequestSchema)) body: CreateLeadNoteRequest,
  ) {
    return this.leads.addNote(context, leadId, body, key, correlation(request));
  }

  @Post(':leadId/follow-ups/:followUpId/complete')
  @RequirePermissions('leads.followups.manage')
  completeFollowUp(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
    @Param('followUpId', new ParseUUIDPipe()) followUpId: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(completeFollowUpRequestSchema)) body: CompleteFollowUpRequest,
  ) {
    return this.leads.completeFollowUp(context, leadId, followUpId, body, correlation(request));
  }

  @Post(':leadId/tasks')
  @RequirePermissions('leads.tasks.manage')
  task(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(createLeadTaskRequestSchema)) body: CreateLeadTaskRequest,
  ) {
    return this.leads.addTask(context, leadId, body, correlation(request));
  }

  @Post(':leadId/tasks/:taskId/complete')
  @RequirePermissions('leads.tasks.manage')
  completeTask(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(completeLeadTaskRequestSchema)) body: CompleteLeadTaskRequest,
  ) {
    return this.leads.completeTask(context, leadId, taskId, body, correlation(request));
  }
}
