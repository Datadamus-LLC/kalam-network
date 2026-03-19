'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePaymentStore } from '@/stores/payment.store';
import { RiRefreshLine, RiSearchLine, RiUserAddLine } from '@remixicon/react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { CreatePostForm } from '@/components/feed/CreatePostForm';
import { PostList } from '@/components/feed/PostList';

type FeedTab = 'for-you' | 'following' | 'trending';

const TABS: { id: FeedTab; label: string }[] = [
  { id: 'for-you', label: 'For you' },
  { id: 'following', label: 'Following' },
  { id: 'trending', label: 'Trending' },
];

export default function FeedPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<FeedTab>('for-you');
  const balance = usePaymentStore((s) => s.balance);

  const handleRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['feed'] });
  };

  // "For you" and "Trending" both show trending; "Following" shows posts from followed accounts
  const feedType = activeTab === 'following' ? 'following' : 'trending';

  return (
    <div className="flex min-h-full">
      <div className="flex-1 min-w-0 border-r border-border">
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm">
          <div className="flex items-center justify-between px-[18px] py-[14px]">
            <h1 className="text-[17px] font-extrabold text-foreground">Home</h1>
            <button
              type="button"
              onClick={handleRefresh}
              className="flex items-center justify-center w-9 h-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
              aria-label="Refresh feed"
            >
              <RiRefreshLine size={18} />
            </button>
          </div>
          <div className="flex border-b border-border">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex-1 py-[14px] text-[15px] font-semibold transition-colors border-b-2 -mb-[1px]',
                  activeTab === tab.id
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-white/[0.03]',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <CreatePostForm />
        <PostList feedType={feedType} />
      </div>
      <aside className="hidden lg:flex flex-col w-[320px] flex-shrink-0 p-4 gap-4 sticky top-0 h-screen overflow-y-auto">
        <Link href="/discover" className="block group">
          <div className="relative">
            <RiSearchLine size={16} className="absolute left-[14px] top-1/2 -translate-y-1/2 text-muted-foreground" />
            <div className="h-[42px] rounded-full border border-border bg-white/[0.04] pl-[38px] pr-4 flex items-center text-[14px] text-muted-foreground group-hover:border-white/20 group-hover:bg-white/[0.07] transition-colors cursor-text">
              Search people…
            </div>
          </div>
        </Link>
        <div className="border border-border rounded-[14px] p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Your Balance</p>
          <p className="text-[28px] font-extrabold text-foreground leading-none">{balance.toFixed(2)}</p>
          <p className="text-[13px] text-muted-foreground mt-1">TMUSD</p>
          <div className="mt-3 pt-3 border-t border-border">
            <Link href="/payments" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">
              View payments →
            </Link>
          </div>
        </div>
        <div className="border border-border rounded-[14px] p-4">
          <p className="text-[15px] font-bold text-foreground mb-3">Who to follow</p>
          <Link
            href="/discover"
            className="flex items-center gap-3 py-2 text-[14px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="flex items-center justify-center w-9 h-9 rounded-full bg-white/[0.06] flex-shrink-0">
              <RiUserAddLine size={18} />
            </span>
            Discover people to follow
          </Link>
        </div>
      </aside>
    </div>
  );
}
