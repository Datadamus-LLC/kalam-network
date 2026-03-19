'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks';
import { AppLayout } from '@/components/layout/AppLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ReactNode } from 'react';
import { api } from '@/lib/api';
import { getStoredPrivateKey, storePrivateKey, unwrapPrivateKeyWithPin } from '@/lib/crypto-utils';
import { PinModal } from '@/components/ui/PinModal';

export default function AppLayoutWrapper({ children }: { children: ReactNode }) {
  const { isAuthenticated, user, token, setUser } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const fetchedRef = useRef(false);
  const [showPinRestore, setShowPinRestore] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<string | null>(null);
  const [pinRestoreError, setPinRestoreError] = useState<string | null>(null);
  const [pinRestoreLoading, setPinRestoreLoading] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Hydrate user profile when authenticated but user is null
  useEffect(() => {
    if (!mounted || !isAuthenticated || !token || user !== null) return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    api.getProfile('me')
      .then((profile) => {
        setUser({
          id: '',
          hederaAccountId: profile.hederaAccountId,
          status: 'active',
          accountType: profile.accountType as 'individual' | 'business',
          displayName: profile.displayName,
          kycLevel: profile.kycLevel as 'basic' | 'enhanced' | 'institutional' | null,
        });
      })
      .catch(() => {});
  }, [mounted, isAuthenticated, token, user, setUser]);

  useEffect(() => {
    if (!mounted) return;
    if (!isAuthenticated) {
      router.push('/');
    }
  }, [mounted, isAuthenticated, router]);

  // Auto-provision E2E encryption key on login.
  // - No local key, no DB key → auto-generate (first time setup)
  // - No local key, DB key exists, no backup → can't auto-restore (user must regen in Settings)
  // - No local key, DB key exists, backup with PIN → prompt user for PIN
  useEffect(() => {
    if (!mounted || !isAuthenticated || !user?.hederaAccountId) return;
    const localKey = getStoredPrivateKey(user.hederaAccountId);
    if (localKey) return;

    api.ensureEncryptionKey()
      .then(async (result) => {
        if (result.generated && result.encryptionPrivateKey) {
          // Brand new key — store locally (PIN setup handled in Settings)
          storePrivateKey(result.encryptionPrivateKey, user.hederaAccountId!);
          return;
        }
        // Existing key — check for PIN-wrapped backup
        if (!result.generated) {
          try {
            const backupResult = await api.getKeyBackup();
            const backup = backupResult.encryptedBackup;
            if (backup && backup.includes('"v":"2"')) {
              // PIN-wrapped backup exists — prompt user for PIN
              setPendingBackup(backup);
              setShowPinRestore(true);
            }
            // No backup or server-wrapped only — user must regenerate in Settings
          } catch { /* non-critical */ }
        }
      })
      .catch(() => { /* non-critical */ });
  }, [mounted, isAuthenticated, user?.hederaAccountId]);

  const handlePinRestore = async (pin: string) => {
    if (!pendingBackup || !user?.hederaAccountId) return;
    setPinRestoreLoading(true);
    setPinRestoreError(null);
    try {
      const privateKey = await unwrapPrivateKeyWithPin(pendingBackup, pin, user.hederaAccountId);
      storePrivateKey(privateKey, user.hederaAccountId);
      // Notify any open chat page that the encryption key is now available
      window.dispatchEvent(new CustomEvent('kalam-key-restored', { detail: { accountId: user.hederaAccountId } }));
      setShowPinRestore(false);
      setPendingBackup(null);
    } catch {
      setPinRestoreError('Wrong PIN — please try again');
    } finally {
      setPinRestoreLoading(false);
    }
  };

  if (!mounted || !isAuthenticated) return null;

  return (
    <ErrorBoundary>
      {showPinRestore && (
        <PinModal
          mode="enter"
          onSubmit={handlePinRestore}
          onCancel={() => { setShowPinRestore(false); setPendingBackup(null); }}
          error={pinRestoreError}
          isLoading={pinRestoreLoading}
        />
      )}
      <AppLayout>{children}</AppLayout>
    </ErrorBoundary>
  );
}
