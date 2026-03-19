"use client";
export const dynamic = "force-dynamic";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import {
  RiCloseLine,
  RiExternalLinkLine,
  RiFileCopyLine,
  RiCheckLine,
} from "@remixicon/react";
import { useAuth } from "@/lib/hooks";
import { api } from "@/lib/api";
import { env } from "@/lib/env";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PinModal } from "@/components/ui/PinModal";
import { createTimeout, debounce } from "@/lib/timers";
import { getStoredPrivateKey } from "@/lib/crypto-utils";

const HASHSCAN_BASE_URL = `${env.NEXT_PUBLIC_HASHSCAN_URL}/${env.NEXT_PUBLIC_HEDERA_NETWORK}`;

type SectionId = "profile" | "account" | "wallet" | "appearance" | "danger";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "account", label: "Account" },
  { id: "wallet", label: "Wallet & Encryption" },
  { id: "appearance", label: "Appearance" },
  { id: "danger", label: "Danger Zone" },
];

export default function SettingsPage() {
  const { user, setUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const [activeSection, setActiveSection] = useState<SectionId>("profile");

  const [walletStatus, setWalletStatus] = useState<{
    hederaAccountId: string | null;
    status: string;
    hasEncryptionKey: boolean;
    hasBackup: boolean;
  } | null>(null);
  const [isEnsuringKey, setIsEnsuringKey] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [username, setUsername] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(
    null,
  );
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Initialize form from user data — also fetch full profile to get bio/avatar/username
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || "");
    }
    // Fetch full profile for fields not in auth store (bio, avatarUrl, username)
    api
      .getProfile("me")
      .then((profile) => {
        setBio(profile.bio ?? "");
        setAvatarUrl(profile.avatarUrl ?? "");
        if (!user?.displayName && profile.displayName) {
          setDisplayName(profile.displayName);
        }
        const profileWithUsername = profile as typeof profile & {
          username?: string | null;
        };
        setUsername(profileWithUsername.username ?? "");
      })
      .catch(() => {
        /* non-critical */
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load wallet status
  useEffect(() => {
    api
      .getWalletStatus()
      .then((s) => setWalletStatus({ hederaAccountId: s.hederaAccountId, status: s.status, hasEncryptionKey: (s as { hasEncryptionKey?: boolean }).hasEncryptionKey ?? false, hasBackup: (s as { hasBackup?: boolean }).hasBackup ?? false }))
      .catch(() => { /* non-critical */ });
  }, []);

  // Debounced username availability check (300ms) using project debounce utility
  const debouncedCheckUsername = useMemo(
    () =>
      debounce((trimmed: string) => {
        api
          .checkUsername(trimmed)
          .then((res) => setUsernameAvailable(res.available))
          .catch(() => setUsernameAvailable(null))
          .finally(() => setIsCheckingUsername(false));
      }, 300),
    [],
  );

  const handleUsernameChange = useCallback(
    (value: string) => {
      setUsername(value);
      setUsernameAvailable(null);

      const trimmed = value.trim();
      if (!trimmed || !/^[a-zA-Z0-9_]{3,30}$/.test(trimmed)) {
        setIsCheckingUsername(false);
        debouncedCheckUsername.cancel();
        return;
      }

      setIsCheckingUsername(true);
      debouncedCheckUsername.fn(trimmed);
    },
    [debouncedCheckUsername],
  );

  const [showPinSetup, setShowPinSetup] = useState(false);
  const [pendingPrivateKey, setPendingPrivateKey] = useState<string | null>(
    null,
  );
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);

  const handleEnsureEncryptionKey = useCallback(async () => {
    setIsEnsuringKey(true);
    try {
      const result = await api.ensureEncryptionKey();
      if (result.encryptionPrivateKey) {
        const { storePrivateKey } = await import("@/lib/crypto-utils");
        storePrivateKey(
          result.encryptionPrivateKey,
          user?.hederaAccountId ?? undefined,
        );
        // Show PIN setup to create a backup for new devices
        if (result.generated) {
          setPendingPrivateKey(result.encryptionPrivateKey);
          setShowPinSetup(true);
        }
      }
      setWalletStatus((prev) =>
        prev ? { ...prev, hasEncryptionKey: true, hasBackup: false } : prev,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to generate encryption key",
      );
    } finally {
      setIsEnsuringKey(false);
    }
  }, [user?.hederaAccountId]);

  const handlePinSet = useCallback(
    async (pin: string) => {
      if (!pendingPrivateKey || !user?.hederaAccountId) return;
      setPinLoading(true);
      setPinError(null);
      try {
        const { wrapPrivateKeyWithPin } = await import("@/lib/crypto-utils");
        const encrypted = await wrapPrivateKeyWithPin(
          pendingPrivateKey,
          pin,
          user.hederaAccountId,
        );
        await api.storeKeyBackup(encrypted);
        setShowPinSetup(false);
        setPendingPrivateKey(null);
        setWalletStatus((prev) => prev ? { ...prev, hasBackup: true } : prev);
      } catch (err) {
        setPinError(
          err instanceof Error ? err.message : "Failed to save PIN backup",
        );
      } finally {
        setPinLoading(false);
      }
    },
    [pendingPrivateKey, user?.hederaAccountId],
  );

  const handleSave = useCallback(async () => {
    if (!displayName.trim()) {
      setError("Display name is required");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const updated = await api.updateProfile({
        displayName: displayName.trim(),
        bio: bio.trim() || undefined,
        username: username.trim() || undefined,
      });

      // Update local auth state with the form values
      if (user && updated) {
        setUser({
          ...user,
          displayName: displayName.trim(),
          username: username.trim() || user.username,
        });
      }

      setSuccessMessage("Profile updated successfully");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update profile";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  }, [displayName, bio, avatarUrl, username, user, setUser]);

  const handleCopyAccountId = useCallback(async () => {
    if (!user?.hederaAccountId) return;

    try {
      await navigator.clipboard.writeText(user.hederaAccountId);
      setCopied(true);
      const cleanup = createTimeout(() => setCopied(false), 2000);
      return cleanup;
    } catch {
      // Clipboard API may not be available in all contexts
      setError("Failed to copy to clipboard");
    }
  }, [user?.hederaAccountId]);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">
          Please log in to access settings.
        </p>
      </div>
    );
  }

  const kycLevel = user.kycLevel || "none";
  const kycStatusConfig: Record<string, { cls: string; label: string }> = {
    // Mirsad KYC levels
    basic: { cls: "bg-[rgba(0,186,124,0.1)] text-[#00ba7c]", label: "Basic" },
    enhanced: {
      cls: "bg-[rgba(0,186,124,0.1)] text-[#00ba7c]",
      label: "Enhanced",
    },
    institutional: {
      cls: "bg-[rgba(0,186,124,0.1)] text-[#00ba7c]",
      label: "Institutional",
    },
    // Status strings from older API
    approved: {
      cls: "bg-[rgba(0,186,124,0.1)] text-[#00ba7c]",
      label: "Approved",
    },
    pending: { cls: "bg-primary/12 text-primary", label: "Pending" },
    pending_review: {
      cls: "bg-primary/12 text-primary",
      label: "Pending Review",
    },
    submitted: { cls: "bg-primary/12 text-primary", label: "Submitted" },
    rejected: {
      cls: "bg-[rgba(224,36,94,0.1)] text-[#e0245e]",
      label: "Rejected",
    },
    none: {
      cls: "bg-white/[0.06] text-muted-foreground",
      label: "Not Started",
    },
  };
  const kycConfig = kycStatusConfig[kycLevel] ?? kycStatusConfig["none"];

  return (
    <>
      {showPinSetup && (
        <PinModal
          mode="set"
          onSubmit={handlePinSet}
          onCancel={() => {
            setShowPinSetup(false);
            setPendingPrivateKey(null);
          }}
          error={pinError}
          isLoading={pinLoading}
        />
      )}
      <div className="flex min-h-full">
        {/* ── Left nav (200px) — active item has lemon right border ── */}
        <nav
          aria-label="Settings navigation"
          className="hidden md:flex flex-col w-[200px] flex-shrink-0 border-r border-border py-4 px-3 gap-0.5"
        >
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-3 mb-2">
            Settings
          </p>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveSection(s.id)}
              className={cn(
                "relative flex items-center h-[36px] px-3 rounded-[8px] text-[14px] font-semibold transition-colors text-left",
                activeSection === s.id
                  ? "text-foreground bg-white/[0.04]"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]",
                s.id === "danger" && "text-[#e0245e] hover:text-[#e0245e]",
              )}
            >
              {/* Lemon right border on active */}
              {activeSection === s.id && s.id !== "danger" && (
                <span className="absolute right-0 top-1 bottom-1 w-[3px] rounded-l-full bg-primary" />
              )}
              {activeSection === s.id && s.id === "danger" && (
                <span className="absolute right-0 top-1 bottom-1 w-[3px] rounded-l-full bg-[#e0245e]" />
              )}
              {s.label}
            </button>
          ))}
        </nav>

        {/* ── Main content ── */}
        <div className="flex-1 min-w-0 border-r border-border">
          {/* Mobile section selector */}
          <div className="md:hidden flex gap-2 overflow-x-auto px-4 py-3 border-b border-border">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSection(s.id)}
                className={cn(
                  "flex-shrink-0 h-[32px] px-[12px] rounded-full text-[12px] font-semibold border transition-all",
                  activeSection === s.id
                    ? "bg-white/10 border-white/15 text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-white/[0.06]",
                  s.id === "danger" && "text-[#e0245e]",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Global messages */}
          {(error || successMessage) && (
            <div className="px-[18px] pt-4">
              {error && (
                <div className="flex items-center justify-between border border-[rgba(224,36,94,0.3)] bg-[rgba(224,36,94,0.08)] text-[#e0245e] px-4 py-2.5 rounded-full text-[13px] mb-3">
                  <span>{error}</span>
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    aria-label="Dismiss error"
                    className="ml-2"
                  >
                    <RiCloseLine size={14} />
                  </button>
                </div>
              )}
              {successMessage && (
                <div className="flex items-center justify-between border border-[rgba(0,186,124,0.2)] bg-[rgba(0,186,124,0.08)] text-[#00ba7c] px-4 py-2.5 rounded-full text-[13px] mb-3">
                  <span>{successMessage}</span>
                  <button
                    type="button"
                    onClick={() => setSuccessMessage(null)}
                    aria-label="Dismiss"
                    className="ml-2"
                  >
                    <RiCloseLine size={14} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Profile section ── */}
          {activeSection === "profile" && (
            <div>
              <div className="px-[18px] py-[14px] border-b border-border">
                <h2 className="text-[17px] font-extrabold text-foreground">
                  Profile
                </h2>
                <p className="text-[13px] text-muted-foreground mt-0.5">
                  Update your public profile information
                </p>
              </div>

              <div className="divide-y divide-border">
                {/* Avatar row */}
                <div className="px-[18px] py-[16px] flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[14px] font-semibold text-foreground">
                      Avatar
                    </p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      Image URL for your profile picture
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Avatar size="sm">
                      <AvatarImage src={avatarUrl || undefined} />
                      <AvatarFallback>
                        {(displayName || "U")[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <Input
                      type="url"
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://…"
                      className="rounded-full w-[200px]"
                    />
                  </div>
                </div>

                {/* Display name row */}
                <div className="px-[18px] py-[16px] flex items-center justify-between gap-4">
                  <div>
                    <label
                      htmlFor="display-name"
                      className="text-[14px] font-semibold text-foreground"
                    >
                      Display Name
                    </label>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      Your public name
                    </p>
                  </div>
                  <Input
                    id="display-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your display name"
                    className="rounded-full w-[220px] flex-shrink-0"
                  />
                </div>

                {/* Username row */}
                <div className="px-[18px] py-[16px] flex items-center justify-between gap-4">
                  <div>
                    <label
                      htmlFor="username"
                      className="text-[14px] font-semibold text-foreground"
                    >
                      Username
                    </label>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      Your unique @handle (3–30 chars, letters/numbers/underscores)
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-muted-foreground select-none">
                        @
                      </span>
                      <Input
                        id="username"
                        type="text"
                        value={username}
                        onChange={(e) => handleUsernameChange(e.target.value)}
                        placeholder="yourhandle"
                        className="rounded-full w-[200px] pl-7"
                        maxLength={30}
                      />
                    </div>
                    {username.trim() && (
                      <p
                        className={cn(
                          "text-[11px] font-semibold",
                          isCheckingUsername
                            ? "text-muted-foreground"
                            : usernameAvailable === true
                              ? "text-[#00ba7c]"
                              : usernameAvailable === false
                                ? "text-[#e0245e]"
                                : "text-muted-foreground",
                        )}
                      >
                        {isCheckingUsername
                          ? "Checking…"
                          : usernameAvailable === true
                            ? "Available"
                            : usernameAvailable === false
                              ? "Taken or invalid"
                              : ""}
                      </p>
                    )}
                  </div>
                </div>

                {/* Bio row */}
                <div className="px-[18px] py-[16px]">
                  <div className="mb-2">
                    <label
                      htmlFor="bio"
                      className="text-[14px] font-semibold text-foreground"
                    >
                      Bio
                    </label>
                    <p className="text-[12px] text-muted-foreground">
                      Tell the community about yourself
                    </p>
                  </div>
                  <textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={3}
                    maxLength={500}
                    className="w-full rounded-[14px] border border-border bg-white/[0.04] px-4 py-3 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 resize-none transition-colors"
                    placeholder="Tell us about yourself"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {bio.length} / 500 characters
                  </p>
                </div>

                {/* Save */}
                <div className="px-[18px] py-[16px]">
                  <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="rounded-full h-[40px] px-[24px]"
                  >
                    {isSaving ? "Saving…" : "Save Changes"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ── Account section ── */}
          {activeSection === "account" && (
            <div>
              <div className="px-[18px] py-[14px] border-b border-border">
                <h2 className="text-[17px] font-extrabold text-foreground">
                  Account
                </h2>
                <p className="text-[13px] text-muted-foreground mt-0.5">
                  Your account details and blockchain identity
                </p>
              </div>

              <div className="divide-y divide-border">
                {/* Hedera Account ID */}
                {user.hederaAccountId && (
                  <div className="px-[18px] py-[16px] flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-foreground">
                        Hedera Account ID
                      </p>
                      <p className="text-[12px] font-mono text-muted-foreground mt-0.5 truncate">
                        {user.hederaAccountId}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={handleCopyAccountId}
                        className={cn(
                          "flex items-center gap-1.5 h-[34px] px-[14px] rounded-full border text-[12px] font-semibold transition-colors",
                          copied
                            ? "border-[rgba(0,186,124,0.3)] text-[#00ba7c]"
                            : "border-border text-muted-foreground hover:text-foreground hover:bg-white/[0.06]",
                        )}
                      >
                        {copied ? (
                          <RiCheckLine size={13} />
                        ) : (
                          <RiFileCopyLine size={13} />
                        )}
                        {copied ? "Copied" : "Copy"}
                      </button>
                      <a
                        href={`${HASHSCAN_BASE_URL}/account/${user.hederaAccountId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 h-[34px] px-[14px] rounded-full border border-border text-[12px] font-semibold text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                        aria-label="View on HashScan"
                      >
                        <RiExternalLinkLine size={13} />
                        HashScan
                      </a>
                    </div>
                  </div>
                )}

                {/* KYC Status */}
                <div className="px-[18px] py-[16px] flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[14px] font-semibold text-foreground">
                      KYC Status
                    </p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      Identity verification level
                    </p>
                  </div>
                  <span
                    className={cn(
                      "px-[10px] py-[4px] rounded-full text-[12px] font-semibold",
                      kycConfig.cls,
                    )}
                  >
                    {kycConfig.label}
                  </span>
                </div>

                {/* Account type */}
                {user.accountType && (
                  <div className="px-[18px] py-[16px] flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[14px] font-semibold text-foreground">
                        Account Type
                      </p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        Individual or Business
                      </p>
                    </div>
                    <span className="text-[13px] text-foreground capitalize">
                      {user.accountType}
                    </span>
                  </div>
                )}

                {/* Account status */}
                <div className="px-[18px] py-[16px] flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[14px] font-semibold text-foreground">
                      Status
                    </p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      Current account state
                    </p>
                  </div>
                  <span className="text-[13px] text-foreground capitalize">
                    {user.status}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── Wallet & Encryption section ── */}
          {activeSection === "wallet" && (
            <div>
              <div className="px-[18px] py-[14px] border-b border-border">
                <h2 className="text-[17px] font-extrabold text-foreground">
                  Wallet & Encryption
                </h2>
                <p className="text-[13px] text-muted-foreground mt-0.5">
                  Manage your Hedera wallet and X25519 encryption key
                </p>
              </div>

              {walletStatus ? (
                <div className="divide-y divide-border">
                  <div className="px-[18px] py-[16px] flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[14px] font-semibold text-foreground">
                        Wallet Status
                      </p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        Tamam MPC custody status
                      </p>
                    </div>
                    <span className="text-[13px] text-foreground capitalize">
                      {walletStatus.status}
                    </span>
                  </div>

                  <div className="px-[18px] py-[16px] flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[14px] font-semibold text-foreground">
                        Encryption Key (X25519)
                      </p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        Required for end-to-end encrypted messages
                      </p>
                    </div>
                    {walletStatus.hasEncryptionKey ? (
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1.5 px-[10px] py-[4px] rounded-full text-[12px] font-semibold bg-[rgba(0,186,124,0.1)] text-[#00ba7c]">
                          <span className="w-[6px] h-[6px] rounded-full bg-[#00ba7c]" />
                          Configured
                        </span>
                        {!walletStatus.hasBackup && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full h-[32px] px-3 text-[12px] border-primary/30 text-primary hover:bg-primary/10"
                            onClick={() => {
                              const pk = getStoredPrivateKey(user.hederaAccountId ?? undefined);
                              if (pk) {
                                setPendingPrivateKey(Buffer.from(pk).toString('base64'));
                                setShowPinSetup(true);
                              }
                            }}
                          >
                            Set Backup PIN
                          </Button>
                        )}
                        {walletStatus.hasBackup && (
                          <span className="text-[11px] text-muted-foreground">PIN backup ✓</span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1.5 px-[10px] py-[4px] rounded-full text-[12px] font-semibold bg-primary/12 text-primary">
                          <span className="w-[6px] h-[6px] rounded-full bg-primary" />
                          Not configured
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full h-[32px] px-3 text-[12px]"
                          onClick={() => {
                            void handleEnsureEncryptionKey();
                          }}
                          disabled={isEnsuringKey}
                        >
                          {isEnsuringKey ? "Generating…" : "Generate Key"}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="px-[18px] py-12 text-center">
                  <p className="text-[14px] text-muted-foreground">
                    Loading wallet status…
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Appearance section ── */}
          {activeSection === "appearance" && (
            <div>
              <div className="px-[18px] py-[14px] border-b border-border">
                <h2 className="text-[17px] font-extrabold text-foreground">
                  Appearance
                </h2>
                <p className="text-[13px] text-muted-foreground mt-0.5">
                  Customize how the app looks
                </p>
              </div>

              <div className="divide-y divide-border">
                <div className="px-[18px] py-[16px] flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[14px] font-semibold text-foreground">
                      Theme
                    </p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      Choose your preferred color scheme
                    </p>
                  </div>
                  {/* Pill theme selector per spec */}
                  <div className="flex gap-1.5">
                    {(["dark", "light", "system"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTheme(t)}
                        className={cn(
                          "h-[34px] px-[14px] rounded-full text-[13px] font-semibold border capitalize transition-all",
                          theme === t
                            ? "bg-white/10 border-white/15 text-foreground"
                            : "border-transparent text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
                        )}
                      >
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Danger Zone section ── */}
          {activeSection === "danger" && (
            <div>
              <div className="px-[18px] py-[14px] border-b border-[rgba(224,36,94,0.2)]">
                <h2 className="text-[17px] font-extrabold text-[#e0245e]">
                  Danger Zone
                </h2>
                <p className="text-[13px] text-muted-foreground mt-0.5">
                  Irreversible and destructive actions
                </p>
              </div>

              <div className="divide-y divide-border">
                <div className="px-[18px] py-[16px] flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[14px] font-semibold text-foreground">
                      Deactivate Account
                    </p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      Temporarily disable your account
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled
                    className="h-[34px] px-[16px] rounded-full border border-[rgba(224,36,94,0.3)] text-[#e0245e] text-[13px] font-semibold opacity-50 cursor-not-allowed whitespace-nowrap"
                    title="Account deactivation is not yet available"
                  >
                    Deactivate
                  </button>
                </div>

                <div className="px-[18px] py-[16px] flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[14px] font-semibold text-foreground">
                      Delete Account
                    </p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      Permanently delete all your data. This cannot be undone.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled
                    className="h-[34px] px-[16px] rounded-full border border-[rgba(224,36,94,0.3)] text-[#e0245e] text-[13px] font-semibold opacity-50 cursor-not-allowed whitespace-nowrap"
                    title="Account deletion is not yet available"
                  >
                    Delete Account
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right panel ── */}
        <aside className="hidden lg:flex flex-col w-[280px] flex-shrink-0 p-4 gap-4 sticky top-0 h-screen overflow-y-auto">
          {/* Account status card */}
          <div className="border border-border rounded-[14px] p-4 space-y-3">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Account Status
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-muted-foreground">
                  Status
                </span>
                <span className="text-[13px] text-foreground capitalize">
                  {user.status}
                </span>
              </div>
              {user.kycLevel && (
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-muted-foreground">KYC</span>
                  <span
                    className={cn(
                      "text-[11px] px-[8px] py-[2px] rounded-full font-semibold",
                      kycConfig.cls,
                    )}
                  >
                    {kycConfig.label}
                  </span>
                </div>
              )}
              {user.accountType && (
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-muted-foreground">
                    Type
                  </span>
                  <span className="text-[13px] text-foreground capitalize">
                    {user.accountType}
                  </span>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
