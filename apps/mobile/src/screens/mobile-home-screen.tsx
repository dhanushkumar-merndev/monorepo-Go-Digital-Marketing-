import { View } from 'react-native';

import { Alert, AppText, Badge, Card } from '../components/ui';
import { MobileShell } from '../components/mobile-shell';
import { mobileRolePresentation } from '../auth/mobile-access';
import { useAppStore } from '../store/app-store';
import { useAuthStore } from '../store/auth-store';

export function MobileHomeScreen() {
  const connectivity = useAppStore((state) => state.connectivity);
  const principal = useAuthStore((state) => state.principal);
  const presentation = principal ? mobileRolePresentation(principal.roleCode) : null;

  return (
    <MobileShell title="Home">
      {connectivity === 'offline' ? (
        <Alert
          description="Authenticated server work waits until connectivity returns. Your refresh token remains in secure device storage."
          title="Offline"
          tone="warning"
        />
      ) : null}

      <Card>
        <View className="gap-2">
          <Badge label={presentation?.accent ?? 'Mobile workspace'} tone="success" />
          <AppText accessibilityRole="header" variant="heading">
            Welcome, {principal?.displayName ?? 'team member'}
          </AppText>
          <AppText tone="muted">
            {presentation?.landingDescription ??
              'Your server-authorized mobile workspace is available.'}
          </AppText>
        </View>
      </Card>

      <Alert
        description="Only routes allowed by your active membership are shown. The NestJS API still verifies every permission, branch, team and assignment."
        title="Server-authorized access"
        tone="info"
      />
    </MobileShell>
  );
}
