'use client';

import { useEffect, useRef } from 'react';
import { getSocket, closeSocket } from '@/lib/socket';

interface UseSocketReturn {
  connected: boolean;
  disconnect: () => void;
}

export function useSocket(): UseSocketReturn {
  const connectedRef = useRef(false);

  useEffect(() => {
    // Connect socket on mount
    const socket = getSocket();
    connectedRef.current = socket.connected;

    const handleConnect = () => {
      connectedRef.current = true;
    };

    const handleDisconnect = () => {
      connectedRef.current = false;
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  return {
    connected: connectedRef.current,
    disconnect: closeSocket,
  };
}
