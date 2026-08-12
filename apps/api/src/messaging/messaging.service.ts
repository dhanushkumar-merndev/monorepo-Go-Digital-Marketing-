/* Messaging commands keep durable state, audit, and outbox evidence transactionally consistent. */
/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-non-null-assertion */
import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  AssignConversationRequest,
  BeginMessageMediaUploadRequest,
  CompleteMessageMediaUploadRequest,
  ConfigureDevelopmentMessagingConnectionRequest,
  ConfigureWhatsAppCloudConnectionRequest,
  ConversationListQuery,
  ConversationMessagePageQuery,
  CreateInternalNoteRequest,
  SendMessageRequest,
  TemplateListQuery,
} from '@gdm/contracts';
import { messageTemplateVariableKeys } from '@gdm/contracts';
import { type DatabaseConnection, schema } from '@gdm/database';
import type { Queue } from 'bullmq';
import { and, asc, desc, eq, gt, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { AuthorizationPolicy } from '../authorization/authorization-policy.js';
import {
  authorizationScopeCondition,
  pageMetadata,
  pageOffset,
} from '../authorization/authorization-scope.sql.js';
import type { AuthorizationContext } from '../authorization/authorization.types.js';
import { DATABASE_CONNECTION } from '../infrastructure/database/database.tokens.js';
import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from '../infrastructure/storage/object-storage.port.js';
import { LeadsService } from '../leads/leads.service.js';
import {
  BULLMQ_QUEUE_FACTORY,
  type BullMqQueueFactory,
} from '../infrastructure/redis/redis.tokens.js';
import { PLATFORM_BACKGROUND_QUEUE } from '../background/background-processing.lifecycle.js';
import {
  MessagingCredentialProtector,
  type EncryptedMessagingCredentials,
} from './messaging-credential-protector.js';
import {
  MESSAGING_PROVIDER_REGISTRY,
  type MessagingProviderConnection,
  type MessagingProviderRegistry,
  type NormalizedInboundMessage,
  type NormalizedMessagingEvent,
  type NormalizedStatusEvent,
} from './messaging-provider.port.js';
import {
  MESSAGING_RUNTIME_CONFIG,
  type MessagingRuntimeConfig,
} from './messaging-runtime-config.js';
import { MessagingRateLimiter } from './messaging-rate-limiter.js';
import {
  MESSAGING_OUTBOUND_AMBIGUITY_MS,
  MESSAGING_WEBHOOK_MAX_EVENTS,
  MESSAGING_WEBHOOK_MAX_RAW_BYTES,
  MESSAGING_WEBHOOK_PROCESSING_LEASE_MS,
  messagingRetryDelayWithJitter,
} from './messaging-reliability.js';

type Tx = Parameters<Parameters<DatabaseConnection['db']['transaction']>[0]>[0];
type ConnectionRow = typeof schema.messagingProviderConnections.$inferSelect;
type ConversationRow = typeof schema.conversations.$inferSelect;
type MessageRow = typeof schema.messages.$inferSelect;

function clientId(context: AuthorizationContext): string {
  if (!context.clientOrganizationId)
    throw new ForbiddenException({
      code: 'SUPPORT_ELEVATION_REQUIRED',
      details: [],
      message: 'An active client context is required.',
      retryable: false,
    });
  return context.clientOrganizationId;
}

function encodeMessageCursor(receivedAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ id, received_at: receivedAt.toISOString() }),
    'utf8',
  ).toString('base64url');
}

function decodeMessageCursor(value: string): { id: string; receivedAt: Date } {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      id?: unknown;
      received_at?: unknown;
    };
    if (
      typeof parsed.id !== 'string' ||
      !/^[0-9a-f-]{36}$/iu.test(parsed.id) ||
      typeof parsed.received_at !== 'string'
    )
      throw new Error('invalid cursor');
    const receivedAt = new Date(parsed.received_at);
    if (Number.isNaN(receivedAt.getTime())) throw new Error('invalid cursor');
    return { id: parsed.id, receivedAt };
  } catch {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      details: [{ field: 'before', reason: 'Cursor is invalid or expired.' }],
      message: 'The message cursor is invalid or expired.',
      retryable: false,
    });
  }
}
function notFound(message: string): NotFoundException {
  return new NotFoundException({ code: 'NOT_FOUND', details: [], message, retryable: false });
}
function conflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, details: [], message, retryable: false });
}
function forbidden(code: string, message: string): ForbiddenException {
  return new ForbiddenException({ code, details: [], message, retryable: false });
}
function providerUnavailable(message: string): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: 'PROVIDER_UNAVAILABLE',
    details: [],
    message,
    retryable: true,
  });
}
function requiredIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key || key.length > 256)
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      details: [
        { field: 'Idempotency-Key', reason: 'A key of at most 256 characters is required.' },
      ],
      message: 'Idempotency-Key is required.',
      retryable: false,
    });
  return key;
}
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { cause?: unknown; code?: unknown };
  return candidate.code === '23505' || isUniqueViolation(candidate.cause);
}
function normalizeWhatsAppAddress(value: string): string {
  const digits = value.replace(/\D/gu, '');
  if (digits.length < 10 || digits.length > 15) throw new Error('Invalid messaging address.');
  return `+${digits}`;
}
function fingerprint(value: unknown): string {
  const canonicalize = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(canonicalize);
    if (candidate && typeof candidate === 'object')
      return Object.fromEntries(
        Object.entries(candidate as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, canonicalize(nested)]),
      );
    return candidate;
  };
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)), 'utf8')
    .digest('hex');
}
function assertIdempotentReplay(message: MessageRow, expectedFingerprint: string): void {
  if (message.requestFingerprint !== expectedFingerprint)
    throw conflict(
      'IDEMPOTENCY_MISMATCH',
      'The idempotency key was already used for a different messaging request.',
    );
}
function sanitizeFilename(value: string): string {
  const name = value.replace(/[\\/\r\n]/gu, '_').trim();
  if (!name || name.length > 180) throw new Error('Invalid filename.');
  return name;
}
function statusRank(
  value: 'QUEUED' | 'SENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'RECEIVED' | 'FAILED',
): number {
  return { QUEUED: 0, SENDING: 1, SENT: 2, DELIVERED: 3, READ: 4, RECEIVED: 4, FAILED: 5 }[value];
}

function projectedDeliveryStatus(
  history: {
    createdAt: Date;
    id: string;
    occurredAt: Date;
    status: MessageRow['status'];
  }[],
): MessageRow['status'] {
  let projected: MessageRow['status'] = 'QUEUED';
  for (const event of [...history].sort((left, right) => {
    const occurred = left.occurredAt.getTime() - right.occurredAt.getTime();
    if (occurred !== 0) return occurred;
    const created = left.createdAt.getTime() - right.createdAt.getTime();
    return created !== 0 ? created : left.id.localeCompare(right.id);
  })) {
    if (event.status === 'FAILED') {
      projected = 'FAILED';
      continue;
    }
    if (projected === 'FAILED' || statusRank(event.status) >= statusRank(projected)) {
      projected = event.status;
    }
  }
  return projected;
}

@Injectable()
export class MessagingService {
  private backgroundQueue: Queue | undefined;
  private readonly credentials: MessagingCredentialProtector;

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly connection: DatabaseConnection,
    @Inject(MESSAGING_RUNTIME_CONFIG) private readonly config: MessagingRuntimeConfig,
    @Inject(MESSAGING_PROVIDER_REGISTRY) private readonly providers: MessagingProviderRegistry,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(AuthorizationPolicy) private readonly policy: AuthorizationPolicy,
    @Inject(LeadsService) private readonly leads: LeadsService,
    @Inject(MessagingRateLimiter) private readonly rateLimiter: MessagingRateLimiter,
    @Optional()
    @Inject(BULLMQ_QUEUE_FACTORY)
    private readonly queueFactory?: BullMqQueueFactory,
  ) {
    this.credentials = new MessagingCredentialProtector(config);
  }

  async connections(context: AuthorizationContext) {
    const rows = await this.connection.db
      .select()
      .from(schema.messagingProviderConnections)
      .where(eq(schema.messagingProviderConnections.clientOrganizationId, clientId(context)))
      .orderBy(asc(schema.messagingProviderConnections.displayName));
    return { connections: rows.map((row) => this.presentConnection(row)) };
  }

  async configureDevelopment(
    context: AuthorizationContext,
    body: ConfigureDevelopmentMessagingConnectionRequest,
    correlationId: string,
  ) {
    const cid = clientId(context);
    if (!this.config.developmentAdapterEnabled)
      throw forbidden(
        'PROVIDER_DISABLED',
        'The development adapter is disabled in this environment.',
      );
    await this.assertBranchAndQueue(cid, body.branch_id, body.default_assignment_queue_id);
    return this.connection.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.messagingProviderConnections)
        .values({
          branchId: body.branch_id,
          businessPhoneE164: normalizeWhatsAppAddress(body.business_phone_e164),
          channel: 'WHATSAPP',
          clientOrganizationId: cid,
          connectionKey: `development-messaging-${cid}`,
          defaultAssignmentQueueId: body.default_assignment_queue_id,
          displayName: body.display_name,
          phoneNumberId: `development-${cid}`,
          provider: 'DEVELOPMENT',
          status: body.enabled ? 'ACTIVE' : 'DISABLED',
          webhookState: body.enabled ? 'VERIFIED' : 'NOT_VERIFIED',
        })
        .onConflictDoUpdate({
          target: [
            schema.messagingProviderConnections.clientOrganizationId,
            schema.messagingProviderConnections.provider,
            schema.messagingProviderConnections.phoneNumberId,
          ],
          targetWhere: sql`${schema.messagingProviderConnections.phoneNumberId} is not null`,
          set: {
            branchId: body.branch_id,
            businessPhoneE164: normalizeWhatsAppAddress(body.business_phone_e164),
            defaultAssignmentQueueId: body.default_assignment_queue_id,
            displayName: body.display_name,
            status: body.enabled ? 'ACTIVE' : 'DISABLED',
            updatedAt: new Date(),
            webhookState: body.enabled ? 'VERIFIED' : 'NOT_VERIFIED',
          },
        })
        .returning();
      await this.audit(tx, context, 'MESSAGING_CONNECTION_CONFIGURED', row!.id, correlationId, {
        provider: row!.provider,
        status: row!.status,
      });
      return this.presentConnection(row!);
    });
  }

  async configureWhatsAppCloud(
    context: AuthorizationContext,
    body: ConfigureWhatsAppCloudConnectionRequest,
    correlationId: string,
  ) {
    const cid = clientId(context);
    await this.assertBranchAndQueue(cid, body.branch_id, body.default_assignment_queue_id);
    const encrypted = this.credentials.encrypt({
      accessToken: body.access_token,
      appSecret: body.app_secret,
      verifyToken: body.verify_token,
    });
    return this.connection.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.messagingProviderConnections)
        .values({
          branchId: body.branch_id,
          businessPhoneE164: normalizeWhatsAppAddress(body.business_phone_e164),
          channel: 'WHATSAPP',
          clientOrganizationId: cid,
          connectionKey: `whatsapp-cloud-${randomUUID()}`,
          credentialAuthTag: encrypted.authTag,
          credentialCiphertext: encrypted.ciphertext,
          credentialIv: encrypted.iv,
          credentialKeyId: encrypted.keyId,
          defaultAssignmentQueueId: body.default_assignment_queue_id,
          displayName: body.display_name,
          phoneNumberId: body.phone_number_id,
          provider: 'WHATSAPP_CLOUD',
          settings: { graph_api_version: body.graph_api_version },
          status: 'PENDING_APPROVAL',
          wabaId: body.waba_id,
        })
        .onConflictDoUpdate({
          target: [
            schema.messagingProviderConnections.clientOrganizationId,
            schema.messagingProviderConnections.provider,
            schema.messagingProviderConnections.phoneNumberId,
          ],
          targetWhere: sql`${schema.messagingProviderConnections.phoneNumberId} is not null`,
          set: {
            branchId: body.branch_id,
            businessPhoneE164: normalizeWhatsAppAddress(body.business_phone_e164),
            credentialAuthTag: encrypted.authTag,
            credentialCiphertext: encrypted.ciphertext,
            credentialIv: encrypted.iv,
            credentialKeyId: encrypted.keyId,
            defaultAssignmentQueueId: body.default_assignment_queue_id,
            displayName: body.display_name,
            settings: { graph_api_version: body.graph_api_version },
            status: 'PENDING_APPROVAL',
            updatedAt: new Date(),
            wabaId: body.waba_id,
            webhookState: 'NOT_VERIFIED',
            lastWebhookAt: null,
          },
        })
        .returning();
      await this.audit(tx, context, 'MESSAGING_CONNECTION_CONFIGURED', row!.id, correlationId, {
        credentials_rotated: true,
        provider: row!.provider,
        status: row!.status,
      });
      return this.presentConnection(row!);
    });
  }

  async health(context: AuthorizationContext) {
    const cid = clientId(context);
    const connections = await this.connection.db
      .select()
      .from(schema.messagingProviderConnections)
      .where(eq(schema.messagingProviderConnections.clientOrganizationId, cid));
    const results = [];
    for (const row of connections) {
      const provider = this.providers.provider(row.provider);
      const result = provider
        ? await provider.healthCheck(this.providerConnection(row))
        : { detail: 'Provider adapter is unavailable.', healthy: false };
      const now = new Date();
      await this.connection.db
        .update(schema.messagingProviderConnections)
        .set({
          lastHealthAt: now,
          lastHealthStatus: result.healthy ? 'HEALTHY' : 'UNHEALTHY',
          ...(row.status === 'ACTIVE' && !result.healthy ? { status: 'DEGRADED' as const } : {}),
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.messagingProviderConnections.clientOrganizationId, cid),
            eq(schema.messagingProviderConnections.id, row.id),
          ),
        );
      results.push({ connection_id: row.id, ...result });
    }
    return { connections: results };
  }

  async activateConnection(
    context: AuthorizationContext,
    connectionId: string,
    correlationId: string,
  ) {
    const cid = clientId(context);
    const connection = await this.connectionRow(cid, connectionId);
    if (connection.provider === 'WHATSAPP_CLOUD' && connection.webhookState !== 'VERIFIED')
      throw conflict(
        'WEBHOOK_NOT_VERIFIED',
        'Verify the official provider callback before activating this connection.',
      );
    const provider = this.providers.provider(connection.provider);
    if (!provider) throw providerUnavailable('The configured messaging provider is unavailable.');
    const health = await provider.healthCheck(this.providerConnection(connection));
    if (!health.healthy)
      throw providerUnavailable(health.detail ?? 'The configured messaging provider is unhealthy.');
    const [activated] = await this.connection.db.transaction(async (tx) => {
      const rows = await tx
        .update(schema.messagingProviderConnections)
        .set({
          lastHealthAt: new Date(),
          lastHealthStatus: 'HEALTHY',
          status: 'ACTIVE',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.messagingProviderConnections.clientOrganizationId, cid),
            eq(schema.messagingProviderConnections.id, connection.id),
          ),
        )
        .returning();
      await this.audit(
        tx,
        context,
        'MESSAGING_CONNECTION_ACTIVATED',
        connection.id,
        correlationId,
        {
          provider: connection.provider,
        },
      );
      return rows;
    });
    return this.presentConnection(activated!);
  }

  async syncTemplates(context: AuthorizationContext, connectionId: string, correlationId: string) {
    const cid = clientId(context);
    const connection = await this.connectionRow(cid, connectionId);
    const provider = this.providers.provider(connection.provider);
    if (!provider) throw providerUnavailable('The configured messaging provider is unavailable.');
    const templates = await provider.syncTemplates(this.providerConnection(connection));
    await this.connection.db.transaction(async (tx) => {
      for (const template of templates) {
        await tx
          .insert(schema.messageTemplates)
          .values({
            bodyText: template.bodyText,
            category: template.category,
            clientOrganizationId: cid,
            components: template.components,
            connectionId: connection.id,
            externalTemplateId: template.externalTemplateId,
            language: template.language,
            lastSyncedAt: new Date(),
            name: template.name,
            providerMetadata: template.providerMetadata,
            status: template.status,
          })
          .onConflictDoUpdate({
            target: [
              schema.messageTemplates.clientOrganizationId,
              schema.messageTemplates.connectionId,
              schema.messageTemplates.name,
              schema.messageTemplates.language,
            ],
            set: {
              bodyText: template.bodyText,
              category: template.category,
              components: template.components,
              externalTemplateId: template.externalTemplateId,
              lastSyncedAt: new Date(),
              providerMetadata: template.providerMetadata,
              status: template.status,
              updatedAt: new Date(),
            },
          });
      }
      await tx
        .update(schema.messagingProviderConnections)
        .set({ templateSyncStatus: 'SYNCED', templateSyncedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(schema.messagingProviderConnections.clientOrganizationId, cid),
            eq(schema.messagingProviderConnections.id, connection.id),
          ),
        );
      await this.audit(tx, context, 'MESSAGE_TEMPLATES_SYNCED', connection.id, correlationId, {
        count: templates.length,
      });
    });
    return { count: templates.length };
  }

  async templates(context: AuthorizationContext, query: TemplateListQuery) {
    const cid = clientId(context);
    const conditions = [eq(schema.messageTemplates.clientOrganizationId, cid)];
    if (query.category) conditions.push(eq(schema.messageTemplates.category, query.category));
    if (query.status) conditions.push(eq(schema.messageTemplates.status, query.status));
    const rows = await this.connection.db
      .select()
      .from(schema.messageTemplates)
      .where(and(...conditions))
      .orderBy(asc(schema.messageTemplates.name), asc(schema.messageTemplates.language));
    return { templates: rows.map((row) => this.presentTemplate(row)) };
  }

  async conversations(context: AuthorizationContext, query: ConversationListQuery) {
    const cid = clientId(context);
    const conditions = [
      eq(schema.conversations.clientOrganizationId, cid),
      authorizationScopeCondition(context, {
        assignee: schema.conversations.conversationOwnerId,
        branch: schema.conversations.branchId,
        department: schema.teams.departmentId,
        owner: schema.leadOpportunities.relationshipOwnerId,
        team: schema.conversations.teamId,
      }),
    ];
    if (query.status) conditions.push(eq(schema.conversations.status, query.status));
    if (query.assigned_to_me)
      conditions.push(eq(schema.conversations.conversationOwnerId, context.userId));
    if (query.search)
      conditions.push(
        or(
          ilike(schema.contacts.displayName, `%${query.search}%`),
          ilike(schema.conversations.remoteAddress, `%${query.search}%`),
        )!,
      );
    const rows = await this.connection.db
      .select({
        contactName: schema.contacts.displayName,
        conversation: schema.conversations,
        lead: schema.leadOpportunities,
        phone: schema.contacts.primaryPhoneE164,
        queueDepartmentId: schema.teams.departmentId,
      })
      .from(schema.conversations)
      .innerJoin(
        schema.contacts,
        and(
          eq(schema.contacts.clientOrganizationId, cid),
          eq(schema.contacts.id, schema.conversations.contactId),
        ),
      )
      .innerJoin(
        schema.leadOpportunities,
        and(
          eq(schema.leadOpportunities.clientOrganizationId, cid),
          eq(schema.leadOpportunities.id, schema.conversations.leadId),
        ),
      )
      .leftJoin(
        schema.teams,
        and(
          eq(schema.teams.clientOrganizationId, cid),
          eq(schema.teams.id, schema.conversations.teamId),
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(schema.conversations.lastMessageAt), desc(schema.conversations.id))
      .limit(query.limit + 1)
      .offset(pageOffset(query.page, query.limit));
    const accessible = rows.filter((row) =>
      this.policy.canAccessResource(context, {
        assigneeId: row.conversation.conversationOwnerId,
        branchId: row.conversation.branchId,
        clientOrganizationId: cid,
        departmentId: row.queueDepartmentId,
        ownerId: row.lead.relationshipOwnerId,
        teamId: row.conversation.teamId,
      }),
    );
    return {
      conversations: accessible
        .slice(0, query.limit)
        .map((row) => this.presentConversation(row.conversation, row.contactName, row.phone)),
      pagination: pageMetadata(query.page, query.limit, accessible.length),
    };
  }

  async detail(context: AuthorizationContext, conversationId: string) {
    const scoped = await this.scopedConversation(context, conversationId);
    const messagePage = await this.readMessagePage(
      scoped.conversation.clientOrganizationId,
      conversationId,
      { limit: 50 },
    );
    const windowExpires =
      scoped.conversation.channel === 'WHATSAPP' && scoped.conversation.lastInboundAt
        ? new Date(
            scoped.conversation.lastInboundAt.getTime() +
              this.config.serviceWindowHours * 3_600_000,
          )
        : null;
    return {
      conversation: {
        ...this.presentConversation(scoped.conversation, scoped.contactName, scoped.phone),
        branch_id: scoped.conversation.branchId,
        free_form_allowed: windowExpires !== null && windowExpires.getTime() > Date.now(),
        free_form_window_expires_at: windowExpires?.toISOString() ?? null,
        vehicle_interest: scoped.lead.vehicleInterest,
      },
      message_page: messagePage.page,
      messages: messagePage.messages,
    };
  }

  async messagePage(
    context: AuthorizationContext,
    conversationId: string,
    query: ConversationMessagePageQuery,
  ) {
    const scoped = await this.scopedConversation(context, conversationId);
    return this.readMessagePage(scoped.conversation.clientOrganizationId, conversationId, query);
  }

  private async readMessagePage(
    cid: string,
    conversationId: string,
    query: ConversationMessagePageQuery,
  ) {
    const cursor = query.before ? decodeMessageCursor(query.before) : null;
    const messageRows = await this.connection.db
      .select({ message: schema.messages, templateName: schema.messageTemplates.name })
      .from(schema.messages)
      .leftJoin(
        schema.messageTemplates,
        and(
          eq(schema.messageTemplates.clientOrganizationId, cid),
          eq(schema.messageTemplates.id, schema.messages.templateId),
        ),
      )
      .where(
        and(
          eq(schema.messages.clientOrganizationId, cid),
          eq(schema.messages.conversationId, conversationId),
          cursor
            ? or(
                lt(schema.messages.receivedAt, cursor.receivedAt),
                and(
                  eq(schema.messages.receivedAt, cursor.receivedAt),
                  lt(schema.messages.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(schema.messages.receivedAt), desc(schema.messages.id))
      .limit(query.limit + 1);
    const selectedRows = messageRows.slice(0, query.limit);
    const mediaRows = selectedRows.length
      ? await this.connection.db
          .select()
          .from(schema.messageMedia)
          .where(
            and(
              eq(schema.messageMedia.clientOrganizationId, cid),
              inArray(
                schema.messageMedia.messageId,
                selectedRows.map((row) => row.message.id),
              ),
            ),
          )
      : [];
    const ordered = selectedRows.sort((left, right) => {
      const leftTime = (left.message.providerOccurredAt ?? left.message.receivedAt).getTime();
      const rightTime = (right.message.providerOccurredAt ?? right.message.receivedAt).getTime();
      if (leftTime !== rightTime) return leftTime - rightTime;
      const sequence = (left.message.providerSequence ?? '').localeCompare(
        right.message.providerSequence ?? '',
      );
      if (sequence !== 0) return sequence;
      const received = left.message.receivedAt.getTime() - right.message.receivedAt.getTime();
      return received !== 0 ? received : left.message.id.localeCompare(right.message.id);
    });
    const oldest = ordered[0]?.message;
    return {
      messages: ordered.map((row) =>
        this.presentMessage(
          row.message,
          row.templateName,
          mediaRows.filter((media) => media.messageId === row.message.id),
        ),
      ),
      page: {
        has_more: messageRows.length > query.limit,
        next_cursor:
          messageRows.length > query.limit && oldest
            ? encodeMessageCursor(oldest.receivedAt, oldest.id)
            : null,
      },
    };
  }

  async sendMessage(
    context: AuthorizationContext,
    conversationId: string,
    body: SendMessageRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    const scoped = await this.scopedConversation(context, conversationId);
    const cid = scoped.conversation.clientOrganizationId;
    const key = requiredIdempotencyKey(idempotencyKey);
    const requestFingerprint = fingerprint({ body, command: 'SEND_MESSAGE', conversationId });
    const existing = await this.connection.db
      .select()
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.clientOrganizationId, cid),
          eq(schema.messages.clientIdempotencyKey, key),
        ),
      )
      .limit(1);
    if (existing[0]) {
      assertIdempotentReplay(existing[0], requestFingerprint);
      return { message: this.presentMessage(existing[0], null, []), replayed: true };
    }

    const template =
      body.content_type === 'TEMPLATE'
        ? await this.templateRow(cid, scoped.conversation.connectionId, body.template_id)
        : undefined;
    if (template && body.content_type === 'TEMPLATE') {
      this.assertTemplateVariables(template.bodyText, body.variables);
    }
    await this.assertOutboundAllowed(scoped.conversation, template);
    const now = new Date();
    let message: MessageRow;
    try {
      message = await this.connection.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(schema.messages)
          .values({
            bodyText: body.content_type === 'TEXT' ? body.text : null,
            clientIdempotencyKey: key,
            clientOrganizationId: cid,
            contentType: body.content_type,
            conversationId,
            direction: 'OUTBOUND',
            providerOccurredAt: now,
            requestFingerprint,
            senderMembershipId: context.membershipId,
            senderUserId: context.userId,
            status: 'QUEUED',
            templateId: body.content_type === 'TEMPLATE' ? body.template_id : null,
            templateVariables: body.content_type === 'TEMPLATE' ? body.variables : {},
          })
          .returning();
        await tx.insert(schema.messageStatusHistory).values({
          clientOrganizationId: cid,
          messageId: created!.id,
          occurredAt: now,
          status: 'QUEUED',
        });
        await tx.insert(schema.messageOutboundOutbox).values({
          clientOrganizationId: cid,
          messageId: created!.id,
        });
        await tx
          .update(schema.conversations)
          .set({ lastMessageAt: now, lastOutboundAt: now, updatedAt: now })
          .where(
            and(
              eq(schema.conversations.clientOrganizationId, cid),
              eq(schema.conversations.id, conversationId),
            ),
          );
        await this.event(tx, cid, created!.id, 'MESSAGE_QUEUED', correlationId, {
          conversation_id: conversationId,
          content_type: body.content_type,
        });
        await this.audit(tx, context, 'MESSAGE_QUEUED', created!.id, correlationId, {
          conversation_id: conversationId,
          content_type: body.content_type,
        });
        return created!;
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const [replayed] = await this.connection.db
        .select()
        .from(schema.messages)
        .where(
          and(
            eq(schema.messages.clientOrganizationId, cid),
            eq(schema.messages.clientIdempotencyKey, key),
          ),
        )
        .limit(1);
      if (!replayed) throw error;
      assertIdempotentReplay(replayed, requestFingerprint);
      return { message: this.presentMessage(replayed, null, []), replayed: true };
    }
    await this.dispatchMessage(cid, message.id, correlationId);
    const [updated] = await this.connection.db
      .select()
      .from(schema.messages)
      .where(and(eq(schema.messages.clientOrganizationId, cid), eq(schema.messages.id, message.id)))
      .limit(1);
    return { message: this.presentMessage(updated!, template?.name ?? null, []), replayed: false };
  }

  /**
   * Queue an automated reminder through the same approved-template message outbox used by the
   * Unified Inbox. Consent, suppression, provider connection and retry behavior remain owned here.
   */
  async queueAutomatedReminder(input: {
    category: 'MARKETING' | 'OPERATIONAL';
    clientOrganizationId: string;
    contactId: string;
    correlationId: string;
    idempotencyKey: string;
    templateId: string;
    variables: Record<string, string>;
  }): Promise<{ messageId: string; replayed: boolean }> {
    const expectedCategory = input.category === 'MARKETING' ? 'MARKETING' : 'UTILITY';
    const [row] = await this.connection.db
      .select({ conversation: schema.conversations, template: schema.messageTemplates })
      .from(schema.messageTemplates)
      .innerJoin(
        schema.conversations,
        and(
          eq(schema.conversations.clientOrganizationId, input.clientOrganizationId),
          eq(schema.conversations.connectionId, schema.messageTemplates.connectionId),
          eq(schema.conversations.contactId, input.contactId),
          eq(schema.conversations.status, 'OPEN'),
        ),
      )
      .where(
        and(
          eq(schema.messageTemplates.clientOrganizationId, input.clientOrganizationId),
          eq(schema.messageTemplates.id, input.templateId),
          eq(schema.messageTemplates.category, expectedCategory),
        ),
      )
      .orderBy(desc(schema.conversations.lastMessageAt), desc(schema.conversations.createdAt))
      .limit(1);
    if (!row)
      throw notFound(
        `No open conversation is connected to the selected ${expectedCategory.toLowerCase()} template.`,
      );
    if (!row.conversation.conversationOwnerId || !row.conversation.conversationOwnerMembershipId)
      throw conflict(
        'CONVERSATION_OWNER_REQUIRED',
        'Automated reminders require an assigned conversation owner for attribution.',
      );
    this.assertTemplateVariables(row.template.bodyText, input.variables);
    await this.assertOutboundAllowed(row.conversation, row.template);
    const requestFingerprint = fingerprint({
      category: input.category,
      contactId: input.contactId,
      templateId: input.templateId,
      variables: input.variables,
    });
    const [existing] = await this.connection.db
      .select({ id: schema.messages.id, requestFingerprint: schema.messages.requestFingerprint })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.clientOrganizationId, input.clientOrganizationId),
          eq(schema.messages.clientIdempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint)
        throw conflict('IDEMPOTENCY_KEY_REUSED', 'The reminder delivery key was reused.');
      return { messageId: existing.id, replayed: true };
    }
    const now = new Date();
    const message = await this.connection.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(schema.messages)
        .values({
          clientIdempotencyKey: input.idempotencyKey,
          clientOrganizationId: input.clientOrganizationId,
          contentType: 'TEMPLATE',
          conversationId: row.conversation.id,
          direction: 'OUTBOUND',
          providerOccurredAt: now,
          requestFingerprint,
          senderMembershipId: row.conversation.conversationOwnerMembershipId,
          senderUserId: row.conversation.conversationOwnerId,
          status: 'QUEUED',
          templateId: row.template.id,
          templateVariables: input.variables,
        })
        .returning({ id: schema.messages.id });
      await tx.insert(schema.messageStatusHistory).values({
        clientOrganizationId: input.clientOrganizationId,
        messageId: created!.id,
        occurredAt: now,
        status: 'QUEUED',
      });
      await tx.insert(schema.messageOutboundOutbox).values({
        clientOrganizationId: input.clientOrganizationId,
        messageId: created!.id,
      });
      await tx
        .update(schema.conversations)
        .set({
          lastMessageAt: now,
          lastOutboundAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.conversations.clientOrganizationId, input.clientOrganizationId),
            eq(schema.conversations.id, row.conversation.id),
          ),
        );
      await this.event(
        tx,
        input.clientOrganizationId,
        created!.id,
        'REMINDER_MESSAGE_QUEUED',
        input.correlationId,
        {
          reminder_delivery_key: input.idempotencyKey,
        },
      );
      return created!;
    });
    return { messageId: message.id, replayed: false };
  }

  async addInternalNote(
    context: AuthorizationContext,
    conversationId: string,
    body: CreateInternalNoteRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    const scoped = await this.scopedConversation(context, conversationId);
    const cid = scoped.conversation.clientOrganizationId;
    const key = requiredIdempotencyKey(idempotencyKey);
    const requestFingerprint = fingerprint({ body, command: 'ADD_INTERNAL_NOTE', conversationId });
    try {
      const [message] = await this.connection.db.transaction(async (tx) => {
        const now = new Date();
        const inserted = await tx
          .insert(schema.messages)
          .values({
            bodyText: body.note,
            clientIdempotencyKey: key,
            clientOrganizationId: cid,
            contentType: 'NOTE',
            conversationId,
            direction: 'INTERNAL',
            providerOccurredAt: now,
            requestFingerprint,
            senderMembershipId: context.membershipId,
            senderUserId: context.userId,
            status: 'SENT',
          })
          .returning();
        await tx.insert(schema.messageStatusHistory).values({
          clientOrganizationId: cid,
          messageId: inserted[0]!.id,
          occurredAt: now,
          status: 'SENT',
        });
        await tx
          .update(schema.conversations)
          .set({ lastMessageAt: now, updatedAt: now })
          .where(
            and(
              eq(schema.conversations.clientOrganizationId, cid),
              eq(schema.conversations.id, conversationId),
            ),
          );
        await this.audit(tx, context, 'CONVERSATION_NOTE_ADDED', inserted[0]!.id, correlationId, {
          conversation_id: conversationId,
        });
        return inserted;
      });
      return { message: this.presentMessage(message!, null, []), replayed: false };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const [existing] = await this.connection.db
        .select()
        .from(schema.messages)
        .where(
          and(
            eq(schema.messages.clientOrganizationId, cid),
            eq(schema.messages.clientIdempotencyKey, key),
          ),
        )
        .limit(1);
      if (!existing) throw error;
      assertIdempotentReplay(existing, requestFingerprint);
      return { message: this.presentMessage(existing, null, []), replayed: true };
    }
  }

  async markRead(
    context: AuthorizationContext,
    conversationId: string,
    correlationId: string,
  ): Promise<{ unread_count: number }> {
    const scoped = await this.scopedConversation(context, conversationId);
    if (scoped.conversation.unreadCount === 0) return { unread_count: 0 };
    await this.connection.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.conversations)
        .set({ unreadCount: 0, updatedAt: new Date() })
        .where(
          and(
            eq(schema.conversations.clientOrganizationId, scoped.conversation.clientOrganizationId),
            eq(schema.conversations.id, conversationId),
            gt(schema.conversations.unreadCount, 0),
          ),
        )
        .returning({ unreadCount: schema.conversations.unreadCount });
      if (!updated) return;
      await this.audit(tx, context, 'CONVERSATION_MARKED_READ', conversationId, correlationId, {
        previous_unread_count: scoped.conversation.unreadCount,
      });
    });
    return { unread_count: 0 };
  }

  async assign(
    context: AuthorizationContext,
    conversationId: string,
    body: AssignConversationRequest,
    correlationId: string,
  ) {
    const scoped = await this.scopedConversation(context, conversationId);
    const cid = scoped.conversation.clientOrganizationId;
    const target = body.owner_membership_id
      ? await this.activeMembership(cid, body.owner_membership_id)
      : null;
    if (target)
      await this.assertMembershipCanAccessBranch(cid, target, scoped.conversation.branchId);
    if (body.team_id) await this.activeTeam(cid, scoped.conversation.branchId, body.team_id);
    if (target && body.team_id) {
      const [membership] = await this.connection.db
        .select({ membershipId: schema.teamMemberships.membershipId })
        .from(schema.teamMemberships)
        .where(
          and(
            eq(schema.teamMemberships.clientOrganizationId, cid),
            eq(schema.teamMemberships.teamId, body.team_id),
            eq(schema.teamMemberships.membershipId, target.id),
            isNull(schema.teamMemberships.endedAt),
          ),
        )
        .limit(1);
      if (!membership)
        throw forbidden('SCOPE_DENIED', 'The selected owner is not active in that team.');
    }
    return this.connection.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.conversations)
        .set({
          conversationOwnerId: target?.userId ?? null,
          conversationOwnerMembershipId: target?.id ?? null,
          teamId: body.team_id,
          updatedAt: new Date(),
          version: sql`${schema.conversations.version} + 1`,
        })
        .where(
          and(
            eq(schema.conversations.clientOrganizationId, cid),
            eq(schema.conversations.id, conversationId),
            eq(schema.conversations.version, body.expected_version),
          ),
        )
        .returning();
      if (!updated)
        throw conflict('VERSION_CONFLICT', 'The conversation changed; refresh and retry.');
      await tx
        .update(schema.leadOpportunities)
        .set({
          conversationOwnerId: target?.userId ?? null,
          conversationOwnerMembershipId: target?.id ?? null,
          updatedAt: new Date(),
          version: sql`${schema.leadOpportunities.version} + 1`,
        })
        .where(
          and(
            eq(schema.leadOpportunities.clientOrganizationId, cid),
            eq(schema.leadOpportunities.id, scoped.conversation.leadId),
          ),
        );
      await tx.insert(schema.conversationAssignments).values({
        assignedByMembershipId: context.membershipId,
        assignedByUserId: context.userId,
        clientOrganizationId: cid,
        conversationId,
        fromOwnerMembershipId: scoped.conversation.conversationOwnerMembershipId,
        fromTeamId: scoped.conversation.teamId,
        reason: body.reason,
        toOwnerMembershipId: target?.id ?? null,
        toTeamId: body.team_id,
      });
      await this.event(tx, cid, conversationId, 'CONVERSATION_ASSIGNED', correlationId, {
        owner_id: target?.userId ?? null,
        team_id: body.team_id,
      });
      await this.audit(
        tx,
        context,
        'CONVERSATION_ASSIGNED',
        conversationId,
        correlationId,
        {
          owner_id: target?.userId ?? null,
          team_id: body.team_id,
        },
        body.reason,
      );
      return this.presentConversation(updated, scoped.contactName, scoped.phone);
    });
  }

  async failures(context: AuthorizationContext) {
    const cid = clientId(context);
    const rows = await this.connection.db
      .select({
        message: schema.messages,
        outbox: schema.messageOutboundOutbox,
      })
      .from(schema.messageOutboundOutbox)
      .innerJoin(
        schema.messages,
        and(
          eq(schema.messages.clientOrganizationId, cid),
          eq(schema.messages.id, schema.messageOutboundOutbox.messageId),
        ),
      )
      .where(
        and(
          eq(schema.messageOutboundOutbox.clientOrganizationId, cid),
          inArray(schema.messageOutboundOutbox.status, ['FAILED', 'DEAD_LETTER']),
        ),
      )
      .orderBy(desc(schema.messageOutboundOutbox.updatedAt));
    return {
      failures: rows.map((row) => ({
        attempts: row.outbox.attempts,
        conversation_id: row.message.conversationId,
        error_code: row.outbox.lastErrorCode,
        error_message: row.outbox.lastErrorMessage,
        message_id: row.message.id,
        status: row.outbox.status,
      })),
    };
  }

  async retry(context: AuthorizationContext, messageId: string, correlationId: string) {
    const cid = clientId(context);
    const [row] = await this.connection.db
      .select({ message: schema.messages, outbox: schema.messageOutboundOutbox })
      .from(schema.messageOutboundOutbox)
      .innerJoin(
        schema.messages,
        and(
          eq(schema.messages.clientOrganizationId, cid),
          eq(schema.messages.id, schema.messageOutboundOutbox.messageId),
        ),
      )
      .where(
        and(
          eq(schema.messageOutboundOutbox.clientOrganizationId, cid),
          eq(schema.messageOutboundOutbox.messageId, messageId),
        ),
      )
      .limit(1);
    if (!row) throw notFound('Failed message was not found.');
    await this.scopedConversation(context, row.message.conversationId);
    if (!['FAILED', 'DEAD_LETTER'].includes(row.outbox.status))
      throw conflict('INVALID_RETRY_STATE', 'Only failed or dead-letter messages can be retried.');
    await this.connection.db
      .update(schema.messageOutboundOutbox)
      .set({
        availableAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null,
        status: 'PENDING',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.messageOutboundOutbox.clientOrganizationId, cid),
          eq(schema.messageOutboundOutbox.messageId, messageId),
        ),
      );
    await this.dispatchMessage(cid, messageId, correlationId);
    return { accepted: true, message_id: messageId };
  }

  async beginMediaUpload(
    context: AuthorizationContext,
    body: BeginMessageMediaUploadRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    const scoped = await this.scopedConversation(context, body.conversation_id);
    await this.assertOutboundAllowed(scoped.conversation, undefined);
    if (body.size_bytes > this.config.mediaMaxBytes)
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [{ field: 'size_bytes', reason: 'Media exceeds the configured limit.' }],
        message: 'Media is too large.',
        retryable: false,
      });
    const cid = scoped.conversation.clientOrganizationId;
    const key = requiredIdempotencyKey(idempotencyKey);
    const requestFingerprint = fingerprint({ body, command: 'BEGIN_MEDIA_UPLOAD' });
    const filename = sanitizeFilename(body.filename);
    const objectKey = `clients/${cid}/messaging/${body.conversation_id}/${randomUUID()}/${filename}`;
    let message: MessageRow;
    let media: typeof schema.messageMedia.$inferSelect;
    try {
      ({ message, media } = await this.connection.db.transaction(async (tx) => {
        const now = new Date();
        const [created] = await tx
          .insert(schema.messages)
          .values({
            bodyText: body.caption,
            clientIdempotencyKey: key,
            clientOrganizationId: cid,
            contentType: 'MEDIA',
            conversationId: body.conversation_id,
            direction: 'OUTBOUND',
            providerOccurredAt: now,
            requestFingerprint,
            senderMembershipId: context.membershipId,
            senderUserId: context.userId,
            status: 'QUEUED',
          })
          .returning();
        const [createdMedia] = await tx
          .insert(schema.messageMedia)
          .values({
            clientOrganizationId: cid,
            messageId: created!.id,
            mimeType: body.mime_type,
            objectKey,
            originalFilename: filename,
            retentionExpiresAt: this.mediaRetentionExpiresAt(),
            sizeBytes: body.size_bytes,
          })
          .returning();
        await tx.insert(schema.messageStatusHistory).values({
          clientOrganizationId: cid,
          messageId: created!.id,
          occurredAt: now,
          status: 'QUEUED',
        });
        await this.audit(
          tx,
          context,
          'MESSAGE_MEDIA_UPLOAD_STARTED',
          createdMedia!.id,
          correlationId,
          {
            conversation_id: body.conversation_id,
            mime_type: body.mime_type,
            size_bytes: body.size_bytes,
          },
        );
        return { media: createdMedia!, message: created! };
      }));
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const [replayed] = await this.connection.db
        .select({ media: schema.messageMedia, message: schema.messages })
        .from(schema.messages)
        .innerJoin(
          schema.messageMedia,
          and(
            eq(schema.messageMedia.clientOrganizationId, cid),
            eq(schema.messageMedia.messageId, schema.messages.id),
          ),
        )
        .where(
          and(
            eq(schema.messages.clientOrganizationId, cid),
            eq(schema.messages.clientIdempotencyKey, key),
          ),
        )
        .limit(1);
      if (!replayed) throw error;
      assertIdempotentReplay(replayed.message, requestFingerprint);
      message = replayed.message;
      media = replayed.media;
    }
    const upload = await this.storage.createUploadUrl({
      contentType: media.mimeType,
      expiresInSeconds: this.config.mediaUrlTtlSeconds,
      key: media.objectKey!,
      ...(media.sizeBytes === null ? {} : { contentLength: media.sizeBytes }),
    });
    return {
      media_id: media.id,
      message_id: message.id,
      upload,
    };
  }

  async completeMediaUpload(
    context: AuthorizationContext,
    mediaId: string,
    body: CompleteMessageMediaUploadRequest,
    correlationId: string,
  ) {
    const cid = clientId(context);
    const [row] = await this.connection.db
      .select({ media: schema.messageMedia, message: schema.messages })
      .from(schema.messageMedia)
      .innerJoin(
        schema.messages,
        and(
          eq(schema.messages.clientOrganizationId, cid),
          eq(schema.messages.id, schema.messageMedia.messageId),
        ),
      )
      .where(
        and(eq(schema.messageMedia.clientOrganizationId, cid), eq(schema.messageMedia.id, mediaId)),
      )
      .limit(1);
    if (!row?.media.objectKey) throw notFound('Message media was not found.');
    await this.scopedConversation(context, row.message.conversationId);
    const stored = await this.storage.stat(row.media.objectKey);
    if (
      !stored ||
      stored.contentLength !== row.media.sizeBytes ||
      stored.contentType !== row.media.mimeType ||
      (body.checksum_sha256 &&
        stored.checksumSha256 &&
        stored.checksumSha256 !== body.checksum_sha256)
    )
      throw conflict(
        'MEDIA_METADATA_MISMATCH',
        'Uploaded media metadata does not match the request.',
      );
    await this.connection.db.transaction(async (tx) => {
      await tx
        .update(schema.messageMedia)
        .set({ availability: 'AVAILABLE', checksumSha256: body.checksum_sha256 })
        .where(
          and(
            eq(schema.messageMedia.clientOrganizationId, cid),
            eq(schema.messageMedia.id, mediaId),
          ),
        );
      await tx
        .insert(schema.messageOutboundOutbox)
        .values({ clientOrganizationId: cid, messageId: row.message.id })
        .onConflictDoNothing();
      await this.audit(tx, context, 'MESSAGE_MEDIA_UPLOAD_COMPLETED', mediaId, correlationId, {
        message_id: row.message.id,
      });
    });
    await this.dispatchMessage(cid, row.message.id, correlationId);
    return { accepted: true, message_id: row.message.id };
  }

  async mediaAccess(context: AuthorizationContext, mediaId: string, correlationId: string) {
    const cid = clientId(context);
    const [row] = await this.connection.db
      .select({ media: schema.messageMedia, message: schema.messages })
      .from(schema.messageMedia)
      .innerJoin(
        schema.messages,
        and(
          eq(schema.messages.clientOrganizationId, cid),
          eq(schema.messages.id, schema.messageMedia.messageId),
        ),
      )
      .where(
        and(eq(schema.messageMedia.clientOrganizationId, cid), eq(schema.messageMedia.id, mediaId)),
      )
      .limit(1);
    if (!row?.media.objectKey || row.media.availability !== 'AVAILABLE')
      throw notFound('Media is unavailable.');
    await this.scopedConversation(context, row.message.conversationId);
    if (row.media.retentionExpiresAt && row.media.retentionExpiresAt.getTime() <= Date.now())
      throw forbidden('RETENTION_EXPIRED', 'Media retention has expired.');
    const access = await this.storage.createDownloadUrl({
      expiresInSeconds: this.config.mediaUrlTtlSeconds,
      key: row.media.objectKey,
      ...(row.media.originalFilename ? { downloadFileName: row.media.originalFilename } : {}),
    });
    await this.connection.db.insert(schema.auditEvents).values({
      action: 'MESSAGE_MEDIA_ACCESSED',
      actorId: context.userId,
      actorType: 'USER',
      clientOrganizationId: cid,
      correlationId,
      effectiveRole: context.roleCode,
      entityId: mediaId,
      entityType: 'MESSAGE_MEDIA',
      newSummary: { message_id: row.message.id },
      outcome: 'SUCCESS',
      scope: 'CLIENT',
    });
    return access;
  }

  async verifyChallenge(
    providerCode: string,
    connectionKey: string,
    mode: string,
    verifyToken: string,
    challenge: string,
  ) {
    await this.rateLimiter.assertWebhookAllowed(providerCode, connectionKey);
    if (mode !== 'subscribe') throw new UnauthorizedException('Webhook verification failed.');
    const connection = await this.connectionByKey(connectionKey);
    if (connection.provider !== providerCode.toUpperCase())
      throw new UnauthorizedException('Webhook provider does not match the connection.');
    const providerConnection = this.providerConnection(connection);
    if (!providerConnection.verifyToken || providerConnection.verifyToken !== verifyToken)
      throw new UnauthorizedException('Webhook verification failed.');
    await this.connection.db
      .update(schema.messagingProviderConnections)
      .set({ webhookState: 'VERIFIED', updatedAt: new Date() })
      .where(eq(schema.messagingProviderConnections.id, connection.id));
    return challenge;
  }

  async receiveWebhook(input: {
    connectionKey: string;
    correlationId: string;
    headers: Record<string, string | string[] | undefined>;
    payload: unknown;
    providerCode: string;
    rawBody?: string;
  }) {
    await this.rateLimiter.assertWebhookAllowed(input.providerCode, input.connectionKey);
    const connection = await this.connectionByKey(input.connectionKey);
    if (connection.provider !== input.providerCode.toUpperCase())
      throw new UnauthorizedException('Webhook provider does not match the connection.');
    const provider = this.providers.provider(connection.provider);
    if (!provider) throw new UnauthorizedException('Webhook provider is unavailable.');
    const rawBody = input.rawBody ?? JSON.stringify(input.payload);
    if (Buffer.byteLength(rawBody, 'utf8') > MESSAGING_WEBHOOK_MAX_RAW_BYTES) {
      throw new BadRequestException({
        code: 'WEBHOOK_PAYLOAD_TOO_LARGE',
        details: [],
        message: 'The messaging webhook payload exceeds the accepted byte budget.',
        retryable: false,
      });
    }
    if (
      !(await provider.verifyWebhook({
        connection: this.providerConnection(connection),
        headers: input.headers,
        rawBody,
      }))
    )
      throw new UnauthorizedException('Webhook signature verification failed.');
    const events = await provider.parseWebhook({
      connection: this.providerConnection(connection),
      payload: input.payload,
    });
    if (events.length > MESSAGING_WEBHOOK_MAX_EVENTS) {
      throw new BadRequestException({
        code: 'WEBHOOK_EVENT_LIMIT_EXCEEDED',
        details: [],
        message: 'The messaging webhook contains too many events.',
        retryable: false,
      });
    }
    let duplicates = 0;
    let failed = 0;
    let processed = 0;
    let queued = 0;
    for (const event of events) {
      const receipt = await this.registerWebhookEvent(
        connection,
        event,
        input.payload,
        input.correlationId,
      );
      if (receipt.duplicate) duplicates += 1;
      const webhookEventId = receipt.id;
      if (!webhookEventId) continue;
      if (this.queueFactory) {
        try {
          this.backgroundQueue ??= this.queueFactory.createQueue(PLATFORM_BACKGROUND_QUEUE);
          await this.backgroundQueue.add(
            'messaging.webhook.process',
            { webhookEventId },
            {
              attempts: this.config.outboundMaxAttempts,
              backoff: { delay: messagingRetryDelayWithJitter(1), type: 'exponential' },
              jobId: webhookEventId,
              removeOnComplete: 1_000,
              removeOnFail: 1_000,
            },
          );
          queued += 1;
        } catch (error) {
          failed += 1;
          await this.connection.db
            .update(schema.webhookEvents)
            .set({
              lastErrorCode: 'QUEUE_UNAVAILABLE',
              lastErrorMessage:
                error instanceof Error ? error.message.slice(0, 1000) : 'Queue unavailable.',
            })
            .where(eq(schema.webhookEvents.id, webhookEventId));
        }
      } else {
        const result = await this.processStoredWebhookEvent(webhookEventId);
        if (result === 'DUPLICATE') duplicates += 1;
        else if (result === 'FAILED') failed += 1;
        else processed += 1;
      }
    }
    await this.connection.db
      .update(schema.messagingProviderConnections)
      .set({ lastWebhookAt: new Date(), webhookState: 'VERIFIED', updatedAt: new Date() })
      .where(eq(schema.messagingProviderConnections.id, connection.id));
    return {
      accepted: true,
      duplicates,
      failed,
      processed,
      ...(queued > 0 ? { queued } : {}),
    };
  }

  private async registerWebhookEvent(
    connection: ConnectionRow,
    event: NormalizedMessagingEvent,
    rawPayload: unknown,
    correlationId: string,
  ): Promise<{ duplicate: boolean; id: string | null }> {
    const externalEventId =
      event.kind === 'MESSAGE' ? event.message.externalEventId : event.status.externalEventId;
    const eventType = event.kind === 'MESSAGE' ? 'MESSAGE' : `STATUS_${event.status.status}`;
    try {
      const [webhook] = await this.connection.db
        .insert(schema.webhookEvents)
        .values({
          clientOrganizationId: connection.clientOrganizationId,
          correlationId,
          eventType,
          externalEventId,
          normalizedPayload: { connection_id: connection.id, event },
          provider: `MESSAGING:${connection.provider}`,
          rawPayload: (typeof rawPayload === 'object' && rawPayload !== null
            ? rawPayload
            : { value: rawPayload }) as Record<string, unknown>,
          rawPayloadExpiresAt: new Date(
            Date.now() + this.config.webhookRawRetentionHours * 3_600_000,
          ),
          signatureVerifiedAt: new Date(),
          status: 'RECEIVED',
        })
        .returning();
      return { duplicate: false, id: webhook!.id };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const [existing] = await this.connection.db
          .select({ id: schema.webhookEvents.id, status: schema.webhookEvents.status })
          .from(schema.webhookEvents)
          .where(
            and(
              eq(schema.webhookEvents.clientOrganizationId, connection.clientOrganizationId),
              eq(schema.webhookEvents.provider, `MESSAGING:${connection.provider}`),
              eq(schema.webhookEvents.externalEventId, externalEventId),
            ),
          )
          .limit(1);
        return {
          duplicate: true,
          id: existing && ['RECEIVED', 'FAILED'].includes(existing.status) ? existing.id : null,
        };
      }
      throw error;
    }
  }

  async processWebhookJob(webhookEventId: string): Promise<{ status: string }> {
    const status = await this.processStoredWebhookEvent(webhookEventId);
    if (status === 'FAILED') throw new Error(`Messaging webhook ${webhookEventId} failed.`);
    return { status };
  }

  async processOutboundJob(input: {
    clientOrganizationId: string;
    correlationId: string;
    messageId: string;
  }): Promise<{ accepted: true }> {
    await this.dispatchMessage(input.clientOrganizationId, input.messageId, input.correlationId);
    return { accepted: true };
  }

  async processRetentionJob(): Promise<{
    mediaDeleted: number;
    mediaFailed: number;
    webhookPayloadsRedacted: number;
  }> {
    const expiredWebhooks = await this.connection.db
      .select({ id: schema.webhookEvents.id })
      .from(schema.webhookEvents)
      .where(
        and(
          sql`${schema.webhookEvents.provider} like 'MESSAGING:%'`,
          sql`${schema.webhookEvents.rawPayloadExpiresAt} <= now()`,
          sql`${schema.webhookEvents.rawPayload} <> '{}'::jsonb`,
        ),
      )
      .limit(500);
    let webhookPayloadsRedacted = 0;
    if (expiredWebhooks.length > 0) {
      const redacted = await this.connection.db
        .update(schema.webhookEvents)
        .set({ rawPayload: {} })
        .where(
          inArray(
            schema.webhookEvents.id,
            expiredWebhooks.map((row) => row.id),
          ),
        )
        .returning({ id: schema.webhookEvents.id });
      webhookPayloadsRedacted = redacted.length;
    }

    let mediaDeleted = 0;
    let mediaFailed = 0;
    if (this.storage.deletePrivateObject) {
      const expiredMedia = await this.connection.db
        .select({ id: schema.messageMedia.id, objectKey: schema.messageMedia.objectKey })
        .from(schema.messageMedia)
        .where(
          and(
            sql`${schema.messageMedia.retentionExpiresAt} <= now()`,
            inArray(schema.messageMedia.availability, ['PENDING', 'AVAILABLE', 'UNAVAILABLE']),
            sql`${schema.messageMedia.objectKey} is not null`,
          ),
        )
        .limit(100);
      for (const media of expiredMedia) {
        if (!media.objectKey) continue;
        try {
          await this.storage.deletePrivateObject(media.objectKey);
          await this.connection.db
            .update(schema.messageMedia)
            .set({
              availability: 'EXPIRED',
              objectKey: null,
            })
            .where(
              and(
                eq(schema.messageMedia.id, media.id),
                eq(schema.messageMedia.objectKey, media.objectKey),
              ),
            );
          mediaDeleted += 1;
        } catch {
          mediaFailed += 1;
        }
      }
    }
    return { mediaDeleted, mediaFailed, webhookPayloadsRedacted };
  }

  async reconcileWebhooks(context: AuthorizationContext, correlationId: string) {
    const cid = clientId(context);
    const pending = await this.connection.db
      .select({ id: schema.webhookEvents.id })
      .from(schema.webhookEvents)
      .where(
        and(
          eq(schema.webhookEvents.clientOrganizationId, cid),
          inArray(schema.webhookEvents.status, ['RECEIVED', 'FAILED']),
          sql`${schema.webhookEvents.availableAt} <= now()`,
          sql`${schema.webhookEvents.provider} like 'MESSAGING:%'`,
        ),
      )
      .orderBy(asc(schema.webhookEvents.receivedAt))
      .limit(100);
    let failed = 0;
    let processed = 0;
    for (const row of pending) {
      const result = await this.processStoredWebhookEvent(row.id);
      if (result === 'FAILED') failed += 1;
      else processed += 1;
    }
    await this.connection.db.insert(schema.auditEvents).values({
      action: 'MESSAGING_WEBHOOK_RECONCILED',
      actorId: context.userId,
      actorType: 'USER',
      clientOrganizationId: cid,
      correlationId,
      effectiveRole: context.roleCode,
      entityId: cid,
      entityType: 'MESSAGING_WEBHOOK',
      newSummary: { attempted: pending.length, failed, processed },
      outcome: failed > 0 ? 'FAILURE' : 'SUCCESS',
      scope: 'CLIENT',
    });
    return { attempted: pending.length, failed, processed };
  }

  private async processStoredWebhookEvent(
    webhookEventId: string,
  ): Promise<'DUPLICATE' | 'FAILED' | 'PROCESSED'> {
    const [webhook] = await this.connection.db
      .select()
      .from(schema.webhookEvents)
      .where(eq(schema.webhookEvents.id, webhookEventId))
      .limit(1);
    if (!webhook) throw notFound('Messaging webhook receipt was not found.');
    if (webhook.status === 'PROCESSED' || webhook.status === 'DUPLICATE') return webhook.status;
    if (webhook.status === 'DEAD_LETTER') return 'FAILED';
    const stored = webhook.normalizedPayload as {
      connection_id?: unknown;
      event?: {
        kind?: unknown;
        message?: Record<string, unknown>;
        status?: Record<string, unknown>;
      };
    } | null;
    if (typeof stored?.connection_id !== 'string' || !stored.event)
      throw new Error('Messaging webhook normalization is missing.');
    const [connection] = await this.connection.db
      .select()
      .from(schema.messagingProviderConnections)
      .where(
        and(
          eq(
            schema.messagingProviderConnections.clientOrganizationId,
            webhook.clientOrganizationId,
          ),
          eq(schema.messagingProviderConnections.id, stored.connection_id),
        ),
      )
      .limit(1);
    if (!connection) throw new Error('Messaging webhook connection is unavailable.');
    let event: NormalizedMessagingEvent;
    if (stored.event.kind === 'MESSAGE' && stored.event.message) {
      event = {
        kind: 'MESSAGE',
        message: {
          ...(stored.event.message as unknown as NormalizedInboundMessage),
          occurredAt: new Date(String(stored.event.message.occurredAt)),
        },
      };
    } else if (stored.event.kind === 'STATUS' && stored.event.status) {
      event = {
        kind: 'STATUS',
        status: {
          ...(stored.event.status as unknown as NormalizedStatusEvent),
          occurredAt: new Date(String(stored.event.status.occurredAt)),
        },
      };
    } else {
      throw new Error('Messaging webhook event kind is invalid.');
    }
    const [claim] = await this.connection.db
      .update(schema.webhookEvents)
      .set({
        attempts: sql`${schema.webhookEvents.attempts} + 1`,
        availableAt: new Date(Date.now() + MESSAGING_WEBHOOK_PROCESSING_LEASE_MS),
        status: 'PROCESSING',
      })
      .where(
        and(
          eq(schema.webhookEvents.id, webhook.id),
          sql`${schema.webhookEvents.availableAt} <= now()`,
          inArray(schema.webhookEvents.status, ['RECEIVED', 'FAILED', 'PROCESSING']),
        ),
      )
      .returning();
    if (!claim) {
      const [current] = await this.connection.db
        .select({ status: schema.webhookEvents.status })
        .from(schema.webhookEvents)
        .where(eq(schema.webhookEvents.id, webhook.id))
        .limit(1);
      return current?.status === 'PROCESSED' || current?.status === 'DUPLICATE'
        ? current.status
        : 'FAILED';
    }
    const attempt = claim.attempts;
    try {
      if (event.kind === 'MESSAGE')
        await this.processInboundMessage(
          connection,
          event.message,
          webhook.id,
          webhook.correlationId,
        );
      else await this.processStatus(connection, event.status, webhook.id, webhook.correlationId);
      await this.connection.db
        .update(schema.webhookEvents)
        .set({
          lastErrorCode: null,
          lastErrorMessage: null,
          processedAt: new Date(),
          status: 'PROCESSED',
        })
        .where(
          and(eq(schema.webhookEvents.id, webhook.id), eq(schema.webhookEvents.attempts, attempt)),
        );
      return 'PROCESSED';
    } catch (error) {
      if (isUniqueViolation(error)) {
        await this.connection.db
          .update(schema.webhookEvents)
          .set({ processedAt: new Date(), status: 'DUPLICATE' })
          .where(
            and(
              eq(schema.webhookEvents.id, webhook.id),
              eq(schema.webhookEvents.attempts, attempt),
            ),
          );
        return 'DUPLICATE';
      }
      await this.connection.db
        .update(schema.webhookEvents)
        .set({
          availableAt: new Date(Date.now() + messagingRetryDelayWithJitter(attempt)),
          lastErrorCode: error instanceof Error ? error.name : 'PROCESSING_ERROR',
          lastErrorMessage:
            error instanceof Error ? error.message.slice(0, 1000) : 'Processing failed.',
          status: attempt >= this.config.outboundMaxAttempts ? 'DEAD_LETTER' : 'FAILED',
        })
        .where(
          and(eq(schema.webhookEvents.id, webhook.id), eq(schema.webhookEvents.attempts, attempt)),
        );
      return 'FAILED';
    }
  }

  private async processInboundMessage(
    connection: ConnectionRow,
    event: NormalizedInboundMessage,
    webhookEventId: string,
    correlationId: string,
  ): Promise<void> {
    const remoteAddress = normalizeWhatsAppAddress(event.remoteAddress);
    let [conversation] = await this.connection.db
      .select()
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.clientOrganizationId, connection.clientOrganizationId),
          eq(schema.conversations.connectionId, connection.id),
          eq(schema.conversations.remoteAddress, remoteAddress),
          inArray(schema.conversations.status, ['OPEN', 'PENDING']),
        ),
      )
      .limit(1);
    if (!conversation) {
      conversation = await this.createConversationForInbound(
        connection,
        event,
        remoteAddress,
        correlationId,
      );
    }
    await this.connection.db.transaction(async (tx) => {
      const [message] = await tx
        .insert(schema.messages)
        .values({
          bodyText: event.bodyText ?? null,
          clientOrganizationId: connection.clientOrganizationId,
          contentType: event.contentType,
          conversationId: conversation!.id,
          direction: 'INBOUND',
          providerMessageId: event.providerMessageId,
          providerOccurredAt: event.occurredAt,
          providerSequence: event.providerSequence,
          referralMetadata: event.referral ?? {},
          status: 'RECEIVED',
        })
        .returning();
      if (event.media) {
        await tx.insert(schema.messageMedia).values({
          availability: 'PENDING',
          clientOrganizationId: connection.clientOrganizationId,
          messageId: message!.id,
          mimeType: event.media.mimeType,
          providerMediaId: event.media.providerMediaId,
          retentionExpiresAt: this.mediaRetentionExpiresAt(),
        });
      }
      await tx.insert(schema.messageStatusHistory).values({
        clientOrganizationId: connection.clientOrganizationId,
        messageId: message!.id,
        occurredAt: event.occurredAt,
        providerEventId: event.externalEventId,
        status: 'RECEIVED',
        metadata: { webhook_event_id: webhookEventId },
      });
      await tx
        .update(schema.conversations)
        .set({
          lastInboundAt: event.occurredAt,
          lastMessageAt: event.occurredAt,
          unreadCount: sql`${schema.conversations.unreadCount} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.conversations.clientOrganizationId, connection.clientOrganizationId),
            eq(schema.conversations.id, conversation!.id),
          ),
        );
      await tx.insert(schema.messagingOptInRecords).values({
        capturedAt: event.occurredAt,
        category: 'UTILITY',
        channel: 'WHATSAPP',
        clientOrganizationId: connection.clientOrganizationId,
        contactId: conversation!.contactId,
        evidence: `Customer initiated message ${event.providerMessageId}.`,
        noticeVersion: 'provider-customer-initiated-v1',
        source: connection.provider,
        status: 'GRANTED',
      });
      await this.event(
        tx,
        connection.clientOrganizationId,
        message!.id,
        'MESSAGE_RECEIVED',
        correlationId,
        {
          conversation_id: conversation!.id,
          lead_id: conversation!.leadId,
        },
      );
    });
  }

  private async createConversationForInbound(
    connection: ConnectionRow,
    event: NormalizedInboundMessage,
    remoteAddress: string,
    correlationId: string,
  ): Promise<ConversationRow> {
    let [match] = await this.connection.db
      .select({
        contact: schema.contacts,
        lead: schema.leadOpportunities,
        teamId: schema.assignmentQueues.teamId,
      })
      .from(schema.contacts)
      .innerJoin(
        schema.leadOpportunities,
        and(
          eq(schema.leadOpportunities.clientOrganizationId, connection.clientOrganizationId),
          eq(schema.leadOpportunities.contactId, schema.contacts.id),
        ),
      )
      .leftJoin(
        schema.assignmentQueues,
        and(
          eq(schema.assignmentQueues.clientOrganizationId, connection.clientOrganizationId),
          eq(schema.assignmentQueues.id, schema.leadOpportunities.assignmentQueueId),
        ),
      )
      .where(
        and(
          eq(schema.contacts.clientOrganizationId, connection.clientOrganizationId),
          or(
            eq(schema.contacts.primaryPhoneE164, remoteAddress),
            eq(schema.contacts.alternatePhoneE164, remoteAddress),
          ),
        ),
      )
      .orderBy(desc(schema.leadOpportunities.capturedAt))
      .limit(1);
    if (!match && event.referral) {
      const referral = event.referral;
      const result = await this.leads.createProvider({
        body: {
          assignment_queue_id: connection.defaultAssignmentQueueId,
          branch_id: connection.branchId,
          campaign: {
            ad_id: typeof referral.ad_id === 'string' ? referral.ad_id : null,
            campaign_id: typeof referral.campaign_id === 'string' ? referral.campaign_id : null,
            page_url: typeof referral.source_url === 'string' ? referral.source_url : null,
          },
          consent: {
            evidence: `Customer initiated official WhatsApp message ${event.providerMessageId}.`,
            granted: true,
            notice_version: 'whatsapp-inbound-v1',
            purpose: 'LEAD_RESPONSE',
          },
          name: event.customerDisplayName ?? `WhatsApp ${remoteAddress.slice(-4)}`,
          phone: remoteAddress,
          source: 'WHATSAPP_AD',
          source_metadata: referral,
          vehicle_interest:
            typeof referral.headline === 'string' ? referral.headline : 'WhatsApp enquiry',
        },
        clientOrganizationId: connection.clientOrganizationId,
        correlationId,
        externalEventId: event.externalEventId,
        provider: `MESSAGING:${connection.provider}`,
      });
      const leadId = (result as { lead?: { id?: string } }).lead?.id;
      if (!leadId) throw new Error('Provider lead creation did not return a Lead ID.');
      [match] = await this.connection.db
        .select({
          contact: schema.contacts,
          lead: schema.leadOpportunities,
          teamId: schema.assignmentQueues.teamId,
        })
        .from(schema.leadOpportunities)
        .innerJoin(
          schema.contacts,
          and(
            eq(schema.contacts.clientOrganizationId, connection.clientOrganizationId),
            eq(schema.contacts.id, schema.leadOpportunities.contactId),
          ),
        )
        .leftJoin(
          schema.assignmentQueues,
          and(
            eq(schema.assignmentQueues.clientOrganizationId, connection.clientOrganizationId),
            eq(schema.assignmentQueues.id, schema.leadOpportunities.assignmentQueueId),
          ),
        )
        .where(
          and(
            eq(schema.leadOpportunities.clientOrganizationId, connection.clientOrganizationId),
            eq(schema.leadOpportunities.id, leadId),
          ),
        )
        .limit(1);
    }
    if (!match)
      throw conflict(
        'UNMATCHED_INBOUND_MESSAGE',
        'Inbound sender has no canonical Lead/Contact and no verified Click-to-WhatsApp referral.',
      );
    return this.connection.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(schema.conversations)
        .values({
          branchId: match!.lead.branchId,
          channel: 'WHATSAPP',
          clientOrganizationId: connection.clientOrganizationId,
          connectionId: connection.id,
          contactId: match!.contact.id,
          conversationOwnerId: match!.lead.conversationOwnerId,
          conversationOwnerMembershipId: match!.lead.conversationOwnerMembershipId,
          leadId: match!.lead.id,
          remoteAddress,
          teamId: match!.teamId,
        })
        .returning();
      await tx.insert(schema.conversationParticipants).values({
        address: remoteAddress,
        clientOrganizationId: connection.clientOrganizationId,
        contactId: match!.contact.id,
        conversationId: created!.id,
        displayName: match!.contact.displayName,
        role: 'CUSTOMER',
      });
      if (match!.lead.conversationOwnerId && match!.lead.conversationOwnerMembershipId) {
        await tx.insert(schema.conversationParticipants).values({
          clientOrganizationId: connection.clientOrganizationId,
          conversationId: created!.id,
          membershipId: match!.lead.conversationOwnerMembershipId,
          role: 'AGENT',
          userId: match!.lead.conversationOwnerId,
        });
      } else if (match!.teamId) {
        await tx.insert(schema.conversationParticipants).values({
          clientOrganizationId: connection.clientOrganizationId,
          conversationId: created!.id,
          role: 'QUEUE',
          teamId: match!.teamId,
        });
      }
      await this.event(
        tx,
        connection.clientOrganizationId,
        created!.id,
        'CONVERSATION_OPENED',
        correlationId,
        {
          contact_id: match!.contact.id,
          lead_id: match!.lead.id,
        },
      );
      return created!;
    });
  }

  private async processStatus(
    connection: ConnectionRow,
    event: NormalizedStatusEvent,
    webhookEventId: string,
    correlationId: string,
  ): Promise<void> {
    const [message] = await this.connection.db
      .select()
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.clientOrganizationId, connection.clientOrganizationId),
          eq(schema.messages.providerMessageId, event.providerMessageId),
        ),
      )
      .limit(1);
    if (!message) throw notFound('Provider status references an unknown tenant message.');
    await this.connection.db.transaction(async (tx) => {
      await tx.insert(schema.messageStatusHistory).values({
        clientOrganizationId: connection.clientOrganizationId,
        errorCode: event.errorCode,
        errorMessage: event.errorMessage,
        messageId: message.id,
        metadata: { webhook_event_id: webhookEventId },
        occurredAt: event.occurredAt,
        providerEventId: event.externalEventId,
        status: event.status,
      });
      const history = await tx
        .select({
          createdAt: schema.messageStatusHistory.createdAt,
          id: schema.messageStatusHistory.id,
          occurredAt: schema.messageStatusHistory.occurredAt,
          status: schema.messageStatusHistory.status,
        })
        .from(schema.messageStatusHistory)
        .where(
          and(
            eq(schema.messageStatusHistory.clientOrganizationId, connection.clientOrganizationId),
            eq(schema.messageStatusHistory.messageId, message.id),
          ),
        );
      const projectedStatus = projectedDeliveryStatus(history);
      await tx
        .update(schema.messages)
        .set({ status: projectedStatus })
        .where(
          and(
            eq(schema.messages.clientOrganizationId, connection.clientOrganizationId),
            eq(schema.messages.id, message.id),
          ),
        );
      await this.event(
        tx,
        connection.clientOrganizationId,
        message.id,
        'MESSAGE_STATUS_CHANGED',
        correlationId,
        {
          projected_status: projectedStatus,
          status: event.status,
        },
      );
    });
  }

  private async dispatchMessage(
    cid: string,
    messageId: string,
    correlationId: string,
  ): Promise<void> {
    const [row] = await this.connection.db
      .select({
        connection: schema.messagingProviderConnections,
        conversation: schema.conversations,
        media: schema.messageMedia,
        message: schema.messages,
        outbox: schema.messageOutboundOutbox,
        template: schema.messageTemplates,
      })
      .from(schema.messages)
      .innerJoin(
        schema.conversations,
        and(
          eq(schema.conversations.clientOrganizationId, cid),
          eq(schema.conversations.id, schema.messages.conversationId),
        ),
      )
      .innerJoin(
        schema.messagingProviderConnections,
        and(
          eq(schema.messagingProviderConnections.clientOrganizationId, cid),
          eq(schema.messagingProviderConnections.id, schema.conversations.connectionId),
        ),
      )
      .leftJoin(
        schema.messageTemplates,
        and(
          eq(schema.messageTemplates.clientOrganizationId, cid),
          eq(schema.messageTemplates.id, schema.messages.templateId),
        ),
      )
      .innerJoin(
        schema.messageOutboundOutbox,
        and(
          eq(schema.messageOutboundOutbox.clientOrganizationId, cid),
          eq(schema.messageOutboundOutbox.messageId, schema.messages.id),
        ),
      )
      .leftJoin(
        schema.messageMedia,
        and(
          eq(schema.messageMedia.clientOrganizationId, cid),
          eq(schema.messageMedia.messageId, schema.messages.id),
        ),
      )
      .where(and(eq(schema.messages.clientOrganizationId, cid), eq(schema.messages.id, messageId)))
      .limit(1);
    if (!row) throw notFound('Queued message was not found.');
    const provider = this.providers.provider(row.connection.provider);
    if (
      row.outbox.status === 'PROCESSING' &&
      row.outbox.lockedAt &&
      row.outbox.lockedAt.getTime() <= Date.now() - MESSAGING_OUTBOUND_AMBIGUITY_MS
    ) {
      const now = new Date();
      await this.connection.db.transaction(async (tx) => {
        await tx
          .update(schema.messages)
          .set({ status: 'FAILED' })
          .where(
            and(eq(schema.messages.clientOrganizationId, cid), eq(schema.messages.id, messageId)),
          );
        await tx.insert(schema.messageStatusHistory).values({
          clientOrganizationId: cid,
          errorCode: 'PROVIDER_ACCEPTANCE_UNKNOWN',
          errorMessage:
            'The provider may have accepted this send before the worker stopped. Automatic resend is blocked.',
          messageId,
          occurredAt: now,
          status: 'FAILED',
        });
        await tx
          .update(schema.messageOutboundOutbox)
          .set({
            lastErrorCode: 'PROVIDER_ACCEPTANCE_UNKNOWN',
            lastErrorMessage: 'Manual provider reconciliation is required before retrying.',
            lockedAt: null,
            lockedBy: null,
            status: 'DEAD_LETTER',
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.messageOutboundOutbox.clientOrganizationId, cid),
              eq(schema.messageOutboundOutbox.messageId, messageId),
              eq(schema.messageOutboundOutbox.status, 'PROCESSING'),
            ),
          );
        await this.event(tx, cid, messageId, 'MESSAGE_DEAD_LETTERED', correlationId, {
          reason: 'PROVIDER_ACCEPTANCE_UNKNOWN',
        });
      });
      return;
    }
    const [claim] = await this.connection.db
      .update(schema.messageOutboundOutbox)
      .set({
        attempts: sql`${schema.messageOutboundOutbox.attempts} + 1`,
        lockedAt: new Date(),
        lockedBy: `messaging:${process.pid}`,
        status: 'PROCESSING',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.messageOutboundOutbox.clientOrganizationId, cid),
          eq(schema.messageOutboundOutbox.messageId, messageId),
          inArray(schema.messageOutboundOutbox.status, ['PENDING', 'FAILED']),
          sql`${schema.messageOutboundOutbox.availableAt} <= now()`,
        ),
      )
      .returning();
    if (!claim) return;
    try {
      if (!provider || row.connection.status !== 'ACTIVE')
        throw new Error('The messaging provider connection is not active.');
      await this.connection.db
        .update(schema.messages)
        .set({ status: 'SENDING' })
        .where(
          and(eq(schema.messages.clientOrganizationId, cid), eq(schema.messages.id, messageId)),
        );
      const result = await this.rateLimiter.withOutboundPermit(cid, row.connection.provider, () =>
        provider.sendMessage(this.providerConnection(row.connection), {
          contentType: row.message.contentType as 'TEXT' | 'TEMPLATE' | 'MEDIA',
          ...(row.media?.objectKey
            ? { media: { mimeType: row.media.mimeType, objectKey: row.media.objectKey } }
            : {}),
          remoteAddress: row.conversation.remoteAddress,
          ...(row.template
            ? {
                template: {
                  language: row.template.language,
                  name: row.template.name,
                  variables: row.message.templateVariables,
                },
              }
            : {}),
          ...(row.message.bodyText ? { text: row.message.bodyText } : {}),
        }),
      );
      const now = new Date();
      await this.connection.db.transaction(async (tx) => {
        await tx
          .update(schema.messages)
          .set({ providerMessageId: result.providerMessageId, status: 'SENT' })
          .where(
            and(eq(schema.messages.clientOrganizationId, cid), eq(schema.messages.id, messageId)),
          );
        await tx.insert(schema.messageStatusHistory).values({
          clientOrganizationId: cid,
          messageId,
          occurredAt: now,
          status: 'SENT',
        });
        await tx
          .update(schema.messageOutboundOutbox)
          .set({
            lastErrorCode: null,
            lastErrorMessage: null,
            lockedAt: null,
            lockedBy: null,
            sentAt: now,
            status: 'SENT',
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.messageOutboundOutbox.clientOrganizationId, cid),
              eq(schema.messageOutboundOutbox.messageId, messageId),
            ),
          );
        await this.event(tx, cid, messageId, 'MESSAGE_SENT', correlationId, {
          provider_message_id: result.providerMessageId,
        });
      });
    } catch (error) {
      const attempts = claim.attempts;
      const terminal = attempts >= this.config.outboundMaxAttempts;
      const now = new Date();
      const availableAt = new Date(Date.now() + messagingRetryDelayWithJitter(attempts));
      await this.connection.db.transaction(async (tx) => {
        await tx
          .update(schema.messages)
          .set({ status: 'FAILED' })
          .where(
            and(eq(schema.messages.clientOrganizationId, cid), eq(schema.messages.id, messageId)),
          );
        await tx.insert(schema.messageStatusHistory).values({
          clientOrganizationId: cid,
          errorCode: 'PROVIDER_SEND_FAILED',
          errorMessage:
            error instanceof Error ? error.message.slice(0, 1000) : 'Provider send failed.',
          messageId,
          occurredAt: now,
          status: 'FAILED',
        });
        await tx
          .update(schema.messageOutboundOutbox)
          .set({
            attempts,
            availableAt,
            lastErrorCode: 'PROVIDER_SEND_FAILED',
            lastErrorMessage:
              error instanceof Error ? error.message.slice(0, 1000) : 'Provider send failed.',
            lockedAt: null,
            lockedBy: null,
            status: terminal ? 'DEAD_LETTER' : 'FAILED',
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.messageOutboundOutbox.clientOrganizationId, cid),
              eq(schema.messageOutboundOutbox.messageId, messageId),
            ),
          );
        await this.event(
          tx,
          cid,
          messageId,
          terminal ? 'MESSAGE_DEAD_LETTERED' : 'MESSAGE_FAILED',
          correlationId,
          {
            attempts,
          },
        );
      });
      if (!terminal) {
        await this.enqueueOutboundRetry(cid, messageId, correlationId, attempts, availableAt);
      }
    }
  }

  private async assertOutboundAllowed(
    conversation: ConversationRow,
    template: typeof schema.messageTemplates.$inferSelect | undefined,
  ): Promise<void> {
    if (conversation.channel !== 'WHATSAPP') {
      throw providerUnavailable(
        `No outbound policy adapter is active for the ${conversation.channel} channel.`,
      );
    }
    const now = new Date();
    const suppressions = await this.connection.db
      .select()
      .from(schema.messagingSuppressions)
      .where(
        and(
          eq(schema.messagingSuppressions.clientOrganizationId, conversation.clientOrganizationId),
          eq(schema.messagingSuppressions.contactId, conversation.contactId),
          eq(schema.messagingSuppressions.channel, conversation.channel),
          eq(schema.messagingSuppressions.active, true),
          or(
            isNull(schema.messagingSuppressions.endsAt),
            gt(schema.messagingSuppressions.endsAt, now),
          ),
        ),
      );
    if (suppressions.some((row) => row.scope === 'ALL'))
      throw forbidden(
        'CUSTOMER_SUPPRESSED',
        'This customer is suppressed for all messages on the channel.',
      );
    const windowOpen =
      conversation.lastInboundAt !== null &&
      conversation.lastInboundAt.getTime() + this.config.serviceWindowHours * 3_600_000 >
        now.getTime();
    if (!template) {
      if (!windowOpen)
        throw forbidden(
          'TEMPLATE_REQUIRED',
          'An approved template is required outside the customer service window.',
        );
      return;
    }
    if (template.status !== 'APPROVED')
      throw forbidden('TEMPLATE_NOT_APPROVED', 'Only an approved provider template may be sent.');
    if (template.category === 'MARKETING' && suppressions.some((row) => row.scope === 'MARKETING'))
      throw forbidden('CUSTOMER_SUPPRESSED', 'This customer is suppressed for marketing messages.');
    const [latestOptIn] = await this.connection.db
      .select()
      .from(schema.messagingOptInRecords)
      .where(
        and(
          eq(schema.messagingOptInRecords.clientOrganizationId, conversation.clientOrganizationId),
          eq(schema.messagingOptInRecords.contactId, conversation.contactId),
          eq(schema.messagingOptInRecords.channel, conversation.channel),
          eq(schema.messagingOptInRecords.category, template.category),
        ),
      )
      .orderBy(desc(schema.messagingOptInRecords.capturedAt), desc(schema.messagingOptInRecords.id))
      .limit(1);
    if (latestOptIn?.status !== 'GRANTED')
      throw forbidden(
        'OPT_IN_REQUIRED',
        `A current ${template.category.toLowerCase()} opt-in is required.`,
      );
  }

  private assertTemplateVariables(bodyText: string, variables: Record<string, string>): void {
    const expected = messageTemplateVariableKeys(bodyText);
    const provided = Object.keys(variables).sort((left, right) => Number(left) - Number(right));
    if (
      expected.length !== provided.length ||
      expected.some((key, index) => key !== provided[index])
    ) {
      throw new BadRequestException({
        code: 'TEMPLATE_VARIABLES_INVALID',
        details: [
          {
            field: 'variables',
            reason: `Expected exactly: ${expected.length > 0 ? expected.join(', ') : 'none'}.`,
          },
        ],
        message: 'Template variables do not match the approved provider template.',
        retryable: false,
      });
    }
  }

  private mediaRetentionExpiresAt(): Date {
    return new Date(Date.now() + this.config.mediaRetentionDays * 24 * 3_600_000);
  }

  private async enqueueOutboundRetry(
    clientOrganizationId: string,
    messageId: string,
    correlationId: string,
    attempts: number,
    availableAt: Date,
  ): Promise<void> {
    if (!this.queueFactory) return;
    try {
      this.backgroundQueue ??= this.queueFactory.createQueue(PLATFORM_BACKGROUND_QUEUE);
      await this.backgroundQueue.add(
        'messaging.outbound.process',
        { clientOrganizationId, correlationId, messageId },
        {
          delay: Math.max(0, availableAt.getTime() - Date.now()),
          jobId: `messaging-outbound-${messageId}-${String(attempts)}`,
          removeOnComplete: 1_000,
          removeOnFail: 1_000,
        },
      );
    } catch (error) {
      await this.connection.db
        .update(schema.messageOutboundOutbox)
        .set({
          lastErrorMessage: `${
            error instanceof Error ? error.message : 'Queue unavailable.'
          } Provider retry remains recoverable from PostgreSQL.`.slice(0, 1000),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.messageOutboundOutbox.clientOrganizationId, clientOrganizationId),
            eq(schema.messageOutboundOutbox.messageId, messageId),
          ),
        );
    }
  }

  private async scopedConversation(context: AuthorizationContext, conversationId: string) {
    const cid = clientId(context);
    const [row] = await this.connection.db
      .select({
        contactName: schema.contacts.displayName,
        conversation: schema.conversations,
        lead: schema.leadOpportunities,
        phone: schema.contacts.primaryPhoneE164,
        queueDepartmentId: schema.teams.departmentId,
      })
      .from(schema.conversations)
      .innerJoin(
        schema.contacts,
        and(
          eq(schema.contacts.clientOrganizationId, cid),
          eq(schema.contacts.id, schema.conversations.contactId),
        ),
      )
      .innerJoin(
        schema.leadOpportunities,
        and(
          eq(schema.leadOpportunities.clientOrganizationId, cid),
          eq(schema.leadOpportunities.id, schema.conversations.leadId),
        ),
      )
      .leftJoin(
        schema.teams,
        and(
          eq(schema.teams.clientOrganizationId, cid),
          eq(schema.teams.id, schema.conversations.teamId),
        ),
      )
      .where(
        and(
          eq(schema.conversations.clientOrganizationId, cid),
          eq(schema.conversations.id, conversationId),
        ),
      )
      .limit(1);
    if (!row) throw notFound('Conversation was not found.');
    if (
      !this.policy.canAccessResource(context, {
        assigneeId: row.conversation.conversationOwnerId,
        branchId: row.conversation.branchId,
        clientOrganizationId: cid,
        departmentId: row.queueDepartmentId,
        ownerId: row.lead.relationshipOwnerId,
        teamId: row.conversation.teamId,
      })
    )
      throw forbidden('SCOPE_DENIED', 'Conversation is outside your effective scope.');
    return row;
  }

  private async templateRow(cid: string, connectionId: string, templateId: string) {
    const [template] = await this.connection.db
      .select()
      .from(schema.messageTemplates)
      .where(
        and(
          eq(schema.messageTemplates.clientOrganizationId, cid),
          eq(schema.messageTemplates.connectionId, connectionId),
          eq(schema.messageTemplates.id, templateId),
        ),
      )
      .limit(1);
    if (!template) throw notFound('Message template was not found for this connection.');
    return template;
  }

  private async connectionRow(cid: string, connectionId: string): Promise<ConnectionRow> {
    const [row] = await this.connection.db
      .select()
      .from(schema.messagingProviderConnections)
      .where(
        and(
          eq(schema.messagingProviderConnections.clientOrganizationId, cid),
          eq(schema.messagingProviderConnections.id, connectionId),
        ),
      )
      .limit(1);
    if (!row) throw notFound('Messaging connection was not found.');
    return row;
  }

  private async connectionByKey(connectionKey: string): Promise<ConnectionRow> {
    const [row] = await this.connection.db
      .select()
      .from(schema.messagingProviderConnections)
      .where(eq(schema.messagingProviderConnections.connectionKey, connectionKey))
      .limit(1);
    if (!row) throw new UnauthorizedException('Webhook connection was not found.');
    return row;
  }

  private providerConnection(row: ConnectionRow): MessagingProviderConnection {
    let encrypted: EncryptedMessagingCredentials | undefined;
    if (
      row.credentialCiphertext &&
      row.credentialIv &&
      row.credentialAuthTag &&
      row.credentialKeyId
    ) {
      encrypted = {
        authTag: row.credentialAuthTag,
        ciphertext: row.credentialCiphertext,
        iv: row.credentialIv,
        keyId: row.credentialKeyId,
      };
    }
    const credentials = encrypted ? this.credentials.decrypt(encrypted) : undefined;
    return {
      ...(credentials?.accessToken ? { accessToken: credentials.accessToken } : {}),
      ...(credentials?.appSecret ? { appSecret: credentials.appSecret } : {}),
      ...(row.businessPhoneE164 ? { businessPhoneE164: row.businessPhoneE164 } : {}),
      connectionId: row.id,
      connectionKey: row.connectionKey,
      ...(row.phoneNumberId ? { phoneNumberId: row.phoneNumberId } : {}),
      provider: row.provider,
      settings: row.settings,
      ...(credentials?.verifyToken ? { verifyToken: credentials.verifyToken } : {}),
      ...(row.wabaId ? { wabaId: row.wabaId } : {}),
    };
  }

  private async assertBranchAndQueue(cid: string, branchId: string, queueId: string | null) {
    const [branch] = await this.connection.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(
        and(
          eq(schema.branches.clientOrganizationId, cid),
          eq(schema.branches.id, branchId),
          eq(schema.branches.active, true),
        ),
      )
      .limit(1);
    if (!branch) throw notFound('Active messaging branch was not found.');
    if (queueId) {
      const [queue] = await this.connection.db
        .select({ id: schema.assignmentQueues.id })
        .from(schema.assignmentQueues)
        .where(
          and(
            eq(schema.assignmentQueues.clientOrganizationId, cid),
            eq(schema.assignmentQueues.id, queueId),
            eq(schema.assignmentQueues.branchId, branchId),
            eq(schema.assignmentQueues.active, true),
          ),
        )
        .limit(1);
      if (!queue) throw notFound('Active messaging assignment queue was not found in the branch.');
    }
  }

  private async activeMembership(cid: string, membershipId: string) {
    const [row] = await this.connection.db
      .select()
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.clientOrganizationId, cid),
          eq(schema.memberships.id, membershipId),
          eq(schema.memberships.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    if (!row) throw notFound('Active conversation owner membership was not found.');
    return row;
  }

  private async assertMembershipCanAccessBranch(
    cid: string,
    membership: typeof schema.memberships.$inferSelect,
    branchId: string,
  ): Promise<void> {
    if (membership.branchScopeMode === 'ALL') return;
    if (membership.branchScopeMode === 'NONE')
      throw forbidden(
        'ASSIGNMENT_SCOPE_DENIED',
        'The selected conversation owner cannot access this Branch.',
      );
    const [scope] = await this.connection.db
      .select({ membershipId: schema.membershipBranchScopes.membershipId })
      .from(schema.membershipBranchScopes)
      .where(
        and(
          eq(schema.membershipBranchScopes.clientOrganizationId, cid),
          eq(schema.membershipBranchScopes.membershipId, membership.id),
          eq(schema.membershipBranchScopes.branchId, branchId),
        ),
      )
      .limit(1);
    if (!scope)
      throw forbidden(
        'ASSIGNMENT_SCOPE_DENIED',
        'The selected conversation owner cannot access this Branch.',
      );
  }

  private async activeTeam(cid: string, branchId: string, teamId: string) {
    const [row] = await this.connection.db
      .select({ id: schema.teams.id })
      .from(schema.teams)
      .where(
        and(
          eq(schema.teams.clientOrganizationId, cid),
          eq(schema.teams.branchId, branchId),
          eq(schema.teams.id, teamId),
          eq(schema.teams.active, true),
        ),
      )
      .limit(1);
    if (!row) throw notFound('Active conversation queue team was not found.');
  }

  private presentConnection(row: ConnectionRow) {
    return {
      business_phone_e164: row.businessPhoneE164,
      channel: row.channel,
      display_name: row.displayName,
      id: row.id,
      last_health_at: row.lastHealthAt?.toISOString() ?? null,
      last_health_status: row.lastHealthStatus,
      last_webhook_at: row.lastWebhookAt?.toISOString() ?? null,
      messaging_limit: row.messagingLimit,
      phone_number_id: row.phoneNumberId,
      provider: row.provider,
      quality_rating: row.qualityRating,
      status: row.status,
      template_sync_status: row.templateSyncStatus,
      token_configured: row.credentialCiphertext !== null,
      waba_id: row.wabaId,
      webhook_callback_path: `/v1/messaging/webhooks/${row.provider}/${row.connectionKey}`,
      webhook_state: row.webhookState,
    };
  }

  private presentConversation(row: ConversationRow, contactName: string, phone: string) {
    return {
      channel: row.channel,
      contact_id: row.contactId,
      contact_name: contactName,
      conversation_owner_id: row.conversationOwnerId,
      id: row.id,
      last_message_at: row.lastMessageAt?.toISOString() ?? null,
      lead_id: row.leadId,
      phone_e164: phone,
      status: row.status,
      team_id: row.teamId,
      unread_count: row.unreadCount,
      version: row.version,
    };
  }

  private presentMessage(
    row: MessageRow,
    templateName: string | null,
    media: (typeof schema.messageMedia.$inferSelect)[],
  ) {
    return {
      body_text: row.bodyText,
      content_type: row.contentType,
      created_at: row.createdAt.toISOString(),
      direction: row.direction,
      id: row.id,
      media: media.map((item) => ({
        availability: item.availability,
        filename: item.originalFilename,
        id: item.id,
        mime_type: item.mimeType,
        size_bytes: item.sizeBytes,
      })),
      provider_occurred_at: row.providerOccurredAt?.toISOString() ?? null,
      status: row.status,
      template_name: templateName,
    };
  }

  private presentTemplate(row: typeof schema.messageTemplates.$inferSelect) {
    return {
      body_text: row.bodyText,
      category: row.category,
      id: row.id,
      language: row.language,
      name: row.name,
      status: row.status,
    };
  }

  private async event(
    tx: Tx,
    cid: string,
    aggregateId: string,
    eventType: string,
    correlationId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await tx.insert(schema.outboxEvents).values({
      aggregateId,
      aggregateType: 'MESSAGING',
      clientOrganizationId: cid,
      correlationId,
      eventType,
      payload,
      scope: 'CLIENT',
    });
  }

  private async audit(
    tx: Tx,
    context: AuthorizationContext,
    action: string,
    entityId: string,
    correlationId: string,
    newSummary: Record<string, unknown>,
    reason?: string,
  ): Promise<void> {
    await tx.insert(schema.auditEvents).values({
      action,
      actorId: context.userId,
      actorType: 'USER',
      clientOrganizationId: clientId(context),
      correlationId,
      effectiveRole: context.roleCode,
      entityId,
      entityType: 'MESSAGING',
      newSummary,
      outcome: 'SUCCESS',
      reason,
      scope: 'CLIENT',
    });
  }
}
