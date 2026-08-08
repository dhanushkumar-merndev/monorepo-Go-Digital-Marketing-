import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

// Derived from the journal rather than hardcoded so adding a reviewed migration cannot
// silently leave this assertion asserting a stale migration count.
const journalEntryCount = (
  JSON.parse(
    readFileSync(fileURLToPath(new URL('../migrations/meta/_journal.json', import.meta.url)), {
      encoding: 'utf8',
    }),
  ) as { entries: readonly unknown[] }
).entries.length;
const agencyId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446700';
const tenantId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446761';
const otherTenantId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446762';
const branchId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446711';
const otherBranchId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446712';
const departmentId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446731';
const otherDepartmentId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446732';
const teamId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446721';
const otherTeamId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446722';
const agencyRoleId = '30000000-0000-4000-8000-000000000001';
const clientRoleId = '30000000-0000-4000-8000-000000000002';
const agencyUserId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446741';
const clientUserId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446742';
const agencyIdentityId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446751';
const clientIdentityId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446752';
const agencyMembershipId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446771';
const clientMembershipId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446772';
const agencySessionId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446781';
const clientSessionId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446782';
const rotationId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446791';
const googleIdentityId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446753';
const googleSessionId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446783';
const secondGoogleSessionId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446784';

describe('reviewed PostgreSQL migrations through Phase 5 messaging', () => {
  let client: PGlite;

  beforeAll(async () => {
    client = new PGlite();
    await migrate(drizzle(client), { migrationsFolder });
    await client.exec(`
      insert into agencies (id, code, legal_name, display_name)
      values ('${agencyId}', 'TEST_AGENCY', 'Test Agency Private Limited', 'Test Agency');

      insert into client_organizations (
        id, agency_id, code, legal_name, display_name, status, timezone
      ) values
        (
          '${tenantId}', '${agencyId}', 'TENANT_A', 'Tenant A Motors Private Limited',
          'Tenant A Motors', 'ACTIVE', 'Asia/Kolkata'
        ),
        (
          '${otherTenantId}', '${agencyId}', 'TENANT_B', 'Tenant B Motors Private Limited',
          'Tenant B Motors', 'ACTIVE', 'Asia/Kolkata'
        );

      insert into branches (id, client_organization_id, code, name) values
        ('${branchId}', '${tenantId}', 'A_MAIN', 'Tenant A Main'),
        ('${otherBranchId}', '${otherTenantId}', 'B_MAIN', 'Tenant B Main');

      insert into departments (id, client_organization_id, branch_id, code, name) values
        ('${departmentId}', '${tenantId}', '${branchId}', 'A_SALES', 'Tenant A Sales'),
        ('${otherDepartmentId}', '${otherTenantId}', '${otherBranchId}', 'B_SALES', 'Tenant B Sales');

      insert into teams (id, client_organization_id, branch_id, department_id, code, name) values
        ('${teamId}', '${tenantId}', '${branchId}', '${departmentId}', 'A_SALES', 'Tenant A Sales'),
        ('${otherTeamId}', '${otherTenantId}', '${otherBranchId}', '${otherDepartmentId}', 'B_SALES', 'Tenant B Sales');

      insert into users (id, display_name, primary_email_normalized, status) values
        ('${agencyUserId}', 'Agency Admin', 'agency@test.example', 'ACTIVE'),
        ('${clientUserId}', 'Client Admin', 'client@test.example', 'ACTIVE');

      insert into authentication_identities (
        id, user_id, provider, provider_key, subject_normalized, status,
        password_digest, password_salt, password_scrypt_n, password_scrypt_r,
        password_scrypt_p, password_key_length, failed_attempt_count, verified_at
      ) values
        (
          '${agencyIdentityId}', '${agencyUserId}', 'PASSWORD', 'LOCAL',
          'agency@test.example', 'ACTIVE', repeat('a', 128), repeat('b', 32),
          16384, 8, 1, 64, 0, now()
        ),
        (
          '${clientIdentityId}', '${clientUserId}', 'PASSWORD', 'LOCAL',
          'client@test.example', 'ACTIVE', repeat('c', 128), repeat('d', 32),
          16384, 8, 1, 64, 0, now()
        );

      insert into memberships (
        id, user_id, context_type, agency_id, client_organization_id, role_id,
        status, branch_scope_mode, team_scope_mode, assignment_scope
      ) values
        (
          '${agencyMembershipId}', '${agencyUserId}', 'AGENCY', '${agencyId}', null,
          '${agencyRoleId}', 'ACTIVE', 'NONE', 'NONE', 'NONE'
        ),
        (
          '${clientMembershipId}', '${clientUserId}', 'CLIENT', null, '${tenantId}',
          '${clientRoleId}', 'ACTIVE', 'SELECTED', 'SELECTED', 'ALL'
        );

      insert into refresh_sessions (
        id, user_id, authentication_identity_id, current_membership_id,
        client_type, device_platform, refresh_token_version, expires_at
      ) values
        (
          '${agencySessionId}', '${agencyUserId}', '${agencyIdentityId}',
          '${agencyMembershipId}', 'WEB', 'WEB', 1, now() + interval '30 days'
        ),
        (
          '${clientSessionId}', '${clientUserId}', '${clientIdentityId}',
          '${clientMembershipId}', 'WEB', 'WEB', 1, now() + interval '30 days'
        );

      insert into refresh_token_rotations (
        id, session_id, sequence, token_hash, expires_at
      ) values (
        '${rotationId}', '${clientSessionId}', 1, repeat('a', 64), now() + interval '30 days'
      );
    `);
  });

  afterAll(async () => {
    await client.close();
  });

  it('applies every reviewed migration and records the canonical foundation table set', async () => {
    const tables = await client.query<{ table_name: string }>(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in (
          'agencies', 'audit_events', 'authentication_audit_events',
          'authentication_identities', 'branches', 'client_organizations',
          'departments', 'external_auth_challenges',
          'membership_branch_scopes', 'membership_department_scopes',
          'membership_team_scopes', 'memberships',
          'outbox_events', 'password_reset_tokens', 'permissions', 'refresh_sessions',
          'refresh_token_rotations', 'role_permission_mappings', 'roles',
          'reporting_lines', 'support_elevations', 'team_manager_assignments',
          'team_memberships', 'teams', 'users', 'webhook_events',
          'calls', 'call_participants', 'call_events', 'call_recordings',
          'call_outcomes', 'call_outcome_exceptions', 'telephony_provider_connections',
          'telephony_reconciliations', 'messaging_provider_connections',
          'message_templates', 'conversations', 'conversation_participants',
          'messages', 'message_media', 'message_status_history',
          'conversation_assignments', 'message_outbound_outbox',
          'messaging_opt_in_records', 'messaging_suppressions'
        )
      order by table_name
    `);
    const metadata = await client.query<{ count: number }>(`
      select count(*)::int as count from drizzle.__drizzle_migrations
    `);

    expect(tables.rows.map((row) => row.table_name)).toEqual([
      'agencies',
      'audit_events',
      'authentication_audit_events',
      'authentication_identities',
      'branches',
      'call_events',
      'call_outcome_exceptions',
      'call_outcomes',
      'call_participants',
      'call_recordings',
      'calls',
      'client_organizations',
      'conversation_assignments',
      'conversation_participants',
      'conversations',
      'departments',
      'external_auth_challenges',
      'membership_branch_scopes',
      'membership_department_scopes',
      'membership_team_scopes',
      'memberships',
      'message_media',
      'message_outbound_outbox',
      'message_status_history',
      'message_templates',
      'messages',
      'messaging_opt_in_records',
      'messaging_provider_connections',
      'messaging_suppressions',
      'outbox_events',
      'password_reset_tokens',
      'permissions',
      'refresh_sessions',
      'refresh_token_rotations',
      'reporting_lines',
      'role_permission_mappings',
      'roles',
      'support_elevations',
      'team_manager_assignments',
      'team_memberships',
      'teams',
      'telephony_provider_connections',
      'telephony_reconciliations',
      'users',
      'webhook_events',
    ]);
    expect(metadata.rows[0]?.count).toBe(journalEntryCount);
  });

  it('installs canonical roles, permissions and least-privilege mappings', async () => {
    const roleCount = await client.query<{ count: number }>(
      `select count(*)::int as count from roles`,
    );
    const permissionCount = await client.query<{ count: number }>(
      `select count(*)::int as count from permissions`,
    );
    const agencyPermissions = await client.query<{ code: string }>(`
      select p.code::text as code
      from role_permission_mappings rpm
      join roles r on r.id = rpm.role_id
      join permissions p on p.id = rpm.permission_id
      where r.code = 'AGENCY_ADMIN'
      order by p.code
    `);
    const forbiddenMobileAdminMappings = await client.query<{ count: number }>(`
      select count(*)::int as count
      from role_permission_mappings rpm
      join roles r on r.id = rpm.role_id
      join permissions p on p.id = rpm.permission_id
      where r.application = 'MOBILE'
        and (
          p.code::text like 'platform.%'
          or p.code in (
            'organization.users.manage', 'organization.roles.manage',
            'organization.sessions.manage'
          )
        )
    `);
    const clientAdminPlatformMappings = await client.query<{ count: number }>(`
      select count(*)::int as count
      from role_permission_mappings rpm
      join roles r on r.id = rpm.role_id
      join permissions p on p.id = rpm.permission_id
      where r.code = 'CLIENT_ADMIN' and p.code::text like 'platform.%'
    `);
    const roleFamilyRows = await client.query<{
      application: string;
      code: string;
      permission_code: string;
    }>(`
      select r.code::text as code, r.application::text as application, p.code::text as permission_code
      from roles r
      join role_permission_mappings rpm on rpm.role_id = r.id
      join permissions p on p.id = rpm.permission_id
      order by r.code, p.code
    `);

    expect(roleCount.rows[0]?.count).toBe(12);
    expect(permissionCount.rows[0]?.count).toBe(53);
    expect(agencyPermissions.rows.map((row) => row.code)).toEqual(
      expect.arrayContaining([
        'organization.clients.read',
        'organization.branches.read',
        'organization.roles.read',
        'organization.teams.read',
        'organization.users.read',
        'platform.clients.manage',
        'platform.defaults.manage',
        'platform.support_elevation.manage',
        'leads.read',
        'leads.assign',
        'messaging.connections.manage',
        'messaging.conversations.read',
        'messaging.messages.send',
        'telephony.connections.manage',
        'telephony.recordings.read',
        'telephony.recordings.upload',
      ]),
    );
    expect(forbiddenMobileAdminMappings.rows[0]?.count).toBe(0);
    expect(clientAdminPlatformMappings.rows[0]?.count).toBe(0);

    const roleFamilies = new Map<string, { application: string; permissions: Set<string> }>();
    for (const row of roleFamilyRows.rows) {
      const family = roleFamilies.get(row.code) ?? {
        application: row.application,
        permissions: new Set<string>(),
      };
      family.permissions.add(row.permission_code);
      roleFamilies.set(row.code, family);
    }

    expect([...roleFamilies.keys()].sort()).toEqual([
      'AGENCY_ADMIN',
      'BILLING_DOCUMENTATION_EXECUTIVE',
      'CLIENT_ADMIN',
      'DELIVERY_EXECUTIVE',
      'INVENTORY_EXECUTIVE',
      'MANAGER',
      'RC_REGISTRATION_EXECUTIVE',
      'SALESPERSON',
      'SALES_MANAGER',
      'TEAM_MANAGER',
      'TELECALLER',
      'TEST_RIDE_EXECUTIVE',
    ]);
    for (const family of roleFamilies.values()) {
      expect(family.permissions.has('account.profile.read')).toBe(true);
      expect(family.permissions.has('account.sessions.revoke')).toBe(true);
    }
    expect(
      [...roleFamilies.entries()]
        .filter(([, family]) => family.application === 'MOBILE')
        .map(([code]) => code)
        .sort(),
    ).toEqual(['DELIVERY_EXECUTIVE', 'SALESPERSON', 'TEST_RIDE_EXECUTIVE']);
    expect(
      roleFamilies.get('SALES_MANAGER')?.permissions.has('organization.hierarchy.manage'),
    ).toBe(true);
    expect(
      roleFamilies.get('SALES_MANAGER')?.permissions.has('organization.departments.manage'),
    ).toBe(false);
    expect(roleFamilies.get('SALESPERSON')?.permissions.has('telephony.calls.start')).toBe(true);
    expect(roleFamilies.get('SALESPERSON')?.permissions.has('telephony.recordings.read')).toBe(
      false,
    );
    expect(roleFamilies.get('SALESPERSON')?.permissions.has('telephony.recordings.upload')).toBe(
      true,
    );
  });

  it('keeps call evidence tenant-scoped and enforces completed-call outcome requirements', async () => {
    const contactId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446801';
    const leadId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446802';
    const connectionId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446803';
    const callId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446804';
    await client.exec(`
      insert into contacts (
        id, client_organization_id, display_name, primary_phone_e164, primary_phone_lookup_hash
      ) values (
        '${contactId}', '${tenantId}', 'Telephony Customer', '+919876543210', repeat('a', 64)
      );
      insert into lead_opportunities (
        id, client_organization_id, contact_id, branch_id, source, entry_method, vehicle_interest,
        status, sla_due_at, sla_warning_at
      ) values (
        '${leadId}', '${tenantId}', '${contactId}', '${branchId}', 'WEBSITE', 'MANUAL', 'Model X',
        'ACCEPTED', now() + interval '15 minutes', now() + interval '10 minutes'
      );
      insert into telephony_provider_connections (
        id, client_organization_id, provider, connection_key, display_name, status
      ) values (
        '${connectionId}', '${tenantId}', 'DEVELOPMENT', 'migration-test-telephony', 'Migration test', 'ACTIVE'
      );
      insert into calls (
        id, client_organization_id, lead_id, contact_id, connection_id, provider, provider_call_id,
        origin, direction, status, outcome_requirement
      ) values (
        '${callId}', '${tenantId}', '${leadId}', '${contactId}', '${connectionId}', 'DEVELOPMENT',
        'provider-call-1', 'PROVIDER', 'OUTBOUND', 'REQUESTED', 'NOT_REQUIRED'
      );
    `);
    await expect(
      client.exec(`
        insert into calls (
          client_organization_id, lead_id, contact_id, provider, origin, direction, status,
          outcome_requirement
        ) values (
          '${tenantId}', '${leadId}', '${contactId}', 'DEVELOPMENT', 'PROVIDER', 'OUTBOUND',
          'COMPLETED', 'NOT_REQUIRED'
        )
      `),
    ).rejects.toThrow();
    await expect(
      client.exec(`
        insert into calls (
          client_organization_id, lead_id, contact_id, provider, origin, direction, status,
          outcome_requirement
        ) values (
          '${otherTenantId}', '${leadId}', '${contactId}', 'DEVELOPMENT', 'PROVIDER', 'OUTBOUND',
          'REQUESTED', 'NOT_REQUIRED'
        )
      `),
    ).rejects.toThrow();
    await expect(
      client.exec(`
        insert into call_events (
          client_organization_id, call_id, provider, provider_event_id, event_type, occurred_at
        ) values (
          '${tenantId}', '${callId}', 'DEVELOPMENT', 'provider-event-1', 'CALL_STATUS_UPDATED', now()
        ), (
          '${tenantId}', '${callId}', 'DEVELOPMENT', 'provider-event-1', 'CALL_STATUS_UPDATED', now()
        )
      `),
    ).rejects.toThrow();
    await expect(
      client.exec(`
        insert into call_recordings (
          client_organization_id, call_id, source, object_key, original_filename, mime_type,
          size_bytes, uploaded_by_user_id, uploaded_by_membership_id
        ) values (
          '${tenantId}', '${callId}', 'MANUAL_UPLOAD', 'clients/test/recording', 'call.m4a',
          'audio/x-m4a', 1024, '${clientUserId}', '${clientMembershipId}'
        )
      `),
    ).resolves.toBeDefined();
    await expect(
      client.exec(`
        insert into call_recordings (
          client_organization_id, call_id, source, object_key
        ) values ('${tenantId}', '${callId}', 'MANUAL_UPLOAD', 'clients/test/incomplete')
      `),
    ).rejects.toThrow();
  });

  it('enforces platform/client scope and tenant roots at the database boundary', async () => {
    await expect(
      client.exec(`
        insert into outbox_events (
          scope, aggregate_type, aggregate_id, event_type, payload, correlation_id
        ) values (
          'CLIENT', 'test', 'aggregate-1', 'TestEvent', '{}'::jsonb, 'correlation-scope'
        )
      `),
    ).rejects.toThrow();

    await expect(
      client.exec(`
        insert into outbox_events (
          scope, client_organization_id, aggregate_type, aggregate_id,
          event_type, payload, correlation_id
        ) values (
          'CLIENT', '018f25a7-6dc0-7d4a-b7c6-6ba6f7446999', 'test',
          'aggregate-orphan', 'TestEvent', '{}'::jsonb, 'correlation-orphan'
        )
      `),
    ).rejects.toThrow();

    await expect(
      client.exec(`
        insert into outbox_events (
          scope, aggregate_type, aggregate_id, event_type, payload, correlation_id
        ) values (
          'PLATFORM', 'test', 'aggregate-2', 'TestEvent', '{}'::jsonb,
          'correlation-platform'
        )
      `),
    ).resolves.toBeDefined();
  });

  it('deduplicates provider events inside a real tenant', async () => {
    const insertWebhook = `
      insert into webhook_events (
        client_organization_id,
        provider,
        external_event_id,
        event_type,
        signature_verified_at,
        raw_payload,
        correlation_id,
        raw_payload_expires_at
      ) values (
        '${tenantId}',
        'provider-fixture',
        'external-event-1',
        'fixture.received',
        now(),
        '{}'::jsonb,
        'correlation-webhook',
        now() + interval '7 days'
      )
    `;

    await expect(client.exec(insertWebhook)).resolves.toBeDefined();
    await expect(client.exec(insertWebhook)).rejects.toThrow();
  });

  it('prevents cross-tenant branch and team scope relationships', async () => {
    await expect(
      client.exec(`
        insert into membership_branch_scopes (
          client_organization_id, membership_id, branch_id
        ) values ('${tenantId}', '${clientMembershipId}', '${otherBranchId}')
      `),
    ).rejects.toThrow();

    await expect(
      client.exec(`
        insert into membership_team_scopes (
          client_organization_id, membership_id, branch_id, team_id
        ) values (
          '${tenantId}', '${clientMembershipId}', '${otherBranchId}', '${otherTeamId}'
        )
      `),
    ).rejects.toThrow();

    await expect(
      client.exec(`
        insert into membership_branch_scopes (
          client_organization_id, membership_id, branch_id
        ) values ('${tenantId}', '${clientMembershipId}', '${branchId}')
      `),
    ).resolves.toBeDefined();
    await expect(
      client.exec(`
        insert into membership_team_scopes (
          client_organization_id, membership_id, branch_id, team_id
        ) values ('${tenantId}', '${clientMembershipId}', '${branchId}', '${teamId}')
      `),
    ).resolves.toBeDefined();
  });

  it('prevents cross-tenant departments, canonical team membership and branch/team queues', async () => {
    await expect(
      client.exec(`
        insert into membership_department_scopes (
          client_organization_id, membership_id, branch_id, department_id
        ) values (
          '${tenantId}', '${clientMembershipId}', '${otherBranchId}', '${otherDepartmentId}'
        )
      `),
    ).rejects.toThrow();
    await expect(
      client.exec(`
        insert into team_memberships (
          client_organization_id, branch_id, department_id, team_id, membership_id, reason
        ) values (
          '${tenantId}', '${otherBranchId}', '${otherDepartmentId}', '${otherTeamId}',
          '${clientMembershipId}', 'Cross-tenant relationship must fail.'
        )
      `),
    ).rejects.toThrow();
    await expect(
      client.exec(`
        insert into team_manager_assignments (
          client_organization_id, branch_id, department_id, team_id,
          manager_membership_id, reason, assigned_by
        ) values (
          '${tenantId}', '${otherBranchId}', '${otherDepartmentId}', '${otherTeamId}',
          '${clientMembershipId}', 'Cross-tenant manager assignment must fail.', '${clientUserId}'
        )
      `),
    ).rejects.toThrow();
    await expect(
      client.exec(`
        insert into lead_assignment_queues (
          client_organization_id, branch_id, team_id, code, name
        ) values (
          '${tenantId}', '${branchId}', '${otherTeamId}', 'INVALID_QUEUE', 'Invalid queue'
        )
      `),
    ).rejects.toThrow();
    await expect(
      client.exec(`
        insert into membership_department_scopes (
          client_organization_id, membership_id, branch_id, department_id
        ) values ('${tenantId}', '${clientMembershipId}', '${branchId}', '${departmentId}');
        insert into team_memberships (
          client_organization_id, branch_id, department_id, team_id, membership_id, reason
        ) values (
          '${tenantId}', '${branchId}', '${departmentId}', '${teamId}',
          '${clientMembershipId}', 'Valid canonical team membership.'
        )
      `),
    ).resolves.toBeDefined();
  });

  it('rejects inconsistent membership context and invalid lockout counters', async () => {
    await expect(
      client.exec(`
        insert into memberships (
          user_id, context_type, agency_id, client_organization_id, role_id,
          status, branch_scope_mode, team_scope_mode, assignment_scope
        ) values (
          '${clientUserId}', 'AGENCY', null, '${tenantId}', '${agencyRoleId}',
          'INVITED', 'NONE', 'NONE', 'NONE'
        )
      `),
    ).rejects.toThrow();

    await expect(
      client.exec(`
        insert into authentication_identities (
          user_id, provider, provider_key, subject_normalized, status,
          password_digest, password_salt, password_scrypt_n, password_scrypt_r,
          password_scrypt_p, password_key_length, failed_attempt_count
        ) values (
          '${clientUserId}', 'PASSWORD', 'LOCAL', 'other-client@test.example', 'ACTIVE',
          repeat('a', 128), repeat('b', 32), 16384, 8, 1, 64, -1
        )
      `),
    ).rejects.toThrow();
  });

  it('enforces Google identity shape and one identity per provider per user', async () => {
    await expect(
      client.exec(`
        insert into authentication_identities (
          id, user_id, provider, provider_key, subject_normalized,
          provider_email_normalized, status, verified_at
        ) values (
          '${googleIdentityId}', '${clientUserId}', 'OAUTH', 'GOOGLE',
          'google-subject-client', 'client@test.example', 'ACTIVE', now()
        )
      `),
    ).resolves.toBeDefined();

    await expect(
      client.exec(`
        insert into authentication_identities (
          user_id, provider, provider_key, subject_normalized, status
        ) values (
          '${agencyUserId}', 'OAUTH', 'GOOGLE', 'google-subject-without-email', 'ACTIVE'
        )
      `),
    ).rejects.toThrow();
    await expect(
      client.exec(`
        insert into authentication_identities (
          user_id, provider, provider_key, subject_normalized,
          provider_email_normalized, status
        ) values (
          '${agencyUserId}', 'OAUTH', 'GOOGLE', 'google-subject-without-verification',
          'agency@test.example', 'ACTIVE'
        )
      `),
    ).rejects.toThrow();
    await expect(
      client.exec(`
        insert into authentication_identities (
          user_id, provider, provider_key, subject_normalized,
          provider_email_normalized, status
        ) values (
          '${clientUserId}', 'OAUTH', 'GOOGLE', 'second-google-subject',
          'client@test.example', 'ACTIVE'
        )
      `),
    ).rejects.toThrow();
  });

  it('enforces client-bound Google challenge hashes, bindings and expiry', async () => {
    const challengeId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446801';
    await expect(
      client.exec(`
        insert into external_auth_challenges (
          id, purpose, client_type, nonce_hash, expires_at
        ) values (
          '${challengeId}', 'LOGIN', 'WEB', repeat('a', 64), now() + interval '5 minutes'
        )
      `),
    ).resolves.toBeDefined();
    await expect(
      client.exec(`
        insert into external_auth_challenges (
          purpose, client_type, nonce_hash, expires_at
        ) values ('LOGIN', 'MOBILE', 'not-a-hash', now() + interval '5 minutes')
      `),
    ).rejects.toThrow();
    await expect(
      client.exec(`
        insert into external_auth_challenges (
          purpose, client_type, nonce_hash, expires_at
        ) values ('LINK', 'WEB', repeat('b', 64), now() + interval '5 minutes')
      `),
    ).rejects.toThrow();
    await expect(
      client.exec(`
        insert into external_auth_challenges (
          purpose, client_type, nonce_hash, expires_at
        ) values ('LOGIN', 'WEB', repeat('c', 64), now() - interval '1 minute')
      `),
    ).rejects.toThrow();
    await expect(
      client.exec(`
        insert into external_auth_challenges (
          purpose, client_type, nonce_hash, expires_at
        ) values ('LOGIN', 'WEB', repeat('a', 64), now() + interval '5 minutes')
      `),
    ).rejects.toThrow();
  });

  it('revokes every Google-bound session without revoking password sessions', async () => {
    await client.exec(`
      insert into refresh_sessions (
        id, user_id, authentication_identity_id, current_membership_id,
        client_type, device_platform, refresh_token_version, expires_at
      ) values
        (
          '${googleSessionId}', '${clientUserId}', '${googleIdentityId}',
          '${clientMembershipId}', 'WEB', 'WEB', 1, now() + interval '30 days'
        ),
        (
          '${secondGoogleSessionId}', '${clientUserId}', '${googleIdentityId}',
          '${clientMembershipId}', 'MOBILE', 'ANDROID', 1, now() + interval '30 days'
        );
      update authentication_identities
      set status = 'DISABLED'
      where id = '${googleIdentityId}';
    `);
    const googleSessions = await client.query<{
      revoked_at: Date | null;
      revoked_reason: string | null;
    }>(`
      select revoked_at, revoked_reason from refresh_sessions
      where id in ('${googleSessionId}', '${secondGoogleSessionId}')
    `);
    const passwordSession = await client.query<{ revoked_at: Date | null }>(`
      select revoked_at from refresh_sessions where id = '${clientSessionId}'
    `);
    expect(googleSessions.rows).toHaveLength(2);
    expect(googleSessions.rows.every((session) => session.revoked_at !== null)).toBe(true);
    expect(
      googleSessions.rows.every((session) => session.revoked_reason === 'IDENTITY_DISABLED'),
    ).toBe(true);
    expect(passwordSession.rows[0]?.revoked_at).toBeNull();
  });

  it('keeps refresh rotation history append-only', async () => {
    await expect(
      client.exec(`
        update refresh_token_rotations set token_hash = repeat('b', 64)
        where id = '${rotationId}'
      `),
    ).rejects.toThrow(/immutable/u);
    await expect(
      client.exec(`delete from refresh_token_rotations where id = '${rotationId}'`),
    ).rejects.toThrow(/immutable/u);
  });

  it('enforces support actor context, reason and expiry', async () => {
    await expect(
      client.exec(`
        insert into support_elevations (
          client_organization_id, actor_user_id, actor_membership_id,
          actor_membership_context, actor_session_id, reason, created_at, expires_at
        ) values (
          '${tenantId}', '${agencyUserId}', '${agencyMembershipId}', 'AGENCY',
          '${agencySessionId}', 'Valid incident investigation reason', now(), now() - interval '1 minute'
        )
      `),
    ).rejects.toThrow();

    await expect(
      client.exec(`
        insert into support_elevations (
          client_organization_id, actor_user_id, actor_membership_id,
          actor_membership_context, actor_session_id, reason, created_at, expires_at
        ) values (
          '${tenantId}', '${agencyUserId}', '${agencyMembershipId}', 'AGENCY',
          '${agencySessionId}', 'Attempted overlong support elevation', now(),
          now() + interval '61 minutes'
        )
      `),
    ).rejects.toThrow();

    await expect(
      client.exec(`
        insert into support_elevations (
          client_organization_id, actor_user_id, actor_membership_id,
          actor_membership_context, actor_session_id, reason, expires_at
        ) values (
          '${tenantId}', '${clientUserId}', '${clientMembershipId}', 'AGENCY',
          '${clientSessionId}', 'Attempted invalid client elevation', now() + interval '15 minutes'
        )
      `),
    ).rejects.toThrow();
  });

  it('rejects updates and deletes from immutable authentication audit evidence', async () => {
    const inserted = await client.query<{ id: string }>(`
      insert into authentication_audit_events (
        scope, client_organization_id, user_id, session_id, membership_id,
        event_type, outcome, correlation_id
      ) values (
        'CLIENT', '${tenantId}', '${clientUserId}', '${clientSessionId}',
        '${clientMembershipId}', 'LOGIN_SUCCEEDED', 'SUCCESS', 'correlation-auth-audit'
      ) returning id
    `);
    const auditId = inserted.rows[0]?.id;

    expect(auditId).toBeDefined();
    await expect(
      client.exec(`
        update authentication_audit_events set reason_code = 'changed'
        where id = '${auditId}'
      `),
    ).rejects.toThrow(/immutable/u);
    await expect(
      client.exec(`delete from authentication_audit_events where id = '${auditId}'`),
    ).rejects.toThrow(/immutable/u);
  });

  it('retains immutable general audit evidence', async () => {
    const inserted = await client.query<{ id: string }>(`
      insert into audit_events (
        scope,
        client_organization_id,
        actor_type,
        action,
        entity_type,
        entity_id,
        outcome,
        correlation_id
      ) values (
        'CLIENT',
        '${tenantId}',
        'SYSTEM',
        'foundation.test',
        'foundation',
        'foundation-1',
        'SUCCESS',
        'correlation-audit'
      )
      returning id
    `);
    const auditId = inserted.rows[0]?.id;

    expect(auditId).toBeDefined();
    await expect(
      client.exec(`update audit_events set reason = 'changed' where id = '${auditId}'`),
    ).rejects.toThrow(/immutable/u);
    await expect(client.exec(`delete from audit_events where id = '${auditId}'`)).rejects.toThrow(
      /immutable/u,
    );
  });
});
