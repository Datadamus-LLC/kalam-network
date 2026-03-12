'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/hooks';
import { Avatar } from '@/components/ui/Avatar';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 p-4 flex flex-col">
        <h1 className="text-2xl font-bold text-blue-600 mb-8">Social</h1>

        <nav className="flex-1 space-y-2">
          <NavLink href="/feed" label="Home" />
          <NavLink href="/messages" label="Messages" />
          <NavLink href="/discover" label="Discover" />
          <NavLink href="/payments" label="Payments" />
          <NavLink href="/notifications" label="Notifications" />
        </nav>

        {/* User menu */}
        <div className="pt-4 border-t border-gray-200">
          {user && (
            <div className="flex items-center space-x-3 mb-4">
              <Avatar alt={user.displayName || 'User'} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {user.displayName}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {user.hederaAccountId}
                </p>
              </div>
            </div>
          )}
          <button
            onClick={logout}
            className="w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
    >
      {label}
    </Link>
  );
}
