'use client';

import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/Avatar';
import { Conversation } from '@/stores/chat.store';

interface ConversationListProps {
  conversations: Conversation[];
  activeTopicId?: string;
  currentAccountId: string;
  onSelectConversation: (topicId: string) => void;
  isLoading: boolean;
  error: string | null;
}

function getConversationDisplayName(
  conversation: Conversation,
  currentAccountId: string,
): string {
  if (conversation.type === 'group') {
    const names = conversation.participants
      .filter((p) => p.accountId !== currentAccountId)
      .map((p) => p.displayName || p.accountId);
    return names.join(', ') || 'Group Chat';
  }

  const other = conversation.participants.find(
    (p) => p.accountId !== currentAccountId,
  );
  return other?.displayName || other?.accountId || 'Unknown';
}

function getAvatarInitial(name: string): string {
  return name.charAt(0).toUpperCase() || '?';
}

export function ConversationList({
  conversations,
  activeTopicId,
  currentAccountId,
  onSelectConversation,
  isLoading,
  error,
}: ConversationListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 border-2 border-border border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-[#e0245e] text-[13px]">{error}</p>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-[14px] text-foreground font-semibold">No conversations yet</p>
        <p className="text-[13px] text-muted-foreground mt-1">
          Start a new conversation to begin messaging
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto flex-1">
      {conversations.map((conversation) => {
        const displayName = getConversationDisplayName(
          conversation,
          currentAccountId,
        );
        const isActive = conversation.hcsTopicId === activeTopicId;
        const hasUnread = conversation.unreadCount > 0;

        return (
          <button
            key={conversation.id}
            onClick={() => onSelectConversation(conversation.hcsTopicId)}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3 text-left border-b border-border transition-colors',
              isActive
                ? 'bg-white/[0.06]'
                : 'hover:bg-white/[0.025]',
            )}
          >
            <Avatar className="flex-shrink-0">
              <AvatarFallback>{getAvatarInitial(displayName)}</AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className={cn(
                  'text-[14px] truncate',
                  hasUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground',
                )}>
                  {displayName}
                </p>
                {hasUnread && (
                  <span className="ml-2 flex-shrink-0 bg-primary/15 text-primary text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-[5px]">
                    {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
                  </span>
                )}
              </div>

              {conversation.lastMessage && (
                <p className={cn(
                  'text-[12px] truncate mt-0.5',
                  hasUnread ? 'text-foreground' : 'text-muted-foreground',
                )}>
                  {conversation.lastMessage}
                </p>
              )}

              {conversation.type === 'group' && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {conversation.participants.length} members
                </p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
