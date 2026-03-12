import { create } from 'zustand';

export interface Conversation {
  id: string;
  hcsTopicId: string;
  type: 'direct' | 'group';
  participants: Array<{ accountId: string; displayName?: string }>;
  lastMessage?: string;
  unreadCount: number;
}

export interface ChatMessage {
  id: string;
  topicId: string;
  senderAccountId: string;
  encryptedPayload: string;
  nonce: string;
  timestamp: string;
}

interface ChatState {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: ChatMessage[];
  typingUsers: Set<string>;

  setConversations: (conversations: Conversation[]) => void;
  setActiveConversation: (conversation: Conversation | null) => void;
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  addTypingUser: (accountId: string) => void;
  removeTypingUser: (accountId: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  activeConversation: null,
  messages: [],
  typingUsers: new Set<string>(),

  setConversations: (conversations) => set({ conversations }),
  setActiveConversation: (activeConversation) => set({ activeConversation }),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  setMessages: (messages) => set({ messages }),
  addTypingUser: (accountId) =>
    set((state) => ({
      typingUsers: new Set(state.typingUsers).add(accountId),
    })),
  removeTypingUser: (accountId) =>
    set((state) => {
      const newTyping = new Set(state.typingUsers);
      newTyping.delete(accountId);
      return { typingUsers: newTyping };
    }),
}));
