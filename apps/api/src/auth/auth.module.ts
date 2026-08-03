import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { parseAuthEnvironment, type AuthEnvironment } from '@gdm/config';
import { AuthenticationGuard } from '../authorization/authentication.guard.js';
import { AuthorizationPolicy } from '../authorization/authorization-policy.js';
import { DatabaseInfrastructureModule } from '../infrastructure/database/database.module.js';
import { RedisInfrastructureModule } from '../infrastructure/redis/redis.module.js';
import { AccessTokenService } from './access-token.service.js';
import { AUTH_RUNTIME_CONFIG, type AuthRuntimeConfig } from './auth-runtime-config.js';
import { AUTH_STORE } from './auth-store.js';
import { AuthController } from './auth.controller.js';
import { AuthenticationService } from './authentication.service.js';
import {
  AUTH_RATE_LIMIT_STORE,
  AuthenticationRateLimiter,
  RedisAuthenticationRateLimitStore,
} from './authentication-rate-limiter.js';
import { DrizzleAuthStore } from './drizzle-auth.store.js';
import { GoogleAuthController } from './google-auth.controller.js';
import { GoogleAuthenticationService } from './google-authentication.service.js';
import { GoogleIdentityProviderAdapter } from './google-identity-provider.adapter.js';
import { GOOGLE_IDENTITY_PROVIDER } from './identity-provider.port.js';
import { MeController } from './me.controller.js';
import { OrganizationAccessController } from './organization-access.controller.js';
import { OrganizationAccessService } from './organization-access.service.js';
import { PasswordHasher } from './password-hasher.js';
import {
  PASSWORD_RESET_DELIVERY,
  UnavailablePasswordResetDelivery,
} from './password-reset-delivery.port.js';
import { SupportElevationController } from './support-elevation.controller.js';
import { AdministrationController } from '../administration/administration.controller.js';
import { AdministrationService } from '../administration/administration.service.js';

function toRuntimeConfig(environment: AuthEnvironment): AuthRuntimeConfig {
  return {
    accessTokenAudience: environment.audience,
    accessTokenIssuer: environment.issuer,
    accessTokenSecret: environment.accessTokenSecret,
    accessTokenTtlSeconds: environment.accessTokenTtlSeconds,
    ...(environment.refreshCookieDomain ? { cookieDomain: environment.refreshCookieDomain } : {}),
    cookieName: environment.refreshCookieName,
    cookieSameSite: environment.refreshCookieSameSite,
    cookieSecure: environment.refreshCookieSecure,
    loginLockoutSeconds: environment.loginLockoutSeconds,
    loginMaxAttempts: environment.loginMaxAttempts,
    googleChallengeTtlSeconds: environment.googleChallengeTtlSeconds,
    googleClientIds: environment.googleClientIds,
    passwordPepper: environment.passwordPepper,
    passwordResetTokenTtlSeconds: environment.passwordResetTokenTtlSeconds,
    refreshTokenPepper: environment.refreshTokenPepper,
    refreshTokenTtlSeconds: environment.refreshTokenTtlSeconds,
    supportElevationTtlSeconds: environment.supportElevationTtlSeconds,
  };
}

@Module({
  imports: [DatabaseInfrastructureModule, RedisInfrastructureModule],
  controllers: [
    AuthController,
    GoogleAuthController,
    MeController,
    OrganizationAccessController,
    SupportElevationController,
    AdministrationController,
  ],
  providers: [
    {
      provide: AUTH_RUNTIME_CONFIG,
      useFactory: (): AuthRuntimeConfig => toRuntimeConfig(parseAuthEnvironment(process.env)),
    },
    AccessTokenService,
    AdministrationService,
    AuthenticationService,
    AuthenticationRateLimiter,
    AuthorizationPolicy,
    DrizzleAuthStore,
    GoogleAuthenticationService,
    GoogleIdentityProviderAdapter,
    OrganizationAccessService,
    PasswordHasher,
    UnavailablePasswordResetDelivery,
    RedisAuthenticationRateLimitStore,
    {
      provide: AUTH_RATE_LIMIT_STORE,
      useExisting: RedisAuthenticationRateLimitStore,
    },
    {
      provide: AUTH_STORE,
      useExisting: DrizzleAuthStore,
    },
    {
      provide: GOOGLE_IDENTITY_PROVIDER,
      useExisting: GoogleIdentityProviderAdapter,
    },
    {
      provide: PASSWORD_RESET_DELIVERY,
      useExisting: UnavailablePasswordResetDelivery,
    },
    {
      provide: APP_GUARD,
      useClass: AuthenticationGuard,
    },
  ],
  exports: [AUTH_RUNTIME_CONFIG, AUTH_STORE, AccessTokenService, AuthenticationService],
})
export class AuthModule {}
