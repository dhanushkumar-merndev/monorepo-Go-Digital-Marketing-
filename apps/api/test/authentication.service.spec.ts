import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { HttpException } from '@nestjs/common';
import { AccessTokenService } from '../src/auth/access-token.service.js';
import type { AuthenticationAuditInput } from '../src/auth/auth-store.js';
import { AuthenticationService } from '../src/auth/authentication.service.js';
import { createOpaqueToken } from '../src/auth/opaque-token.js';
import { PasswordHasher } from '../src/auth/password-hasher.js';
import type { PasswordResetDeliveryPort } from '../src/auth/password-reset-delivery.port.js';
import { authStoreStub, TEST_AUTH_CONFIG } from './auth-test-fixtures.js';

function exceptionCode(error: unknown): string | undefined {
  if (!(error instanceof HttpException)) return undefined;
  const response = error.getResponse();
  return typeof response === 'object' && response !== null && 'code' in response
    ? String(response.code)
    : undefined;
}

function serviceWith(store: ReturnType<typeof authStoreStub>): AuthenticationService {
  const delivery: PasswordResetDeliveryPort = {
    deliver: () => Promise.resolve(),
  };
  return new AuthenticationService(
    store,
    TEST_AUTH_CONFIG,
    new PasswordHasher(),
    new AccessTokenService(TEST_AUTH_CONFIG),
    delivery,
  );
}

const metadata = { correlationId: 'phase-1-auth-test' };

describe('AuthenticationService security rules', () => {
  it('blocks a suspended user before creating a session and audits the decision', async () => {
    const passwords = new PasswordHasher();
    const passwordHash = await passwords.hash(
      'Correct horse battery staple',
      TEST_AUTH_CONFIG.passwordPepper,
    );
    const audits: AuthenticationAuditInput[] = [];
    let created = false;
    const store = authStoreStub({
      createSession: () => {
        created = true;
        return Promise.resolve();
      },
      findPasswordIdentity: () =>
        Promise.resolve({
          email: 'suspended@example.com',
          failedAttempts: 0,
          id: randomUUID(),
          passwordHash,
          status: 'ACTIVE',
          userDisplayName: 'Suspended User',
          userId: randomUUID(),
          userStatus: 'SUSPENDED',
        }),
      recordAuthenticationAudit: (audit) => {
        audits.push(audit);
        return Promise.resolve();
      },
    });

    await assert.rejects(
      serviceWith(store).login(
        {
          client_type: 'web',
          email: 'suspended@example.com',
          password: 'Correct horse battery staple',
        },
        metadata,
      ),
      (error: unknown) => exceptionCode(error) === 'ACCOUNT_SUSPENDED',
    );
    assert.equal(created, false);
    assert.equal(audits.at(-1)?.eventType, 'ACCOUNT_STATUS_BLOCKED');
  });

  it('rejects refresh-token reuse and preserves the reuse-specific error', async () => {
    const refresh = createOpaqueToken(randomUUID());
    const store = authStoreStub({
      rotateRefreshToken: () => Promise.resolve({ kind: 'reused' }),
    });

    await assert.rejects(
      serviceWith(store).refresh(refresh.token, metadata),
      (error: unknown) => exceptionCode(error) === 'REFRESH_TOKEN_REUSED',
    );
  });

  it('cannot refresh a suspended account even with a structurally valid token', async () => {
    const refresh = createOpaqueToken(randomUUID());
    const audits: AuthenticationAuditInput[] = [];
    const store = authStoreStub({
      recordAuthenticationAudit: (audit) => {
        audits.push(audit);
        return Promise.resolve();
      },
      rotateRefreshToken: () =>
        Promise.resolve({ kind: 'user_inactive', sessionId: randomUUID(), userId: randomUUID() }),
    });

    await assert.rejects(
      serviceWith(store).refresh(refresh.token, metadata),
      (error: unknown) => exceptionCode(error) === 'ACCOUNT_SUSPENDED',
    );
    assert.equal(audits.at(-1)?.eventType, 'REFRESH_FAILED');
  });

  it('revokes the current session with refresh proof even when no access token is usable', async () => {
    const refresh = createOpaqueToken(randomUUID());
    let revokeCalled = false;
    const store = authStoreStub({
      revokeByRefreshToken: () => {
        revokeCalled = true;
        return Promise.resolve(true);
      },
    });

    assert.deepEqual(await serviceWith(store).logout(refresh.token, metadata), {
      logged_out: true,
    });
    assert.equal(revokeCalled, true);
  });
});
