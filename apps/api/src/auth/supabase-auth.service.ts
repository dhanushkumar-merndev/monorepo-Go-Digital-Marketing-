import { Inject, Injectable } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { decodeJwt } from 'jose';
import { PinoLogger } from 'nestjs-pino';

export interface VerifiedSupabaseAccessToken {
  assuranceLevel: 'aal1' | 'aal2';
  expiresAt: Date;
  sessionId: string;
  userId: string;
}

/** Validates bearer tokens with Supabase Auth; never trusts decoded claims alone. */
@Injectable()
export class SupabaseAuthService {
  private readonly client: SupabaseClient | null;
  private readonly issuer: string | null;

  constructor(@Inject(PinoLogger) private readonly logger: PinoLogger) {
    this.logger.setContext(SupabaseAuthService.name);
    const url = process.env.SUPABASE_URL?.trim();
    const publishableKey = (
      process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY
    )?.trim();

    if (!url || !publishableKey) {
      this.client = null;
      this.issuer = null;
      return;
    }

    this.client = createClient(url, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    this.issuer = `${url.replace(/\/$/u, '')}/auth/v1`;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async verify(accessToken: string): Promise<VerifiedSupabaseAccessToken | undefined> {
    if (!this.client || !this.issuer) return undefined;

    const { data, error } = await this.client.auth.getUser(accessToken);
    if (error || !data.user) {
      // TEMPORARY Google/Supabase sign-in diagnostic. Remove after the current
      // development sign-in investigation. Never log the bearer token or user data.
      this.logger.warn(
        {
          has_user: Boolean(data.user),
          provider_error_code: error?.code ?? null,
          validation_stage: 'supabase_get_user',
        },
        'Temporary Supabase access-token validation diagnostic',
      );
      return undefined;
    }

    try {
      const claims = decodeJwt(accessToken);
      const subject = typeof claims.sub === 'string' ? claims.sub : undefined;
      const issuer = typeof claims.iss === 'string' ? claims.iss : undefined;
      const expiresAtSeconds = typeof claims.exp === 'number' ? claims.exp : undefined;
      const sessionId = typeof claims.session_id === 'string' ? claims.session_id : data.user.id;

      if (
        subject !== data.user.id ||
        issuer !== this.issuer ||
        expiresAtSeconds === undefined ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
          sessionId,
        ) ||
        expiresAtSeconds * 1_000 <= Date.now()
      ) {
        // TEMPORARY Google/Supabase sign-in diagnostic. Remove after the current
        // development sign-in investigation. IDs and token contents stay out of logs.
        this.logger.warn(
          {
            expiration_present: expiresAtSeconds !== undefined,
            issuer_matches: issuer === this.issuer,
            session_id_format_valid:
              sessionId !== undefined &&
              /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
                sessionId,
              ),
            subject_matches: subject === data.user.id,
            validation_stage: 'jwt_claims',
          },
          'Temporary Supabase access-token validation diagnostic',
        );
        return undefined;
      }

      const assuranceLevel = claims.aal === 'aal2' ? 'aal2' : 'aal1';
      return {
        assuranceLevel,
        expiresAt: new Date(expiresAtSeconds * 1_000),
        sessionId,
        userId: data.user.id,
      };
    } catch (error) {
      // TEMPORARY Google/Supabase sign-in diagnostic. Remove after the current
      // development sign-in investigation. Do not include the access token.
      this.logger.warn(
        {
          error_type: error instanceof Error ? error.constructor.name : typeof error,
          validation_stage: 'jwt_decode',
        },
        'Temporary Supabase access-token validation diagnostic',
      );
      return undefined;
    }
  }
}
