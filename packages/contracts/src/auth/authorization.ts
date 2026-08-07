import { z } from 'zod';

export const CANONICAL_ROLE_CODES = [
  'AGENCY_ADMIN',
  'CLIENT_ADMIN',
  'MANAGER',
  'SALES_MANAGER',
  'TELECALLER',
  'SALESPERSON',
  'TEST_RIDE_EXECUTIVE',
  'INVENTORY_EXECUTIVE',
  'BILLING_DOCUMENTATION_EXECUTIVE',
  'DELIVERY_EXECUTIVE',
  'RC_REGISTRATION_EXECUTIVE',
  'TEAM_MANAGER',
] as const;

export const PERMISSION_CODES = [
  'account.profile.read',
  'account.profile.update',
  'account.sessions.read',
  'account.sessions.revoke',
  'account.tenant.select',
  'organization.clients.read',
  'organization.branches.read',
  'organization.teams.read',
  'organization.users.read',
  'organization.users.manage',
  'organization.roles.read',
  'organization.roles.manage',
  'organization.sessions.manage',
  'organization.branches.manage',
  'organization.teams.manage',
  'organization.settings.manage',
  'organization.audit.read',
  'leads.read',
  'leads.create',
  'leads.transition',
  'leads.assign',
  'leads.followups.manage',
  'leads.notes.create',
  'leads.tasks.manage',
  'leads.duplicates.manage',
  'leads.sla.manage',
  'platform.agencies.manage',
  'platform.clients.manage',
  'platform.defaults.manage',
  'platform.support_elevation.manage',
  'organization.departments.read',
  'organization.departments.manage',
  'organization.hierarchy.read',
  'organization.hierarchy.manage',
] as const;

export const canonicalRoleCodeSchema = z.enum(CANONICAL_ROLE_CODES);
export const permissionCodeSchema = z.enum(PERMISSION_CODES);
export const membershipContextTypeSchema = z.enum(['AGENCY', 'CLIENT']);
export const membershipStatusSchema = z.enum(['INVITED', 'ACTIVE', 'SUSPENDED', 'ENDED']);
export const membershipScopeModeSchema = z.enum(['ALL', 'SELECTED', 'NONE']);
export const assignmentScopeSchema = z.enum([
  'ALL',
  'TEAM',
  'OWNED',
  'ASSIGNED',
  'OWNED_OR_ASSIGNED',
  'NONE',
]);
export const roleApplicationSchema = z.enum(['WEB', 'MOBILE']);

export type AssignmentScope = z.infer<typeof assignmentScopeSchema>;
export type CanonicalRoleCode = z.infer<typeof canonicalRoleCodeSchema>;
export type MembershipContextType = z.infer<typeof membershipContextTypeSchema>;
export type MembershipScopeMode = z.infer<typeof membershipScopeModeSchema>;
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;
export type PermissionCode = z.infer<typeof permissionCodeSchema>;
export type RoleApplication = z.infer<typeof roleApplicationSchema>;
