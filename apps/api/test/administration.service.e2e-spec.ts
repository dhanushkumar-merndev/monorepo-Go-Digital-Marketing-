import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { AdministrationService } from '../src/administration/administration.service.js';
import type { AuthorizationContext } from '../src/authorization/authorization.types.js';
import {
  createMigratedPGliteTestDatabase,
  type MigratedPGliteTestDatabase,
} from '@gdm/database/testing';
import { schema, type DatabaseConnection } from '@gdm/database';
import type { PermissionCode } from '@gdm/contracts';
import { and, eq } from 'drizzle-orm';

const agencyId = '10000000-0000-4000-8000-000000000001';
const clientId = '20000000-0000-4000-8000-000000000001';
const adminUserId = '50000000-0000-4000-8000-000000000001';
const adminMembershipId = '60000000-0000-4000-8000-000000000001';

function agencyContext(): AuthorizationContext {
  return {
    agencyId,
    assignmentScope: 'NONE' as const,
    branchIds: new Set<string>(),
    branchScopeMode: 'NONE' as const,
    membershipId: '70000000-0000-4000-8000-000000000001',
    permissionCodes: new Set<PermissionCode>(),
    roleCode: 'AGENCY_ADMIN',
    sessionId: '80000000-0000-4000-8000-000000000001',
    teamIds: new Set<string>(),
    teamScopeMode: 'NONE' as const,
    userId: adminUserId,
  };
}
function clientContext(): AuthorizationContext {
  const { agencyId: _agencyId, ...context } = agencyContext();
  return {
    ...context,
    clientOrganizationId: clientId,
    roleCode: 'CLIENT_ADMIN',
    membershipId: adminMembershipId,
  };
}

describe('Phase 2 administration business rules', () => {
  let database: MigratedPGliteTestDatabase | undefined;
  afterEach(async () => {
    await database?.close();
    database = undefined;
  });

  it('applies agency safe defaults to a newly created client and audits lifecycle commands', async () => {
    database = await createMigratedPGliteTestDatabase();
    await database.db
      .insert(schema.agencies)
      .values({ id: agencyId, code: 'GDM', legalName: 'Go Digital', displayName: 'Go Digital' });
    const service = new AdministrationService({ db: database.db } as unknown as DatabaseConnection);
    await service.setDefaults(agencyContext(), {
      default_timezone: 'Asia/Kolkata',
      default_feature_flags: {
        LEADS: true,
        TELEPHONY: false,
        INBOX: false,
        TEST_RIDES: false,
        INVENTORY: false,
        BOOKING_BILLING: false,
        DELIVERY_RC: false,
        POST_SALE: false,
        INTEGRATIONS: false,
      },
    });
    const result = await service.createClient(agencyContext(), {
      code: 'NORTHSTAR',
      display_name: 'Northstar Motors',
      legal_name: 'Northstar Motors Private Limited',
      timezone: 'Asia/Kolkata',
    });
    const [leadFlag] = await database.db
      .select()
      .from(schema.clientModuleFlags)
      .where(
        and(
          eq(schema.clientModuleFlags.clientOrganizationId, result.client_organization.id),
          eq(schema.clientModuleFlags.module, 'LEADS'),
        ),
      );
    assert.equal(leadFlag?.enabled, true);
    const [audit] = await database.db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.action, 'CLIENT_CREATED'));
    assert.equal(audit?.newSummary?.status, 'PENDING');
  });

  it('does not allow removal of an active client’s final Client Admin', async () => {
    database = await createMigratedPgliteSetup();
    const service = new AdministrationService({ db: database.db } as unknown as DatabaseConnection);
    await assert.rejects(
      () =>
        service.setMembershipStatus(clientContext(), adminMembershipId, {
          status: 'ENDED',
          reason: 'Attempt to remove final administrator.',
        }),
      /At least one active Client Admin/,
    );
    const [membership] = await database.db
      .select()
      .from(schema.memberships)
      .where(eq(schema.memberships.id, adminMembershipId));
    assert.equal(membership?.status, 'ACTIVE');
  });
});

async function createMigratedPgliteSetup(): Promise<MigratedPGliteTestDatabase> {
  const database = await createMigratedPGliteTestDatabase();
  await database.db
    .insert(schema.agencies)
    .values({ id: agencyId, code: 'GDM', legalName: 'Go Digital', displayName: 'Go Digital' });
  await database.db.insert(schema.clientOrganizations).values({
    id: clientId,
    agencyId,
    code: 'NORTHSTAR',
    legalName: 'Northstar Motors Private Limited',
    displayName: 'Northstar Motors',
    status: 'ACTIVE',
    timezone: 'Asia/Kolkata',
  });
  await database.db.insert(schema.users).values({
    id: adminUserId,
    displayName: 'Client Admin',
    primaryEmailNormalized: 'client.admin@northstar.test',
    status: 'ACTIVE',
  });
  const [role] = await database.db
    .select()
    .from(schema.roles)
    .where(eq(schema.roles.code, 'CLIENT_ADMIN'));
  if (!role) throw new Error('The canonical Client Admin role was not installed.');
  await database.db.insert(schema.memberships).values({
    id: adminMembershipId,
    userId: adminUserId,
    contextType: 'CLIENT',
    clientOrganizationId: clientId,
    roleId: role.id,
    status: 'ACTIVE',
    branchScopeMode: 'ALL',
    teamScopeMode: 'ALL',
    assignmentScope: 'ALL',
  });
  return database;
}
