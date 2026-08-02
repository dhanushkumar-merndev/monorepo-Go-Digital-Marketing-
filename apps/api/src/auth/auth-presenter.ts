import type {
  MembershipSummary,
  SessionSummary,
  SupportElevationSummary,
  UserProfile,
} from '@gdm/contracts';
import type {
  MembershipAccessRecord,
  PasswordIdentityRecord,
  SessionAccessRecord,
  SessionSummaryRecord,
} from './auth-store.js';
import type { SupportElevationContext } from '../authorization/authorization.types.js';

export function presentUser(
  user: Pick<PasswordIdentityRecord, 'email' | 'userDisplayName' | 'userId' | 'userStatus'>,
): UserProfile {
  return {
    display_name: user.userDisplayName,
    email: user.email,
    id: user.userId,
    status: user.userStatus,
  };
}

export function presentSession(session: SessionSummaryRecord): SessionSummary {
  return {
    client_type: session.clientType,
    created_at: session.createdAt.toISOString(),
    current: session.current,
    device_id: session.deviceId ?? null,
    device_name: session.deviceName ?? null,
    device_platform: session.platform,
    expires_at: session.expiresAt.toISOString(),
    id: session.id,
    last_seen_at: session.lastSeenAt.toISOString(),
    revoked_at: session.revokedAt?.toISOString() ?? null,
  };
}

export function presentMembership(membership: MembershipAccessRecord): MembershipSummary {
  const agency =
    membership.contextType === 'AGENCY' &&
    membership.agencyId &&
    membership.agencyDisplayName &&
    membership.agencyStatus
      ? {
          display_name: membership.agencyDisplayName,
          id: membership.agencyId,
          status: membership.agencyStatus,
        }
      : null;
  const clientOrganization =
    membership.contextType === 'CLIENT' &&
    membership.clientOrganizationId &&
    membership.clientAgencyId &&
    membership.clientDisplayName &&
    membership.clientLegalName &&
    membership.clientStatus &&
    membership.clientTimezone
      ? {
          agency_id: membership.clientAgencyId,
          display_name: membership.clientDisplayName,
          id: membership.clientOrganizationId,
          legal_name: membership.clientLegalName,
          status: membership.clientStatus,
          timezone: membership.clientTimezone,
        }
      : null;

  return {
    agency,
    assignment_scope: membership.assignmentScope,
    branch_ids: membership.branchIds,
    branch_scope_mode: membership.branchScopeMode,
    client_organization: clientOrganization,
    context_type: membership.contextType,
    effective_from: membership.effectiveFrom.toISOString(),
    effective_until: membership.effectiveUntil?.toISOString() ?? null,
    id: membership.id,
    role: {
      application: membership.roleApplication,
      code: membership.roleCode,
      display_name: membership.roleDisplayName,
      id: membership.roleId,
    },
    status: membership.status,
    team_ids: membership.teamIds,
    team_scope_mode: membership.teamScopeMode,
  };
}

export function presentSupportElevation(
  elevation: SupportElevationContext | undefined,
): SupportElevationSummary | null {
  if (!elevation) {
    return null;
  }

  return {
    client_organization: {
      agency_id: elevation.clientOrganization.agencyId,
      display_name: elevation.clientOrganization.displayName,
      id: elevation.clientOrganization.id,
      legal_name: elevation.clientOrganization.legalName,
      status: elevation.clientOrganization.status,
      timezone: elevation.clientOrganization.timezone,
    },
    created_at: elevation.createdAt.toISOString(),
    expires_at: elevation.expiresAt.toISOString(),
    id: elevation.id,
    reason: elevation.reason,
    revoked_at: elevation.revokedAt?.toISOString() ?? null,
  };
}

export function presentResolvedUser(session: SessionAccessRecord): UserProfile {
  return {
    display_name: session.userDisplayName,
    email: session.userEmail,
    id: session.context.userId,
    status: session.userStatus,
  };
}
