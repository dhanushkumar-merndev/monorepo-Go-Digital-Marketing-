import { getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  CANONICAL_ROLE_CODES,
  PERMISSION_CODES,
  authenticationAuditEvents,
  authenticationIdentities,
  externalAuthChallenges,
  membershipBranchScopes,
  membershipTeamScopes,
  memberships,
  refreshSessions,
  refreshTokenRotations,
  supportElevations,
} from './index.js';

describe('Phase 1 identity and authorization schema', () => {
  it('preserves all canonical roles and permission definitions', () => {
    expect(CANONICAL_ROLE_CODES).toHaveLength(12);
    expect(new Set(CANONICAL_ROLE_CODES).size).toBe(12);
    expect(PERMISSION_CODES).toContain('platform.support_elevation.manage');
    expect(PERMISSION_CODES).toContain('organization.clients.read');
  });

  it('stores explicit membership and assignment scope modes', () => {
    const columns = getTableConfig(memberships).columns.map((column) => column.name);

    expect(columns).toEqual(
      expect.arrayContaining([
        'branch_scope_mode',
        'team_scope_mode',
        'assignment_scope',
        'client_organization_id',
      ]),
    );
    expect(getTableName(membershipBranchScopes)).toBe('membership_branch_scopes');
    expect(getTableName(membershipTeamScopes)).toBe('membership_team_scopes');
  });

  it('stores scrypt parameters and persistent lockout state with password identities', () => {
    const config = getTableConfig(authenticationIdentities);
    const columns = config.columns.map((column) => column.name);

    expect(columns).toEqual(
      expect.arrayContaining([
        'password_digest',
        'password_salt',
        'password_scrypt_n',
        'password_scrypt_r',
        'password_scrypt_p',
        'password_key_length',
        'failed_attempt_count',
        'locked_until',
        'provider_email_normalized',
      ]),
    );
    expect(config.indexes.map((entry) => entry.config.name)).toContain(
      'authentication_identities_lockout_idx',
    );
    expect(config.indexes.map((entry) => entry.config.name)).toContain(
      'authentication_identities_user_provider_uidx',
    );
  });

  it('persists client-bound, single-use Google authentication challenges', () => {
    const config = getTableConfig(externalAuthChallenges);
    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        'purpose',
        'client_type',
        'nonce_hash',
        'user_id',
        'session_id',
        'expires_at',
        'consumed_at',
      ]),
    );
    expect(config.indexes.map((entry) => entry.config.name)).toContain(
      'external_auth_challenges_nonce_hash_uidx',
    );
  });

  it('keeps mutable session state separate from append-only token rotations', () => {
    expect(getTableName(refreshSessions)).toBe('refresh_sessions');
    expect(getTableName(refreshTokenRotations)).toBe('refresh_token_rotations');
    expect(
      getTableConfig(refreshTokenRotations).indexes.map((entry) => entry.config.name),
    ).toContain('refresh_token_rotations_session_sequence_uidx');
  });

  it('provides dedicated support and immutable authentication audit structures', () => {
    expect(getTableName(supportElevations)).toBe('support_elevations');
    expect(getTableName(authenticationAuditEvents)).toBe('authentication_audit_events');
  });
});
