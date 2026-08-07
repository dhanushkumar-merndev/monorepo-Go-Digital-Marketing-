import { Inject, Injectable } from '@nestjs/common';
import type { AuthClientType, DevicePlatform, PermissionCode } from '@gdm/contracts';
import { type DatabaseConnection, schema } from '@gdm/database';
import { and, desc, eq, gt, isNull, inArray, lt, lte, or, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../infrastructure/database/database.tokens.js';
import type {
  AuthorizationContext,
  SupportElevationContext,
} from '../authorization/authorization.types.js';
import { opaqueTokenHashMatches } from './opaque-token.js';
import type {
  AuthenticationAuditInput,
  AuthenticationMethodRecord,
  AuthStore,
  BranchRecord,
  ClientOrganizationRecord,
  ConsumeExternalAuthChallengeInput,
  ConsumedExternalAuthChallenge,
  CreateExternalAuthChallengeInput,
  CreateSessionInput,
  CreateSupportElevationInput,
  GoogleLoginIdentityResolution,
  LinkGoogleIdentityInput,
  LinkGoogleIdentityResult,
  LoginFailurePolicy,
  MembershipAccessRecord,
  PasswordIdentityRecord,
  PasswordResetConsumeInput,
  PasswordResetConsumeResult,
  PasswordResetIssueInput,
  PasswordResetValidationInput,
  RefreshRotationResult,
  RevokeByRefreshTokenInput,
  ResolveGoogleLoginIdentityInput,
  RotateRefreshTokenInput,
  SessionAccessRecord,
  SessionResolution,
  SessionSummaryRecord,
  SwitchMembershipInput,
  TeamRecord,
  TenantUserRecord,
  UnlinkGoogleIdentityResult,
} from './auth-store.js';

type AuditEventType = (typeof schema.authenticationAuditEventTypeEnum.enumValues)[number];
type AuthenticationAuditInsert = typeof schema.authenticationAuditEvents.$inferInsert;

function databaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('code' in error && typeof error.code === 'string') return error.code;
  return 'cause' in error ? databaseErrorCode(error.cause) : undefined;
}

function clientTypeFromDatabase(value: 'MOBILE' | 'WEB'): AuthClientType {
  return value.toLowerCase() as AuthClientType;
}

function clientTypeToDatabase(value: AuthClientType): 'MOBILE' | 'WEB' {
  return value.toUpperCase() as 'MOBILE' | 'WEB';
}

function devicePlatformFromDatabase(value: 'ANDROID' | 'IOS' | 'UNKNOWN' | 'WEB'): DevicePlatform {
  return value.toLowerCase() as DevicePlatform;
}

function devicePlatformToDatabase(value: DevicePlatform): 'ANDROID' | 'IOS' | 'UNKNOWN' | 'WEB' {
  return value.toUpperCase() as 'ANDROID' | 'IOS' | 'UNKNOWN' | 'WEB';
}

function auditValues(
  input: AuthenticationAuditInput,
  supportElevationId?: string,
): AuthenticationAuditInsert {
  return {
    scope: input.clientOrganizationId ? ('CLIENT' as const) : ('PLATFORM' as const),
    ...(input.clientOrganizationId ? { clientOrganizationId: input.clientOrganizationId } : {}),
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.membershipId ? { membershipId: input.membershipId } : {}),
    ...(supportElevationId ? { supportElevationId } : {}),
    eventType: input.eventType as AuditEventType,
    outcome: input.outcome,
    correlationId: input.correlationId,
    ...(input.sourceIp ? { sourceIp: input.sourceIp } : {}),
    ...(input.userAgent ? { userAgent: input.userAgent } : {}),
    ...(input.deviceId ? { deviceId: input.deviceId } : {}),
    ...(input.identifierHash ? { identifierHash: input.identifierHash } : {}),
    metadata: input.metadata ?? {},
  };
}

function composePasswordHash(input: {
  digest: string | null;
  keyLength: number | null;
  n: number | null;
  p: number | null;
  r: number | null;
  salt: string | null;
}): string | undefined {
  if (
    !input.digest ||
    !input.salt ||
    input.n === null ||
    input.r === null ||
    input.p === null ||
    input.keyLength === null
  ) {
    return undefined;
  }

  return `$scrypt$${input.n}$${input.r}$${input.p}$${input.salt}$${input.digest}`;
}

function splitPasswordHash(encoded: string): {
  digest: string;
  keyLength: number;
  n: number;
  p: number;
  r: number;
  salt: string;
} {
  const [empty, algorithm, nValue, rValue, pValue, salt, digest] = encoded.split('$');
  const n = Number(nValue);
  const r = Number(rValue);
  const p = Number(pValue);

  if (
    empty !== '' ||
    algorithm !== 'scrypt' ||
    !salt ||
    !digest ||
    !Number.isInteger(n) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p)
  ) {
    throw new Error('PasswordHasher returned an unsupported encoded value.');
  }

  return { digest, keyLength: 64, n, p, r, salt };
}

@Injectable()
export class DrizzleAuthStore implements AuthStore {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
  ) {}

  async createExternalAuthChallenge(input: CreateExternalAuthChallengeInput): Promise<void> {
    await this.connection.db.insert(schema.externalAuthChallenges).values({
      clientType: clientTypeToDatabase(input.clientType),
      expiresAt: input.expiresAt,
      id: input.id,
      nonceHash: input.nonceHash,
      purpose: input.purpose,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
    });
  }

  async consumeExternalAuthChallenge(
    input: ConsumeExternalAuthChallengeInput,
  ): Promise<ConsumedExternalAuthChallenge | undefined> {
    const binding =
      input.purpose === 'LOGIN'
        ? and(
            isNull(schema.externalAuthChallenges.userId),
            isNull(schema.externalAuthChallenges.sessionId),
          )
        : and(
            eq(schema.externalAuthChallenges.userId, input.userId ?? ''),
            eq(schema.externalAuthChallenges.sessionId, input.sessionId ?? ''),
          );
    const [consumed] = await this.connection.db
      .update(schema.externalAuthChallenges)
      .set({ consumedAt: input.consumedAt })
      .where(
        and(
          eq(schema.externalAuthChallenges.id, input.challengeId),
          eq(schema.externalAuthChallenges.purpose, input.purpose),
          ...(input.clientType
            ? [eq(schema.externalAuthChallenges.clientType, clientTypeToDatabase(input.clientType))]
            : []),
          isNull(schema.externalAuthChallenges.consumedAt),
          gt(schema.externalAuthChallenges.expiresAt, input.consumedAt),
          binding,
        ),
      )
      .returning({
        clientType: schema.externalAuthChallenges.clientType,
        nonceHash: schema.externalAuthChallenges.nonceHash,
      });

    return consumed
      ? { clientType: clientTypeFromDatabase(consumed.clientType), nonceHash: consumed.nonceHash }
      : undefined;
  }

  async findPasswordIdentity(email: string): Promise<PasswordIdentityRecord | undefined> {
    const [row] = await this.connection.db
      .select({
        digest: schema.authenticationIdentities.passwordDigest,
        email: schema.users.primaryEmailNormalized,
        failedAttempts: schema.authenticationIdentities.failedAttemptCount,
        identityId: schema.authenticationIdentities.id,
        identityStatus: schema.authenticationIdentities.status,
        keyLength: schema.authenticationIdentities.passwordKeyLength,
        lockedUntil: schema.authenticationIdentities.lockedUntil,
        n: schema.authenticationIdentities.passwordScryptN,
        p: schema.authenticationIdentities.passwordScryptP,
        r: schema.authenticationIdentities.passwordScryptR,
        salt: schema.authenticationIdentities.passwordSalt,
        userDisplayName: schema.users.displayName,
        userId: schema.users.id,
        userStatus: schema.users.status,
      })
      .from(schema.authenticationIdentities)
      .innerJoin(schema.users, eq(schema.authenticationIdentities.userId, schema.users.id))
      .where(
        and(
          eq(schema.authenticationIdentities.provider, 'PASSWORD'),
          eq(schema.authenticationIdentities.providerKey, 'LOCAL'),
          eq(schema.authenticationIdentities.subjectNormalized, email),
        ),
      )
      .limit(1);
    const passwordHash = row ? composePasswordHash(row) : undefined;

    if (!row || !passwordHash) {
      return undefined;
    }

    return {
      email: row.email,
      failedAttempts: row.failedAttempts,
      id: row.identityId,
      ...(row.lockedUntil ? { lockedUntil: row.lockedUntil } : {}),
      passwordHash,
      status: row.identityStatus,
      userDisplayName: row.userDisplayName,
      userId: row.userId,
      userStatus: row.userStatus,
    };
  }

  async resolveGoogleLoginIdentity(
    input: ResolveGoogleLoginIdentityInput,
  ): Promise<GoogleLoginIdentityResolution> {
    try {
      return await this.connection.db.transaction(async (transaction) => {
        const [linked] = await transaction
          .select({
            email: schema.users.primaryEmailNormalized,
            id: schema.authenticationIdentities.id,
            providerEmail: schema.authenticationIdentities.providerEmailNormalized,
            status: schema.authenticationIdentities.status,
            userDisplayName: schema.users.displayName,
            userId: schema.users.id,
            userStatus: schema.users.status,
          })
          .from(schema.authenticationIdentities)
          .innerJoin(schema.users, eq(schema.authenticationIdentities.userId, schema.users.id))
          .where(
            and(
              eq(schema.authenticationIdentities.provider, 'OAUTH'),
              eq(schema.authenticationIdentities.providerKey, 'GOOGLE'),
              eq(schema.authenticationIdentities.subjectNormalized, input.providerSubject),
            ),
          )
          .limit(1);

        if (linked) {
          if (linked.providerEmail !== input.email || linked.email !== input.email) {
            return { kind: 'identity_conflict' };
          }
          if (linked.userStatus === 'DEACTIVATED' || linked.status === 'DISABLED') {
            return { kind: 'account_disabled' };
          }
          if (linked.userStatus === 'SUSPENDED' || linked.status === 'SUSPENDED') {
            return { kind: 'account_suspended' };
          }
          if (linked.userStatus !== 'ACTIVE') {
            return { kind: 'not_invited' };
          }

          return {
            identity: {
              email: linked.email,
              id: linked.id,
              providerEmail: linked.providerEmail,
              status: linked.status,
              userDisplayName: linked.userDisplayName,
              userId: linked.userId,
              userStatus: linked.userStatus,
            },
            kind: 'identity',
          };
        }

        const [candidate] = await transaction
          .select({
            displayName: schema.users.displayName,
            email: schema.users.primaryEmailNormalized,
            id: schema.users.id,
            status: schema.users.status,
          })
          .from(schema.users)
          .where(eq(schema.users.primaryEmailNormalized, input.email))
          .limit(1);

        if (!candidate) return { kind: 'not_invited' };
        if (candidate.status === 'ACTIVE') return { kind: 'account_linking_required' };
        if (candidate.status === 'SUSPENDED') return { kind: 'account_suspended' };
        if (candidate.status === 'DEACTIVATED') return { kind: 'account_disabled' };

        await transaction.execute(
          sql`select ${schema.users.id} from ${schema.users} where ${schema.users.id} = ${candidate.id} for update`,
        );
        const [lockedCandidate] = await transaction
          .select({
            displayName: schema.users.displayName,
            email: schema.users.primaryEmailNormalized,
            id: schema.users.id,
            status: schema.users.status,
          })
          .from(schema.users)
          .where(eq(schema.users.id, candidate.id))
          .limit(1);
        if (!lockedCandidate || lockedCandidate.email !== input.email)
          return { kind: 'not_invited' };
        if (lockedCandidate.status === 'ACTIVE') return { kind: 'account_linking_required' };
        if (lockedCandidate.status === 'SUSPENDED') return { kind: 'account_suspended' };
        if (lockedCandidate.status === 'DEACTIVATED') return { kind: 'account_disabled' };
        await transaction.execute(
          sql`select ${schema.memberships.id} from ${schema.memberships} where ${schema.memberships.userId} = ${lockedCandidate.id} for update`,
        );

        const invitedMemberships = await transaction
          .select({
            agencyStatus: schema.agencies.status,
            clientOrganizationId: schema.clientOrganizations.id,
            clientStatus: schema.clientOrganizations.status,
            contextType: schema.memberships.contextType,
            id: schema.memberships.id,
          })
          .from(schema.memberships)
          .innerJoin(schema.roles, eq(schema.memberships.roleId, schema.roles.id))
          .leftJoin(schema.agencies, eq(schema.memberships.agencyId, schema.agencies.id))
          .leftJoin(
            schema.clientOrganizations,
            eq(schema.memberships.clientOrganizationId, schema.clientOrganizations.id),
          )
          .where(
            and(
              eq(schema.memberships.userId, lockedCandidate.id),
              eq(schema.memberships.status, 'INVITED'),
              eq(schema.roles.application, clientTypeToDatabase(input.clientType)),
              eq(schema.roles.active, true),
              lte(schema.memberships.effectiveFrom, input.now),
              or(
                isNull(schema.memberships.effectiveUntil),
                gt(schema.memberships.effectiveUntil, input.now),
              ),
            ),
          );

        if (invitedMemberships.length === 0) return { kind: 'not_invited' };
        const eligibleMemberships = invitedMemberships.filter((membership) =>
          membership.contextType === 'AGENCY'
            ? membership.agencyStatus === 'ACTIVE'
            : membership.clientStatus === 'ACTIVE',
        );

        if (eligibleMemberships.length === 0) return { kind: 'client_inactive' };

        await transaction.insert(schema.authenticationIdentities).values({
          createdAt: input.now,
          id: input.identityId,
          provider: 'OAUTH',
          providerEmailNormalized: input.email,
          providerKey: 'GOOGLE',
          status: 'ACTIVE',
          subjectNormalized: input.providerSubject,
          updatedAt: input.now,
          userId: lockedCandidate.id,
          verifiedAt: input.now,
        });
        const activatedUsers = await transaction
          .update(schema.users)
          .set({ status: 'ACTIVE', updatedAt: input.now })
          .where(and(eq(schema.users.id, lockedCandidate.id), eq(schema.users.status, 'INVITED')))
          .returning({ id: schema.users.id });
        if (activatedUsers.length !== 1) {
          throw new Error('Invited user changed during Google account activation.');
        }
        const activatedMemberships = await transaction
          .update(schema.memberships)
          .set({ status: 'ACTIVE', updatedAt: input.now })
          .where(
            and(
              eq(schema.memberships.status, 'INVITED'),
              inArray(
                schema.memberships.id,
                eligibleMemberships.map(({ id }) => id),
              ),
            ),
          )
          .returning({ id: schema.memberships.id });
        if (activatedMemberships.length !== eligibleMemberships.length) {
          throw new Error('Invited memberships changed during Google account activation.');
        }

        await transaction.insert(schema.authenticationAuditEvents).values([
          auditValues({
            ...input.audit,
            eventType: 'IDENTITY_LINKED',
            metadata: { ...input.audit.metadata, provider: 'GOOGLE', source: 'INVITATION' },
            outcome: 'SUCCESS',
            userId: lockedCandidate.id,
          }),
          ...eligibleMemberships.map((membership) =>
            auditValues({
              ...input.audit,
              ...(membership.clientOrganizationId
                ? { clientOrganizationId: membership.clientOrganizationId }
                : {}),
              eventType: 'INVITATION_ACTIVATED',
              membershipId: membership.id,
              metadata: { ...input.audit.metadata, provider: 'GOOGLE' },
              outcome: 'SUCCESS',
              userId: lockedCandidate.id,
            }),
          ),
        ]);

        return {
          identity: {
            email: lockedCandidate.email,
            id: input.identityId,
            providerEmail: input.email,
            status: 'ACTIVE',
            userDisplayName: lockedCandidate.displayName,
            userId: lockedCandidate.id,
            userStatus: 'ACTIVE',
          },
          kind: 'invitation_activated',
        };
      });
    } catch (error) {
      if (databaseErrorCode(error) === '23505') return { kind: 'identity_conflict' };
      throw error;
    }
  }

  async listAuthenticationMethods(userId: string): Promise<AuthenticationMethodRecord[]> {
    const rows = await this.connection.db
      .select({
        createdAt: schema.authenticationIdentities.createdAt,
        id: schema.authenticationIdentities.id,
        lastAuthenticatedAt: schema.authenticationIdentities.lastAuthenticatedAt,
        provider: schema.authenticationIdentities.provider,
        providerEmail: schema.authenticationIdentities.providerEmailNormalized,
        providerKey: schema.authenticationIdentities.providerKey,
        status: schema.authenticationIdentities.status,
        subject: schema.authenticationIdentities.subjectNormalized,
      })
      .from(schema.authenticationIdentities)
      .where(eq(schema.authenticationIdentities.userId, userId))
      .orderBy(schema.authenticationIdentities.createdAt, schema.authenticationIdentities.id);

    return rows.flatMap((row): AuthenticationMethodRecord[] => {
      const provider =
        row.provider === 'PASSWORD' && row.providerKey === 'LOCAL'
          ? ('PASSWORD' as const)
          : row.provider === 'OAUTH' && row.providerKey === 'GOOGLE'
            ? ('GOOGLE' as const)
            : undefined;
      if (!provider) return [];
      return [
        {
          createdAt: row.createdAt,
          email: row.providerEmail ?? row.subject,
          id: row.id,
          ...(row.lastAuthenticatedAt ? { lastAuthenticatedAt: row.lastAuthenticatedAt } : {}),
          provider,
          status: row.status,
        },
      ];
    });
  }

  async getSessionClientType(
    userId: string,
    sessionId: string,
  ): Promise<AuthClientType | undefined> {
    const [session] = await this.connection.db
      .select({ clientType: schema.refreshSessions.clientType })
      .from(schema.refreshSessions)
      .where(
        and(
          eq(schema.refreshSessions.userId, userId),
          eq(schema.refreshSessions.id, sessionId),
          isNull(schema.refreshSessions.revokedAt),
          gt(schema.refreshSessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return session ? clientTypeFromDatabase(session.clientType) : undefined;
  }

  async recordLoginFailure(
    identityId: string,
    failedAt: Date,
    lockUntil?: Date,
    policy?: LoginFailurePolicy,
  ): Promise<void> {
    const policyLockUntil = policy
      ? new Date(failedAt.getTime() + policy.lockoutSeconds * 1_000)
      : undefined;
    await this.connection.db
      .update(schema.authenticationIdentities)
      .set({
        failedAttemptCount: sql`${schema.authenticationIdentities.failedAttemptCount} + 1`,
        ...(policy && policyLockUntil
          ? {
              lockedUntil: sql`CASE
                WHEN ${schema.authenticationIdentities.failedAttemptCount} + 1 >= ${policy.maxAttempts}
                  THEN CASE
                    WHEN ${schema.authenticationIdentities.lockedUntil} IS NULL
                      OR ${schema.authenticationIdentities.lockedUntil} < ${policyLockUntil}
                    THEN ${policyLockUntil}
                    ELSE ${schema.authenticationIdentities.lockedUntil}
                  END
                ELSE ${schema.authenticationIdentities.lockedUntil}
              END`,
            }
          : lockUntil
            ? { lockedUntil: lockUntil }
            : {}),
        updatedAt: failedAt,
      })
      .where(eq(schema.authenticationIdentities.id, identityId));
  }

  async recordLoginSuccess(identityId: string, authenticatedAt: Date): Promise<void> {
    await this.connection.db
      .update(schema.authenticationIdentities)
      .set({
        failedAttemptCount: 0,
        lastAuthenticatedAt: authenticatedAt,
        lockedUntil: null,
        updatedAt: authenticatedAt,
      })
      .where(eq(schema.authenticationIdentities.id, identityId));
  }

  async listAvailableMemberships(
    userId: string,
    clientType: AuthClientType,
    now: Date,
  ): Promise<MembershipAccessRecord[]> {
    const rows = await this.connection.db
      .select({
        agencyDisplayName: schema.agencies.displayName,
        agencyId: schema.agencies.id,
        agencyStatus: schema.agencies.status,
        assignmentScope: schema.memberships.assignmentScope,
        branchScopeMode: schema.memberships.branchScopeMode,
        departmentScopeMode: schema.memberships.departmentScopeMode,
        clientAgencyId: schema.clientOrganizations.agencyId,
        clientDisplayName: schema.clientOrganizations.displayName,
        clientId: schema.clientOrganizations.id,
        clientLegalName: schema.clientOrganizations.legalName,
        clientStatus: schema.clientOrganizations.status,
        clientTimezone: schema.clientOrganizations.timezone,
        contextType: schema.memberships.contextType,
        effectiveFrom: schema.memberships.effectiveFrom,
        effectiveUntil: schema.memberships.effectiveUntil,
        id: schema.memberships.id,
        jobTitle: schema.memberships.jobTitle,
        roleApplication: schema.roles.application,
        roleCode: schema.roles.code,
        roleDisplayName: schema.roles.displayName,
        roleId: schema.roles.id,
        status: schema.memberships.status,
        teamScopeMode: schema.memberships.teamScopeMode,
      })
      .from(schema.memberships)
      .innerJoin(schema.roles, eq(schema.memberships.roleId, schema.roles.id))
      .leftJoin(schema.agencies, eq(schema.memberships.agencyId, schema.agencies.id))
      .leftJoin(
        schema.clientOrganizations,
        eq(schema.memberships.clientOrganizationId, schema.clientOrganizations.id),
      )
      .where(
        and(
          eq(schema.memberships.userId, userId),
          eq(schema.roles.application, clientTypeToDatabase(clientType)),
          eq(schema.roles.active, true),
          lte(schema.memberships.effectiveFrom, now),
          or(isNull(schema.memberships.effectiveUntil), gt(schema.memberships.effectiveUntil, now)),
        ),
      )
      .orderBy(schema.memberships.createdAt, schema.memberships.id);

    return Promise.all(rows.map((row) => this.hydrateMembership(userId, row)));
  }

  async getMembership(
    userId: string,
    membershipId: string,
  ): Promise<MembershipAccessRecord | undefined> {
    const [row] = await this.connection.db
      .select({
        agencyDisplayName: schema.agencies.displayName,
        agencyId: schema.agencies.id,
        agencyStatus: schema.agencies.status,
        assignmentScope: schema.memberships.assignmentScope,
        branchScopeMode: schema.memberships.branchScopeMode,
        departmentScopeMode: schema.memberships.departmentScopeMode,
        clientAgencyId: schema.clientOrganizations.agencyId,
        clientDisplayName: schema.clientOrganizations.displayName,
        clientId: schema.clientOrganizations.id,
        clientLegalName: schema.clientOrganizations.legalName,
        clientStatus: schema.clientOrganizations.status,
        clientTimezone: schema.clientOrganizations.timezone,
        contextType: schema.memberships.contextType,
        effectiveFrom: schema.memberships.effectiveFrom,
        effectiveUntil: schema.memberships.effectiveUntil,
        id: schema.memberships.id,
        jobTitle: schema.memberships.jobTitle,
        roleApplication: schema.roles.application,
        roleCode: schema.roles.code,
        roleDisplayName: schema.roles.displayName,
        roleId: schema.roles.id,
        status: schema.memberships.status,
        teamScopeMode: schema.memberships.teamScopeMode,
      })
      .from(schema.memberships)
      .innerJoin(schema.roles, eq(schema.memberships.roleId, schema.roles.id))
      .leftJoin(schema.agencies, eq(schema.memberships.agencyId, schema.agencies.id))
      .leftJoin(
        schema.clientOrganizations,
        eq(schema.memberships.clientOrganizationId, schema.clientOrganizations.id),
      )
      .where(
        and(
          eq(schema.memberships.userId, userId),
          eq(schema.memberships.id, membershipId),
          eq(schema.roles.active, true),
        ),
      )
      .limit(1);

    return row ? this.hydrateMembership(userId, row) : undefined;
  }

  async createSession(input: CreateSessionInput): Promise<void> {
    await this.connection.db.transaction(async (transaction) => {
      await transaction.insert(schema.refreshSessions).values({
        authenticationIdentityId: input.authenticationIdentityId,
        clientType: clientTypeToDatabase(input.clientType),
        currentMembershipId: input.membershipId,
        deviceId: input.device.deviceId,
        deviceName: input.device.deviceName,
        devicePlatform: devicePlatformToDatabase(input.device.platform),
        expiresAt: input.expiresAt,
        id: input.sessionId,
        lastSeenAt: input.refreshToken.issuedAt,
        ...(input.device.sourceIp ? { sourceIp: input.device.sourceIp } : {}),
        ...(input.device.userAgent ? { userAgent: input.device.userAgent } : {}),
        userId: input.userId,
      });
      await transaction.insert(schema.refreshTokenRotations).values({
        expiresAt: input.refreshToken.expiresAt,
        id: input.refreshToken.id,
        issuedAt: input.refreshToken.issuedAt,
        sequence: input.refreshToken.sequence,
        sessionId: input.sessionId,
        tokenHash: input.refreshToken.hash,
      });
      await transaction.insert(schema.authenticationAuditEvents).values(auditValues(input.audit));
    });
  }

  async resolveSession(
    sessionId: string,
    membershipId: string,
    now: Date,
  ): Promise<SessionResolution> {
    const [row] = await this.connection.db
      .select({
        clientType: schema.refreshSessions.clientType,
        createdAt: schema.refreshSessions.createdAt,
        currentMembershipId: schema.refreshSessions.currentMembershipId,
        deviceId: schema.refreshSessions.deviceId,
        deviceName: schema.refreshSessions.deviceName,
        devicePlatform: schema.refreshSessions.devicePlatform,
        email: schema.users.primaryEmailNormalized,
        expiresAt: schema.refreshSessions.expiresAt,
        identityStatus: schema.authenticationIdentities.status,
        lastSeenAt: schema.refreshSessions.lastSeenAt,
        revokedAt: schema.refreshSessions.revokedAt,
        sessionId: schema.refreshSessions.id,
        userDisplayName: schema.users.displayName,
        userId: schema.users.id,
        userStatus: schema.users.status,
      })
      .from(schema.refreshSessions)
      .innerJoin(
        schema.authenticationIdentities,
        eq(schema.refreshSessions.authenticationIdentityId, schema.authenticationIdentities.id),
      )
      .innerJoin(schema.users, eq(schema.refreshSessions.userId, schema.users.id))
      .where(eq(schema.refreshSessions.id, sessionId))
      .limit(1);

    if (!row || row.revokedAt || row.currentMembershipId !== membershipId) {
      return { kind: 'session_revoked' };
    }

    if (row.expiresAt.getTime() <= now.getTime()) {
      await this.invalidateSession(row.sessionId, row.userId, membershipId, now, 'EXPIRED');
      return { kind: 'session_expired', userId: row.userId };
    }

    if (row.userStatus !== 'ACTIVE' || row.identityStatus !== 'ACTIVE') {
      await this.invalidateSession(
        row.sessionId,
        row.userId,
        membershipId,
        now,
        'ACCOUNT_INACTIVE',
      );
      return { kind: 'user_inactive', userId: row.userId };
    }

    const membership = await this.getMembership(row.userId, membershipId);

    if (
      !membership ||
      membership.roleApplication !== row.clientType ||
      membership.status !== 'ACTIVE' ||
      membership.effectiveFrom.getTime() > now.getTime() ||
      (membership.effectiveUntil?.getTime() ?? Number.POSITIVE_INFINITY) <= now.getTime()
    ) {
      await this.invalidateSession(
        row.sessionId,
        row.userId,
        membershipId,
        now,
        'MEMBERSHIP_INACTIVE',
        membership?.clientOrganizationId,
      );
      return { kind: 'membership_inactive', userId: row.userId };
    }

    if (
      (membership.contextType === 'AGENCY' && membership.agencyStatus !== 'ACTIVE') ||
      (membership.contextType === 'CLIENT' && membership.clientStatus !== 'ACTIVE')
    ) {
      await this.invalidateSession(
        row.sessionId,
        row.userId,
        membershipId,
        now,
        'ORGANIZATION_INACTIVE',
        membership.clientOrganizationId,
      );
      return { kind: 'client_inactive', userId: row.userId };
    }

    const support =
      membership.contextType === 'AGENCY'
        ? await this.loadSupportElevation(row.userId, row.sessionId, membership.id, now)
        : undefined;
    const context: AuthorizationContext = {
      ...(membership.agencyId ? { agencyId: membership.agencyId } : {}),
      assignmentScope: support ? 'ALL' : membership.assignmentScope,
      branchIds: new Set(membership.branchIds),
      branchScopeMode: support ? 'ALL' : membership.branchScopeMode,
      departmentIds: new Set(membership.departmentIds),
      departmentScopeMode: support ? 'ALL' : membership.departmentScopeMode,
      ...(support
        ? { clientOrganizationId: support.targetClientOrganizationId }
        : membership.clientOrganizationId
          ? { clientOrganizationId: membership.clientOrganizationId }
          : {}),
      membershipId: membership.id,
      managedTeamIds: new Set(membership.managedTeamIds),
      permissionCodes: new Set(membership.permissionCodes),
      roleCode: membership.roleCode,
      sessionId: row.sessionId,
      ...(support ? { supportElevation: support } : {}),
      teamIds: new Set(membership.teamIds),
      teamScopeMode: support ? 'ALL' : membership.teamScopeMode,
      userId: row.userId,
    };
    const session: SessionSummaryRecord = {
      clientType: clientTypeFromDatabase(row.clientType),
      createdAt: row.createdAt,
      current: true,
      ...(row.deviceId ? { deviceId: row.deviceId } : {}),
      ...(row.deviceName ? { deviceName: row.deviceName } : {}),
      expiresAt: row.expiresAt,
      id: row.sessionId,
      lastSeenAt: row.lastSeenAt,
      platform: devicePlatformFromDatabase(row.devicePlatform),
    };

    return {
      kind: 'active',
      value: {
        context,
        membership,
        session,
        sessionExpiresAt: row.expiresAt,
        userDisplayName: row.userDisplayName,
        userEmail: row.email,
        userStatus: row.userStatus,
      },
    };
  }

  async rotateRefreshToken(input: RotateRefreshTokenInput): Promise<RefreshRotationResult> {
    const outcome = await this.connection.db.transaction(async (transaction) => {
      const [row] = await transaction
        .select({
          agencyStatus: schema.agencies.status,
          clientStatus: schema.clientOrganizations.status,
          currentMembershipId: schema.refreshSessions.currentMembershipId,
          expiresAt: schema.refreshSessions.expiresAt,
          identityStatus: schema.authenticationIdentities.status,
          membershipEffectiveFrom: schema.memberships.effectiveFrom,
          membershipEffectiveUntil: schema.memberships.effectiveUntil,
          membershipClientOrganizationId: schema.memberships.clientOrganizationId,
          membershipStatus: schema.memberships.status,
          rotationExpiresAt: schema.refreshTokenRotations.expiresAt,
          rotationHash: schema.refreshTokenRotations.tokenHash,
          rotationId: schema.refreshTokenRotations.id,
          rotationSequence: schema.refreshTokenRotations.sequence,
          roleActive: schema.roles.active,
          roleApplication: schema.roles.application,
          sessionClientType: schema.refreshSessions.clientType,
          sessionId: schema.refreshSessions.id,
          sessionRevokedAt: schema.refreshSessions.revokedAt,
          sessionVersion: schema.refreshSessions.refreshTokenVersion,
          userId: schema.refreshSessions.userId,
          userStatus: schema.users.status,
        })
        .from(schema.refreshTokenRotations)
        .innerJoin(
          schema.refreshSessions,
          eq(schema.refreshTokenRotations.sessionId, schema.refreshSessions.id),
        )
        .innerJoin(schema.users, eq(schema.refreshSessions.userId, schema.users.id))
        .innerJoin(
          schema.authenticationIdentities,
          eq(schema.refreshSessions.authenticationIdentityId, schema.authenticationIdentities.id),
        )
        .innerJoin(
          schema.memberships,
          eq(schema.refreshSessions.currentMembershipId, schema.memberships.id),
        )
        .innerJoin(schema.roles, eq(schema.memberships.roleId, schema.roles.id))
        .leftJoin(schema.agencies, eq(schema.memberships.agencyId, schema.agencies.id))
        .leftJoin(
          schema.clientOrganizations,
          eq(schema.memberships.clientOrganizationId, schema.clientOrganizations.id),
        )
        .where(eq(schema.refreshTokenRotations.id, input.presentedTokenId))
        .for('update', { of: schema.refreshSessions })
        .limit(1);

      if (!row || !opaqueTokenHashMatches(row.rotationHash, input.expectedHash)) {
        return { kind: 'invalid' as const };
      }

      const terminateSession = async (
        reason: string,
        compromised = false,
        allUserSessions = false,
      ): Promise<void> => {
        await transaction
          .update(schema.refreshSessions)
          .set({
            ...(compromised ? { compromisedAt: input.now } : {}),
            revokedAt: input.now,
            revokedReason: reason,
          })
          .where(
            and(
              allUserSessions
                ? eq(schema.refreshSessions.userId, row.userId)
                : eq(schema.refreshSessions.id, row.sessionId),
              isNull(schema.refreshSessions.revokedAt),
            ),
          );
        const elevations = await transaction
          .update(schema.supportElevations)
          .set({ revokeReason: reason, revokedAt: input.now })
          .where(
            and(
              allUserSessions
                ? eq(schema.supportElevations.actorUserId, row.userId)
                : eq(schema.supportElevations.actorSessionId, row.sessionId),
              isNull(schema.supportElevations.revokedAt),
            ),
          )
          .returning({
            actorMembershipId: schema.supportElevations.actorMembershipId,
            actorSessionId: schema.supportElevations.actorSessionId,
            clientOrganizationId: schema.supportElevations.clientOrganizationId,
            id: schema.supportElevations.id,
          });

        for (const elevation of elevations) {
          await transaction.insert(schema.authenticationAuditEvents).values(
            auditValues(
              {
                ...input.audit,
                clientOrganizationId: elevation.clientOrganizationId,
                eventType: 'SUPPORT_ELEVATION_REVOKED',
                membershipId: elevation.actorMembershipId,
                metadata: { reason },
                outcome: 'SUCCESS',
                sessionId: elevation.actorSessionId,
                userId: row.userId,
              },
              elevation.id,
            ),
          );
        }
      };

      if (row.rotationSequence !== row.sessionVersion) {
        await terminateSession('REFRESH_TOKEN_REUSED', true);
        await transaction.insert(schema.authenticationAuditEvents).values(
          auditValues({
            ...input.audit,
            ...(row.membershipClientOrganizationId
              ? { clientOrganizationId: row.membershipClientOrganizationId }
              : {}),
            eventType: 'REFRESH_REUSE_DETECTED',
            ...(row.currentMembershipId ? { membershipId: row.currentMembershipId } : {}),
            metadata: { rotation_sequence: row.rotationSequence },
            outcome: 'DENIED',
            sessionId: row.sessionId,
            userId: row.userId,
          }),
        );
        return {
          ...(row.membershipClientOrganizationId
            ? { clientOrganizationId: row.membershipClientOrganizationId }
            : {}),
          kind: 'reused' as const,
          ...(row.currentMembershipId ? { membershipId: row.currentMembershipId } : {}),
          sessionId: row.sessionId,
          userId: row.userId,
        };
      }

      if (row.sessionRevokedAt) {
        return {
          ...(row.membershipClientOrganizationId
            ? { clientOrganizationId: row.membershipClientOrganizationId }
            : {}),
          kind: 'session_revoked' as const,
          ...(row.currentMembershipId ? { membershipId: row.currentMembershipId } : {}),
          sessionId: row.sessionId,
          userId: row.userId,
        };
      }

      if (
        row.expiresAt.getTime() <= input.now.getTime() ||
        row.rotationExpiresAt.getTime() <= input.now.getTime()
      ) {
        await terminateSession('EXPIRED');
        return {
          ...(row.membershipClientOrganizationId
            ? { clientOrganizationId: row.membershipClientOrganizationId }
            : {}),
          kind: 'session_expired' as const,
          ...(row.currentMembershipId ? { membershipId: row.currentMembershipId } : {}),
          sessionId: row.sessionId,
          userId: row.userId,
        };
      }

      if (row.userStatus !== 'ACTIVE' || row.identityStatus !== 'ACTIVE') {
        await terminateSession('ACCOUNT_INACTIVE', false, true);
        return {
          ...(row.membershipClientOrganizationId
            ? { clientOrganizationId: row.membershipClientOrganizationId }
            : {}),
          kind: 'user_inactive' as const,
          ...(row.currentMembershipId ? { membershipId: row.currentMembershipId } : {}),
          sessionId: row.sessionId,
          userId: row.userId,
        };
      }

      if (!row.roleActive || row.roleApplication !== row.sessionClientType) {
        await terminateSession('ROLE_INACTIVE');
        return {
          ...(row.membershipClientOrganizationId
            ? { clientOrganizationId: row.membershipClientOrganizationId }
            : {}),
          kind: 'membership_inactive' as const,
          ...(row.currentMembershipId ? { membershipId: row.currentMembershipId } : {}),
          sessionId: row.sessionId,
          userId: row.userId,
        };
      }

      if (
        row.membershipStatus !== 'ACTIVE' ||
        row.membershipEffectiveFrom.getTime() > input.now.getTime() ||
        (row.membershipEffectiveUntil?.getTime() ?? Number.POSITIVE_INFINITY) <= input.now.getTime()
      ) {
        await terminateSession('MEMBERSHIP_INACTIVE');
        return {
          ...(row.membershipClientOrganizationId
            ? { clientOrganizationId: row.membershipClientOrganizationId }
            : {}),
          kind: 'membership_inactive' as const,
          ...(row.currentMembershipId ? { membershipId: row.currentMembershipId } : {}),
          sessionId: row.sessionId,
          userId: row.userId,
        };
      }

      if (
        (row.agencyStatus !== null && row.agencyStatus !== 'ACTIVE') ||
        (row.clientStatus !== null && row.clientStatus !== 'ACTIVE')
      ) {
        await terminateSession('ORGANIZATION_INACTIVE');
        return {
          ...(row.membershipClientOrganizationId
            ? { clientOrganizationId: row.membershipClientOrganizationId }
            : {}),
          kind: 'client_inactive' as const,
          ...(row.currentMembershipId ? { membershipId: row.currentMembershipId } : {}),
          sessionId: row.sessionId,
          userId: row.userId,
        };
      }

      const sequence = row.sessionVersion + 1;
      await transaction.insert(schema.refreshTokenRotations).values({
        expiresAt: input.replacement.expiresAt,
        id: input.replacement.id,
        issuedAt: input.replacement.issuedAt,
        parentRotationId: row.rotationId,
        sequence,
        sessionId: row.sessionId,
        tokenHash: input.replacement.hash,
      });
      await transaction
        .update(schema.refreshSessions)
        .set({ lastSeenAt: input.now, refreshTokenVersion: sequence })
        .where(eq(schema.refreshSessions.id, row.sessionId));
      await transaction.insert(schema.authenticationAuditEvents).values(
        auditValues({
          ...input.audit,
          ...(row.membershipClientOrganizationId
            ? { clientOrganizationId: row.membershipClientOrganizationId }
            : {}),
          eventType: 'REFRESH_SUCCEEDED',
          ...(row.currentMembershipId ? { membershipId: row.currentMembershipId } : {}),
          outcome: 'SUCCESS',
          sessionId: row.sessionId,
          userId: row.userId,
        }),
      );
      return {
        kind: 'rotated' as const,
        membershipId: row.currentMembershipId,
        sequence,
        sessionId: row.sessionId,
      };
    });

    if (outcome.kind !== 'rotated') {
      return outcome;
    }

    if (!outcome.membershipId) {
      return {
        kind: 'membership_inactive',
        sessionId: outcome.sessionId,
      };
    }

    const resolved = await this.resolveSession(outcome.sessionId, outcome.membershipId, input.now);

    if (resolved.kind !== 'active') {
      return resolved;
    }

    return { kind: 'rotated', sequence: outcome.sequence, session: resolved.value };
  }

  async touchSession(sessionId: string, seenAt: Date): Promise<void> {
    await this.connection.db
      .update(schema.refreshSessions)
      .set({ lastSeenAt: seenAt })
      .where(
        and(
          eq(schema.refreshSessions.id, sessionId),
          isNull(schema.refreshSessions.revokedAt),
          lt(schema.refreshSessions.lastSeenAt, new Date(seenAt.getTime() - 5 * 60_000)),
        ),
      );
  }

  async switchMembership(input: SwitchMembershipInput): Promise<SessionAccessRecord | undefined> {
    const switched = await this.connection.db.transaction(async (transaction) => {
      const [row] = await transaction
        .select({
          clientType: schema.refreshSessions.clientType,
          effectiveFrom: schema.memberships.effectiveFrom,
          effectiveUntil: schema.memberships.effectiveUntil,
          membershipId: schema.memberships.id,
          targetClientOrganizationId: schema.memberships.clientOrganizationId,
          membershipStatus: schema.memberships.status,
          organizationAgencyStatus: schema.agencies.status,
          organizationClientStatus: schema.clientOrganizations.status,
          roleApplication: schema.roles.application,
          roleActive: schema.roles.active,
          sessionExpiresAt: schema.refreshSessions.expiresAt,
          sessionRevokedAt: schema.refreshSessions.revokedAt,
        })
        .from(schema.refreshSessions)
        .innerJoin(
          schema.memberships,
          and(
            eq(schema.memberships.id, input.membershipId),
            eq(schema.memberships.userId, schema.refreshSessions.userId),
          ),
        )
        .innerJoin(schema.roles, eq(schema.memberships.roleId, schema.roles.id))
        .leftJoin(schema.agencies, eq(schema.memberships.agencyId, schema.agencies.id))
        .leftJoin(
          schema.clientOrganizations,
          eq(schema.memberships.clientOrganizationId, schema.clientOrganizations.id),
        )
        .where(
          and(
            eq(schema.refreshSessions.id, input.sessionId),
            eq(schema.refreshSessions.userId, input.userId),
          ),
        )
        .for('update', { of: schema.refreshSessions })
        .limit(1);

      if (
        !row ||
        row.sessionRevokedAt ||
        row.sessionExpiresAt.getTime() <= input.switchedAt.getTime() ||
        row.membershipStatus !== 'ACTIVE' ||
        !row.roleActive ||
        row.effectiveFrom.getTime() > input.switchedAt.getTime() ||
        (row.effectiveUntil?.getTime() ?? Number.POSITIVE_INFINITY) <= input.switchedAt.getTime() ||
        row.clientType !== row.roleApplication ||
        (row.organizationAgencyStatus !== null && row.organizationAgencyStatus !== 'ACTIVE') ||
        (row.organizationClientStatus !== null && row.organizationClientStatus !== 'ACTIVE')
      ) {
        return false;
      }

      const revokedElevations = await transaction
        .update(schema.supportElevations)
        .set({
          revokeReason: 'MEMBERSHIP_SWITCHED',
          revokedAt: input.switchedAt,
          revokedByUserId: input.userId,
        })
        .where(
          and(
            eq(schema.supportElevations.actorSessionId, input.sessionId),
            isNull(schema.supportElevations.revokedAt),
          ),
        )
        .returning({
          actorMembershipId: schema.supportElevations.actorMembershipId,
          actorSessionId: schema.supportElevations.actorSessionId,
          actorUserId: schema.supportElevations.actorUserId,
          clientOrganizationId: schema.supportElevations.clientOrganizationId,
          id: schema.supportElevations.id,
        });

      for (const elevation of revokedElevations) {
        await transaction.insert(schema.authenticationAuditEvents).values(
          auditValues(
            {
              ...input.audit,
              clientOrganizationId: elevation.clientOrganizationId,
              eventType: 'SUPPORT_ELEVATION_REVOKED',
              metadata: { reason: 'MEMBERSHIP_SWITCHED' },
              outcome: 'SUCCESS',
              membershipId: elevation.actorMembershipId,
              sessionId: elevation.actorSessionId,
              userId: elevation.actorUserId,
            },
            elevation.id,
          ),
        );
      }
      await transaction
        .update(schema.refreshSessions)
        .set({ currentMembershipId: input.membershipId, lastSeenAt: input.switchedAt })
        .where(eq(schema.refreshSessions.id, input.sessionId));
      await transaction.insert(schema.authenticationAuditEvents).values(
        auditValues({
          ...input.audit,
          ...(row.targetClientOrganizationId
            ? { clientOrganizationId: row.targetClientOrganizationId }
            : {}),
          eventType: 'MEMBERSHIP_SWITCHED',
          membershipId: input.membershipId,
          outcome: 'SUCCESS',
          sessionId: input.sessionId,
          userId: input.userId,
        }),
      );
      return true;
    });

    if (!switched) {
      return undefined;
    }

    const resolved = await this.resolveSession(
      input.sessionId,
      input.membershipId,
      input.switchedAt,
    );
    return resolved.kind === 'active' ? resolved.value : undefined;
  }

  async listSessions(userId: string, currentSessionId: string): Promise<SessionSummaryRecord[]> {
    const rows = await this.connection.db
      .select()
      .from(schema.refreshSessions)
      .where(eq(schema.refreshSessions.userId, userId))
      .orderBy(desc(schema.refreshSessions.lastSeenAt), desc(schema.refreshSessions.createdAt))
      .limit(100);

    return rows.map((row) => ({
      clientType: clientTypeFromDatabase(row.clientType),
      createdAt: row.createdAt,
      current: row.id === currentSessionId,
      ...(row.deviceId ? { deviceId: row.deviceId } : {}),
      ...(row.deviceName ? { deviceName: row.deviceName } : {}),
      expiresAt: row.expiresAt,
      id: row.id,
      lastSeenAt: row.lastSeenAt,
      platform: devicePlatformFromDatabase(row.devicePlatform),
      ...(row.revokedAt ? { revokedAt: row.revokedAt } : {}),
    }));
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    revokedAt: Date,
    reason: string,
    audit: AuthenticationAuditInput,
  ): Promise<boolean> {
    return this.connection.db.transaction(async (transaction) => {
      const rows = await transaction
        .update(schema.refreshSessions)
        .set({ revokedAt, revokedReason: reason })
        .where(
          and(
            eq(schema.refreshSessions.id, sessionId),
            eq(schema.refreshSessions.userId, userId),
            isNull(schema.refreshSessions.revokedAt),
          ),
        )
        .returning({ id: schema.refreshSessions.id });

      if (rows.length === 0) {
        return false;
      }

      const elevations = await transaction
        .update(schema.supportElevations)
        .set({
          revokeReason: reason,
          revokedAt,
          revokedByUserId: userId,
        })
        .where(
          and(
            eq(schema.supportElevations.actorSessionId, sessionId),
            isNull(schema.supportElevations.revokedAt),
          ),
        )
        .returning({
          actorMembershipId: schema.supportElevations.actorMembershipId,
          actorSessionId: schema.supportElevations.actorSessionId,
          actorUserId: schema.supportElevations.actorUserId,
          clientOrganizationId: schema.supportElevations.clientOrganizationId,
          id: schema.supportElevations.id,
        });

      for (const elevation of elevations) {
        await transaction.insert(schema.authenticationAuditEvents).values(
          auditValues(
            {
              ...audit,
              clientOrganizationId: elevation.clientOrganizationId,
              eventType: 'SUPPORT_ELEVATION_REVOKED',
              membershipId: elevation.actorMembershipId,
              metadata: { reason },
              outcome: 'SUCCESS',
              sessionId: elevation.actorSessionId,
              userId: elevation.actorUserId,
            },
            elevation.id,
          ),
        );
      }

      await transaction.insert(schema.authenticationAuditEvents).values(auditValues(audit));
      return true;
    });
  }

  async revokeAllSessions(
    userId: string,
    revokedAt: Date,
    reason: string,
    audit: AuthenticationAuditInput,
  ): Promise<number> {
    return this.connection.db.transaction(async (transaction) => {
      const rows = await transaction
        .update(schema.refreshSessions)
        .set({ revokedAt, revokedReason: reason })
        .where(
          and(eq(schema.refreshSessions.userId, userId), isNull(schema.refreshSessions.revokedAt)),
        )
        .returning({ id: schema.refreshSessions.id });
      const elevations = await transaction
        .update(schema.supportElevations)
        .set({ revokeReason: reason, revokedAt, revokedByUserId: userId })
        .where(
          and(
            eq(schema.supportElevations.actorUserId, userId),
            isNull(schema.supportElevations.revokedAt),
          ),
        )
        .returning({
          actorMembershipId: schema.supportElevations.actorMembershipId,
          actorSessionId: schema.supportElevations.actorSessionId,
          actorUserId: schema.supportElevations.actorUserId,
          clientOrganizationId: schema.supportElevations.clientOrganizationId,
          id: schema.supportElevations.id,
        });

      for (const elevation of elevations) {
        await transaction.insert(schema.authenticationAuditEvents).values(
          auditValues(
            {
              ...audit,
              clientOrganizationId: elevation.clientOrganizationId,
              eventType: 'SUPPORT_ELEVATION_REVOKED',
              membershipId: elevation.actorMembershipId,
              metadata: { reason },
              outcome: 'SUCCESS',
              sessionId: elevation.actorSessionId,
              userId: elevation.actorUserId,
            },
            elevation.id,
          ),
        );
      }

      await transaction.insert(schema.authenticationAuditEvents).values(
        auditValues({
          ...audit,
          metadata: { ...audit.metadata, revoked_sessions: rows.length },
        }),
      );
      return rows.length;
    });
  }

  async revokeByRefreshToken(input: RevokeByRefreshTokenInput): Promise<boolean> {
    return this.connection.db.transaction(async (transaction) => {
      const [row] = await transaction
        .select({
          clientOrganizationId: schema.memberships.clientOrganizationId,
          currentMembershipId: schema.refreshSessions.currentMembershipId,
          rotationHash: schema.refreshTokenRotations.tokenHash,
          sessionId: schema.refreshSessions.id,
          sessionRevokedAt: schema.refreshSessions.revokedAt,
          userId: schema.refreshSessions.userId,
        })
        .from(schema.refreshTokenRotations)
        .innerJoin(
          schema.refreshSessions,
          eq(schema.refreshTokenRotations.sessionId, schema.refreshSessions.id),
        )
        .innerJoin(
          schema.memberships,
          eq(schema.refreshSessions.currentMembershipId, schema.memberships.id),
        )
        .where(eq(schema.refreshTokenRotations.id, input.presentedTokenId))
        .for('update', { of: schema.refreshSessions })
        .limit(1);

      if (!row || !opaqueTokenHashMatches(row.rotationHash, input.expectedHash)) {
        return false;
      }

      if (row.sessionRevokedAt) {
        return true;
      }

      await transaction
        .update(schema.refreshSessions)
        .set({ revokedAt: input.revokedAt, revokedReason: 'LOGOUT' })
        .where(eq(schema.refreshSessions.id, row.sessionId));
      const elevations = await transaction
        .update(schema.supportElevations)
        .set({
          revokeReason: 'LOGOUT',
          revokedAt: input.revokedAt,
          revokedByUserId: row.userId,
        })
        .where(
          and(
            eq(schema.supportElevations.actorSessionId, row.sessionId),
            isNull(schema.supportElevations.revokedAt),
          ),
        )
        .returning({
          actorMembershipId: schema.supportElevations.actorMembershipId,
          actorSessionId: schema.supportElevations.actorSessionId,
          actorUserId: schema.supportElevations.actorUserId,
          clientOrganizationId: schema.supportElevations.clientOrganizationId,
          id: schema.supportElevations.id,
        });

      for (const elevation of elevations) {
        await transaction.insert(schema.authenticationAuditEvents).values(
          auditValues(
            {
              ...input.audit,
              clientOrganizationId: elevation.clientOrganizationId,
              eventType: 'SUPPORT_ELEVATION_REVOKED',
              membershipId: elevation.actorMembershipId,
              metadata: { reason: 'LOGOUT' },
              outcome: 'SUCCESS',
              sessionId: elevation.actorSessionId,
              userId: elevation.actorUserId,
            },
            elevation.id,
          ),
        );
      }
      await transaction.insert(schema.authenticationAuditEvents).values(
        auditValues({
          ...input.audit,
          ...(row.clientOrganizationId ? { clientOrganizationId: row.clientOrganizationId } : {}),
          eventType: 'LOGOUT',
          ...(row.currentMembershipId ? { membershipId: row.currentMembershipId } : {}),
          outcome: 'SUCCESS',
          sessionId: row.sessionId,
          userId: row.userId,
        }),
      );
      return true;
    });
  }

  async createPasswordReset(input: PasswordResetIssueInput): Promise<void> {
    await this.connection.db.transaction(async (transaction) => {
      const [identity] = await transaction
        .select({ id: schema.authenticationIdentities.id })
        .from(schema.authenticationIdentities)
        .where(
          and(
            eq(schema.authenticationIdentities.id, input.authenticationIdentityId),
            eq(schema.authenticationIdentities.userId, input.userId),
          ),
        )
        .for('update')
        .limit(1);

      if (!identity) {
        throw new Error('The password reset identity no longer exists.');
      }

      await transaction
        .update(schema.passwordResetTokens)
        .set({ revokedAt: input.requestedAt })
        .where(
          and(
            eq(schema.passwordResetTokens.userId, input.userId),
            isNull(schema.passwordResetTokens.usedAt),
            isNull(schema.passwordResetTokens.revokedAt),
          ),
        );
      await transaction.insert(schema.passwordResetTokens).values({
        authenticationIdentityId: input.authenticationIdentityId,
        expiresAt: input.expiresAt,
        id: input.id,
        requestCorrelationId: input.audit.correlationId,
        requestedAt: input.requestedAt,
        ...(input.audit.sourceIp ? { sourceIp: input.audit.sourceIp } : {}),
        tokenHash: input.tokenHash,
        userAgent: input.audit.userAgent,
        userId: input.userId,
      });
      await transaction.insert(schema.authenticationAuditEvents).values(auditValues(input.audit));
    });
  }

  async consumePasswordReset(
    input: PasswordResetConsumeInput,
  ): Promise<PasswordResetConsumeResult> {
    return this.connection.db.transaction(async (transaction) => {
      const [candidate] = await transaction
        .select({
          identityId: schema.passwordResetTokens.authenticationIdentityId,
          userId: schema.passwordResetTokens.userId,
        })
        .from(schema.passwordResetTokens)
        .where(eq(schema.passwordResetTokens.id, input.resetTokenId))
        .limit(1);

      if (!candidate) {
        return { kind: 'invalid' as const };
      }

      await transaction
        .select({ id: schema.authenticationIdentities.id })
        .from(schema.authenticationIdentities)
        .where(
          and(
            eq(schema.authenticationIdentities.id, candidate.identityId),
            eq(schema.authenticationIdentities.userId, candidate.userId),
          ),
        )
        .for('update')
        .limit(1);

      const [row] = await transaction
        .select({
          identityId: schema.passwordResetTokens.authenticationIdentityId,
          tokenHash: schema.passwordResetTokens.tokenHash,
          expiresAt: schema.passwordResetTokens.expiresAt,
          revokedAt: schema.passwordResetTokens.revokedAt,
          usedAt: schema.passwordResetTokens.usedAt,
          userId: schema.passwordResetTokens.userId,
        })
        .from(schema.passwordResetTokens)
        .where(eq(schema.passwordResetTokens.id, input.resetTokenId))
        .for('update')
        .limit(1);

      if (
        !row ||
        row.usedAt ||
        row.revokedAt ||
        row.expiresAt.getTime() <= input.consumedAt.getTime() ||
        !opaqueTokenHashMatches(row.tokenHash, input.tokenHash)
      ) {
        return { kind: 'invalid' as const };
      }

      const password = splitPasswordHash(input.newPasswordHash);
      await transaction
        .update(schema.authenticationIdentities)
        .set({
          failedAttemptCount: 0,
          lockedUntil: null,
          passwordDigest: password.digest,
          passwordKeyLength: password.keyLength,
          passwordSalt: password.salt,
          passwordScryptN: password.n,
          passwordScryptP: password.p,
          passwordScryptR: password.r,
          updatedAt: input.consumedAt,
        })
        .where(
          and(
            eq(schema.authenticationIdentities.id, row.identityId),
            eq(schema.authenticationIdentities.userId, row.userId),
          ),
        );
      await transaction
        .update(schema.passwordResetTokens)
        .set({ usedAt: input.consumedAt })
        .where(eq(schema.passwordResetTokens.id, input.resetTokenId));
      await transaction
        .update(schema.passwordResetTokens)
        .set({ revokedAt: input.consumedAt })
        .where(
          and(
            eq(schema.passwordResetTokens.userId, row.userId),
            isNull(schema.passwordResetTokens.usedAt),
            isNull(schema.passwordResetTokens.revokedAt),
          ),
        );
      await transaction
        .update(schema.refreshSessions)
        .set({ revokedAt: input.consumedAt, revokedReason: 'PASSWORD_RESET' })
        .where(
          and(
            eq(schema.refreshSessions.userId, row.userId),
            isNull(schema.refreshSessions.revokedAt),
          ),
        );
      const elevations = await transaction
        .update(schema.supportElevations)
        .set({
          revokeReason: 'PASSWORD_RESET',
          revokedAt: input.consumedAt,
          revokedByUserId: row.userId,
        })
        .where(
          and(
            eq(schema.supportElevations.actorUserId, row.userId),
            isNull(schema.supportElevations.revokedAt),
          ),
        )
        .returning({
          actorMembershipId: schema.supportElevations.actorMembershipId,
          actorSessionId: schema.supportElevations.actorSessionId,
          actorUserId: schema.supportElevations.actorUserId,
          clientOrganizationId: schema.supportElevations.clientOrganizationId,
          id: schema.supportElevations.id,
        });

      for (const elevation of elevations) {
        await transaction.insert(schema.authenticationAuditEvents).values(
          auditValues(
            {
              ...input.audit,
              clientOrganizationId: elevation.clientOrganizationId,
              eventType: 'SUPPORT_ELEVATION_REVOKED',
              membershipId: elevation.actorMembershipId,
              metadata: { reason: 'PASSWORD_RESET' },
              outcome: 'SUCCESS',
              sessionId: elevation.actorSessionId,
              userId: elevation.actorUserId,
            },
            elevation.id,
          ),
        );
      }
      await transaction.insert(schema.authenticationAuditEvents).values(
        auditValues({
          ...input.audit,
          eventType: 'PASSWORD_RESET_SUCCEEDED',
          outcome: 'SUCCESS',
          userId: row.userId,
        }),
      );
      return { kind: 'consumed' as const, userId: row.userId };
    });
  }

  async linkGoogleIdentity(input: LinkGoogleIdentityInput): Promise<LinkGoogleIdentityResult> {
    try {
      return await this.connection.db.transaction(async (transaction) => {
        await transaction.execute(
          sql`select ${schema.users.id} from ${schema.users} where ${schema.users.id} = ${input.userId} for update`,
        );
        const [account] = await transaction
          .select({
            displayName: schema.users.displayName,
            email: schema.users.primaryEmailNormalized,
            status: schema.users.status,
          })
          .from(schema.users)
          .where(eq(schema.users.id, input.userId))
          .limit(1);

        if (!account || account.status !== 'ACTIVE') return { kind: 'account_inactive' };
        if (account.email !== input.email) return { kind: 'email_mismatch' };

        const googleIdentities = await transaction
          .select({
            id: schema.authenticationIdentities.id,
            providerSubject: schema.authenticationIdentities.subjectNormalized,
            status: schema.authenticationIdentities.status,
            userId: schema.authenticationIdentities.userId,
          })
          .from(schema.authenticationIdentities)
          .where(
            and(
              eq(schema.authenticationIdentities.provider, 'OAUTH'),
              eq(schema.authenticationIdentities.providerKey, 'GOOGLE'),
              or(
                eq(schema.authenticationIdentities.userId, input.userId),
                eq(schema.authenticationIdentities.subjectNormalized, input.providerSubject),
              ),
            ),
          );
        const subjectOwner = googleIdentities.find(
          ({ providerSubject }) => providerSubject === input.providerSubject,
        );
        const userGoogleIdentity = googleIdentities.find(({ userId }) => userId === input.userId);

        if (subjectOwner && subjectOwner.userId !== input.userId)
          return { kind: 'identity_conflict' };
        if (
          userGoogleIdentity &&
          userGoogleIdentity.status !== 'DISABLED' &&
          userGoogleIdentity.providerSubject !== input.providerSubject
        ) {
          return { kind: 'identity_conflict' };
        }

        const identityId = userGoogleIdentity?.id ?? input.identityId;
        if (userGoogleIdentity) {
          await transaction
            .update(schema.authenticationIdentities)
            .set({
              providerEmailNormalized: input.email,
              status: 'ACTIVE',
              subjectNormalized: input.providerSubject,
              updatedAt: input.linkedAt,
              verifiedAt: input.linkedAt,
            })
            .where(eq(schema.authenticationIdentities.id, identityId));
        } else {
          await transaction.insert(schema.authenticationIdentities).values({
            createdAt: input.linkedAt,
            id: identityId,
            provider: 'OAUTH',
            providerEmailNormalized: input.email,
            providerKey: 'GOOGLE',
            status: 'ACTIVE',
            subjectNormalized: input.providerSubject,
            updatedAt: input.linkedAt,
            userId: input.userId,
            verifiedAt: input.linkedAt,
          });
        }
        await transaction.insert(schema.authenticationAuditEvents).values(
          auditValues({
            ...input.audit,
            eventType: 'IDENTITY_LINKED',
            metadata: { ...input.audit.metadata, provider: 'GOOGLE', source: 'ACCOUNT_SETTINGS' },
            outcome: 'SUCCESS',
            sessionId: input.sessionId,
            userId: input.userId,
          }),
        );

        return {
          identity: {
            email: account.email,
            id: identityId,
            providerEmail: input.email,
            status: 'ACTIVE',
            userDisplayName: account.displayName,
            userId: input.userId,
            userStatus: account.status,
          },
          kind: 'linked',
        };
      });
    } catch (error) {
      if (databaseErrorCode(error) === '23505') return { kind: 'identity_conflict' };
      throw error;
    }
  }

  async unlinkGoogleIdentity(
    userId: string,
    sessionId: string,
    unlinkedAt: Date,
    audit: AuthenticationAuditInput,
  ): Promise<UnlinkGoogleIdentityResult> {
    return this.connection.db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select ${schema.authenticationIdentities.id} from ${schema.authenticationIdentities} where ${schema.authenticationIdentities.userId} = ${userId} for update`,
      );
      const identities = await transaction
        .select({
          id: schema.authenticationIdentities.id,
          provider: schema.authenticationIdentities.provider,
          providerKey: schema.authenticationIdentities.providerKey,
          status: schema.authenticationIdentities.status,
        })
        .from(schema.authenticationIdentities)
        .where(eq(schema.authenticationIdentities.userId, userId));
      const google = identities.find(
        ({ provider, providerKey, status }) =>
          provider === 'OAUTH' && providerKey === 'GOOGLE' && status === 'ACTIVE',
      );

      if (!google) return { kind: 'identity_not_linked' };
      const supportedActiveMethods = identities.filter(
        ({ provider, providerKey, status }) =>
          status === 'ACTIVE' &&
          ((provider === 'PASSWORD' && providerKey === 'LOCAL') ||
            (provider === 'OAUTH' && providerKey === 'GOOGLE')),
      );
      if (supportedActiveMethods.length <= 1) {
        return { kind: 'last_login_method' };
      }

      const [currentSession] = await transaction
        .select({ authenticationIdentityId: schema.refreshSessions.authenticationIdentityId })
        .from(schema.refreshSessions)
        .where(
          and(eq(schema.refreshSessions.id, sessionId), eq(schema.refreshSessions.userId, userId)),
        )
        .limit(1);
      // The Phase 1 `authentication_identities_inactive_revoke_auth` trigger
      // runs inside this transaction and revokes every refresh session and
      // support elevation bound to the Google identity, with audit evidence.
      await transaction
        .update(schema.authenticationIdentities)
        .set({ status: 'DISABLED', updatedAt: unlinkedAt })
        .where(eq(schema.authenticationIdentities.id, google.id));
      await transaction.insert(schema.authenticationAuditEvents).values(
        auditValues({
          ...audit,
          eventType: 'IDENTITY_UNLINKED',
          metadata: { ...audit.metadata, provider: 'GOOGLE' },
          outcome: 'SUCCESS',
          sessionId,
          userId,
        }),
      );

      return {
        currentSessionRevoked: currentSession?.authenticationIdentityId === google.id,
        kind: 'unlinked',
      };
    });
  }

  async recordAuthenticationAudit(input: AuthenticationAuditInput): Promise<void> {
    await this.connection.db.insert(schema.authenticationAuditEvents).values(auditValues(input));
  }

  async validatePasswordReset(input: PasswordResetValidationInput): Promise<boolean> {
    const [row] = await this.connection.db
      .select({
        expiresAt: schema.passwordResetTokens.expiresAt,
        revokedAt: schema.passwordResetTokens.revokedAt,
        tokenHash: schema.passwordResetTokens.tokenHash,
        usedAt: schema.passwordResetTokens.usedAt,
      })
      .from(schema.passwordResetTokens)
      .where(eq(schema.passwordResetTokens.id, input.resetTokenId))
      .limit(1);

    return Boolean(
      row &&
      !row.usedAt &&
      !row.revokedAt &&
      row.expiresAt.getTime() > input.now.getTime() &&
      opaqueTokenHashMatches(row.tokenHash, input.tokenHash),
    );
  }

  async createSupportElevation(
    input: CreateSupportElevationInput,
  ): Promise<SupportElevationContext | undefined> {
    const client = await this.connection.db.transaction(async (transaction) => {
      const [row] = await transaction
        .select({
          agencyId: schema.clientOrganizations.agencyId,
          agencyStatus: schema.agencies.status,
          clientDisplayName: schema.clientOrganizations.displayName,
          clientId: schema.clientOrganizations.id,
          clientLegalName: schema.clientOrganizations.legalName,
          clientStatus: schema.clientOrganizations.status,
          clientTimezone: schema.clientOrganizations.timezone,
          membershipAgencyId: schema.memberships.agencyId,
          membershipContext: schema.memberships.contextType,
          membershipEffectiveFrom: schema.memberships.effectiveFrom,
          membershipEffectiveUntil: schema.memberships.effectiveUntil,
          membershipStatus: schema.memberships.status,
          sessionRevokedAt: schema.refreshSessions.revokedAt,
          sessionExpiresAt: schema.refreshSessions.expiresAt,
          sessionUserId: schema.refreshSessions.userId,
        })
        .from(schema.memberships)
        .innerJoin(
          schema.refreshSessions,
          and(
            eq(schema.refreshSessions.id, input.sessionId),
            eq(schema.refreshSessions.userId, input.userId),
            eq(schema.refreshSessions.currentMembershipId, schema.memberships.id),
          ),
        )
        .innerJoin(
          schema.clientOrganizations,
          and(
            eq(schema.clientOrganizations.id, input.targetClientOrganizationId),
            eq(schema.clientOrganizations.agencyId, schema.memberships.agencyId),
          ),
        )
        .innerJoin(schema.agencies, eq(schema.memberships.agencyId, schema.agencies.id))
        .where(eq(schema.memberships.id, input.agencyMembershipId))
        .for('update')
        .limit(1);

      if (
        !row ||
        row.membershipContext !== 'AGENCY' ||
        row.membershipStatus !== 'ACTIVE' ||
        row.membershipEffectiveFrom.getTime() > input.createdAt.getTime() ||
        (row.membershipEffectiveUntil?.getTime() ?? Number.POSITIVE_INFINITY) <=
          input.createdAt.getTime() ||
        row.agencyStatus !== 'ACTIVE' ||
        row.clientStatus !== 'ACTIVE' ||
        row.sessionRevokedAt ||
        row.sessionExpiresAt.getTime() <= input.createdAt.getTime() ||
        row.sessionUserId !== input.userId ||
        !row.membershipAgencyId
      ) {
        return undefined;
      }

      const replacedElevations = await transaction
        .update(schema.supportElevations)
        .set({
          revokeReason: 'REPLACED',
          revokedAt: input.createdAt,
          revokedByUserId: input.userId,
        })
        .where(
          and(
            eq(schema.supportElevations.actorSessionId, input.sessionId),
            isNull(schema.supportElevations.revokedAt),
          ),
        )
        .returning({
          actorMembershipId: schema.supportElevations.actorMembershipId,
          actorSessionId: schema.supportElevations.actorSessionId,
          actorUserId: schema.supportElevations.actorUserId,
          clientOrganizationId: schema.supportElevations.clientOrganizationId,
          id: schema.supportElevations.id,
        });

      for (const elevation of replacedElevations) {
        await transaction.insert(schema.authenticationAuditEvents).values(
          auditValues(
            {
              ...input.audit,
              clientOrganizationId: elevation.clientOrganizationId,
              eventType: 'SUPPORT_ELEVATION_REVOKED',
              membershipId: elevation.actorMembershipId,
              metadata: { reason: 'REPLACED' },
              outcome: 'SUCCESS',
              sessionId: elevation.actorSessionId,
              userId: elevation.actorUserId,
            },
            elevation.id,
          ),
        );
      }
      await transaction.insert(schema.supportElevations).values({
        actorMembershipId: input.agencyMembershipId,
        actorSessionId: input.sessionId,
        actorUserId: input.userId,
        clientOrganizationId: input.targetClientOrganizationId,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
        id: input.id,
        reason: input.reason,
      });
      await transaction.insert(schema.authenticationAuditEvents).values(
        auditValues(
          {
            ...input.audit,
            clientOrganizationId: input.targetClientOrganizationId,
            membershipId: input.agencyMembershipId,
            sessionId: input.sessionId,
            userId: input.userId,
          },
          input.id,
        ),
      );
      return row;
    });

    if (!client) {
      return undefined;
    }

    return {
      clientOrganization: {
        agencyId: client.agencyId,
        displayName: client.clientDisplayName,
        id: client.clientId,
        legalName: client.clientLegalName,
        status: client.clientStatus,
        timezone: client.clientTimezone,
      },
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
      id: input.id,
      reason: input.reason,
      targetClientOrganizationId: input.targetClientOrganizationId,
    };
  }

  async revokeSupportElevation(
    userId: string,
    sessionId: string,
    revokedAt: Date,
    audit: AuthenticationAuditInput,
  ): Promise<boolean> {
    return this.connection.db.transaction(async (transaction) => {
      const [row] = await transaction
        .update(schema.supportElevations)
        .set({
          revokeReason:
            typeof audit.metadata?.reason === 'string' ? audit.metadata.reason : 'USER_REVOKED',
          revokedAt,
          revokedByUserId: userId,
        })
        .where(
          and(
            eq(schema.supportElevations.actorUserId, userId),
            eq(schema.supportElevations.actorSessionId, sessionId),
            isNull(schema.supportElevations.revokedAt),
            gt(schema.supportElevations.expiresAt, revokedAt),
          ),
        )
        .returning({
          actorMembershipId: schema.supportElevations.actorMembershipId,
          actorSessionId: schema.supportElevations.actorSessionId,
          actorUserId: schema.supportElevations.actorUserId,
          clientOrganizationId: schema.supportElevations.clientOrganizationId,
          id: schema.supportElevations.id,
        });

      if (!row) {
        return false;
      }

      await transaction.insert(schema.authenticationAuditEvents).values(
        auditValues(
          {
            ...audit,
            clientOrganizationId: row.clientOrganizationId,
            eventType: 'SUPPORT_ELEVATION_REVOKED',
            membershipId: row.actorMembershipId,
            outcome: 'SUCCESS',
            sessionId: row.actorSessionId,
            userId: row.actorUserId,
          },
          row.id,
        ),
      );
      return true;
    });
  }

  async listAgencyClients(agencyId: string): Promise<ClientOrganizationRecord[]> {
    const rows = await this.connection.db
      .select()
      .from(schema.clientOrganizations)
      .where(eq(schema.clientOrganizations.agencyId, agencyId))
      .orderBy(schema.clientOrganizations.displayName, schema.clientOrganizations.id);
    return rows.map((row) => ({
      agencyId: row.agencyId,
      displayName: row.displayName,
      id: row.id,
      legalName: row.legalName,
      status: row.status,
      timezone: row.timezone,
    }));
  }

  async getBranch(
    clientOrganizationId: string,
    branchId: string,
  ): Promise<BranchRecord | undefined> {
    const [row] = await this.connection.db
      .select()
      .from(schema.branches)
      .where(
        and(
          eq(schema.branches.clientOrganizationId, clientOrganizationId),
          eq(schema.branches.id, branchId),
        ),
      )
      .limit(1);
    return row;
  }

  async listBranches(clientOrganizationId: string): Promise<BranchRecord[]> {
    return this.connection.db
      .select()
      .from(schema.branches)
      .where(eq(schema.branches.clientOrganizationId, clientOrganizationId))
      .orderBy(schema.branches.name, schema.branches.id);
  }

  async getTeam(clientOrganizationId: string, teamId: string): Promise<TeamRecord | undefined> {
    const [row] = await this.connection.db
      .select()
      .from(schema.teams)
      .where(
        and(
          eq(schema.teams.clientOrganizationId, clientOrganizationId),
          eq(schema.teams.id, teamId),
        ),
      )
      .limit(1);
    return row;
  }

  async listTeams(clientOrganizationId: string): Promise<TeamRecord[]> {
    return this.connection.db
      .select()
      .from(schema.teams)
      .where(eq(schema.teams.clientOrganizationId, clientOrganizationId))
      .orderBy(schema.teams.name, schema.teams.id);
  }

  async listTenantUsers(clientOrganizationId: string): Promise<TenantUserRecord[]> {
    const rows = await this.connection.db
      .select({
        branchScopeMode: schema.memberships.branchScopeMode,
        departmentScopeMode: schema.memberships.departmentScopeMode,
        displayName: schema.users.displayName,
        email: schema.users.primaryEmailNormalized,
        membershipId: schema.memberships.id,
        membershipStatus: schema.memberships.status,
        jobTitle: schema.memberships.jobTitle,
        roleCode: schema.roles.code,
        teamScopeMode: schema.memberships.teamScopeMode,
        userId: schema.users.id,
        userStatus: schema.users.status,
      })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
      .innerJoin(schema.roles, eq(schema.memberships.roleId, schema.roles.id))
      .where(eq(schema.memberships.clientOrganizationId, clientOrganizationId))
      .orderBy(schema.users.displayName, schema.users.id);

    if (rows.length === 0) {
      return [];
    }

    const membershipIds = rows.map((row) => row.membershipId);
    const [branchScopes, departmentScopes, teamScopes] = await Promise.all([
      this.connection.db
        .select({
          branchId: schema.membershipBranchScopes.branchId,
          membershipId: schema.membershipBranchScopes.membershipId,
        })
        .from(schema.membershipBranchScopes)
        .where(inArray(schema.membershipBranchScopes.membershipId, membershipIds)),
      this.connection.db
        .select({
          departmentId: schema.membershipDepartmentScopes.departmentId,
          membershipId: schema.membershipDepartmentScopes.membershipId,
        })
        .from(schema.membershipDepartmentScopes)
        .where(inArray(schema.membershipDepartmentScopes.membershipId, membershipIds)),
      this.connection.db
        .select({
          membershipId: schema.membershipTeamScopes.membershipId,
          teamId: schema.membershipTeamScopes.teamId,
        })
        .from(schema.membershipTeamScopes)
        .where(inArray(schema.membershipTeamScopes.membershipId, membershipIds)),
    ]);

    return rows.map((row) => ({
      ...row,
      branchIds: branchScopes
        .filter((scope) => scope.membershipId === row.membershipId)
        .map((scope) => scope.branchId),
      departmentIds: departmentScopes
        .filter((scope) => scope.membershipId === row.membershipId)
        .map((scope) => scope.departmentId),
      teamIds: teamScopes
        .filter((scope) => scope.membershipId === row.membershipId)
        .map((scope) => scope.teamId),
    }));
  }

  private async invalidateSession(
    sessionId: string,
    userId: string,
    membershipId: string,
    invalidatedAt: Date,
    reason: string,
    clientOrganizationId?: string,
  ): Promise<void> {
    await this.connection.db.transaction(async (transaction) => {
      const invalidateEveryUserSession = reason === 'ACCOUNT_INACTIVE';
      const invalidated = await transaction
        .update(schema.refreshSessions)
        .set({ revokedAt: invalidatedAt, revokedReason: reason })
        .where(
          and(
            invalidateEveryUserSession
              ? eq(schema.refreshSessions.userId, userId)
              : eq(schema.refreshSessions.id, sessionId),
            isNull(schema.refreshSessions.revokedAt),
          ),
        )
        .returning({ id: schema.refreshSessions.id });

      if (invalidated.length === 0) {
        return;
      }

      const elevations = await transaction
        .update(schema.supportElevations)
        .set({ revokeReason: reason, revokedAt: invalidatedAt })
        .where(
          and(
            invalidateEveryUserSession
              ? eq(schema.supportElevations.actorUserId, userId)
              : eq(schema.supportElevations.actorSessionId, sessionId),
            isNull(schema.supportElevations.revokedAt),
          ),
        )
        .returning({
          actorMembershipId: schema.supportElevations.actorMembershipId,
          actorSessionId: schema.supportElevations.actorSessionId,
          clientOrganizationId: schema.supportElevations.clientOrganizationId,
          id: schema.supportElevations.id,
        });
      const correlationId = `session-invalidation:${sessionId}:${String(invalidatedAt.getTime())}`;

      for (const elevation of elevations) {
        await transaction.insert(schema.authenticationAuditEvents).values(
          auditValues(
            {
              clientOrganizationId: elevation.clientOrganizationId,
              correlationId,
              eventType: 'SUPPORT_ELEVATION_REVOKED',
              membershipId: elevation.actorMembershipId,
              metadata: { reason },
              outcome: 'SUCCESS',
              sessionId: elevation.actorSessionId,
              userId,
            },
            elevation.id,
          ),
        );
      }

      await transaction.insert(schema.authenticationAuditEvents).values(
        auditValues({
          ...(clientOrganizationId ? { clientOrganizationId } : {}),
          correlationId,
          eventType: reason === 'ACCOUNT_INACTIVE' ? 'ACCOUNT_STATUS_BLOCKED' : 'ACCESS_DENIED',
          membershipId,
          metadata: { reason },
          outcome: 'DENIED',
          sessionId,
          userId,
        }),
      );
    });
  }

  private async hydrateMembership(
    userId: string,
    row: {
      agencyDisplayName: string | null;
      agencyId: string | null;
      agencyStatus: 'ACTIVE' | 'CLOSED' | 'SUSPENDED' | null;
      assignmentScope: MembershipAccessRecord['assignmentScope'];
      branchScopeMode: MembershipAccessRecord['branchScopeMode'];
      departmentScopeMode: MembershipAccessRecord['departmentScopeMode'];
      clientAgencyId: string | null;
      clientDisplayName: string | null;
      clientId: string | null;
      clientLegalName: string | null;
      clientStatus: 'ACTIVE' | 'CLOSED' | 'PENDING' | 'SUSPENDED' | null;
      clientTimezone: string | null;
      contextType: MembershipAccessRecord['contextType'];
      effectiveFrom: Date;
      effectiveUntil: Date | null;
      id: string;
      jobTitle: string | null;
      roleApplication: 'MOBILE' | 'WEB';
      roleCode: MembershipAccessRecord['roleCode'];
      roleDisplayName: string;
      roleId: string;
      status: MembershipAccessRecord['status'];
      teamScopeMode: MembershipAccessRecord['teamScopeMode'];
    },
  ): Promise<MembershipAccessRecord> {
    const [permissionRows, branchRows, departmentRows, teamRows, managedTeamRows] =
      await Promise.all([
        this.connection.db
          .select({ code: schema.permissions.code })
          .from(schema.rolePermissionMappings)
          .innerJoin(
            schema.permissions,
            eq(schema.rolePermissionMappings.permissionId, schema.permissions.id),
          )
          .where(eq(schema.rolePermissionMappings.roleId, row.roleId)),
        this.connection.db
          .select({ id: schema.membershipBranchScopes.branchId })
          .from(schema.membershipBranchScopes)
          .where(eq(schema.membershipBranchScopes.membershipId, row.id)),
        this.connection.db
          .select({ id: schema.membershipDepartmentScopes.departmentId })
          .from(schema.membershipDepartmentScopes)
          .where(eq(schema.membershipDepartmentScopes.membershipId, row.id)),
        this.connection.db
          .select({ id: schema.membershipTeamScopes.teamId })
          .from(schema.membershipTeamScopes)
          .where(eq(schema.membershipTeamScopes.membershipId, row.id)),
        this.connection.db
          .select({ id: schema.teamManagerAssignments.teamId })
          .from(schema.teamManagerAssignments)
          .where(
            and(
              eq(schema.teamManagerAssignments.managerMembershipId, row.id),
              isNull(schema.teamManagerAssignments.endedAt),
            ),
          ),
      ]);

    return {
      ...(row.agencyId ? { agencyId: row.agencyId } : {}),
      ...(row.agencyDisplayName ? { agencyDisplayName: row.agencyDisplayName } : {}),
      ...(row.agencyStatus ? { agencyStatus: row.agencyStatus } : {}),
      assignmentScope: row.assignmentScope,
      branchIds: branchRows.map((scope) => scope.id),
      branchScopeMode: row.branchScopeMode,
      departmentIds: departmentRows.map((scope) => scope.id),
      departmentScopeMode: row.departmentScopeMode,
      ...(row.clientAgencyId ? { clientAgencyId: row.clientAgencyId } : {}),
      ...(row.clientDisplayName ? { clientDisplayName: row.clientDisplayName } : {}),
      ...(row.clientLegalName ? { clientLegalName: row.clientLegalName } : {}),
      ...(row.clientId ? { clientOrganizationId: row.clientId } : {}),
      ...(row.clientStatus ? { clientStatus: row.clientStatus } : {}),
      ...(row.clientTimezone ? { clientTimezone: row.clientTimezone } : {}),
      contextType: row.contextType,
      effectiveFrom: row.effectiveFrom,
      ...(row.effectiveUntil ? { effectiveUntil: row.effectiveUntil } : {}),
      id: row.id,
      ...(row.jobTitle ? { jobTitle: row.jobTitle } : {}),
      managedTeamIds: managedTeamRows.map((scope) => scope.id),
      organizationDisplayName:
        row.contextType === 'AGENCY'
          ? (row.agencyDisplayName ?? 'Agency')
          : (row.clientDisplayName ?? 'Client organization'),
      permissionCodes: permissionRows.map((permission) => permission.code as PermissionCode),
      roleApplication: row.roleApplication,
      roleCode: row.roleCode,
      roleDisplayName: row.roleDisplayName,
      roleId: row.roleId,
      status: row.status,
      teamIds: teamRows.map((scope) => scope.id),
      teamScopeMode: row.teamScopeMode,
      userId,
    };
  }

  private async loadSupportElevation(
    userId: string,
    sessionId: string,
    membershipId: string,
    now: Date,
  ): Promise<SupportElevationContext | undefined> {
    const [row] = await this.connection.db
      .select({
        actorAgencyId: schema.memberships.agencyId,
        agencyId: schema.clientOrganizations.agencyId,
        clientDisplayName: schema.clientOrganizations.displayName,
        clientId: schema.clientOrganizations.id,
        clientLegalName: schema.clientOrganizations.legalName,
        clientStatus: schema.clientOrganizations.status,
        clientTimezone: schema.clientOrganizations.timezone,
        createdAt: schema.supportElevations.createdAt,
        expiresAt: schema.supportElevations.expiresAt,
        id: schema.supportElevations.id,
        reason: schema.supportElevations.reason,
        revokedAt: schema.supportElevations.revokedAt,
      })
      .from(schema.supportElevations)
      .innerJoin(
        schema.memberships,
        and(
          eq(schema.supportElevations.actorMembershipId, schema.memberships.id),
          eq(schema.supportElevations.actorUserId, schema.memberships.userId),
        ),
      )
      .innerJoin(
        schema.clientOrganizations,
        eq(schema.supportElevations.clientOrganizationId, schema.clientOrganizations.id),
      )
      .where(
        and(
          eq(schema.supportElevations.actorUserId, userId),
          eq(schema.supportElevations.actorSessionId, sessionId),
          eq(schema.supportElevations.actorMembershipId, membershipId),
          isNull(schema.supportElevations.revokedAt),
        ),
      )
      .orderBy(desc(schema.supportElevations.createdAt))
      .limit(1);

    if (!row) {
      return undefined;
    }

    const expired = row.expiresAt.getTime() <= now.getTime();
    const clientUnavailable = row.clientStatus !== 'ACTIVE';
    const clientReassigned = !row.actorAgencyId || row.agencyId !== row.actorAgencyId;

    if (expired || clientUnavailable || clientReassigned) {
      const revokedAt = expired ? row.expiresAt : now;
      const reason = expired
        ? 'AUTO_EXPIRED'
        : clientReassigned
          ? 'CLIENT_REASSIGNED'
          : 'CLIENT_INACTIVE';
      const eventType = expired
        ? ('SUPPORT_ELEVATION_EXPIRED' as const)
        : ('SUPPORT_ELEVATION_REVOKED' as const);

      await this.connection.db.transaction(async (transaction) => {
        const [terminated] = await transaction
          .update(schema.supportElevations)
          .set({
            revokeReason: reason,
            revokedAt,
            ...(!expired ? { revokedByUserId: userId } : {}),
          })
          .where(
            and(
              eq(schema.supportElevations.id, row.id),
              isNull(schema.supportElevations.revokedAt),
            ),
          )
          .returning({ id: schema.supportElevations.id });

        if (terminated) {
          await transaction.insert(schema.authenticationAuditEvents).values(
            auditValues(
              {
                clientOrganizationId: row.clientId,
                correlationId: `support-termination:${row.id}`,
                eventType,
                membershipId,
                metadata: { reason },
                outcome: 'SUCCESS',
                sessionId,
                userId,
              },
              row.id,
            ),
          );
        }
      });

      return undefined;
    }

    return {
      clientOrganization: {
        agencyId: row.agencyId,
        displayName: row.clientDisplayName,
        id: row.clientId,
        legalName: row.clientLegalName,
        status: row.clientStatus,
        timezone: row.clientTimezone,
      },
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      id: row.id,
      reason: row.reason,
      targetClientOrganizationId: row.clientId,
    };
  }
}
