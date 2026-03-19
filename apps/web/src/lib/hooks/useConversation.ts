'use client';
import { useChatStore } from '@/stores/chat.store';
import {
  joinConversationRoom, leaveConversationRoom,
  subscribeToConversation, subscribeToTyping,
} from '@/lib/socket';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

export function useConversation(topicId?: string) {
  const addMessage = useChatStore((state) => state.addMessage);
  const addTypingUser = useChatStore((state) => state.addTypingUser);
  const removeTypingUser = useChatStore((state) => state.removeTypingUser);
  const setMessages = useChatStore((state) => state.setMessages);
  const messages = useChatStore((state) => state.messages);
  const typingUsers = useChatStore((state) => state.typingUsers);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!topicId) return;
    joinConversationRoom(topicId);

    const unsubscribeMessages = subscribeToConversation(topicId, (_payload) => {
      api.getConversationMessages(topicId).then((result) => {
        const current = useChatStore.getState().messages;
        const optimistic = current.filter(m => m.id.startsWith('optimistic-'));
        const merged = new Map<string, typeof result.messages[0]>();
        for (const msg of result.messages) merged.set(msg.id, msg);
        for (const opt of optimistic) {
          if (!merged.has(opt.id)) merged.set(opt.id, opt);
        }
        setMessages(Array.from(merged.values()));
      }).catch(() => {});
    });

    const unsubscribeTyping = subscribeToTyping(topicId, ({ accountId, isTyping }) => {
      if (isTyping) addTypingUser(accountId);
      else removeTypingUser(accountId);
    });

    return () => {
      leaveConversationRoom(topicId);
      unsubscribeMessages();
      unsubscribeTyping();
    };
  }, [topicId, addMessage, addTypingUser, removeTypingUser, setMessages, queryClient]);

  return { messages, typingUsers: Array.from(typingUsers), addMessage };
}
