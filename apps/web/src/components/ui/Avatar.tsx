import React from 'react';
import Image from 'next/image';
import clsx from 'clsx';

interface AvatarProps {
  src?: string;
  alt: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: { className: 'w-8 h-8', pixels: 32 },
  md: { className: 'w-12 h-12', pixels: 48 },
  lg: { className: 'w-16 h-16', pixels: 64 },
} as const;

export function Avatar({ src, alt, size = 'md' }: AvatarProps) {
  const sizeConfig = sizeMap[size];

  return (
    <div
      className={clsx(
        sizeConfig.className,
        'rounded-full bg-gray-200 overflow-hidden flex-shrink-0',
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          width={sizeConfig.pixels}
          height={sizeConfig.pixels}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-blue-500 flex items-center justify-center text-white font-bold">
          {alt[0]?.toUpperCase() ?? '?'}
        </div>
      )}
    </div>
  );
}
