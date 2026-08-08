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
import {
  canonicalJson,
  DevelopmentTelephonyProvider,
} from '../src/telephony/development-telephony.provider.js';
import type { ObjectStorage } from '../src/infrastructure/storage/object-storage.port.js';
import { DefaultTelephonyProviderRegistry } from '../src/telephony/telephony-provider.registry.js';
import { TelephonyService } from '../src/telephony/telephony.service.js';

const agencyId = '10000000-0000-4000-8000-000000000441';
const tenantA = '20000000-0000-4000-8000-000000000441';
const tenantB = '20000000-0000-4000-8000-000000000442';
const branchA = '21000000-0000-4000-8000-000000000441';
const branchB = '21000000-0000-4000-8000-000000000442';
const departmentA = '21500000-0000-4000-8000-000000000441';
const teamA = '22000000-0000-4000-8000-000000000441';
const managerUser = '50000000-0000-4000-8000-000000000441';
const otherUser = '50000000-0000-4000-8000-000000000442';
const managerMember = '60000000-0000-4000-8000-000000000441';
const otherMember = '60000000-0000-4000-8000-000000000442';
const contactId = '70000000-0000-4000-8000-000000000441';
const leadId = '80000000-0000-4000-8000-000000000441';
const developmentSecret = 'development-telephony-integration-secret-at-least-32-characters';
const uploadedObjects = new Map<
  string,
  { checksumSha256?: string; contentLength: number; contentType: string }
>();
let failUploadPresign = false;
let lastUploadKey: string | undefined;

function context(overrides: Partial<AuthorizationContext> = {}): AuthorizationContext {
  return {
    assignmentScope: 'ALL',
    branchIds: new Set([branchA]),
    branchScopeMode: 'ALL',
    clientOrganizationId: tenantA,
    departmentIds: new Set([departmentA]),
    departmentScopeMode: 'ALL',
    managedTeamIds: new Set([teamA]),
    membershipId: managerMember,
    permissionCodes: new Set(),
    roleCode: 'MANAGER',
    sessionId: '90000000-0000-4000-8000-000000000441',
    teamIds: new Set([teamA]),
    teamScopeMode: 'ALL',
    userId: managerUser,
    ...overrides,
  };
}

const storage: ObjectStorage = {
  createDownloadUrl: async () => ({
    expiresAt: '2026-08-07T00:05:00.000Z',
    method: 'GET',
    url: 'https://private.example.test/recording',
  }),
  createUploadUrl: async (request) => {
    if (failUploadPresign) throw new Error('storage unavailable');
    lastUploadKey = request.key;
    return {
      expiresAt: '2026-08-07T00:05:00.000Z',
      method: 'PUT',
      url: 'https://private.example.test/upload',
    };
  },
  stat: async (key) => uploadedObjects.get(key),
};

describe('Phase 4 telephony service integration', () => {
  let database: MigratedPGliteTestDatabase | undefined;

  afterEach(async () => {
    await database?.close();
    database = undefined;
    uploadedObjects.clear();
    failUploadPresign = false;
    lastUploadKey = undefined;
  });

  it('deduplicates authoritative webhooks, requires outcomes, reconciles missed events, and denies cross-tenant recording access', async () => {
    database = await createMigratedPGliteTestDatabase();
    const db = database.db;
    await db.insert(schema.agencies).values({
      code: 'TELEPHONY_TEST',
      displayName: 'Telephony Test',
      id: agencyId,
      legalName: 'Telephony Test Private Limited',
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
    await db.insert(schema.departments).values({
      branchId: branchA,
      clientOrganizationId: tenantA,
      code: 'SALES',
      id: departmentA,
      name: 'Sales',
    });
    await db.insert(schema.teams).values({
      branchId: branchA,
      clientOrganizationId: tenantA,
      code: 'SALES',
      departmentId: departmentA,
      id: teamA,
      name: 'Sales',
    });
    await db.insert(schema.users).values([
      {
        displayName: 'Manager',
        id: managerUser,
        primaryEmailNormalized: 'manager@telephony.test',
        status: 'ACTIVE',
      },
      {
        displayName: 'Other Tenant',
        id: otherUser,
        primaryEmailNormalized: 'other@telephony.test',
        status: 'ACTIVE',
      },
    ]);
    const managerRole = await db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq(schema.roles.code, 'MANAGER'))
      .limit(1);
    const managerRoleId = managerRole[0]?.id;
    assert.ok(managerRoleId);
    await db.insert(schema.memberships).values([
      {
        assignmentScope: 'ALL',
        branchScopeMode: 'ALL',
        clientOrganizationId: tenantA,
        contextType: 'CLIENT',
        departmentScopeMode: 'ALL',
        id: managerMember,
        roleId: managerRoleId,
        status: 'ACTIVE',
        teamScopeMode: 'ALL',
        userId: managerUser,
      },
      {
        assignmentScope: 'ALL',
        branchScopeMode: 'ALL',
        clientOrganizationId: tenantB,
        contextType: 'CLIENT',
        departmentScopeMode: 'ALL',
        id: otherMember,
        roleId: managerRoleId,
        status: 'ACTIVE',
        teamScopeMode: 'ALL',
        userId: otherUser,
      },
    ]);
    await db.insert(schema.contacts).values({
      clientOrganizationId: tenantA,
      displayName: 'Calling Customer',
      id: contactId,
      primaryPhoneE164: '+919876543210',
      primaryPhoneLookupHash: 'telephony-test-hash',
    });
    const recordingConsentId = '70000000-0000-4000-8000-000000000442';
    await db.insert(schema.consentRecords).values({
      capturedAt: new Date('2026-08-08T00:00:00.000Z'),
      clientOrganizationId: tenantA,
      contactId,
      evidence: 'Authorized manual recording fixture.',
      id: recordingConsentId,
      noticeVersion: 'recording-v1',
      purpose: 'CALL_RECORDING',
      source: 'TEST',
      status: 'GRANTED',
    });
    await db.insert(schema.leadOpportunities).values({
      branchId: branchA,
      clientOrganizationId: tenantA,
      contactId,
      currentProcessOwnerId: managerUser,
      currentProcessOwnerMembershipId: managerMember,
      entryMethod: 'MANUAL',
      id: leadId,
      slaDueAt: new Date('2026-08-08T00:15:00.000Z'),
      slaWarningAt: new Date('2026-08-08T00:10:00.000Z'),
      source: 'WEBSITE',
      status: 'ACCEPTED',
      vehicleInterest: 'Model X',
    });

    const runtime = {
      developmentAdapterEnabled: true,
      developmentWebhookSecret: developmentSecret,
      manualRecordingMaxBytes: 26_214_400,
      recordingUrlTtlSeconds: 300,
      webhookRawRetentionHours: 168,
    };
    const development = new DevelopmentTelephonyProvider(runtime);
    const service = new TelephonyService(
      { db } as unknown as DatabaseConnection,
      new AuthorizationPolicy(),
      storage,
      new DefaultTelephonyProviderRegistry(development),
      runtime,
    );

    const configured = await service.configureConnection(
      context(),
      { active: true, display_name: 'Test development provider' },
      'configure-a',
    );
    const connectionKey = configured.connection?.connection_key;
    assert.ok(connectionKey);

    const started = await service.startCall(
      context(),
      leadId,
      { mode: 'PROVIDER' },
      'start-a',
      'start-a',
    );
    assert.equal(started.replayed, false);
    assert.ok(started.provider_call_id);

    const eventBaseTime = Date.now();
    const eventPayload = {
      call_id: started.provider_call_id,
      duration_seconds: 42,
      event_id: 'provider-event-completed-1',
      occurred_at: new Date(eventBaseTime + 60_000).toISOString(),
      recording: { id: 'provider-recording-1' },
      status: 'COMPLETED',
    };
    const rawBody = canonicalJson(eventPayload);
    const signature = createHmac('sha256', developmentSecret)
      .update(`${connectionKey}.${rawBody}`, 'utf8')
      .digest('hex');
    const webhook = {
      connectionKey,
      correlationId: 'webhook-a',
      headers: { 'x-telephony-signature': signature },
      payload: eventPayload,
      providerCode: 'DEVELOPMENT',
      rawBody,
    };
    const received = await service.receiveWebhook(webhook);
    assert.deepEqual(received, { accepted: true, duplicate: false, processed: true });
    assert.deepEqual(await service.receiveWebhook(webhook), { accepted: true, duplicate: true });
    const events = await db
      .select({ count: count() })
      .from(schema.callEvents)
      .where(
        and(
          eq(schema.callEvents.clientOrganizationId, tenantA),
          eq(schema.callEvents.providerEventId, 'provider-event-completed-1'),
        ),
      );
    assert.equal(events[0]?.count, 1);
    const completed = await service.detail(context(), started.id);
    assert.equal(completed.call.outcome_requirement, 'REQUIRED');
    assert.equal(completed.recordings[0]?.source, 'PROVIDER');

    const inboundPayload = {
      call_id: 'provider-inbound-1',
      direction: 'INBOUND',
      event_id: 'provider-event-inbound-1',
      lead_id: leadId,
      occurred_at: new Date(eventBaseTime + 120_000).toISOString(),
      status: 'ANSWERED',
    };
    const inboundRawBody = canonicalJson(inboundPayload);
    const inboundSignature = createHmac('sha256', developmentSecret)
      .update(`${connectionKey}.${inboundRawBody}`, 'utf8')
      .digest('hex');
    assert.deepEqual(
      await service.receiveWebhook({
        connectionKey,
        correlationId: 'webhook-inbound',
        headers: { 'x-telephony-signature': inboundSignature },
        payload: inboundPayload,
        providerCode: 'DEVELOPMENT',
        rawBody: inboundRawBody,
      }),
      { accepted: true, duplicate: false, processed: true },
    );
    const [inbound] = await db
      .select()
      .from(schema.calls)
      .where(
        and(
          eq(schema.calls.clientOrganizationId, tenantA),
          eq(schema.calls.providerCallId, 'provider-inbound-1'),
        ),
      );
    assert.equal(inbound?.direction, 'INBOUND');
    assert.equal(inbound?.contactId, contactId);

    const outcome = await service.recordOutcome(
      context(),
      started.id,
      {
        callback_due_at: new Date(eventBaseTime + 3_600_000).toISOString(),
        note: 'Customer requested a callback.',
        outcome: 'CALLBACK',
      },
      'outcome-a',
      'outcome-a',
    );
    assert.equal(outcome.outcome, 'CALLBACK');
    assert.ok(outcome.callback_follow_up_id);
    assert.equal(
      (await service.detail(context(), started.id)).call.outcome_requirement,
      'RECORDED',
    );

    const second = await service.startCall(
      context(),
      leadId,
      { mode: 'PROVIDER' },
      'start-b',
      'start-b',
    );
    const connection = await db
      .select()
      .from(schema.telephonyProviderConnections)
      .where(eq(schema.telephonyProviderConnections.connectionKey, connectionKey))
      .limit(1);
    const connectionId = connection[0]?.id;
    assert.ok(connectionId);
    assert.ok(second.provider_call_id);
    development.queueReconciliationEvent(connectionId, {
      eventType: 'CALL_STATUS_UPDATED',
      externalEventId: 'provider-event-reconciled-1',
      occurredAt: new Date(eventBaseTime + 180_000),
      providerCallId: second.provider_call_id,
      status: 'RINGING',
    });
    const reconciliation = await service.reconcile(context(), 'reconcile-a');
    assert.equal(reconciliation.recovered_events, 1);
    assert.equal((await service.detail(context(), second.id)).call.status, 'RINGING');

    await assert.rejects(
      () =>
        service.recordingAccess(
          context({
            clientOrganizationId: tenantB,
            membershipId: otherMember,
            userId: otherUser,
          }),
          started.id,
          '90000000-0000-4000-8000-000000000441',
          'recording-cross-tenant',
        ),
      /Call not found/u,
    );

    const manual = await service.beginManualRecordingUpload(
      context(),
      {
        call_date_at: '2026-08-08T04:00:00.000Z',
        call_direction: 'OUTBOUND',
        consent_record_id: recordingConsentId,
        content_length: 1024,
        content_type: 'audio/x-m4a',
        duration_seconds: 15,
        lead_id: leadId,
        notes: 'Uploaded with customer consent.',
        original_filename: 'customer-call.m4a',
        outcome: 'INTERESTED',
      },
      'manual-upload-a',
      'manual-upload-a',
    );
    assert.equal(manual.replayed, false);
    assert.ok(lastUploadKey);
    const manualReplay = await service.beginManualRecordingUpload(
      context(),
      {
        call_date_at: '2026-08-08T04:00:00.000Z',
        call_direction: 'OUTBOUND',
        consent_record_id: recordingConsentId,
        content_length: 1024,
        content_type: 'audio/x-m4a',
        duration_seconds: 15,
        lead_id: leadId,
        notes: 'Uploaded with customer consent.',
        original_filename: 'customer-call.m4a',
        outcome: 'INTERESTED',
      },
      'manual-upload-a',
      'manual-upload-a-retry',
    );
    assert.equal(manualReplay.recording_id, manual.recording_id);
    uploadedObjects.set(lastUploadKey, { contentLength: 1024, contentType: 'audio/x-m4a' });
    const completedRecording = await service.completeManualRecordingUpload(
      context(),
      manual.recording_id,
      { expected_content_length: 1024, expected_content_type: 'audio/x-m4a' },
      'manual-upload-complete',
    );
    assert.equal(completedRecording.status, 'AVAILABLE');
    const manualDetail = await service.detail(context(), manual.call_id);
    assert.equal(manualDetail.call.origin, 'MANUAL_UPLOAD');
    assert.equal(manualDetail.call.provider_call_id, null);
    assert.equal(manualDetail.recordings[0]?.source, 'MANUAL_UPLOAD');
    const uploadAudits = await db
      .select({ count: count() })
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.entityId, manual.recording_id));
    assert.equal(uploadAudits[0]?.count, 2);

    const marketingConsentId = '70000000-0000-4000-8000-000000000443';
    await db.insert(schema.consentRecords).values({
      capturedAt: new Date('2026-08-08T00:00:00.000Z'),
      clientOrganizationId: tenantA,
      contactId,
      evidence: 'Marketing-only fixture.',
      id: marketingConsentId,
      noticeVersion: 'marketing-v1',
      purpose: 'MARKETING',
      source: 'TEST',
      status: 'GRANTED',
    });
    await assert.rejects(
      () =>
        service.beginManualRecordingUpload(
          context(),
          {
            call_date_at: '2026-08-08T04:00:00.000Z',
            call_direction: 'OUTBOUND',
            consent_record_id: marketingConsentId,
            content_length: 1024,
            content_type: 'audio/x-m4a',
            lead_id: leadId,
            original_filename: 'wrong-consent.m4a',
          },
          'manual-upload-wrong-consent',
          'manual-upload-wrong-consent',
        ),
      /current recording consent/u,
    );

    await assert.rejects(
      () =>
        service.beginManualRecordingUpload(
          context({ clientOrganizationId: tenantB, membershipId: otherMember, userId: otherUser }),
          {
            call_date_at: '2026-08-08T04:00:00.000Z',
            call_direction: 'OUTBOUND',
            consent_record_id: recordingConsentId,
            content_length: 1024,
            content_type: 'audio/x-m4a',
            lead_id: leadId,
            original_filename: 'cross-tenant.m4a',
          },
          'manual-upload-cross-tenant',
          'manual-upload-cross-tenant',
        ),
      /Lead not found/u,
    );

    failUploadPresign = true;
    await assert.rejects(
      () =>
        service.beginManualRecordingUpload(
          context(),
          {
            call_date_at: '2026-08-08T04:00:00.000Z',
            call_direction: 'OUTBOUND',
            consent_record_id: recordingConsentId,
            content_length: 1024,
            content_type: 'audio/x-m4a',
            lead_id: leadId,
            original_filename: 'storage-failure.m4a',
          },
          'manual-upload-storage-failure',
          'manual-upload-storage-failure',
        ),
      /storage unavailable/u,
    );
    await assert.rejects(
      () =>
        service.beginManualRecordingUpload(
          context(),
          {
            call_date_at: '2026-08-08T04:00:00.000Z',
            call_direction: 'OUTBOUND',
            consent_record_id: recordingConsentId,
            content_length: 1024,
            content_type: 'text/plain' as 'audio/x-m4a',
            lead_id: leadId,
            original_filename: 'not-audio.txt',
          },
          'manual-upload-invalid-type',
          'manual-upload-invalid-type',
        ),
      /Unsupported recording format/u,
    );
    await assert.rejects(
      () =>
        service.beginManualRecordingUpload(
          context(),
          {
            call_date_at: '2026-08-08T04:00:00.000Z',
            call_direction: 'OUTBOUND',
            consent_record_id: recordingConsentId,
            content_length: 26_214_401,
            content_type: 'audio/x-m4a',
            lead_id: leadId,
            original_filename: 'too-large.m4a',
          },
          'manual-upload-too-large',
          'manual-upload-too-large',
        ),
      /exceeds the configured upload limit/u,
    );
  });
});
