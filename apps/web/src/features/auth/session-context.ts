import type { AuthSession } from './auth-types';

function sorted(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

/**
 * Identifies the server authorization context that owns client-side query and
 * workflow state. Presentation-only profile changes intentionally do not alter
 * this fingerprint.
 */
export function authorizationContextFingerprint(session: AuthSession | null): string {
  if (session === null) return 'anonymous';

  const membership = session.currentMembership;
  const support = session.supportElevation;

  return JSON.stringify({
    assignment: {
      branches: sorted(membership?.branchNames ?? []),
      teams: sorted(membership?.teamNames ?? []),
    },
    effectiveClientOrganizationId:
      support?.clientOrganization.id ?? membership?.clientOrganization.id ?? null,
    membershipClientOrganizationId: membership?.clientOrganization.id ?? null,
    membershipId: membership?.id ?? null,
    membershipStatus: membership?.status ?? null,
    permissions: sorted(session.permissions),
    roleCode: membership?.roleCode ?? null,
    supportElevationId: support?.id ?? null,
    userId: session.user.id,
    userStatus: session.user.status,
  });
}

/** Removes client support authority before any asynchronous server refresh. */
export function withoutSupportElevation(session: AuthSession): AuthSession {
  return session.supportElevation === null ? session : { ...session, supportElevation: null };
}
