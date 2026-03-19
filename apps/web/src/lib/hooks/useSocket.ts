'use client';

import { useRef } from 'react';
import { disconnectSockets } from '@/lib/socket';

interface UseSocketReturn {
  connected: boolean;
  disconnect: () => void;
}

export function useSocket(): UseSocketReturn {
  const connectedRef = useRef(false);

  return {
    connected: connectedRef.current,
    disconnect: disconnectSockets,
  };
}
