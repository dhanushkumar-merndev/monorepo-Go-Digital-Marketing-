import { onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { useEffect } from 'react';

import { reportError } from '../observability/error-reporter';
import { useAppStore, type ConnectivityState } from '../store/app-store';

function mapNetworkState(state: Network.NetworkState): ConnectivityState {
  if (state.isConnected === false || state.isInternetReachable === false) {
    return 'offline';
  }

  if (state.isConnected === true && state.isInternetReachable === true) {
    return 'online';
  }

  return 'unknown';
}

export function useConnectivity(): void {
  const setConnectivity = useAppStore((state) => state.setConnectivity);

  useEffect(() => {
    let mounted = true;

    const update = (networkState: Network.NetworkState): void => {
      if (!mounted) {
        return;
      }

      const connectivity = mapNetworkState(networkState);
      setConnectivity(connectivity);

      if (connectivity !== 'unknown') {
        onlineManager.setOnline(connectivity === 'online');
      }
    };

    void Network.getNetworkStateAsync()
      .then(update)
      .catch((error: unknown) => {
        reportError(error, { feature: 'connectivity', operation: 'initial-state' });
      });

    const subscription = Network.addNetworkStateListener(update);

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [setConnectivity]);
}

export { mapNetworkState };
