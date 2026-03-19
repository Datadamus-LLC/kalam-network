'use client';

import { cn } from '@/lib/utils';
import { format, isToday, isYesterday } from 'date-fns';

interface MessageBubbleProps {
  content: string;
  senderName: string;
  timestamp: string;
  isSentByCurrentUser: boolean;
  isGroupChat: boolean;
  decryptionFailed?: boolean;
}

function formatMessageTime(timestamp: string): string {
  const date = new Date(timestamp);

  // Guard against invalid dates (e.g. null/empty timestamps from async HCS flow)
  if (!timestamp || isNaN(date.getTime())) {
    return '';
  }

  if (isToday(date)) {
    return format(date, 'h:mm a');
  }

  if (isYesterday(date)) {
    return `Yesterday ${format(date, 'h:mm a')}`;
  }

  return format(date, 'MMM d, h:mm a');
}

export function MessageBubble({
  content,
  senderName,
  timestamp,
  isSentByCurrentUser,
  isGroupChat,
  decryptionFailed = false,
}: MessageBubbleProps) {
  return (
    <div
      className={cn('flex mb-2', {
        'justify-end': isSentByCurrentUser,
        'justify-start': !isSentByCurrentUser,
      })}
    >
      <div
        className={cn(
          'max-w-[70%] px-[14px] py-[9px]',
          // Spec: sent = rgba(255,255,255,0.13) + flat bottom-right corner
          // Spec: received = rgba(255,255,255,0.07) + flat bottom-left corner
          isSentByCurrentUser
            ? 'bg-[rgba(255,255,255,0.13)] rounded-[18px] rounded-br-[4px]'
            : 'bg-[rgba(255,255,255,0.07)] rounded-[18px] rounded-bl-[4px]',
        )}
      >
        {/* Show sender name in group chats for received messages */}
        {isGroupChat && !isSentByCurrentUser && (
          <p className="text-[11px] font-semibold text-primary mb-1">
            {senderName}
          </p>
        )}

        {decryptionFailed ? (
          <p className="text-[14px] text-muted-foreground italic">
            Unable to decrypt message
          </p>
        ) : !content ? (
          <p className="text-[13px] text-muted-foreground italic">
            [Message content unavailable]
          </p>
        ) : (
          <p className="text-[14px] text-foreground whitespace-pre-wrap break-words leading-[1.4]">
            {content}
          </p>
        )}

        <p className="text-[11px] text-muted-foreground mt-[4px]">
          {formatMessageTime(timestamp)}
        </p>
      </div>
    </div>
  );
}
