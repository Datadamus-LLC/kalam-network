'use client';

import { useEffect, useState } from 'react';
import { onConnectionStateChange, disconnectSockets } from '@/lib/socket';

interface UseSocketReturn {
  connected: boolean;
  disconnect: () => void;
}

export function useSocket(): UseSocketReturn {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Subscribe to connection state — this also triggers lazy socket init
    const unsubscribe = onConnectionStateChange((state) => {
      setConnected(state === 'connected');
    });
    return unsubscribe;
  }, []);

  return { connected, disconnect: disconnectSockets };
}
