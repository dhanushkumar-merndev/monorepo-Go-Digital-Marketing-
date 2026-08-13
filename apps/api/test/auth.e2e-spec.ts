import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import {
  apiErrorEnvelopeSchema,
  loginAuthenticatedResponseSchema,
  meResponseSchema,
  refreshResponseSchema,
} from '@gdm/contracts';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/application.js';
import {
  AUTH_STORE,
  type AuthenticationAuditInput,
  type AuthenticationIdentityRecord,
  type CreateExternalAuthChallengeInput,
  type CreateSessionInput,
  type MembershipAccessRecord,
  type MfaAuthenticatorRecord,
  type MfaLoginChallengeRecord,
  type SessionAccessRecord,
} from '../src/auth/auth-store.js';
import { PasswordHasher } from '../src/auth/password-hasher.js';
import { AUTH_RATE_LIMIT_STORE } from '../src/auth/authentication-rate-limiter.js';
import { GOOGLE_IDENTITY_PROVIDER } from '../src/auth/identity-provider.port.js';
import { MfaSecretProtector } from '../src/auth/mfa-secret-protector.js';
import { decodeBase32, generateTotp } from '../src/auth/totp.service.js';
import { authStoreStub, TEST_AUTH_CONFIG } from './auth-test-fixtures.js';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const IDENTITY_ID = '20000000-0000-4000-8000-000000000001';
const MEMBERSHIP_ID = '30000000-0000-4000-8000-000000000001';
const ROLE_ID = '40000000-0000-4000-8000-000000000001';
const CLIENT_ID = '50000000-0000-4000-8000-000000000001';
const OTHER_CLIENT_ID = '50000000-0000-4000-8000-000000000002';
const AGENCY_ID = '60000000-0000-4000-8000-000000000001';
const BRANCH_ID = '70000000-0000-4000-8000-000000000001';
const DEPARTMENT_ID = '75000000-0000-4000-8000-000000000001';
const TEAM_ID = '80000000-0000-4000-8000-000000000001';
const OTHER_BRANCH_ID = '70000000-0000-4000-8000-000000000002';
const OTHER_TEAM_ID = '80000000-0000-4000-8000-000000000002';
const WEB_ORIGIN = 'http://localhost:3000';
const PASSWORD = 'Correct horse battery staple';

// Two-step verification is mandatory for every role. These fixtures give the
// test user a pre-enrolled TOTP authenticator so `login()` can complete the
// real login -> MFA_REQUIRED -> verify flow instead of bypassing it.
const AUTHENTICATOR_ID = '90000000-0000-4000-8000-000000000001';
const MFA_SECRET = 'JBSWY3DPEHPK3PXP';
const mfaSecretProtector = new MfaSecretProtector(
  TEST_AUTH_CONFIG.mfaActiveKeyId,
  TEST_AUTH_CONFIG.mfaEncryptionKeys,
);
const protectedMfaSecret = mfaSecretProtector.protect(MFA_SECRET, `${USER_ID}:${AUTHENTICATOR_ID}`);

function totpCodeFor(secret: string, at: Date = new Date()): string {
  return generateTotp(decodeBase32(secret), Math.floor(at.getTime() / 1_000 / 30));
}

function cookieFrom(response: request.Response): string {
  const values = response.headers['set-cookie'];
  const first = Array.isArray(values) ? values[0] : values;
  assert.equal(typeof first, 'string');
  return first.split(';', 1)[0] ?? '';
}

function setCookieHeader(response: request.Response): string {
  const values = response.headers['set-cookie'];
  const first = Array.isArray(values) ? values[0] : values;
  assert.equal(typeof first, 'string');
  return first;
}

function tokenFromCookie(cookie: string): string {
  const separator = cookie.indexOf('=');
  assert.notEqual(separator, -1);
  return decodeURIComponent(cookie.slice(separator + 1));
}

describe('Phase 1 authentication and authorization (HTTP integration)', () => {
  let application: INestApplication;
  let audits: AuthenticationAuditInput[];
  let userStatus: 'ACTIVE' | 'SUSPENDED';
  let rotationMode: 'reused' | 'rotated' | 'user_inactive';
  let createdSession: CreateSessionInput | undefined;
  let externalChallenge: CreateExternalAuthChallengeInput | undefined;
  let mfaChallenge: MfaLoginChallengeRecord | undefined;
  let revoked: boolean;
  let rateLimitAllowed: boolean;
  let rotationAttempts: number;

  const authenticationIdentity: AuthenticationIdentityRecord = {
    email: 'client.admin@example.com',
    id: IDENTITY_ID,
    status: 'ACTIVE',
    userDisplayName: 'Diya Client Admin',
    userId: USER_ID,
    userStatus: 'ACTIVE',
  };

  const mfaAuthenticator: MfaAuthenticatorRecord = {
    id: AUTHENTICATOR_ID,
    secretAuthTag: protectedMfaSecret.tag,
    secretCiphertext: protectedMfaSecret.ciphertext,
    secretKeyId: protectedMfaSecret.keyId,
    secretNonce: protectedMfaSecret.nonce,
    status: 'ACTIVE',
    unusedRecoveryCodeCount: 0,
    userId: USER_ID,
  };

  const membership: MembershipAccessRecord = {
    assignmentScope: 'ALL',
    branchIds: [BRANCH_ID],
    branchScopeMode: 'SELECTED',
    departmentIds: [DEPARTMENT_ID],
    departmentScopeMode: 'SELECTED',
    clientAgencyId: AGENCY_ID,
    clientDisplayName: 'Alpha Motors',
    clientLegalName: 'Alpha Motors Private Limited',
    clientOrganizationId: CLIENT_ID,
    clientStatus: 'ACTIVE',
    clientTimezone: 'Asia/Kolkata',
    contextType: 'CLIENT',
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    id: MEMBERSHIP_ID,
    managedTeamIds: [],
    organizationDisplayName: 'Alpha Motors',
    permissionCodes: [
      'account.profile.read',
      'account.profile.update',
      'account.sessions.read',
      'account.sessions.revoke',
      'account.tenant.select',
      'organization.branches.read',
      'organization.teams.read',
      'organization.users.read',
    ],
    roleApplication: 'WEB',
    roleCode: 'CLIENT_ADMIN',
    roleDisplayName: 'Client Admin',
    roleId: ROLE_ID,
    status: 'ACTIVE',
    teamIds: [TEAM_ID],
    teamScopeMode: 'SELECTED',
    userId: USER_ID,
  };

  function activeSession(): SessionAccessRecord {
    assert.ok(createdSession);
    return {
      context: {
        assignmentScope: membership.assignmentScope,
        branchIds: new Set(membership.branchIds),
        branchScopeMode: membership.branchScopeMode,
        departmentIds: new Set(membership.departmentIds),
        departmentScopeMode: membership.departmentScopeMode,
        clientOrganizationId: CLIENT_ID,
        membershipId: MEMBERSHIP_ID,
        managedTeamIds: new Set(membership.managedTeamIds),
        permissionCodes: new Set(membership.permissionCodes),
        roleCode: membership.roleCode,
        sessionId: createdSession.sessionId,
        teamIds: new Set(membership.teamIds),
        teamScopeMode: membership.teamScopeMode,
        userId: USER_ID,
      },
      membership,
      session: {
        clientType: createdSession.clientType,
        createdAt: createdSession.refreshToken.issuedAt,
        current: true,
        deviceId: createdSession.device.deviceId,
        deviceName: createdSession.device.deviceName,
        expiresAt: createdSession.expiresAt,
        id: createdSession.sessionId,
        lastSeenAt: createdSession.refreshToken.issuedAt,
        platform: createdSession.device.platform,
      },
      sessionExpiresAt: createdSession.expiresAt,
      userDisplayName: 'Diya Client Admin',
      userEmail: 'client.admin@example.com',
      userStatus,
    };
  }

  beforeEach(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      API_HOST: '127.0.0.1',
      API_PORT: '4001',
      AUTH_ACCESS_TOKEN_SECRET: TEST_AUTH_CONFIG.accessTokenSecret,
      AUTH_MFA_ACTIVE_KEY_ID: TEST_AUTH_CONFIG.mfaActiveKeyId,
      AUTH_MFA_CHALLENGE_PEPPER: TEST_AUTH_CONFIG.mfaChallengePepper,
      AUTH_MFA_ENCRYPTION_KEYS: JSON.stringify(TEST_AUTH_CONFIG.mfaEncryptionKeys),
      AUTH_MFA_RECOVERY_CODE_PEPPER: TEST_AUTH_CONFIG.mfaRecoveryCodePepper,
      AUTH_PASSWORD_PEPPER: TEST_AUTH_CONFIG.passwordPepper,
      AUTH_REFRESH_COOKIE_SAME_SITE: 'lax',
      AUTH_REFRESH_COOKIE_SECURE: 'true',
      AUTH_REFRESH_TOKEN_PEPPER: TEST_AUTH_CONFIG.refreshTokenPepper,
      API_TRUSTED_PROXIES: '',
      CORS_ORIGINS: WEB_ORIGIN,
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/gdm_test',
      GOOGLE_AUTH_WEB_CLIENT_ID: TEST_AUTH_CONFIG.googleClientIds[0],
      LOG_LEVEL: 'silent',
      REDIS_URL: 'redis://127.0.0.1:6379',
      S3_BUCKET: 'gdm-test-private',
      S3_REGION: 'auto',
      WORKER_MODE: 'disabled',
    });
    audits = [];
    createdSession = undefined;
    externalChallenge = undefined;
    mfaChallenge = undefined;
    revoked = false;
    rateLimitAllowed = true;
    rotationAttempts = 0;
    rotationMode = 'rotated';
    userStatus = 'ACTIVE';
    const passwordHash = await new PasswordHasher().hash(PASSWORD, TEST_AUTH_CONFIG.passwordPepper);
    const store = authStoreStub({
      consumeExternalAuthChallenge: (input) => {
        const challenge = externalChallenge;
        externalChallenge = undefined;
        return Promise.resolve(
          challenge &&
            challenge.id === input.challengeId &&
            challenge.purpose === input.purpose &&
            (input.clientType === undefined || challenge.clientType === input.clientType) &&
            (input.userId === undefined || challenge.userId === input.userId) &&
            (input.sessionId === undefined || challenge.sessionId === input.sessionId)
            ? { clientType: challenge.clientType, nonceHash: challenge.nonceHash }
            : undefined,
        );
      },
      createExternalAuthChallenge: (input) => {
        externalChallenge = input;
        return Promise.resolve();
      },
      completeMfaTotpVerification: (input) => {
        if (mfaChallenge && mfaChallenge.id === input.challengeId) {
          mfaChallenge = { ...mfaChallenge, consumedAt: input.completedAt };
        }
        return Promise.resolve(true);
      },
      createMfaLoginChallenge: (input) => {
        const { audit: _audit, ...rest } = input;
        mfaChallenge = { ...rest, failedAttemptCount: 0 };
        return Promise.resolve();
      },
      createSession: (input) => {
        createdSession = input;
        return Promise.resolve();
      },
      findPasswordIdentity: () =>
        Promise.resolve({
          email: 'client.admin@example.com',
          failedAttempts: 0,
          id: IDENTITY_ID,
          passwordHash,
          status: 'ACTIVE',
          userDisplayName: 'Diya Client Admin',
          userId: USER_ID,
          userStatus,
        }),
      getBranch: (clientOrganizationId, branchId) =>
        Promise.resolve(
          clientOrganizationId === CLIENT_ID && branchId === BRANCH_ID
            ? {
                active: true,
                clientOrganizationId: CLIENT_ID,
                code: 'ALPHA_MAIN',
                id: BRANCH_ID,
                name: 'Alpha Main',
                timezone: 'Asia/Kolkata',
              }
            : undefined,
        ),
      getActiveMfaAuthenticator: (userId) =>
        Promise.resolve(userId === USER_ID ? mfaAuthenticator : undefined),
      getAuthenticationIdentity: (identityId) =>
        Promise.resolve(identityId === IDENTITY_ID ? authenticationIdentity : undefined),
      getMembership: (userId, membershipId) =>
        Promise.resolve(
          userId === USER_ID && membershipId === MEMBERSHIP_ID ? membership : undefined,
        ),
      getMfaAuthenticator: (userId, authenticatorId) =>
        Promise.resolve(
          userId === USER_ID && authenticatorId === AUTHENTICATOR_ID ? mfaAuthenticator : undefined,
        ),
      getMfaLoginChallenge: (challengeId) =>
        Promise.resolve(mfaChallenge && mfaChallenge.id === challengeId ? mfaChallenge : undefined),
      getSessionClientType: (userId, sessionId) =>
        Promise.resolve(
          createdSession && userId === USER_ID && sessionId === createdSession.sessionId
            ? createdSession.clientType
            : undefined,
        ),
      listAvailableMemberships: () => Promise.resolve([membership]),
      listBranches: () =>
        Promise.resolve([
          {
            active: true,
            clientOrganizationId: CLIENT_ID,
            code: 'ALPHA_MAIN',
            id: BRANCH_ID,
            name: 'Alpha Main',
            timezone: 'Asia/Kolkata',
          },
        ]),
      listTenantUsers: (clientOrganizationId) => {
        assert.equal(clientOrganizationId, CLIENT_ID);
        return Promise.resolve([
          {
            branchIds: [BRANCH_ID],
            branchScopeMode: 'SELECTED',
            departmentIds: [DEPARTMENT_ID],
            departmentScopeMode: 'SELECTED',
            displayName: 'Diya Client Admin',
            email: 'client.admin@example.com',
            membershipId: MEMBERSHIP_ID,
            membershipStatus: 'ACTIVE',
            jobTitle: 'CRM Admin',
            roleCode: 'CLIENT_ADMIN',
            managedTeamIds: [],
            teamIds: [TEAM_ID],
            teamScopeMode: 'SELECTED',
            userId: USER_ID,
            userStatus: 'ACTIVE',
          },
        ]);
      },
      recordAuthenticationAudit: (audit) => {
        audits.push(audit);
        return Promise.resolve();
      },
      resolveGoogleLoginIdentity: () =>
        Promise.resolve({
          identity: {
            email: 'client.admin@example.com',
            id: IDENTITY_ID,
            providerEmail: 'client.admin@example.com',
            status: 'ACTIVE',
            userDisplayName: 'Diya Client Admin',
            userId: USER_ID,
            userStatus,
          },
          kind: 'identity',
        }),
      resolveSession: (sessionId, membershipId) =>
        Promise.resolve(
          !revoked &&
            createdSession !== undefined &&
            sessionId === createdSession.sessionId &&
            membershipId === MEMBERSHIP_ID &&
            userStatus === 'ACTIVE'
            ? { kind: 'active', value: activeSession() }
            : userStatus !== 'ACTIVE'
              ? { kind: 'user_inactive', userId: USER_ID }
              : { kind: 'session_revoked', userId: USER_ID },
        ),
      revokeByRefreshToken: () => {
        revoked = true;
        return Promise.resolve(true);
      },
      rotateRefreshToken: () => {
        rotationAttempts += 1;
        return Promise.resolve(
          rotationMode === 'rotated'
            ? { kind: 'rotated', sequence: 2, session: activeSession() }
            : rotationMode === 'reused'
              ? {
                  kind: 'reused',
                  ...(createdSession ? { sessionId: createdSession.sessionId } : {}),
                  userId: USER_ID,
                }
              : {
                  kind: 'user_inactive',
                  ...(createdSession ? { sessionId: createdSession.sessionId } : {}),
                  userId: USER_ID,
                },
        );
      },
    });
    const testingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_STORE)
      .useValue(store)
      .overrideProvider(AUTH_RATE_LIMIT_STORE)
      .useValue({ consume: () => Promise.resolve(rateLimitAllowed) })
      .overrideProvider(GOOGLE_IDENTITY_PROVIDER)
      .useValue({
        verifyIdToken: () =>
          Promise.resolve({
            email: 'client.admin@example.com',
            providerSubject: 'google-provider-subject',
          }),
      })
      .compile();
    application = testingModule.createNestApplication();
    configureApplication(application, { enableShutdownHooks: false, openApi: false });
    await application.init();
  });

  afterEach(async () => {
    await application.close();
  });

  // Two-step verification is mandatory for every role, so a password/Google
  // login now always returns an MFA_REQUIRED challenge rather than an
  // authenticated session directly. Completes it with the pre-enrolled
  // fixture authenticator's real TOTP code.
  async function completeMfa(challengeResponse: request.Response): Promise<request.Response> {
    assert.equal(challengeResponse.body.status, 'MFA_REQUIRED');
    return request(application.getHttpServer())
      .post('/v1/auth/mfa/verify')
      .set('origin', WEB_ORIGIN)
      .send({
        challenge_token: challengeResponse.body.challenge_token,
        code: totpCodeFor(MFA_SECRET),
        method: 'TOTP',
      })
      .expect(200);
  }

  async function login(): Promise<request.Response> {
    const challengeResponse = await request(application.getHttpServer())
      .post('/v1/auth/login')
      .set('origin', WEB_ORIGIN)
      .send({
        client_type: 'web',
        email: 'client.admin@example.com',
        password: PASSWORD,
      })
      .expect(200);
    return completeMfa(challengeResponse);
  }

  it('creates a cookie-backed web session and serves live profile context', async () => {
    const response = await login();
    const parsed = loginAuthenticatedResponseSchema.parse(response.body);
    assert.equal(parsed.refresh_token, undefined);
    assert.match(cookieFrom(response), /^gdm_refresh=/u);
    assert.match(setCookieHeader(response), /Path=\/v1\/auth/iu);
    assert.match(setCookieHeader(response), /HttpOnly/iu);
    assert.match(setCookieHeader(response), /Secure/iu);
    assert.match(setCookieHeader(response), /SameSite=Lax/iu);
    assert.equal(response.headers['cache-control'], 'no-store');

    const me = await request(application.getHttpServer())
      .get('/v1/me')
      .set('authorization', `Bearer ${parsed.access_token}`)
      .expect(200);
    assert.equal(me.body.active_membership.client_organization.id, CLIENT_ID);
    assert.equal(me.headers['cache-control'], 'no-store');
    meResponseSchema.parse(me.body);
  });

  it('creates the same cookie-backed CRM session after Google login and preserves tenant scope', async () => {
    const challenge = await request(application.getHttpServer())
      .post('/v1/auth/google/challenge')
      .set('origin', WEB_ORIGIN)
      .send({ client_type: 'web' })
      .expect(200);
    assert.match(challenge.body.nonce, /^[0-9a-f]{64}$/u);

    const challengeResponse = await request(application.getHttpServer())
      .post('/v1/auth/google/login')
      .set('origin', WEB_ORIGIN)
      .send({
        challenge_id: challenge.body.challenge_id,
        client_type: 'web',
        id_token: 'signed-google-id-token',
      })
      .expect(200);
    const response = await completeMfa(challengeResponse);
    const parsed = loginAuthenticatedResponseSchema.parse(response.body);
    assert.equal(parsed.refresh_token, undefined);
    assert.match(setCookieHeader(response), /HttpOnly/iu);
    assert.equal(createdSession?.authenticationIdentityId, IDENTITY_ID);
    assert.equal(createdSession?.audit.metadata?.provider, 'GOOGLE');

    const denied = await request(application.getHttpServer())
      .get(`/v1/branches/${OTHER_BRANCH_ID}`)
      .set('x-client-organization-id', OTHER_CLIENT_ID)
      .set('authorization', `Bearer ${parsed.access_token}`)
      .expect(403);
    assert.equal(denied.body.error.code, 'SCOPE_DENIED');

    const deniedTeam = await request(application.getHttpServer())
      .get(`/v1/teams/${OTHER_TEAM_ID}`)
      .set('x-client-organization-id', OTHER_CLIENT_ID)
      .set('authorization', `Bearer ${parsed.access_token}`)
      .expect(403);
    assert.equal(deniedTeam.body.error.code, 'SCOPE_DENIED');

    const tenantUsers = await request(application.getHttpServer())
      .get('/v1/users')
      .set('x-client-organization-id', OTHER_CLIENT_ID)
      .set('authorization', `Bearer ${parsed.access_token}`)
      .expect(200);
    assert.deepEqual(
      tenantUsers.body.users.map((user: { user_id: string }) => user.user_id),
      [USER_ID],
    );

    const linkChallenge = await request(application.getHttpServer())
      .post('/v1/auth/google/link-challenge')
      .set('authorization', `Bearer ${parsed.access_token}`)
      .send({})
      .expect(200);
    assert.equal(externalChallenge?.clientType, 'web');
    assert.equal(externalChallenge?.sessionId, createdSession?.sessionId);
    assert.equal(linkChallenge.body.challenge_id, externalChallenge?.id);
  });

  it('rotates a browser refresh cookie and rejects reuse distinctly', async () => {
    const loginResponse = await login();
    const oldCookie = cookieFrom(loginResponse);
    const refreshed = await request(application.getHttpServer())
      .post('/v1/auth/refresh')
      .set('cookie', oldCookie)
      .set('origin', WEB_ORIGIN)
      .send({})
      .expect(200);
    refreshResponseSchema.parse(refreshed.body);
    assert.notEqual(cookieFrom(refreshed), oldCookie);

    rotationMode = 'reused';
    const replay = await request(application.getHttpServer())
      .post('/v1/auth/refresh')
      .set('cookie', oldCookie)
      .set('origin', WEB_ORIGIN)
      .send({})
      .expect(401);
    assert.equal(replay.body.error.code, 'REFRESH_TOKEN_REUSED');
    assert.match(setCookieHeader(replay), /^gdm_refresh=;/u);
    assert.match(setCookieHeader(replay), /Path=\/v1\/auth/iu);
    assert.match(setCookieHeader(replay), /HttpOnly/iu);
    assert.match(setCookieHeader(replay), /Secure/iu);
    assert.match(setCookieHeader(replay), /SameSite=Lax/iu);
    apiErrorEnvelopeSchema.parse(replay.body);
  });

  it('returns the replacement token for body transport and rejects mixed transports before rotation', async () => {
    const loggedIn = await login();
    const cookie = cookieFrom(loggedIn);
    const originalToken = tokenFromCookie(cookie);

    const bodyRefresh = await request(application.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refresh_token: originalToken })
      .expect(200);
    const parsed = refreshResponseSchema.parse(bodyRefresh.body);
    assert.equal(typeof parsed.refresh_token, 'string');
    assert.notEqual(parsed.refresh_token, originalToken);
    assert.equal(bodyRefresh.headers['set-cookie'], undefined);

    const attemptsBeforeAmbiguousRequest = rotationAttempts;
    const ambiguous = await request(application.getHttpServer())
      .post('/v1/auth/refresh')
      .set('cookie', cookie)
      .set('origin', WEB_ORIGIN)
      .send({ refresh_token: originalToken })
      .expect(400);
    assert.equal(ambiguous.body.error.code, 'VALIDATION_ERROR');
    assert.equal(rotationAttempts, attemptsBeforeAmbiguousRequest);
  });

  it('blocks suspended login and refresh attempts', async () => {
    userStatus = 'SUSPENDED';
    const blockedLogin = await request(application.getHttpServer())
      .post('/v1/auth/login')
      .set('origin', WEB_ORIGIN)
      .send({
        client_type: 'web',
        email: 'client.admin@example.com',
        password: PASSWORD,
      })
      .expect(403);
    assert.equal(blockedLogin.body.error.code, 'ACCOUNT_SUSPENDED');

    userStatus = 'ACTIVE';
    const loggedIn = await login();
    userStatus = 'SUSPENDED';
    rotationMode = 'user_inactive';
    const blockedRefresh = await request(application.getHttpServer())
      .post('/v1/auth/refresh')
      .set('cookie', cookieFrom(loggedIn))
      .set('origin', WEB_ORIGIN)
      .send({})
      .expect(403);
    assert.equal(blockedRefresh.body.error.code, 'ACCOUNT_SUSPENDED');
    assert.match(setCookieHeader(blockedRefresh), /^gdm_refresh=;/u);
  });

  it('denies another branch and derives tenant scope solely from the live session', async () => {
    const loggedIn = loginAuthenticatedResponseSchema.parse((await login()).body);
    const denied = await request(application.getHttpServer())
      .get(`/v1/branches/${OTHER_BRANCH_ID}`)
      .set('authorization', `Bearer ${loggedIn.access_token}`)
      .expect(403);
    assert.equal(denied.body.error.code, 'SCOPE_DENIED');

    const users = await request(application.getHttpServer())
      .get('/v1/users')
      .set('authorization', `Bearer ${loggedIn.access_token}`)
      .expect(200);
    assert.equal(users.headers['cache-control'], 'no-store');
    assert.deepEqual(
      users.body.users.map((user: { user_id: string }) => user.user_id),
      [USER_ID],
    );
    assert.equal(
      audits.some((audit) => audit.eventType === 'ACCESS_DENIED'),
      true,
    );
  });

  it('rejects cookie-auth commands from an untrusted browser origin', async () => {
    await request(application.getHttpServer())
      .post('/v1/auth/login')
      .set('origin', 'https://attacker.example')
      .send({
        client_type: 'web',
        email: 'client.admin@example.com',
        password: PASSWORD,
      })
      .expect(403);
  });

  it('does not trust a caller-supplied forwarded address without an explicit proxy allowlist', async () => {
    const challengeResponse = await request(application.getHttpServer())
      .post('/v1/auth/login')
      .set('origin', WEB_ORIGIN)
      .set('x-forwarded-for', '203.0.113.77')
      .send({
        client_type: 'web',
        email: 'client.admin@example.com',
        password: PASSWORD,
      })
      .expect(200);
    await completeMfa(challengeResponse);

    assert.ok(createdSession?.device.sourceIp);
    assert.notEqual(createdSession.device.sourceIp, '203.0.113.77');
  });

  it('returns the standard error envelope when authentication is rate limited', async () => {
    rateLimitAllowed = false;
    const response = await request(application.getHttpServer())
      .post('/v1/auth/login')
      .set('origin', WEB_ORIGIN)
      .send({
        client_type: 'web',
        email: 'client.admin@example.com',
        password: PASSWORD,
      })
      .expect(429);

    assert.equal(response.body.error.code, 'RATE_LIMITED');
    assert.equal(response.body.error.retryable, true);
    apiErrorEnvelopeSchema.parse(response.body);
  });

  it('validates shared request contracts even when tests omit decorator metadata', async () => {
    const response = await request(application.getHttpServer())
      .post('/v1/auth/login')
      .set('origin', WEB_ORIGIN)
      .send({ client_type: 'web', email: 'not-an-email', password: '' })
      .expect(400);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    assert.equal(
      response.body.error.details.some((detail: { field?: string }) => detail.field === 'email'),
      true,
    );
  });

  it('logs out using refresh proof and clears the cookie without a live access token', async () => {
    const loggedIn = await login();
    const response = await request(application.getHttpServer())
      .post('/v1/auth/logout')
      .set('cookie', cookieFrom(loggedIn))
      .set('origin', WEB_ORIGIN)
      .send({})
      .expect(200);
    assert.deepEqual(response.body, { logged_out: true });
    assert.match(setCookieHeader(response), /^gdm_refresh=;/u);
    assert.match(setCookieHeader(response), /Path=\/v1\/auth/iu);
    assert.match(setCookieHeader(response), /HttpOnly/iu);
    assert.match(setCookieHeader(response), /Secure/iu);
    assert.match(setCookieHeader(response), /SameSite=Lax/iu);
    assert.equal(revoked, true);
  });

  it('rejects ambiguous logout credentials and does not clear cookies for body-only logout', async () => {
    const loggedIn = await login();
    const cookie = cookieFrom(loggedIn);
    const token = tokenFromCookie(cookie);

    await request(application.getHttpServer())
      .post('/v1/auth/logout')
      .set('cookie', cookie)
      .set('origin', WEB_ORIGIN)
      .send({ refresh_token: token })
      .expect(400);
    assert.equal(revoked, false);

    const bodyLogout = await request(application.getHttpServer())
      .post('/v1/auth/logout')
      .send({ refresh_token: token })
      .expect(200);
    assert.equal(bodyLogout.headers['set-cookie'], undefined);
    assert.equal(revoked, true);
  });
});
