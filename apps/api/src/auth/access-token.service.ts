import { Inject, Injectable } from '@nestjs/common';
import { SignJWT, errors as JoseErrors, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AUTH_RUNTIME_CONFIG, type AuthRuntimeConfig } from './auth-runtime-config.js';

const accessClaimsSchema = z.object({
  jti: z.string().uuid(),
  mid: z.string().uuid(),
  sid: z.string().uuid(),
  sub: z.string().uuid(),
});

export interface AccessTokenClaims {
  membershipId: string;
  sessionId: string;
  userId: string;
}

export interface IssuedAccessToken {
  expiresAt: Date;
  token: string;
}

@Injectable()
export class AccessTokenService {
  private readonly secret: Uint8Array;

  constructor(
    @Inject(AUTH_RUNTIME_CONFIG)
    private readonly config: AuthRuntimeConfig,
  ) {
    this.secret = new TextEncoder().encode(config.accessTokenSecret);
  }

  async issue(claims: AccessTokenClaims, now = new Date()): Promise<IssuedAccessToken> {
    const expiresAt = new Date(now.getTime() + this.config.accessTokenTtlSeconds * 1_000);
    const token = await new SignJWT({ mid: claims.membershipId, sid: claims.sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(claims.userId)
      .setJti(randomUUID())
      .setIssuer(this.config.accessTokenIssuer)
      .setAudience(this.config.accessTokenAudience)
      .setIssuedAt(Math.floor(now.getTime() / 1_000))
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1_000))
      .sign(this.secret);

    return { expiresAt, token };
  }

  async verify(token: string, now = new Date()): Promise<AccessTokenClaims | undefined> {
    try {
      const result = await jwtVerify(token, this.secret, {
        algorithms: ['HS256'],
        audience: this.config.accessTokenAudience,
        currentDate: now,
        issuer: this.config.accessTokenIssuer,
      });
      const parsed = accessClaimsSchema.safeParse(result.payload);

      if (!parsed.success) {
        return undefined;
      }

      return {
        membershipId: parsed.data.mid,
        sessionId: parsed.data.sid,
        userId: parsed.data.sub,
      };
    } catch (error) {
      if (
        error instanceof JoseErrors.JWTExpired ||
        error instanceof JoseErrors.JWTClaimValidationFailed ||
        error instanceof JoseErrors.JWSSignatureVerificationFailed ||
        error instanceof JoseErrors.JWSInvalid ||
        error instanceof JoseErrors.JWTInvalid
      ) {
        return undefined;
      }

      throw error;
    }
  }
}
