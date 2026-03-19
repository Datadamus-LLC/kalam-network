'use client';

import { useEffect, useState } from 'react';
import { getSocket, closeSocket } from '@/lib/socket';

interface UseSocketReturn {
  connected: boolean;
  disconnect: () => void;
}

export function useSocket(): UseSocketReturn {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Trigger lazy socket init and subscribe to connection state changes
    const socket = getSocket();
    setConnected(socket.connected);

    const handleConnect = () => {
      setConnected(true);
    };

    const handleDisconnect = () => {
      setConnected(false);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  return {
    connected,
    disconnect: closeSocket,
  };
}
