'use client';

import { useCallback, useState, useEffect, useMemo } from 'react';
import { RiCloseLine, RiSearchLine, RiUserLine } from '@remixicon/react';
import { cn } from '@/lib/utils';
import { debounce } from '@/lib/timers';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/hooks';

interface UserResult {
  hederaAccountId: string;
  displayName: string | null;
  avatarUrl?: string | null;
}

interface NewConversationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateConversation: (
    type: 'direct' | 'group',
    participants: string[],
    groupName?: string,
  ) => void;
  isCreating: boolean;
  createError: string | null;
}

export function NewConversationDialog({
  isOpen,
  onClose,
  onCreateConversation,
  isCreating,
  createError,
}: NewConversationDialogProps) {
  const { user: currentUser } = useAuth();
  const [type, setType] = useState<'direct' | 'group'>('direct');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [participants, setParticipants] = useState<UserResult[]>([]);
  const [groupName, setGroupName] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Stable debounced search function — recreated only when currentUser changes
  const { fn: debouncedSearch, cancel: cancelDebouncedSearch } = useMemo(
    () =>
      debounce(async (query: string, currentParticipants: UserResult[]) => {
        setIsSearching(true);
        try {
          const result = await api.searchUsers(query, undefined, 10);
          const users = (result.users as UserResult[]).filter(
            (u) =>
              u.hederaAccountId &&
              u.hederaAccountId !== currentUser?.hederaAccountId &&
              !currentParticipants.some(
                (p) => p.hederaAccountId === u.hederaAccountId,
              ),
          );
          setSearchResults(users);
        } catch {
          // non-critical — intentionally silent; results reset to empty on failure
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      }, 300),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser?.hederaAccountId],
  );

  // Trigger debounced search whenever query or participants change
  useEffect(() => {
    if (!searchQuery.trim()) {
      cancelDebouncedSearch();
      setSearchResults([]);
      return;
    }
    debouncedSearch(searchQuery, participants);
    return cancelDebouncedSearch;
  }, [searchQuery, participants, debouncedSearch, cancelDebouncedSearch]);

  const handleSelectUser = useCallback(
    (user: UserResult) => {
      if (type === 'direct') {
        // For direct, replace any existing participant
        setParticipants([user]);
      } else {
        if (!participants.some((p) => p.hederaAccountId === user.hederaAccountId)) {
          setParticipants((prev) => [...prev, user]);
        }
      }
      setSearchQuery('');
      setSearchResults([]);
      setValidationError(null);
    },
    [type, participants],
  );

  const handleRemoveParticipant = useCallback((accountId: string) => {
    setParticipants((prev) => prev.filter((p) => p.hederaAccountId !== accountId));
  }, []);

  const handleSubmit = useCallback(() => {
    if (participants.length === 0) {
      setValidationError('Select at least one person to message');
      return;
    }
    if (type === 'direct' && participants.length !== 1) {
      setValidationError('Direct messages require exactly one participant');
      return;
    }
    if (type === 'group' && participants.length < 2) {
      setValidationError('Group conversations require at least two participants');
      return;
    }
    if (type === 'group' && !groupName.trim()) {
      setValidationError('Group name is required');
      return;
    }
    setValidationError(null);
    onCreateConversation(
      type,
      participants.map((p) => p.hederaAccountId),
      type === 'group' ? groupName.trim() : undefined,
    );
  }, [type, participants, groupName, onCreateConversation]);

  const handleClose = useCallback(() => {
    setType('direct');
    setSearchQuery('');
    setSearchResults([]);
    setParticipants([]);
    setGroupName('');
    setValidationError(null);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="bg-background border border-white/[0.14] rounded-[16px] shadow-[0_32px_80px_rgba(0,0,0,0.8)] w-full max-w-md mx-4">
        {/* Header */}
        <div className="border-b border-border px-5 py-[18px] flex items-center justify-between">
          <h2 className="text-[17px] font-extrabold text-foreground">New Conversation</h2>
          <button
            onClick={handleClose}
            className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/[0.06] text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close dialog"
          >
            <RiCloseLine size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-5 space-y-4">
          {/* Conversation type pills */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setType('direct'); setValidationError(null); setParticipants([]); }}
              className={cn(
                'flex-1 h-[38px] rounded-full text-[13px] font-semibold border transition-all',
                type === 'direct'
                  ? 'bg-white/10 border-white/15 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-white/[0.06] hover:text-foreground',
              )}
            >
              Direct Message
            </button>
            <button
              type="button"
              onClick={() => { setType('group'); setValidationError(null); }}
              className={cn(
                'flex-1 h-[38px] rounded-full text-[13px] font-semibold border transition-all',
                type === 'group'
                  ? 'bg-white/10 border-white/15 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-white/[0.06] hover:text-foreground',
              )}
            >
              Group Chat
            </button>
          </div>

          {/* Group name */}
          {type === 'group' && (
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name"
              className="w-full h-[42px] rounded-full border border-border bg-white/[0.04] px-4 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 transition-colors"
            />
          )}

          {/* Selected participant(s) */}
          {participants.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {participants.map((p) => (
                <div
                  key={p.hederaAccountId}
                  className="flex items-center gap-1.5 bg-white/[0.08] border border-white/[0.12] rounded-full px-3 py-1"
                >
                  <span className="text-[13px] font-semibold text-foreground">
                    {p.displayName ?? p.hederaAccountId}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveParticipant(p.hederaAccountId)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={`Remove ${p.displayName ?? p.hederaAccountId}`}
                  >
                    <RiCloseLine size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Search box */}
          {(type === 'group' || participants.length === 0) && (
            <div className="relative">
              <div className="flex items-center gap-2 h-[42px] rounded-full border border-border bg-white/[0.04] px-4 focus-within:border-white/20 transition-colors">
                <RiSearchLine size={15} className="text-muted-foreground flex-shrink-0" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name or account ID…"
                  className="flex-1 bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none"
                  autoFocus
                />
                {isSearching && (
                  <span className="text-[12px] text-muted-foreground">…</span>
                )}
              </div>

              {/* Search results dropdown */}
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-[12px] shadow-lg overflow-hidden z-10">
                  {searchResults.map((user) => (
                    <button
                      key={user.hederaAccountId}
                      type="button"
                      onClick={() => handleSelectUser(user)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.06] transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0">
                        <span className="text-[13px] font-bold text-foreground">
                          {(user.displayName ?? user.hederaAccountId).charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-foreground truncate">
                          {user.displayName ?? 'Anonymous'}
                        </p>
                        <p className="text-[11px] text-muted-foreground font-mono truncate">
                          {user.hederaAccountId}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {searchQuery.trim() && !isSearching && searchResults.length === 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-[12px] px-4 py-3 z-10">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <RiUserLine size={14} />
                    <span className="text-[13px]">No users found for &quot;{searchQuery}&quot;</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Errors */}
          {validationError && (
            <p className="text-[13px] text-[#e0245e]">{validationError}</p>
          )}
          {createError && (
            <p className="text-[13px] text-[#e0245e]">{createError}</p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-[14px] flex gap-2 justify-end">
          <Button
            variant="outline"
            className="rounded-full h-[40px] px-5"
            onClick={handleClose}
          >
            Cancel
          </Button>
          <Button
            className="rounded-full h-[40px] px-5"
            onClick={handleSubmit}
            disabled={isCreating || participants.length === 0}
          >
            {isCreating ? 'Opening…' : 'Start Chat'}
          </Button>
        </div>
      </div>
    </div>
  );
}
