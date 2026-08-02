import {
  loginResponseSchema,
  refreshResponseSchema,
  type LoginResponse,
  type RefreshResponse,
} from '@gdm/contracts';

import { InvalidApiResponseError } from '../api/api-error';
import type { MobileSession } from './auth-types';

type AuthenticationGrant = LoginResponse | RefreshResponse;

function parseGrant(value: unknown): AuthenticationGrant {
  const login = loginResponseSchema.safeParse(value);
  if (login.success) {
    return login.data;
  }

  const refresh = refreshResponseSchema.safeParse(value);
  if (refresh.success) {
    return refresh.data;
  }

  throw new InvalidApiResponseError();
}

export function parseAuthenticationResponse(value: unknown): MobileSession {
  const grant = parseGrant(value);
  const membership = grant.active_membership;
  const refreshToken = grant.refresh_token;

  if (
    !refreshToken ||
    !membership ||
    membership.context_type !== 'CLIENT' ||
    membership.status !== 'ACTIVE' ||
    !membership.client_organization ||
    membership.client_organization.status !== 'ACTIVE' ||
    membership.role.application !== 'MOBILE' ||
    grant.session.client_type !== 'mobile' ||
    !grant.session.current ||
    grant.session.revoked_at !== null ||
    grant.user.status !== 'ACTIVE'
  ) {
    throw new InvalidApiResponseError();
  }

  return {
    credentials: {
      accessToken: grant.access_token,
      accessTokenExpiresAt: grant.access_token_expires_at,
      refreshToken,
      refreshTokenExpiresAt: grant.refresh_token_expires_at,
      sessionId: grant.session.id,
    },
    principal: {
      branchIds: membership.branch_ids,
      clientOrganizationId: membership.client_organization.id,
      clientOrganizationName: membership.client_organization.display_name,
      displayName: grant.user.display_name,
      email: grant.user.email,
      membershipId: membership.id,
      permissions: grant.permissions,
      roleCode: membership.role.code,
      teamIds: membership.team_ids,
      userId: grant.user.id,
    },
  };
}
