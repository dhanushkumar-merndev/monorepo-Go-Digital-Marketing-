import { useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, Card, ListRow } from '../components/ui';
import { MobileShell } from '../components/mobile-shell';
import { useAuth } from '../auth/auth-provider';
import { mobileRolePresentation } from '../auth/mobile-access';
import { useAuthStore } from '../store/auth-store';

export function ProfileScreen() {
  const { logout } = useAuth();
  const principal = useAuthStore((state) => state.principal);
  const [loggingOut, setLoggingOut] = useState(false);
  const presentation = principal ? mobileRolePresentation(principal.roleCode) : null;

  const signOut = async (): Promise<void> => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <MobileShell title="Profile">
      <Card>
        <View className="gap-1">
          <AppText accessibilityRole="header" variant="heading">
            {principal?.displayName ?? 'Mobile user'}
          </AppText>
          <AppText tone="muted">{principal?.email ?? ''}</AppText>
        </View>
        <ListRow
          description={principal?.clientOrganizationName ?? 'Unavailable'}
          disabled
          title="Dealership"
        />
        <ListRow
          description={presentation?.roleLabel ?? 'Unsupported role'}
          disabled
          title="Active role"
        />
      </Card>

      <Button
        label="Sign out of this device"
        loading={loggingOut}
        onPress={() => {
          void signOut();
        }}
        variant="danger"
      />
      <AppText tone="muted" variant="caption">
        Signing out removes the secure token bundle and clears cached server queries. Passwords and
        refresh tokens are never written to the SQLite outbox.
      </AppText>
    </MobileShell>
  );
}
