'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getStoredPrivateKey, decryptConversationKey, tryDecryptMessageContent } from '@/lib/crypto-utils';
import { useAuth, useConversation } from '@/lib/hooks';
import { useChatStore, ChatMessage, Conversation } from '@/stores/chat.store';
import { sendReadReceipt, subscribeToReadReceipts, subscribeToPresence } from '@/lib/socket';
import { RiEditLine } from '@remixicon/react';
import { ConversationHeader } from '@/components/chat/ConversationHeader';
import { ConversationList } from '@/components/chat/ConversationList';
import { MessageList, DecryptedMessage } from '@/components/chat/MessageList';
import { ChatInput } from '@/components/chat/ChatInput';

function mapToDecryptedMessage(
  message: ChatMessage,
  symmetricKey?: Uint8Array | null,
  decryptedContentMap?: Map<string, string>,
): DecryptedMessage {
  // If message has plaintext use it (optimistic sends still carry text)
  const text = message.text;
  // Check if we have a previously decrypted version
  const decrypted = decryptedContentMap?.get(message.id);

  return {
    id: message.id,
    topicId: message.topicId,
    senderAccountId: message.senderAccountId,
    content: decrypted ?? text ?? '',
    timestamp: message.createdAt,
    decryptionFailed: !text && !decrypted && !message.encryptedContent,
    messageType: message.messageType,
  };
}

export default function ChatPage() {
  const params = useParams<{ topicId: string }>();
  const topicId = params.topicId;
  const queryClient = useQueryClient();
  const router = useRouter();
  const { user } = useAuth();
  const currentAccountId = user?.hederaAccountId ?? '';

  const setActiveConversation = useChatStore(
    (state) => state.setActiveConversation,
  );
  const markConversationRead = useChatStore((state) => state.markConversationRead);
  const setMessages = useChatStore((state) => state.setMessages);
  const addMessage = useChatStore((state) => state.addMessage);

  // Subscribe to real-time messages and typing via WebSocket
  const { messages: realtimeMessages, typingUsers } = useConversation(topicId);

  // Subscribe to presence (online/offline) and read receipts
  useEffect(() => {
    const unsubPresence = subscribeToPresence(
      topicId,
      ({ accountId }: { accountId: string }) => setOnlineUsers((prev) => new Set(prev).add(accountId)),
    );
    const unsubReceipts = subscribeToReadReceipts(
      topicId,
      (data) => {
        const accountId = data['accountId'] as string;
        const sequenceNumber = data['sequenceNumber'] as number;
        setReadReceipts((prev) => new Map(prev).set(accountId, sequenceNumber));
      },
    );
    return () => {
      unsubPresence();
      unsubReceipts();
    };
  }, [topicId]);

  const [sendError, setSendError] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [readReceipts, setReadReceipts] = useState<Map<string, number>>(new Map());
  const [symmetricKey, setSymmetricKey] = useState<Uint8Array | null>(null);
  const [decryptedContentMap, setDecryptedContentMap] = useState<Map<string, string>>(new Map());

  // Fetch conversation metadata
  const {
    data: conversationsData,
    isLoading: isLoadingConversations,
  } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const result = await api.getConversations();
      return result.conversations;
    },
    enabled: !!currentAccountId,
  });

  // Find the active conversation from the list
  const activeConversation: Conversation | null = useMemo(() => {
    if (!conversationsData) return null;

    const found = conversationsData.find((c) => c.hcsTopicId === topicId);
    if (!found) return null;

    return {
      id: found.id,
      hcsTopicId: found.hcsTopicId,
      type: found.type as 'direct' | 'group',
      participants: found.participants.map((p) => ({
        accountId: p.accountId,
        displayName: p.displayName ?? undefined,
      })),
      lastMessage: found.lastMessageAt
        ? (() => {
            const d = new Date(found.lastMessageAt);
            const diffMs = Date.now() - d.getTime();
            const mins = Math.floor(diffMs / 60000);
            if (mins < 1) return 'Just now';
            if (mins < 60) return `${mins}m ago`;
            const hrs = Math.floor(mins / 60);
            if (hrs < 24) return `${hrs}h ago`;
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          })()
        : undefined,
      unreadCount: found.unreadCount,
    };
  }, [conversationsData, topicId]);

  // Set active conversation in Zustand store
  useEffect(() => {
    setActiveConversation(activeConversation);
    return () => {
      setActiveConversation(null);
    };
  }, [activeConversation, setActiveConversation]);

  // Derive symmetric key from conversation's encryptedKeys + user's X25519 private key
  useEffect(() => {
    if (!conversationsData || !currentAccountId) return;
    const found = conversationsData.find((c) => c.hcsTopicId === topicId);
    const encryptedKeys = found?.encryptedKeys;
    if (!encryptedKeys) {
      console.warn('[E2E] No encryptedKeys found for conversation', topicId, 'found:', !!found, 'keys in found:', found ? Object.keys(found) : []);
      return;
    }
    const privateKey = getStoredPrivateKey();
    if (!privateKey) {
      console.warn('[E2E] No private key in localStorage');
      return;
    }
    console.log('[E2E] Attempting key derivation for', currentAccountId, 'encryptedKeys accounts:', Object.keys(encryptedKeys));
    decryptConversationKey(encryptedKeys, currentAccountId, privateKey)
      .then((key) => {
        if (key) {
          console.log('[E2E] ✅ Symmetric key derived successfully, length:', key.length);
          setSymmetricKey(key);
        } else {
          console.error('[E2E] ❌ decryptConversationKey returned null — nacl.box.open failed (wrong key?)');
        }
      })
      .catch((err) => {
        console.error('[E2E] ❌ decryptConversationKey threw:', err);
      });
  }, [conversationsData, topicId, currentAccountId]);

  // Fetch messages for this conversation
  const {
    data: messagesData,
    isLoading: isLoadingMessages,
    error: messagesError,
  } = useQuery({
    queryKey: ['messages', topicId],
    queryFn: async () => {
      const result = await api.getConversationMessages(topicId);
      setMessages(result.messages);
      // Mark conversation as read locally (clears unread badge in store)
      markConversationRead(topicId);
      // Invalidate conversations list so unread count refreshes from API
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      // Send read receipt for the latest message
      if (result.messages.length > 0) {
        const latest = result.messages[result.messages.length - 1];
        sendReadReceipt(topicId, latest.sequenceNumber);
      }
      return result.messages;
    },
    enabled: !!topicId,
    // Don't refetch on window focus — would overwrite optimistic messages
    // Messages are updated via WebSocket subscription (useConversation hook)
    refetchOnWindowFocus: false,
  });

  // Decrypt messages client-side when symmetric key is available
  useEffect(() => {
    if (!symmetricKey || !messagesData) return;
    const msgs = Array.isArray(messagesData) ? messagesData : [];
    const toDecrypt = msgs.filter((m) => m.encryptedContent && !m.text);
    if (toDecrypt.length === 0) return;
    Promise.all(
      toDecrypt.map(async (m) => {
        const plain = await tryDecryptMessageContent(m.encryptedContent!, symmetricKey);
        return { id: m.id, plain };
      }),
    ).then((results) => {
      setDecryptedContentMap((prev) => {
        const next = new Map(prev);
        for (const { id, plain } of results) {
          if (plain) next.set(id, plain);
        }
        return next;
      });
    }).catch(() => { /* non-fatal */ });
  }, [symmetricKey, messagesData]);

  // Build participant name lookup
  const participantNames = useMemo(() => {
    const nameMap = new Map<string, string>();
    if (activeConversation) {
      for (const p of activeConversation.participants) {
        nameMap.set(p.accountId, p.displayName || p.accountId);
      }
    }
    return nameMap;
  }, [activeConversation]);

  // Map messages to DecryptedMessage format for display
  const displayMessages = useMemo(() => {
    const allMessages = messagesData ?? [];

    // Merge API messages with realtime messages, deduplicating by ID
    const messageMap = new Map<string, ChatMessage>();
    for (const msg of allMessages) {
      messageMap.set(msg.id, msg);
    }
    for (const msg of realtimeMessages) {
      messageMap.set(msg.id, msg);
    }

    return Array.from(messageMap.values())
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((msg) => mapToDecryptedMessage(msg, symmetricKey, decryptedContentMap));
  }, [messagesData, realtimeMessages, symmetricKey, decryptedContentMap]);

  // Send message mutation — encrypts client-side before sending
  const sendMessageMutation = useMutation({
    mutationFn: async (text: string) => {
      let encryptedContent: string | undefined;
      // Encrypt client-side if symmetric key is available
      if (symmetricKey) {
        try {
          const { encryptMessage } = await import('@/lib/crypto-utils');
          const enc = await encryptMessage(text, symmetricKey);
          encryptedContent = JSON.stringify(enc);
        } catch {
          // Encryption failed — send plaintext as fallback (will be visible)
        }
      }
      return api.sendMessage(topicId, text, encryptedContent);
    },
    onMutate: (text: string) => {
      // Optimistic update: add the message immediately with the plaintext
      const optimisticMsg = {
        id: `optimistic-${Date.now()}`,
        topicId,
        senderAccountId: currentAccountId,
        text,
        sequenceNumber: 0,
        consensusTimestamp: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      addMessage(optimisticMsg);
    },
    onSuccess: () => {
      setSendError(null);
      // Don't invalidate messages query — it would overwrite optimistic messages
      // (API returns encrypted metadata without plaintext text).
      // Messages are updated via WebSocket when server confirms delivery.
    },
    onError: (error: Error) => {
      setSendError(error.message);
    },
  });

  const handleSendMessage = useCallback(
    (text: string) => {
      sendMessageMutation.mutate(text);
    },
    [sendMessageMutation],
  );

  // Filter typing users to exclude the current user
  const filteredTypingUsers = typingUsers.filter(
    (accountId) => accountId !== currentAccountId,
  );

  if (!activeConversation && !isLoadingMessages && !isLoadingConversations) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-[15px] font-semibold text-foreground">Conversation not found</p>
          <p className="text-[13px] text-muted-foreground mt-1">
            This conversation may not exist or you may not have access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* ── Conversation list panel (300px, desktop only) ── */}
      <div className="hidden md:flex flex-col w-[300px] flex-shrink-0 border-r border-border">
        <div className="border-b border-border px-4 py-[14px] flex items-center justify-between flex-shrink-0">
          <h1 className="text-[17px] font-extrabold text-foreground">Messages</h1>
          <button
            type="button"
            onClick={() => router.push('/messages')}
            className="flex items-center justify-center w-9 h-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
            aria-label="New conversation"
          >
            <RiEditLine size={18} />
          </button>
        </div>
        <ConversationList
          conversations={(conversationsData ?? []).map(c => ({
            ...c,
            type: c.type as 'direct' | 'group',
            participants: c.participants.map(p => ({ accountId: p.accountId, displayName: p.displayName ?? undefined })),
          }))}
          activeTopicId={topicId}
          currentAccountId={currentAccountId}
          onSelectConversation={(id) => router.push(`/messages/${id}`)}
          isLoading={false}
          error={null}
        />
      </div>

      {/* ── Chat panel ── */}
      <div className="flex-1 min-w-0 flex flex-col">
      {/* Conversation header */}
      {activeConversation && (
        <ConversationHeader
          conversation={activeConversation}
          currentAccountId={currentAccountId}
          onlineUsers={onlineUsers}
        />
      )}

      {/* Message list */}
      <MessageList
        messages={displayMessages}
        currentAccountId={currentAccountId}
        isGroupChat={activeConversation?.type === 'group'}
        typingUsers={filteredTypingUsers}
        isLoading={isLoadingMessages}
        error={
          messagesError instanceof Error ? messagesError.message : sendError
        }
        participantNames={participantNames}
      />

      {/* Chat input */}
      <ChatInput
        topicId={topicId}
        onSendMessage={handleSendMessage}
        disabled={sendMessageMutation.isPending}
      />
      </div>
    </div>
  );
}
