import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { nativeTheme } from '../theme/native-theme';

export const WORK_UPDATES_CHANNEL_ID = 'work-updates';

export type NotificationPermissionResult = 'denied' | 'granted';
export type NotificationPermissionSnapshot = NotificationPermissionResult | 'unknown';

export async function ensureNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(WORK_UPDATES_CHANNEL_ID, {
    description: 'Assigned-work and follow-up alerts from the CRM.',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: nativeTheme.colors.primary,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    name: 'Work updates',
    vibrationPattern: [0, 180],
  });
}

export async function requestNotificationPermission(): Promise<NotificationPermissionResult> {
  await ensureNotificationChannel();

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) {
    return 'granted';
  }

  if (!current.canAskAgain) {
    return 'denied';
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted ? 'granted' : 'denied';
}

export async function getNotificationPermissionState(): Promise<NotificationPermissionSnapshot> {
  const permission = await Notifications.getPermissionsAsync();

  if (permission.granted) {
    return 'granted';
  }

  return permission.canAskAgain ? 'unknown' : 'denied';
}
