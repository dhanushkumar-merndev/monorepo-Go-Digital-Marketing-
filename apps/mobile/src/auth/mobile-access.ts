import { isMobileRoleCode, type MobilePrincipal, type MobileRoleCode } from './auth-types';

export type MobileRoute = 'home' | 'profile' | 'test-rides';

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
      'Work assigned Leads, customer conversations and test-ride requests within your live scope.',
    roleLabel: 'Salesperson',
  },
  TEST_RIDE_EXECUTIVE: {
    accent: 'Test ride workspace',
    landingDescription:
      'Open assigned rides, acknowledge location disclosure, track only the active job and submit completion evidence.',
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

  return (
    route === 'home' ||
    route === 'profile' ||
    (route === 'test-rides' &&
      (principal.roleCode === 'SALESPERSON' || principal.roleCode === 'TEST_RIDE_EXECUTIVE'))
  );
}
