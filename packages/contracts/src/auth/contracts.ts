import { z } from 'zod';

import {
  assignmentScopeSchema,
  canonicalRoleCodeSchema,
  membershipContextTypeSchema,
  membershipScopeModeSchema,
  membershipStatusSchema,
  permissionCodeSchema,
  roleApplicationSchema,
} from './authorization.js';

const idSchema = z.uuid();
const timestampSchema = z.iso.datetime({ offset: true });
const nullableTimestampSchema = timestampSchema.nullable();

export const authClientTypeSchema = z.enum(['web', 'mobile']);
export const devicePlatformSchema = z.enum(['web', 'android', 'ios', 'unknown']);
export const userStatusSchema = z.enum(['INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED']);
export const agencyStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'CLOSED']);
export const clientOrganizationStatusSchema = z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED']);

export const normalizedEmailSchema = z
  .string()
  .trim()
  .email()
  .max(320)
  .transform((value) => value.toLowerCase());

export const newPasswordSchema = z.string().min(12).max(128);
export const opaqueAuthTokenSchema = z
  .string()
  .trim()
  .min(32)
  .max(2_048)
  .regex(/^\S+$/u, 'Token must not contain whitespace');
export const googleIdTokenSchema = z
  .string()
  .trim()
  .min(20)
  .max(8_192)
  .regex(/^\S+$/u, 'Google ID token must not contain whitespace');

export const mfaMethodSchema = z.enum(['TOTP', 'RECOVERY_CODE']);
export const mfaTotpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/u, 'Enter the six-digit code from your authenticator app');
export const mfaRecoveryCodeSchema = z
  .string()
  .trim()
  .min(12)
  .max(128)
  .regex(/^[A-Za-z0-9-]+$/u, 'Enter a valid recovery code');

export const deviceInputSchema = z.object({
  device_id: z.string().trim().min(1).max(128).optional(),
  device_name: z.string().trim().min(1).max(120).optional(),
  platform: devicePlatformSchema,
});

export const userProfileSchema = z.object({
  id: idSchema,
  display_name: z.string().min(1).max(160),
  email: normalizedEmailSchema,
  status: userStatusSchema,
});

export const tenantUserSummarySchema = z.object({
  user_id: idSchema,
  display_name: z.string().min(1).max(160),
  email: normalizedEmailSchema,
  user_status: userStatusSchema,
  membership_id: idSchema,
  membership_status: membershipStatusSchema,
  role_code: canonicalRoleCodeSchema,
});

export const tenantUserResponseSchema = z.object({ user: tenantUserSummarySchema });
export const tenantUserListResponseSchema = z.object({
  users: z.array(tenantUserSummarySchema),
});

export const agencySummarySchema = z.object({
  id: idSchema,
  display_name: z.string().min(1).max(200),
  status: agencyStatusSchema,
});

export const clientOrganizationSummarySchema = z.object({
  id: idSchema,
  agency_id: idSchema,
  legal_name: z.string().min(1).max(240),
  display_name: z.string().min(1).max(200),
  status: clientOrganizationStatusSchema,
  timezone: z.string().min(1).max(64),
});

export const clientOrganizationListResponseSchema = z.object({
  client_organizations: z.array(clientOrganizationSummarySchema),
});

export const branchSummarySchema = z.object({
  id: idSchema,
  client_organization_id: idSchema,
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  timezone: z.string().min(1).max(64),
  active: z.boolean(),
});

export const branchResponseSchema = z.object({ branch: branchSummarySchema });
export const branchListResponseSchema = z.object({ branches: z.array(branchSummarySchema) });

export const teamSummarySchema = z.object({
  id: idSchema,
  client_organization_id: idSchema,
  branch_id: idSchema,
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  active: z.boolean(),
});

export const teamResponseSchema = z.object({ team: teamSummarySchema });
export const teamListResponseSchema = z.object({ teams: z.array(teamSummarySchema) });

export const roleSummarySchema = z.object({
  id: idSchema,
  code: canonicalRoleCodeSchema,
  display_name: z.string().min(1).max(160),
  application: roleApplicationSchema,
});

export const membershipSummarySchema = z
  .object({
    id: idSchema,
    context_type: membershipContextTypeSchema,
    status: membershipStatusSchema,
    agency: agencySummarySchema.nullable(),
    client_organization: clientOrganizationSummarySchema.nullable(),
    role: roleSummarySchema,
    branch_scope_mode: membershipScopeModeSchema,
    branch_ids: z.array(idSchema),
    department_scope_mode: membershipScopeModeSchema,
    department_ids: z.array(idSchema),
    job_title: z.string().trim().min(1).max(160).nullable(),
    team_scope_mode: membershipScopeModeSchema,
    team_ids: z.array(idSchema),
    assignment_scope: assignmentScopeSchema,
    effective_from: timestampSchema,
    effective_until: nullableTimestampSchema,
  })
  .superRefine((membership, context) => {
    if (membership.context_type === 'AGENCY') {
      if (membership.agency === null || membership.client_organization !== null) {
        context.addIssue({
          code: 'custom',
          path: ['agency'],
          message: 'Agency memberships require only an agency context',
        });
      }
    } else if (membership.client_organization === null || membership.agency !== null) {
      context.addIssue({
        code: 'custom',
        path: ['client_organization'],
        message: 'Client memberships require only a client organization context',
      });
    }

    if (membership.branch_scope_mode !== 'SELECTED' && membership.branch_ids.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['branch_ids'],
        message: 'Branch IDs are allowed only for SELECTED branch scope',
      });
    }

    if (membership.team_scope_mode !== 'SELECTED' && membership.team_ids.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['team_ids'],
        message: 'Team IDs are allowed only for SELECTED team scope',
      });
    }

    if (membership.department_scope_mode !== 'SELECTED' && membership.department_ids.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['department_ids'],
        message: 'Department IDs are allowed only for SELECTED department scope',
      });
    }
  });

export const sessionSummarySchema = z.object({
  id: idSchema,
  client_type: authClientTypeSchema,
  device_id: z.string().min(1).max(128).nullable(),
  device_name: z.string().min(1).max(120).nullable(),
  device_platform: devicePlatformSchema,
  created_at: timestampSchema,
  last_seen_at: timestampSchema,
  expires_at: timestampSchema,
  revoked_at: nullableTimestampSchema,
  current: z.boolean(),
});

export const supportElevationSummarySchema = z.object({
  id: idSchema,
  client_organization: clientOrganizationSummarySchema,
  reason: z.string().min(1).max(1_000),
  created_at: timestampSchema,
  expires_at: timestampSchema,
  revoked_at: nullableTimestampSchema,
});

const authContextShape = {
  session: sessionSummarySchema,
  user: userProfileSchema,
  memberships: z.array(membershipSummarySchema),
  active_membership: membershipSummarySchema.nullable(),
  permissions: z.array(permissionCodeSchema),
  support_elevation: supportElevationSummarySchema.nullable(),
};

const tokenPairShape = {
  access_token: opaqueAuthTokenSchema,
  access_token_expires_at: timestampSchema,
  refresh_token: opaqueAuthTokenSchema.optional(),
  refresh_token_expires_at: timestampSchema,
};

export const loginRequestSchema = z.object({
  email: normalizedEmailSchema,
  password: z.string().min(1).max(1_024),
  client_type: authClientTypeSchema,
  device: deviceInputSchema.optional(),
});

export const googleAuthChallengeRequestSchema = z.object({
  client_type: authClientTypeSchema,
});

export const googleAuthChallengeResponseSchema = z.object({
  challenge_id: idSchema,
  nonce: z.string().regex(/^[0-9a-f]{64}$/u, 'Google nonce must be 32 random bytes in hex'),
  expires_at: timestampSchema,
});

export const googleLoginRequestSchema = z.object({
  challenge_id: idSchema,
  id_token: googleIdTokenSchema,
  client_type: authClientTypeSchema,
  device: deviceInputSchema.optional(),
});

export const googleLinkRequestSchema = z.object({
  challenge_id: idSchema,
  id_token: googleIdTokenSchema,
});

export const loginAuthenticatedResponseSchema = z.object({
  status: z.literal('AUTHENTICATED'),
  ...tokenPairShape,
  ...authContextShape,
  requires_membership_selection: z.boolean(),
});

const mfaChallengeResponseShape = {
  challenge_token: opaqueAuthTokenSchema,
  challenge_expires_at: timestampSchema,
};

export const loginMfaRequiredResponseSchema = z.object({
  status: z.literal('MFA_REQUIRED'),
  ...mfaChallengeResponseShape,
  methods: z.array(mfaMethodSchema).min(1),
});

export const loginMfaEnrollmentRequiredResponseSchema = z.object({
  status: z.literal('MFA_ENROLLMENT_REQUIRED'),
  ...mfaChallengeResponseShape,
});

export const loginResponseSchema = z.discriminatedUnion('status', [
  loginAuthenticatedResponseSchema,
  loginMfaRequiredResponseSchema,
  loginMfaEnrollmentRequiredResponseSchema,
]);

export const googleLoginResponseSchema = loginResponseSchema;

export const authenticationMethodProviderSchema = z.enum(['PASSWORD', 'GOOGLE']);
export const authenticationMethodUnlinkBlockReasonSchema = z.enum([
  'LAST_LOGIN_METHOD',
  'NOT_SUPPORTED',
]);
export const authenticationMethodSchema = z.object({
  provider: authenticationMethodProviderSchema,
  connected: z.boolean(),
  email: normalizedEmailSchema.nullable(),
  linked_at: nullableTimestampSchema,
  last_used_at: nullableTimestampSchema,
  can_unlink: z.boolean(),
  unlink_block_reason: authenticationMethodUnlinkBlockReasonSchema.nullable(),
});
export const authenticationMethodsResponseSchema = z.object({
  methods: z.array(authenticationMethodSchema),
});
export const googleLinkResponseSchema = z.object({
  linked: z.literal(true),
  method: authenticationMethodSchema,
});
export const googleUnlinkResponseSchema = z.object({
  unlinked: z.literal(true),
  current_session_revoked: z.boolean(),
});

export const mfaEnrollmentStartRequestSchema = z.object({
  challenge_token: opaqueAuthTokenSchema,
});

export const mfaEnrollmentStartResponseSchema = z.object({
  status: z.literal('MFA_ENROLLMENT_REQUIRED'),
  authenticator_id: idSchema,
  challenge_expires_at: timestampSchema,
  manual_secret: z
    .string()
    .trim()
    .min(16)
    .max(128)
    .regex(/^[A-Z2-7]+$/u, 'TOTP secrets must use unpadded Base32'),
  otpauth_uri: z.string().startsWith('otpauth://totp/').max(2_048),
});

export const mfaEnrollmentConfirmRequestSchema = z.object({
  challenge_token: opaqueAuthTokenSchema,
  code: mfaTotpCodeSchema,
});

export const mfaEnrollmentConfirmResponseSchema = loginAuthenticatedResponseSchema.extend({
  recovery_codes: z.array(mfaRecoveryCodeSchema).min(1).max(20),
  recovery_codes_displayed_once: z.literal(true),
});

export const mfaVerificationRequestSchema = z.discriminatedUnion('method', [
  z.object({
    challenge_token: opaqueAuthTokenSchema,
    method: z.literal('TOTP'),
    code: mfaTotpCodeSchema,
  }),
  z.object({
    challenge_token: opaqueAuthTokenSchema,
    method: z.literal('RECOVERY_CODE'),
    code: mfaRecoveryCodeSchema,
  }),
]);

export const mfaVerificationResponseSchema = loginAuthenticatedResponseSchema.extend({
  replacement_recovery_code: mfaRecoveryCodeSchema.optional(),
});

export const refreshRequestSchema = z.object({
  refresh_token: opaqueAuthTokenSchema.optional(),
});

export const refreshResponseSchema = z.object({
  ...tokenPairShape,
  ...authContextShape,
});

export const logoutRequestSchema = z.object({
  refresh_token: opaqueAuthTokenSchema.optional(),
});

export const logoutResponseSchema = z.object({ logged_out: z.literal(true) });
export const logoutAllResponseSchema = z.object({
  revoked_sessions: z.number().int().nonnegative(),
});

export const forgotPasswordRequestSchema = z.object({ email: normalizedEmailSchema });
export const forgotPasswordResponseSchema = z.object({ accepted: z.literal(true) });

export const resetPasswordRequestSchema = z.object({
  token: opaqueAuthTokenSchema,
  new_password: newPasswordSchema,
});
export const resetPasswordResponseSchema = z.object({ password_reset: z.literal(true) });

export const switchMembershipRequestSchema = z.object({ membership_id: idSchema });
export const switchMembershipResponseSchema = z.object({
  access_token: opaqueAuthTokenSchema,
  access_token_expires_at: timestampSchema,
  active_membership: membershipSummarySchema,
  permissions: z.array(permissionCodeSchema),
  support_elevation: supportElevationSummarySchema.nullable(),
});

export const sessionListResponseSchema = z.object({ sessions: z.array(sessionSummarySchema) });
export const revokeSessionResponseSchema = z.object({ revoked: z.literal(true) });

export const createSupportElevationRequestSchema = z.object({
  client_organization_id: idSchema,
  reason: z.string().trim().min(10).max(1_000),
  duration_minutes: z.number().int().min(1).max(60).optional(),
});
export const revokeSupportElevationRequestSchema = z.object({
  reason: z.string().trim().min(3).max(1_000).optional(),
});
export const supportElevationResponseSchema = z.object({
  support_elevation: supportElevationSummarySchema.nullable(),
});

export const meResponseSchema = z.object(authContextShape);

export type AgencyStatus = z.infer<typeof agencyStatusSchema>;
export type AgencySummary = z.infer<typeof agencySummarySchema>;
export type AuthClientType = z.infer<typeof authClientTypeSchema>;
export type ClientOrganizationStatus = z.infer<typeof clientOrganizationStatusSchema>;
export type ClientOrganizationSummary = z.infer<typeof clientOrganizationSummarySchema>;
export type ClientOrganizationListResponse = z.infer<typeof clientOrganizationListResponseSchema>;
export type BranchListResponse = z.infer<typeof branchListResponseSchema>;
export type BranchResponse = z.infer<typeof branchResponseSchema>;
export type BranchSummary = z.infer<typeof branchSummarySchema>;
export type CreateSupportElevationRequest = z.infer<typeof createSupportElevationRequestSchema>;
export type DeviceInput = z.infer<typeof deviceInputSchema>;
export type DevicePlatform = z.infer<typeof devicePlatformSchema>;
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;
export type ForgotPasswordResponse = z.infer<typeof forgotPasswordResponseSchema>;
export type GoogleAuthChallengeResponse = z.infer<typeof googleAuthChallengeResponseSchema>;
export type GoogleAuthChallengeRequest = z.infer<typeof googleAuthChallengeRequestSchema>;
export type GoogleLoginRequest = z.infer<typeof googleLoginRequestSchema>;
export type GoogleLoginResponse = z.infer<typeof googleLoginResponseSchema>;
export type GoogleLinkRequest = z.infer<typeof googleLinkRequestSchema>;
export type GoogleLinkResponse = z.infer<typeof googleLinkResponseSchema>;
export type GoogleUnlinkResponse = z.infer<typeof googleUnlinkResponseSchema>;
export type AuthenticationMethod = z.infer<typeof authenticationMethodSchema>;
export type AuthenticationMethodProvider = z.infer<typeof authenticationMethodProviderSchema>;
export type AuthenticationMethodsResponse = z.infer<typeof authenticationMethodsResponseSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type LoginAuthenticatedResponse = z.infer<typeof loginAuthenticatedResponseSchema>;
export type LoginMfaEnrollmentRequiredResponse = z.infer<
  typeof loginMfaEnrollmentRequiredResponseSchema
>;
export type LoginMfaRequiredResponse = z.infer<typeof loginMfaRequiredResponseSchema>;
export type LogoutAllResponse = z.infer<typeof logoutAllResponseSchema>;
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;
export type LogoutResponse = z.infer<typeof logoutResponseSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type MembershipSummary = z.infer<typeof membershipSummarySchema>;
export type MfaEnrollmentConfirmRequest = z.infer<typeof mfaEnrollmentConfirmRequestSchema>;
export type MfaEnrollmentConfirmResponse = z.infer<typeof mfaEnrollmentConfirmResponseSchema>;
export type MfaEnrollmentStartRequest = z.infer<typeof mfaEnrollmentStartRequestSchema>;
export type MfaEnrollmentStartResponse = z.infer<typeof mfaEnrollmentStartResponseSchema>;
export type MfaMethod = z.infer<typeof mfaMethodSchema>;
export type MfaVerificationRequest = z.infer<typeof mfaVerificationRequestSchema>;
export type MfaVerificationResponse = z.infer<typeof mfaVerificationResponseSchema>;
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
export type ResetPasswordResponse = z.infer<typeof resetPasswordResponseSchema>;
export type RevokeSessionResponse = z.infer<typeof revokeSessionResponseSchema>;
export type RevokeSupportElevationRequest = z.infer<typeof revokeSupportElevationRequestSchema>;
export type RoleSummary = z.infer<typeof roleSummarySchema>;
export type SessionListResponse = z.infer<typeof sessionListResponseSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type SupportElevationResponse = z.infer<typeof supportElevationResponseSchema>;
export type SupportElevationSummary = z.infer<typeof supportElevationSummarySchema>;
export type SwitchMembershipRequest = z.infer<typeof switchMembershipRequestSchema>;
export type SwitchMembershipResponse = z.infer<typeof switchMembershipResponseSchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
export type UserStatus = z.infer<typeof userStatusSchema>;
export type TenantUserListResponse = z.infer<typeof tenantUserListResponseSchema>;
export type TenantUserResponse = z.infer<typeof tenantUserResponseSchema>;
export type TenantUserSummary = z.infer<typeof tenantUserSummarySchema>;
export type TeamListResponse = z.infer<typeof teamListResponseSchema>;
export type TeamResponse = z.infer<typeof teamResponseSchema>;
export type TeamSummary = z.infer<typeof teamSummarySchema>;
