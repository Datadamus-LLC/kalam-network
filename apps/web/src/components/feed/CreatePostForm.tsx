'use client';

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/hooks';
import { Avatar, AvatarFallback } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

const MAX_CONTENT_LENGTH = 280;

export function CreatePostForm() {
  const [content, setContent] = useState('');
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const createPostMutation = useMutation({
    mutationFn: (postContent: string) => api.createPost(postContent),
    onSuccess: () => {
      setContent('');
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = content.trim();
      if (trimmed.length === 0 || trimmed.length > MAX_CONTENT_LENGTH) {
        return;
      }
      createPostMutation.mutate(trimmed);
    },
    [content, createPostMutation],
  );

  const remainingChars = MAX_CONTENT_LENGTH - content.length;
  const isOverLimit = remainingChars < 0;
  const isEmpty = content.trim().length === 0;

  return (
    <form
      onSubmit={handleSubmit}
      className="px-[18px] py-[14px] border-b border-border"
    >
      <div className="flex gap-[10px]">
        <Avatar className="flex-shrink-0 mt-0.5">
          <AvatarFallback>{(user?.displayName ?? 'U')[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's happening?"
            rows={3}
            className="w-full resize-none bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none text-[17px] leading-[1.5] rounded-[14px]"
            disabled={createPostMutation.isPending}
            aria-label="Post content"
          />

          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
            {/* Character counter */}
            <span
              className={cn(
                'text-[13px] tabular-nums',
                isOverLimit
                  ? 'text-[#e0245e] font-semibold'
                  : remainingChars <= 20
                    ? 'text-primary font-semibold'
                    : 'text-muted-foreground',
              )}
            >
              {remainingChars}
            </span>

            {/* Post button — lemon pill */}
            <Button
              type="submit"
              disabled={isEmpty || isOverLimit || createPostMutation.isPending}
              className="rounded-full h-[36px] px-[20px] bg-primary text-black font-semibold text-[14px] hover:opacity-90 transition-opacity border-0 disabled:opacity-40"
            >
              {createPostMutation.isPending ? 'Posting…' : 'Post'}
            </Button>
          </div>

          {createPostMutation.isError && (
            <p className="text-[13px] text-[#e0245e] mt-1">
              Failed to create post. Please try again.
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
