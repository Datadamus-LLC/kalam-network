# Organization Pages Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Revamp the organization pages for proper UX (rich Overview tab, better Create form, inline broadcasts preview, org badge across platform) and add a small org badge next to business account names in posts, messages, search, and profiles.

**Architecture:** Add `OrgBadge` component applied platform-wide wherever account names appear. Enrich the post author response with `accountType` so the frontend can distinguish org accounts. Overhaul the org Overview tab with inline broadcasts, profile info, and remove the duplicate Settings button. Improve the Create Org form with optional Category/Bio/Website fields.

**Tech Stack:** Next.js 14 App Router, React 18, Tailwind CSS, NestJS, TypeORM, `@remixicon/react`

---

## Files Changed

| File | Change |
|------|--------|
| `apps/web/src/components/ui/OrgBadge.tsx` | **NEW** — small building icon badge for org accounts |
| `packages/shared/src/types/social.types.ts` | Add `accountType` to `Post.author` |
| `packages/api/src/modules/social/dto/post-response.dto.ts` | Add `accountType` to `PostAuthorResponse` |
| `packages/api/src/modules/social/services/posts.service.ts` | Include `accountType` when mapping post authors |
| `apps/web/src/components/feed/PostCard.tsx` | Add `accountType` to `PostAuthor`, render `OrgBadge` |
| `apps/web/src/app/(app)/discover/page.tsx` | Render `OrgBadge` for business accounts in search results |
| `apps/web/src/components/chat/ConversationHeader.tsx` | Render `OrgBadge` next to conversation name for org chats |
| `apps/web/src/app/(app)/organization/page.tsx` | Rich Overview tab, inline broadcasts, remove duplicate Settings button, richer Create form |

---

## Task 1 — OrgBadge Component

**Files:**
- Create: `apps/web/src/components/ui/OrgBadge.tsx`

A small pill with a building icon to visually distinguish org accounts from individuals. Consistent with the existing `VerifiedBadge` component style.

- [ ] Create `apps/web/src/components/ui/OrgBadge.tsx`:

```tsx
'use client';

import { RiBuildingLine } from '@remixicon/react';
import { cn } from '@/lib/utils';

interface OrgBadgeProps {
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * OrgBadge — small building icon shown next to business account names.
 * Distinguishes organizations from individual users across the platform.
 */
export function OrgBadge({ size = 'sm', className }: OrgBadgeProps) {
  const iconSize = size === 'sm' ? 11 : 14;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full font-semibold leading-none select-none',
        size === 'sm'
          ? 'px-[5px] py-[2px] text-[9px]'
          : 'px-[7px] py-[3px] text-[10px]',
        'bg-primary/15 text-primary border border-primary/25',
        className,
      )}
      title="Organization account"
      aria-label="Organization"
    >
      <RiBuildingLine size={iconSize} />
      <span>ORG</span>
    </span>
  );
}
```

- [ ] Commit: `git add apps/web/src/components/ui/OrgBadge.tsx && git commit -m "feat(ui): add OrgBadge component for business account distinction"`

---

## Task 2 — Add accountType to Post Author Response (Backend)

**Files:**
- Modify: `packages/api/src/modules/social/dto/post-response.dto.ts`
- Modify: `packages/api/src/modules/social/services/posts.service.ts`

The post author response currently lacks `accountType`. Add it so the frontend can render the org badge.

- [ ] In `packages/api/src/modules/social/dto/post-response.dto.ts`, update `PostAuthorResponse`:

```typescript
export interface PostAuthorResponse {
  accountId: string;
  displayName: string | null;
  avatarUrl: string | null;
  accountType: 'individual' | 'business';  // ADD THIS
}
```

- [ ] In `packages/api/src/modules/social/services/posts.service.ts`, find where `PostAuthorResponse` is built (search for `accountId: author.hederaAccountId` or similar mapping) and add `accountType: author.accountType ?? 'individual'`.

- [ ] Run: `cd packages/api && npx tsc --noEmit 2>&1 | grep error | head -10`
  Expected: no new errors

- [ ] Commit: `git add packages/api/src/modules/social/ && git commit -m "feat(api): include accountType in post author response"`

---

## Task 3 — Add accountType to Shared Post Type (Frontend)

**Files:**
- Modify: `packages/shared/src/types/social.types.ts`

- [ ] In `packages/shared/src/types/social.types.ts`, update the `Post` interface's author field:

```typescript
export interface Post {
  id: string;
  author: {
    accountId: string;
    displayName: string | null;
    avatarUrl: string | null;
    kycVerified: boolean;
    badgeTier: BadgeTier | null;
    accountType: 'individual' | 'business';  // ADD THIS
  };
  // ... rest unchanged
}
```

- [ ] Commit: `git add packages/shared/src/types/social.types.ts && git commit -m "feat(shared): add accountType to Post author type"`

---

## Task 4 — OrgBadge in PostCard

**Files:**
- Modify: `apps/web/src/components/feed/PostCard.tsx`

- [ ] In `PostCard.tsx`, add `accountType` to the `PostAuthor` interface:

```typescript
interface PostAuthor {
  accountId: string;
  displayName: string | null;
  avatarUrl: string | null;
  badgeTier: BadgeTier | null;
  username?: string | null;
  accountType?: 'individual' | 'business';  // ADD THIS
}
```

- [ ] Add the import at the top of the file:
```typescript
import { OrgBadge } from '@/components/ui/OrgBadge';
```

- [ ] In the author name section (find where `author.displayName` or `authorName` is rendered), add the badge inline after the name. Find this section in the JSX and add right after the author name span:

```tsx
{/* After the author display name */}
{author.accountType === 'business' && (
  <OrgBadge size="sm" className="ml-1 flex-shrink-0" />
)}
```

The exact location: look for where `authorName` is rendered in a `<span>` or `<p>` inside a `<Link>` — add the OrgBadge immediately after that span, inside the same flex container.

- [ ] Run: `pnpm --filter web build 2>&1 | grep -E "✓ Compiled|error" | head -5`
  Expected: `✓ Compiled successfully`

- [ ] Commit: `git add apps/web/src/components/feed/PostCard.tsx && git commit -m "feat(feed): show OrgBadge on business account posts"`

---

## Task 5 — OrgBadge in Discover Search Results

**Files:**
- Modify: `apps/web/src/app/(app)/discover/page.tsx`

The discover search results already include `accountType` in the API response (from `UserListItem`). Just render the badge.

- [ ] Add import at top of `discover/page.tsx`:
```typescript
import { OrgBadge } from '@/components/ui/OrgBadge';
```

- [ ] In the search result item JSX (around lines 115-145), find where the user's `displayName` is rendered in a `<p>` tag and add `OrgBadge` after it:

```tsx
<p className="text-[14px] font-semibold text-foreground truncate flex items-center gap-1.5">
  {user.displayName || 'Anonymous'}
  {(user as { accountType?: string }).accountType === 'business' && (
    <OrgBadge size="sm" />
  )}
</p>
```

- [ ] Commit: `git add apps/web/src/app/(app)/discover/page.tsx && git commit -m "feat(discover): show OrgBadge for business accounts in search"`

---

## Task 6 — OrgBadge in ConversationHeader

**Files:**
- Modify: `apps/web/src/components/chat/ConversationHeader.tsx`

The conversation participants likely include `accountType` (check `Conversation` type). If not, check if the other participant is a business from the displayName or a `type` field.

- [ ] Read `apps/web/src/stores/chat.store.ts` to understand the `Conversation` type and whether participants have `accountType`.

- [ ] If participants have `accountType`:
  - Add import: `import { OrgBadge } from '@/components/ui/OrgBadge';`
  - In the header title section, after `<h2>{title}</h2>`, add:
  ```tsx
  {conversation.type !== 'group' && (() => {
    const other = conversation.participants.find(p => p.accountId !== currentAccountId);
    return other?.accountType === 'business' ? <OrgBadge size="sm" className="mt-0.5" /> : null;
  })()}
  ```

- [ ] If participants don't have `accountType`, add it to the participant type and ensure the API populates it. Check `packages/api/src/modules/messaging/conversations.service.ts` for where participants are mapped.

- [ ] Commit: `git add apps/web/src/components/chat/ && git commit -m "feat(messaging): show OrgBadge in conversation header for org chats"`

---

## Task 7 — Revamp Organization Overview Tab

**Files:**
- Modify: `apps/web/src/app/(app)/organization/page.tsx`

This is the biggest task. The Overview tab needs:
1. **Remove duplicate Settings button** from the org header (there's already a Settings tab)
2. **Rich org profile section** — avatar (initials), category, bio, website link
3. **Recent broadcasts preview** — show last 3 broadcasts from `api.getBroadcastFeed` filtered by the org's `broadcastTopicId`
4. **Better member preview** — keep but improve styling

- [ ] Read the full `apps/web/src/app/(app)/organization/page.tsx` to understand current structure

- [ ] **Remove the duplicate Settings button**: Find the `<link href="/organization/settings">Settings</link>` in the org header area (outside the tabs) and remove it. The Settings tab in the tab bar is sufficient.

- [ ] **Add broadcasts state**: At the top of the component (after existing state), add:

```tsx
const [recentBroadcasts, setRecentBroadcasts] = useState<Array<{
  id: string;
  content: string;
  createdAt: string;
  sequenceNumber: number | null;
}>>([]);
const [broadcastsLoading, setBroadcastsLoading] = useState(false);
```

- [ ] **Fetch recent broadcasts** in the useEffect that loads the org (after `setOrg(data)`):

```tsx
// Fetch last 3 broadcasts for this org
setBroadcastsLoading(true);
api.getBroadcastFeed(3)
  .then((result) => {
    // Filter to this org's broadcasts if possible, otherwise show all subscribed
    setRecentBroadcasts(result.messages.slice(0, 3).map(m => ({
      id: m.id,
      content: m.content,
      createdAt: m.createdAt,
      sequenceNumber: m.sequenceNumber,
    })));
  })
  .catch(() => { /* non-critical */ })
  .finally(() => setBroadcastsLoading(false));
```

- [ ] **Replace the Overview tab content** with a richer layout. The current overview shows a sparse member preview. Replace with:

```tsx
{/* Overview tab content */}
<div className="space-y-5 p-5">

  {/* Org Profile Card */}
  <div className="rounded-[14px] border border-border bg-white/[0.02] p-4 space-y-3">
    {org.bio && (
      <p className="text-[14px] text-muted-foreground leading-relaxed">{org.bio}</p>
    )}
    <div className="flex flex-wrap gap-4 text-[13px]">
      {org.category && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <RiPriceTag3Line size={14} />
          <span>{org.category}</span>
        </div>
      )}
      {org.website && (
        <a href={org.website} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-primary hover:underline">
          <RiGlobalLine size={14} />
          <span className="truncate max-w-[200px]">{org.website.replace(/^https?:\/\//, '')}</span>
        </a>
      )}
    </div>
    {/* HCS attestation */}
    {org.hcsTopicId && (
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
        <RiVerifiedBadgeLine size={12} />
        <span className="font-mono">HCS: {org.hcsTopicId}</span>
      </div>
    )}
  </div>

  {/* Recent Broadcasts */}
  <div>
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-[.05em]">
        Recent Broadcasts
      </h3>
      <Link href={`/broadcasts?orgId=${org.id}`}
        className="text-[12px] text-primary hover:opacity-80 transition-opacity">
        See all →
      </Link>
    </div>
    {broadcastsLoading ? (
      <div className="text-[13px] text-muted-foreground">Loading…</div>
    ) : recentBroadcasts.length === 0 ? (
      <div className="rounded-[12px] border border-dashed border-border p-4 text-center">
        <p className="text-[13px] text-muted-foreground">No broadcasts yet</p>
        {isMember && (
          <Link href={`/broadcasts?orgId=${org.id}`}
            className="text-[12px] text-primary mt-1 block hover:opacity-80">
            Publish your first broadcast →
          </Link>
        )}
      </div>
    ) : (
      <div className="space-y-2">
        {recentBroadcasts.map((b) => (
          <div key={b.id} className="rounded-[10px] border border-border p-3 bg-white/[0.02]">
            <p className="text-[13px] text-foreground line-clamp-2">{b.content}</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {new Date(b.createdAt).toLocaleDateString()} · Seq #{b.sequenceNumber ?? '—'}
            </p>
          </div>
        ))}
      </div>
    )}
  </div>

  {/* Members preview */}
  <div>
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-[.05em]">
        Members ({org.memberCount ?? members.length})
      </h3>
      <Link href="/organization/members"
        className="text-[12px] text-primary hover:opacity-80 transition-opacity">
        Manage →
      </Link>
    </div>
    <div className="space-y-2">
      {members.slice(0, 4).map((m) => (
        <div key={m.userId} className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-white/[0.08] flex items-center justify-center text-[12px] font-bold text-foreground">
              {(m.displayName || m.hederaAccountId)[0]?.toUpperCase()}
            </div>
            <div>
              <p className="text-[13px] font-medium text-foreground leading-tight">
                {m.username ? `@${m.username}` : (m.displayName || 'Member')}
              </p>
            </div>
          </div>
          <RoleBadge role={m.role} />
        </div>
      ))}
    </div>
  </div>
</div>
```

Add imports at top of file:
```tsx
import { RiPriceTag3Line, RiGlobalLine, RiVerifiedBadgeLine } from '@remixicon/react';
```

- [ ] Run: `pnpm --filter web build 2>&1 | grep -E "✓ Compiled|error" | head -5`

- [ ] Commit: `git add apps/web/src/app/(app)/organization/page.tsx && git commit -m "feat(org): revamp Overview tab with profile, broadcasts preview, remove duplicate Settings"`

---

## Task 8 — Improve Create Organization Form

**Files:**
- Modify: `apps/web/src/app/(app)/organization/page.tsx` (the "no org" create form section)

Currently the create form only has a Name field. Add optional Category, Bio, and Website fields. On submit: create the org with the name, then immediately update with the extra fields if provided.

- [ ] Add state for the extra fields near the existing `newOrgName` state:

```tsx
const [newOrgCategory, setNewOrgCategory] = useState('');
const [newOrgBio, setNewOrgBio] = useState('');
const [newOrgWebsite, setNewOrgWebsite] = useState('');
```

- [ ] Update the create handler to call `updateOrganization` after creation if extra fields are provided:

```tsx
const handleCreate = async () => {
  if (!newOrgName.trim()) return;
  setIsCreating(true);
  setCreateError(null);
  try {
    const created = await api.createOrganization(newOrgName.trim());
    // Update with optional extra fields if provided
    const hasExtras = newOrgCategory.trim() || newOrgBio.trim() || newOrgWebsite.trim();
    if (hasExtras) {
      await api.updateOrganization({
        ...(newOrgCategory.trim() && { category: newOrgCategory.trim() }),
        ...(newOrgBio.trim() && { bio: newOrgBio.trim() }),
        ...(newOrgWebsite.trim() && { website: newOrgWebsite.trim() }),
      });
    }
    setOrg(created); // or reload
  } catch (err) {
    setCreateError(err instanceof Error ? err.message : 'Failed to create organization');
  } finally {
    setIsCreating(false);
  }
};
```

- [ ] Replace the create form JSX with the enriched version:

```tsx
<div className="max-w-[480px] mx-auto text-center">
  <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto mb-4">
    <RiBuildingLine size={32} className="text-primary" />
  </div>
  <h1 className="text-[22px] font-extrabold text-foreground mb-2">Create Your Organization</h1>
  <p className="text-[14px] text-muted-foreground mb-6">
    Set up your business presence on Kalam — broadcast to followers, manage your team, and build your Hedera identity.
  </p>

  <div className="space-y-3 text-left">
    {/* Name — required */}
    <div>
      <label className="text-[12px] font-semibold text-muted-foreground uppercase tracking-[.05em] mb-1.5 block">
        Organization Name <span className="text-[#e0245e]">*</span>
      </label>
      <input
        type="text"
        value={newOrgName}
        onChange={(e) => setNewOrgName(e.target.value)}
        placeholder="Acme Corp."
        className="w-full h-[44px] rounded-[10px] border border-border bg-white/[0.04] px-4 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 transition-colors"
      />
    </div>

    {/* Category — optional */}
    <div>
      <label className="text-[12px] font-semibold text-muted-foreground uppercase tracking-[.05em] mb-1.5 block">
        Category <span className="text-muted-foreground/50 font-normal">(optional)</span>
      </label>
      <input
        type="text"
        value={newOrgCategory}
        onChange={(e) => setNewOrgCategory(e.target.value)}
        placeholder="e.g. Finance, Technology, Healthcare"
        className="w-full h-[44px] rounded-[10px] border border-border bg-white/[0.04] px-4 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 transition-colors"
      />
    </div>

    {/* Website — optional */}
    <div>
      <label className="text-[12px] font-semibold text-muted-foreground uppercase tracking-[.05em] mb-1.5 block">
        Website <span className="text-muted-foreground/50 font-normal">(optional)</span>
      </label>
      <input
        type="url"
        value={newOrgWebsite}
        onChange={(e) => setNewOrgWebsite(e.target.value)}
        placeholder="https://yourorg.com"
        className="w-full h-[44px] rounded-[10px] border border-border bg-white/[0.04] px-4 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 transition-colors"
      />
    </div>

    {/* Bio — optional */}
    <div>
      <label className="text-[12px] font-semibold text-muted-foreground uppercase tracking-[.05em] mb-1.5 block">
        Description <span className="text-muted-foreground/50 font-normal">(optional)</span>
      </label>
      <textarea
        value={newOrgBio}
        onChange={(e) => setNewOrgBio(e.target.value)}
        placeholder="What does your organization do?"
        rows={2}
        className="w-full rounded-[10px] border border-border bg-white/[0.04] px-4 py-3 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 transition-colors resize-none"
      />
    </div>
  </div>

  {createError && (
    <p className="text-[13px] text-[#e0245e] mt-3">{createError}</p>
  )}

  <button
    type="button"
    onClick={() => void handleCreate()}
    disabled={!newOrgName.trim() || isCreating}
    className="w-full h-[48px] rounded-full bg-primary text-primary-foreground font-bold text-[15px] mt-5 disabled:opacity-40 transition-opacity hover:opacity-90"
  >
    {isCreating ? 'Creating…' : 'Create Organization'}
  </button>
</div>
```

- [ ] Run: `pnpm --filter web build 2>&1 | grep -E "✓ Compiled|error" | head -5`

- [ ] Commit: `git add apps/web/src/app/(app)/organization/page.tsx && git commit -m "feat(org): enrich Create Organization form with category, bio, website fields"`

---

## Verification Checklist

After all tasks complete:

- [ ] OrgBadge shows on posts by business accounts in feed
- [ ] OrgBadge shows in Discover search results for business accounts
- [ ] OrgBadge shows in ConversationHeader for org conversations
- [ ] Organization Overview tab shows: org bio/category/website, recent broadcasts (up to 3), member preview
- [ ] Duplicate "Settings" button removed from org header
- [ ] Create Org form has Name + Category + Bio + Website fields
- [ ] `pnpm --filter web build` passes clean
- [ ] `cd packages/api && npx tsc --noEmit` passes clean
