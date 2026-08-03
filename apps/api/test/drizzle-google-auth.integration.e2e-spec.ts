import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  createMigratedPGliteTestDatabase,
  type MigratedPGliteTestDatabase,
} from '@gdm/database/testing';
import { DrizzleAuthStore } from '../src/auth/drizzle-auth.store.js';

const AGENCY_ID = '10000000-0000-4000-8000-000000000001';
const CLIENT_ID = '20000000-0000-4000-8000-000000000001';
const INVITED_USER_ID = '30000000-0000-4000-8000-000000000001';
const INVITED_MEMBERSHIP_ID = '40000000-0000-4000-8000-000000000001';
const INVITED_IDENTITY_ID = '50000000-0000-4000-8000-000000000001';
const GOOGLE_ONLY_USER_ID = '30000000-0000-4000-8000-000000000002';
const GOOGLE_ONLY_IDENTITY_ID = '50000000-0000-4000-8000-000000000002';
const GOOGLE_ONLY_MEMBERSHIP_ID = '40000000-0000-4000-8000-000000000002';
const GOOGLE_ONLY_SESSION_ID = '60000000-0000-4000-8000-000000000002';
const DUPLICATE_TARGET_USER_ID = '30000000-0000-4000-8000-000000000003';

describe('DrizzleAuthStore Google provisioning invariants (real migrated PGlite database)', () => {
  let database: MigratedPGliteTestDatabase;
  let store: DrizzleAuthStore;

  before(async () => {
    database = await createMigratedPGliteTestDatabase();
    store = new DrizzleAuthStore({ db: database.db } as never);
    await database.client.exec(`
      insert into agencies (id, code, legal_name, display_name, status)
      values (
        '${AGENCY_ID}', 'GOOGLE_TEST_AGENCY', 'Google Test Agency Private Limited',
        'Google Test Agency', 'ACTIVE'
      );

      insert into client_organizations (
        id, agency_id, code, legal_name, display_name, status, timezone
      ) values (
        '${CLIENT_ID}', '${AGENCY_ID}', 'GOOGLE_TEST_CLIENT',
        'Google Test Client Private Limited', 'Google Test Client', 'ACTIVE', 'Asia/Kolkata'
      );

      insert into users (id, display_name, primary_email_normalized, status) values
        ('${INVITED_USER_ID}', 'Invited Google User', 'invited.google@example.com', 'INVITED'),
        ('${GOOGLE_ONLY_USER_ID}', 'Google Only User', 'google.only@example.com', 'ACTIVE'),
        ('${DUPLICATE_TARGET_USER_ID}', 'Duplicate Target', 'duplicate.target@example.com', 'ACTIVE');

      insert into memberships (
        id, user_id, context_type, agency_id, client_organization_id, role_id,
        status, branch_scope_mode, team_scope_mode, assignment_scope, effective_from
      ) values (
        '${INVITED_MEMBERSHIP_ID}', '${INVITED_USER_ID}', 'CLIENT', null, '${CLIENT_ID}',
        (select id from roles where code = 'CLIENT_ADMIN' and application = 'WEB'),
        'INVITED', 'ALL', 'ALL', 'ALL', now() - interval '1 minute'
      );

      insert into authentication_identities (
        id, user_id, provider, provider_key, subject_normalized,
        provider_email_normalized, status, verified_at
      ) values (
        '${GOOGLE_ONLY_IDENTITY_ID}', '${GOOGLE_ONLY_USER_ID}', 'OAUTH', 'GOOGLE',
        'google-only-subject', 'google.only@example.com', 'ACTIVE', now()
      );

      insert into authentication_identities (
        user_id, provider, provider_key, subject_normalized, status
      ) values (
        '${GOOGLE_ONLY_USER_ID}', 'OAUTH', 'UNSUPPORTED_TEST_PROVIDER',
        'unsupported-provider-subject', 'ACTIVE'
      );
    `);
  });

  after(async () => {
    await database.close();
  });

  it('activates the existing invitation atomically without creating a membership', async () => {
    const beforeMemberships = await database.client.query<{ id: string; status: string }>(`
      select id::text, status::text
      from memberships
      where user_id = '${INVITED_USER_ID}'
      order by id
    `);

    const result = await store.resolveGoogleLoginIdentity({
      audit: {
        correlationId: 'real-store-invitation-test',
        eventType: 'IDENTITY_LINKED',
        outcome: 'SUCCESS',
      },
      clientType: 'web',
      email: 'invited.google@example.com',
      identityId: INVITED_IDENTITY_ID,
      now: new Date(),
      providerSubject: 'invited-google-subject',
    });

    assert.equal(result.kind, 'invitation_activated');
    const afterMemberships = await database.client.query<{ id: string; status: string }>(`
      select id::text, status::text
      from memberships
      where user_id = '${INVITED_USER_ID}'
      order by id
    `);
    const user = await database.client.query<{ status: string }>(`
      select status::text from users where id = '${INVITED_USER_ID}'
    `);
    const identity = await database.client.query<{
      provider_email_normalized: string;
      subject_normalized: string;
      verified: boolean;
    }>(`
      select provider_email_normalized, subject_normalized, verified_at is not null as verified
      from authentication_identities
      where id = '${INVITED_IDENTITY_ID}'
    `);
    const audit = await database.client.query<{ event_type: string }>(`
      select event_type::text
      from authentication_audit_events
      where user_id = '${INVITED_USER_ID}'
      order by created_at, id
    `);

    assert.deepEqual(beforeMemberships.rows, [{ id: INVITED_MEMBERSHIP_ID, status: 'INVITED' }]);
    assert.deepEqual(afterMemberships.rows, [{ id: INVITED_MEMBERSHIP_ID, status: 'ACTIVE' }]);
    assert.equal(user.rows[0]?.status, 'ACTIVE');
    assert.deepEqual(identity.rows, [
      {
        provider_email_normalized: 'invited.google@example.com',
        subject_normalized: 'invited-google-subject',
        verified: true,
      },
    ]);
    assert.deepEqual(audit.rows.map(({ event_type }) => event_type).sort(), [
      'IDENTITY_LINKED',
      'INVITATION_ACTIVATED',
    ]);
  });

  it('rejects duplicate Google subjects and duplicate providers for one user', async () => {
    await assert.rejects(
      database.client.exec(`
        insert into authentication_identities (
          user_id, provider, provider_key, subject_normalized,
          provider_email_normalized, status, verified_at
        ) values (
          '${DUPLICATE_TARGET_USER_ID}', 'OAUTH', 'GOOGLE', 'google-only-subject',
          'duplicate.target@example.com', 'ACTIVE', now()
        )
      `),
    );

    await assert.rejects(
      database.client.exec(`
        insert into authentication_identities (
          user_id, provider, provider_key, subject_normalized,
          provider_email_normalized, status, verified_at
        ) values (
          '${GOOGLE_ONLY_USER_ID}', 'OAUTH', 'GOOGLE', 'second-google-subject',
          'google.only@example.com', 'ACTIVE', now()
        )
      `),
    );
  });

  it('returns LAST_LOGIN_METHOD when the only alternative OAuth identity is unsupported', async () => {
    assert.deepEqual(
      await store.unlinkGoogleIdentity(
        GOOGLE_ONLY_USER_ID,
        '60000000-0000-4000-8000-000000000001',
        new Date(),
        {
          correlationId: 'real-store-last-method-test',
          eventType: 'IDENTITY_UNLINKED',
          outcome: 'SUCCESS',
          userId: GOOGLE_ONLY_USER_ID,
        },
      ),
      { kind: 'last_login_method' },
    );
    const google = await database.client.query<{ status: string }>(`
      select status::text
      from authentication_identities
      where id = '${GOOGLE_ONLY_IDENTITY_ID}'
    `);
    assert.equal(google.rows[0]?.status, 'ACTIVE');
  });

  it('unlinks Google only after a password method exists and revokes identity-bound sessions', async () => {
    await database.client.exec(`
      insert into authentication_identities (
        user_id, provider, provider_key, subject_normalized, status,
        password_digest, password_salt, password_scrypt_n, password_scrypt_r,
        password_scrypt_p, password_key_length, verified_at
      ) values (
        '${GOOGLE_ONLY_USER_ID}', 'PASSWORD', 'LOCAL', 'google.only@example.com', 'ACTIVE',
        'test-password-digest', 'test-password-salt', 32768, 8, 1, 64, now()
      );

      insert into memberships (
        id, user_id, context_type, agency_id, client_organization_id, role_id,
        status, branch_scope_mode, team_scope_mode, assignment_scope, effective_from
      ) values (
        '${GOOGLE_ONLY_MEMBERSHIP_ID}', '${GOOGLE_ONLY_USER_ID}', 'CLIENT', null, '${CLIENT_ID}',
        (select id from roles where code = 'CLIENT_ADMIN' and application = 'WEB'),
        'ACTIVE', 'ALL', 'ALL', 'ALL', now() - interval '1 minute'
      );

      insert into refresh_sessions (
        id, user_id, authentication_identity_id, current_membership_id, client_type,
        device_platform, expires_at
      ) values (
        '${GOOGLE_ONLY_SESSION_ID}', '${GOOGLE_ONLY_USER_ID}', '${GOOGLE_ONLY_IDENTITY_ID}',
        '${GOOGLE_ONLY_MEMBERSHIP_ID}', 'WEB', 'WEB', now() + interval '1 day'
      );
    `);

    assert.deepEqual(
      await store.unlinkGoogleIdentity(GOOGLE_ONLY_USER_ID, GOOGLE_ONLY_SESSION_ID, new Date(), {
        clientOrganizationId: CLIENT_ID,
        correlationId: 'real-store-unlink-test',
        eventType: 'IDENTITY_UNLINKED',
        membershipId: GOOGLE_ONLY_MEMBERSHIP_ID,
        outcome: 'SUCCESS',
        sessionId: GOOGLE_ONLY_SESSION_ID,
        userId: GOOGLE_ONLY_USER_ID,
      }),
      { currentSessionRevoked: true, kind: 'unlinked' },
    );

    const google = await database.client.query<{ status: string }>(`
      select status::text
      from authentication_identities
      where id = '${GOOGLE_ONLY_IDENTITY_ID}'
    `);
    const session = await database.client.query<{
      revoked: boolean;
      revoked_reason: string | null;
    }>(`
      select revoked_at is not null as revoked, revoked_reason
      from refresh_sessions
      where id = '${GOOGLE_ONLY_SESSION_ID}'
    `);
    const audit = await database.client.query<{ event_type: string; outcome: string }>(`
      select event_type::text, outcome::text
      from authentication_audit_events
      where correlation_id = 'real-store-unlink-test'
    `);

    assert.equal(google.rows[0]?.status, 'DISABLED');
    assert.deepEqual(session.rows, [{ revoked: true, revoked_reason: 'IDENTITY_DISABLED' }]);
    assert.deepEqual(audit.rows, [{ event_type: 'IDENTITY_UNLINKED', outcome: 'SUCCESS' }]);
  });
});
