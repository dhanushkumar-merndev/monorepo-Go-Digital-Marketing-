import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { useState } from 'react';

import {
  Alert,
  AppText,
  Badge,
  Button,
  Card,
  PermissionDisclosure,
  Screen,
  StatePanel,
  type SurfaceState,
} from '../components/ui';
import { reportError } from '../observability/error-reporter';
import { requestNotificationPermission } from '../platform/notifications';
import { useAppStore, type NotificationPermissionState } from '../store/app-store';
import { nativeTheme, type SemanticStatus } from '../theme/native-theme';

const previewStates: SurfaceState[] = ['loading', 'empty', 'error', 'offline', 'success'];

const notificationPresentation: Record<
  NotificationPermissionState,
  { label: string; tone: SemanticStatus }
> = {
  denied: { label: 'Not allowed', tone: 'warning' },
  error: { label: 'Unavailable', tone: 'danger' },
  granted: { label: 'Enabled', tone: 'success' },
  unknown: { label: 'Not requested', tone: 'neutral' },
};

export function FoundationScreen() {
  const connectivity = useAppStore((state) => state.connectivity);
  const notificationPermission = useAppStore((state) => state.notificationPermission);
  const previewState = useAppStore((state) => state.previewState);
  const setNotificationPermission = useAppStore((state) => state.setNotificationPermission);
  const setPreviewState = useAppStore((state) => state.setPreviewState);
  const [requestingPermission, setRequestingPermission] = useState(false);

  const permissionPresentation = notificationPresentation[notificationPermission];

  const requestNotifications = async (): Promise<void> => {
    setRequestingPermission(true);
    try {
      const result = await requestNotificationPermission();
      setNotificationPermission(result);
      AccessibilityInfo.announceForAccessibility(
        result === 'granted' ? 'Notifications enabled' : 'Notifications were not enabled',
      );
    } catch (error: unknown) {
      setNotificationPermission('error');
      reportError(error, { feature: 'notifications', operation: 'request-permission' });
      AccessibilityInfo.announceForAccessibility('Notification permission is unavailable');
    } finally {
      setRequestingPermission(false);
    }
  };

  return (
    <Screen>
      <View className="gap-3">
        <Badge label="Phase 0 foundation" tone="info" />
        <AppText accessibilityRole="header" variant="title">
          Go Digital CRM
        </AppText>
        <AppText tone="muted">
          Android-first infrastructure shell for future assigned work. No dealership workflow is
          enabled in this phase.
        </AppText>
      </View>

      {connectivity === 'offline' ? (
        <Alert
          description="The local shell remains available. Server-authoritative work will resume only after connectivity returns."
          title="Offline"
          tone="warning"
        />
      ) : connectivity === 'online' ? (
        <Alert
          description="Network connectivity is available. No production API session is configured in Phase 0."
          title="Online"
          tone="success"
        />
      ) : (
        <Alert
          description="The app is determining whether the device can reach the network."
          title="Checking connectivity"
          tone="neutral"
        />
      )}

      <Card>
        <View className="gap-2">
          <AppText accessibilityRole="header" variant="heading">
            Mobile platform ready
          </AppText>
          <AppText tone="muted">
            Expo Router, TanStack Query, Zustand, SQLite, notifications and NativeWind are wired for
            later role screens.
          </AppText>
        </View>
        <View className="flex-row flex-wrap gap-2">
          <Badge label="Router" tone="success" />
          <Badge label="Local database" tone="success" />
          <Badge label="Offline-aware" tone="info" />
          <Badge label="Notification channel" tone="neutral" />
        </View>
      </Card>

      <Card>
        <View className="gap-2">
          <AppText accessibilityRole="header" variant="heading">
            Required surface states
          </AppText>
          <AppText tone="muted">
            Preview the reusable loading, empty, error, offline and success treatments.
          </AppText>
        </View>
        <View accessibilityRole="tablist" className="flex-row flex-wrap gap-2">
          {previewStates.map((state) => (
            <Button
              accessibilityRole="tab"
              accessibilityState={{ selected: previewState === state }}
              key={state}
              label={state.charAt(0).toUpperCase() + state.slice(1)}
              onPress={() => setPreviewState(state)}
              variant={previewState === state ? 'primary' : 'secondary'}
            />
          ))}
        </View>
        <StatePanel
          {...(previewState === 'error'
            ? {
                actionLabel: 'Retry preview',
                onAction: () => setPreviewState('success'),
              }
            : {})}
          state={previewState}
        />
      </Card>

      <PermissionDisclosure
        actionLabel={
          notificationPermission === 'granted' ? 'Notifications enabled' : 'Enable notifications'
        }
        bullets={[
          'The system prompt appears only after you choose to continue.',
          'Phase 0 does not register or send a push token.',
          'Notification access can be changed later in Android settings.',
        ]}
        description="Allow task and follow-up notifications when those workflows are introduced. Notification content should remain privacy-minimised on the lock screen."
        disabled={notificationPermission === 'granted'}
        loading={requestingPermission}
        onRequest={() => {
          void requestNotifications();
        }}
        statusLabel={permissionPresentation.label}
        statusTone={permissionPresentation.tone}
        title="Notifications"
      />

      <AppText className="text-center" style={styles.footer} tone="muted" variant="caption">
        No call log, SMS, contacts, accessibility or location permissions are requested.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: nativeTheme.spacing[4],
  },
});
