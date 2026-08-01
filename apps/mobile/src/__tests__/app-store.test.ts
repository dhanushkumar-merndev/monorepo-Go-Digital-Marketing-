import { useAppStore } from '../store/app-store';

describe('app store', () => {
  beforeEach(() => {
    useAppStore.setState({
      connectivity: 'unknown',
      notificationPermission: 'unknown',
      previewState: 'loading',
    });
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
});
