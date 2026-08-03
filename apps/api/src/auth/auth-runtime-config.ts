export const AUTH_RUNTIME_CONFIG = Symbol('AUTH_RUNTIME_CONFIG');

export interface AuthRuntimeConfig {
  accessTokenAudience: string;
  accessTokenIssuer: string;
  accessTokenSecret: string;
  accessTokenTtlSeconds: number;
  cookieName: string;
  cookieDomain?: string;
  cookieSameSite: 'lax' | 'none' | 'strict';
  cookieSecure: boolean;
  loginLockoutSeconds: number;
  loginMaxAttempts: number;
  googleChallengeTtlSeconds: number;
  googleClientIds: string[];
  passwordPepper: string;
  passwordResetTokenTtlSeconds: number;
  refreshTokenPepper: string;
  refreshTokenTtlSeconds: number;
  supportElevationTtlSeconds: number;
}
