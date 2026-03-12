'use client';

import { useChatStore, ChatMessage } from '@/stores/chat.store';
import { subscribeToConversation, subscribeToTyping } from '@/lib/socket';
import { useEffect } from 'react';

export function useConversation(topicId?: string) {
  const addMessage = useChatStore((state) => state.addMessage);
  const addTypingUser = useChatStore((state) => state.addTypingUser);
  const removeTypingUser = useChatStore((state) => state.removeTypingUser);
  const messages = useChatStore((state) => state.messages);
  const typingUsers = useChatStore((state) => state.typingUsers);

  useEffect(() => {
    if (!topicId) return;

    const unsubscribeMessages = subscribeToConversation<ChatMessage>(topicId, (message) => {
      addMessage(message);
    });

    const unsubscribeTyping = subscribeToTyping(
      topicId,
      ({ accountId, isTyping }) => {
        if (isTyping) {
          addTypingUser(accountId);
        } else {
          removeTypingUser(accountId);
        }
      },
    );

    return () => {
      unsubscribeMessages();
      unsubscribeTyping();
    };
  }, [topicId, addMessage, addTypingUser, removeTypingUser]);

  return {
    messages,
    typingUsers: Array.from(typingUsers),
    addMessage,
  };
}
