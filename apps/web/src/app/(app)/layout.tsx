'use client';

import { useAuth } from '@/lib/hooks';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ReactNode } from 'react';

export default function AppLayoutWrapper({
  children,
}: {
  children: ReactNode;
}) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Redirecting...</p>
      </div>
    );
  }

  return <AppLayout>{children}</AppLayout>;
}
