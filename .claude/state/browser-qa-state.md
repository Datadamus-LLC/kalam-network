# Browser QA State — Full Coverage Run 2026-03-19 ✅ COMPLETE

> **Screenshots**: qa-screenshots/run-2026-03-19/ (QA-52 through QA-81 = 30 screenshots)
> **Users tested**: @alexjordan (individual) + Kalam Network Ltd. (org)
> **Status**: ALL SCREENS TESTED — 3 bugs found and fixed

---

## All Checklist Items — COMPLETE

### AUTH ✅
- [x] Landing page loads — clean, two CTAs
- [x] Login via OTP — email input, OTP auto-submits, lands on feed
- [x] Logout — dropdown menu with Settings/Log out

### FEED ✅
- [x] For You tab loads with posts
- [x] Trending tab switches
- [x] Following tab shows only followed users' posts + "You've reached the end"
- [x] Compose post — text, counter (280 chars), Post button enables
- [x] Post submits and appears instantly at top
- [x] Own posts show Delete (X) button
- [x] Like a post — count increments, button turns red
- [x] Unlike — count decrements, reverts
- [x] Open comments — expand inline
- [x] Add comment — appears immediately with Delete button
- [x] Delete own comment — removed instantly
- [x] Delete own post — removed from feed
- [x] Refresh feed button

### DISCOVER ✅
- [x] Page loads with search + trending sidebar
- [x] All / KYC verified / Organizations filters — all toggle correctly
- [x] Search by name — results appear with @username or account ID
- [x] Follow button works (opens new follow)
- [x] Already-following shows "Following" (after fix)
- [x] Click user → navigates to their profile

### PROFILE ✅
- [x] Own profile (profile/me) — @username displayed correctly
- [x] Other user profile — back arrow, stats, bio, Follow/Following button
- [x] Follow → Unfollow → Follow cycle — followers count updates
- [x] Posts tab — shows user's posts
- [x] Replies tab — "Replies coming soon" placeholder
- [x] Payments tab — "Payment history coming soon" placeholder

### MESSAGES ✅
- [x] Messages list loads with conversations
- [x] New conversation dialog — Direct Message / Group Chat tabs
- [x] Search in dialog — shows results
- [x] Select user — enables Start Chat
- [x] Remove selected user from dialog
- [x] Close dialog
- [x] Open existing conversation
- [x] Send message — appears instantly with timestamp
- [x] Leave conversation — confirmation dialog
- [x] Cancel leave — dismisses dialog

### NOTIFICATIONS ✅
- [x] All tab with unread count
- [x] Messages / Payments / Social / System filter tabs
- [x] Select all checkbox
- [x] Mark all read — clears badges, "All caught up!"
- [x] Preferences toggles (all 4) — toggle on/off

### PAYMENTS ✅
- [x] Balance: 165.00 TMUSD
- [x] All / Sent / Received tabs
- [x] Search transactions
- [x] Filters button — Status, From/To date range
- [x] Refresh balance
- [x] Refresh transactions
- [x] Click transaction → detail panel (counterpartyName shown after fix)
- [x] Close detail panel
- [x] Send modal — TMUSD, recipient, amount, note, Review step
- [x] Request modal — TMUSD, amount, description
- [x] Split modal — participants add/remove, Equal Split / Custom Amounts
- [x] Recent Contacts Send button — opens pre-filled Send modal

### BROADCASTS ✅
- [x] Page loads without error
- [x] Subscribe input field
- [x] Refresh button
- [x] Org user: Publish section visible
- [x] Org user: Broadcast published — appears with Seq #

### SETTINGS ✅
- [x] Profile tab — display name, username (@alexjordan), bio, avatar URL
- [x] Username availability check (debounced, "Available" in green)
- [x] Save Changes — success toast
- [x] Account tab — Hedera ID, Copy (feedback), HashScan link
- [x] Wallet & Encryption — Active, Configured, PIN backup
- [x] Appearance — Dark/Light/System (full UI switches)
- [x] Danger Zone — Deactivate/Delete (disabled)

### MOBILE 375px ✅
- [x] Feed — hamburger menu in header
- [x] Menu opens — all nav items + Log out
- [x] Payments — fully responsive

### ORG USER (Kalam Network Ltd.) ✅
- [x] Login via OTP
- [x] Organization nav link in sidebar
- [x] Org dashboard — back button, tabs, stats, member list
- [x] Members page — invite form, role dropdown, pending invitations
- [x] Broadcasts tab links to /broadcasts?orgId=...
- [x] Broadcasts page shows Publish section for org user
- [x] Publish broadcast — appears immediately
- [x] Org Settings — name, category, website, bio, Transfer Ownership

---

## Bugs Found and Fixed

| # | P | Screen | Bug | Fix |
|---|---|--------|-----|-----|
| 1 | P2 | Profile/Discover | Follow button always shows "Follow" even when following | Added `checkIsFollowing` API call on mount in profile page; init follow state from API in discover search results |
| 2 | P2 | Payments detail | "To" field showed internal UUID instead of recipient name | Changed `counterpartyId` → `counterpartyName ?? counterpartyId` in tx detail panel |
| 3 | P2 | Profile/me | @username not shown (showed 0.0.XXXXXXX) | Added `username` field to `OwnProfile` interface; render `@username` when set |

---

## Outstanding Issues (no fix needed)

- Notification items show only sender name + time (no "liked your post" text) — **intentional** — privacy-first design for E2E encrypted platform
- Some test posts show "Anonymous" + account ID — users without display names — **expected**
- Trending tab shows same posts as For You — no separate trending algorithm — acceptable

---

## Sessions
- Session 1: 2026-03-18 (partial)
- Session 2 (this run): 2026-03-19 — FULL COVERAGE COMPLETE
