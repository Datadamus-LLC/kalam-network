/**
 * Socket.io client for real-time features
 * Singleton instance shared across the app
 */

import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3002';

let socket: Socket | null = null;

/**
 * Get or create the Socket.io connection
 */
export function getSocket(): Socket {
  if (socket) {
    return socket;
  }

  socket = io(WS_URL, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    transports: ['websocket', 'polling'],
  });

  return socket;
}

/**
 * Close the Socket.io connection
 */
export function closeSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Subscribe to a conversation's messages
 */
export function subscribeToConversation<T = Record<string, unknown>>(
  topicId: string,
  onMessage: (message: T) => void,
): () => void {
  const s = getSocket();
  const handler = (...args: unknown[]) => {
    onMessage(args[0] as T);
  };
  s.on(`conversation:${topicId}`, handler);

  // Return unsubscribe function
  return () => {
    s.off(`conversation:${topicId}`, handler);
  };
}

/**
 * Subscribe to typing indicators
 */
export function subscribeToTyping(
  topicId: string,
  onTyping: (data: { accountId: string; isTyping: boolean }) => void,
): () => void {
  const s = getSocket();
  s.on(`typing:${topicId}`, onTyping);
  return () => {
    s.off(`typing:${topicId}`, onTyping);
  };
}

/**
 * Send a typing indicator
 */
export function sendTypingIndicator(topicId: string, isTyping: boolean): void {
  const s = getSocket();
  s.emit('typing', { topicId, isTyping });
}

/**
 * Subscribe to notifications
 */
export function subscribeToNotifications(
  onNotification: (notification: Record<string, unknown>) => void,
): () => void {
  const s = getSocket();
  s.on('notification', onNotification);
  return () => {
    s.off('notification', onNotification);
  };
}
