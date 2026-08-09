import { authRouteForStatus } from '../auth/auth-routing';
import { canAccessMobileRoute, mobileRolePresentation } from '../auth/mobile-access';
import { mobileRoleCodes, officeRoleCodes } from '../auth/auth-types';

describe('mobile role and route policy', () => {
  it.each(mobileRoleCodes)('allows %s into the guarded home/profile shell', (roleCode) => {
    expect(canAccessMobileRoute({ roleCode }, 'home')).toBe(true);
    expect(canAccessMobileRoute({ roleCode }, 'profile')).toBe(true);
    expect(mobileRolePresentation(roleCode)).not.toBeNull();
  });

  it('allows test-ride routes only for the two mobile roles with Phase 6 capability', () => {
    expect(canAccessMobileRoute({ roleCode: 'TEST_RIDE_EXECUTIVE' }, 'test-rides')).toBe(true);
    expect(canAccessMobileRoute({ roleCode: 'SALESPERSON' }, 'test-rides')).toBe(true);
    expect(canAccessMobileRoute({ roleCode: 'DELIVERY_EXECUTIVE' }, 'test-rides')).toBe(false);
  });

  it('allows delivery routes only for delivery executives', () => {
    expect(canAccessMobileRoute({ roleCode: 'DELIVERY_EXECUTIVE' }, 'deliveries')).toBe(true);
    expect(canAccessMobileRoute({ roleCode: 'SALESPERSON' }, 'deliveries')).toBe(false);
    expect(canAccessMobileRoute({ roleCode: 'TEST_RIDE_EXECUTIVE' }, 'deliveries')).toBe(false);
  });

  it.each(officeRoleCodes)(
    'denies office/admin role %s from every mobile app route',
    (roleCode) => {
      expect(canAccessMobileRoute({ roleCode }, 'home')).toBe(false);
      expect(canAccessMobileRoute({ roleCode }, 'profile')).toBe(false);
      expect(mobileRolePresentation(roleCode)).toBeNull();
    },
  );

  it('maps terminal authentication states away from guarded routes', () => {
    expect(authRouteForStatus('session-expired')?.publicPath).toBe('/session-expired');
    expect(authRouteForStatus('disabled')?.publicPath).toBe('/disabled');
    expect(authRouteForStatus('unsupported-role')?.publicPath).toBe('/unsupported');
    expect(authRouteForStatus('unauthenticated')?.publicPath).toBe('/login');
  });
});
