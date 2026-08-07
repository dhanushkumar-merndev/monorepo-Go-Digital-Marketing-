import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpException } from '@nestjs/common';
import type { GoogleLoginRequest } from '@gdm/contracts';
import { AccessTokenService } from '../src/auth/access-token.service.js';
import type {
  AuthenticationAuditInput,
  ConsumedExternalAuthChallenge,
  CreateSessionInput,
  GoogleIdentityRecord,
  MembershipAccessRecord,
  SessionAccessRecord,
} from '../src/auth/auth-store.js';
import { AuthenticationService } from '../src/auth/authentication.service.js';
import { GoogleAuthenticationService } from '../src/auth/google-authentication.service.js';
import type {
  GoogleIdentityProviderPort,
  VerifiedGoogleIdentity,
} from '../src/auth/identity-provider.port.js';
import { PasswordHasher } from '../src/auth/password-hasher.js';
import type { PasswordResetDeliveryPort } from '../src/auth/password-reset-delivery.port.js';
import type { AuthorizationContext } from '../src/authorization/authorization.types.js';
import { authStoreStub, TEST_AUTH_CONFIG } from './auth-test-fixtures.js';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const IDENTITY_ID = '20000000-0000-4000-8000-000000000001';
const MEMBERSHIP_ID = '30000000-0000-4000-8000-000000000001';
const ROLE_ID = '40000000-0000-4000-8000-000000000001';
const CLIENT_ID = '50000000-0000-4000-8000-000000000001';
const AGENCY_ID = '60000000-0000-4000-8000-000000000001';
const SESSION_ID = '70000000-0000-4000-8000-000000000001';
const CHALLENGE_ID = '80000000-0000-4000-8000-000000000001';
const metadata = { correlationId: 'google-auth-test', sourceIp: '127.0.0.1' };
const profile: VerifiedGoogleIdentity = {
  email: 'invited.user@example.com',
  providerSubject: 'google-provider-subject',
};
const identity: GoogleIdentityRecord = {
  email: profile.email,
  id: IDENTITY_ID,
  providerEmail: profile.email,
  status: 'ACTIVE',
  userDisplayName: 'Invited User',
  userId: USER_ID,
  userStatus: 'ACTIVE',
};
const loginInput: GoogleLoginRequest = {
  challenge_id: CHALLENGE_ID,
  client_type: 'web',
  id_token: 'signed-google-id-token',
};

const membership: MembershipAccessRecord = {
  assignmentScope: 'ALL',
  branchIds: [],
  branchScopeMode: 'ALL',
  departmentIds: [],
  departmentScopeMode: 'ALL',
  clientAgencyId: AGENCY_ID,
  clientDisplayName: 'Invited Motors',
  clientLegalName: 'Invited Motors Private Limited',
  clientOrganizationId: CLIENT_ID,
  clientStatus: 'ACTIVE',
  clientTimezone: 'Asia/Kolkata',
  contextType: 'CLIENT',
  effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
  id: MEMBERSHIP_ID,
  managedTeamIds: [],
  organizationDisplayName: 'Invited Motors',
  permissionCodes: ['account.profile.read'],
  roleApplication: 'WEB',
  roleCode: 'CLIENT_ADMIN',
  roleDisplayName: 'Client Admin',
  roleId: ROLE_ID,
  status: 'ACTIVE',
  teamIds: [],
  teamScopeMode: 'ALL',
  userId: USER_ID,
};

const authorization: AuthorizationContext = {
  assignmentScope: 'ALL',
  branchIds: new Set(),
  branchScopeMode: 'ALL',
  departmentIds: new Set(),
  departmentScopeMode: 'ALL',
  clientOrganizationId: CLIENT_ID,
  membershipId: MEMBERSHIP_ID,
  managedTeamIds: new Set(),
  permissionCodes: new Set(['account.profile.read', 'account.profile.update']),
  roleCode: 'CLIENT_ADMIN',
  sessionId: SESSION_ID,
  teamIds: new Set(),
  teamScopeMode: 'ALL',
  userId: USER_ID,
};

function exceptionCode(error: unknown): string | undefined {
  if (!(error instanceof HttpException)) return undefined;
  const response = error.getResponse();
  return typeof response === 'object' && response !== null && 'code' in response
    ? String(response.code)
    : undefined;
}

function googleProvider(value: VerifiedGoogleIdentity = profile): GoogleIdentityProviderPort {
  return { verifyIdToken: () => Promise.resolve(value) };
}

function consumedChallenge(): ConsumedExternalAuthChallenge {
  return { clientType: 'web' as const, nonceHash: 'a'.repeat(64) };
}

function mockedAuthentication(
  onCreate?: (provider: 'GOOGLE' | 'PASSWORD') => void,
): AuthenticationService {
  return {
    createIdentitySession: (
      _identity: GoogleIdentityRecord,
      _input: GoogleLoginRequest,
      _metadata: typeof metadata,
      provider: 'GOOGLE' | 'PASSWORD',
    ) => {
      onCreate?.(provider);
      return Promise.resolve({
        payload: { status: 'AUTHENTICATED' as const },
        refreshToken: 'crm-refresh-token',
      });
    },
  } as unknown as AuthenticationService;
}

function realAuthentication(store: ReturnType<typeof authStoreStub>): AuthenticationService {
  const delivery: PasswordResetDeliveryPort = { deliver: () => Promise.resolve() };
  return new AuthenticationService(
    store,
    TEST_AUTH_CONFIG,
    new PasswordHasher(),
    new AccessTokenService(TEST_AUTH_CONFIG),
    delivery,
  );
}

describe('GoogleAuthenticationService account provisioning and sessions', () => {
  it('activates a valid invited Google user and creates the CRM refresh session', async () => {
    let createdSession: CreateSessionInput | undefined;
    let loginSuccessIdentityId: string | undefined;
    const store = authStoreStub({
      consumeExternalAuthChallenge: () => Promise.resolve(consumedChallenge()),
      createSession: (input) => {
        createdSession = input;
        return Promise.resolve();
      },
      listAvailableMemberships: () => Promise.resolve([membership]),
      recordLoginSuccess: (identityId) => {
        loginSuccessIdentityId = identityId;
        return Promise.resolve();
      },
      resolveGoogleLoginIdentity: () => Promise.resolve({ identity, kind: 'invitation_activated' }),
      resolveSession: (sessionId, membershipId) => {
        assert.ok(createdSession);
        const value: SessionAccessRecord = {
          context: {
            ...authorization,
            membershipId,
            sessionId,
          },
          membership,
          session: {
            clientType: createdSession.clientType,
            createdAt: createdSession.refreshToken.issuedAt,
            current: true,
            deviceId: createdSession.device.deviceId,
            deviceName: createdSession.device.deviceName,
            expiresAt: createdSession.expiresAt,
            id: sessionId,
            lastSeenAt: createdSession.refreshToken.issuedAt,
            platform: createdSession.device.platform,
          },
          sessionExpiresAt: createdSession.expiresAt,
          userDisplayName: identity.userDisplayName,
          userEmail: identity.email,
          userStatus: 'ACTIVE',
        };
        return Promise.resolve({ kind: 'active', value });
      },
    });
    const service = new GoogleAuthenticationService(
      store,
      TEST_AUTH_CONFIG,
      realAuthentication(store),
      googleProvider(),
    );

    const result = await service.login(loginInput, metadata);

    assert.equal(result.payload.status, 'AUTHENTICATED');
    assert.equal(typeof result.refreshToken, 'string');
    assert.ok(result.refreshToken.length > 20);
    assert.equal(createdSession?.authenticationIdentityId, IDENTITY_ID);
    assert.equal(createdSession?.membershipId, MEMBERSHIP_ID);
    assert.equal(createdSession?.audit.metadata?.provider, 'GOOGLE');
    assert.equal(loginSuccessIdentityId, IDENTITY_ID);
  });

  for (const scenario of [
    ['unknown Google user', 'not_invited', 'GOOGLE_ACCOUNT_NOT_INVITED'],
    ['disabled user', 'account_disabled', 'ACCOUNT_DISABLED'],
    ['suspended tenant', 'client_inactive', 'CLIENT_INACTIVE'],
    [
      'existing local account requiring controlled linking',
      'account_linking_required',
      'GOOGLE_ACCOUNT_LINKING_REQUIRED',
    ],
  ] as const) {
    it(`rejects an ${scenario[0]} without creating a session`, async () => {
      let sessionCreated = false;
      const store = authStoreStub({
        consumeExternalAuthChallenge: () => Promise.resolve(consumedChallenge()),
        resolveGoogleLoginIdentity: () => Promise.resolve({ kind: scenario[1] }),
      });
      const service = new GoogleAuthenticationService(
        store,
        TEST_AUTH_CONFIG,
        mockedAuthentication(() => {
          sessionCreated = true;
        }),
        googleProvider(),
      );

      await assert.rejects(
        service.login(loginInput, metadata),
        (error: unknown) => exceptionCode(error) === scenario[2],
      );
      assert.equal(sessionCreated, false);
    });
  }

  it('uses the existing linked identity and the existing CRM session issuer', async () => {
    let provider: 'GOOGLE' | 'PASSWORD' | undefined;
    const store = authStoreStub({
      consumeExternalAuthChallenge: () => Promise.resolve(consumedChallenge()),
      resolveGoogleLoginIdentity: () => Promise.resolve({ identity, kind: 'identity' }),
    });
    const service = new GoogleAuthenticationService(
      store,
      TEST_AUTH_CONFIG,
      mockedAuthentication((value) => {
        provider = value;
      }),
      googleProvider(),
    );

    await service.login(loginInput, metadata);
    assert.equal(provider, 'GOOGLE');
  });

  it('rejects an account-linking conflict and audits it', async () => {
    const audits: AuthenticationAuditInput[] = [];
    const store = authStoreStub({
      consumeExternalAuthChallenge: () => Promise.resolve(consumedChallenge()),
      linkGoogleIdentity: () => Promise.resolve({ kind: 'identity_conflict' }),
      recordAuthenticationAudit: (audit) => {
        audits.push(audit);
        return Promise.resolve();
      },
    });
    const service = new GoogleAuthenticationService(
      store,
      TEST_AUTH_CONFIG,
      mockedAuthentication(),
      googleProvider(),
    );

    await assert.rejects(
      service.link(
        authorization,
        { challenge_id: CHALLENGE_ID, id_token: loginInput.id_token },
        metadata,
      ),
      (error: unknown) => exceptionCode(error) === 'GOOGLE_IDENTITY_CONFLICT',
    );
    assert.equal(audits.at(-1)?.eventType, 'IDENTITY_LINKED');
    assert.equal(audits.at(-1)?.outcome, 'DENIED');
  });

  it('reports current-session revocation after unlinking Google', async () => {
    const store = authStoreStub({
      unlinkGoogleIdentity: () =>
        Promise.resolve({ currentSessionRevoked: true, kind: 'unlinked' }),
    });
    const service = new GoogleAuthenticationService(
      store,
      TEST_AUTH_CONFIG,
      mockedAuthentication(),
      googleProvider(),
    );

    assert.deepEqual(await service.unlink(authorization, metadata), {
      current_session_revoked: true,
      unlinked: true,
    });
  });

  it('rejects a replayed or mismatched one-time challenge before token verification', async () => {
    let verified = false;
    const service = new GoogleAuthenticationService(
      authStoreStub({ consumeExternalAuthChallenge: () => Promise.resolve(undefined) }),
      TEST_AUTH_CONFIG,
      mockedAuthentication(),
      {
        verifyIdToken: () => {
          verified = true;
          return Promise.resolve(profile);
        },
      },
    );

    await assert.rejects(
      service.login(loginInput, metadata),
      (error: unknown) => exceptionCode(error) === 'GOOGLE_TOKEN_INVALID',
    );
    assert.equal(verified, false);
  });
});
