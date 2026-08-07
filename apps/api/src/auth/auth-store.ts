import type {
  AgencyStatus,
  AssignmentScope,
  AuthClientType,
  AuthenticationMethodProvider,
  CanonicalRoleCode,
  ClientOrganizationStatus,
  DevicePlatform,
  MembershipScopeMode,
  MembershipStatus,
  PermissionCode,
  RoleApplication,
  UserStatus,
} from '@gdm/contracts';
import type {
  AuthorizationContext,
  SupportElevationContext,
} from '../authorization/authorization.types.js';

export const AUTH_STORE = Symbol('AUTH_STORE');

export interface AuthenticationIdentityRecord {
  email: string;
  id: string;
  status: 'ACTIVE' | 'DISABLED' | 'SUSPENDED';
  userDisplayName: string;
  userId: string;
  userStatus: UserStatus;
}

export interface PasswordIdentityRecord extends AuthenticationIdentityRecord {
  failedAttempts: number;
  lockedUntil?: Date;
  passwordHash: string;
}

export interface GoogleIdentityRecord extends AuthenticationIdentityRecord {
  providerEmail: string;
}

export interface AuthenticationMethodRecord {
  createdAt: Date;
  email: string;
  id: string;
  lastAuthenticatedAt?: Date;
  provider: AuthenticationMethodProvider;
  status: 'ACTIVE' | 'DISABLED' | 'SUSPENDED';
}

export type ExternalAuthChallengePurpose = 'LINK' | 'LOGIN';

export interface CreateExternalAuthChallengeInput {
  clientType: AuthClientType;
  expiresAt: Date;
  id: string;
  nonceHash: string;
  purpose: ExternalAuthChallengePurpose;
  sessionId?: string;
  userId?: string;
}

export interface ConsumeExternalAuthChallengeInput {
  challengeId: string;
  clientType?: AuthClientType;
  consumedAt: Date;
  purpose: ExternalAuthChallengePurpose;
  sessionId?: string;
  userId?: string;
}

export interface ConsumedExternalAuthChallenge {
  clientType: AuthClientType;
  nonceHash: string;
}

export type GoogleLoginIdentityResolution =
  | { identity: GoogleIdentityRecord; kind: 'identity' | 'invitation_activated' }
  | { kind: 'account_disabled' | 'account_suspended' | 'client_inactive' }
  | { kind: 'account_linking_required' | 'identity_conflict' | 'not_invited' };

export interface ResolveGoogleLoginIdentityInput {
  audit: AuthenticationAuditInput;
  clientType: AuthClientType;
  email: string;
  identityId: string;
  now: Date;
  providerSubject: string;
}

export type LinkGoogleIdentityResult =
  | { identity: GoogleIdentityRecord; kind: 'linked' }
  | { kind: 'account_inactive' | 'email_mismatch' | 'identity_conflict' };

export interface LinkGoogleIdentityInput {
  audit: AuthenticationAuditInput;
  email: string;
  identityId: string;
  linkedAt: Date;
  providerSubject: string;
  sessionId: string;
  userId: string;
}

export type UnlinkGoogleIdentityResult =
  | { currentSessionRevoked: boolean; kind: 'unlinked' }
  | { kind: 'identity_not_linked' }
  | { kind: 'last_login_method' };

export interface MembershipAccessRecord {
  agencyId?: string;
  agencyDisplayName?: string;
  agencyStatus?: AgencyStatus;
  assignmentScope: AssignmentScope;
  branchIds: string[];
  branchScopeMode: MembershipScopeMode;
  departmentIds: string[];
  departmentScopeMode: MembershipScopeMode;
  clientAgencyId?: string;
  clientDisplayName?: string;
  clientLegalName?: string;
  clientOrganizationId?: string;
  clientStatus?: ClientOrganizationStatus;
  clientTimezone?: string;
  contextType: 'AGENCY' | 'CLIENT';
  id: string;
  jobTitle?: string | null;
  managedTeamIds: string[];
  organizationDisplayName: string;
  effectiveFrom: Date;
  effectiveUntil?: Date;
  permissionCodes: PermissionCode[];
  roleApplication: RoleApplication;
  roleCode: CanonicalRoleCode;
  roleDisplayName: string;
  roleId: string;
  status: MembershipStatus;
  teamIds: string[];
  teamScopeMode: MembershipScopeMode;
  userId: string;
}

export interface DeviceMetadata {
  deviceId: string;
  deviceName: string;
  platform: DevicePlatform;
  sourceIp?: string;
  userAgent?: string;
}

export interface CreateSessionInput {
  audit: AuthenticationAuditInput;
  authenticationIdentityId: string;
  clientType: AuthClientType;
  device: DeviceMetadata;
  expiresAt: Date;
  membershipId: string;
  refreshToken: {
    expiresAt: Date;
    hash: string;
    id: string;
    issuedAt: Date;
    sequence: number;
  };
  sessionId: string;
  userId: string;
}

export interface SessionAccessRecord {
  context: AuthorizationContext;
  membership: MembershipAccessRecord;
  session: SessionSummaryRecord;
  sessionExpiresAt: Date;
  userDisplayName: string;
  userEmail: string;
  userStatus: UserStatus;
}

export type SessionResolution =
  | { kind: 'active'; value: SessionAccessRecord }
  | {
      kind:
        | 'client_inactive'
        | 'membership_inactive'
        | 'session_expired'
        | 'session_revoked'
        | 'user_inactive';
      userId?: string;
    };

export interface RotateRefreshTokenInput {
  audit: Omit<
    AuthenticationAuditInput,
    'clientOrganizationId' | 'membershipId' | 'sessionId' | 'userId'
  >;
  expectedHash: string;
  now: Date;
  presentedTokenId: string;
  replacement: {
    expiresAt: Date;
    hash: string;
    id: string;
    issuedAt: Date;
  };
}

export interface RevokeByRefreshTokenInput {
  audit: Omit<
    AuthenticationAuditInput,
    'clientOrganizationId' | 'membershipId' | 'sessionId' | 'userId'
  >;
  expectedHash: string;
  presentedTokenId: string;
  revokedAt: Date;
}

export type RefreshRotationResult =
  | { kind: 'invalid' }
  | {
      clientOrganizationId?: string;
      kind: 'reused';
      membershipId?: string;
      sessionId?: string;
      userId?: string;
    }
  | {
      kind: 'rotated';
      sequence: number;
      session: SessionAccessRecord;
    }
  | {
      kind:
        | 'client_inactive'
        | 'membership_inactive'
        | 'session_expired'
        | 'session_revoked'
        | 'user_inactive';
      clientOrganizationId?: string;
      membershipId?: string;
      sessionId?: string;
      userId?: string;
    };

export interface SessionSummaryRecord {
  clientType: AuthClientType;
  createdAt: Date;
  current: boolean;
  deviceId?: string;
  deviceName?: string;
  expiresAt: Date;
  id: string;
  lastSeenAt: Date;
  platform: DevicePlatform;
  revokedAt?: Date;
}

export interface AuthenticationAuditInput {
  clientOrganizationId?: string;
  correlationId: string;
  deviceId?: string;
  eventType: string;
  identifierHash?: string;
  membershipId?: string;
  metadata?: Record<string, unknown>;
  outcome: 'DENIED' | 'FAILURE' | 'SUCCESS';
  sessionId?: string;
  sourceIp?: string;
  userAgent?: string;
  userId?: string;
}

export interface LoginFailurePolicy {
  lockoutSeconds: number;
  maxAttempts: number;
}

export interface PasswordResetIssueInput {
  audit: AuthenticationAuditInput;
  authenticationIdentityId: string;
  expiresAt: Date;
  id: string;
  requestedAt: Date;
  tokenHash: string;
  userId: string;
}

export interface PasswordResetConsumeInput {
  audit: Omit<AuthenticationAuditInput, 'userId'>;
  consumedAt: Date;
  newPasswordHash: string;
  resetTokenId: string;
  tokenHash: string;
}

export interface PasswordResetValidationInput {
  now: Date;
  resetTokenId: string;
  tokenHash: string;
}

export type PasswordResetConsumeResult = { kind: 'consumed'; userId: string } | { kind: 'invalid' };

export interface CreateSupportElevationInput {
  agencyMembershipId: string;
  audit: AuthenticationAuditInput;
  createdAt: Date;
  expiresAt: Date;
  id: string;
  reason: string;
  sessionId: string;
  targetClientOrganizationId: string;
  userId: string;
}

export interface SwitchMembershipInput {
  audit: Omit<
    AuthenticationAuditInput,
    'clientOrganizationId' | 'membershipId' | 'sessionId' | 'userId'
  >;
  membershipId: string;
  sessionId: string;
  switchedAt: Date;
  userId: string;
}

export interface TenantUserRecord {
  branchIds: string[];
  branchScopeMode: MembershipScopeMode;
  displayName: string;
  departmentIds: string[];
  departmentScopeMode: MembershipScopeMode;
  email: string;
  membershipId: string;
  membershipStatus: MembershipStatus;
  jobTitle?: string | null;
  roleCode: CanonicalRoleCode;
  teamIds: string[];
  teamScopeMode: MembershipScopeMode;
  userId: string;
  userStatus: UserStatus;
}

export interface ClientOrganizationRecord {
  agencyId: string;
  displayName: string;
  id: string;
  legalName: string;
  status: ClientOrganizationStatus;
  timezone: string;
}

export interface BranchRecord {
  active: boolean;
  clientOrganizationId: string;
  code: string;
  id: string;
  name: string;
  timezone: string;
}

export interface TeamRecord {
  active: boolean;
  branchId: string;
  clientOrganizationId: string;
  code: string;
  id: string;
  name: string;
}

export interface AuthStore {
  consumeExternalAuthChallenge(
    input: ConsumeExternalAuthChallengeInput,
  ): Promise<ConsumedExternalAuthChallenge | undefined>;
  consumePasswordReset(input: PasswordResetConsumeInput): Promise<PasswordResetConsumeResult>;
  createPasswordReset(input: PasswordResetIssueInput): Promise<void>;
  createExternalAuthChallenge(input: CreateExternalAuthChallengeInput): Promise<void>;
  createSession(input: CreateSessionInput): Promise<void>;
  createSupportElevation(
    input: CreateSupportElevationInput,
  ): Promise<SupportElevationContext | undefined>;
  findPasswordIdentity(email: string): Promise<PasswordIdentityRecord | undefined>;
  listAuthenticationMethods(userId: string): Promise<AuthenticationMethodRecord[]>;
  getMembership(userId: string, membershipId: string): Promise<MembershipAccessRecord | undefined>;
  getSessionClientType(userId: string, sessionId: string): Promise<AuthClientType | undefined>;
  listAvailableMemberships(
    userId: string,
    clientType: AuthClientType,
    now: Date,
  ): Promise<MembershipAccessRecord[]>;
  getBranch(clientOrganizationId: string, branchId: string): Promise<BranchRecord | undefined>;
  getTeam(clientOrganizationId: string, teamId: string): Promise<TeamRecord | undefined>;
  listAgencyClients(agencyId: string): Promise<ClientOrganizationRecord[]>;
  listBranches(clientOrganizationId: string): Promise<BranchRecord[]>;
  listSessions(userId: string, currentSessionId: string): Promise<SessionSummaryRecord[]>;
  listTenantUsers(clientOrganizationId: string): Promise<TenantUserRecord[]>;
  listTeams(clientOrganizationId: string): Promise<TeamRecord[]>;
  recordAuthenticationAudit(input: AuthenticationAuditInput): Promise<void>;
  recordLoginFailure(
    identityId: string,
    failedAt: Date,
    lockUntil?: Date,
    policy?: LoginFailurePolicy,
  ): Promise<void>;
  recordLoginSuccess(identityId: string, authenticatedAt: Date): Promise<void>;
  resolveGoogleLoginIdentity(
    input: ResolveGoogleLoginIdentityInput,
  ): Promise<GoogleLoginIdentityResolution>;
  resolveSession(sessionId: string, membershipId: string, now: Date): Promise<SessionResolution>;
  revokeAllSessions(
    userId: string,
    revokedAt: Date,
    reason: string,
    audit: AuthenticationAuditInput,
  ): Promise<number>;
  revokeByRefreshToken(input: RevokeByRefreshTokenInput): Promise<boolean>;
  revokeSession(
    userId: string,
    sessionId: string,
    revokedAt: Date,
    reason: string,
    audit: AuthenticationAuditInput,
  ): Promise<boolean>;
  revokeSupportElevation(
    userId: string,
    sessionId: string,
    revokedAt: Date,
    audit: AuthenticationAuditInput,
  ): Promise<boolean>;
  rotateRefreshToken(input: RotateRefreshTokenInput): Promise<RefreshRotationResult>;
  switchMembership(input: SwitchMembershipInput): Promise<SessionAccessRecord | undefined>;
  touchSession(sessionId: string, seenAt: Date): Promise<void>;
  linkGoogleIdentity(input: LinkGoogleIdentityInput): Promise<LinkGoogleIdentityResult>;
  unlinkGoogleIdentity(
    userId: string,
    sessionId: string,
    unlinkedAt: Date,
    audit: AuthenticationAuditInput,
  ): Promise<UnlinkGoogleIdentityResult>;
  validatePasswordReset(input: PasswordResetValidationInput): Promise<boolean>;
}
