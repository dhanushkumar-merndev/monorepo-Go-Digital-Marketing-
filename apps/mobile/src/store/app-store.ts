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
  reset: () => void;
}

const initialAppState = {
  connectivity: 'unknown' as const,
  notificationPermission: 'unknown' as const,
  previewState: 'loading' as const,
};

export const useAppStore = create<AppState>((set) => ({
  ...initialAppState,
  reset: () => set(initialAppState),
  setConnectivity: (connectivity) => set({ connectivity }),
  setNotificationPermission: (notificationPermission) => set({ notificationPermission }),
  setPreviewState: (previewState) => set({ previewState }),
}));

export function resetAppState(): void {
  useAppStore.getState().reset();
}
