import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { Badge, Button, Screen, AppText } from './ui';
import { mobileRolePresentation } from '../auth/mobile-access';
import { useAuthStore } from '../store/auth-store';
import { nativeTheme } from '../theme/native-theme';

export interface MobileShellProps {
  children: ReactNode;
  title: string;
}

export function MobileShell({ children, title }: MobileShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const principal = useAuthStore((state) => state.principal);
  const presentation = principal ? mobileRolePresentation(principal.roleCode) : null;

  return (
    <Screen>
      <View className="gap-2" style={styles.header}>
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <AppText accessibilityRole="header" variant="title">
            {title}
          </AppText>
          {presentation ? <Badge label={presentation.roleLabel} tone="info" /> : null}
        </View>
        {principal ? (
          <AppText tone="muted" variant="caption">
            {principal.clientOrganizationName}
          </AppText>
        ) : null}
      </View>

      <View accessibilityRole="tablist" className="flex-row gap-2" style={styles.navigation}>
        <Button
          accessibilityRole="tab"
          accessibilityState={{ selected: pathname === '/home' }}
          className="flex-1"
          label="Home"
          onPress={() => router.replace('/(app)/home')}
          variant={pathname === '/home' ? 'primary' : 'secondary'}
        />
        {principal?.permissions.includes('messaging.conversations.read') ? (
          <Button
            accessibilityRole="tab"
            accessibilityState={{ selected: pathname.startsWith('/inbox') }}
            className="flex-1"
            label="Inbox"
            onPress={() => router.replace('/(app)/inbox')}
            variant={pathname.startsWith('/inbox') ? 'primary' : 'secondary'}
          />
        ) : null}
        <Button
          accessibilityRole="tab"
          accessibilityState={{ selected: pathname.startsWith('/leads') }}
          className="flex-1"
          label="Leads"
          onPress={() => router.replace('/(app)/leads')}
          variant={pathname.startsWith('/leads') ? 'primary' : 'secondary'}
        />
        <Button
          accessibilityRole="tab"
          accessibilityState={{ selected: pathname === '/profile' }}
          className="flex-1"
          label="Profile"
          onPress={() => router.replace('/(app)/profile')}
          variant={pathname === '/profile' ? 'primary' : 'secondary'}
        />
      </View>

      {children}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: nativeTheme.colors.card,
    borderColor: nativeTheme.colors.border,
    borderRadius: nativeTheme.radii.lg,
    borderWidth: 1,
    padding: nativeTheme.spacing[4],
  },
  navigation: {
    backgroundColor: nativeTheme.colors.card,
    borderBottomColor: nativeTheme.colors.border,
    borderBottomWidth: 1,
    borderColor: nativeTheme.colors.border,
    borderRadius: nativeTheme.radii.lg,
    borderWidth: 1,
    padding: nativeTheme.spacing[2],
    paddingBottom: nativeTheme.spacing[4],
  },
});
