import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  isOffline: boolean;
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isConnected: true,
    isInternetReachable: true,
    isOffline: false,
  });

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isConnected = state.isConnected ?? true;
      const isReachable = state.isInternetReachable;
      // Consider offline if disconnected or reachability is confirmed false
      const isOffline = !isConnected || isReachable === false;

      setStatus({
        isConnected,
        isInternetReachable: isReachable,
        isOffline,
      });
    });

    return () => unsubscribe();
  }, []);

  return status;
}
