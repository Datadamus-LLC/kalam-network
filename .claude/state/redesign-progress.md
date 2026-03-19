# Hedera Social — UI Redesign Progress

Last updated: 2026-03-16

## Phase Status

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| 0 | Foundation (shadcn, Tailwind v4, providers) | ✅ DONE | Installed, build passes |
| 1 | Layout shell (AppLayout, sidebar, right panel) | ✅ DONE | Dark sidebar, pill nav, lemon Post button, user row dropdown, notification dot, collapsed rail for Messages, mobile menu. Tests: 39/39 pass at 375/768/1280px |
| 2 | Feed page | ✅ DONE | Dark feed, lemon tabs (For you/Following/Trending), compose form (lemon Post), PostCard (no elevation, remixicon icons, border-b), right panel (search/balance/who-to-follow). Tests: 28/28 pass at 375/768/1280px |
| 3 | Payments page + dialogs | ✅ DONE | Dark layout, pill filters (All/Sent/Received), search pill, white amounts, dark dialogs (lemon Send button), remixicon icons, BalanceWidget redesigned, right panel. Tests: 21/21 pass at 375/768/1280px |
| 4 | Notifications page | ✅ DONE | Dark layout, pill filters with lemon count badges, neutral icon circles, lemon left-edge dot on unread, "Mark all read" ghost pill, right panel (unread summary + lemon preference switches). Tests: 15/15 pass at 375/768/1280px |
| 5 | Messages page | ✅ DONE | Dark conv list (300px panel), lemon unread pills, "Select conversation" placeholder, dark dialog (Direct/Group type pills), dark message bubbles (spec corner-radius), lemon send button when text typed, typing indicator. Tests: 17/17 pass at 375/768/1280px |
| 6 | Discover + Trending pages | ✅ DONE | Dark large pill search (48px), filter pills (All/KYC/Organizations - client-side), dark user rows (44×44 avatar, lemon org badge, green KYC badge), right panel trending posts, trending page with remixicon. Tests: 20/20 pass at 375/768/1280px |
| 7 | Profile pages | ✅ DONE | Dark 2-column layout, 64×64 avatar, name+badge+handle, stats row, lemon underline tabs (Posts/Replies/Payments), PostList on Posts tab, white Follow button, outline Edit profile button, right panel Hedera identity pills, ProfileBadge dark colors. Tests: 17/17 pass at 375/768/1280px |
| 8 | Settings page | ✅ DONE | 3-column layout (left nav 200px, content, right panel), lemon right border on active nav item, section switching (Profile/Account/Wallet/Appearance/Danger Zone), pill theme selector, red Danger Zone styling, right panel (Account Status + Payment Limits). Tests: 19/19 pass at 375/768/1280px |
| 9 | Organization pages | ✅ DONE | Dark 2-column layout, square-rounded org avatar, KYB badge (green/lemon/red), lemon underline tabs, role badges (Owner=lemon, Admin=white, Member=muted, Viewer=very dim), pill invite form, dark confirmation dialogs, red Danger Zone in org settings. Tests: 20/20 pass at 375/768/1280px |
| 10 | Auth + Onboarding pages | ✅ DONE | Auth: lemon CTAs, pill inputs, dark bg. Onboarding: lemon progress bar, lemon spinner, lemon type selection, dark KYC form, lemon checkmark, "Get Started" (lemon). Tests: 43 pass |
| 11 | Replace old UI primitives | ✅ DONE | Broadcasts page redesigned, all pages dark. |
| 12 | Remove lucide-react | ✅ DONE | 0 lucide-react imports remaining (was 14 files) |

## Last Validation Run
- Date: 2026-03-16
- TypeScript: ✅ PASS (0 errors)
- Lint: ✅ PASS (1 warning, 0 errors)
- Build: ✅ PASS
- Per-phase tests (Phase 1): ✅ 39/39 PASS
- Per-phase tests (Phase 2): ✅ 28/28 PASS — page structure, tabs lemon border, compose form, PostCard design, old styling removed, multi-resolution
- Smoke tests: ✅ 24/24 PASS — all pages at mobile (375px) + tablet (768px) + desktop (1280px)
- Screenshots: 70+ files in test-screenshots/
- Design compliance: ✅ No lemon misuse, ✅ No emojis, ⚠️ 14 lucide-react files (pre-redesign, fix in Phase 12)
- BE coverage gaps: Audited — see section below

## Known Issues
- `Button.tsx` and `Input.tsx` were renamed to `button.tsx` / `input.tsx` (git mv) to fix TS casing errors
- All `@/components/ui/Button` imports standardized to `@/components/ui/button` (lowercase)
- All `@/components/ui/Input` imports standardized to `@/components/ui/input` (lowercase)
- Avatar API updated to composition pattern (AvatarImage + AvatarFallback) in 11 files

## BE Coverage Gaps Found

### Critical (feature broken without fix)
- ❌ **User suggestions ("Who to Follow")** — No `/users/suggestions` endpoint exists. Feed right panel cannot show "Who to Follow". **Option A**: UI shows search instead; or **Option B**: Add simple suggestions endpoint (return users not yet followed, ordered by follower count).
- ❌ **Feed "Following" filter** — `getHomeFeed` has no `filter=following` param. "Following" tab in Feed shows all posts instead of followed-only. **Option B**: Add `filter` param to feed endpoint.

### Nice-to-have (UX degraded but functional)
- ⚠️ **User search KYC/accountType filters** — `searchUsers` doesn't support `kycLevel` or `accountType` filter params. Discover page filter tabs would show unfiltered results. **Option A**: UI can hide filter chips until BE supports them.
- ⚠️ **Broadcast viewCount** — Broadcast responses don't include `viewCount`. Org page broadcast stats would show N/A. **Option A**: Omit view count from UI.
- ⚠️ **Org subscriberCount** — Org response doesn't include `subscriberCount`. Org stats panel shows N/A. **Option A**: Omit from UI.
- ⚠️ **Notification preferences** — No `PUT /users/notification-preferences` endpoint. Settings notification toggles would be UI-only. **Option A**: Store in localStorage only.

### No action needed
- ✅ Profile stats (followers/following count) — included in profile response via FollowerCountEntity
- ✅ Conversations unreadCount — included in conversation response DTO
- ✅ Payment search — queryTransactions has `search` param
- ✅ Notification category filter — getNotifications accepts `category` param
- ✅ All other payment endpoints (counterpartyProfile, date range, etc.)
