import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  BranchListResponse,
  BranchResponse,
  ClientOrganizationListResponse,
  TenantUserListResponse,
  TeamListResponse,
  TeamResponse,
} from '@gdm/contracts';
import { AuthorizationPolicy } from '../authorization/authorization-policy.js';
import type { AuthorizationContext } from '../authorization/authorization.types.js';
import { AUTH_STORE, type AuthStore, type TenantUserRecord } from './auth-store.js';

function branchVisible(authorization: AuthorizationContext, user: TenantUserRecord): boolean {
  if (authorization.branchScopeMode === 'ALL') {
    return true;
  }

  if (authorization.branchScopeMode !== 'SELECTED') {
    return false;
  }

  return (
    user.branchScopeMode === 'ALL' ||
    (user.branchScopeMode === 'SELECTED' &&
      user.branchIds.some((branchId) => authorization.branchIds.has(branchId)))
  );
}

function teamVisible(authorization: AuthorizationContext, user: TenantUserRecord): boolean {
  if (authorization.teamScopeMode === 'ALL') {
    return true;
  }

  if (authorization.teamScopeMode === 'NONE') {
    return false;
  }

  return (
    user.teamScopeMode === 'ALL' ||
    user.teamScopeMode === 'NONE' ||
    user.teamIds.some((teamId) => authorization.teamIds.has(teamId))
  );
}

function clientIdFrom(authorization: AuthorizationContext): string {
  if (!authorization.clientOrganizationId) {
    throw new ForbiddenException({
      code: 'SUPPORT_ELEVATION_REQUIRED',
      details: [],
      message: 'An active client context is required.',
      retryable: false,
    });
  }

  return authorization.clientOrganizationId;
}

@Injectable()
export class OrganizationAccessService {
  constructor(
    @Inject(AUTH_STORE) private readonly store: AuthStore,
    @Inject(AuthorizationPolicy) private readonly policy: AuthorizationPolicy,
  ) {}

  async clients(authorization: AuthorizationContext): Promise<ClientOrganizationListResponse> {
    if (!authorization.agencyId) {
      throw new ForbiddenException({
        code: 'SCOPE_DENIED',
        details: [],
        message: 'Only an agency membership can list its client organizations.',
        retryable: false,
      });
    }

    const clients = await this.store.listAgencyClients(authorization.agencyId);
    return {
      client_organizations: clients.map((client) => ({
        agency_id: client.agencyId,
        display_name: client.displayName,
        id: client.id,
        legal_name: client.legalName,
        status: client.status,
        timezone: client.timezone,
      })),
    };
  }

  async branches(authorization: AuthorizationContext): Promise<BranchListResponse> {
    const clientOrganizationId = clientIdFrom(authorization);
    const branches = await this.store.listBranches(clientOrganizationId);
    return {
      branches: branches
        .filter((branch) => this.policy.canAccessBranch(authorization, branch.id))
        .map((branch) => ({
          active: branch.active,
          client_organization_id: branch.clientOrganizationId,
          code: branch.code,
          id: branch.id,
          name: branch.name,
          timezone: branch.timezone,
        })),
    };
  }

  async branch(authorization: AuthorizationContext, branchId: string): Promise<BranchResponse> {
    const branch = await this.store.getBranch(clientIdFrom(authorization), branchId);

    if (!branch) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        details: [],
        message: 'The branch was not found.',
        retryable: false,
      });
    }

    return {
      branch: {
        active: branch.active,
        client_organization_id: branch.clientOrganizationId,
        code: branch.code,
        id: branch.id,
        name: branch.name,
        timezone: branch.timezone,
      },
    };
  }

  async teams(authorization: AuthorizationContext): Promise<TeamListResponse> {
    const clientOrganizationId = clientIdFrom(authorization);
    const teams = await this.store.listTeams(clientOrganizationId);
    return {
      teams: teams
        .filter(
          (team) =>
            this.policy.canAccessBranch(authorization, team.branchId) &&
            this.policy.canAccessTeam(authorization, team.id),
        )
        .map((team) => ({
          active: team.active,
          branch_id: team.branchId,
          client_organization_id: team.clientOrganizationId,
          code: team.code,
          id: team.id,
          name: team.name,
        })),
    };
  }

  async team(authorization: AuthorizationContext, teamId: string): Promise<TeamResponse> {
    const team = await this.store.getTeam(clientIdFrom(authorization), teamId);

    if (
      !team ||
      !this.policy.canAccessBranch(authorization, team.branchId) ||
      !this.policy.canAccessTeam(authorization, team.id)
    ) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        details: [],
        message: 'The team was not found.',
        retryable: false,
      });
    }

    return {
      team: {
        active: team.active,
        branch_id: team.branchId,
        client_organization_id: team.clientOrganizationId,
        code: team.code,
        id: team.id,
        name: team.name,
      },
    };
  }

  async users(authorization: AuthorizationContext): Promise<TenantUserListResponse> {
    const users = await this.store.listTenantUsers(clientIdFrom(authorization));
    return {
      users: users
        .filter((user) => branchVisible(authorization, user) && teamVisible(authorization, user))
        .map((user) => ({
          display_name: user.displayName,
          email: user.email,
          membership_id: user.membershipId,
          membership_status: user.membershipStatus,
          role_code: user.roleCode,
          user_id: user.userId,
          user_status: user.userStatus,
        })),
    };
  }
}
