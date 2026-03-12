# P1-T30: Verified Business Badges

| Field | Value |
|-------|-------|
| Task ID | P1-T30 |
| Phase | Phase 7: Business Features |
| Priority | P1 |
| Estimated Time | 4 hours |
| Depends On | P1-T29 (Org Tenancy), P0-T11 (KYC/KYB), P0-T07 (Next.js Setup) |
| Spec References | docs/SPECIFICATION.md: FR-BIZ-001, US-019 |
| PRD Reference | docs/PRD-BUSINESS-FEATURES.md: Feature 3 (Verified Business Badges) |

---

## Objective

Display trust badges on business profiles based on KYB verification status. Three tiers: Basic (gray), Verified (blue), Certified (gold — future). Badge is non-fakeable — derived from server-side KYB status only. Visible on profiles, chat headers, search results, and broadcast listings.

---

## Background

Verified badges give customers confidence that they're interacting with a legitimate business. The badge is always derived from the server's `organizations.kyb_status` column — never from a client-set value. The badge links to the on-chain KYB attestation on HCS for transparency.

---

## Prerequisites

- [ ] Organization model functional (P1-T29)
- [ ] KYB approval writes attestation to HCS (P0-T11)
- [ ] Next.js app with component library (P0-T07)
- [ ] Profile page exists (P0-T12/T13)

---

## Step-by-Step Implementation

### Step 1: Backend Badge Computation (30 min)

Add `badgeTier` to organization and profile API responses:

```typescript
// In organization.service.ts
computeBadgeTier(kybStatus: string): 'basic' | 'verified' | 'certified' | null {
  switch (kybStatus) {
    case 'pending': return 'basic';
    case 'verified': return 'verified';
    case 'certified': return 'certified';
    default: return null;
  }
}
```

Include in:
- `GET /api/v1/organizations/me` response
- `GET /api/v1/profile/:accountId` response (add `badgeTier` field for business accounts)
- Search results (user search endpoint)
- Conversation list/detail (for business participants)

### Step 2: Shared Types (30 min)

Add to `packages/shared/src/types/`:

```typescript
export type BadgeTier = 'basic' | 'verified' | 'certified';

export interface VerifiedBadgeInfo {
  tier: BadgeTier;
  kybVerifiedAt: string | null;    // ISO8601
  hcsAttestationTopic: string;      // topic ID
  hcsAttestationSeq: number | null; // sequence number for proof link
}
```

### Step 3: VerifiedBadge React Component (1 hour)

Create `apps/web/src/components/VerifiedBadge.tsx`:

- Props: `tier: BadgeTier`, `size?: 'sm' | 'md' | 'lg'`, `verifiedAt?: string`, `hcsProofUrl?: string`
- Renders checkmark icon with tier-specific color:
  - `basic` → gray (#9CA3AF)
  - `verified` → blue (#3B82F6)
  - `certified` → gold (#F59E0B)
- Tooltip on hover: "Verified by Mirsad AI on [date]" with "View proof" link to HashScan
- Accessible: `aria-label="Verified business"`, proper contrast ratios

### Step 4: Profile Page Integration (30 min)

Add `<VerifiedBadge />` to business profile page:
- Display next to company name/display name
- Show badge tier description text below ("KYB Verified Business")
- Link to on-chain attestation

### Step 5: Chat Header Integration (30 min)

When viewing a conversation with a business:
- Show `<VerifiedBadge />` next to the business name in the conversation header
- Badge is small size (`sm`)
- Only visible if `badgeTier` is not null

### Step 6: Search Results Integration (30 min)

When search results include businesses:
- Show `<VerifiedBadge />` inline next to business name
- Badge size `sm`

### Step 7: Broadcast Listings Integration (30 min)

In the broadcast channel list:
- Show `<VerifiedBadge />` next to channel name
- Badge size `sm`

---

## Validation Checklist

- [ ] Badge tier derived from server-side `kyb_status` only (never client-set)
- [ ] Gray badge renders for `pending` KYB status
- [ ] Blue badge renders for `verified` KYB status
- [ ] Badge visible on: profile page, chat header, search results, broadcast listings
- [ ] Tooltip shows verification date and proof link
- [ ] HashScan link opens correct HCS attestation
- [ ] No badge shown for individual (non-business) accounts
- [ ] Component is accessible (aria labels, contrast)
- [ ] `pnpm lint` passes
- [ ] `pnpm tsc --noEmit` passes
- [ ] No `any` types, no `console.log`, no mocking
