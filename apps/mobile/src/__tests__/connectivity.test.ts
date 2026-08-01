import { mapNetworkState } from '../platform/connectivity';

describe('mapNetworkState', () => {
  it('treats an unreachable internet connection as offline', () => {
    expect(
      mapNetworkState({
        isConnected: true,
        isInternetReachable: false,
      }),
    ).toBe('offline');
  });

  it('does not claim connectivity before the platform resolves it', () => {
    expect(mapNetworkState({})).toBe('unknown');
    expect(mapNetworkState({ isConnected: true })).toBe('unknown');
  });
});
