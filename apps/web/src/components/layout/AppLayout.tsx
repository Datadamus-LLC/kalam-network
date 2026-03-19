'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/hooks';
import { api } from '@/lib/api';
import { useNotificationStore } from '@/stores/notification.store';
import { env } from '@/lib/env';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar';
import { KalamLogo } from '@/components/ui/KalamLogo';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  RiHomeLine,
  RiSearchLine,
  RiNotification3Line,
  RiMessage3Line,
  RiBankCardLine,
  RiBroadcastLine,
  RiUserLine,
  RiSettings4Line,
  RiBuildingLine,
  RiMoreFill,
  RiMenuLine,
  RiCloseLine,
} from '@remixicon/react';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  /** If true, match exact pathname only */
  exact?: boolean;
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, setUser, logout } = useAuth();
  const pathname = usePathname();
  const { unreadCount, fetchNotifications, subscribeRealtime, unsubscribeRealtime } =
    useNotificationStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Subscribe to real-time notifications (was handled by NotificationBell)
  useEffect(() => {
    if (!user) return;
    void fetchNotifications();
    subscribeRealtime();
    return () => unsubscribeRealtime();
  }, [user, fetchNotifications, subscribeRealtime, unsubscribeRealtime]);

  // Sync latest username/profile into auth store on mount
  useEffect(() => {
    if (!user) return;
    if (user.username !== undefined) return; // already hydrated
    api.getProfile('me').then((profile) => {
      const p = profile as Record<string, unknown>;
      if (p.username !== undefined) {
        setUser({ ...user, username: p.username as string | null });
      }
    }).catch(() => { /* non-critical */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const isBusiness = user?.accountType === 'business';

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const NAV_ITEMS: NavItem[] = [
    { href: '/feed', label: 'Home', icon: RiHomeLine },
    { href: '/discover', label: 'Discover', icon: RiSearchLine },
    { href: '/notifications', label: 'Notifications', icon: RiNotification3Line },
    ...(env.NEXT_PUBLIC_ENABLE_CHAT
      ? [{ href: '/messages', label: 'Messages', icon: RiMessage3Line }]
      : []),
    ...(env.NEXT_PUBLIC_ENABLE_PAYMENTS
      ? [{ href: '/payments', label: 'Payments', icon: RiBankCardLine }]
      : []),
    { href: '/broadcasts', label: 'Broadcasts', icon: RiBroadcastLine },
    { href: '/profile/me', label: 'Profile', icon: RiUserLine, exact: true },
    ...(isBusiness
      ? [{ href: '/organization', label: 'Organization', icon: RiBuildingLine }]
      : []),
    { href: '/settings', label: 'Settings', icon: RiSettings4Line },
  ];

  const userInitial = (user?.displayName ?? user?.hederaAccountId ?? 'U')[0]?.toUpperCase() ?? 'U';
  // Format Hedera account IDs for the sidebar handle
  const formatHandle = (id: string) => {
    if (/^\d+\.\d+\.\d{4,}$/.test(id)) {
      const parts = id.split('.');
      const last = parts[2] ?? '';
      return `@${parts[0]}.${parts[1]}.${last.slice(0, 3)}\u2026${last.slice(-3)}`;
    }
    return `@${id}`;
  };
  const userHandle = user?.username ? `@${user.username}` : (user?.hederaAccountId ? formatHandle(user.hederaAccountId) : '');

  return (
    <div className="min-h-screen bg-background pt-2">
      <div className="mx-auto max-w-[1200px] flex min-h-screen">

        {/* ─── Full labeled sidebar ─── */}
        <aside className="hidden md:flex flex-col w-[220px] flex-shrink-0 border-r border-border py-3 px-3 sticky top-0 h-screen overflow-y-auto">
          {/* Logo */}
          <Link
            href="/feed"
            aria-label="Kalam home"
            className="flex items-center gap-2.5 px-2 mb-5 group"
          >
            <KalamLogo className="h-8 w-auto flex-shrink-0" />
          </Link>

          {/* Nav links */}
          <nav className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href, item.exact);
              const isNotif = item.href === '/notifications';
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'relative flex items-center gap-[14px] px-3 h-[44px] rounded-full transition-colors',
                    active
                      ? 'text-foreground font-bold'
                      : 'text-muted-foreground font-normal hover:text-foreground hover:bg-white/[0.06]',
                  )}
                >
                  <span className="relative flex-shrink-0">
                    <Icon size={20} className={active ? 'stroke-[2.5]' : undefined} />
                    {isNotif && unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-[7px] h-[7px] rounded-full bg-primary" />
                    )}
                  </span>
                  <span className="text-[16px] leading-none">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex-1" />

          {/* Post button */}
          <Link href="/feed" className="mb-3 block">
            <Button className="w-full rounded-full h-[42px] bg-primary text-black font-semibold text-[15px] hover:opacity-90 transition-opacity border-0">
              Post
            </Button>
          </Link>

          {/* Account dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2.5 px-2 py-2 rounded-full hover:bg-white/[0.06] transition-colors w-full text-left"
              >
                <Avatar size="sm">
                  <AvatarImage src={undefined} />
                  <AvatarFallback>{userInitial}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-foreground truncate leading-tight">
                    {user?.displayName ?? 'User'}
                  </p>
                  <p className="text-[12px] text-muted-foreground truncate leading-tight">
                    {userHandle}
                  </p>
                </div>
                <RiMoreFill size={16} className="text-muted-foreground flex-shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-[200px]">
              <DropdownMenuItem asChild>
                <Link href="/settings">Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={logout}
                className="text-destructive focus:text-destructive"
              >
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </aside>

        {/* ─── Mobile overlay backdrop ─── */}
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setIsMobileMenuOpen(false);
            }}
            role="button"
            tabIndex={0}
            aria-label="Close mobile navigation"
          />
        )}

        {/* ─── Mobile sidebar panel ─── */}
        <div
          className={cn(
            'fixed left-0 top-0 h-full w-[260px] bg-background z-50 transform transition-transform md:hidden border-r border-border py-3 px-3 flex flex-col',
            isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full',
          )}
          aria-hidden={!isMobileMenuOpen}
        >
          <div className="flex items-center justify-between px-2 mb-5">
            <Link
              href="/feed"
              className="flex items-center gap-2.5"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <KalamLogo className="h-8 w-auto flex-shrink-0" />
            </Link>
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/[0.06] text-muted-foreground"
              aria-label="Close menu"
            >
              <RiCloseLine size={20} />
            </button>
          </div>

          <nav className="flex flex-col gap-0.5 flex-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href, item.exact);
              const isNotif = item.href === '/notifications';
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    'relative flex items-center gap-[14px] px-3 h-[44px] rounded-full transition-colors',
                    active
                      ? 'text-foreground font-bold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.06]',
                  )}
                >
                  <span className="relative flex-shrink-0">
                    <Icon size={20} />
                    {isNotif && unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-[7px] h-[7px] rounded-full bg-primary" />
                    )}
                  </span>
                  <span className="text-[16px] leading-none">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto pt-3 border-t border-border">
            <button
              type="button"
              onClick={() => {
                logout();
                setIsMobileMenuOpen(false);
              }}
              className="flex items-center px-3 h-[44px] w-full rounded-full text-[16px] text-destructive hover:bg-destructive/10 transition-colors"
            >
              Log out
            </button>
          </div>
        </div>

        {/* ─── Main content area ─── */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Mobile header */}
          <header className="flex md:hidden items-center justify-between px-4 h-14 border-b border-border flex-shrink-0">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-white/[0.06] text-foreground"
              aria-label="Open menu"
            >
              <RiMenuLine size={20} />
            </button>
            <span className="text-[17px] font-extrabold text-foreground">Kalam</span>
            <Link
              href="/settings"
              aria-label="Profile settings"
            >
              <Avatar size="sm">
                <AvatarFallback>{userInitial}</AvatarFallback>
              </Avatar>
            </Link>
          </header>

          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
