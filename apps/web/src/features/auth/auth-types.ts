import { CANONICAL_ROLE_CODES, type CanonicalRoleCode } from '@gdm/contracts';

export const roleCodes = CANONICAL_ROLE_CODES;
export type RoleCode = CanonicalRoleCode;

export interface AuthUser {
  displayName: string;
  email: string;
  id: string;
  status: 'active' | 'suspended';
}

export interface OrganizationOption {
  id: string;
  name: string;
}

export interface MembershipSummary {
  branchNames: string[];
  clientOrganization: OrganizationOption;
  id: string;
  permissions: string[];
  roleCode: RoleCode | string;
  roleName: string;
  status: 'active' | 'inactive' | 'suspended';
  teamNames: string[];
}

export interface SupportElevation {
  clientOrganization: OrganizationOption;
  expiresAt: string;
  id: string;
  reason: string;
}

export interface AuthSession {
  currentMembership: MembershipSummary | null;
  memberships: MembershipSummary[];
  permissions: string[];
  supportElevation: SupportElevation | null;
  supportTargets: OrganizationOption[];
  user: AuthUser;
}

export interface SessionDevice {
  createdAt: string;
  current: boolean;
  deviceName: string;
  expiresAt: string;
  id: string;
  ipAddress?: string;
  lastSeenAt: string;
  revokedAt?: string;
  userAgent?: string;
}

export interface LoginInput {
  deviceName?: string;
  email: string;
  password: string;
}

export interface PasswordResetInput {
  password: string;
  token: string;
}

export interface StartSupportElevationInput {
  clientOrganizationId: string;
  reason: string;
}

export function hasPermission(session: AuthSession, permission: string): boolean {
  return session.permissions.includes(permission) || session.permissions.includes('*');
}

export function isAgencyAdmin(session: AuthSession): boolean {
  return session.currentMembership?.roleCode === 'AGENCY_ADMIN';
}
