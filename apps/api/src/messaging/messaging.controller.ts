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
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  assignConversationRequestSchema,
  beginMessageMediaUploadRequestSchema,
  completeMessageMediaUploadRequestSchema,
  configureDevelopmentMessagingConnectionRequestSchema,
  configureWhatsAppCloudConnectionRequestSchema,
  conversationListQuerySchema,
  conversationMessagePageQuerySchema,
  createInternalNoteRequestSchema,
  sendMessageRequestSchema,
  templateListQuerySchema,
  type AssignConversationRequest,
  type BeginMessageMediaUploadRequest,
  type CompleteMessageMediaUploadRequest,
  type ConfigureDevelopmentMessagingConnectionRequest,
  type ConfigureWhatsAppCloudConnectionRequest,
  type ConversationListQuery,
  type ConversationMessagePageQuery,
  type CreateInternalNoteRequest,
  type SendMessageRequest,
  type TemplateListQuery,
} from '@gdm/contracts';
import type { Request, Response } from 'express';
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
import { MessagingService } from './messaging.service.js';

function correlation(request: AuthenticatedRequest): string {
  return resolveCorrelationId(request);
}

@ApiTags('messaging')
@ApiBearerAuth()
@Controller('messaging')
@RequireClientContext()
@RequireClientModule('INBOX')
export class MessagingController {
  constructor(@Inject(MessagingService) private readonly messaging: MessagingService) {}

  @Get('connections')
  @RequirePermissions('messaging.connections.manage')
  @ApiOperation({ summary: 'Read tenant messaging integration state without credentials' })
  connections(@CurrentAuthorization() context: AuthorizationContext) {
    return this.messaging.connections(context);
  }

  @Put('connections/development')
  @RequirePermissions('messaging.connections.manage')
  @ApiOperation({ summary: 'Configure the development official-messaging fixture adapter' })
  configureDevelopment(
    @CurrentAuthorization() context: AuthorizationContext,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(configureDevelopmentMessagingConnectionRequestSchema))
    body: ConfigureDevelopmentMessagingConnectionRequest,
  ) {
    return this.messaging.configureDevelopment(context, body, correlation(request));
  }

  @Put('connections/whatsapp-cloud')
  @RequirePermissions('messaging.connections.manage')
  @ApiOperation({ summary: 'Store an encrypted tenant WhatsApp Cloud connection pending approval' })
  configureWhatsAppCloud(
    @CurrentAuthorization() context: AuthorizationContext,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(configureWhatsAppCloudConnectionRequestSchema))
    body: ConfigureWhatsAppCloudConnectionRequest,
  ) {
    return this.messaging.configureWhatsAppCloud(context, body, correlation(request));
  }

  @Get('health')
  @RequirePermissions('messaging.connections.manage')
  @ApiOperation({ summary: 'Check provider health without exposing tenant credentials' })
  health(@CurrentAuthorization() context: AuthorizationContext) {
    return this.messaging.health(context);
  }

  @Post('connections/:connectionId/activate')
  @RequirePermissions('messaging.connections.manage')
  @ApiOperation({ summary: 'Activate a healthy connection after official webhook verification' })
  activateConnection(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('connectionId', new ParseUUIDPipe()) connectionId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.messaging.activateConnection(context, connectionId, correlation(request));
  }

  @Post('webhook-events/reconcile')
  @RequirePermissions('messaging.failures.manage')
  @ApiOperation({ summary: 'Reconcile durable messaging webhook receipts after queue failure' })
  reconcileWebhooks(
    @CurrentAuthorization() context: AuthorizationContext,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.messaging.reconcileWebhooks(context, correlation(request));
  }

  @Post('connections/:connectionId/templates/sync')
  @RequirePermissions('messaging.templates.manage')
  @ApiOperation({ summary: 'Synchronize provider templates into the tenant catalogue' })
  syncTemplates(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('connectionId', new ParseUUIDPipe()) connectionId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.messaging.syncTemplates(context, connectionId, correlation(request));
  }

  @Get('templates')
  @RequirePermissions('messaging.templates.read')
  @ApiOperation({ summary: 'List tenant message templates and provider approval state' })
  templates(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query(new ZodSchemaValidationPipe(templateListQuerySchema)) query: TemplateListQuery,
  ) {
    return this.messaging.templates(context, query);
  }

  @Get('conversations')
  @RequirePermissions('messaging.conversations.read')
  @ApiOperation({ summary: 'List conversations within tenant and conversation-owner scope' })
  conversations(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query(new ZodSchemaValidationPipe(conversationListQuerySchema)) query: ConversationListQuery,
  ) {
    return this.messaging.conversations(context, query);
  }

  @Get('conversations/:conversationId')
  @RequirePermissions('messaging.conversations.read')
  @ApiOperation({ summary: 'Read a deterministic customer conversation timeline' })
  detail(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
  ) {
    return this.messaging.detail(context, conversationId);
  }

  @Get('conversations/:conversationId/messages')
  @RequirePermissions('messaging.conversations.read')
  @ApiOperation({ summary: 'Read an older cursor page of the authorized conversation timeline' })
  messages(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Query(new ZodSchemaValidationPipe(conversationMessagePageQuerySchema))
    query: ConversationMessagePageQuery,
  ) {
    return this.messaging.messagePage(context, conversationId, query);
  }

  @Post('conversations/:conversationId/read')
  @RequirePermissions('messaging.conversations.read')
  @ApiOperation({ summary: 'Clear server-authoritative unread state after scoped viewing' })
  markRead(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.messaging.markRead(context, conversationId, correlation(request));
  }

  @Post('conversations/:conversationId/messages')
  @RequirePermissions('messaging.messages.send')
  @ApiOperation({ summary: 'Queue a free-form or approved-template outbound message idempotently' })
  sendMessage(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(sendMessageRequestSchema)) body: SendMessageRequest,
  ) {
    return this.messaging.sendMessage(
      context,
      conversationId,
      body,
      idempotencyKey,
      correlation(request),
    );
  }

  @Post('conversations/:conversationId/notes')
  @RequirePermissions('messaging.notes.create')
  @ApiOperation({ summary: 'Append an internal-only conversation note idempotently' })
  note(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(createInternalNoteRequestSchema))
    body: CreateInternalNoteRequest,
  ) {
    return this.messaging.addInternalNote(
      context,
      conversationId,
      body,
      idempotencyKey,
      correlation(request),
    );
  }

  @Post('conversations/:conversationId/assignment')
  @RequirePermissions('messaging.assignments.manage')
  @ApiOperation({ summary: 'Assign a conversation owner or queue with optimistic concurrency' })
  assign(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(assignConversationRequestSchema))
    body: AssignConversationRequest,
  ) {
    return this.messaging.assign(context, conversationId, body, correlation(request));
  }

  @Get('failures')
  @RequirePermissions('messaging.failures.manage')
  @ApiOperation({ summary: 'List failed and dead-letter outbound messages' })
  failures(@CurrentAuthorization() context: AuthorizationContext) {
    return this.messaging.failures(context);
  }

  @Post('messages/:messageId/retry')
  @RequirePermissions('messaging.failures.manage')
  @ApiOperation({ summary: 'Retry a failed outbound message without duplicating it' })
  retry(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.messaging.retry(context, messageId, correlation(request));
  }

  @Post('media/uploads')
  @RequirePermissions('messaging.media.upload')
  @ApiOperation({ summary: 'Create a private signed upload for outbound message media' })
  beginMediaUpload(
    @CurrentAuthorization() context: AuthorizationContext,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(beginMessageMediaUploadRequestSchema))
    body: BeginMessageMediaUploadRequest,
  ) {
    return this.messaging.beginMediaUpload(context, body, idempotencyKey, correlation(request));
  }

  @Post('media/:mediaId/complete')
  @RequirePermissions('messaging.media.upload')
  @ApiOperation({ summary: 'Verify private media metadata and queue the message' })
  completeMediaUpload(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('mediaId', new ParseUUIDPipe()) mediaId: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(completeMessageMediaUploadRequestSchema))
    body: CompleteMessageMediaUploadRequest,
  ) {
    return this.messaging.completeMediaUpload(context, mediaId, body, correlation(request));
  }

  @Get('media/:mediaId/access')
  @RequirePermissions('messaging.media.read')
  @ApiOperation({ summary: 'Issue a short-lived private media download URL after scope checks' })
  mediaAccess(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('mediaId', new ParseUUIDPipe()) mediaId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.messaging.mediaAccess(context, mediaId, correlation(request));
  }
}

@ApiTags('messaging webhooks')
@Controller('messaging/webhooks')
export class MessagingWebhooksController {
  constructor(@Inject(MessagingService) private readonly messaging: MessagingService) {}

  @Public()
  @Get(':provider/:connectionKey')
  @ApiOperation({ summary: 'Complete provider webhook verification without exposing credentials' })
  async verify(
    @Param('provider') provider: string,
    @Param('connectionKey') connectionKey: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.type('text/plain');
    return this.messaging.verifyChallenge(provider, connectionKey, mode, verifyToken, challenge);
  }

  @Public()
  @Post(':provider/:connectionKey')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Verify, durably deduplicate, and ingest official provider events' })
  webhook(
    @Param('provider') provider: string,
    @Param('connectionKey') connectionKey: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() request: Request & { rawBody?: Buffer },
    @Body() payload: unknown,
  ) {
    return this.messaging.receiveWebhook({
      connectionKey,
      correlationId: resolveCorrelationId(request as AuthenticatedRequest),
      headers,
      payload,
      providerCode: provider,
      ...(request.rawBody ? { rawBody: request.rawBody.toString('utf8') } : {}),
    });
  }
}
