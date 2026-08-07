import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthorizationPolicy } from '../src/authorization/authorization-policy.js';
import type { AuthorizationContext } from '../src/authorization/authorization.types.js';

const policy = new AuthorizationPolicy();

function context(overrides: Partial<AuthorizationContext> = {}): AuthorizationContext {
  return {
    assignmentScope: 'OWNED_OR_ASSIGNED',
    branchIds: new Set(['branch-a']),
    branchScopeMode: 'SELECTED',
    departmentIds: new Set(['department-a']),
    departmentScopeMode: 'SELECTED',
    clientOrganizationId: 'client-a',
    membershipId: 'membership-a',
    managedTeamIds: new Set<string>(),
    permissionCodes: new Set(['account.profile.read'] as const),
    roleCode: 'SALESPERSON',
    sessionId: 'session-a',
    teamIds: new Set(['team-a']),
    teamScopeMode: 'SELECTED',
    userId: 'user-a',
    ...overrides,
  };
}

describe('AuthorizationPolicy', () => {
  it('defaults permission checks to deny and requires every declared permission', () => {
    const value = context({
      permissionCodes: new Set(['account.profile.read', 'account.sessions.read'] as const),
    });

    assert.equal(policy.hasEveryPermission(value, []), false);
    assert.equal(policy.hasEveryPermission(value, ['account.profile.read']), true);
    assert.equal(
      policy.hasEveryPermission(value, ['account.profile.read', 'organization.users.read']),
      false,
    );
  });

  it('denies another tenant before evaluating branch, team, or assignment scope', () => {
    assert.equal(
      policy.canAccessResource(context(), {
        assigneeId: 'user-a',
        branchId: 'branch-a',
        clientOrganizationId: 'client-b',
        teamId: 'team-a',
      }),
      false,
    );
  });

  it('denies selected-scope users from another branch or team', () => {
    const value = context({ assignmentScope: 'TEAM' });

    assert.equal(policy.canAccessBranch(value, 'branch-b'), false);
    assert.equal(policy.canAccessTeam(value, 'team-b'), false);
    assert.equal(
      policy.canAccessResource(value, {
        branchId: 'branch-b',
        clientOrganizationId: 'client-a',
        teamId: 'team-a',
      }),
      false,
    );
  });

  it('requires self-scoped resources to be owned or assigned to the current user', () => {
    assert.equal(
      policy.canAccessResource(context(), {
        assigneeId: 'user-b',
        branchId: 'branch-a',
        clientOrganizationId: 'client-a',
        ownerId: 'user-b',
        teamId: 'team-a',
      }),
      false,
    );
    assert.equal(
      policy.canAccessResource(context(), {
        assigneeId: 'user-a',
        branchId: 'branch-a',
        clientOrganizationId: 'client-a',
        ownerId: 'user-b',
        teamId: 'team-a',
      }),
      true,
    );
  });
});
