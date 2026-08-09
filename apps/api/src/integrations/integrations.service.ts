/* Tenant integration centre and human-review-only AI workflow authority. */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreativeRequest,
  IntegrationConnectionRequest,
  OnboardingItemRequest,
  ReviewCreativeRequest,
  ReviewTranscriptSuggestionRequest,
  TranscriptSuggestionRequest,
} from '@gdm/contracts';
import { schema, type DatabaseConnection } from '@gdm/database';
import { and, desc, eq } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../infrastructure/database/database.tokens.js';
import type { AuthorizationContext } from '../authorization/authorization.types.js';

function clientId(context: AuthorizationContext) {
  if (!context.clientOrganizationId)
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      details: [],
      message: 'An active client context is required.',
      retryable: false,
    });
  return context.clientOrganizationId;
}
const missing = (message: string) =>
  new NotFoundException({ code: 'NOT_FOUND', details: [], message, retryable: false });
const invalid = (message: string) =>
  new BadRequestException({ code: 'VALIDATION_ERROR', details: [], message, retryable: false });
const ONBOARDING_ITEMS = [
  'LEGAL_BUSINESS_DETAILS',
  'BRANCHES',
  'USERS',
  'LEAD_SOURCES',
  'TELEPHONY',
  'WHATSAPP',
  'EMAIL',
  'SMS',
  'GOOGLE_ACCOUNTS',
  'CONSENT_NOTICE',
  'TEMPLATES',
  'RETENTION',
  'WORKING_HOURS',
  'ASSIGNMENT_RULES',
  'PILOT_VERIFICATION',
] as const;

@Injectable()
export class IntegrationsService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly connection: DatabaseConnection) {}
  async centre(context: AuthorizationContext) {
    const cid = clientId(context);
    return {
      connections: await this.connection.db
        .select({
          id: schema.integrationConnections.id,
          provider: schema.integrationConnections.provider,
          display_name: schema.integrationConnections.displayName,
          status: schema.integrationConnections.status,
          webhook_state: schema.integrationConnections.webhookState,
          quota_state: schema.integrationConnections.quotaState,
          last_success_at: schema.integrationConnections.lastSuccessAt,
          last_failure_at: schema.integrationConnections.lastFailureAt,
          failure_summary: schema.integrationConnections.failureSummary,
          disconnected_at: schema.integrationConnections.disconnectedAt,
        })
        .from(schema.integrationConnections)
        .where(eq(schema.integrationConnections.clientOrganizationId, cid))
        .orderBy(desc(schema.integrationConnections.updatedAt)),
    };
  }
  async connect(
    context: AuthorizationContext,
    input: IntegrationConnectionRequest,
    correlationId: string,
  ) {
    const cid = clientId(context);
    const [connection] = await this.connection.db
      .insert(schema.integrationConnections)
      .values({
        clientOrganizationId: cid,
        displayName: input.display_name,
        provider: input.provider,
        settings: input.settings,
      })
      .onConflictDoUpdate({
        target: [
          schema.integrationConnections.clientOrganizationId,
          schema.integrationConnections.provider,
        ],
        set: {
          displayName: input.display_name,
          disconnectedAt: null,
          failureSummary: null,
          settings: input.settings,
          status: 'PENDING_APPROVAL',
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!connection) throw new Error('Integration connection did not return a row.');
    await this.audit(
      cid,
      context,
      correlationId,
      'INTEGRATION_CONNECTION_CONFIGURED',
      connection.id,
      { provider: input.provider },
    );
    return { connection: this.safeConnection(connection) };
  }
  async disconnect(context: AuthorizationContext, id: string, correlationId: string) {
    const cid = clientId(context);
    const [connection] = await this.connection.db
      .update(schema.integrationConnections)
      .set({ disconnectedAt: new Date(), status: 'DISCONNECTED', updatedAt: new Date() })
      .where(
        and(
          eq(schema.integrationConnections.clientOrganizationId, cid),
          eq(schema.integrationConnections.id, id),
        ),
      )
      .returning();
    if (!connection) throw missing('Integration connection was not found.');
    await this.audit(cid, context, correlationId, 'INTEGRATION_CONNECTION_DISCONNECTED', id, {
      provider: connection.provider,
    });
    return { connection: this.safeConnection(connection) };
  }
  async onboarding(context: AuthorizationContext) {
    const cid = clientId(context);
    const stored = await this.connection.db
      .select()
      .from(schema.onboardingChecklistItems)
      .where(eq(schema.onboardingChecklistItems.clientOrganizationId, cid));
    const map = new Map(stored.map((item) => [item.itemCode, item]));
    return {
      items: ONBOARDING_ITEMS.map((item_code) => ({
        item_code,
        ...(map.get(item_code) ?? { complete: false, evidence: null, completedAt: null }),
      })),
    };
  }
  async updateOnboarding(
    context: AuthorizationContext,
    input: OnboardingItemRequest,
    correlationId: string,
  ) {
    const cid = clientId(context);
    if (!ONBOARDING_ITEMS.includes(input.item_code as (typeof ONBOARDING_ITEMS)[number]))
      throw invalid('item_code is not part of the required onboarding checklist.');
    const [item] = await this.connection.db
      .insert(schema.onboardingChecklistItems)
      .values({
        clientOrganizationId: cid,
        itemCode: input.item_code,
        complete: input.complete,
        evidence: input.evidence,
        completedAt: input.complete ? new Date() : null,
        completedByMembershipId: input.complete ? context.membershipId : null,
      })
      .onConflictDoUpdate({
        target: [
          schema.onboardingChecklistItems.clientOrganizationId,
          schema.onboardingChecklistItems.itemCode,
        ],
        set: {
          complete: input.complete,
          evidence: input.evidence,
          completedAt: input.complete ? new Date() : null,
          completedByMembershipId: input.complete ? context.membershipId : null,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!item) throw new Error('Onboarding item did not return a row.');
    await this.audit(cid, context, correlationId, 'ONBOARDING_ITEM_UPDATED', item.id, {
      complete: input.complete,
      item_code: input.item_code,
    });
    return { item };
  }
  async creativeRequests(context: AuthorizationContext) {
    const cid = clientId(context);
    return {
      assets: await this.connection.db
        .select()
        .from(schema.generatedCreativeAssets)
        .where(eq(schema.generatedCreativeAssets.clientOrganizationId, cid))
        .orderBy(desc(schema.generatedCreativeAssets.createdAt)),
    };
  }
  async requestCreative(
    context: AuthorizationContext,
    input: CreativeRequest,
    correlationId: string,
  ) {
    const cid = clientId(context);
    const [asset] = await this.connection.db
      .insert(schema.generatedCreativeAssets)
      .values({
        clientOrganizationId: cid,
        requestedByMembershipId: context.membershipId,
        brandProfile: input.brand_profile,
        brandTemplate: input.brand_template,
        brief: input.brief,
        provider: 'AI_IMAGE',
        moderationSummary: 'Awaiting approved provider generation and moderation.',
        status: 'MODERATION_PENDING',
      })
      .returning();
    if (!asset) throw new Error('Creative request did not return a row.');
    await this.audit(cid, context, correlationId, 'AI_CREATIVE_REQUESTED', asset.id, {
      provider: asset.provider,
    });
    return { asset };
  }
  async reviewCreative(
    context: AuthorizationContext,
    id: string,
    input: ReviewCreativeRequest,
    correlationId: string,
  ) {
    const cid = clientId(context);
    const [asset] = await this.connection.db
      .update(schema.generatedCreativeAssets)
      .set({
        status: input.approved ? 'APPROVED' : 'REJECTED',
        reviewReason: input.reason,
        reviewedAt: new Date(),
        reviewedByMembershipId: context.membershipId,
      })
      .where(
        and(
          eq(schema.generatedCreativeAssets.clientOrganizationId, cid),
          eq(schema.generatedCreativeAssets.id, id),
          eq(schema.generatedCreativeAssets.status, 'REVIEW_PENDING'),
        ),
      )
      .returning();
    if (!asset) throw invalid('Creative asset is not ready for human review.');
    await this.audit(cid, context, correlationId, 'AI_CREATIVE_REVIEWED', id, {
      approved: input.approved,
    });
    return { asset };
  }
  async transcriptSuggestions(context: AuthorizationContext) {
    const cid = clientId(context);
    return {
      suggestions: await this.connection.db
        .select()
        .from(schema.callTranscriptSuggestions)
        .where(eq(schema.callTranscriptSuggestions.clientOrganizationId, cid))
        .orderBy(desc(schema.callTranscriptSuggestions.createdAt)),
    };
  }
  async createTranscriptSuggestion(
    context: AuthorizationContext,
    input: TranscriptSuggestionRequest,
    correlationId: string,
  ) {
    const cid = clientId(context);
    const [recording] = await this.connection.db
      .select({ id: schema.callRecordings.id })
      .from(schema.callRecordings)
      .where(
        and(
          eq(schema.callRecordings.clientOrganizationId, cid),
          eq(schema.callRecordings.id, input.recording_id),
        ),
      )
      .limit(1);
    if (!recording) throw missing('Call recording was not found.');
    const [suggestion] = await this.connection.db
      .insert(schema.callTranscriptSuggestions)
      .values({
        clientOrganizationId: cid,
        callId: input.call_id,
        recordingId: input.recording_id,
        transcript: input.transcript,
        summary: input.summary,
        suggestions: input.suggestions,
      })
      .onConflictDoNothing()
      .returning();
    if (!suggestion) throw invalid('A transcript already exists for this recording.');
    await this.audit(cid, context, correlationId, 'AI_TRANSCRIPT_SUGGESTED', suggestion.id, {
      suggestion_count: input.suggestions.length,
    });
    return { suggestion };
  }
  async reviewTranscriptSuggestion(
    context: AuthorizationContext,
    id: string,
    input: ReviewTranscriptSuggestionRequest,
    correlationId: string,
  ) {
    const cid = clientId(context);
    const [suggestion] = await this.connection.db
      .update(schema.callTranscriptSuggestions)
      .set({
        status: input.accepted ? 'ACCEPTED' : 'REJECTED',
        reviewReason: input.reason,
        reviewedAt: new Date(),
        reviewedByMembershipId: context.membershipId,
      })
      .where(
        and(
          eq(schema.callTranscriptSuggestions.clientOrganizationId, cid),
          eq(schema.callTranscriptSuggestions.id, id),
          eq(schema.callTranscriptSuggestions.status, 'REVIEW_PENDING'),
        ),
      )
      .returning();
    if (!suggestion) throw invalid('Transcript suggestion is not ready for review.');
    await this.audit(cid, context, correlationId, 'AI_TRANSCRIPT_REVIEWED', id, {
      accepted: input.accepted,
    });
    return { suggestion };
  }
  private safeConnection(connection: typeof schema.integrationConnections.$inferSelect) {
    const { credentialCiphertext: _ciphertext, credentialKeyId: _keyId, ...safe } = connection;
    return safe;
  }
  private audit(
    clientOrganizationId: string,
    context: AuthorizationContext,
    correlationId: string,
    action: string,
    entityId: string,
    summary: Record<string, unknown>,
  ) {
    return this.connection.db.insert(schema.auditEvents).values({
      action,
      actorId: context.userId,
      actorType: 'USER',
      clientOrganizationId,
      correlationId,
      entityId,
      entityType: 'INTEGRATION',
      newSummary: summary,
      outcome: 'SUCCESS',
      scope: 'CLIENT',
    });
  }
}
