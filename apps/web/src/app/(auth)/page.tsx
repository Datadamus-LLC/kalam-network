'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

export default function AuthPage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Welcome</h1>
        <p className="text-gray-600 mt-2">
          Blockchain-native social platform on Hedera
        </p>
      </div>

      <div className="space-y-3">
        <Button
          onClick={() => router.push('/register')}
          className="w-full"
        >
          Create Account
        </Button>
        <Button
          variant="secondary"
          onClick={() => router.push('/login')}
          className="w-full"
        >
          Sign In
        </Button>
      </div>

      <p className="text-center text-sm text-gray-500">
        Your Hedera wallet is your identity
      </p>
    </div>
  );
}
