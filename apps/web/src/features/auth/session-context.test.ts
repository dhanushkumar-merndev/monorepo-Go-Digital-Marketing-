import { describe, expect, it } from 'vitest';

import { testAuthSession, testMembership } from './auth-component-test-utils';
import { authorizationContextFingerprint, withoutSupportElevation } from './session-context';

describe('authorization context fingerprint', () => {
  it('changes for user, membership, tenant, support, and authorization-scope changes', () => {
    const base = testAuthSession('AGENCY_ADMIN', ['platform.support_elevation.manage']);
    const fingerprint = authorizationContextFingerprint(base);
    const changedMembership = testMembership('AGENCY_ADMIN', {
      clientOrganization: {
        id: '77777777-7777-4777-8777-777777777777',
        name: 'Go Digital Agency',
      },
      id: '88888888-8888-4888-8888-888888888888',
    });

    expect(
      authorizationContextFingerprint({ ...base, currentMembership: changedMembership }),
    ).not.toBe(fingerprint);
    expect(
      authorizationContextFingerprint({
        ...base,
        supportElevation: {
          clientOrganization: {
            id: '99999999-9999-4999-8999-999999999999',
            name: 'Supported Client',
          },
          expiresAt: '2026-08-10T10:00:00.000Z',
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          reason: 'Investigating an authorized support request',
        },
      }),
    ).not.toBe(fingerprint);
    expect(
      authorizationContextFingerprint({
        ...base,
        user: { ...base.user, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
      }),
    ).not.toBe(fingerprint);
    expect(
      authorizationContextFingerprint({
        ...base,
        permissions: [...base.permissions, 'leads.read'],
      }),
    ).not.toBe(fingerprint);
  });

  it('ignores presentation-only names but removes support authority immutably', () => {
    const base = testAuthSession('AGENCY_ADMIN', ['platform.support_elevation.manage']);
    const elevated = {
      ...base,
      supportElevation: {
        clientOrganization: {
          id: '99999999-9999-4999-8999-999999999999',
          name: 'Supported Client',
        },
        expiresAt: '2026-08-10T10:00:00.000Z',
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        reason: 'Investigating an authorized support request',
      },
    };

    expect(
      authorizationContextFingerprint({
        ...base,
        user: { ...base.user, displayName: 'Updated display name' },
      }),
    ).toBe(authorizationContextFingerprint(base));
    expect(withoutSupportElevation(elevated)).toMatchObject({ supportElevation: null });
    expect(elevated.supportElevation).not.toBeNull();
  });
});
