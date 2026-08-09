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
const sameTenantBranchId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446713';
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

describe('reviewed PostgreSQL migrations through Phase 14 release hardening', () => {
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
  }, 30_000);

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
          'mfa_authenticators', 'mfa_login_challenges', 'mfa_recovery_codes',
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
          'messaging_opt_in_records', 'messaging_suppressions',
          'test_ride_allocation_locks', 'test_ride_command_receipts',
          'test_ride_demo_vehicle_bookings', 'test_ride_events', 'test_ride_jobs',
          'test_ride_location_samples', 'test_ride_location_sessions',
          'delivery_checklist_events', 'delivery_checklist_items',
          'delivery_command_receipts', 'delivery_jobs', 'delivery_location_samples',
          'delivery_location_sessions', 'delivery_otp_challenges',
          'delivery_proof_download_events', 'delivery_proofs', 'delivery_settings',
          'delivery_status_events'
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
      'delivery_checklist_events',
      'delivery_checklist_items',
      'delivery_command_receipts',
      'delivery_jobs',
      'delivery_location_samples',
      'delivery_location_sessions',
      'delivery_otp_challenges',
      'delivery_proof_download_events',
      'delivery_proofs',
      'delivery_settings',
      'delivery_status_events',
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
      'mfa_authenticators',
      'mfa_login_challenges',
      'mfa_recovery_codes',
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
      'test_ride_allocation_locks',
      'test_ride_command_receipts',
      'test_ride_demo_vehicle_bookings',
      'test_ride_events',
      'test_ride_jobs',
      'test_ride_location_samples',
      'test_ride_location_sessions',
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
    expect(permissionCount.rows[0]?.count).toBe(130);
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
        'inventory.allocations.reallocate',
        'inventory.corrections.manage',
        'inventory.units.sensitive.read',
        'commercial.discounts.approve',
        'commercial.payments.verify',
        'commercial.settings.manage',
        'delivery.active_map.read',
        'delivery.proofs.review',
        'delivery.settings.manage',
        'reminders.rules.manage',
        'reminders.dispatch.manage',
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
    expect(roleFamilies.get('MANAGER')?.permissions.has('test_rides.active_map.read')).toBe(true);
    expect(roleFamilies.get('SALESPERSON')?.permissions.has('test_rides.schedule')).toBe(true);
    expect(roleFamilies.get('SALESPERSON')?.permissions.has('test_rides.execute')).toBe(false);
    expect(roleFamilies.get('TEST_RIDE_EXECUTIVE')?.permissions.has('test_rides.execute')).toBe(
      true,
    );
    expect(
      roleFamilies.get('TEST_RIDE_EXECUTIVE')?.permissions.has('test_rides.location.write'),
    ).toBe(true);
    expect(roleFamilies.get('TEST_RIDE_EXECUTIVE')?.permissions.has('test_rides.assign')).toBe(
      false,
    );
    expect(
      roleFamilies.get('INVENTORY_EXECUTIVE')?.permissions.has('inventory.allocations.manage'),
    ).toBe(true);
    expect(
      roleFamilies.get('INVENTORY_EXECUTIVE')?.permissions.has('inventory.allocations.reallocate'),
    ).toBe(false);
    expect(
      roleFamilies
        .get('BILLING_DOCUMENTATION_EXECUTIVE')
        ?.permissions.has('inventory.allocations.manage'),
    ).toBe(false);
    expect(roleFamilies.get('MANAGER')?.permissions.has('inventory.corrections.manage')).toBe(true);
    expect(
      roleFamilies
        .get('BILLING_DOCUMENTATION_EXECUTIVE')
        ?.permissions.has('commercial.payments.verify'),
    ).toBe(true);
    expect(roleFamilies.get('SALESPERSON')?.permissions.has('commercial.discounts.approve')).toBe(
      false,
    );
    expect(roleFamilies.get('DELIVERY_EXECUTIVE')?.permissions.has('delivery.jobs.execute')).toBe(
      true,
    );
    expect(
      roleFamilies.get('DELIVERY_EXECUTIVE')?.permissions.has('delivery.active_map.read'),
    ).toBe(false);
    expect(roleFamilies.get('MANAGER')?.permissions.has('delivery.reschedules.approve')).toBe(true);
  });

  it('keeps Phase 6 jobs tenant-consistent and binds each location sample to its session identity', async () => {
    const contactId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446901';
    const leadId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446902';
    const firstRideId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446903';
    const secondRideId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446904';
    const sessionId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446905';
    await client.exec(`
      insert into contacts (
        id, client_organization_id, display_name, primary_phone_e164,
        primary_phone_lookup_hash
      ) values (
        '${contactId}', '${tenantId}', 'Test Ride Customer', '+919876543211', repeat('e', 64)
      );
      insert into lead_opportunities (
        id, client_organization_id, contact_id, branch_id, source, entry_method,
        vehicle_interest, status, sla_due_at, sla_warning_at
      ) values (
        '${leadId}', '${tenantId}', '${contactId}', '${branchId}', 'WEBSITE', 'MANUAL',
        'Model T', 'ACCEPTED', now() + interval '15 minutes', now() + interval '10 minutes'
      );
      insert into test_ride_jobs (
        id, client_organization_id, lead_id, contact_id, branch_id, vehicle_model,
        demo_vehicle_reference, customer_location, scheduled_start_at, scheduled_end_at,
        status, executive_user_id, executive_membership_id, created_by
      ) values
        (
          '${firstRideId}', '${tenantId}', '${leadId}', '${contactId}', '${branchId}',
          'Model T', 'DEMO-T-1', 'Customer address', now(), now() + interval '1 hour',
          'ACTIVE', '${clientUserId}', '${clientMembershipId}', '${clientUserId}'
        ),
        (
          '${secondRideId}', '${tenantId}', '${leadId}', '${contactId}', '${branchId}',
          'Model T', 'DEMO-T-2', 'Customer address', now() + interval '2 hours',
          now() + interval '3 hours', 'ACTIVE', '${clientUserId}', '${clientMembershipId}',
          '${clientUserId}'
        );
      insert into test_ride_location_sessions (
        id, client_organization_id, test_ride_job_id, executive_user_id,
        executive_membership_id, started_at, expires_at
      ) values (
        '${sessionId}', '${tenantId}', '${firstRideId}', '${clientUserId}',
        '${clientMembershipId}', now(), now() + interval '3 hours'
      );
    `);

    await expect(
      client.exec(`
        insert into test_ride_command_receipts (
          client_organization_id, test_ride_job_id, idempotency_key, command_type,
          request_fingerprint, response_snapshot
        ) values (
          '${tenantId}', null, 'migration-create-receipt', 'CREATE', repeat('f', 64), '{}'::jsonb
        )
      `),
    ).resolves.toBeDefined();
    await expect(
      client.exec(`
        insert into test_ride_jobs (
          client_organization_id, lead_id, contact_id, branch_id, vehicle_model,
          demo_vehicle_reference, customer_location, scheduled_start_at, scheduled_end_at,
          created_by
        ) values (
          '${otherTenantId}', '${leadId}', '${contactId}', '${otherBranchId}', 'Model T',
          'CROSS-TENANT', 'Invalid address', now(), now() + interval '1 hour', '${clientUserId}'
        )
      `),
    ).rejects.toThrow();
    await expect(
      client.exec(`
        insert into test_ride_location_samples (
          client_organization_id, test_ride_job_id, location_session_id, executive_user_id,
          latitude, longitude, accuracy_meters, captured_at, expires_at, idempotency_key
        ) values (
          '${tenantId}', '${secondRideId}', '${sessionId}', '${clientUserId}',
          12.9716, 77.5946, 25, now(), now() + interval '30 days', 'wrong-session-ride'
        )
      `),
    ).rejects.toThrow();
    await expect(
      client.exec(`
        insert into test_ride_location_samples (
          client_organization_id, test_ride_job_id, location_session_id, executive_user_id,
          latitude, longitude, accuracy_meters, captured_at, expires_at, idempotency_key
        ) values (
          '${tenantId}', '${firstRideId}', '${sessionId}', '${clientUserId}',
          12.9716, 77.5946, 25, now(), now() + interval '30 days', 'valid-session-ride'
        )
      `),
    ).resolves.toBeDefined();
  });

  it('enforces Phase 8 tenant keys and immutable commercial evidence', async () => {
    const contactId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446c01';
    const leadId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446c02';
    const quotationId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446c03';
    const versionId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446c04';
    const bookingId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446c05';
    const paymentId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446c06';
    await client.exec(`
      insert into contacts (
        id, client_organization_id, display_name, primary_phone_e164,
        primary_phone_lookup_hash
      ) values (
        '${contactId}', '${tenantId}', 'Commercial Customer', '+919876543219', repeat('9', 64)
      );
      insert into lead_opportunities (
        id, client_organization_id, contact_id, branch_id, source, entry_method,
        vehicle_interest, status, sla_due_at, sla_warning_at
      ) values (
        '${leadId}', '${tenantId}', '${contactId}', '${branchId}', 'WEBSITE', 'MANUAL',
        'Model Commercial', 'NEGOTIATION', now() + interval '15 minutes',
        now() + interval '10 minutes'
      );
      insert into commercial_settings (
        client_organization_id, currency, discount_approval_threshold_minor,
        delivery_payment_gate_basis_points
      ) values ('${tenantId}', 'INR', 10000, 5000);
      insert into quotations (
        id, client_organization_id, branch_id, contact_id, lead_id,
        quotation_reference, status, approval_status, current_version, currency,
        total_minor, discount_minor, payable_minor, vehicle_configuration, expires_at,
        created_by_user_id, created_by_membership_id
      ) values (
        '${quotationId}', '${tenantId}', '${branchId}', '${contactId}', '${leadId}',
        'QT-MIGRATION-1', 'ACTIVE', 'NOT_REQUIRED', 1, 'INR', 100000, 0, 100000,
        'Model Commercial', now() + interval '1 day', '${clientUserId}', '${clientMembershipId}'
      );
      insert into quotation_versions (
        id, client_organization_id, quotation_id, version, currency, total_minor,
        discount_minor, payable_minor, vehicle_configuration, expires_at,
        created_by_user_id, created_by_membership_id
      ) values (
        '${versionId}', '${tenantId}', '${quotationId}', 1, 'INR', 100000, 0, 100000,
        'Model Commercial', now() + interval '1 day', '${clientUserId}', '${clientMembershipId}'
      );
      insert into bookings (
        id, client_organization_id, branch_id, contact_id, lead_id, quotation_id,
        quotation_version, booking_reference, payment_type, currency, payable_minor,
        customer_confirmed_at, created_by_user_id, created_by_membership_id
      ) values (
        '${bookingId}', '${tenantId}', '${branchId}', '${contactId}', '${leadId}',
        '${quotationId}', 1, 'BK-MIGRATION-1', 'FULL', 'INR', 100000, now(),
        '${clientUserId}', '${clientMembershipId}'
      );
      insert into payment_entries (
        id, client_organization_id, booking_id, amount_minor, currency, method,
        payment_reference, received_at, created_by_user_id, created_by_membership_id
      ) values (
        '${paymentId}', '${tenantId}', '${bookingId}', 50000, 'INR', 'UPI',
        'PAY-MIGRATION-1', now(), '${clientUserId}', '${clientMembershipId}'
      );
    `);

    await expect(
      client.exec(`update payment_entries set amount_minor = 1 where id = '${paymentId}'`),
    ).rejects.toThrow(/append-only/u);
    await expect(
      client.exec(`delete from quotation_versions where id = '${versionId}'`),
    ).rejects.toThrow(/append-only/u);
    await expect(
      client.exec(`
        insert into bookings (
          client_organization_id, branch_id, contact_id, lead_id, quotation_id,
          quotation_version, booking_reference, payment_type, currency, payable_minor,
          customer_confirmed_at, created_by_user_id, created_by_membership_id
        ) values (
          '${otherTenantId}', '${otherBranchId}', '${contactId}', '${leadId}', '${quotationId}',
          1, 'BK-CROSS-TENANT', 'FULL', 'INR', 100000, now(),
          '${clientUserId}', '${clientMembershipId}'
        )
      `),
    ).rejects.toThrow();
  });

  it('enforces Phase 9 delivery tenant roots, append-only history and exact location sessions', async () => {
    const contactId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446d01';
    const leadId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446d02';
    const brandId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446d03';
    const modelId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446d04';
    const variantId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446d05';
    const colourId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446d06';
    const unitId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446d07';
    const quotationId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446d08';
    const versionId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446d09';
    const bookingId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446d10';
    const allocationId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446d11';
    const jobId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446d12';
    const itemId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446d13';
    const eventId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446d14';
    const sessionId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446d15';
    await client.exec(`
      insert into contacts (
        id, client_organization_id, display_name, primary_phone_e164,
        primary_phone_lookup_hash
      ) values (
        '${contactId}', '${tenantId}', 'Delivery Customer', '+919876543218', repeat('8', 64)
      );
      insert into lead_opportunities (
        id, client_organization_id, contact_id, branch_id, source, entry_method,
        vehicle_interest, status, sla_due_at, sla_warning_at
      ) values (
        '${leadId}', '${tenantId}', '${contactId}', '${branchId}', 'WEBSITE', 'MANUAL',
        'Delivery Model', 'NEGOTIATION', now() + interval '15 minutes',
        now() + interval '10 minutes'
      );
      insert into inventory_brands (id, client_organization_id, code, name)
      values ('${brandId}', '${tenantId}', 'DELIVERY', 'Delivery Brand');
      insert into inventory_models (id, client_organization_id, brand_id, code, name)
      values ('${modelId}', '${tenantId}', '${brandId}', 'MODEL', 'Delivery Model');
      insert into inventory_variants (
        id, client_organization_id, model_id, code, name, fuel_powertrain, model_year
      ) values (
        '${variantId}', '${tenantId}', '${modelId}', 'VARIANT', 'Delivery Variant', 'EV', 2026
      );
      insert into inventory_colours (id, client_organization_id, code, name)
      values ('${colourId}', '${tenantId}', 'BLUE', 'Blue');
      insert into inventory_units (
        id, client_organization_id, branch_id, variant_id, colour_id, unit_reference,
        status, ownership_type, created_by_user_id, created_by_membership_id
      ) values (
        '${unitId}', '${tenantId}', '${branchId}', '${variantId}', '${colourId}',
        'DELIVERY-UNIT-1', 'ALLOCATED', 'DEALER_OWNED', '${clientUserId}', '${clientMembershipId}'
      );
      insert into quotations (
        id, client_organization_id, branch_id, contact_id, lead_id,
        quotation_reference, status, approval_status, current_version, currency,
        total_minor, discount_minor, payable_minor, vehicle_configuration, expires_at,
        created_by_user_id, created_by_membership_id
      ) values (
        '${quotationId}', '${tenantId}', '${branchId}', '${contactId}', '${leadId}',
        'QT-DELIVERY-1', 'ACTIVE', 'NOT_REQUIRED', 1, 'INR', 100000, 0, 100000,
        'Delivery Model', now() + interval '1 day', '${clientUserId}', '${clientMembershipId}'
      );
      insert into quotation_versions (
        id, client_organization_id, quotation_id, version, currency, total_minor,
        discount_minor, payable_minor, vehicle_configuration, expires_at,
        created_by_user_id, created_by_membership_id
      ) values (
        '${versionId}', '${tenantId}', '${quotationId}', 1, 'INR', 100000, 0, 100000,
        'Delivery Model', now() + interval '1 day', '${clientUserId}', '${clientMembershipId}'
      );
      insert into bookings (
        id, client_organization_id, branch_id, contact_id, lead_id, quotation_id,
        quotation_version, booking_reference, payment_type, currency, payable_minor,
        selected_inventory_unit_id, customer_confirmed_at,
        created_by_user_id, created_by_membership_id
      ) values (
        '${bookingId}', '${tenantId}', '${branchId}', '${contactId}', '${leadId}',
        '${quotationId}', 1, 'BK-DELIVERY-1', 'FULL', 'INR', 100000, '${unitId}', now(),
        '${clientUserId}', '${clientMembershipId}'
      );
      insert into inventory_allocations (
        id, client_organization_id, inventory_unit_id, booking_reference, booking_id,
        readiness_asserted, reason, allocated_by_user_id, allocated_by_membership_id
      ) values (
        '${allocationId}', '${tenantId}', '${unitId}', 'BK-DELIVERY-1', '${bookingId}',
        true, 'Migration delivery fixture', '${clientUserId}', '${clientMembershipId}'
      );
      insert into delivery_settings (client_organization_id)
      values ('${tenantId}');
      insert into delivery_jobs (
        id, client_organization_id, branch_id, booking_id, inventory_unit_id,
        contact_id, lead_id, assigned_membership_id, assigned_user_id, status,
        scheduled_for, destination_address, created_by_membership_id
      ) values (
        '${jobId}', '${tenantId}', '${branchId}', '${bookingId}', '${unitId}',
        '${contactId}', '${leadId}', '${clientMembershipId}', '${clientUserId}',
        'OUT_FOR_DELIVERY', now() + interval '1 hour', 'Migration destination',
        '${clientMembershipId}'
      );
      insert into delivery_checklist_items (
        id, client_organization_id, delivery_job_id, code, required, checked
      ) values ('${itemId}', '${tenantId}', '${jobId}', 'PDI', true, true);
      insert into delivery_status_events (
        id, client_organization_id, delivery_job_id, from_status, to_status,
        event_type, correlation_id
      ) values (
        '${eventId}', '${tenantId}', '${jobId}', 'DELIVERY_SCHEDULED',
        'OUT_FOR_DELIVERY', 'DELIVERY_STARTED', 'migration-phase-9'
      );
      insert into delivery_location_sessions (
        id, client_organization_id, delivery_job_id, membership_id, user_id,
        started_at, expires_at
      ) values (
        '${sessionId}', '${tenantId}', '${jobId}', '${clientMembershipId}', '${clientUserId}',
        now(), now() + interval '2 hours'
      );
      insert into delivery_location_samples (
        client_organization_id, delivery_job_id, location_session_id, idempotency_key,
        latitude, longitude, accuracy_meters, captured_at, expires_at
      ) values (
        '${tenantId}', '${jobId}', '${sessionId}', 'delivery-location-1',
        18.5204, 73.8567, 20, now(), now() + interval '30 days'
      );
    `);

    await expect(
      client.exec(`update delivery_status_events set reason = 'rewrite' where id = '${eventId}'`),
    ).rejects.toThrow(/append-only/u);
    await expect(
      client.exec(`
        insert into delivery_jobs (
          client_organization_id, branch_id, booking_id, inventory_unit_id, contact_id,
          lead_id, scheduled_for, destination_address, created_by_membership_id
        ) values (
          '${otherTenantId}', '${otherBranchId}', '${bookingId}', '${unitId}', '${contactId}',
          '${leadId}', now() + interval '1 day', 'Cross tenant', '${clientMembershipId}'
        )
      `),
    ).rejects.toThrow();
    const sessionConstraint = await client.query<{ count: number }>(`
      select count(*)::int as count
      from pg_constraint
      where conname = 'delivery_locations_session_identity_fk'
    `);
    expect(sessionConstraint.rows[0]?.count).toBe(1);
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

  it('installs tenant-safe Phase 10 identity, history and permission guards', async () => {
    const constraints = await client.query<{ constraint_name: string }>(`
      select constraint_name
      from information_schema.table_constraints
      where constraint_name in (
        'registration_events_correction_tenant_fk',
        'registration_cases_booking_tenant_fk',
        'customer_vehicles_delivery_tenant_fk',
        'customer_vehicles_source_check'
      )
    `);
    expect(new Set(constraints.rows.map((row) => row.constraint_name))).toEqual(
      new Set([
        'registration_events_correction_tenant_fk',
        'registration_cases_booking_tenant_fk',
        'customer_vehicles_delivery_tenant_fk',
        'customer_vehicles_source_check',
      ]),
    );

    const triggers = await client.query<{ trigger_name: string }>(`
      select tgname as trigger_name
      from pg_trigger
      where not tgisinternal
        and tgname in (
          'registration_events_immutable',
          'rc_delivery_records_immutable',
          'customer_vehicle_events_immutable'
        )
    `);
    expect(new Set(triggers.rows.map((row) => row.trigger_name))).toEqual(
      new Set([
        'registration_events_immutable',
        'rc_delivery_records_immutable',
        'customer_vehicle_events_immutable',
      ]),
    );

    const permissions = await client.query<{ code: string }>(`
      select code from permissions
      where code like 'registration.%' or code like 'customer_vehicles.%'
    `);
    expect(permissions.rows).toHaveLength(13);

    const executivePermissions = await client.query<{ code: string }>(`
      select p.code
      from role_permission_mappings rpm
      join roles r on r.id = rpm.role_id
      join permissions p on p.id = rpm.permission_id
      where r.code = 'RC_REGISTRATION_EXECUTIVE'
        and p.code in ('registration.cases.execute', 'registration.cases.close', 'registration.documents.share')
    `);
    expect(new Set(executivePermissions.rows.map((row) => row.code))).toEqual(
      new Set([
        'registration.cases.execute',
        'registration.cases.close',
        'registration.documents.share',
      ]),
    );
  });

  it('enforces inventory identity, tenant links, terminal state and immutable transfer history', async () => {
    const brandId = '90000000-0000-4000-8000-000000000001';
    const modelId = '90000000-0000-4000-8000-000000000002';
    const variantId = '90000000-0000-4000-8000-000000000003';
    const colourId = '90000000-0000-4000-8000-000000000004';
    const unitId = '90000000-0000-4000-8000-000000000005';
    const historyId = '90000000-0000-4000-8000-000000000006';
    const transferId = '90000000-0000-4000-8000-000000000007';
    await client.exec(`
      insert into branches (id, client_organization_id, code, name)
      values ('${sameTenantBranchId}', '${tenantId}', 'A_SECOND', 'Tenant A Second');
      insert into inventory_brands (id, client_organization_id, code, name)
      values ('${brandId}', '${tenantId}', 'TEST', 'Test Brand');
      insert into inventory_models (id, client_organization_id, brand_id, code, name)
      values ('${modelId}', '${tenantId}', '${brandId}', 'MODEL', 'Test Model');
      insert into inventory_variants (
        id, client_organization_id, model_id, code, name, fuel_powertrain, model_year
      ) values (
        '${variantId}', '${tenantId}', '${modelId}', 'VARIANT', 'Test Variant', 'PETROL', 2026
      );
      insert into inventory_colours (id, client_organization_id, code, name)
      values ('${colourId}', '${tenantId}', 'WHITE', 'White');
      insert into inventory_units (
        id, client_organization_id, branch_id, variant_id, colour_id, unit_reference,
        vin, chassis_number, engine_number, status, ownership_type,
        created_by_user_id, created_by_membership_id
      ) values (
        '${unitId}', '${tenantId}', '${branchId}', '${variantId}', '${colourId}', 'UNIT-1',
        'TESTVIN000000001', 'TESTCHASSIS001', 'TESTENGINE001', 'AVAILABLE', 'DEALER_OWNED',
        '${clientUserId}', '${clientMembershipId}'
      );
      insert into inventory_unit_status_history (
        id, client_organization_id, inventory_unit_id, to_status, event_type,
        actor_user_id, actor_membership_id
      ) values (
        '${historyId}', '${tenantId}', '${unitId}', 'AVAILABLE', 'UNIT_CREATED',
        '${clientUserId}', '${clientMembershipId}'
      );
      insert into inventory_transfers (
        id, client_organization_id, inventory_unit_id, from_branch_id, to_branch_id,
        prior_status, reference, reason, initiated_by_user_id, initiated_by_membership_id
      ) values (
        '${transferId}', '${tenantId}', '${unitId}', '${branchId}', '${sameTenantBranchId}',
        'AVAILABLE', 'TRANSFER-1', 'Test transfer history', '${clientUserId}', '${clientMembershipId}'
      );
    `);

    await expect(
      client.exec(`
        insert into inventory_units (
          client_organization_id, branch_id, variant_id, colour_id, unit_reference,
          vin, chassis_number, status, ownership_type, created_by_user_id, created_by_membership_id
        ) values (
          '${tenantId}', '${branchId}', '${variantId}', '${colourId}', 'UNIT-2',
          'TESTVIN000000001', 'TESTCHASSIS002', 'AVAILABLE', 'DEALER_OWNED',
          '${clientUserId}', '${clientMembershipId}'
        )
      `),
    ).rejects.toThrow();
    await expect(
      client.exec(`
        insert into inventory_units (
          client_organization_id, branch_id, variant_id, colour_id, unit_reference,
          status, ownership_type, created_by_user_id, created_by_membership_id
        ) values (
          '${tenantId}', '${otherBranchId}', '${variantId}', '${colourId}', 'CROSS-TENANT',
          'EXPECTED', 'DEALER_OWNED', '${clientUserId}', '${clientMembershipId}'
        )
      `),
    ).rejects.toThrow();
    await expect(
      client.exec(
        `update inventory_unit_status_history set reason = 'rewrite' where id = '${historyId}'`,
      ),
    ).rejects.toThrow(/append-only/u);
    await expect(
      client.exec(`update inventory_transfers set reason = 'rewrite' where id = '${transferId}'`),
    ).rejects.toThrow(/append-only/u);

    await client.exec(`
      update inventory_units set status = 'ALLOCATED' where id = '${unitId}';
      update inventory_units set status = 'DELIVERED' where id = '${unitId}';
    `);
    await expect(
      client.exec(`update inventory_units set status = 'AVAILABLE' where id = '${unitId}'`),
    ).rejects.toThrow(/invalid inventory transition/u);
  });

  it('enforces Phase 11 reminder idempotency, tenant ownership and immutable history', async () => {
    const contactId = 'e0000000-0000-4000-8000-000000000001';
    const vehicleId = 'e1000000-0000-4000-8000-000000000001';
    const connectionId = 'e2000000-0000-4000-8000-000000000001';
    const templateId = 'e3000000-0000-4000-8000-000000000001';
    const ruleId = 'e5000000-0000-4000-8000-000000000001';
    const planId = 'e6000000-0000-4000-8000-000000000001';
    const instanceId = 'e7000000-0000-4000-8000-000000000001';
    const eventId = 'e8000000-0000-4000-8000-000000000001';
    await client.exec(`
      insert into contacts (
        id, client_organization_id, display_name, primary_phone_e164, primary_phone_lookup_hash
      ) values (
        '${contactId}', '${tenantId}', 'Reminder Customer', '+919900000099', '${'e'.repeat(64)}'
      );
      insert into customer_vehicles (
        id, client_organization_id, branch_id, contact_id, ownership_source,
        brand_name, model_name, variant_name, vin, created_by_membership_id
      ) values (
        '${vehicleId}', '${tenantId}', '${branchId}', '${contactId}', 'EXTERNAL',
        'Reminder Brand', 'Reminder Model', 'Reminder Variant', 'REMINDER-VIN-1',
        '${clientMembershipId}'
      );
      insert into messaging_provider_connections (
        id, client_organization_id, branch_id, provider, channel, connection_key,
        display_name, status
      ) values (
        '${connectionId}', '${tenantId}', '${branchId}', 'DEVELOPMENT', 'WHATSAPP',
        'phase11-migration', 'Phase 11 migration', 'ACTIVE'
      );
      insert into message_templates (
        id, client_organization_id, connection_id, name, language, category, status, body_text
      ) values (
        '${templateId}', '${tenantId}', '${connectionId}', 'phase11_service', 'en',
        'UTILITY', 'APPROVED', 'Service reminder'
      );
      insert into reminder_definitions (
        id, client_organization_id, type, display_name, default_category
      ) values (
        'e4000000-0000-4000-8000-000000000001', '${tenantId}',
        'SERVICE_DUE', 'Service due', 'OPERATIONAL'
      );
    `);
    const definition = await client.query<{ id: string }>(`
      select id from reminder_definitions
      where client_organization_id = '${tenantId}' and type = 'SERVICE_DUE'
    `);
    expect(definition.rows[0]?.id).toBeTruthy();
    await client.exec(`
      insert into reminder_rule_templates (
        id, client_organization_id, reminder_definition_id, threshold_kind,
        base_date_field, due_after_days, notice_days, category, channel,
        template_id, created_by_membership_id
      ) values (
        '${ruleId}', '${tenantId}', '${definition.rows[0]?.id}', 'DATE',
        'DELIVERY_DATE', 180, '[30,15,7,1]'::jsonb, 'OPERATIONAL', 'WHATSAPP',
        '${templateId}', '${clientMembershipId}'
      );
      insert into customer_reminder_plans (
        id, client_organization_id, customer_vehicle_id, rule_template_id,
        due_at, source_vehicle_version, rule_version
      ) values (
        '${planId}', '${tenantId}', '${vehicleId}', '${ruleId}',
        '2027-01-01T00:00:00Z', 1, 1
      );
      insert into reminder_instances (
        id, client_organization_id, customer_reminder_plan_id, materialization_key,
        scheduled_for, category, channel, template_id
      ) values (
        '${instanceId}', '${tenantId}', '${planId}', 'phase11-unique-key',
        '2026-12-01T00:00:00Z', 'OPERATIONAL', 'WHATSAPP', '${templateId}'
      );
      insert into reminder_events (
        id, client_organization_id, reminder_instance_id, to_status,
        event_type, correlation_id
      ) values (
        '${eventId}', '${tenantId}', '${instanceId}', 'SCHEDULED',
        'REMINDER_MATERIALIZED', 'phase11-migration-test'
      );
    `);
    await expect(
      client.exec(`
        insert into reminder_instances (
          client_organization_id, customer_reminder_plan_id, materialization_key,
          scheduled_for, category, channel, template_id
        ) values (
          '${tenantId}', '${planId}', 'phase11-unique-key', now(),
          'OPERATIONAL', 'WHATSAPP', '${templateId}'
        )
      `),
    ).rejects.toThrow();
    await expect(
      client.exec(`update reminder_events set reason = 'rewrite' where id = '${eventId}'`),
    ).rejects.toThrow(/append-only/u);
    await expect(
      client.exec(`
        insert into customer_reminder_plans (
          client_organization_id, customer_vehicle_id, rule_template_id,
          due_at, source_vehicle_version, rule_version
        ) values (
          '${otherTenantId}', '${vehicleId}', '${ruleId}', now(), 1, 1
        )
      `),
    ).rejects.toThrow();
  });

  it('enforces Phase 13 integration tenant isolation and human-review constraints', async () => {
    const connectionId = 'f0000000-0000-4000-8000-000000000001';
    const creativeId = 'f1000000-0000-4000-8000-000000000001';
    const firstCallId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446804';
    const secondCallId = 'f2000000-0000-4000-8000-000000000001';
    await client.exec(`
      insert into integration_connections (
        id, client_organization_id, provider, display_name, status
      ) values (
        '${connectionId}', '${tenantId}', 'AI_IMAGE', 'Tenant image provider', 'PENDING_APPROVAL'
      );
      insert into generated_creative_assets (
        id, client_organization_id, requested_by_membership_id, brand_profile,
        brand_template, brief, provider, status
      ) values (
        '${creativeId}', '${tenantId}', '${clientMembershipId}', 'Alpha brand',
        'Festival template', 'Approved creative brief for tenant test.', 'AI_IMAGE', 'REVIEW_PENDING'
      );
    `);
    await expect(
      client.exec(`
        insert into integration_connections (
          client_organization_id, provider, display_name, status
        ) values ('${tenantId}', 'AI_IMAGE', 'Duplicate provider', 'PENDING_APPROVAL')
      `),
    ).rejects.toThrow();
    await expect(
      client.exec(`
        insert into generated_creative_assets (
          client_organization_id, requested_by_membership_id, brand_profile,
          brand_template, brief, provider, status
        ) values (
          '${otherTenantId}', '${clientMembershipId}', 'Cross tenant', 'Nope', 'Cross tenant attempt.',
          'AI_IMAGE', 'MODERATION_PENDING'
        )
      `),
    ).rejects.toThrow();
    await expect(
      client.exec(`
        update generated_creative_assets set status = 'APPROVED' where id = '${creativeId}'
      `),
    ).rejects.toThrow();
    await client.exec(`
      update generated_creative_assets
      set status = 'APPROVED', reviewed_at = now(), reviewed_by_membership_id = '${clientMembershipId}'
      where id = '${creativeId}'
    `);

    const recording = await client.query<{ id: string }>(`
      select id from call_recordings
      where client_organization_id = '${tenantId}' and call_id = '${firstCallId}'
      limit 1
    `);
    expect(recording.rows[0]?.id).toBeTruthy();
    await client.exec(`
      insert into calls (
        id, client_organization_id, lead_id, contact_id, connection_id, provider,
        provider_call_id, origin, direction, status, outcome_requirement
      )
      select
        '${secondCallId}', client_organization_id, lead_id, contact_id, connection_id,
        provider, 'provider-call-phase13-second', origin, direction, status, outcome_requirement
      from calls where id = '${firstCallId}'
    `);
    await expect(
      client.exec(`
        insert into call_transcript_suggestions (
          client_organization_id, call_id, recording_id, transcript, summary, suggestions
        ) values (
          '${tenantId}', '${secondCallId}', '${recording.rows[0]?.id}',
          'Wrong call transcript', 'Wrong call summary', '[]'::jsonb
        )
      `),
    ).rejects.toThrow();
    await expect(
      client.exec(`
        insert into call_transcript_suggestions (
          client_organization_id, call_id, recording_id, transcript, summary, suggestions
        ) values (
          '${tenantId}', '${firstCallId}', '${recording.rows[0]?.id}',
          'Exact call transcript', 'Exact call summary', '[]'::jsonb
        )
      `),
    ).resolves.toBeDefined();
  });

  it('backfills Phase 12/13 permissions with least-privilege role mappings', async () => {
    const permissionRows = await client.query<{ code: string }>(`
      select code from permissions
      where code in (
        'reports.read', 'reports.export', 'audit.events.read',
        'integrations.read', 'integrations.manage', 'onboarding.manage',
        'ai.creatives.manage', 'ai.creatives.review',
        'ai.transcripts.manage', 'ai.transcripts.review', 'social.publish'
      )
      order by code
    `);
    expect(permissionRows.rows).toHaveLength(11);

    const mappings = await client.query<{ count: number; role_code: string }>(`
      select r.code::text as role_code, count(*)::int as count
      from roles r
      join role_permission_mappings rpm on rpm.role_id = r.id
      join permissions p on p.id = rpm.permission_id
      where p.code in (
        'reports.read', 'reports.export', 'audit.events.read',
        'integrations.read', 'integrations.manage', 'onboarding.manage',
        'ai.creatives.manage', 'ai.creatives.review',
        'ai.transcripts.manage', 'ai.transcripts.review', 'social.publish'
      )
      group by r.code
      order by r.code
    `);
    expect(mappings.rows).toEqual([
      { count: 11, role_code: 'AGENCY_ADMIN' },
      { count: 11, role_code: 'CLIENT_ADMIN' },
      { count: 11, role_code: 'MANAGER' },
      { count: 11, role_code: 'SALES_MANAGER' },
      { count: 10, role_code: 'TEAM_MANAGER' },
    ]);
    const teamAudit = await client.query<{ count: number }>(`
      select count(*)::int as count
      from roles r
      join role_permission_mappings rpm on rpm.role_id = r.id
      join permissions p on p.id = rpm.permission_id
      where r.code = 'TEAM_MANAGER' and p.code = 'audit.events.read'
    `);
    expect(teamAudit.rows[0]?.count).toBe(0);
  });
});
