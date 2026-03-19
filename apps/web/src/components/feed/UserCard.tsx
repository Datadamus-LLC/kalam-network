'use client';

import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface UserCardProps {
  accountId: string;
  displayName?: string;
  bio?: string;
  avatar?: string;
  isFollowing?: boolean;
  /** Hide the follow button (e.g., for the current user) */
  hideFollowButton?: boolean;
}

export function UserCard({
  accountId,
  displayName,
  bio,
  avatar,
  isFollowing = false,
  hideFollowButton = false,
}: UserCardProps) {
  const queryClient = useQueryClient();

  const followMutation = useMutation({
    mutationFn: () => api.followUser(accountId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile', accountId] });
      void queryClient.invalidateQueries({ queryKey: ['discover'] });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: () => api.unfollowUser(accountId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile', accountId] });
      void queryClient.invalidateQueries({ queryKey: ['discover'] });
    },
  });

  const isPending = followMutation.isPending || unfollowMutation.isPending;

  const handleToggleFollow = () => {
    if (isFollowing) {
      unfollowMutation.mutate();
    } else {
      followMutation.mutate();
    }
  };

  const name = displayName ?? accountId;

  return (
    <div className="flex items-center gap-4 px-[18px] py-[14px] border-b border-border hover:bg-white/[0.018] transition-colors">
      <Link href={`/profile/${accountId}`} className="flex-shrink-0">
        <Avatar className="w-[44px] h-[44px]">
          <AvatarImage src={avatar} />
          <AvatarFallback>{name[0]?.toUpperCase() ?? '?'}</AvatarFallback>
        </Avatar>
      </Link>

      <div className="flex-1 min-w-0">
        <Link
          href={`/profile/${accountId}`}
          className="text-[14px] font-semibold text-foreground hover:underline truncate block"
        >
          {name}
        </Link>
        <p className="text-[12px] text-muted-foreground font-mono truncate">{accountId}</p>
        {bio && (
          <p className="text-[13px] text-muted-foreground mt-0.5 line-clamp-2">{bio}</p>
        )}
      </div>

      {!hideFollowButton && (
        <Button
          size="sm"
          onClick={handleToggleFollow}
          disabled={isPending}
          className={cn(
            'flex-shrink-0 rounded-full h-[34px] px-[16px] text-[13px] font-semibold border-0',
            isFollowing
              // Following: outline pill, muted
              ? 'bg-transparent border border-border text-muted-foreground hover:bg-white/[0.06]'
              // Follow: white fill, black text per spec
              : 'bg-white text-black hover:opacity-90',
          )}
        >
          {isPending ? '…' : isFollowing ? 'Following' : 'Follow'}
        </Button>
      )}
    </div>
  );
}
