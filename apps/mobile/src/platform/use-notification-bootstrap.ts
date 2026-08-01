import { useEffect } from 'react';

import { reportError } from '../observability/error-reporter';
import { useAppStore } from '../store/app-store';
import { ensureNotificationChannel, getNotificationPermissionState } from './notifications';

export function useNotificationBootstrap(): void {
  const setNotificationPermission = useAppStore((state) => state.setNotificationPermission);

  useEffect(() => {
    void ensureNotificationChannel()
      .then(getNotificationPermissionState)
      .then(setNotificationPermission)
      .catch((error: unknown) => {
        setNotificationPermission('error');
        reportError(error, { feature: 'notifications', operation: 'configure-channel' });
      });
  }, [setNotificationPermission]);
}
