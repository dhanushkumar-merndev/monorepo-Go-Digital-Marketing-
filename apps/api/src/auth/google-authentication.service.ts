import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  AuthenticationMethod,
  AuthenticationMethodsResponse,
  AuthClientType,
  GoogleAuthChallengeResponse,
  GoogleLinkRequest,
  GoogleLinkResponse,
  GoogleLoginRequest,
  GoogleUnlinkResponse,
} from '@gdm/contracts';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AuthorizationContext } from '../authorization/authorization.types.js';
import {
  AUTH_STORE,
  type AuthenticationAuditInput,
  type AuthenticationMethodRecord,
  type AuthStore,
} from './auth-store.js';
import {
  AuthenticationService,
  type AuthRequestMetadata,
  type LoginResult,
} from './authentication.service.js';
import { AUTH_RUNTIME_CONFIG, type AuthRuntimeConfig } from './auth-runtime-config.js';
import { GoogleIdentityVerificationError } from './google-identity-provider.adapter.js';
import {
  GOOGLE_IDENTITY_PROVIDER,
  type GoogleIdentityProviderPort,
  type VerifiedGoogleIdentity,
} from './identity-provider.port.js';

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function authException(
  code:
    | 'ACCOUNT_DISABLED'
    | 'ACCOUNT_SUSPENDED'
    | 'CLIENT_INACTIVE'
    | 'GOOGLE_ACCOUNT_LINKING_REQUIRED'
    | 'GOOGLE_ACCOUNT_NOT_INVITED'
    | 'GOOGLE_EMAIL_UNVERIFIED'
    | 'GOOGLE_IDENTITY_CONFLICT'
    | 'GOOGLE_IDENTITY_NOT_LINKED'
    | 'GOOGLE_TOKEN_INVALID'
    | 'LAST_LOGIN_METHOD',
  message: string,
): ConflictException | ForbiddenException | UnauthorizedException {
  const body = { code, details: [], message, retryable: false };
  if (
    code === 'GOOGLE_ACCOUNT_LINKING_REQUIRED' ||
    code === 'GOOGLE_IDENTITY_CONFLICT' ||
    code === 'GOOGLE_IDENTITY_NOT_LINKED' ||
    code === 'LAST_LOGIN_METHOD'
  ) {
    return new ConflictException(body);
  }
  if (
    code === 'ACCOUNT_DISABLED' ||
    code === 'ACCOUNT_SUSPENDED' ||
    code === 'CLIENT_INACTIVE' ||
    code === 'GOOGLE_ACCOUNT_NOT_INVITED'
  ) {
    return new ForbiddenException(body);
  }
  return new UnauthorizedException(body);
}

@Injectable()
export class GoogleAuthenticationService {
  constructor(
    @Inject(AUTH_STORE) private readonly store: AuthStore,
    @Inject(AUTH_RUNTIME_CONFIG) private readonly config: AuthRuntimeConfig,
    @Inject(AuthenticationService) private readonly authentication: AuthenticationService,
    @Inject(GOOGLE_IDENTITY_PROVIDER)
    private readonly google: GoogleIdentityProviderPort,
  ) {}

  async createLoginChallenge(clientType: AuthClientType): Promise<GoogleAuthChallengeResponse> {
    return this.createChallenge(clientType, 'LOGIN');
  }

  async createLinkChallenge(
    authorization: AuthorizationContext,
  ): Promise<GoogleAuthChallengeResponse> {
    const clientType = await this.store.getSessionClientType(
      authorization.userId,
      authorization.sessionId,
    );
    if (!clientType) {
      throw new UnauthorizedException({
        code: 'SESSION_REVOKED',
        details: [],
        message: 'The current session is no longer active.',
        retryable: false,
      });
    }
    return this.createChallenge(clientType, 'LINK', authorization.userId, authorization.sessionId);
  }

  async login(input: GoogleLoginRequest, metadata: AuthRequestMetadata): Promise<LoginResult> {
    const now = new Date();
    const challenge = await this.store.consumeExternalAuthChallenge({
      challengeId: input.challenge_id,
      clientType: input.client_type,
      consumedAt: now,
      purpose: 'LOGIN',
    });
    if (!challenge) {
      await this.store.recordAuthenticationAudit({
        ...metadata,
        eventType: 'LOGIN_FAILED',
        metadata: { provider: 'GOOGLE', reason: 'CHALLENGE_INVALID' },
        outcome: 'DENIED',
      });
      throw authException('GOOGLE_TOKEN_INVALID', 'The Google sign-in expired.');
    }

    const profile = await this.verify(
      input.id_token,
      challenge.nonceHash,
      metadata,
      'LOGIN_FAILED',
    );
    const identifierHash = hash(`GOOGLE\0${profile.providerSubject}`);
    const resolution = await this.store.resolveGoogleLoginIdentity({
      audit: {
        ...metadata,
        eventType: 'IDENTITY_LINKED',
        identifierHash,
        outcome: 'SUCCESS',
      },
      clientType: input.client_type,
      email: profile.email,
      identityId: randomUUID(),
      now,
      providerSubject: profile.providerSubject,
    });

    if (resolution.kind !== 'identity' && resolution.kind !== 'invitation_activated') {
      const code =
        resolution.kind === 'account_disabled'
          ? 'ACCOUNT_DISABLED'
          : resolution.kind === 'account_suspended'
            ? 'ACCOUNT_SUSPENDED'
            : resolution.kind === 'client_inactive'
              ? 'CLIENT_INACTIVE'
              : resolution.kind === 'account_linking_required'
                ? 'GOOGLE_ACCOUNT_LINKING_REQUIRED'
                : resolution.kind === 'identity_conflict'
                  ? 'GOOGLE_IDENTITY_CONFLICT'
                  : 'GOOGLE_ACCOUNT_NOT_INVITED';
      await this.store.recordAuthenticationAudit({
        ...metadata,
        eventType: 'LOGIN_FAILED',
        identifierHash,
        metadata: { provider: 'GOOGLE', reason: code },
        outcome: 'DENIED',
      });
      throw authException(code, this.messageFor(code));
    }

    return this.authentication.createIdentitySession(
      resolution.identity,
      input,
      metadata,
      'GOOGLE',
    );
  }

  async link(
    authorization: AuthorizationContext,
    input: GoogleLinkRequest,
    metadata: AuthRequestMetadata,
  ): Promise<GoogleLinkResponse> {
    const now = new Date();
    const challenge = await this.store.consumeExternalAuthChallenge({
      challengeId: input.challenge_id,
      consumedAt: now,
      purpose: 'LINK',
      sessionId: authorization.sessionId,
      userId: authorization.userId,
    });
    if (!challenge) {
      await this.store.recordAuthenticationAudit({
        ...this.authorizationAudit(authorization, metadata),
        eventType: 'IDENTITY_LINKED',
        metadata: { provider: 'GOOGLE', reason: 'CHALLENGE_INVALID' },
        outcome: 'DENIED',
      });
      throw authException('GOOGLE_TOKEN_INVALID', 'The Google link request expired.');
    }

    const linkAudit = this.authorizationAudit(authorization, metadata);
    const profile = await this.verify(
      input.id_token,
      challenge.nonceHash,
      linkAudit,
      'IDENTITY_LINKED',
    );
    const identifierHash = hash(`GOOGLE\0${profile.providerSubject}`);
    const audit = this.authorizationAudit(authorization, metadata, identifierHash);
    const result = await this.store.linkGoogleIdentity({
      audit,
      email: profile.email,
      identityId: randomUUID(),
      linkedAt: now,
      providerSubject: profile.providerSubject,
      sessionId: authorization.sessionId,
      userId: authorization.userId,
    });

    if (result.kind !== 'linked') {
      const code =
        result.kind === 'identity_conflict' || result.kind === 'email_mismatch'
          ? 'GOOGLE_IDENTITY_CONFLICT'
          : 'ACCOUNT_SUSPENDED';
      await this.store.recordAuthenticationAudit({
        ...audit,
        eventType: 'IDENTITY_LINKED',
        metadata: { provider: 'GOOGLE', reason: code },
        outcome: 'DENIED',
      });
      throw authException(code, this.messageFor(code));
    }

    const methods = await this.methods(authorization);
    const method = methods.methods.find(({ provider }) => provider === 'GOOGLE');
    if (!method) throw new Error('The linked Google authentication method could not be loaded.');
    return { linked: true, method };
  }

  async methods(authorization: AuthorizationContext): Promise<AuthenticationMethodsResponse> {
    const records = await this.store.listAuthenticationMethods(authorization.userId);
    const activeSupported = records.filter(
      ({ provider, status }) =>
        (provider === 'PASSWORD' || provider === 'GOOGLE') && status === 'ACTIVE',
    ).length;
    return {
      methods: (['PASSWORD', 'GOOGLE'] as const).map((provider) =>
        this.presentMethod(
          provider,
          records.find((record) => record.provider === provider),
          activeSupported,
        ),
      ),
    };
  }

  async unlink(
    authorization: AuthorizationContext,
    metadata: AuthRequestMetadata | AuthenticationAuditInput,
  ): Promise<GoogleUnlinkResponse> {
    const audit = this.authorizationAudit(authorization, metadata);
    const result = await this.store.unlinkGoogleIdentity(
      authorization.userId,
      authorization.sessionId,
      new Date(),
      audit,
    );
    if (result.kind === 'identity_not_linked') {
      await this.recordUnlinkDenied(audit, 'GOOGLE_IDENTITY_NOT_LINKED');
      throw authException('GOOGLE_IDENTITY_NOT_LINKED', 'Google is not linked to this account.');
    }
    if (result.kind === 'last_login_method') {
      await this.recordUnlinkDenied(audit, 'LAST_LOGIN_METHOD');
      throw authException(
        'LAST_LOGIN_METHOD',
        'Connect another login method before unlinking Google.',
      );
    }
    return { current_session_revoked: result.currentSessionRevoked, unlinked: true };
  }

  private async recordUnlinkDenied(
    audit: AuthenticationAuditInput,
    reason: 'GOOGLE_IDENTITY_NOT_LINKED' | 'LAST_LOGIN_METHOD',
  ): Promise<void> {
    await this.store.recordAuthenticationAudit({
      ...audit,
      eventType: 'IDENTITY_UNLINKED',
      metadata: { provider: 'GOOGLE', reason },
      outcome: 'DENIED',
    });
  }

  private async createChallenge(
    clientType: AuthClientType,
    purpose: 'LINK' | 'LOGIN',
    userId?: string,
    sessionId?: string,
  ): Promise<GoogleAuthChallengeResponse> {
    if (this.config.googleClientIds.length === 0) {
      throw new ServiceUnavailableException({
        code: 'PROVIDER_UNAVAILABLE',
        details: [],
        message: 'Google authentication is not configured.',
        retryable: true,
      });
    }
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + this.config.googleChallengeTtlSeconds * 1_000);
    const id = randomUUID();
    const nonce = randomBytes(32).toString('hex');
    await this.store.createExternalAuthChallenge({
      clientType,
      expiresAt,
      id,
      nonceHash: hash(nonce),
      purpose,
      ...(sessionId ? { sessionId } : {}),
      ...(userId ? { userId } : {}),
    });
    return { challenge_id: id, expires_at: expiresAt.toISOString(), nonce };
  }

  private async verify(
    idToken: string,
    expectedNonceHash: string,
    metadata: AuthRequestMetadata,
    eventType: 'IDENTITY_LINKED' | 'LOGIN_FAILED',
  ): Promise<VerifiedGoogleIdentity> {
    try {
      return await this.google.verifyIdToken({ expectedNonceHash, idToken });
    } catch (error) {
      const reason =
        error instanceof GoogleIdentityVerificationError ? error.reason : 'PROVIDER_UNAVAILABLE';
      await this.store.recordAuthenticationAudit({
        ...metadata,
        eventType,
        metadata: { provider: 'GOOGLE', reason },
        outcome: 'DENIED',
      });
      if (reason === 'PROVIDER_UNAVAILABLE') {
        throw new ServiceUnavailableException({
          code: 'PROVIDER_UNAVAILABLE',
          details: [],
          message: 'Google authentication is temporarily unavailable.',
          retryable: true,
        });
      }
      throw authException(
        reason === 'EMAIL_UNVERIFIED' ? 'GOOGLE_EMAIL_UNVERIFIED' : 'GOOGLE_TOKEN_INVALID',
        reason === 'EMAIL_UNVERIFIED'
          ? 'Google must verify the account email before it can be used.'
          : 'The Google identity token is invalid.',
      );
    }
  }

  private authorizationAudit(
    authorization: AuthorizationContext,
    metadata: AuthRequestMetadata,
    identifierHash?: string,
  ): AuthenticationAuditInput {
    return {
      ...metadata,
      ...(authorization.clientOrganizationId
        ? { clientOrganizationId: authorization.clientOrganizationId }
        : {}),
      ...(identifierHash ? { identifierHash } : {}),
      eventType: 'IDENTITY_LINKED',
      membershipId: authorization.membershipId,
      outcome: 'SUCCESS',
      sessionId: authorization.sessionId,
      userId: authorization.userId,
    };
  }

  private presentMethod(
    provider: 'GOOGLE' | 'PASSWORD',
    record: AuthenticationMethodRecord | undefined,
    activeSupported: number,
  ): AuthenticationMethod {
    const connected = record?.status === 'ACTIVE';
    const canUnlink = provider === 'GOOGLE' && connected && activeSupported > 1;
    return {
      can_unlink: canUnlink,
      connected,
      email: connected && record ? record.email : null,
      last_used_at:
        connected && record?.lastAuthenticatedAt ? record.lastAuthenticatedAt.toISOString() : null,
      linked_at: connected && record ? record.createdAt.toISOString() : null,
      provider,
      unlink_block_reason:
        provider === 'PASSWORD'
          ? 'NOT_SUPPORTED'
          : connected && !canUnlink
            ? 'LAST_LOGIN_METHOD'
            : null,
    };
  }

  private messageFor(
    code:
      | 'ACCOUNT_DISABLED'
      | 'ACCOUNT_SUSPENDED'
      | 'CLIENT_INACTIVE'
      | 'GOOGLE_ACCOUNT_LINKING_REQUIRED'
      | 'GOOGLE_ACCOUNT_NOT_INVITED'
      | 'GOOGLE_IDENTITY_CONFLICT',
  ): string {
    switch (code) {
      case 'ACCOUNT_DISABLED':
        return 'This account is disabled.';
      case 'ACCOUNT_SUSPENDED':
        return 'This account is suspended.';
      case 'CLIENT_INACTIVE':
        return 'The organization for this account is not active.';
      case 'GOOGLE_ACCOUNT_LINKING_REQUIRED':
        return 'Sign in with your existing method and link Google from profile settings.';
      case 'GOOGLE_IDENTITY_CONFLICT':
        return 'This Google identity cannot be linked to the current account.';
      case 'GOOGLE_ACCOUNT_NOT_INVITED':
        return 'This Google account has not been invited.';
    }
  }
}
