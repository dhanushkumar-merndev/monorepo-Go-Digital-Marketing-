import { create } from 'zustand';

import type { SurfaceState } from '../components/ui';

export type ConnectivityState = 'offline' | 'online' | 'unknown';
export type NotificationPermissionState = 'denied' | 'error' | 'granted' | 'unknown';

interface AppState {
  connectivity: ConnectivityState;
  notificationPermission: NotificationPermissionState;
  previewState: SurfaceState;
  setConnectivity: (connectivity: ConnectivityState) => void;
  setNotificationPermission: (permission: NotificationPermissionState) => void;
  setPreviewState: (previewState: SurfaceState) => void;
}

export const useAppStore = create<AppState>((set) => ({
  connectivity: 'unknown',
  notificationPermission: 'unknown',
  previewState: 'loading',
  setConnectivity: (connectivity) => set({ connectivity }),
  setNotificationPermission: (notificationPermission) => set({ notificationPermission }),
  setPreviewState: (previewState) => set({ previewState }),
}));
