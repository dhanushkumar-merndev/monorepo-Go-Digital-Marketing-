import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import {
  GoogleIdentityVerificationError,
  verifyGoogleIdToken,
} from '../src/auth/google-identity-provider.adapter.js';

const CLIENT_ID = '123456789-test.apps.googleusercontent.com';
const NOW = new Date('2026-08-03T12:00:00.000Z');
const NONCE = 'google-test-nonce';
const NONCE_HASH = createHash('sha256').update(NONCE, 'utf8').digest('hex');

interface SignOptions {
  audience?: string | string[];
  expiresAt?: number;
  issuer?: string;
  kid?: string;
}

interface VerifierFixture {
  keySet: JWTVerifyGetKey;
  sign(payload?: JWTPayload, options?: SignOptions): Promise<string>;
}

async function verifierFixture(): Promise<VerifierFixture> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  const keySet = createLocalJWKSet({
    keys: [{ ...publicJwk, alg: 'RS256', kid: 'google-test-key', use: 'sig' }],
  });

  const sign = async (payload: JWTPayload = {}, options: SignOptions = {}): Promise<string> =>
    new SignJWT({
      email: 'Invited.User@Example.com',
      email_verified: true,
      nonce: NONCE,
      ...payload,
    })
      .setProtectedHeader({ alg: 'RS256', kid: options.kid ?? 'google-test-key', typ: 'JWT' })
      .setIssuer(options.issuer ?? 'https://accounts.google.com')
      .setAudience(options.audience ?? CLIENT_ID)
      .setSubject('google-provider-subject')
      .setIssuedAt(Math.floor(NOW.getTime() / 1_000) - 30)
      .setExpirationTime(options.expiresAt ?? Math.floor(NOW.getTime() / 1_000) + 300)
      .sign(privateKey);

  return { keySet, sign };
}

async function expectVerificationFailure(
  operation: Promise<unknown>,
  reason: GoogleIdentityVerificationError['reason'],
): Promise<void> {
  await assert.rejects(
    operation,
    (error: unknown) => error instanceof GoogleIdentityVerificationError && error.reason === reason,
  );
}

describe('Google ID token verification', () => {
  it('accepts a signed Google token and returns only verified subject and normalized email', async () => {
    const fixture = await verifierFixture();
    const token = await fixture.sign({ name: 'Untrusted presentation field' });

    assert.deepEqual(
      await verifyGoogleIdToken(
        { expectedNonceHash: NONCE_HASH, idToken: token },
        { clientIds: [CLIENT_ID], currentDate: NOW, keySet: fixture.keySet },
      ),
      { email: 'invited.user@example.com', providerSubject: 'google-provider-subject' },
    );
  });

  it('rejects an invalid audience', async () => {
    const fixture = await verifierFixture();
    const token = await fixture.sign(
      {},
      { audience: 'different-client.apps.googleusercontent.com' },
    );
    await expectVerificationFailure(
      verifyGoogleIdToken(
        { expectedNonceHash: NONCE_HASH, idToken: token },
        { clientIds: [CLIENT_ID], currentDate: NOW, keySet: fixture.keySet },
      ),
      'INVALID_TOKEN',
    );
  });

  it('rejects an invalid issuer', async () => {
    const fixture = await verifierFixture();
    const token = await fixture.sign({}, { issuer: 'https://accounts.example.invalid' });
    await expectVerificationFailure(
      verifyGoogleIdToken(
        { expectedNonceHash: NONCE_HASH, idToken: token },
        { clientIds: [CLIENT_ID], currentDate: NOW, keySet: fixture.keySet },
      ),
      'INVALID_TOKEN',
    );
  });

  it('treats an unknown JWKS key id as an invalid token, not a provider outage', async () => {
    const fixture = await verifierFixture();
    const token = await fixture.sign({}, { kid: 'unknown-google-key' });
    await expectVerificationFailure(
      verifyGoogleIdToken(
        { expectedNonceHash: NONCE_HASH, idToken: token },
        { clientIds: [CLIENT_ID], currentDate: NOW, keySet: fixture.keySet },
      ),
      'INVALID_TOKEN',
    );
  });

  it('reserves provider-unavailable for a JWKS transport or provider failure', async () => {
    const fixture = await verifierFixture();
    const token = await fixture.sign();
    await expectVerificationFailure(
      verifyGoogleIdToken(
        { expectedNonceHash: NONCE_HASH, idToken: token },
        {
          clientIds: [CLIENT_ID],
          currentDate: NOW,
          keySet: () => Promise.reject(new Error('simulated JWKS network outage')),
        },
      ),
      'PROVIDER_UNAVAILABLE',
    );
  });

  it('rejects an expired token', async () => {
    const fixture = await verifierFixture();
    const token = await fixture.sign({}, { expiresAt: Math.floor(NOW.getTime() / 1_000) - 60 });
    await expectVerificationFailure(
      verifyGoogleIdToken(
        { expectedNonceHash: NONCE_HASH, idToken: token },
        { clientIds: [CLIENT_ID], currentDate: NOW, keySet: fixture.keySet },
      ),
      'INVALID_TOKEN',
    );
  });

  it('rejects an unverified email', async () => {
    const fixture = await verifierFixture();
    const token = await fixture.sign({ email_verified: false });
    await expectVerificationFailure(
      verifyGoogleIdToken(
        { expectedNonceHash: NONCE_HASH, idToken: token },
        { clientIds: [CLIENT_ID], currentDate: NOW, keySet: fixture.keySet },
      ),
      'EMAIL_UNVERIFIED',
    );
  });

  it('rejects a nonce replayed against a different challenge', async () => {
    const fixture = await verifierFixture();
    const token = await fixture.sign();
    const differentNonceHash = createHash('sha256').update('another-nonce').digest('hex');
    await expectVerificationFailure(
      verifyGoogleIdToken(
        { expectedNonceHash: differentNonceHash, idToken: token },
        { clientIds: [CLIENT_ID], currentDate: NOW, keySet: fixture.keySet },
      ),
      'INVALID_TOKEN',
    );
  });

  it('requires a trusted authorized party for a multi-audience token', async () => {
    const fixture = await verifierFixture();
    const token = await fixture.sign({}, { audience: [CLIENT_ID, 'another-client'] });
    await expectVerificationFailure(
      verifyGoogleIdToken(
        { expectedNonceHash: NONCE_HASH, idToken: token },
        { clientIds: [CLIENT_ID], currentDate: NOW, keySet: fixture.keySet },
      ),
      'INVALID_TOKEN',
    );
  });
});
