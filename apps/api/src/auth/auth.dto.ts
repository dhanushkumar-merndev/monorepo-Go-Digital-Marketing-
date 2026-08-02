import {
  createSupportElevationRequestSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  logoutRequestSchema,
  refreshRequestSchema,
  resetPasswordRequestSchema,
  revokeSupportElevationRequestSchema,
  switchMembershipRequestSchema,
  CANONICAL_ROLE_CODES,
  PERMISSION_CODES,
  type CreateSupportElevationRequest,
  type ForgotPasswordRequest,
  type LoginRequest,
  type LogoutRequest,
  type RefreshRequest,
  type ResetPasswordRequest,
  type RevokeSupportElevationRequest,
  type SwitchMembershipRequest,
} from '@gdm/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class DeviceDto {
  @ApiPropertyOptional({ maxLength: 128, type: String })
  declare device_id: string | undefined;

  @ApiPropertyOptional({ maxLength: 120, type: String })
  declare device_name: string | undefined;

  @ApiProperty({ enum: ['web', 'android', 'ios', 'unknown'], type: String })
  declare platform: 'android' | 'ios' | 'unknown' | 'web';
}

export class LoginDto implements LoginRequest {
  static readonly schema = loginRequestSchema;

  @ApiProperty({ enum: ['web', 'mobile'], type: String })
  declare client_type: LoginRequest['client_type'];

  @ApiPropertyOptional({ type: () => DeviceDto })
  declare device: LoginRequest['device'];

  @ApiProperty({ format: 'email', maxLength: 320, type: String })
  declare email: string;

  @ApiProperty({ maxLength: 1024, minLength: 1, type: String, writeOnly: true })
  declare password: string;
}

export class RefreshDto implements RefreshRequest {
  static readonly schema = refreshRequestSchema;

  @ApiPropertyOptional({ maxLength: 2048, type: String, writeOnly: true })
  declare refresh_token: string | undefined;
}

export class LogoutDto implements LogoutRequest {
  static readonly schema = logoutRequestSchema;

  @ApiPropertyOptional({ maxLength: 2048, type: String, writeOnly: true })
  declare refresh_token: string | undefined;
}

export class ForgotPasswordDto implements ForgotPasswordRequest {
  static readonly schema = forgotPasswordRequestSchema;

  @ApiProperty({ format: 'email', maxLength: 320, type: String })
  declare email: string;
}

export class ResetPasswordDto implements ResetPasswordRequest {
  static readonly schema = resetPasswordRequestSchema;

  @ApiProperty({ maxLength: 128, minLength: 12, type: String, writeOnly: true })
  declare new_password: string;

  @ApiProperty({ maxLength: 2048, type: String, writeOnly: true })
  declare token: string;
}

export class SwitchMembershipDto implements SwitchMembershipRequest {
  static readonly schema = switchMembershipRequestSchema;

  @ApiProperty({ format: 'uuid', type: String })
  declare membership_id: string;
}

export class CreateSupportElevationDto implements CreateSupportElevationRequest {
  static readonly schema = createSupportElevationRequestSchema;

  @ApiProperty({ format: 'uuid', type: String })
  declare client_organization_id: string;

  @ApiPropertyOptional({ maximum: 60, minimum: 1, type: Number })
  declare duration_minutes: number | undefined;

  @ApiProperty({ maxLength: 1000, minLength: 10, type: String })
  declare reason: string;
}

export class RevokeSupportElevationDto implements RevokeSupportElevationRequest {
  static readonly schema = revokeSupportElevationRequestSchema;

  @ApiPropertyOptional({ maxLength: 1000, minLength: 3, type: String })
  declare reason: string | undefined;
}

export class UserProfileResponseDto {
  @ApiProperty({ format: 'uuid', type: String })
  declare id: string;

  @ApiProperty({ type: String })
  declare display_name: string;

  @ApiProperty({ format: 'email', type: String })
  declare email: string;

  @ApiProperty({ enum: ['INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'], type: String })
  declare status: string;
}

export class AgencySummaryResponseDto {
  @ApiProperty({ format: 'uuid', type: String })
  declare id: string;

  @ApiProperty({ type: String })
  declare display_name: string;

  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED', 'CLOSED'], type: String })
  declare status: string;
}

export class ClientOrganizationSummaryResponseDto {
  @ApiProperty({ format: 'uuid', type: String })
  declare id: string;

  @ApiProperty({ format: 'uuid', type: String })
  declare agency_id: string;

  @ApiProperty({ type: String })
  declare legal_name: string;

  @ApiProperty({ type: String })
  declare display_name: string;

  @ApiProperty({ enum: ['PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED'], type: String })
  declare status: string;

  @ApiProperty({ type: String })
  declare timezone: string;
}

export class RoleSummaryResponseDto {
  @ApiProperty({ format: 'uuid', type: String })
  declare id: string;

  @ApiProperty({ enum: CANONICAL_ROLE_CODES, type: String })
  declare code: string;

  @ApiProperty({ type: String })
  declare display_name: string;

  @ApiProperty({ enum: ['WEB', 'MOBILE'], type: String })
  declare application: string;
}

export class MembershipSummaryResponseDto {
  @ApiProperty({ format: 'uuid', type: String })
  declare id: string;

  @ApiProperty({ enum: ['AGENCY', 'CLIENT'], type: String })
  declare context_type: string;

  @ApiProperty({ enum: ['INVITED', 'ACTIVE', 'SUSPENDED', 'ENDED'], type: String })
  declare status: string;

  @ApiProperty({ nullable: true, type: () => AgencySummaryResponseDto })
  declare agency: AgencySummaryResponseDto | null;

  @ApiProperty({ nullable: true, type: () => ClientOrganizationSummaryResponseDto })
  declare client_organization: ClientOrganizationSummaryResponseDto | null;

  @ApiProperty({ type: () => RoleSummaryResponseDto })
  declare role: RoleSummaryResponseDto;

  @ApiProperty({ enum: ['ALL', 'SELECTED', 'NONE'], type: String })
  declare branch_scope_mode: string;

  @ApiProperty({ format: 'uuid', type: [String] })
  declare branch_ids: string[];

  @ApiProperty({ enum: ['ALL', 'SELECTED', 'NONE'], type: String })
  declare team_scope_mode: string;

  @ApiProperty({ format: 'uuid', type: [String] })
  declare team_ids: string[];

  @ApiProperty({
    enum: ['ALL', 'TEAM', 'OWNED', 'ASSIGNED', 'OWNED_OR_ASSIGNED', 'NONE'],
    type: String,
  })
  declare assignment_scope: string;

  @ApiProperty({ format: 'date-time', type: String })
  declare effective_from: string;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  declare effective_until: string | null;
}

export class SessionSummaryResponseDto {
  @ApiProperty({ format: 'uuid', type: String })
  declare id: string;

  @ApiProperty({ enum: ['web', 'mobile'], type: String })
  declare client_type: string;

  @ApiProperty({ nullable: true, type: String })
  declare device_id: string | null;

  @ApiProperty({ nullable: true, type: String })
  declare device_name: string | null;

  @ApiProperty({ enum: ['web', 'android', 'ios', 'unknown'], type: String })
  declare device_platform: string;

  @ApiProperty({ format: 'date-time', type: String })
  declare created_at: string;

  @ApiProperty({ format: 'date-time', type: String })
  declare last_seen_at: string;

  @ApiProperty({ format: 'date-time', type: String })
  declare expires_at: string;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  declare revoked_at: string | null;

  @ApiProperty({ type: Boolean })
  declare current: boolean;
}

export class SupportElevationSummaryResponseDto {
  @ApiProperty({ format: 'uuid', type: String })
  declare id: string;

  @ApiProperty({ type: () => ClientOrganizationSummaryResponseDto })
  declare client_organization: ClientOrganizationSummaryResponseDto;

  @ApiProperty({ type: String })
  declare reason: string;

  @ApiProperty({ format: 'date-time', type: String })
  declare created_at: string;

  @ApiProperty({ format: 'date-time', type: String })
  declare expires_at: string;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  declare revoked_at: string | null;
}

export class MeResponseDto {
  @ApiProperty({ type: () => SessionSummaryResponseDto })
  declare session: SessionSummaryResponseDto;

  @ApiProperty({ type: () => UserProfileResponseDto })
  declare user: UserProfileResponseDto;

  @ApiProperty({ type: [MembershipSummaryResponseDto] })
  declare memberships: MembershipSummaryResponseDto[];

  @ApiProperty({ nullable: true, type: () => MembershipSummaryResponseDto })
  declare active_membership: MembershipSummaryResponseDto | null;

  @ApiProperty({ enum: PERMISSION_CODES, isArray: true, type: String })
  declare permissions: string[];

  @ApiProperty({ nullable: true, type: () => SupportElevationSummaryResponseDto })
  declare support_elevation: SupportElevationSummaryResponseDto | null;
}

export class RefreshResponseDto extends MeResponseDto {
  @ApiProperty({ readOnly: true, type: String })
  declare access_token: string;

  @ApiProperty({ format: 'date-time', type: String })
  declare access_token_expires_at: string;

  @ApiPropertyOptional({ readOnly: true, type: String })
  declare refresh_token: string | undefined;

  @ApiProperty({ format: 'date-time', type: String })
  declare refresh_token_expires_at: string;
}

export class LoginResponseDto extends RefreshResponseDto {
  @ApiProperty({ type: Boolean })
  declare requires_membership_selection: boolean;
}

export class SwitchMembershipResponseDto {
  @ApiProperty({ readOnly: true, type: String })
  declare access_token: string;

  @ApiProperty({ format: 'date-time', type: String })
  declare access_token_expires_at: string;

  @ApiProperty({ type: () => MembershipSummaryResponseDto })
  declare active_membership: MembershipSummaryResponseDto;

  @ApiProperty({ enum: PERMISSION_CODES, isArray: true, type: String })
  declare permissions: string[];

  @ApiProperty({ nullable: true, type: () => SupportElevationSummaryResponseDto })
  declare support_elevation: SupportElevationSummaryResponseDto | null;
}

export class SessionListResponseDto {
  @ApiProperty({ type: [SessionSummaryResponseDto] })
  declare sessions: SessionSummaryResponseDto[];
}

export class SupportElevationResponseDto {
  @ApiProperty({ nullable: true, type: () => SupportElevationSummaryResponseDto })
  declare support_elevation: SupportElevationSummaryResponseDto | null;
}

export class BooleanSuccessResponseDto {
  @ApiProperty({ type: Boolean })
  declare accepted: boolean;
}

export class LoggedOutResponseDto {
  @ApiProperty({ type: Boolean })
  declare logged_out: boolean;
}

export class LogoutAllResponseDto {
  @ApiProperty({ minimum: 0, type: Number })
  declare revoked_sessions: number;
}

export class PasswordResetResponseDto {
  @ApiProperty({ type: Boolean })
  declare password_reset: boolean;
}

export class RevokedResponseDto {
  @ApiProperty({ type: Boolean })
  declare revoked: boolean;
}

export class ClientOrganizationListResponseDto {
  @ApiProperty({ type: [ClientOrganizationSummaryResponseDto] })
  declare client_organizations: ClientOrganizationSummaryResponseDto[];
}

export class BranchSummaryResponseDto {
  @ApiProperty({ format: 'uuid', type: String })
  declare id: string;

  @ApiProperty({ format: 'uuid', type: String })
  declare client_organization_id: string;

  @ApiProperty({ type: String })
  declare code: string;

  @ApiProperty({ type: String })
  declare name: string;

  @ApiProperty({ type: String })
  declare timezone: string;

  @ApiProperty({ type: Boolean })
  declare active: boolean;
}

export class BranchResponseDto {
  @ApiProperty({ type: () => BranchSummaryResponseDto })
  declare branch: BranchSummaryResponseDto;
}

export class BranchListResponseDto {
  @ApiProperty({ type: [BranchSummaryResponseDto] })
  declare branches: BranchSummaryResponseDto[];
}

export class TeamSummaryResponseDto {
  @ApiProperty({ format: 'uuid', type: String })
  declare id: string;

  @ApiProperty({ format: 'uuid', type: String })
  declare client_organization_id: string;

  @ApiProperty({ format: 'uuid', type: String })
  declare branch_id: string;

  @ApiProperty({ type: String })
  declare code: string;

  @ApiProperty({ type: String })
  declare name: string;

  @ApiProperty({ type: Boolean })
  declare active: boolean;
}

export class TeamResponseDto {
  @ApiProperty({ type: () => TeamSummaryResponseDto })
  declare team: TeamSummaryResponseDto;
}

export class TeamListResponseDto {
  @ApiProperty({ type: [TeamSummaryResponseDto] })
  declare teams: TeamSummaryResponseDto[];
}

export class TenantUserSummaryResponseDto {
  @ApiProperty({ format: 'uuid', type: String })
  declare user_id: string;

  @ApiProperty({ type: String })
  declare display_name: string;

  @ApiProperty({ format: 'email', type: String })
  declare email: string;

  @ApiProperty({ enum: ['INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'], type: String })
  declare user_status: string;

  @ApiProperty({ format: 'uuid', type: String })
  declare membership_id: string;

  @ApiProperty({ enum: ['INVITED', 'ACTIVE', 'SUSPENDED', 'ENDED'], type: String })
  declare membership_status: string;

  @ApiProperty({ enum: CANONICAL_ROLE_CODES, type: String })
  declare role_code: string;
}

export class TenantUserListResponseDto {
  @ApiProperty({ type: [TenantUserSummaryResponseDto] })
  declare users: TenantUserSummaryResponseDto[];
}
