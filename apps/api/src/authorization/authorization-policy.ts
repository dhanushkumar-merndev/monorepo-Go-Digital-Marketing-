import { Injectable } from '@nestjs/common';
import type { PermissionCode } from '@gdm/contracts';
import type { AuthorizationContext, ResourceScope } from './authorization.types.js';

@Injectable()
export class AuthorizationPolicy {
  hasEveryPermission(
    context: AuthorizationContext,
    permissions: readonly PermissionCode[],
  ): boolean {
    return permissions.length > 0 && permissions.every((code) => context.permissionCodes.has(code));
  }

  canAccessBranch(context: AuthorizationContext, branchId: string): boolean {
    if (!context.clientOrganizationId) {
      return false;
    }

    return (
      context.branchScopeMode === 'ALL' ||
      (context.branchScopeMode === 'SELECTED' && context.branchIds.has(branchId))
    );
  }

  canAccessTeam(context: AuthorizationContext, teamId: string): boolean {
    if (!context.clientOrganizationId) {
      return false;
    }

    return (
      context.teamScopeMode === 'ALL' ||
      (context.teamScopeMode === 'SELECTED' && context.teamIds.has(teamId))
    );
  }

  canAccessResource(context: AuthorizationContext, resource: ResourceScope): boolean {
    if (
      !context.clientOrganizationId ||
      context.clientOrganizationId !== resource.clientOrganizationId
    ) {
      return false;
    }

    if (resource.branchId && !this.canAccessBranch(context, resource.branchId)) {
      return false;
    }

    if (resource.teamId && !this.canAccessTeam(context, resource.teamId)) {
      return false;
    }

    switch (context.assignmentScope) {
      case 'ALL':
        return true;
      case 'TEAM':
        return resource.teamId !== undefined && resource.teamId !== null;
      case 'OWNED':
        return resource.ownerId === context.userId;
      case 'ASSIGNED':
        return resource.assigneeId === context.userId;
      case 'OWNED_OR_ASSIGNED':
        return resource.ownerId === context.userId || resource.assigneeId === context.userId;
      case 'NONE':
        return false;
    }
  }
}
