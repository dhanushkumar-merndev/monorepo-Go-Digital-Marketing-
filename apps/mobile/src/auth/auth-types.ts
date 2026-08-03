import { canonicalRoleCodeSchema, type CanonicalRoleCode } from '@gdm/contracts';

export const credentialVaultVersion = 1 as const;

export const mobileRoleCodes = [
  'SALESPERSON',
  'TEST_RIDE_EXECUTIVE',
  'DELIVERY_EXECUTIVE',
] as const satisfies readonly CanonicalRoleCode[];

export const officeRoleCodes = [
  'AGENCY_ADMIN',
  'CLIENT_ADMIN',
  'MANAGER',
  'SALES_MANAGER',
  'TELECALLER',
  'INVENTORY_EXECUTIVE',
  'BILLING_DOCUMENTATION_EXECUTIVE',
  'RC_REGISTRATION_EXECUTIVE',
] as const satisfies readonly CanonicalRoleCode[];

export type MobileRoleCode = (typeof mobileRoleCodes)[number];
export type OfficeRoleCode = (typeof officeRoleCodes)[number];
export type KnownRoleCode = CanonicalRoleCode;

export interface MobileCredentials {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  sessionId: string;
}

export interface MobilePrincipal {
  branchIds: string[];
  clientOrganizationId: string;
  clientOrganizationName: string;
  displayName: string;
  email: string;
  membershipId: string;
  permissions: string[];
  roleCode: CanonicalRoleCode;
  teamIds: string[];
  userId: string;
}

export interface MobileSession {
  credentials: MobileCredentials;
  principal: MobilePrincipal;
}

export interface StoredMobileSession {
  session: MobileSession;
  version: typeof credentialVaultVersion;
}

export type AuthStatus =
  | 'authenticated'
  | 'authenticating'
  | 'bootstrapping'
  | 'disabled'
  | 'session-expired'
  | 'unauthenticated'
  | 'unsupported-role';

export type DisabledReason = 'CLIENT_SUSPENDED' | 'MEMBERSHIP_INACTIVE' | 'USER_SUSPENDED';

export interface LoginInput {
  email: string;
  password: string;
}

export interface DeviceSessionMetadata {
  deviceName: string;
  platform: 'android' | 'ios';
}

export interface GoogleAuthenticationChallenge {
  challengeId: string;
  expiresAt: string;
  nonce: string;
}

export interface GoogleLoginInput {
  challengeId: string;
  idToken: string;
}

export interface LogoutResult {
  remoteSessionRevoked: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const stringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value) || !value.every(isNonEmptyString)) {
    return undefined;
  }

  return [...new Set(value.map((item) => item.trim()))];
};

const optionalIsoDate = (value: unknown): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isNonEmptyString(value) || Number.isNaN(Date.parse(value))) {
    return undefined;
  }

  return value;
};

const requiredIsoDate = (value: unknown): string | undefined => {
  const parsed = optionalIsoDate(value);
  return parsed && isNonEmptyString(value) ? parsed : undefined;
};

export function parseStoredMobileSession(value: unknown): StoredMobileSession | null {
  if (!isRecord(value) || value.version !== credentialVaultVersion || !isRecord(value.session)) {
    return null;
  }

  const { credentials, principal } = value.session;
  if (!isRecord(credentials) || !isRecord(principal)) {
    return null;
  }

  const accessTokenExpiresAt = requiredIsoDate(credentials.accessTokenExpiresAt);
  const refreshTokenExpiresAt = requiredIsoDate(credentials.refreshTokenExpiresAt);
  const branchIds = stringArray(principal.branchIds);
  const permissions = stringArray(principal.permissions);
  const roleCode = canonicalRoleCodeSchema.safeParse(principal.roleCode);
  const teamIds = stringArray(principal.teamIds);

  if (
    !isNonEmptyString(credentials.accessToken) ||
    !accessTokenExpiresAt ||
    !isNonEmptyString(credentials.refreshToken) ||
    !refreshTokenExpiresAt ||
    !isNonEmptyString(credentials.sessionId) ||
    !isNonEmptyString(principal.clientOrganizationId) ||
    !isNonEmptyString(principal.clientOrganizationName) ||
    !isNonEmptyString(principal.displayName) ||
    !isNonEmptyString(principal.email) ||
    !isNonEmptyString(principal.membershipId) ||
    !permissions ||
    !roleCode.success ||
    !branchIds ||
    !teamIds ||
    !isNonEmptyString(principal.userId)
  ) {
    return null;
  }

  return {
    version: credentialVaultVersion,
    session: {
      credentials: {
        accessToken: credentials.accessToken,
        accessTokenExpiresAt,
        refreshToken: credentials.refreshToken,
        refreshTokenExpiresAt,
        sessionId: credentials.sessionId,
      },
      principal: {
        branchIds,
        clientOrganizationId: principal.clientOrganizationId,
        clientOrganizationName: principal.clientOrganizationName,
        displayName: principal.displayName,
        email: principal.email,
        membershipId: principal.membershipId,
        permissions,
        roleCode: roleCode.data,
        teamIds,
        userId: principal.userId,
      },
    },
  };
}

export function isMobileRoleCode(roleCode: string): roleCode is MobileRoleCode {
  return (mobileRoleCodes as readonly string[]).includes(roleCode);
}

export function isOfficeRoleCode(roleCode: string): roleCode is OfficeRoleCode {
  return (officeRoleCodes as readonly string[]).includes(roleCode);
}
