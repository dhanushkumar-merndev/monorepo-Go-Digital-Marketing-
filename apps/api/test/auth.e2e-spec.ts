import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import {
  apiErrorEnvelopeSchema,
  loginResponseSchema,
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
  type CreateSessionInput,
  type MembershipAccessRecord,
  type SessionAccessRecord,
} from '../src/auth/auth-store.js';
import { PasswordHasher } from '../src/auth/password-hasher.js';
import { AUTH_RATE_LIMIT_STORE } from '../src/auth/authentication-rate-limiter.js';
import { authStoreStub, TEST_AUTH_CONFIG } from './auth-test-fixtures.js';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const IDENTITY_ID = '20000000-0000-4000-8000-000000000001';
const MEMBERSHIP_ID = '30000000-0000-4000-8000-000000000001';
const ROLE_ID = '40000000-0000-4000-8000-000000000001';
const CLIENT_ID = '50000000-0000-4000-8000-000000000001';
const AGENCY_ID = '60000000-0000-4000-8000-000000000001';
const BRANCH_ID = '70000000-0000-4000-8000-000000000001';
const TEAM_ID = '80000000-0000-4000-8000-000000000001';
const OTHER_BRANCH_ID = '70000000-0000-4000-8000-000000000002';
const WEB_ORIGIN = 'http://localhost:3000';
const PASSWORD = 'Correct horse battery staple';

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
  let revoked: boolean;
  let rateLimitAllowed: boolean;
  let rotationAttempts: number;

  const membership: MembershipAccessRecord = {
    assignmentScope: 'ALL',
    branchIds: [BRANCH_ID],
    branchScopeMode: 'SELECTED',
    clientAgencyId: AGENCY_ID,
    clientDisplayName: 'Alpha Motors',
    clientLegalName: 'Alpha Motors Private Limited',
    clientOrganizationId: CLIENT_ID,
    clientStatus: 'ACTIVE',
    clientTimezone: 'Asia/Kolkata',
    contextType: 'CLIENT',
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    id: MEMBERSHIP_ID,
    organizationDisplayName: 'Alpha Motors',
    permissionCodes: [
      'account.profile.read',
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
        clientOrganizationId: CLIENT_ID,
        membershipId: MEMBERSHIP_ID,
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
      AUTH_PASSWORD_PEPPER: TEST_AUTH_CONFIG.passwordPepper,
      AUTH_REFRESH_COOKIE_SAME_SITE: 'lax',
      AUTH_REFRESH_COOKIE_SECURE: 'true',
      AUTH_REFRESH_TOKEN_PEPPER: TEST_AUTH_CONFIG.refreshTokenPepper,
      API_TRUSTED_PROXIES: '',
      CORS_ORIGINS: WEB_ORIGIN,
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/gdm_test',
      LOG_LEVEL: 'silent',
      REDIS_URL: 'redis://127.0.0.1:6379',
      S3_BUCKET: 'gdm-test-private',
      S3_REGION: 'auto',
      WORKER_MODE: 'disabled',
    });
    audits = [];
    createdSession = undefined;
    revoked = false;
    rateLimitAllowed = true;
    rotationAttempts = 0;
    rotationMode = 'rotated';
    userStatus = 'ACTIVE';
    const passwordHash = await new PasswordHasher().hash(PASSWORD, TEST_AUTH_CONFIG.passwordPepper);
    const store = authStoreStub({
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
            displayName: 'Diya Client Admin',
            email: 'client.admin@example.com',
            membershipId: MEMBERSHIP_ID,
            membershipStatus: 'ACTIVE',
            roleCode: 'CLIENT_ADMIN',
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
      .compile();
    application = testingModule.createNestApplication();
    configureApplication(application, { enableShutdownHooks: false, openApi: false });
    await application.init();
  });

  afterEach(async () => {
    await application.close();
  });

  async function login(): Promise<request.Response> {
    return request(application.getHttpServer())
      .post('/v1/auth/login')
      .set('origin', WEB_ORIGIN)
      .send({
        client_type: 'web',
        email: 'client.admin@example.com',
        password: PASSWORD,
      })
      .expect(200);
  }

  it('creates a cookie-backed web session and serves live profile context', async () => {
    const response = await login();
    const parsed = loginResponseSchema.parse(response.body);
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
    const loggedIn = loginResponseSchema.parse((await login()).body);
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
    await request(application.getHttpServer())
      .post('/v1/auth/login')
      .set('origin', WEB_ORIGIN)
      .set('x-forwarded-for', '203.0.113.77')
      .send({
        client_type: 'web',
        email: 'client.admin@example.com',
        password: PASSWORD,
      })
      .expect(200);

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
