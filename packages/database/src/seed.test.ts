import { describe, expect, it } from 'vitest';

import { CANONICAL_ROLE_CODES } from './schema/index.js';
import { DEVELOPMENT_SEED_USERS } from './seed.js';

describe('development seed definition', () => {
  it('covers every role family and two distinct clients deterministically', () => {
    expect(new Set(DEVELOPMENT_SEED_USERS.map((user) => user.roleCode))).toEqual(
      new Set(CANONICAL_ROLE_CODES),
    );
    expect(
      new Set(
        DEVELOPMENT_SEED_USERS.flatMap((user) =>
          user.clientOrganizationId ? [user.clientOrganizationId] : [],
        ),
      ).size,
    ).toBe(2);
    expect(DEVELOPMENT_SEED_USERS).toHaveLength(12);
  });

  it('provides scope records only when the corresponding mode is SELECTED', () => {
    for (const user of DEVELOPMENT_SEED_USERS) {
      expect((user.branchIds?.length ?? 0) > 0).toBe(user.branchScopeMode === 'SELECTED');
      expect((user.teamScopes?.length ?? 0) > 0).toBe(user.teamScopeMode === 'SELECTED');
    }
  });

  it('uses non-production test identities', () => {
    expect(
      DEVELOPMENT_SEED_USERS.every((user) => user.email.endsWith('@seed.godigital.test')),
    ).toBe(true);
  });
});
