import { Redirect, Stack, usePathname } from 'expo-router';

import { authRouteForStatus } from '../../src/auth/auth-routing';
import { SessionBootstrapScreen } from '../../src/screens/session-bootstrap-screen';
import { useAuthStore } from '../../src/store/auth-store';

export default function AuthLayout() {
  const pathname = usePathname();
  const status = useAuthStore((state) => state.status);

  if (status === 'bootstrapping') {
    return <SessionBootstrapScreen />;
  }

  const destination = authRouteForStatus(status);
  if (destination && pathname !== destination.publicPath) {
    return <Redirect href={destination.href} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
