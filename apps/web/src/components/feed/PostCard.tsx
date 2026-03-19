'use client';

import React, { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/Avatar';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/hooks';
import { formatRelativeTime } from '@/lib/format-time';
import { cn } from '@/lib/utils';
import {
  RiHeartLine,
  RiHeartFill,
  RiChat1Line,
  RiCloseLine,
} from '@remixicon/react';
import type { BadgeTier } from '@hedera-social/shared';
import { OrgBadge } from '@/components/ui/OrgBadge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PostAuthor {
  accountId: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** Badge tier from server — null for individual accounts */
  badgeTier: BadgeTier | null;
  /** Username handle (e.g. "alice_42") — null if not yet set */
  username?: string | null;
  /** Account type — 'business' shows OrgBadge */
  accountType?: 'individual' | 'business';
}

interface CommentRecord {
  id: string;
  postId: string;
  authorAccountId: string;
  authorDisplayName: string | null;
  contentText: string;
  createdAt: string;
}

interface PostCardProps {
  /** Unique post identifier */
  id: string;
  /** Post author information */
  author: PostAuthor;
  /** Post text content */
  text: string;
  /** ISO8601 timestamp */
  createdAt: string;
  /** Initial like count from server */
  likeCount?: number;
  /** Whether the current user already likes this post */
  isLiked?: boolean;
  /** Initial comment count from server */
  commentCount?: number;
  /** Called after post is successfully deleted */
  onDelete?: (postId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * PostCard displays a single post in the feed.
 *
 * Includes:
 * - Author info with optional VerifiedBadge
 * - Post content
 * - Like/unlike button with optimistic updates
 * - Comment toggle with inline comment list and submission form
 */
export function PostCard({
  id,
  author,
  text,
  createdAt,
  likeCount = 0,
  isLiked = false,
  commentCount = 0,
  onDelete,
}: PostCardProps) {
  // Display name: use displayName if set, otherwise show "Anonymous"
  // (never expose raw account IDs as the primary display name)
  const authorName = author.displayName || 'Anonymous';
  const { user } = useAuth();
  const currentAccountId = user?.hederaAccountId ?? '';

  // ---------------------------------------------------------------------------
  // Like state
  // ---------------------------------------------------------------------------
  const [liked, setLiked] = useState(isLiked);
  const [likes, setLikes] = useState(likeCount);
  // Ref-based mutex prevents double-submission from rapid clicks.
  // We use useRef (not useState) so the guard is synchronous — a state update
  // would not be visible until the next render, allowing a second click to slip through.
  const isLikingRef = useRef(false);

  const handleLikeToggle = useCallback(async () => {
    if (isLikingRef.current) return; // Prevent spam clicks
    isLikingRef.current = true;

    // Optimistic update
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikes((prev) => (wasLiked ? prev - 1 : prev + 1));

    try {
      if (wasLiked) {
        await api.unlikePost(id);
      } else {
        await api.likePost(id);
      }
    } catch {
      // Revert on failure
      setLiked(wasLiked);
      setLikes((prev) => (wasLiked ? prev + 1 : prev - 1));
    } finally {
      isLikingRef.current = false;
    }
  }, [id, liked]);

  // ---------------------------------------------------------------------------
  // Comment state (paginated — loads first 10 on expand, then "load more")
  // ---------------------------------------------------------------------------
  const COMMENTS_PAGE_SIZE = 10;
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentsHasMore, setCommentsHasMore] = useState(false);
  const [commentsCursor, setCommentsCursor] = useState<string | null>(null);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [localCommentCount, setLocalCommentCount] = useState(commentCount);

  const loadComments = useCallback(async (cursor?: string) => {
    // Do not re-fetch the first page if already loaded (and not loading more)
    if (!cursor && commentsLoaded) return;
    setIsLoadingComments(true);
    setCommentError(null);
    try {
      const result = await api.getComments(id, COMMENTS_PAGE_SIZE, cursor) as { comments: CommentRecord[]; hasMore: boolean; cursor: string | null };
      setComments((prev) => cursor ? [...prev, ...result.comments] : result.comments);
      setCommentsHasMore(result.hasMore);
      setCommentsCursor(result.cursor);
      setCommentsLoaded(true);
    } catch (err) {
      setCommentError(
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to load comments',
      );
    } finally {
      setIsLoadingComments(false);
    }
  }, [id, commentsLoaded]);

  const handleToggleComments = useCallback(() => {
    const next = !showComments;
    setShowComments(next);
    if (next && !commentsLoaded) {
      void loadComments();
    }
  }, [showComments, commentsLoaded, loadComments]);

  const handleLoadMoreComments = useCallback(() => {
    if (!commentsHasMore || isLoadingComments || !commentsCursor) return;
    void loadComments(commentsCursor);
  }, [commentsHasMore, isLoadingComments, commentsCursor, loadComments]);

  const handleDeleteComment = useCallback(
    async (commentId: string) => {
      try {
        await api.deleteComment(id, commentId);
        setComments((prev) => prev.filter((c) => c.id !== commentId));
        setLocalCommentCount((prev) => Math.max(0, prev - 1));
      } catch {
        // silently ignore — the comment stays visible if delete fails
      }
    },
    [id],
  );

  const handleSubmitComment = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = commentText.trim();
      if (!trimmed || isSubmittingComment) return;

      setIsSubmittingComment(true);
      setCommentError(null);
      try {
        const created = await api.createComment(id, trimmed) as { id: string; postId: string; authorAccountId: string; authorDisplayName?: string | null; contentText: string; createdAt: string } | null;
        if (created) {
          setComments((prev) => [
            ...prev,
            {
              id: created.id,
              postId: created.postId,
              authorAccountId: created.authorAccountId,
              authorDisplayName: created.authorDisplayName ?? null,
              contentText: created.contentText,
              createdAt: created.createdAt,
            },
          ]);
          setLocalCommentCount((prev) => prev + 1);
        }
        setCommentText('');
      } catch (err) {
        setCommentError(
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to post comment',
        );
      } finally {
        setIsSubmittingComment(false);
      }
    },
    [id, commentText, isSubmittingComment],
  );

  return (
    <article
      className="flex gap-[10px] px-[18px] py-[12px] border-b border-border hover:bg-white/[0.018] transition-colors cursor-pointer"
      aria-label={`Post by ${authorName}`}
    >
      {/* Avatar column */}
      <Link
        href={`/profile/${author.accountId}`}
        onClick={(e) => e.stopPropagation()}
        className="flex-shrink-0 mt-0.5"
      >
        <Avatar size="sm">
          <AvatarImage src={author.avatarUrl ?? undefined} />
          <AvatarFallback>{authorName[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
      </Link>

      {/* Content column */}
      <div className="flex-1 min-w-0">
        {/* Author row */}
        <div className="flex items-center gap-[6px] mb-[2px] flex-wrap">
          <Link
            href={`/profile/${author.accountId}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-[14px] font-semibold text-foreground hover:underline truncate"
          >
            {authorName}
            {author.accountType === 'business' && (
              <OrgBadge size="sm" className="ml-1 flex-shrink-0 self-center" />
            )}
          </Link>

          {author.badgeTier && (
            <VerifiedBadge tier={author.badgeTier} size="sm" />
          )}

          {/* Show @username as secondary identifier — never show account ID */}
          {author.username && (
            <span className="text-[12px] text-muted-foreground truncate">
              @{author.username}
            </span>
          )}

          <span className="text-[13px] text-muted-foreground truncate">
            · {formatRelativeTime(createdAt)}
          </span>
        </div>

        {/* Post content */}
        <p className="text-[14px] text-foreground leading-[1.5] whitespace-pre-wrap break-words overflow-wrap-anywhere mb-[10px] max-w-full overflow-hidden">
          {text}
        </p>

        {/* Action bar */}
        <div className="flex items-center gap-[20px]">
          {/* Like */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void handleLikeToggle(); }}
            className={cn(
              'flex items-center gap-[6px] text-[13px] transition-colors group',
              liked
                ? 'text-[#e0245e]'
                : 'text-muted-foreground hover:text-[#e0245e]',
            )}
            aria-label={liked ? 'Unlike post' : 'Like post'}
            aria-pressed={liked}
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-full group-hover:bg-[#e0245e]/10 transition-colors">
              {liked
                ? <RiHeartFill size={18} aria-hidden />
                : <RiHeartLine size={18} aria-hidden />
              }
            </span>
            {likes > 0 && <span>{likes}</span>}
          </button>

          {/* Comment toggle */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleToggleComments(); }}
            className="flex items-center gap-[6px] text-[13px] text-muted-foreground hover:text-foreground transition-colors group"
            aria-label="Toggle comments"
            aria-expanded={showComments}
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-full group-hover:bg-white/[0.06] transition-colors">
              <RiChat1Line size={18} aria-hidden />
            </span>
            {localCommentCount > 0 && <span>{localCommentCount}</span>}
          </button>

          {/* Delete post — only for own posts */}
          {author.accountId === currentAccountId && onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void api.deletePost(id).then(() => onDelete(id));
              }}
              className="ml-auto flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:text-[#e0245e] hover:bg-[#e0245e]/10 transition-colors"
              aria-label="Delete post"
            >
              <RiCloseLine size={16} aria-hidden />
            </button>
          )}
        </div>

        {/* Comment section */}
        {showComments && (
          <div className="mt-3 pt-3 border-t border-border">
            {/* Error */}
            {commentError && (
              <p className="text-[12px] text-[#e0245e] mb-2">{commentError}</p>
            )}

            {/* Loading */}
            {isLoadingComments && (
              <p className="text-[12px] text-muted-foreground mb-2">Loading comments…</p>
            )}

            {/* Comment list */}
            {comments.length > 0 && (
              <div className="space-y-2 mb-3">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex items-start gap-2">
                    <Avatar size="sm">
                      <AvatarFallback>
                        {comment.authorDisplayName
                          ? comment.authorDisplayName[0]?.toUpperCase()
                          : (comment.authorAccountId.split('.').pop() ?? '?')[0]?.toUpperCase() ?? '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 border border-border rounded-[12px] px-3 py-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[12px] font-semibold text-foreground truncate">
                          {comment.authorDisplayName || 'Anonymous'}
                        </p>
                        {comment.authorAccountId === currentAccountId && (
                          <button
                            type="button"
                            onClick={() => { void handleDeleteComment(comment.id); }}
                            className="text-muted-foreground hover:text-[#e0245e] transition-colors ml-2 flex-shrink-0"
                            aria-label="Delete comment"
                          >
                            <RiCloseLine size={14} aria-hidden />
                          </button>
                        )}
                      </div>
                      <p className="text-[13px] text-foreground mt-0.5">{comment.contentText}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {formatRelativeTime(comment.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!isLoadingComments && comments.length === 0 && commentsLoaded && (
              <p className="text-[12px] text-muted-foreground mb-2">
                No comments yet. Be the first!
              </p>
            )}

            {/* Load more */}
            {commentsHasMore && (
              <button
                type="button"
                onClick={handleLoadMoreComments}
                disabled={isLoadingComments}
                className="text-[12px] text-foreground hover:opacity-70 mb-2 disabled:opacity-40 transition-opacity"
              >
                {isLoadingComments ? 'Loading…' : 'Load more comments'}
              </button>
            )}

            {/* Comment input */}
            <form
              onSubmit={(e) => { void handleSubmitComment(e); }}
              className="flex items-center gap-2"
            >
              <Avatar size="sm">
                <AvatarFallback>{(user?.displayName ?? user?.hederaAccountId?.split('.').pop() ?? 'Y')[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 flex gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Write a comment…"
                  disabled={isSubmittingComment}
                  className="flex-1 h-[36px] rounded-full border border-border bg-white/[0.04] px-4 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 disabled:opacity-40 transition-colors"
                />
                <button
                  type="submit"
                  disabled={!commentText.trim() || isSubmittingComment}
                  className="h-[36px] px-4 rounded-full border border-border text-[13px] font-semibold text-foreground hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmittingComment ? '…' : 'Post'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </article>
  );
}
