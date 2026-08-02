import { Redirect, Stack } from 'expo-router';

import { authRouteForStatus } from '../../src/auth/auth-routing';
import { isMobileRoleCode } from '../../src/auth/auth-types';
import { SessionBootstrapScreen } from '../../src/screens/session-bootstrap-screen';
import { UnsupportedRoleScreen } from '../../src/screens/unsupported-role-screen';
import { useAuthStore } from '../../src/store/auth-store';

export default function AuthenticatedLayout() {
  const principal = useAuthStore((state) => state.principal);
  const status = useAuthStore((state) => state.status);

  if (status === 'bootstrapping' || status === 'authenticating') {
    return <SessionBootstrapScreen />;
  }

  if (status !== 'authenticated' || !principal) {
    const destination = authRouteForStatus(status);
    return <Redirect href={destination?.href ?? '/(auth)/login'} />;
  }

  if (!isMobileRoleCode(principal.roleCode)) {
    return <UnsupportedRoleScreen />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
