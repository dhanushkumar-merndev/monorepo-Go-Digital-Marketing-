import { Redirect } from 'expo-router';

import { authRouteForStatus } from '../src/auth/auth-routing';
import { SessionBootstrapScreen } from '../src/screens/session-bootstrap-screen';
import { useAuthStore } from '../src/store/auth-store';

export default function EntryRoute() {
  const status = useAuthStore((state) => state.status);
  const destination = authRouteForStatus(status);

  return destination ? <Redirect href={destination.href} /> : <SessionBootstrapScreen />;
}
