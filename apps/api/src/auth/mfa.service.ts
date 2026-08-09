import { Inject, Injectable } from '@nestjs/common';
import type {
  MfaEnrollmentConfirmResponse,
  MfaEnrollmentStartResponse,
  MfaVerificationRequest,
  MfaVerificationResponse,
} from '@gdm/contracts';
import { randomUUID } from 'node:crypto';
import { authenticationFailure } from './auth-exceptions.js';
import {
  AUTH_STORE,
  type AuthenticationAuditInput,
  type AuthStore,
  type MfaLoginChallengeRecord,
} from './auth-store.js';
import { AuthenticationService, type AuthRequestMetadata } from './authentication.service.js';
import { AUTH_RUNTIME_CONFIG, type AuthRuntimeConfig } from './auth-runtime-config.js';
import { MfaSecretProtector } from './mfa-secret-protector.js';
import { hashOpaqueToken, opaqueTokenHashMatches, parseOpaqueToken } from './opaque-token.js';
import { hashRecoveryCode, TotpService } from './totp.service.js';

interface ResolvedChallenge {
  challenge: MfaLoginChallengeRecord;
  tokenHash: string;
}

@Injectable()
export class MfaService {
  constructor(
    @Inject(AUTH_STORE) private readonly store: AuthStore,
    @Inject(AUTH_RUNTIME_CONFIG) private readonly config: AuthRuntimeConfig,
    @Inject(AuthenticationService) private readonly authentication: AuthenticationService,
    @Inject(MfaSecretProtector) private readonly secrets: MfaSecretProtector,
    @Inject(TotpService) private readonly totp: TotpService,
  ) {}

  async startEnrollment(
    challengeToken: string,
    metadata: AuthRequestMetadata,
  ): Promise<MfaEnrollmentStartResponse> {
    const resolved = await this.resolveChallenge(challengeToken, 'ENROLLMENT');
    const identity = await this.store.getAuthenticationIdentity(
      resolved.challenge.authenticationIdentityId,
    );
    if (!identity || identity.userId !== resolved.challenge.userId) this.invalidChallenge();

    let authenticator = resolved.challenge.authenticatorId
      ? await this.store.getMfaAuthenticator(
          resolved.challenge.userId,
          resolved.challenge.authenticatorId,
        )
      : undefined;

    if (!authenticator) {
      const authenticatorId = randomUUID();
      const secret = this.totp.createSecret();
      const protectedSecret = this.secrets.protect(
        secret,
        this.associatedData(resolved.challenge.userId, authenticatorId),
      );
      authenticator = await this.store.startMfaEnrollment({
        audit: this.audit(resolved.challenge, metadata, 'MFA_ENROLLMENT_STARTED', 'SUCCESS'),
        authenticator: {
          id: authenticatorId,
          secretAuthTag: protectedSecret.tag,
          secretCiphertext: protectedSecret.ciphertext,
          secretKeyId: protectedSecret.keyId,
          secretNonce: protectedSecret.nonce,
          status: 'PENDING',
          userId: resolved.challenge.userId,
        },
        challengeId: resolved.challenge.id,
        now: new Date(),
        tokenHash: resolved.tokenHash,
      });
    }

    if (!authenticator || authenticator.status !== 'PENDING') this.invalidChallenge();
    const secret = this.unprotect(authenticator);
    return {
      authenticator_id: authenticator.id,
      challenge_expires_at: resolved.challenge.expiresAt.toISOString(),
      manual_secret: secret,
      otpauth_uri: this.totp.createUri({
        accountName: identity.email,
        issuer: this.config.mfaIssuer,
        secret,
      }),
      status: 'MFA_ENROLLMENT_REQUIRED',
    };
  }

  async confirmEnrollment(
    challengeToken: string,
    code: string,
    metadata: AuthRequestMetadata,
  ): Promise<{
    clientType: MfaLoginChallengeRecord['clientType'];
    payload: MfaEnrollmentConfirmResponse;
    refreshToken: string;
  }> {
    const resolved = await this.resolveChallenge(challengeToken, 'ENROLLMENT');
    const authenticator = resolved.challenge.authenticatorId
      ? await this.store.getMfaAuthenticator(
          resolved.challenge.userId,
          resolved.challenge.authenticatorId,
        )
      : undefined;
    if (!authenticator || authenticator.status !== 'PENDING') this.invalidChallenge();
    const now = new Date();
    const verification = this.totp.verify({ code, now, secret: this.unprotect(authenticator) });
    if (!verification) return await this.failed(resolved, metadata, 'INVALID_TOTP');

    const recoveryCodes = this.totp.createRecoveryCodes();
    const completed = await this.store.completeMfaEnrollment({
      acceptedTimeStep: verification.timeStep,
      audit: this.audit(resolved.challenge, metadata, 'MFA_ENROLLMENT_COMPLETED', 'SUCCESS'),
      authenticatorId: authenticator.id,
      challengeId: resolved.challenge.id,
      completedAt: now,
      maxAttempts: this.config.mfaMaxAttempts,
      recoveryCodes: recoveryCodes.map((recoveryCode) => ({
        hash: hashRecoveryCode(recoveryCode, this.config.mfaRecoveryCodePepper),
        id: randomUUID(),
      })),
      tokenHash: resolved.tokenHash,
    });
    if (!completed) this.invalidChallenge();
    const result = await this.authentication.completeMfaSession(resolved.challenge, metadata);
    return {
      clientType: resolved.challenge.clientType,
      payload: {
        ...result.payload,
        recovery_codes: recoveryCodes,
        recovery_codes_displayed_once: true,
      },
      refreshToken: result.refreshToken,
    };
  }

  async verify(
    input: MfaVerificationRequest,
    metadata: AuthRequestMetadata,
  ): Promise<{
    clientType: MfaLoginChallengeRecord['clientType'];
    payload: MfaVerificationResponse;
    refreshToken: string;
  }> {
    const resolved = await this.resolveChallenge(input.challenge_token, 'VERIFICATION');
    const authenticator = resolved.challenge.authenticatorId
      ? await this.store.getMfaAuthenticator(
          resolved.challenge.userId,
          resolved.challenge.authenticatorId,
        )
      : undefined;
    if (!authenticator || authenticator.status !== 'ACTIVE') this.invalidChallenge();
    const now = new Date();
    let replacementRecoveryCode: string | undefined;
    let completed = false;

    if (input.method === 'TOTP') {
      const verification = this.totp.verify({
        code: input.code,
        ...(authenticator.lastAcceptedTimeStep === undefined
          ? {}
          : { lastAcceptedTimeStep: authenticator.lastAcceptedTimeStep }),
        now,
        secret: this.unprotect(authenticator),
      });
      if (!verification) {
        return await this.failed(resolved, metadata, 'INVALID_OR_REPLAYED_TOTP');
      }
      completed = await this.store.completeMfaTotpVerification({
        acceptedTimeStep: verification.timeStep,
        audit: this.audit(resolved.challenge, metadata, 'MFA_VERIFICATION_SUCCEEDED', 'SUCCESS'),
        authenticatorId: authenticator.id,
        challengeId: resolved.challenge.id,
        completedAt: now,
        maxAttempts: this.config.mfaMaxAttempts,
        tokenHash: resolved.tokenHash,
      });
    } else {
      const generatedReplacement = this.totp.createRecoveryCodes(1)[0];
      if (!generatedReplacement) this.invalidChallenge();
      replacementRecoveryCode = generatedReplacement;
      completed = await this.store.completeMfaRecoveryVerification({
        audit: this.audit(resolved.challenge, metadata, 'MFA_RECOVERY_CODE_USED', 'SUCCESS'),
        authenticatorId: authenticator.id,
        challengeId: resolved.challenge.id,
        codeHash: hashRecoveryCode(input.code, this.config.mfaRecoveryCodePepper),
        completedAt: now,
        maxAttempts: this.config.mfaMaxAttempts,
        replacement: {
          hash: hashRecoveryCode(replacementRecoveryCode, this.config.mfaRecoveryCodePepper),
          id: randomUUID(),
        },
        tokenHash: resolved.tokenHash,
        userId: resolved.challenge.userId,
      });
    }

    if (!completed) return await this.failed(resolved, metadata, 'INVALID_MFA_CODE');
    const result = await this.authentication.completeMfaSession(resolved.challenge, metadata);
    return {
      clientType: resolved.challenge.clientType,
      payload: {
        ...result.payload,
        ...(replacementRecoveryCode ? { replacement_recovery_code: replacementRecoveryCode } : {}),
      },
      refreshToken: result.refreshToken,
    };
  }

  private async resolveChallenge(
    token: string,
    expectedKind: MfaLoginChallengeRecord['kind'],
  ): Promise<ResolvedChallenge> {
    const parsed = parseOpaqueToken(token);
    if (!parsed) this.invalidChallenge();
    const challenge = await this.store.getMfaLoginChallenge(parsed.recordId);
    const tokenHash = hashOpaqueToken(parsed.secret, this.config.mfaChallengePepper);
    if (
      !challenge ||
      challenge.kind !== expectedKind ||
      challenge.consumedAt ||
      challenge.expiresAt.getTime() <= Date.now() ||
      challenge.failedAttemptCount >= this.config.mfaMaxAttempts ||
      !opaqueTokenHashMatches(challenge.tokenHash, tokenHash)
    ) {
      this.invalidChallenge();
    }
    return { challenge, tokenHash };
  }

  private async failed(
    resolved: ResolvedChallenge,
    metadata: AuthRequestMetadata,
    reason: string,
  ): Promise<never> {
    await this.store.recordMfaChallengeFailure({
      audit: this.audit(resolved.challenge, metadata, 'MFA_VERIFICATION_FAILED', 'DENIED', reason),
      challengeId: resolved.challenge.id,
      failedAt: new Date(),
      maxAttempts: this.config.mfaMaxAttempts,
      tokenHash: resolved.tokenHash,
    });
    this.invalidChallenge();
  }

  private audit(
    challenge: MfaLoginChallengeRecord,
    metadata: AuthRequestMetadata,
    eventType: string,
    outcome: AuthenticationAuditInput['outcome'],
    reason?: string,
  ): AuthenticationAuditInput {
    return {
      ...metadata,
      deviceId: challenge.device.deviceId,
      eventType,
      membershipId: challenge.membershipId,
      metadata: {
        kind: challenge.kind,
        provider: challenge.provider,
        ...(reason ? { reason } : {}),
      },
      outcome,
      userId: challenge.userId,
    };
  }

  private associatedData(userId: string, authenticatorId: string): string {
    return `${userId}:${authenticatorId}`;
  }

  private unprotect(authenticator: {
    id: string;
    secretAuthTag: string;
    secretCiphertext: string;
    secretKeyId: string;
    secretNonce: string;
    userId: string;
  }): string {
    return this.secrets.unprotect(
      {
        ciphertext: authenticator.secretCiphertext,
        keyId: authenticator.secretKeyId,
        nonce: authenticator.secretNonce,
        tag: authenticator.secretAuthTag,
      },
      this.associatedData(authenticator.userId, authenticator.id),
    );
  }

  private invalidChallenge(): never {
    throw authenticationFailure(
      'MFA_CHALLENGE_INVALID',
      'The MFA challenge or code is invalid, expired, or already used.',
    );
  }
}
