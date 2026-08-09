import assert from 'node:assert/strict';
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { afterEach, describe, it } from 'node:test';
import { schema, type DatabaseConnection } from '@gdm/database';
import {
  createMigratedPGliteTestDatabase,
  type MigratedPGliteTestDatabase,
} from '@gdm/database/testing';
import { and, eq } from 'drizzle-orm';

import { AuthorizationPolicy } from '../src/authorization/authorization-policy.js';
import type { AuthorizationContext } from '../src/authorization/authorization.types.js';
import type { MessagingService } from '../src/messaging/messaging.service.js';
import { RemindersService } from '../src/reminders/reminders.service.js';

const tenantId = 'b0000000-0000-4000-8000-000000000001';
const branchId = 'b1000000-0000-4000-8000-000000000001';
const userId = 'b2000000-0000-4000-8000-000000000001';
const membershipId = 'b3000000-0000-4000-8000-000000000001';
const contactId = 'b4000000-0000-4000-8000-000000000001';
const vehicleId = 'b5000000-0000-4000-8000-000000000001';
const connectionId = 'b6000000-0000-4000-8000-000000000001';
const utilityTemplateId = 'b7000000-0000-4000-8000-000000000001';
const marketingTemplateId = 'b7000000-0000-4000-8000-000000000002';

function context(): AuthorizationContext {
  return {
    assignmentScope: 'ALL',
    branchIds: new Set([branchId]),
    branchScopeMode: 'SELECTED',
    clientOrganizationId: tenantId,
    departmentIds: new Set(),
    departmentScopeMode: 'ALL',
    managedTeamIds: new Set(),
    membershipId,
    permissionCodes: new Set(),
    roleCode: 'MANAGER',
    sessionId: 'b8000000-0000-4000-8000-000000000001',
    teamIds: new Set(),
    teamScopeMode: 'ALL',
    userId,
  };
}

describe('Phase 11 post-sale reminder integration', () => {
  let database: MigratedPGliteTestDatabase | undefined;

  afterEach(async () => {
    await database?.close();
    database = undefined;
  });

  async function setup() {
    database = await createMigratedPGliteTestDatabase();
    const db = database.db;
    const agencyId = 'ba000000-0000-4000-8000-000000000001';
    await db.insert(schema.agencies).values({
      code: 'REM',
      displayName: 'Reminder Agency',
      id: agencyId,
      legalName: 'Reminder Agency Private Limited',
    });
    await db.insert(schema.clientOrganizations).values({
      agencyId,
      code: 'REM_CLIENT',
      displayName: 'Reminder Client',
      id: tenantId,
      legalName: 'Reminder Client Motors',
      status: 'ACTIVE',
    });
    await db
      .insert(schema.branches)
      .values({ clientOrganizationId: tenantId, code: 'MAIN', id: branchId, name: 'Main Branch' });
    await db.insert(schema.users).values({
      displayName: 'Reminder Manager',
      id: userId,
      primaryEmailNormalized: 'manager@reminder.test',
      status: 'ACTIVE',
    });
    const [role] = await db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq(schema.roles.code, 'MANAGER'))
      .limit(1);
    assert.ok(role);
    await db.insert(schema.memberships).values({
      assignmentScope: 'ALL',
      branchScopeMode: 'SELECTED',
      clientOrganizationId: tenantId,
      contextType: 'CLIENT',
      departmentScopeMode: 'ALL',
      id: membershipId,
      roleId: role.id,
      status: 'ACTIVE',
      teamScopeMode: 'ALL',
      userId,
    });
    await db
      .insert(schema.membershipBranchScopes)
      .values({ branchId, clientOrganizationId: tenantId, membershipId });
    await db.insert(schema.contacts).values({
      clientOrganizationId: tenantId,
      displayName: 'Reminder Customer',
      id: contactId,
      primaryPhoneE164: '+919900000011',
      primaryPhoneLookupHash: 'b'.repeat(64),
    });
    await db.insert(schema.customerVehicles).values({
      brandName: 'Test Brand',
      branchId,
      clientOrganizationId: tenantId,
      contactId,
      createdByMembershipId: membershipId,
      deliveryDate: '2026-01-01',
      id: vehicleId,
      modelName: 'Test Model',
      modelYear: 2026,
      ownershipSource: 'EXTERNAL',
      variantName: 'Test Variant',
      vin: 'REMINDERVIN000001',
    });
    await db.insert(schema.messagingProviderConnections).values({
      branchId,
      channel: 'WHATSAPP',
      clientOrganizationId: tenantId,
      connectionKey: 'reminder-dev',
      displayName: 'Reminder development connection',
      id: connectionId,
      provider: 'DEVELOPMENT',
      status: 'ACTIVE',
    });
    await db.insert(schema.messageTemplates).values([
      {
        bodyText: 'Your vehicle service is due.',
        category: 'UTILITY',
        clientOrganizationId: tenantId,
        connectionId,
        id: utilityTemplateId,
        language: 'en',
        name: 'service_due',
        status: 'APPROVED',
      },
      {
        bodyText: 'Explore your next vehicle.',
        category: 'MARKETING',
        clientOrganizationId: tenantId,
        connectionId,
        id: marketingTemplateId,
        language: 'en',
        name: 'upgrade_offer',
        status: 'APPROVED',
      },
    ]);
    const messaging = {
      queueAutomatedReminder: () => Promise.resolve({ messageId: 'message', replayed: false }),
    } as unknown as MessagingService;
    return {
      db,
      service: new RemindersService(
        { db } as unknown as DatabaseConnection,
        new AuthorizationPolicy(),
        messaging,
      ),
    };
  }

  it('materializes each plan/notice once even when duplicate workers run', async () => {
    const { db, service } = await setup();
    await service.createRule(
      context(),
      {
        active: true,
        base_date_field: 'DELIVERY_DATE',
        brand_name: null,
        category: 'OPERATIONAL',
        channel: 'WHATSAPP',
        due_after_days: 180,
        due_kilometres: null,
        model_name: null,
        model_year: null,
        notice_days: [30, 15, 7, 1],
        reminder_type: 'SERVICE_DUE',
        template_id: utilityTemplateId,
        threshold_kind: 'DATE',
        variant_name: null,
      },
      'rule-service',
      'rule-correlation',
    );
    await service.materializeVehicle(tenantId, vehicleId, 'worker-one');
    await service.materializeVehicle(tenantId, vehicleId, 'worker-two');
    assert.equal((await db.select().from(schema.customerReminderPlans)).length, 1);
    assert.equal((await db.select().from(schema.reminderInstances)).length, 4);
  });

  it('suppresses marketing after consent withdrawal even when the preference is enabled', async () => {
    const { db, service } = await setup();
    await service.createRule(
      context(),
      {
        active: true,
        base_date_field: 'DELIVERY_DATE',
        brand_name: null,
        category: 'MARKETING',
        channel: 'WHATSAPP',
        due_after_days: 0,
        due_kilometres: null,
        model_name: null,
        model_year: null,
        notice_days: [0],
        reminder_type: 'UPGRADE_OPPORTUNITY',
        template_id: marketingTemplateId,
        threshold_kind: 'DATE',
        variant_name: null,
      },
      'rule-marketing',
      'rule-correlation',
    );
    await db.insert(schema.customerReminderPreferences).values({
      clientOrganizationId: tenantId,
      customerVehicleId: vehicleId,
      marketingEnabled: true,
      operationalEnabled: true,
      preferredChannel: 'WHATSAPP',
      updatedByMembershipId: membershipId,
    });
    await service.recordConsent(
      context(),
      vehicleId,
      {
        channel: 'WHATSAPP',
        evidence: 'Customer withdrew marketing consent.',
        notice_version: 'v1',
        source: 'CUSTOMER_REQUEST',
        status: 'WITHDRAWN',
      },
      'withdraw-consent',
      'withdraw-consent-correlation',
    );
    await service.materializeVehicle(tenantId, vehicleId, 'worker-marketing');
    const result = await service.queueDue(tenantId, 'queue-correlation');
    assert.equal(result.suppressed, 1);
    const [instance] = await db.select().from(schema.reminderInstances);
    assert.equal(instance?.status, 'SUPPRESSED');
    assert.match(instance?.suppressionReason ?? '', /consent/u);
  });

  it('keeps operational and marketing template categories distinct', async () => {
    const { service } = await setup();
    await assert.rejects(
      () =>
        service.createRule(
          context(),
          {
            active: true,
            base_date_field: 'DELIVERY_DATE',
            brand_name: null,
            category: 'MARKETING',
            channel: 'WHATSAPP',
            due_after_days: 30,
            due_kilometres: null,
            model_name: null,
            model_year: null,
            notice_days: [7],
            reminder_type: 'UPGRADE_OPPORTUNITY',
            template_id: utilityTemplateId,
            threshold_kind: 'DATE',
            variant_name: null,
          },
          'wrong-template',
          'wrong-template-correlation',
        ),
      /MARKETING/u,
    );
  });

  it('supersedes scheduled instances when authoritative vehicle details change', async () => {
    const { db, service } = await setup();
    await service.createRule(
      context(),
      {
        active: true,
        base_date_field: 'DELIVERY_DATE',
        brand_name: null,
        category: 'OPERATIONAL',
        channel: 'WHATSAPP',
        due_after_days: 180,
        due_kilometres: null,
        model_name: null,
        model_year: null,
        notice_days: [30],
        reminder_type: 'SERVICE_DUE',
        template_id: utilityTemplateId,
        threshold_kind: 'DATE',
        variant_name: null,
      },
      'rule-update',
      'rule-update-correlation',
    );
    await service.materializeVehicle(tenantId, vehicleId, 'initial');
    await service.updateVehicleDetails(
      context(),
      vehicleId,
      {
        current_odometer_km: 1200,
        expected_vehicle_version: 1,
        model_year: 2026,
        puc_expires_on: '2027-01-01',
        reason: 'Odometer and policy details confirmed.',
        service_due_kilometres: 10000,
        service_due_on: '2026-07-01',
        service_plan_version: 'OEM-2026-v2',
      },
      'vehicle-details',
      'vehicle-details-correlation',
    );
    const instances = await db
      .select()
      .from(schema.reminderInstances)
      .orderBy(schema.reminderInstances.createdAt);
    assert.equal(instances.filter((row) => row.status === 'CANCELLED').length, 1);
    assert.equal(instances.filter((row) => row.status === 'SCHEDULED').length, 1);
    const [plan] = await db
      .select()
      .from(schema.customerReminderPlans)
      .where(
        and(
          eq(schema.customerReminderPlans.clientOrganizationId, tenantId),
          eq(schema.customerReminderPlans.customerVehicleId, vehicleId),
        ),
      );
    assert.equal(plan?.scheduleVersion, 2);
  });
});
