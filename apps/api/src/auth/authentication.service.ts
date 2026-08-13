import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateSupportElevationRequest,
  ForgotPasswordResponse,
  LoginAuthenticatedResponse,
  LoginRequest,
  LoginResponse,
  LogoutAllResponse,
  LogoutResponse,
  MeResponse,
  RefreshResponse,
  ResetPasswordResponse,
  RevokeSessionResponse,
  SessionListResponse,
  SupportElevationResponse,
  SwitchMembershipResponse,
} from '@gdm/contracts';
import { randomUUID } from 'node:crypto';
import type { AuthorizationContext } from '../authorization/authorization.types.js';
import { AccessTokenService } from './access-token.service.js';
import { authenticationFailure, invalidCredentials } from './auth-exceptions.js';
import {
  AUTH_STORE,
  type AuthenticationIdentityRecord,
  type AuthenticationAuditInput,
  type AuthStore,
  type DeviceMetadata,
  type MfaLoginChallengeRecord,
  type MembershipAccessRecord,
  type SessionAccessRecord,
} from './auth-store.js';
import {
  presentMembership,
  presentResolvedUser,
  presentSession,
  presentSupportElevation,
} from './auth-presenter.js';
import { AUTH_RUNTIME_CONFIG, type AuthRuntimeConfig } from './auth-runtime-config.js';
import { createOpaqueToken, hashOpaqueToken, parseOpaqueToken } from './opaque-token.js';
import { PasswordHasher } from './password-hasher.js';
import {
  PASSWORD_RESET_DELIVERY,
  type PasswordResetDeliveryPort,
} from './password-reset-delivery.port.js';

export interface AuthRequestMetadata {
  correlationId: string;
  sourceIp?: string;
  userAgent?: string;
}

export interface LoginResult {
  payload: LoginResponse;
  refreshToken?: string;
}

export interface RefreshResult {
  payload: RefreshResponse;
  refreshToken: string;
}

function organizationIsActive(membership: MembershipAccessRecord): boolean {
  return membership.contextType === 'AGENCY'
    ? membership.agencyStatus === 'ACTIVE'
    : membership.clientStatus === 'ACTIVE';
}

@Injectable()
export class AuthenticationService {
  constructor(
    @Inject(AUTH_STORE) private readonly store: AuthStore,
    @Inject(AUTH_RUNTIME_CONFIG) private readonly config: AuthRuntimeConfig,
    @Inject(PasswordHasher) private readonly passwords: PasswordHasher,
    @Inject(AccessTokenService) private readonly accessTokens: AccessTokenService,
    @Inject(PASSWORD_RESET_DELIVERY)
    private readonly passwordResetDelivery: PasswordResetDeliveryPort,
  ) {}

  async login(input: LoginRequest, metadata: AuthRequestMetadata): Promise<LoginResult> {
    const now = new Date();
    const identity = await this.store.findPasswordIdentity(input.email);

    if (!identity) {
      await this.passwords.verify(input.password, this.config.passwordPepper, 'invalid');
      await this.store.recordAuthenticationAudit({
        ...metadata,
        eventType: 'LOGIN_FAILED',
        metadata: { reason: 'INVALID_CREDENTIALS' },
        outcome: 'DENIED',
      });
      throw invalidCredentials();
    }

    const passwordMatches = await this.passwords.verify(
      input.password,
      this.config.passwordPepper,
      identity.passwordHash,
    );

    if (!passwordMatches || (identity.lockedUntil?.getTime() ?? 0) > now.getTime()) {
      const failedAttempts = identity.failedAttempts + 1;
      const lockUntil =
        failedAttempts >= this.config.loginMaxAttempts
          ? new Date(now.getTime() + this.config.loginLockoutSeconds * 1_000)
          : undefined;
      await this.store.recordLoginFailure(identity.id, now, lockUntil, {
        lockoutSeconds: this.config.loginLockoutSeconds,
        maxAttempts: this.config.loginMaxAttempts,
      });
      await this.store.recordAuthenticationAudit({
        ...metadata,
        eventType: 'LOGIN_FAILED',
        metadata: { reason: lockUntil ? 'RATE_LIMITED' : 'INVALID_CREDENTIALS' },
        outcome: 'DENIED',
        userId: identity.userId,
      });
      throw invalidCredentials();
    }

    return this.createIdentitySession(identity, input, metadata, 'PASSWORD');
  }

  async createIdentitySession(
    identity: AuthenticationIdentityRecord,
    input: Pick<LoginRequest, 'client_type' | 'device'>,
    metadata: AuthRequestMetadata,
    provider: 'GOOGLE' | 'PASSWORD',
  ): Promise<LoginResult> {
    const now = new Date();

    if (identity.status === 'DISABLED' || identity.userStatus === 'DEACTIVATED') {
      await this.store.recordAuthenticationAudit({
        ...metadata,
        eventType: 'ACCOUNT_STATUS_BLOCKED',
        metadata: { provider, reason: 'ACCOUNT_DISABLED' },
        outcome: 'DENIED',
        userId: identity.userId,
      });
      throw authenticationFailure('ACCOUNT_DISABLED', 'This account is disabled.');
    }

    if (identity.status !== 'ACTIVE' || identity.userStatus !== 'ACTIVE') {
      await this.store.recordAuthenticationAudit({
        ...metadata,
        eventType: 'ACCOUNT_STATUS_BLOCKED',
        metadata: { provider, reason: 'ACCOUNT_SUSPENDED' },
        outcome: 'DENIED',
        userId: identity.userId,
      });
      throw authenticationFailure('ACCOUNT_SUSPENDED', 'This account is suspended.');
    }

    const memberships = await this.store.listAvailableMemberships(
      identity.userId,
      input.client_type,
      now,
    );
    const activeMemberships = memberships.filter(
      (membership) => membership.status === 'ACTIVE' && organizationIsActive(membership),
    );

    if (activeMemberships.length === 0) {
      const inactiveOrganization = memberships.some(
        (membership) => !organizationIsActive(membership),
      );
      await this.store.recordAuthenticationAudit({
        ...metadata,
        eventType: 'LOGIN_FAILED',
        metadata: {
          provider,
          reason: inactiveOrganization ? 'CLIENT_INACTIVE' : 'MEMBERSHIP_INACTIVE',
        },
        outcome: 'DENIED',
        userId: identity.userId,
      });

      if (inactiveOrganization) {
        throw authenticationFailure(
          'CLIENT_INACTIVE',
          'The organization for this account is not active.',
        );
      }

      throw authenticationFailure('MEMBERSHIP_INACTIVE', 'No active membership is available.');
    }

    const membership = activeMemberships[0];

    if (!membership) {
      throw authenticationFailure('MEMBERSHIP_REQUIRED', 'A membership is required.');
    }

    const device = this.deviceMetadata(input, metadata);

    // MFA is mandatory for every role — no exceptions. Do not gate this behind
    // membership.roleCode; every authenticated login must clear a challenge
    // (verification if an authenticator is already enrolled, otherwise forced
    // enrollment) before a session is issued.
    const authenticator = await this.store.getActiveMfaAuthenticator(identity.userId);
    const challengeId = randomUUID();
    const challenge = createOpaqueToken(challengeId);
    const expiresAt = new Date(now.getTime() + this.config.mfaChallengeTtlSeconds * 1_000);
    await this.store.createMfaLoginChallenge({
      audit: {
        ...metadata,
        ...(membership.clientOrganizationId
          ? { clientOrganizationId: membership.clientOrganizationId }
          : {}),
        deviceId: device.deviceId,
        eventType: 'MFA_CHALLENGE_ISSUED',
        membershipId: membership.id,
        metadata: { kind: authenticator ? 'VERIFICATION' : 'ENROLLMENT', provider },
        outcome: 'SUCCESS',
        userId: identity.userId,
      },
      authenticationIdentityId: identity.id,
      ...(authenticator ? { authenticatorId: authenticator.id } : {}),
      clientType: input.client_type,
      createdAt: now,
      device,
      expiresAt,
      id: challengeId,
      kind: authenticator ? 'VERIFICATION' : 'ENROLLMENT',
      membershipId: membership.id,
      provider,
      tokenHash: hashOpaqueToken(challenge.secret, this.config.mfaChallengePepper),
      userId: identity.userId,
    });

    return {
      payload: authenticator
        ? {
            challenge_expires_at: expiresAt.toISOString(),
            challenge_token: challenge.token,
            methods: [
              'TOTP',
              ...(authenticator.unusedRecoveryCodeCount > 0 ? (['RECOVERY_CODE'] as const) : []),
            ],
            status: 'MFA_REQUIRED',
          }
        : {
            challenge_expires_at: expiresAt.toISOString(),
            challenge_token: challenge.token,
            status: 'MFA_ENROLLMENT_REQUIRED',
          },
    };
  }

  async completeMfaSession(
    challenge: MfaLoginChallengeRecord,
    metadata: AuthRequestMetadata,
  ): Promise<{ payload: LoginAuthenticatedResponse; refreshToken: string }> {
    const now = new Date();
    const identity = await this.store.getAuthenticationIdentity(challenge.authenticationIdentityId);
    const membership = await this.store.getMembership(challenge.userId, challenge.membershipId);
    if (
      !identity ||
      identity.userId !== challenge.userId ||
      identity.status !== 'ACTIVE' ||
      identity.userStatus !== 'ACTIVE' ||
      !membership ||
      membership.status !== 'ACTIVE' ||
      !organizationIsActive(membership)
    ) {
      throw authenticationFailure(
        'MEMBERSHIP_INACTIVE',
        'The MFA login context is no longer active.',
      );
    }
    const memberships = (
      await this.store.listAvailableMemberships(challenge.userId, challenge.clientType, now)
    ).filter((candidate) => candidate.status === 'ACTIVE' && organizationIsActive(candidate));
    return this.issueSession(
      identity,
      membership,
      memberships,
      challenge.clientType,
      challenge.device,
      metadata,
      challenge.provider,
      true,
    );
  }

  private async issueSession(
    identity: AuthenticationIdentityRecord,
    membership: MembershipAccessRecord,
    activeMemberships: MembershipAccessRecord[],
    clientType: LoginRequest['client_type'],
    device: DeviceMetadata,
    metadata: AuthRequestMetadata,
    provider: 'GOOGLE' | 'PASSWORD',
    mfaVerified = false,
  ): Promise<{ payload: LoginAuthenticatedResponse; refreshToken: string }> {
    const now = new Date();

    const sessionId = randomUUID();
    const refreshRecordId = randomUUID();
    const refresh = createOpaqueToken(refreshRecordId);
    const expiresAt = new Date(now.getTime() + this.config.refreshTokenTtlSeconds * 1_000);
    const audit: AuthenticationAuditInput = {
      ...metadata,
      ...(membership.clientOrganizationId
        ? { clientOrganizationId: membership.clientOrganizationId }
        : {}),
      deviceId: device.deviceId,
      eventType: 'LOGIN_SUCCEEDED',
      metadata: { mfa_verified: mfaVerified, provider },
      membershipId: membership.id,
      outcome: 'SUCCESS',
      sessionId,
      userId: identity.userId,
    };

    await this.store.createSession({
      audit,
      authenticationIdentityId: identity.id,
      clientType,
      device,
      expiresAt,
      membershipId: membership.id,
      refreshToken: {
        expiresAt,
        hash: hashOpaqueToken(refresh.secret, this.config.refreshTokenPepper),
        id: refreshRecordId,
        issuedAt: now,
        sequence: 1,
      },
      sessionId,
      userId: identity.userId,
    });
    await this.store.recordLoginSuccess(identity.id, now);

    const resolved = await this.store.resolveSession(sessionId, membership.id, now);

    if (resolved.kind !== 'active') {
      throw authenticationFailure('SESSION_REVOKED', 'The new session could not be activated.');
    }

    const access = await this.accessTokens.issue({
      membershipId: membership.id,
      sessionId,
      userId: identity.userId,
    });
    const payload = await this.presentGrant(
      resolved.value,
      activeMemberships,
      access.token,
      access.expiresAt,
      expiresAt,
      clientType === 'mobile' ? refresh.token : undefined,
    );

    return {
      payload: {
        ...payload,
        requires_membership_selection: activeMemberships.length > 1,
        status: 'AUTHENTICATED',
      },
      refreshToken: refresh.token,
    };
  }

  private deviceMetadata(
    input: Pick<LoginRequest, 'client_type' | 'device'>,
    metadata: AuthRequestMetadata,
  ): DeviceMetadata {
    return {
      deviceId: input.device?.device_id ?? randomUUID(),
      deviceName:
        input.device?.device_name ??
        (input.client_type === 'mobile' ? 'Android device' : 'Web browser'),
      platform: input.device?.platform ?? (input.client_type === 'mobile' ? 'android' : 'web'),
      ...(metadata.sourceIp ? { sourceIp: metadata.sourceIp } : {}),
      ...(metadata.userAgent ? { userAgent: metadata.userAgent } : {}),
    };
  }

  async refresh(
    presentedToken: string | undefined,
    metadata: AuthRequestMetadata,
  ): Promise<RefreshResult> {
    const parsed = presentedToken ? parseOpaqueToken(presentedToken) : undefined;

    if (!parsed) {
      throw authenticationFailure('REFRESH_TOKEN_INVALID', 'The refresh token is invalid.');
    }

    const now = new Date();
    const replacementId = randomUUID();
    const replacement = createOpaqueToken(replacementId);
    const replacementExpiresAt = new Date(
      now.getTime() + this.config.refreshTokenTtlSeconds * 1_000,
    );
    const rotation = await this.store.rotateRefreshToken({
      audit: {
        ...metadata,
        eventType: 'REFRESH_SUCCEEDED',
        outcome: 'SUCCESS',
      },
      expectedHash: hashOpaqueToken(parsed.secret, this.config.refreshTokenPepper),
      now,
      presentedTokenId: parsed.recordId,
      replacement: {
        expiresAt: replacementExpiresAt,
        hash: hashOpaqueToken(replacement.secret, this.config.refreshTokenPepper),
        id: replacementId,
        issuedAt: now,
      },
    });

    if (rotation.kind === 'invalid') {
      await this.store.recordAuthenticationAudit({
        ...metadata,
        eventType: 'REFRESH_FAILED',
        metadata: { reason: 'REFRESH_TOKEN_INVALID' },
        outcome: 'DENIED',
      });
      throw authenticationFailure('REFRESH_TOKEN_INVALID', 'The refresh token is invalid.');
    }

    if (rotation.kind === 'reused') {
      throw authenticationFailure(
        'REFRESH_TOKEN_REUSED',
        'Refresh-token reuse was detected and this session was revoked.',
      );
    }

    if (rotation.kind !== 'rotated') {
      const mapping = {
        client_inactive: ['CLIENT_INACTIVE', 'The client organization is not active.'],
        membership_inactive: ['MEMBERSHIP_INACTIVE', 'The membership is not active.'],
        session_expired: ['SESSION_EXPIRED', 'The session has expired.'],
        session_revoked: ['SESSION_REVOKED', 'The session has been revoked.'],
        user_inactive: ['ACCOUNT_SUSPENDED', 'The account is not active.'],
      } as const;
      const [code, message] = mapping[rotation.kind];
      await this.store.recordAuthenticationAudit({
        ...metadata,
        ...(rotation.clientOrganizationId
          ? { clientOrganizationId: rotation.clientOrganizationId }
          : {}),
        eventType: 'REFRESH_FAILED',
        ...(rotation.membershipId ? { membershipId: rotation.membershipId } : {}),
        metadata: { reason: code },
        outcome: 'DENIED',
        ...(rotation.sessionId ? { sessionId: rotation.sessionId } : {}),
        ...(rotation.userId ? { userId: rotation.userId } : {}),
      });
      throw authenticationFailure(code, message);
    }

    const session = rotation.session;
    const access = await this.accessTokens.issue({
      membershipId: session.membership.id,
      sessionId: session.context.sessionId,
      userId: session.context.userId,
    });
    const memberships = await this.activeMembershipsFor(session, now);
    const payload = await this.presentGrant(
      session,
      memberships,
      access.token,
      access.expiresAt,
      session.sessionExpiresAt,
      session.session.clientType === 'mobile' ? replacement.token : undefined,
    );

    return { payload, refreshToken: replacement.token };
  }

  async switchMembership(
    authorization: AuthorizationContext,
    membershipId: string,
    metadata: AuthRequestMetadata,
  ): Promise<SwitchMembershipResponse> {
    const session = await this.store.switchMembership({
      audit: {
        ...metadata,
        eventType: 'MEMBERSHIP_SWITCHED',
        outcome: 'SUCCESS',
      },
      membershipId,
      sessionId: authorization.sessionId,
      switchedAt: new Date(),
      userId: authorization.userId,
    });

    if (!session) {
      throw new ForbiddenException({
        code: 'SCOPE_DENIED',
        details: [],
        message: 'That membership is not available to this session.',
        retryable: false,
      });
    }

    const access = await this.accessTokens.issue({
      membershipId: session.membership.id,
      sessionId: session.context.sessionId,
      userId: session.context.userId,
    });

    return {
      access_token: access.token,
      access_token_expires_at: access.expiresAt.toISOString(),
      active_membership: presentMembership(session.membership),
      permissions: [...session.context.permissionCodes].sort(),
      support_elevation: presentSupportElevation(session.context.supportElevation),
    };
  }

  async me(authorization: AuthorizationContext): Promise<MeResponse> {
    const resolution = await this.store.resolveSession(
      authorization.sessionId,
      authorization.membershipId,
      new Date(),
    );

    if (resolution.kind !== 'active') {
      throw authenticationFailure('SESSION_REVOKED', 'The session is no longer active.');
    }

    const memberships = await this.activeMembershipsFor(resolution.value, new Date());
    return this.presentContext(resolution.value, memberships);
  }

  async listSessions(authorization: AuthorizationContext): Promise<SessionListResponse> {
    const sessions = await this.store.listSessions(authorization.userId, authorization.sessionId);
    return { sessions: sessions.map(presentSession) };
  }

  async revokeSession(
    authorization: AuthorizationContext,
    sessionId: string,
    metadata: AuthRequestMetadata,
  ): Promise<RevokeSessionResponse> {
    const revoked = await this.store.revokeSession(
      authorization.userId,
      sessionId,
      new Date(),
      'USER_REVOKED',
      {
        ...metadata,
        ...(authorization.clientOrganizationId
          ? { clientOrganizationId: authorization.clientOrganizationId }
          : {}),
        eventType: 'SESSION_REVOKED',
        membershipId: authorization.membershipId,
        metadata: { revoked_session_id: sessionId },
        outcome: 'SUCCESS',
        sessionId: authorization.sessionId,
        userId: authorization.userId,
      },
    );

    if (!revoked) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        details: [],
        message: 'The session was not found.',
        retryable: false,
      });
    }

    return { revoked: true };
  }

  async logout(
    presentedToken: string | undefined,
    metadata: AuthRequestMetadata,
  ): Promise<LogoutResponse> {
    const parsed = presentedToken ? parseOpaqueToken(presentedToken) : undefined;

    if (parsed) {
      await this.store.revokeByRefreshToken({
        audit: {
          ...metadata,
          eventType: 'LOGOUT',
          outcome: 'SUCCESS',
        },
        expectedHash: hashOpaqueToken(parsed.secret, this.config.refreshTokenPepper),
        presentedTokenId: parsed.recordId,
        revokedAt: new Date(),
      });
    }

    return { logged_out: true };
  }

  async logoutAll(
    authorization: AuthorizationContext,
    metadata: AuthRequestMetadata,
  ): Promise<LogoutAllResponse> {
    const revokedSessions = await this.store.revokeAllSessions(
      authorization.userId,
      new Date(),
      'LOGOUT_ALL',
      {
        ...metadata,
        ...(authorization.clientOrganizationId
          ? { clientOrganizationId: authorization.clientOrganizationId }
          : {}),
        eventType: 'LOGOUT_ALL',
        membershipId: authorization.membershipId,
        outcome: 'SUCCESS',
        sessionId: authorization.sessionId,
        userId: authorization.userId,
      },
    );
    return { revoked_sessions: revokedSessions };
  }

  async forgotPassword(
    email: string,
    metadata: AuthRequestMetadata,
  ): Promise<ForgotPasswordResponse> {
    const identity = await this.store.findPasswordIdentity(email);

    if (!identity || identity.status !== 'ACTIVE' || identity.userStatus !== 'ACTIVE') {
      await this.store.recordAuthenticationAudit({
        ...metadata,
        eventType: 'PASSWORD_RESET_REQUESTED',
        metadata: { eligible: false },
        outcome: 'SUCCESS',
      });
      return { accepted: true };
    }

    const now = new Date();
    const resetId = randomUUID();
    const reset = createOpaqueToken(resetId);
    const expiresAt = new Date(now.getTime() + this.config.passwordResetTokenTtlSeconds * 1_000);
    await this.store.createPasswordReset({
      audit: {
        ...metadata,
        eventType: 'PASSWORD_RESET_REQUESTED',
        outcome: 'SUCCESS',
        userId: identity.userId,
      },
      authenticationIdentityId: identity.id,
      expiresAt,
      id: resetId,
      requestedAt: now,
      tokenHash: hashOpaqueToken(reset.secret, this.config.refreshTokenPepper),
      userId: identity.userId,
    });
    await this.passwordResetDelivery.deliver({
      email: identity.email,
      expiresAt,
      token: reset.token,
    });
    return { accepted: true };
  }

  async resetPassword(
    token: string,
    newPassword: string,
    metadata: AuthRequestMetadata,
  ): Promise<ResetPasswordResponse> {
    const parsed = parseOpaqueToken(token);

    if (!parsed) {
      await this.store.recordAuthenticationAudit({
        ...metadata,
        eventType: 'PASSWORD_RESET_FAILED',
        metadata: { reason: 'TOKEN_MALFORMED' },
        outcome: 'DENIED',
      });
      throw authenticationFailure(
        'PASSWORD_RESET_TOKEN_INVALID',
        'The password reset link is invalid or expired.',
      );
    }

    const tokenHash = hashOpaqueToken(parsed.secret, this.config.refreshTokenPepper);
    const now = new Date();
    const valid = await this.store.validatePasswordReset({
      now,
      resetTokenId: parsed.recordId,
      tokenHash,
    });

    if (!valid) {
      await this.store.recordAuthenticationAudit({
        ...metadata,
        eventType: 'PASSWORD_RESET_FAILED',
        metadata: { reason: 'TOKEN_INVALID_OR_EXPIRED' },
        outcome: 'DENIED',
      });
      throw authenticationFailure(
        'PASSWORD_RESET_TOKEN_INVALID',
        'The password reset link is invalid or expired.',
      );
    }

    const passwordHash = await this.passwords.hash(newPassword, this.config.passwordPepper);
    const result = await this.store.consumePasswordReset({
      audit: {
        ...metadata,
        eventType: 'PASSWORD_RESET_SUCCEEDED',
        outcome: 'SUCCESS',
      },
      consumedAt: now,
      newPasswordHash: passwordHash,
      resetTokenId: parsed.recordId,
      tokenHash,
    });

    if (result.kind !== 'consumed') {
      await this.store.recordAuthenticationAudit({
        ...metadata,
        eventType: 'PASSWORD_RESET_FAILED',
        metadata: { reason: 'TOKEN_INVALID_OR_EXPIRED' },
        outcome: 'DENIED',
      });
      throw authenticationFailure(
        'PASSWORD_RESET_TOKEN_INVALID',
        'The password reset link is invalid or expired.',
      );
    }

    return { password_reset: true };
  }

  async createSupportElevation(
    authorization: AuthorizationContext,
    input: CreateSupportElevationRequest,
    metadata: AuthRequestMetadata,
  ): Promise<SupportElevationResponse> {
    if (!authorization.agencyId || authorization.clientOrganizationId) {
      throw new ForbiddenException({
        code: 'SCOPE_DENIED',
        details: [],
        message:
          'Support elevation requires an agency membership without an active client context.',
        retryable: false,
      });
    }

    const createdAt = new Date();
    const maximumDurationMinutes = Math.floor(this.config.supportElevationTtlSeconds / 60);
    const duration = Math.min(
      input.duration_minutes ?? maximumDurationMinutes,
      maximumDurationMinutes,
    );
    const expiresAt = new Date(createdAt.getTime() + duration * 60_000);
    const elevation = await this.store.createSupportElevation({
      agencyMembershipId: authorization.membershipId,
      audit: {
        ...metadata,
        clientOrganizationId: input.client_organization_id,
        eventType: 'SUPPORT_ELEVATION_STARTED',
        membershipId: authorization.membershipId,
        outcome: 'SUCCESS',
        sessionId: authorization.sessionId,
        userId: authorization.userId,
      },
      createdAt,
      expiresAt,
      id: randomUUID(),
      reason: input.reason,
      sessionId: authorization.sessionId,
      targetClientOrganizationId: input.client_organization_id,
      userId: authorization.userId,
    });

    if (!elevation) {
      await this.store.recordAuthenticationAudit({
        ...metadata,
        eventType: 'ACCESS_DENIED',
        membershipId: authorization.membershipId,
        metadata: {
          reason: 'SUPPORT_TARGET_OUTSIDE_AGENCY_OR_INACTIVE',
          target_client_organization_id: input.client_organization_id,
        },
        outcome: 'DENIED',
        sessionId: authorization.sessionId,
        userId: authorization.userId,
      });
      throw new ForbiddenException({
        code: 'SCOPE_DENIED',
        details: [],
        message: 'The selected client is unavailable for this agency support session.',
        retryable: false,
      });
    }

    return { support_elevation: presentSupportElevation(elevation) };
  }

  async revokeSupportElevation(
    authorization: AuthorizationContext,
    reason: string | undefined,
    metadata: AuthRequestMetadata,
  ): Promise<SupportElevationResponse> {
    const revoked = await this.store.revokeSupportElevation(
      authorization.userId,
      authorization.sessionId,
      new Date(),
      {
        ...metadata,
        ...(authorization.clientOrganizationId
          ? { clientOrganizationId: authorization.clientOrganizationId }
          : {}),
        eventType: 'SUPPORT_ELEVATION_REVOKED',
        membershipId: authorization.membershipId,
        metadata: reason ? { reason } : {},
        outcome: 'SUCCESS',
        sessionId: authorization.sessionId,
        userId: authorization.userId,
      },
    );

    if (!revoked) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        details: [],
        message: 'No active support elevation was found.',
        retryable: false,
      });
    }

    return { support_elevation: null };
  }

  private async activeMembershipsFor(
    session: SessionAccessRecord,
    now: Date,
  ): Promise<MembershipAccessRecord[]> {
    const memberships = await this.store.listAvailableMemberships(
      session.context.userId,
      session.session.clientType,
      now,
    );
    return memberships.filter(
      (membership) => membership.status === 'ACTIVE' && organizationIsActive(membership),
    );
  }

  private presentContext(
    session: SessionAccessRecord,
    memberships: MembershipAccessRecord[],
  ): MeResponse {
    return {
      active_membership: presentMembership(session.membership),
      memberships: memberships.map(presentMembership),
      permissions: [...session.context.permissionCodes].sort(),
      session: presentSession(session.session),
      support_elevation: presentSupportElevation(session.context.supportElevation),
      user: presentResolvedUser(session),
    };
  }

  private async presentGrant(
    session: SessionAccessRecord,
    memberships: MembershipAccessRecord[],
    accessToken: string,
    accessTokenExpiresAt: Date,
    refreshTokenExpiresAt: Date,
    refreshToken: string | undefined,
  ): Promise<RefreshResponse> {
    return {
      ...this.presentContext(session, memberships),
      access_token: accessToken,
      access_token_expires_at: accessTokenExpiresAt.toISOString(),
      ...(refreshToken ? { refresh_token: refreshToken } : {}),
      refresh_token_expires_at: refreshTokenExpiresAt.toISOString(),
    };
  }
}
