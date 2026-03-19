'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RiEditLine, RiMessage3Line } from '@remixicon/react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/hooks';
import { useChatStore, Conversation } from '@/stores/chat.store';
import { ConversationList } from '@/components/chat/ConversationList';
import { NewConversationDialog } from '@/components/chat/NewConversationDialog';

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function MessagesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const setConversations = useChatStore((state) => state.setConversations);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: conversationsData, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const result = await api.getConversations();
      const conversations: Conversation[] = (result.conversations ?? []).map((c) => ({
        id: c.id,
        hcsTopicId: c.hcsTopicId,
        type: c.type as 'direct' | 'group',
        participants: c.participants.map((p) => ({
          accountId: p.accountId,
          displayName: p.displayName ?? undefined,
        })),
        lastMessage: c.lastMessageAt ? formatRelative(c.lastMessageAt) : undefined,
        unreadCount: c.unreadCount,
        // Include encrypted keys for client-side E2E decryption
        encryptedKeys: (c as { encryptedKeys?: Record<string, string> | null }).encryptedKeys ?? null,
      }));
      setConversations(conversations);
      return conversations;
    },
  });

  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleConversationClick = useCallback(
    (topicId: string) => {
      router.push(`/messages/${topicId}`);
    },
    [router],
  );

  const handleCreateConversation = useCallback(
    async (type: 'direct' | 'group', participants: string[], groupName?: string) => {
      setIsCreating(true);
      setCreateError(null);
      try {
        const result = await api.createConversation(type, participants, groupName) as { hcsTopicId?: string } | null;
        await queryClient.invalidateQueries({ queryKey: ['conversations'] });
        if (result?.hcsTopicId) {
          router.push(`/messages/${result.hcsTopicId}`);
        }
        setIsDialogOpen(false);
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : 'Failed to create conversation');
      } finally {
        setIsCreating(false);
      }
    },
    [router, queryClient],
  );

  const conversations = conversationsData ?? [];
  const currentAccountId = user?.hederaAccountId ?? '';

  return (
    <div className="flex min-h-full">
      {/* Conversation list */}
      <div className="w-full md:w-[320px] flex-shrink-0 border-r border-border flex flex-col">
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border px-[18px] py-[14px] flex items-center justify-between">
          <h1 className="text-[17px] font-extrabold text-foreground">Messages</h1>
          <button
            type="button"
            onClick={() => setIsDialogOpen(true)}
            className="flex items-center justify-center w-9 h-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
            aria-label="New conversation"
          >
            <RiEditLine size={18} />
          </button>
        </div>
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-[14px] text-muted-foreground">Loading…</div>
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-4 text-center py-12">
            <RiMessage3Line size={32} className="text-muted-foreground mb-3" />
            <p className="text-[14px] text-muted-foreground">No conversations yet</p>
          </div>
        ) : (
          <ConversationList
            conversations={conversations}
            currentAccountId={currentAccountId}
            onSelectConversation={handleConversationClick}
            isLoading={false}
            error={null}
          />
        )}
      </div>
      {/* Main panel placeholder */}
      <div className="hidden md:flex flex-1 flex-col items-center justify-center gap-3 text-center px-4">
        <RiMessage3Line size={40} className="text-muted-foreground" />
        <p className="text-[16px] font-semibold text-foreground">Your messages</p>
        <p className="text-[14px] text-muted-foreground">Select a conversation to start chatting</p>
      </div>
      <NewConversationDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onCreateConversation={handleCreateConversation}
        isCreating={isCreating}
        createError={createError}
      />
    </div>
  );
}
