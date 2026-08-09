import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { AccessTokenService } from '../src/auth/access-token.service.js';
import type { AuthRuntimeConfig } from '../src/auth/auth-runtime-config.js';

const config: AuthRuntimeConfig = {
  accessTokenAudience: 'gdm-clients',
  accessTokenIssuer: 'gdm-api-test',
  accessTokenSecret: 'a-test-secret-with-at-least-thirty-two-characters',
  accessTokenTtlSeconds: 300,
  cookieName: 'gdm_refresh',
  cookieSameSite: 'lax',
  cookieSecure: false,
  loginLockoutSeconds: 900,
  loginMaxAttempts: 5,
  mfaActiveKeyId: 'test-v1',
  mfaChallengePepper: 'test-mfa-challenge-pepper-with-at-least-thirty-two-characters',
  mfaChallengeTtlSeconds: 300,
  mfaEncryptionKeys: { 'test-v1': 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' },
  mfaIssuer: 'GDM Test',
  mfaMaxAttempts: 5,
  mfaRecoveryCodePepper: 'test-mfa-recovery-pepper-with-at-least-thirty-two-characters',
  googleChallengeTtlSeconds: 300,
  googleClientIds: ['123456789-test.apps.googleusercontent.com'],
  passwordPepper: 'password-pepper-with-at-least-thirty-two-characters',
  passwordResetTokenTtlSeconds: 1_800,
  refreshTokenPepper: 'refresh-pepper-with-at-least-thirty-two-characters',
  refreshTokenTtlSeconds: 2_592_000,
  supportElevationTtlSeconds: 1_800,
};

describe('AccessTokenService', () => {
  it('issues and validates a short-lived context-bound access token', async () => {
    const service = new AccessTokenService(config);
    const claims = {
      membershipId: randomUUID(),
      sessionId: randomUUID(),
      userId: randomUUID(),
    };
    const issued = await service.issue(claims, new Date('2026-08-02T00:00:00.000Z'));

    assert.deepEqual(
      await service.verify(issued.token, new Date('2026-08-02T00:00:01.000Z')),
      claims,
    );
    assert.equal(issued.expiresAt.toISOString(), '2026-08-02T00:05:00.000Z');
  });

  it('rejects a token signed for another audience', async () => {
    const issuer = new AccessTokenService(config);
    const verifier = new AccessTokenService({ ...config, accessTokenAudience: 'another-client' });
    const issued = await issuer.issue({
      membershipId: randomUUID(),
      sessionId: randomUUID(),
      userId: randomUUID(),
    });

    assert.equal(await verifier.verify(issued.token), undefined);
  });
});
