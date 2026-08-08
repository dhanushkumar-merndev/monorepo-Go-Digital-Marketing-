import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { afterEach, describe, it } from 'node:test';
import { schema, type DatabaseConnection } from '@gdm/database';
import {
  createMigratedPGliteTestDatabase,
  type MigratedPGliteTestDatabase,
} from '@gdm/database/testing';
import { and, count, eq } from 'drizzle-orm';

import { AuthorizationPolicy } from '../src/authorization/authorization-policy.js';
import type { AuthorizationContext } from '../src/authorization/authorization.types.js';
import type { ObjectStorage } from '../src/infrastructure/storage/object-storage.port.js';
import { DevelopmentMessagingProvider } from '../src/messaging/development-messaging.provider.js';
import type { MessagingProviderRegistry } from '../src/messaging/messaging-provider.port.js';
import { MessagingService } from '../src/messaging/messaging.service.js';

const agencyId = '10000000-0000-4000-8000-000000000551';
const tenantA = '20000000-0000-4000-8000-000000000551';
const tenantB = '20000000-0000-4000-8000-000000000552';
const branchA = '21000000-0000-4000-8000-000000000551';
const branchB = '21000000-0000-4000-8000-000000000552';
const managerUser = '50000000-0000-4000-8000-000000000551';
const agentUser = '50000000-0000-4000-8000-000000000552';
const managerMember = '60000000-0000-4000-8000-000000000551';
const agentMember = '60000000-0000-4000-8000-000000000552';
const tenantBMember = '60000000-0000-4000-8000-000000000553';
const contactId = '70000000-0000-4000-8000-000000000551';
const leadId = '80000000-0000-4000-8000-000000000551';
const ctwaContactId = '70000000-0000-4000-8000-000000000552';
const ctwaLeadId = '80000000-0000-4000-8000-000000000552';
const approvedTemplateId = '24000000-0000-4000-8000-000000000551';
const rejectedTemplateId = '24000000-0000-4000-8000-000000000552';
const secret = 'development-messaging-integration-secret-at-least-32-characters';

function context(overrides: Partial<AuthorizationContext> = {}): AuthorizationContext {
  return {
    assignmentScope: 'ALL',
    branchIds: new Set([branchA]),
    branchScopeMode: 'ALL',
    clientOrganizationId: tenantA,
    departmentIds: new Set(),
    departmentScopeMode: 'ALL',
    managedTeamIds: new Set(),
    membershipId: managerMember,
    permissionCodes: new Set(),
    roleCode: 'MANAGER',
    sessionId: '90000000-0000-4000-8000-000000000551',
    teamIds: new Set(),
    teamScopeMode: 'ALL',
    userId: managerUser,
    ...overrides,
  };
}

const storage: ObjectStorage = {
  createDownloadUrl: async () => ({
    expiresAt: '2026-08-08T00:05:00.000Z',
    method: 'GET',
    url: 'https://private.example.test/download',
  }),
  createUploadUrl: async () => ({
    expiresAt: '2026-08-08T00:05:00.000Z',
    method: 'PUT',
    url: 'https://private.example.test/upload',
  }),
  stat: async () => undefined,
};

describe('Phase 5 messaging service integration', () => {
  let database: MigratedPGliteTestDatabase | undefined;

  afterEach(async () => {
    await database?.close();
    database = undefined;
  });

  it('isolates tenants, deduplicates webhooks, enforces templates, keeps owners separate, and orders the timeline', async () => {
    database = await createMigratedPGliteTestDatabase();
    const db = database.db;
    await db.insert(schema.agencies).values({
      code: 'MESSAGING_TEST',
      displayName: 'Messaging Test',
      id: agencyId,
      legalName: 'Messaging Test Private Limited',
    });
    await db.insert(schema.clientOrganizations).values([
      {
        agencyId,
        code: 'A',
        displayName: 'Tenant A',
        id: tenantA,
        legalName: 'Tenant A Motors',
        status: 'ACTIVE',
      },
      {
        agencyId,
        code: 'B',
        displayName: 'Tenant B',
        id: tenantB,
        legalName: 'Tenant B Motors',
        status: 'ACTIVE',
      },
    ]);
    await db.insert(schema.branches).values([
      { clientOrganizationId: tenantA, code: 'A1', id: branchA, name: 'A Main' },
      { clientOrganizationId: tenantB, code: 'B1', id: branchB, name: 'B Main' },
    ]);
    await db.insert(schema.users).values([
      {
        displayName: 'Manager',
        id: managerUser,
        primaryEmailNormalized: 'manager@messaging.test',
        status: 'ACTIVE',
      },
      {
        displayName: 'Agent',
        id: agentUser,
        primaryEmailNormalized: 'agent@messaging.test',
        status: 'ACTIVE',
      },
    ]);
    const [managerRole, agentRole] = await Promise.all([
      db
        .select({ id: schema.roles.id })
        .from(schema.roles)
        .where(eq(schema.roles.code, 'MANAGER'))
        .limit(1),
      db
        .select({ id: schema.roles.id })
        .from(schema.roles)
        .where(eq(schema.roles.code, 'SALESPERSON'))
        .limit(1),
    ]);
    assert.ok(managerRole[0]?.id);
    assert.ok(agentRole[0]?.id);
    await db.insert(schema.memberships).values([
      {
        assignmentScope: 'ALL',
        branchScopeMode: 'ALL',
        clientOrganizationId: tenantA,
        contextType: 'CLIENT',
        departmentScopeMode: 'ALL',
        id: managerMember,
        roleId: managerRole[0].id,
        status: 'ACTIVE',
        teamScopeMode: 'ALL',
        userId: managerUser,
      },
      {
        assignmentScope: 'ASSIGNED',
        branchScopeMode: 'ALL',
        clientOrganizationId: tenantA,
        contextType: 'CLIENT',
        departmentScopeMode: 'ALL',
        id: agentMember,
        roleId: agentRole[0].id,
        status: 'ACTIVE',
        teamScopeMode: 'ALL',
        userId: agentUser,
      },
      {
        assignmentScope: 'ALL',
        branchScopeMode: 'ALL',
        clientOrganizationId: tenantB,
        contextType: 'CLIENT',
        departmentScopeMode: 'ALL',
        id: tenantBMember,
        roleId: managerRole[0].id,
        status: 'ACTIVE',
        teamScopeMode: 'ALL',
        userId: agentUser,
      },
    ]);
    await db.insert(schema.contacts).values({
      clientOrganizationId: tenantA,
      displayName: 'Messaging Customer',
      id: contactId,
      primaryPhoneE164: '+919876543210',
      primaryPhoneLookupHash: 'messaging-test-hash',
    });
    await db.insert(schema.leadOpportunities).values({
      branchId: branchA,
      clientOrganizationId: tenantA,
      contactId,
      currentProcessOwnerId: managerUser,
      currentProcessOwnerMembershipId: managerMember,
      entryMethod: 'MANUAL',
      id: leadId,
      relationshipOwnerId: managerUser,
      relationshipOwnerMembershipId: managerMember,
      slaDueAt: new Date('2026-08-08T00:15:00.000Z'),
      slaWarningAt: new Date('2026-08-08T00:10:00.000Z'),
      source: 'WEBSITE',
      status: 'ACCEPTED',
      vehicleInterest: 'Model X',
    });

    const runtime = {
      credentialEncryptionKey: Buffer.alloc(32, 7),
      credentialKeyId: 'messaging-test',
      developmentAdapterEnabled: true,
      developmentWebhookSecret: secret,
      mediaMaxBytes: 26_214_400,
      mediaRetentionDays: 365,
      mediaUrlTtlSeconds: 300,
      outboundMaxAttempts: 2,
      serviceWindowHours: 24,
      webhookRawRetentionHours: 168,
    };
    const provider = new DevelopmentMessagingProvider(runtime);
    const registry: MessagingProviderRegistry = {
      provider: (code) => (code === provider.provider ? provider : undefined),
    };
    const leads = {
      createProvider: async (input: {
        body: { name: string; phone: string; vehicle_interest: string };
        clientOrganizationId: string;
      }) => {
        assert.equal(input.clientOrganizationId, tenantA);
        await db.insert(schema.contacts).values({
          clientOrganizationId: tenantA,
          displayName: input.body.name,
          id: ctwaContactId,
          primaryPhoneE164: input.body.phone,
          primaryPhoneLookupHash: 'ctwa-messaging-test-hash',
        });
        await db.insert(schema.leadOpportunities).values({
          branchId: branchA,
          clientOrganizationId: tenantA,
          contactId: ctwaContactId,
          entryMethod: 'PROVIDER',
          id: ctwaLeadId,
          slaDueAt: new Date('2026-08-08T00:15:00.000Z'),
          slaWarningAt: new Date('2026-08-08T00:10:00.000Z'),
          source: 'WHATSAPP_AD',
          status: 'NEW',
          vehicleInterest: input.body.vehicle_interest,
        });
        return { lead: { id: ctwaLeadId } };
      },
    };
    const service = new MessagingService(
      { db } as unknown as DatabaseConnection,
      runtime,
      registry,
      storage,
      new AuthorizationPolicy(),
      leads as never,
    );
    const configured = await service.configureDevelopment(
      context(),
      {
        branch_id: branchA,
        business_phone_e164: '+911140001111',
        default_assignment_queue_id: null,
        display_name: 'Development WhatsApp',
        enabled: true,
      },
      'configure-messaging',
    );
    const cloudConnectionInput = {
      access_token: 'initial-access-token',
      app_secret: 'initial-app-secret',
      branch_id: branchA,
      business_phone_e164: '+911140002222',
      default_assignment_queue_id: null,
      display_name: 'Cloud WhatsApp',
      graph_api_version: 'v23.0',
      phone_number_id: 'phone-number-tenant-a',
      verify_token: 'initial-verify-token',
      waba_id: 'waba-tenant-a',
    };
    const cloudConnection = await service.configureWhatsAppCloud(
      context(),
      cloudConnectionInput,
      'configure-cloud-messaging',
    );
    await db
      .update(schema.messagingProviderConnections)
      .set({ lastWebhookAt: new Date(), webhookState: 'VERIFIED' })
      .where(eq(schema.messagingProviderConnections.id, cloudConnection.id));
    const rotatedCloudConnection = await service.configureWhatsAppCloud(
      context(),
      {
        ...cloudConnectionInput,
        access_token: 'rotated-access-token',
        app_secret: 'rotated-app-secret',
        verify_token: 'rotated-verify-token',
      },
      'rotate-cloud-messaging',
    );
    assert.equal(rotatedCloudConnection.id, cloudConnection.id);
    assert.equal(rotatedCloudConnection.webhook_state, 'NOT_VERIFIED');
    const [rotatedConnectionRow] = await db
      .select({ lastWebhookAt: schema.messagingProviderConnections.lastWebhookAt })
      .from(schema.messagingProviderConnections)
      .where(eq(schema.messagingProviderConnections.id, cloudConnection.id));
    assert.equal(rotatedConnectionRow?.lastWebhookAt, null);
    const connectionKey = `development-messaging-${tenantA}`;

    const receive = async (
      payload: Record<string, unknown>,
      correlationId: string,
    ): Promise<Awaited<ReturnType<MessagingService['receiveWebhook']>>> => {
      const rawBody = JSON.stringify(payload);
      const signature = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
      return service.receiveWebhook({
        connectionKey,
        correlationId,
        headers: { 'x-gdm-signature': `sha256=${signature}` },
        payload,
        providerCode: 'DEVELOPMENT',
        rawBody,
      });
    };
    const firstPayload = {
      event_id: 'event-known-2',
      from: '+919876543210',
      occurred_at: '2026-08-08T10:00:00.000Z',
      provider_message_id: 'provider-known-2',
      provider_sequence: '0002',
      text: 'Second chronologically',
      type: 'message',
    };
    assert.deepEqual(await receive(firstPayload, 'known-2'), {
      accepted: true,
      duplicates: 0,
      failed: 0,
      processed: 1,
    });
    assert.deepEqual(await receive(firstPayload, 'known-2-replay'), {
      accepted: true,
      duplicates: 1,
      failed: 0,
      processed: 0,
    });
    await receive(
      {
        event_id: 'event-known-1',
        from: '+919876543210',
        occurred_at: '2026-08-08T09:00:00.000Z',
        provider_message_id: 'provider-known-1',
        provider_sequence: '0001',
        text: 'First chronologically',
        type: 'message',
      },
      'known-1',
    );

    const [conversation] = await db
      .select()
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.clientOrganizationId, tenantA),
          eq(schema.conversations.leadId, leadId),
        ),
      )
      .limit(1);
    assert.ok(conversation);
    const detail = await service.detail(context(), conversation.id);
    assert.deepEqual(
      detail.messages.map((message) => message.body_text),
      ['First chronologically', 'Second chronologically'],
    );
    await assert.rejects(
      service.detail(
        context({
          branchIds: new Set([branchB]),
          clientOrganizationId: tenantB,
          membershipId: tenantBMember,
        }),
        conversation.id,
      ),
      /Conversation was not found/u,
    );

    await service.assign(
      context(),
      conversation.id,
      {
        expected_version: 1,
        owner_membership_id: agentMember,
        reason: 'Route the customer reply to the assigned salesperson.',
        team_id: null,
      },
      'assign-agent',
    );
    const [ownerState] = await db
      .select({
        conversationOwnerId: schema.leadOpportunities.conversationOwnerId,
        currentProcessOwnerId: schema.leadOpportunities.currentProcessOwnerId,
        relationshipOwnerId: schema.leadOpportunities.relationshipOwnerId,
      })
      .from(schema.leadOpportunities)
      .where(eq(schema.leadOpportunities.id, leadId));
    assert.deepEqual(ownerState, {
      conversationOwnerId: agentUser,
      currentProcessOwnerId: managerUser,
      relationshipOwnerId: managerUser,
    });
    await service.detail(
      context({
        assignmentScope: 'ASSIGNED',
        membershipId: agentMember,
        roleCode: 'SALESPERSON',
        userId: agentUser,
      }),
      conversation.id,
    );
    await service.detail(
      context({
        assignmentScope: 'ASSIGNED',
        membershipId: agentMember,
        roleCode: 'TELECALLER',
        userId: agentUser,
      }),
      conversation.id,
    );
    await assert.rejects(
      service.detail(
        context({ assignmentScope: 'ASSIGNED', roleCode: 'SALESPERSON' }),
        conversation.id,
      ),
      /outside your effective scope/u,
    );
    await assert.rejects(
      service.detail(
        context({ branchIds: new Set([branchB]), branchScopeMode: 'SELECTED' }),
        conversation.id,
      ),
      /outside your effective scope/u,
    );

    await db
      .update(schema.conversations)
      .set({ lastInboundAt: new Date('2026-08-01T00:00:00.000Z') })
      .where(eq(schema.conversations.id, conversation.id));
    await assert.rejects(
      service.sendMessage(
        context(),
        conversation.id,
        { content_type: 'TEXT', text: 'Outside window' },
        'outside-window',
        'outside-window',
      ),
      /approved template is required/u,
    );
    await db.insert(schema.messageTemplates).values([
      {
        bodyText: 'Approved update for {{1}}',
        category: 'UTILITY',
        clientOrganizationId: tenantA,
        connectionId: configured.id as string,
        id: approvedTemplateId,
        language: 'en',
        name: 'approved_update',
        status: 'APPROVED',
      },
      {
        bodyText: 'Rejected update',
        category: 'UTILITY',
        clientOrganizationId: tenantA,
        connectionId: configured.id as string,
        id: rejectedTemplateId,
        language: 'en',
        name: 'rejected_update',
        status: 'REJECTED',
      },
    ]);
    await db.insert(schema.messagingOptInRecords).values({
      capturedAt: new Date('2026-08-08T10:00:00.000Z'),
      category: 'UTILITY',
      channel: 'WHATSAPP',
      clientOrganizationId: tenantA,
      contactId,
      evidence: 'Customer initiated official message.',
      noticeVersion: 'test-v1',
      source: 'TEST',
      status: 'GRANTED',
    });
    await assert.rejects(
      service.sendMessage(
        context(),
        conversation.id,
        { content_type: 'TEMPLATE', template_id: rejectedTemplateId, variables: {} },
        'rejected-template',
        'rejected-template',
      ),
      /approved provider template/u,
    );
    await assert.rejects(
      service.sendMessage(
        context(),
        conversation.id,
        { content_type: 'TEMPLATE', template_id: approvedTemplateId, variables: {} },
        'missing-template-variable',
        'missing-template-variable',
      ),
      /variables do not match/u,
    );
    const sent = await service.sendMessage(
      context(),
      conversation.id,
      { content_type: 'TEMPLATE', template_id: approvedTemplateId, variables: { '1': 'Customer' } },
      'safe-retry',
      'safe-retry-1',
    );
    assert.equal(sent.replayed, false);
    const replayed = await service.sendMessage(
      context(),
      conversation.id,
      { content_type: 'TEMPLATE', template_id: approvedTemplateId, variables: { '1': 'Customer' } },
      'safe-retry',
      'safe-retry-2',
    );
    assert.equal(replayed.replayed, true);
    await assert.rejects(
      service.sendMessage(
        context(),
        conversation.id,
        {
          content_type: 'TEMPLATE',
          template_id: approvedTemplateId,
          variables: { '1': 'Different' },
        },
        'safe-retry',
        'safe-retry-mismatch',
      ),
      /already used for a different messaging request/u,
    );
    const [outboundCount] = await db
      .select({ value: count() })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.clientOrganizationId, tenantA),
          eq(schema.messages.clientIdempotencyKey, 'safe-retry'),
        ),
      );
    assert.equal(outboundCount?.value, 1);

    await db.insert(schema.messagingSuppressions).values({
      active: true,
      channel: 'WHATSAPP',
      clientOrganizationId: tenantA,
      contactId,
      reason: 'Customer opted out.',
      scope: 'ALL',
    });
    await assert.rejects(
      service.sendMessage(
        context(),
        conversation.id,
        {
          content_type: 'TEMPLATE',
          template_id: approvedTemplateId,
          variables: { '1': 'Customer' },
        },
        'suppressed-send',
        'suppressed-send',
      ),
      /suppressed for all messages/u,
    );
    await db
      .update(schema.messagingSuppressions)
      .set({ active: false })
      .where(eq(schema.messagingSuppressions.contactId, contactId));

    const [sentMessage] = await db
      .select({ id: schema.messages.id, providerMessageId: schema.messages.providerMessageId })
      .from(schema.messages)
      .where(eq(schema.messages.clientIdempotencyKey, 'safe-retry'));
    assert.ok(sentMessage?.providerMessageId);
    const readAt = new Date(Date.now() + 120_000);
    const failedBeforeRead = new Date(readAt.getTime() - 60_000);
    await receive(
      {
        event_id: 'status-read',
        occurred_at: readAt.toISOString(),
        provider_message_id: sentMessage.providerMessageId,
        status: 'READ',
        type: 'status',
      },
      'status-read',
    );
    await receive(
      {
        error_code: 'stale-provider-failure',
        event_id: 'status-failed-stale',
        occurred_at: failedBeforeRead.toISOString(),
        provider_message_id: sentMessage.providerMessageId,
        status: 'FAILED',
        type: 'status',
      },
      'status-failed-stale',
    );
    const [projectedMessage] = await db
      .select({ status: schema.messages.status })
      .from(schema.messages)
      .where(eq(schema.messages.id, sentMessage.id));
    assert.equal(projectedMessage?.status, 'READ');

    const originalSend = provider.sendMessage.bind(provider);
    let providerSendCount = 0;
    provider.sendMessage = async () => {
      providerSendCount += 1;
      throw new Error('Simulated provider outage.');
    };
    const outage = await service.sendMessage(
      context(),
      conversation.id,
      {
        content_type: 'TEMPLATE',
        template_id: approvedTemplateId,
        variables: { '1': 'Customer' },
      },
      'provider-outage',
      'provider-outage',
    );
    assert.equal(outage.message.status, 'FAILED');
    provider.sendMessage = async (...arguments_) => {
      providerSendCount += 1;
      return originalSend(...arguments_);
    };
    await db
      .update(schema.messageOutboundOutbox)
      .set({ availableAt: new Date(), status: 'PENDING' })
      .where(
        and(
          eq(schema.messageOutboundOutbox.clientOrganizationId, tenantA),
          eq(schema.messageOutboundOutbox.messageId, outage.message.id),
        ),
      );
    await Promise.all([
      service.processOutboundJob({
        clientOrganizationId: tenantA,
        correlationId: 'retry-outage-1',
        messageId: outage.message.id,
      }),
      service.processOutboundJob({
        clientOrganizationId: tenantA,
        correlationId: 'retry-outage-2',
        messageId: outage.message.id,
      }),
    ]);
    assert.equal(providerSendCount, 2);
    const [retriedMessage] = await db
      .select({ status: schema.messages.status })
      .from(schema.messages)
      .where(eq(schema.messages.id, outage.message.id));
    assert.equal(retriedMessage?.status, 'SENT');

    const beforeRead = await service.detail(context(), conversation.id);
    assert.ok(beforeRead.conversation.unread_count > 0);
    assert.deepEqual(await service.markRead(context(), conversation.id, 'mark-read'), {
      unread_count: 0,
    });
    const afterRead = await service.detail(context(), conversation.id);
    assert.equal(afterRead.conversation.unread_count, 0);

    const [availableMedia] = await db
      .insert(schema.messageMedia)
      .values({
        availability: 'AVAILABLE',
        clientOrganizationId: tenantA,
        messageId: sentMessage.id,
        mimeType: 'application/pdf',
        objectKey: `clients/${tenantA}/messaging/known-private-key/quotation.pdf`,
        originalFilename: 'quotation.pdf',
        retentionExpiresAt: new Date(Date.now() + 60_000),
        sizeBytes: 1024,
      })
      .returning();
    assert.ok(availableMedia);
    await assert.rejects(
      service.mediaAccess(
        context({
          branchIds: new Set([branchB]),
          clientOrganizationId: tenantB,
          membershipId: tenantBMember,
        }),
        availableMedia.id,
        'cross-tenant-media',
      ),
      /Media is unavailable/u,
    );
    assert.equal(
      (await service.mediaAccess(context(), availableMedia.id, 'authorized-media')).method,
      'GET',
    );

    const ctwa = await receive(
      {
        customer_name: 'Click to WhatsApp Customer',
        event_id: 'event-ctwa-1',
        from: '+919999999999',
        occurred_at: '2026-08-08T11:00:00.000Z',
        provider_message_id: 'provider-ctwa-1',
        referral: { ad_id: 'ad-1', campaign_id: 'campaign-1', headline: 'Model Y' },
        text: 'I am interested',
        type: 'message',
      },
      'ctwa-1',
    );
    assert.equal(ctwa.processed, 1);
    const [ctwaLead] = await db
      .select({
        entryMethod: schema.leadOpportunities.entryMethod,
        source: schema.leadOpportunities.source,
      })
      .from(schema.leadOpportunities)
      .where(eq(schema.leadOpportunities.id, ctwaLeadId));
    assert.deepEqual(ctwaLead, { entryMethod: 'PROVIDER', source: 'WHATSAPP_AD' });

    const queuedWebhookIds: string[] = [];
    const asyncService = new MessagingService(
      { db } as unknown as DatabaseConnection,
      runtime,
      registry,
      storage,
      new AuthorizationPolicy(),
      leads as never,
      {
        createQueue: () =>
          ({
            add: async (_name: string, data: { webhookEventId: string }) => {
              queuedWebhookIds.push(data.webhookEventId);
            },
          }) as never,
      },
    );
    const asyncPayload = {
      event_id: 'event-known-async',
      from: '+919876543210',
      occurred_at: '2026-08-08T12:00:00.000Z',
      provider_message_id: 'provider-known-async',
      text: 'Process after acknowledgement',
      type: 'message',
    };
    const asyncRawBody = JSON.stringify(asyncPayload);
    const asyncSignature = createHmac('sha256', secret).update(asyncRawBody, 'utf8').digest('hex');
    assert.deepEqual(
      await asyncService.receiveWebhook({
        connectionKey,
        correlationId: 'known-async',
        headers: { 'x-gdm-signature': `sha256=${asyncSignature}` },
        payload: asyncPayload,
        providerCode: 'DEVELOPMENT',
        rawBody: asyncRawBody,
      }),
      { accepted: true, duplicates: 0, failed: 0, processed: 0, queued: 1 },
    );
    assert.equal(queuedWebhookIds.length, 1);
    const queuedWebhookId = queuedWebhookIds[0];
    assert.ok(queuedWebhookId);
    const [beforeAsyncProcessing] = await db
      .select({ value: count() })
      .from(schema.messages)
      .where(eq(schema.messages.providerMessageId, 'provider-known-async'));
    assert.equal(beforeAsyncProcessing?.value, 0);
    assert.deepEqual(await asyncService.processWebhookJob(queuedWebhookId), {
      status: 'PROCESSED',
    });
    const [afterAsyncProcessing] = await db
      .select({ value: count() })
      .from(schema.messages)
      .where(eq(schema.messages.providerMessageId, 'provider-known-async'));
    assert.equal(afterAsyncProcessing?.value, 1);
  });
});
