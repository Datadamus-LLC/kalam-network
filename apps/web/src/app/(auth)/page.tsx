'use client';
import Link from 'next/link';
import { KalamLogo } from '@/components/ui/KalamLogo';

export default function HomePage() {
  return (
    <div className="w-full max-w-[360px] mx-4 text-center">
      {/* Logo */}
      <div className="flex justify-center mb-6">
        <KalamLogo className="h-[52px] w-auto" />
      </div>
      <h1 className="text-[22px] font-extrabold text-foreground mb-1">Kalam</h1>
      <p className="text-[14px] text-muted-foreground mb-10">Blockchain-native social platform</p>

      <div className="flex flex-col gap-3">
        <Link href="/register">
          <button className="w-full h-[48px] rounded-full bg-primary text-primary-foreground font-semibold text-[15px] hover:opacity-90 transition-opacity">
            Create Account
          </button>
        </Link>
        <Link href="/login">
          <button className="w-full h-[48px] rounded-full border border-border text-foreground font-semibold text-[15px] hover:bg-white/[0.06] transition-colors">
            Sign In
          </button>
        </Link>
      </div>

      <p className="text-[12px] text-muted-foreground mt-8">Your Hedera wallet is your identity</p>
    </div>
  );
}
