/* Each route validates against its shared contract at the controller boundary. */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  assignTeamMemberRequestSchema,
  createBranchRequestSchema,
  createClientRequestSchema,
  createDepartmentRequestSchema,
  createTeamRequestSchema,
  endTeamMembershipRequestSchema,
  inviteUserRequestSchema,
  replaceTeamManagerRequestSchema,
  setAgencyDefaultsRequestSchema,
  setClientSettingsRequestSchema,
  setClientStatusRequestSchema,
  setMembershipStatusRequestSchema,
  setModuleFlagRequestSchema,
  setReportingManagerRequestSchema,
  setWorkingHoursRequestSchema,
  updateBranchRequestSchema,
  updateClientRequestSchema,
  updateDepartmentRequestSchema,
  updateMembershipRequestSchema,
  updateTeamRequestSchema,
  type AssignTeamMemberRequest,
  type CreateBranchRequest,
  type CreateClientRequest,
  type CreateDepartmentRequest,
  type CreateTeamRequest,
  type EndTeamMembershipRequest,
  type InviteUserRequest,
  type ReplaceTeamManagerRequest,
  type SetAgencyDefaultsRequest,
  type SetClientSettingsRequest,
  type SetClientStatusRequest,
  type SetMembershipStatusRequest,
  type SetModuleFlagRequest,
  type SetReportingManagerRequest,
  type SetWorkingHoursRequest,
  type UpdateBranchRequest,
  type UpdateClientRequest,
  type UpdateDepartmentRequest,
  type UpdateMembershipRequest,
  type UpdateTeamRequest,
} from '@gdm/contracts';
import {
  CurrentAuthorization,
  RequireClientContext,
  RequirePermissions,
} from '../authorization/authorization.decorators.js';
import type { AuthorizationContext } from '../authorization/authorization.types.js';
import { ApiErrorEnvelopeDto } from '../common/errors/api-error.dto.js';
import { ZodSchemaValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { AdministrationService } from './administration.service.js';

@ApiTags('administration')
@ApiBearerAuth()
@ApiForbiddenResponse({ type: ApiErrorEnvelopeDto })
@Controller('administration')
export class AdministrationController {
  constructor(
    @Inject(AdministrationService) private readonly administration: AdministrationService,
  ) {}

  @Post('clients')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('platform.clients.manage')
  @ApiOperation({ summary: 'Create a client organization in the active agency' })
  async createClient(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body(new ZodSchemaValidationPipe(createClientRequestSchema)) body: CreateClientRequest,
  ) {
    return this.administration.createClient(context, body);
  }
  @Get('clients/:clientId')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('organization.clients.read')
  @ApiOperation({ summary: 'Read agency client detail and usage summary' })
  async clientDetail(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('clientId', new ParseUUIDPipe()) clientId: string,
  ) {
    return this.administration.clientDetail(context, clientId);
  }
  @Patch('clients/:clientId/status')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('platform.clients.manage')
  @ApiOperation({ summary: 'Suspend or reactivate a client without deleting data' })
  async clientStatus(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('clientId', new ParseUUIDPipe()) clientId: string,
    @Body(new ZodSchemaValidationPipe(setClientStatusRequestSchema)) body: SetClientStatusRequest,
  ) {
    return this.administration.setClientStatus(context, clientId, body);
  }
  @Put('client-profile')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('organization.settings.manage')
  @RequireClientContext()
  @ApiOperation({ summary: 'Update active client dealership profile' })
  async updateClient(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body(new ZodSchemaValidationPipe(updateClientRequestSchema)) body: UpdateClientRequest,
  ) {
    return this.administration.updateClient(context, body);
  }
  @Get('client-profile')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('organization.settings.manage')
  @RequireClientContext()
  @ApiOperation({ summary: 'Read the active client dealership profile' })
  async clientProfile(@CurrentAuthorization() context: AuthorizationContext) {
    return this.administration.clientProfile(context);
  }

  @Post('branches')
  @RequirePermissions('organization.branches.manage')
  @RequireClientContext()
  @ApiOperation({ summary: 'Create a branch in the active client' })
  async createBranch(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body(new ZodSchemaValidationPipe(createBranchRequestSchema)) body: CreateBranchRequest,
  ) {
    return this.administration.createBranch(context, body);
  }
  @Put('branches/:branchId')
  @RequirePermissions('organization.branches.manage')
  @RequireClientContext()
  @ApiOperation({ summary: 'Update a branch without rewriting historical records' })
  async updateBranch(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('branchId', new ParseUUIDPipe()) branchId: string,
    @Body(new ZodSchemaValidationPipe(updateBranchRequestSchema)) body: UpdateBranchRequest,
  ) {
    return this.administration.updateBranch(context, branchId, body);
  }
  @Put('branches/:branchId/working-hours')
  @RequirePermissions('organization.settings.manage')
  @RequireClientContext()
  @ApiOperation({ summary: 'Set versioned weekly branch working hours' })
  async workingHours(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('branchId', new ParseUUIDPipe()) branchId: string,
    @Body(new ZodSchemaValidationPipe(setWorkingHoursRequestSchema)) body: SetWorkingHoursRequest,
  ) {
    return this.administration.setWorkingHours(context, branchId, body);
  }
  @Get('branches/:branchId/working-hours')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('organization.settings.manage')
  @RequireClientContext()
  @ApiOperation({ summary: 'Read the current weekly branch working hours' })
  async getWorkingHours(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('branchId', new ParseUUIDPipe()) branchId: string,
  ) {
    return this.administration.workingHours(context, branchId);
  }
  @Post('departments')
  @RequirePermissions('organization.departments.manage')
  @RequireClientContext()
  @ApiOperation({ summary: 'Create a department under an active-client branch' })
  async createDepartment(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body(new ZodSchemaValidationPipe(createDepartmentRequestSchema))
    body: CreateDepartmentRequest,
  ) {
    return this.administration.createDepartment(context, body);
  }
  @Put('departments/:departmentId')
  @RequirePermissions('organization.departments.manage')
  @RequireClientContext()
  @ApiOperation({ summary: 'Update a department without rewriting its history' })
  async updateDepartment(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('departmentId', new ParseUUIDPipe()) departmentId: string,
    @Body(new ZodSchemaValidationPipe(updateDepartmentRequestSchema))
    body: UpdateDepartmentRequest,
  ) {
    return this.administration.updateDepartment(context, departmentId, body);
  }
  @Post('teams')
  @RequirePermissions('organization.teams.manage')
  @RequireClientContext()
  @ApiOperation({ summary: 'Create a team in an active-client branch' })
  async createTeam(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body(new ZodSchemaValidationPipe(createTeamRequestSchema)) body: CreateTeamRequest,
  ) {
    return this.administration.createTeam(context, body);
  }
  @Put('teams/:teamId')
  @RequirePermissions('organization.teams.manage')
  @RequireClientContext()
  @ApiOperation({ summary: 'Update a team' })
  async updateTeam(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Body(new ZodSchemaValidationPipe(updateTeamRequestSchema)) body: UpdateTeamRequest,
  ) {
    return this.administration.updateTeam(context, teamId, body);
  }

  @Post('users/invitations')
  @RequirePermissions('organization.users.manage')
  @RequireClientContext()
  @ApiOperation({ summary: 'Create an invited user and client membership' })
  async inviteUser(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body(new ZodSchemaValidationPipe(inviteUserRequestSchema)) body: InviteUserRequest,
  ) {
    return this.administration.inviteUser(context, body);
  }
  @Put('memberships/:membershipId')
  @RequirePermissions('organization.users.manage')
  @RequireClientContext()
  @ApiOperation({ summary: 'Change a client membership role and scope with an audit event' })
  async updateMembership(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('membershipId', new ParseUUIDPipe()) membershipId: string,
    @Body(new ZodSchemaValidationPipe(updateMembershipRequestSchema)) body: UpdateMembershipRequest,
  ) {
    return this.administration.updateMembership(context, membershipId, body);
  }
  @Patch('memberships/:membershipId/status')
  @RequirePermissions('organization.users.manage')
  @RequireClientContext()
  @ApiOperation({
    summary: 'Suspend, reactivate or end a client membership and revoke its sessions',
  })
  async membershipStatus(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('membershipId', new ParseUUIDPipe()) membershipId: string,
    @Body(new ZodSchemaValidationPipe(setMembershipStatusRequestSchema))
    body: SetMembershipStatusRequest,
  ) {
    return this.administration.setMembershipStatus(context, membershipId, body);
  }
  @Get('memberships/:membershipId')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('organization.users.manage')
  @RequireClientContext()
  @ApiOperation({ summary: 'Read a tenant membership before changing its role or scopes' })
  async membership(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('membershipId', new ParseUUIDPipe()) membershipId: string,
  ) {
    return this.administration.membership(context, membershipId);
  }

  @Get('hierarchy')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('organization.hierarchy.read')
  @RequireClientContext()
  @ApiOperation({ summary: 'Read departments, team membership, managers and reporting lines' })
  async hierarchy(@CurrentAuthorization() context: AuthorizationContext) {
    return this.administration.hierarchy(context);
  }
  @Post('teams/:teamId/members')
  @RequirePermissions('organization.hierarchy.manage')
  @RequireClientContext()
  @ApiOperation({ summary: 'Assign an active client membership to a team' })
  async assignTeamMember(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Body(new ZodSchemaValidationPipe(assignTeamMemberRequestSchema)) body: AssignTeamMemberRequest,
  ) {
    return this.administration.assignTeamMember(context, teamId, body);
  }
  @Patch('team-memberships/:teamMembershipId/end')
  @RequirePermissions('organization.hierarchy.manage')
  @RequireClientContext()
  @ApiOperation({ summary: 'End a team membership while preserving its history' })
  async endTeamMembership(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('teamMembershipId', new ParseUUIDPipe()) teamMembershipId: string,
    @Body(new ZodSchemaValidationPipe(endTeamMembershipRequestSchema))
    body: EndTeamMembershipRequest,
  ) {
    return this.administration.endTeamMembership(context, teamMembershipId, body);
  }
  @Put('teams/:teamId/manager')
  @RequirePermissions('organization.hierarchy.manage')
  @RequireClientContext()
  @ApiOperation({ summary: 'Replace a canonical Team Manager with append-only history' })
  async replaceTeamManager(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('teamId', new ParseUUIDPipe()) teamId: string,
    @Body(new ZodSchemaValidationPipe(replaceTeamManagerRequestSchema))
    body: ReplaceTeamManagerRequest,
  ) {
    return this.administration.replaceTeamManager(context, teamId, body);
  }
  @Put('memberships/:membershipId/reporting-manager')
  @RequirePermissions('organization.hierarchy.manage')
  @RequireClientContext()
  @ApiOperation({ summary: 'Replace or clear a reporting manager with cycle validation' })
  async setReportingManager(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('membershipId', new ParseUUIDPipe()) membershipId: string,
    @Body(new ZodSchemaValidationPipe(setReportingManagerRequestSchema))
    body: SetReportingManagerRequest,
  ) {
    return this.administration.setReportingManager(context, membershipId, body);
  }

  @Get('settings')
  @RequirePermissions('organization.settings.manage')
  @RequireClientContext()
  @ApiOperation({ summary: 'Read lead-assignment readiness and retention settings' })
  async settings(@CurrentAuthorization() context: AuthorizationContext) {
    return this.administration.settings(context);
  }
  @Put('settings')
  @RequirePermissions('organization.settings.manage')
  @RequireClientContext()
  @ApiOperation({ summary: 'Update lead-assignment readiness and basic retention preferences' })
  async setSettings(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body(new ZodSchemaValidationPipe(setClientSettingsRequestSchema))
    body: SetClientSettingsRequest,
  ) {
    return this.administration.setSettings(context, body);
  }
  @Get('module-flags')
  @RequirePermissions('organization.settings.manage')
  @RequireClientContext()
  @ApiOperation({ summary: 'Read active client module feature flags' })
  async flags(@CurrentAuthorization() context: AuthorizationContext) {
    return this.administration.flags(context);
  }
  @Put('module-flags/:module')
  @RequirePermissions('organization.settings.manage')
  @RequireClientContext()
  @ApiOperation({ summary: 'Change a client module feature flag' })
  async setFlag(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('module')
    module:
      | 'LEADS'
      | 'TELEPHONY'
      | 'INBOX'
      | 'TEST_RIDES'
      | 'INVENTORY'
      | 'BOOKING_BILLING'
      | 'DELIVERY_RC'
      | 'POST_SALE'
      | 'INTEGRATIONS',
    @Body(new ZodSchemaValidationPipe(setModuleFlagRequestSchema)) body: SetModuleFlagRequest,
  ) {
    return this.administration.setFlag(context, module, body);
  }
  @Get('integrations/readiness')
  @RequirePermissions('organization.settings.manage')
  @RequireClientContext()
  @ApiOperation({
    summary: 'Read integration readiness placeholders; provider configuration remains unavailable',
  })
  async integrations(@CurrentAuthorization() context: AuthorizationContext) {
    return this.administration.integrations(context);
  }
  @Get('agency-defaults')
  @RequirePermissions('platform.defaults.manage')
  @ApiOperation({ summary: 'Read safe agency-wide defaults' })
  async defaults(@CurrentAuthorization() context: AuthorizationContext) {
    return this.administration.defaults(context);
  }
  @Put('agency-defaults')
  @RequirePermissions('platform.defaults.manage')
  @ApiOperation({ summary: 'Set safe agency-wide defaults' })
  async setDefaults(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body(new ZodSchemaValidationPipe(setAgencyDefaultsRequestSchema))
    body: SetAgencyDefaultsRequest,
  ) {
    return this.administration.setDefaults(context, body);
  }
  @Get('audit')
  @RequirePermissions('organization.audit.read')
  @RequireClientContext()
  @ApiOperation({ summary: 'Read the active client account and permission audit timeline' })
  async audit(@CurrentAuthorization() context: AuthorizationContext) {
    return this.administration.auditTimeline(context);
  }
}
