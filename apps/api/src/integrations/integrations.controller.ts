/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  creativeRequestSchema,
  integrationConnectionRequestSchema,
  onboardingItemRequestSchema,
  reviewCreativeRequestSchema,
  reviewTranscriptSuggestionRequestSchema,
  transcriptSuggestionRequestSchema,
  type CreativeRequest,
  type IntegrationConnectionRequest,
  type OnboardingItemRequest,
  type ReviewCreativeRequest,
  type ReviewTranscriptSuggestionRequest,
  type TranscriptSuggestionRequest,
} from '@gdm/contracts';
import {
  CurrentAuthorization,
  RequireClientContext,
  RequirePermissions,
} from '../authorization/authorization.decorators.js';
import type {
  AuthenticatedRequest,
  AuthorizationContext,
} from '../authorization/authorization.types.js';
import { resolveCorrelationId } from '../common/correlation/correlation-id.js';
import { ZodSchemaValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { IntegrationsService } from './integrations.service.js';

@ApiTags('external-integrations')
@ApiBearerAuth()
@Controller('integrations')
@RequireClientContext()
export class IntegrationsController {
  constructor(@Inject(IntegrationsService) private readonly integrations: IntegrationsService) {}
  @Get() @RequirePermissions('integrations.read') centre(
    @CurrentAuthorization() context: AuthorizationContext,
  ) {
    return this.integrations.centre(context);
  }
  @Post('connections')
  @RequirePermissions('integrations.manage')
  @ApiOperation({ summary: 'Configure an official provider connection without exposing secrets' })
  connect(
    @CurrentAuthorization() context: AuthorizationContext,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(integrationConnectionRequestSchema))
    body: IntegrationConnectionRequest,
  ) {
    return this.integrations.connect(context, body, resolveCorrelationId(request));
  }
  @Post('connections/:id/disconnect') @RequirePermissions('integrations.manage') disconnect(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.integrations.disconnect(context, id, resolveCorrelationId(request));
  }
  @Get('onboarding') @RequirePermissions('integrations.read') onboarding(
    @CurrentAuthorization() context: AuthorizationContext,
  ) {
    return this.integrations.onboarding(context);
  }
  @Post('onboarding') @RequirePermissions('onboarding.manage') updateOnboarding(
    @CurrentAuthorization() context: AuthorizationContext,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(onboardingItemRequestSchema)) body: OnboardingItemRequest,
  ) {
    return this.integrations.updateOnboarding(context, body, resolveCorrelationId(request));
  }
  @Get('creative-assets') @RequirePermissions('ai.creatives.manage') creatives(
    @CurrentAuthorization() context: AuthorizationContext,
  ) {
    return this.integrations.creativeRequests(context);
  }
  @Post('creative-assets') @RequirePermissions('ai.creatives.manage') creative(
    @CurrentAuthorization() context: AuthorizationContext,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(creativeRequestSchema)) body: CreativeRequest,
  ) {
    return this.integrations.requestCreative(context, body, resolveCorrelationId(request));
  }
  @Post('creative-assets/:id/review') @RequirePermissions('ai.creatives.review') reviewCreative(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(reviewCreativeRequestSchema)) body: ReviewCreativeRequest,
  ) {
    return this.integrations.reviewCreative(context, id, body, resolveCorrelationId(request));
  }
  @Get('transcript-suggestions') @RequirePermissions('ai.transcripts.manage') transcripts(
    @CurrentAuthorization() context: AuthorizationContext,
  ) {
    return this.integrations.transcriptSuggestions(context);
  }
  @Post('transcript-suggestions') @RequirePermissions('ai.transcripts.manage') transcript(
    @CurrentAuthorization() context: AuthorizationContext,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(transcriptSuggestionRequestSchema))
    body: TranscriptSuggestionRequest,
  ) {
    return this.integrations.createTranscriptSuggestion(
      context,
      body,
      resolveCorrelationId(request),
    );
  }
  @Post('transcript-suggestions/:id/review')
  @RequirePermissions('ai.transcripts.review')
  reviewTranscript(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(reviewTranscriptSuggestionRequestSchema))
    body: ReviewTranscriptSuggestionRequest,
  ) {
    return this.integrations.reviewTranscriptSuggestion(
      context,
      id,
      body,
      resolveCorrelationId(request),
    );
  }
}
