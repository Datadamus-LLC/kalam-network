'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { RiArrowLeftLine } from '@remixicon/react';
import { cn } from '@/lib/utils';
import { Conversation } from '@/stores/chat.store';
import { api } from '@/lib/api';
import { Avatar, AvatarFallback } from '@/components/ui/Avatar';
import { OrgBadge } from '@/components/ui/OrgBadge';

interface ConversationHeaderProps {
  conversation: Conversation;
  currentAccountId: string;
  onlineUsers?: Set<string>;
}

function getConversationTitle(
  conversation: Conversation,
  currentAccountId: string,
): string {
  if (conversation.type === 'group') {
    const names = conversation.participants
      .filter((p) => p.accountId !== currentAccountId)
      .map((p) => p.displayName || p.accountId)
      .join(', ');
    return names || 'Group Chat';
  }

  const otherParticipant = conversation.participants.find(
    (p) => p.accountId !== currentAccountId,
  );

  return otherParticipant?.displayName || otherParticipant?.accountId || 'Chat';
}

function getParticipantCount(conversation: Conversation): number {
  return conversation.participants.length;
}

export function ConversationHeader({
  conversation,
  currentAccountId,
  onlineUsers = new Set(),
}: ConversationHeaderProps) {
  const router = useRouter();
  const title = getConversationTitle(conversation, currentAccountId);
  const participantCount = getParticipantCount(conversation);
  const onlineCount = conversation.participants.filter(
    (p) => p.accountId !== currentAccountId && onlineUsers.has(p.accountId),
  ).length;
  const [isLeaving, setIsLeaving] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  const handleLeave = useCallback(async () => {
    setIsLeaving(true);
    setLeaveError(null);
    try {
      await api.leaveConversation(conversation.id);
      router.push('/messages');
    } catch (err) {
      setLeaveError(err instanceof Error ? err.message : 'Failed to leave conversation');
      setIsLeaving(false);
    }
  }, [conversation.id, router]);

  return (
    <div className="relative border-b border-border px-4 py-3 flex items-center gap-3">
      {/* Back to conversations (visible on mobile and as nav on desktop) */}
      <Link
        href="/messages"
        className="flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors lg:hidden"
        aria-label="Back to conversations"
      >
        <RiArrowLeftLine size={18} />
      </Link>

      {/* Avatar */}
      <Avatar size="sm" className="flex-shrink-0">
        <AvatarFallback>{title[0]?.toUpperCase() ?? '?'}</AvatarFallback>
      </Avatar>

      {/* Name + online status */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <h2 className="text-[15px] font-semibold text-foreground leading-tight break-words">{title}</h2>
          {conversation.type !== 'group' && (() => {
            const other = conversation.participants.find((p) => p.accountId !== currentAccountId);
            return other?.accountType === 'business' ? (
              <OrgBadge size="sm" className="mt-0.5 flex-shrink-0" />
            ) : null;
          })()}
        </div>
        <p className="text-[12px] text-muted-foreground flex items-center gap-1.5">
          {conversation.type === 'group'
            ? `${participantCount} members`
            : 'Direct message'}
          {onlineCount > 0 && (
            <>
              <span className="w-[6px] h-[6px] rounded-full bg-[#00ba7c] inline-block" />
              <span className="text-[#00ba7c]">{onlineCount} online</span>
            </>
          )}
        </p>
      </div>

      {/* Leave button */}
      <button
        type="button"
        onClick={() => setShowLeaveConfirm(true)}
        className="text-[12px] text-muted-foreground hover:text-[#e0245e] transition-colors px-3 py-1.5 rounded-full border border-transparent hover:border-[rgba(224,36,94,0.3)]"
      >
        Leave
      </button>

      {/* Leave confirmation modal — fixed to full viewport */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-background border border-white/[0.14] rounded-[16px] shadow-[0_32px_80px_rgba(0,0,0,0.8)] w-full max-w-[360px] mx-4 p-6">
            <h3 className="text-[17px] font-extrabold text-foreground mb-2">Leave conversation?</h3>
            <p className="text-[14px] text-muted-foreground mb-5">
              You will no longer receive messages from this conversation.
            </p>
            {leaveError && (
              <p className="text-[13px] text-[#e0245e] mb-3">{leaveError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowLeaveConfirm(false); setLeaveError(null); }}
                className="px-5 py-2 text-[13px] font-semibold text-foreground border border-border rounded-full hover:bg-white/[0.06] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { void handleLeave(); }}
                disabled={isLeaving}
                className={cn(
                  'px-5 py-2 text-[13px] font-semibold text-[#e0245e] border border-[rgba(224,36,94,0.4)] rounded-full hover:bg-[rgba(224,36,94,0.1)] transition-colors',
                  isLeaving && 'opacity-50 pointer-events-none',
                )}
              >
                {isLeaving ? 'Leaving…' : 'Leave'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
