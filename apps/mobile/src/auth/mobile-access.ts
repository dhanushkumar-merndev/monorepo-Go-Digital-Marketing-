import { isMobileRoleCode, type MobilePrincipal, type MobileRoleCode } from './auth-types';

export type MobileRoute = 'home' | 'profile';

export interface MobileRolePresentation {
  accent: string;
  landingDescription: string;
  roleLabel: string;
}

const rolePresentation: Record<MobileRoleCode, MobileRolePresentation> = {
  DELIVERY_EXECUTIVE: {
    accent: 'Delivery workspace',
    landingDescription:
      'Your authenticated delivery workspace is ready. Delivery operations are introduced in a later phase.',
    roleLabel: 'Delivery Executive',
  },
  SALESPERSON: {
    accent: 'Sales workspace',
    landingDescription:
      'Your authenticated sales workspace is ready. Assigned lead operations are introduced in a later phase.',
    roleLabel: 'Salesperson',
  },
  TEST_RIDE_EXECUTIVE: {
    accent: 'Test ride workspace',
    landingDescription:
      'Your authenticated test ride workspace is ready. Ride operations are introduced in a later phase.',
    roleLabel: 'Test Ride Executive',
  },
};

export function mobileRolePresentation(roleCode: string): MobileRolePresentation | null {
  return isMobileRoleCode(roleCode) ? rolePresentation[roleCode] : null;
}

export function canAccessMobileRoute(
  principal: Pick<MobilePrincipal, 'roleCode'>,
  route: MobileRoute,
): boolean {
  if (!isMobileRoleCode(principal.roleCode)) {
    return false;
  }

  return route === 'home' || route === 'profile';
}
