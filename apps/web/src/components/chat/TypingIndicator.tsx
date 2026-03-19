'use client';

interface TypingIndicatorProps {
  typingUsers: string[];
}

export function TypingIndicator({ typingUsers }: TypingIndicatorProps) {
  if (typingUsers.length === 0) {
    return null;
  }

  const text =
    typingUsers.length === 1
      ? `${typingUsers[0]} is typing...`
      : typingUsers.length === 2
        ? `${typingUsers[0]} and ${typingUsers[1]} are typing...`
        : `${typingUsers[0]} and ${typingUsers.length - 1} others are typing...`;

  return (
    <div className="px-4 py-2">
      <div className="flex items-center gap-2 bg-[rgba(255,255,255,0.07)] rounded-[18px] rounded-bl-[4px] inline-flex px-[14px] py-[9px] max-w-fit">
        <div className="flex gap-1">
          <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:300ms]" />
        </div>
        <span className="text-[12px] text-muted-foreground">{text}</span>
      </div>
    </div>
  );
}
