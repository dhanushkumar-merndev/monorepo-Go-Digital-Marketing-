import { Controller, Get, Header, Inject, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type {
  BranchListResponse,
  BranchResponse,
  ClientOrganizationListResponse,
  TeamListResponse,
  TeamResponse,
  TenantUserListResponse,
} from '@gdm/contracts';
import {
  CurrentAuthorization,
  RequireBranchParameter,
  RequireClientContext,
  RequirePermissions,
  RequireTeamParameter,
} from '../authorization/authorization.decorators.js';
import type { AuthorizationContext } from '../authorization/authorization.types.js';
import { ApiErrorEnvelopeDto } from '../common/errors/api-error.dto.js';
import { OrganizationAccessService } from './organization-access.service.js';
import {
  BranchListResponseDto,
  BranchResponseDto,
  ClientOrganizationListResponseDto,
  TeamListResponseDto,
  TeamResponseDto,
  TenantUserListResponseDto,
} from './auth.dto.js';

@ApiTags('organization access')
@ApiBearerAuth()
@ApiBadRequestResponse({ type: ApiErrorEnvelopeDto })
@ApiUnauthorizedResponse({ type: ApiErrorEnvelopeDto })
@ApiForbiddenResponse({ type: ApiErrorEnvelopeDto })
@Controller()
export class OrganizationAccessController {
  constructor(
    @Inject(OrganizationAccessService)
    private readonly organizations: OrganizationAccessService,
  ) {}

  @Get('clients')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('organization.clients.read')
  @ApiOperation({ summary: 'List the clients permitted by the active agency membership' })
  @ApiOkResponse({ type: ClientOrganizationListResponseDto })
  async clients(
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<ClientOrganizationListResponse> {
    return this.organizations.clients(authorization);
  }

  @Get('branches')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('organization.branches.read')
  @RequireClientContext()
  @ApiOperation({ summary: 'List branches visible in the active client and branch scope' })
  @ApiOkResponse({ type: BranchListResponseDto })
  async branches(
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<BranchListResponse> {
    return this.organizations.branches(authorization);
  }

  @Get('branches/:branchId')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('organization.branches.read')
  @RequireClientContext()
  @RequireBranchParameter()
  @ApiOperation({ summary: 'Read one branch within the authenticated branch scope' })
  @ApiOkResponse({ type: BranchResponseDto })
  async branch(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('branchId', new ParseUUIDPipe()) branchId: string,
  ): Promise<BranchResponse> {
    return this.organizations.branch(authorization, branchId);
  }

  @Get('teams')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('organization.teams.read')
  @RequireClientContext()
  @ApiOperation({ summary: 'List teams visible in the active branch and team scopes' })
  @ApiOkResponse({ type: TeamListResponseDto })
  async teams(
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<TeamListResponse> {
    return this.organizations.teams(authorization);
  }

  @Get('teams/:teamId')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('organization.teams.read')
  @RequireClientContext()
  @RequireTeamParameter()
  @ApiOperation({ summary: 'Read one team within the authenticated team scope' })
  @ApiOkResponse({ type: TeamResponseDto })
  async team(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
  ): Promise<TeamResponse> {
    return this.organizations.team(authorization, teamId);
  }

  @Get('users')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('organization.users.read')
  @RequireClientContext()
  @ApiOperation({ summary: 'List client users visible within the authenticated scope' })
  @ApiOkResponse({ type: TenantUserListResponseDto })
  async users(
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<TenantUserListResponse> {
    return this.organizations.users(authorization);
  }
}
