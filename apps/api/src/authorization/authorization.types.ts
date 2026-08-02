import type { CorrelatedRequest } from '../common/correlation/correlation-id.js';
import type { AssignmentScope, MembershipScopeMode, PermissionCode } from '@gdm/contracts';

export type ScopeMode = MembershipScopeMode;

export interface SupportElevationContext {
  clientOrganization: {
    agencyId: string;
    displayName: string;
    id: string;
    legalName: string;
    status: 'ACTIVE' | 'CLOSED' | 'PENDING' | 'SUSPENDED';
    timezone: string;
  };
  createdAt: Date;
  id: string;
  reason: string;
  revokedAt?: Date;
  expiresAt: Date;
  targetClientOrganizationId: string;
}

export interface AuthorizationContext {
  agencyId?: string;
  assignmentScope: AssignmentScope;
  branchIds: ReadonlySet<string>;
  branchScopeMode: ScopeMode;
  clientOrganizationId?: string;
  membershipId: string;
  permissionCodes: ReadonlySet<PermissionCode>;
  roleCode: string;
  sessionId: string;
  supportElevation?: SupportElevationContext;
  teamIds: ReadonlySet<string>;
  teamScopeMode: ScopeMode;
  userId: string;
}

export interface AuthenticatedRequest extends CorrelatedRequest {
  authorization?: AuthorizationContext;
}

export interface ResourceScope {
  assigneeId?: string | null;
  branchId?: string | null;
  clientOrganizationId: string;
  ownerId?: string | null;
  teamId?: string | null;
}
