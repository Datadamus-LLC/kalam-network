'use client';

import { useCallback, useRef, useState, useMemo } from 'react';
import { RiSendPlaneFill } from '@remixicon/react';
import { sendTypingIndicator } from '@/lib/socket';
import { debounce } from '@/lib/timers';

interface ChatInputProps {
  topicId: string;
  onSendMessage: (text: string) => void;
  disabled?: boolean;
}

export function ChatInput({ topicId, onSendMessage, disabled = false }: ChatInputProps) {
  const [text, setText] = useState('');
  const isTypingRef = useRef(false);

  const stopTyping = useMemo(
    () =>
      debounce(() => {
        isTypingRef.current = false;
        sendTypingIndicator(topicId, false);
      }, 2000),
    [topicId],
  );

  const handleTyping = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      sendTypingIndicator(topicId, true);
    }

    // Reset the stop-typing debounce on each keystroke
    stopTyping.fn();
  }, [topicId, stopTyping]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Stop typing indicator immediately
    stopTyping.cancel();
    if (isTypingRef.current) {
      isTypingRef.current = false;
      sendTypingIndicator(topicId, false);
    }

    onSendMessage(trimmed);
    setText('');
  }, [text, topicId, onSendMessage, stopTyping]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const hasText = text.trim().length > 0;

  return (
    <div className="border-t border-border px-4 py-3">
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            handleTyping();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-[20px] border border-border bg-white/[0.06] px-4 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed max-h-32 transition-colors"
          style={{ minHeight: '42px' }}
          aria-label="Type a message"
        />
        {/* Send button: lemon when message typed, muted when empty */}
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || !hasText}
          className="flex-shrink-0 flex items-center justify-center w-[42px] h-[42px] rounded-full transition-all"
          style={{
            backgroundColor: hasText ? 'var(--color-primary)' : 'rgba(255,255,255,0.06)',
            color: hasText ? '#000' : 'rgba(255,255,255,0.4)',
          }}
          aria-label="Send message"
        >
          <RiSendPlaneFill size={18} />
        </button>
      </div>
    </div>
  );
}
