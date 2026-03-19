'use client';

import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface AvatarProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  children?: ReactNode;
}

const sizeClasses = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-[13px]',
  md: 'w-10 h-10 text-[15px]',
  lg: 'w-14 h-14 text-[20px]',
} as const;

export function Avatar({ className, size = 'md', children }: AvatarProps) {
  return (
    <div
      className={cn(
        'relative flex-shrink-0 rounded-full overflow-hidden bg-white/[0.08] flex items-center justify-center',
        sizeClasses[size],
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface AvatarImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
}

export function AvatarImage({ src, alt = '', className }: AvatarImageProps) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={cn('absolute inset-0 w-full h-full object-cover', className)}
    />
  );
}

export interface AvatarFallbackProps {
  children?: ReactNode;
  className?: string;
}

export function AvatarFallback({ children, className }: AvatarFallbackProps) {
  return (
    <span
      className={cn(
        'font-semibold text-foreground select-none',
        className,
      )}
    >
      {children}
    </span>
  );
}
