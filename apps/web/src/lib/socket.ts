import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/auth.store';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:3001';

let chatSocket: Socket | null = null;
let notifSocket: Socket | null = null;

type ConnectionState = 'connected' | 'disconnected' | 'reconnecting';
type ConnectionStateCallback = (state: ConnectionState) => void;

const connectionStateListeners: Set<ConnectionStateCallback> = new Set();

function notifyConnectionState(state: ConnectionState) {
  connectionStateListeners.forEach((cb) => cb(state));
}

/**
 * Subscribe to connection state changes on the notification socket.
 * Returns a cleanup function to unsubscribe.
 */
export function onConnectionStateChange(callback: ConnectionStateCallback): () => void {
  connectionStateListeners.add(callback);
  return () => connectionStateListeners.delete(callback);
}

function getChatSocket(): Socket {
  if (!chatSocket || !chatSocket.connected) {
    const token = useAuthStore.getState().token;
    chatSocket = io(`${SOCKET_URL}/chat`, {
      auth: { token },
      query: { token: token ?? '' },
      transports: ['websocket'],
      autoConnect: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 5000,
      timeout: 5000,
    });
  }
  return chatSocket;
}

function getNotifSocket(): Socket {
  if (!notifSocket || !notifSocket.connected) {
    const token = useAuthStore.getState().token;
    notifSocket = io(`${SOCKET_URL}/notifications`, {
      auth: { token },
      query: { token: token ?? '' },
      transports: ['websocket'],
      autoConnect: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 5000,
      timeout: 5000,
    });

    notifSocket.on('connect', () => notifyConnectionState('connected'));
    notifSocket.on('disconnect', () => notifyConnectionState('disconnected'));
    notifSocket.on('reconnect_attempt', () => notifyConnectionState('reconnecting'));
    notifSocket.on('reconnect', () => notifyConnectionState('connected'));
  }
  return notifSocket;
}

export function disconnectSockets() {
  chatSocket?.disconnect();
  notifSocket?.disconnect();
  chatSocket = null;
  notifSocket = null;
}

export function joinConversationRoom(topicId: string) {
  getChatSocket().emit('join_conversation', { topicId });
}

export function leaveConversationRoom(topicId: string) {
  getChatSocket().emit('leave_conversation', { topicId });
}

export function sendTypingIndicator(topicId: string, isTyping: boolean) {
  getChatSocket().emit('typing', { topicId, isTyping });
}

export function sendReadReceipt(topicId: string, lastReadSequence: number) {
  getChatSocket().emit('read_receipt', { topicId, lastReadSequence });
}

export function subscribeToConversation(
  topicId: string,
  callback: (payload: Record<string, unknown>) => void,
): () => void {
  const socket = getChatSocket();
  socket.on('server_new_message', callback);
  return () => socket.off('server_new_message', callback);
}

export function subscribeToTyping(
  topicId: string,
  callback: (data: { accountId: string; isTyping: boolean }) => void,
): () => void {
  const socket = getChatSocket();
  socket.on('server_typing', callback);
  return () => socket.off('server_typing', callback);
}

export function subscribeToReadReceipts(
  topicId: string,
  callback: (data: Record<string, unknown>) => void,
): () => void {
  const socket = getChatSocket();
  socket.on('server_read_receipt', callback);
  return () => socket.off('server_read_receipt', callback);
}

export function subscribeToPresence(
  topicId: string,
  callback: (data: { accountId: string }) => void,
): () => void {
  const socket = getChatSocket();
  socket.on('server_user_online', callback);
  return () => socket.off('server_user_online', callback);
}

export function subscribeToNotifications(
  callback: (notification: Record<string, unknown>) => void,
): () => void {
  const socket = getNotifSocket();
  socket.on('notification', callback);
  return () => socket.off('notification', callback);
}

// Compatibility re-exports
export function getSocket() {
  return null;
}
export function closeSocket() {
  disconnectSockets();
}
