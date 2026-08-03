import { Inject, Injectable } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { AUTH_RUNTIME_CONFIG, type AuthRuntimeConfig } from './auth-runtime-config.js';
import type {
  GoogleIdentityProviderPort,
  VerifiedGoogleIdentity,
} from './identity-provider.port.js';

const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'] as const;
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), {
  cooldownDuration: 30_000,
  timeoutDuration: 5_000,
});

export type GoogleIdentityVerificationFailure =
  'EMAIL_UNVERIFIED' | 'INVALID_TOKEN' | 'PROVIDER_UNAVAILABLE';

export class GoogleIdentityVerificationError extends Error {
  constructor(readonly reason: GoogleIdentityVerificationFailure) {
    super(reason);
    this.name = 'GoogleIdentityVerificationError';
  }
}

function normalizedEmail(payload: JWTPayload): string {
  if (payload.email_verified !== true) {
    throw new GoogleIdentityVerificationError('EMAIL_UNVERIFIED');
  }
  if (typeof payload.email !== 'string') {
    throw new GoogleIdentityVerificationError('INVALID_TOKEN');
  }
  const email = payload.email.trim().toLowerCase();
  if (email.length === 0 || email.length > 320 || !email.includes('@')) {
    throw new GoogleIdentityVerificationError('INVALID_TOKEN');
  }
  return email;
}

function nonceMatches(nonce: unknown, expectedHash: string): boolean {
  if (typeof nonce !== 'string' || !/^[0-9a-f]{64}$/u.test(expectedHash)) return false;
  const actual = createHash('sha256').update(nonce, 'utf8').digest();
  const expected = Buffer.from(expectedHash, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function isTokenValidationFailure(error: unknown): boolean {
  if (error instanceof GoogleIdentityVerificationError)
    return error.reason !== 'PROVIDER_UNAVAILABLE';
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  return (
    code.startsWith('ERR_JWT_') ||
    code.startsWith('ERR_JWS_') ||
    code === 'ERR_JOSE_ALG_NOT_ALLOWED' ||
    code === 'ERR_JWKS_NO_MATCHING_KEY' ||
    code === 'ERR_JWKS_MULTIPLE_MATCHING_KEYS'
  );
}

export async function verifyGoogleIdToken(
  input: { expectedNonceHash: string; idToken: string },
  options: { clientIds: string[]; keySet: JWTVerifyGetKey; currentDate?: Date },
): Promise<VerifiedGoogleIdentity> {
  if (options.clientIds.length === 0) {
    throw new GoogleIdentityVerificationError('PROVIDER_UNAVAILABLE');
  }

  try {
    const verified = await jwtVerify(input.idToken, options.keySet, {
      algorithms: ['RS256'],
      audience: options.clientIds,
      clockTolerance: 5,
      ...(options.currentDate ? { currentDate: options.currentDate } : {}),
      issuer: [...GOOGLE_ISSUERS],
    });
    const { payload } = verified;
    if (typeof payload.exp !== 'number') {
      throw new GoogleIdentityVerificationError('INVALID_TOKEN');
    }
    if (typeof payload.sub !== 'string' || payload.sub.length === 0 || payload.sub.length > 320) {
      throw new GoogleIdentityVerificationError('INVALID_TOKEN');
    }
    if (!nonceMatches(payload.nonce, input.expectedNonceHash)) {
      throw new GoogleIdentityVerificationError('INVALID_TOKEN');
    }
    const requiresAuthorizedParty = Array.isArray(payload.aud) && payload.aud.length > 1;
    if (
      (requiresAuthorizedParty && typeof payload.azp !== 'string') ||
      (typeof payload.azp === 'string' && !options.clientIds.includes(payload.azp))
    ) {
      throw new GoogleIdentityVerificationError('INVALID_TOKEN');
    }

    return { email: normalizedEmail(payload), providerSubject: payload.sub };
  } catch (error) {
    if (error instanceof GoogleIdentityVerificationError) throw error;
    throw new GoogleIdentityVerificationError(
      isTokenValidationFailure(error) ? 'INVALID_TOKEN' : 'PROVIDER_UNAVAILABLE',
    );
  }
}

@Injectable()
export class GoogleIdentityProviderAdapter implements GoogleIdentityProviderPort {
  constructor(@Inject(AUTH_RUNTIME_CONFIG) private readonly config: AuthRuntimeConfig) {}

  verifyIdToken(input: {
    expectedNonceHash: string;
    idToken: string;
  }): Promise<VerifiedGoogleIdentity> {
    return verifyGoogleIdToken(input, {
      clientIds: this.config.googleClientIds,
      keySet: GOOGLE_JWKS,
    });
  }
}
