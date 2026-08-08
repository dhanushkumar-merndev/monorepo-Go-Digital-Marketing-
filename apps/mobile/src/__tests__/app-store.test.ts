import { resetAppState, useAppStore } from '../store/app-store';

describe('app store', () => {
  beforeEach(() => {
    resetAppState();
  });

  it('keeps connectivity and preview state independently', () => {
    useAppStore.getState().setConnectivity('offline');
    useAppStore.getState().setPreviewState('success');

    expect(useAppStore.getState()).toMatchObject({
      connectivity: 'offline',
      notificationPermission: 'unknown',
      previewState: 'success',
    });
  });

  it('resets all transient foundation state when the auth context changes', () => {
    useAppStore.getState().setConnectivity('online');
    useAppStore.getState().setNotificationPermission('granted');
    useAppStore.getState().setPreviewState('success');

    resetAppState();

    expect(useAppStore.getState()).toMatchObject({
      connectivity: 'unknown',
      notificationPermission: 'unknown',
      previewState: 'loading',
    });
  });
});
