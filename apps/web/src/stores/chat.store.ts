import { create } from 'zustand';

export interface Conversation {
  id: string;
  hcsTopicId: string;
  type: 'direct' | 'group';
  participants: Array<{ accountId: string; displayName?: string; accountType?: 'individual' | 'business' }>;
  lastMessage?: string;
  unreadCount: number;
  /** X25519-encrypted AES-256 symmetric key for each participant (accountId → base64) */
  encryptedKeys?: Record<string, string> | null;
}

export interface ChatMessage {
  id: string;
  topicId: string;
  senderAccountId: string;
  text: string;
  encryptedContent?: string | null; // Client-side AES-256-GCM encrypted content
  sequenceNumber: number;
  consensusTimestamp: string;
  createdAt: string;
  messageType?: string;
}

interface ChatState {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: ChatMessage[];
  typingUsers: Set<string>;

  setConversations: (conversations: Conversation[]) => void;
  setActiveConversation: (conversation: Conversation | null) => void;
  markConversationRead: (topicId: string) => void;
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
  markConversationRead: (topicId) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.hcsTopicId === topicId ? { ...c, unreadCount: 0 } : c,
      ),
    })),
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
