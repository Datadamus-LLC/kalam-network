# Hedera Social — UI/UX Redesign Spec
**Date:** 2026-03-16
**Status:** Approved
**Scope:** Full visual and UX overhaul of `apps/web` using shadcn/ui preset `abWTUw6`

---

## 1. Overview

The app is functionally complete (533 tests passing, zero mocks). This spec covers a complete visual redesign — no backend changes, no store changes, no API changes. Only `apps/web` is touched.

**Platform name:** Hedera Social or Hedera Social
**Design direction:** Premium dark-first, X.com-inspired layout, restrained accent color, pill-shaped controls throughout
**Reference:** X.com (Twitter) for layout and navigation patterns

---

## 2. Technology Foundation

| Item | Value |
|------|-------|
| Component library | shadcn/ui v4 (`shadcn@4.0.8`) |
| Preset | `--preset abWTUw6` (already installed) |
| Tailwind | v4 (`tailwindcss@^4`, `@tailwindcss/postcss`) |
| Icons | `@remixicon/react` (defined in `components.json`) |
| Font | Geist (`geist` package, `GeistSans`) |
| Dark mode | `next-themes` with `attribute="class"` |
| Default theme | Dark |

**Already installed and configured:**
- `apps/web/src/app/globals.css` — CSS variables for dark + light modes
- `apps/web/components.json` — shadcn config with `iconLibrary: "remixicon"`
- `apps/web/postcss.config.js` — Tailwind v4 PostCSS plugin
- `apps/web/src/app/providers.tsx` — `ThemeProvider`, `TooltipProvider`, `Toaster`
- `apps/web/src/app/layout.tsx` — `GeistSans` font

---

## 3. Color System

### Dark Mode (default)
```css
--background: oklch(0.145 0 0)        /* near black */
--foreground: oklch(0.985 0 0)        /* near white */
--card: oklch(0.205 0 0)
--primary: oklch(0.473 0.137 46.201)  /* amber */
--border: oklch(1 0 0 / 10%)
--muted: oklch(0.269 0 0)
--sidebar: oklch(0.205 0 0)
```

### Light Mode
```css
--background: oklch(1 0 0)            /* white */
--foreground: oklch(0.145 0 0)        /* near black */
--primary: oklch(0.555 0.163 48.998)  /* amber */
--border: oklch(0.922 0 0)
```

### Accent Color — Lemon Gold
| Mode | Hex | Usage |
|------|-----|-------|
| Dark | `#f0d060` | Post button, Send button background (black text) |
| Light | `#2d2d2d` | Post button, Send button background (lemon `#f0d060` text) |

**The lemon is used on exactly two things: the Post CTA button and the Send payment button.** Nothing else uses this color as a fill — it would make the design look cheap.

### Functional Colors
| Purpose | Color | Usage |
|---------|-------|-------|
| Like (active) | `#e0245e` | Heart icon when liked, hover tint |
| Confirmed / online | `#00ba7c` | Payment confirmed badge, online dot |
| Pending | `#f0d060` dim | Badge only |
| Failed / danger | `#e0245e` | Failed badge, danger zone |
| Notification dot | `#f0d060` | Sidebar notification indicator |
| KYC badge bg | `rgba(240,208,96,0.1)` | Amber dim tint, lemon text |
| Unread count | `rgba(240,208,96,0.15)` bg + `#f0d060` text | Pill on category filters |

### What is NOT colored
- Navigation icons and text → white/gray only (bold weight when active)
- Balance amount → white
- Notification amounts → white, `font-weight: 500`
- Follow buttons → white background, black text
- All other buttons → outline (border only) or ghost

---

## 4. Typography

**Font family:** Geist Sans (`--font-sans: var(--font-sans)`)

| Use | Size | Weight |
|-----|------|--------|
| Page title | 17px | 800 |
| Section title (settings) | 15px | 800 |
| Org name / modal title | 17–22px | 800 |
| Body text | 14px | 400 |
| Secondary / meta | 13px | 400 |
| Small / timestamps | 12px | 400 |
| Labels / section heads | 11px | 700, uppercase |
| Nav labels | 16px | 400 (600 when active) |
| Balance display | 28px | 800 |
| Amount input (dialog) | 26px | 800 |
| Button text | 14–16px | 600–700 |

---

## 5. Border Radius Philosophy

**Rule: every interactive control is `border-radius: 999px` (pill). No exceptions.**

| Element | Radius |
|---------|--------|
| All buttons | `999px` |
| All single-line inputs | `999px` |
| All select / dropdown triggers | `999px` |
| All pill filter tabs | `999px` |
| All badges | `999px` |
| Textarea (multiline) | `14px` — pills don't work for multiline |
| Cards / containers | `14–16px` |
| Dialog | `16px` |
| Avatar | `50%` (circle) |
| Org avatar | `10px` (rounded square) |
| Logo mark | `8px` |
| OTP cells | `12px` |
| File upload area | `14px` dashed border |

---

## 6. Layout Architecture

### Shell — max-width 1060px centered
All pages share a centered container. Never full-width. Black background bleeds to edges of viewport.

```
viewport (black)
  └── max-width 1060px, centered, border-radius 14px
        ├── Sidebar (left)
        ├── Main content (flex: 1)
        └── Right panel (fixed width, context-aware)
```

### Sidebar Behavior
| Page | Sidebar style | Width |
|------|--------------|-------|
| Feed, Discover, Notifications, Payments, Profile, Settings, Organization | **Full labeled** (icon + text label) | 220px |
| Messages | **Collapsed rail** (icon only, no labels) | 56px |

### Full Sidebar Structure (220px)
- Logo mark (32×32, rounded, white bg)
- Nav items: icon (20px) + label (16px), pill hover, bold+white when active
- Notification dot: lemon `#f0d060`, 7px, top-right of bell icon
- Spacer (flex: 1)
- **Post button**: lemon fill, `border-radius: 999px`, full width, `font-weight: 600`
- User row: avatar + name + handle + `···` menu

### Collapsed Rail Structure (56px)
- Logo mark
- Icon-only nav items (40×40, rounded-10px)
- Spacer
- **`+` icon button**: lemon fill square (for new conversation)
- Avatar

### Navigation Items (in order)
1. Home (feed icon)
2. Discover (search icon)
3. Notifications (bell icon) — lemon dot when unread
4. Messages (chat bubble icon)
5. Payments (card/wallet icon)
6. Broadcasts (grid/broadcast icon)
7. Profile (person icon)

### Right Panel — Context-Aware
| Page | Right panel content |
|------|---------------------|
| Feed | Search bar + Balance widget (HBAR + Send/Request) + Who to follow |
| Messages | None — conversation list fills the space |
| Payments | Pending requests + Send again (recent contacts) |
| Notifications | Unread summary by category + Notification preferences (Switch toggles) |
| Discover | Trending posts |
| Profile | Hedera account info (account ID, DID NFT, KYC status) + Similar accounts |
| Settings | Account status card + Payment limits card |
| Organization | Org stats + Invite button / Broadcast stats |

---

## 7. Component Patterns

### Buttons
```
Primary (lemon fill):    bg #f0d060, color #000, pill, h-40px, font-weight: 600
Outline:                 border 1px solid --border, color --fg, pill, h-40px
Ghost:                   no border, color --fg-muted, pill
Danger outline:          border rgba(224,36,94,0.3), color #e0245e, pill
Icon button:             34×34px, border 1px solid --border, circle
```

### Inputs
All single-line: `background: rgba(255,255,255,0.06)`, `border: 1px solid --border`, `border-radius: 999px`, `height: 40–46px`, `padding: 0 18px`
Focus state: `border-color: rgba(255,255,255,0.2–0.25)`
Error state: `border-color: #e0245e`, `background: rgba(224,36,94,0.08)`
Textarea: same background/border but `border-radius: 14px`, `padding: 14px 18px`
Amount input (dialog): bare number, no container — `font-size: 26px`, `font-weight: 800`, centered, no border

### Filter / Segmented Controls
All pill group: `padding: 0 14–16px`, `height: 34–36px`, `border-radius: 999px`, `border: 1px solid transparent`
Active state: `background: rgba(255,255,255,0.1)`, `border-color: rgba(255,255,255,0.15)`, `color: #fff`
Inactive: `color: var(--fg-muted)`

### Feed Tabs (content navigation — not filter controls)
Use lemon bottom border (underline) for active state instead of pill fill:
`border-bottom: 2px solid #f0d060`, `color: #fff`
Used on: Feed (For you/Following/Trending), Profile (Posts/Replies/Payments), Org (Overview/Members/Broadcasts/Settings)

### Cards / Containers
```
border: 1px solid rgba(255,255,255,0.08)
border-radius: 14–16px
background: #000 (no elevation, no different shade)
```
**No elevation system.** Everything is on the same `#000` plane. Borders define edges, not shadows.

### Dialog / Modal
```
background: #000                              /* pure black, no elevation */
border: 1px solid rgba(255,255,255,0.14)      /* slightly brighter than card border */
border-radius: 16px
box-shadow: 0 32px 80px rgba(0,0,0,0.8)       /* for depth, not color */
```
Overlay: `background: rgba(0,0,0,0.75)`, `backdrop-filter: blur(6px)`
Header: title (17px/800) + subtitle (12px/muted) + close icon
Footer: Cancel (outline pill) + Confirm (lemon pill) — right-aligned

### Badges
```
KYC / ORG:          background rgba(240,208,96,0.12), color rgba(240,208,96,0.8), pill
Role (Owner):       lemon-dim bg, lemon text
Role (Admin):       rgba(255,255,255,0.08), white text
Role (Member):      rgba(255,255,255,0.05), muted text
Role (Viewer):      rgba(255,255,255,0.03), very dim text
Confirmed (payment): rgba(0,186,124,0.1), #00ba7c text
Pending:            lemon-dim, lemon text
Failed:             rgba(224,36,94,0.1), #e0245e text
BROADCAST:          same as KYC badge
```

### Switch (shadcn)
On: `background: #f0d060`, thumb black
Off: `background: rgba(255,255,255,0.15)`, thumb black
Size: `width: 36–40px`, `height: 20–22px`

### Notification Row
Unread: `background: rgba(255,255,255,0.018)` + lemon 5px dot on left edge
Avatar: 40×40, circle
Type badge: 18×18 overlaid bottom-right, `border: 2px solid #000`
Badge color: neutral `rgba(255,255,255,0.15)` for most, red-dim for likes, lemon-dim for payment requests
Amount in preview: `font-size: 14px`, `font-weight: 500` (not bold), white

### Transaction Row (Payments)
Direction icon: 38×38 circle, `background: rgba(255,255,255,0.06)`, arrow icon
Sent amount: white (`var(--fg)`)
Received amount: **white** (`var(--fg)`) — NOT green
Status badge: pill, confirmed/pending/failed colors above

### File Upload
Empty: `border: 1.5px dashed rgba(255,255,255,0.15)`, `border-radius: 14px`
Filled: `border: 1px solid rgba(240,208,96,0.3)`, solid, lemon filename text
Error: `border-color: rgba(224,36,94,0.3)`

---

## 8. Page-by-Page Spec

### 8.1 Feed (`/feed`)
- **Sidebar**: Full labeled, Home active
- **Header**: "Home" + trending star icon
- **Tabs**: For you / Following / Trending (lemon underline)
- **Compose box**: Avatar + placeholder text + media icon + attachment icon + Post pill button (lemon)
- **Post card**: Avatar + name + KYC badge + time → body text → payment card (if applicable) → actions (like/reply/repost/share)
- **Like active**: red (#e0245e), hover adds red dim background
- **Reply hover**: blue tint
- **Repost hover**: green tint
- **Embedded payment receipt**: `border: 1px solid --border`, `border-radius: 12px`, payment icon + amount + status pill
- **Right panel**: Search pill + Balance card + Who to follow

### 8.2 Messages (`/messages`, `/messages/[topicId]`)
- **Sidebar**: Collapsed rail, Messages active, `+` button (lemon) replaces Post
- **Conversation list** (300px): "Messages" header + edit icon → Search pill input → conversation items
- **Conversation item**: Avatar + online dot + name + time + preview (unread = white, read = muted) + unread lemon count pill
- **Active chat**: Header (avatar + name + KYC badge + online status + action icon buttons) → ScrollArea messages → Input row
- **Message bubbles**: Received `rgba(255,255,255,0.07)` + `border-bottom-left-radius: 4px`; Sent `rgba(255,255,255,0.13)` + `border-bottom-right-radius: 4px`
- **Payment request card**: Inline in chat, "Pay now" = lemon pill, "Decline" = outline pill — both on ONE row, `white-space: nowrap`
- **Typing indicator**: Animated 3 dots
- **Send button**: Lemon when message is typed, muted when empty

### 8.3 Payments (`/payments`)
- **Sidebar**: Full labeled, Payments active
- **Balance section**: Balance label + 28px/800 HBAR amount + Send (lemon pill) + Request (outline) + Split (ghost) — all `height: 40px`
- **Filter row**: Pill group (All/Sent/Received) + Search pill + Date pill
- **Transaction rows**: Direction icon (arrow up = sent gray, arrow down = received gray) + name + meta → amount (white) + status badge
- **Right panel**: Pending requests (lemon amount) + Send again (recent contacts with Send outline buttons)
- **Send dialog**: Recipient pill (selected state shows avatar + name + account ID + lemon checkmark + clear X) → Amount section (bare large number centered, HBAR label above, USD below, quick-amount pills) → Note pill input
- **Dialog buttons**: Cancel (outline pill) + Send N HBAR (lemon pill)

### 8.4 Notifications (`/notifications`)
- **Sidebar**: Full labeled, Notifications active
- **Header**: "Notifications" + "Mark all read" ghost pill button
- **Filter pills**: All (count) / Messages / Payments / Social / System — counts in lemon-dim pill
- **Notification rows**: Unread has lemon dot + very subtle bg. Type badge on avatar (neutral white-dim for most, red-dim for likes, lemon-dim for payment requests). Amounts: `font-weight: 500`, white, same size as body
- **Inline actions**: "Pay N HBAR" (lemon) + "Decline" (outline) / "Follow back" (outline)
- **System notifications**: Shield/icon in muted circle, no avatar
- **Right panel**: Unread summary by category (lemon badges) + Preferences switches

### 8.5 Discover (`/discover`)
- **Sidebar**: Full labeled, Discover active
- **Search**: Large pill search bar at top (16px placeholder)
- **Filter pills**: All / KYC verified / Organizations
- **User rows**: Avatar (44×44) + name + badge + handle + bio + stats → Follow/Following pill button
- **Follow**: white fill, black text
- **Following**: outline pill, muted
- **Right panel**: Trending posts (compact previews)

### 8.6 Profile (`/profile/[accountId]`, `/profile/me`)
- **Sidebar**: Full labeled, Profile active
- **Back row**: back arrow + name + post count
- **Profile header**: Avatar (64×64, circle, 3px black border) → name + KYC badge + handle + account ID → bio → meta (joined date, DID NFT) → stats row (Posts/Followers/Following/Payments)
- **Action buttons** (other's profile): Message icon + Send payment icon + **Follow** (white pill)
- **Action buttons** (own profile): **Edit profile** (outline pill)
- **All action buttons**: same `height: 34px`, `border-radius: 999px`, vertically aligned with `display: flex; align-items: center`
- **Content tabs**: Posts / Replies / Payments (lemon underline)
- **Right panel**: Hedera account info (account ID, DID NFT, KYC status as pills) + Similar accounts

### 8.7 Settings (`/settings`)
- **Sidebar**: Full labeled
- **Inner layout**: Settings left nav (200px, active item has lemon right border) + Settings content (scrollable) + Right panel
- **Setting row**: label + description (left) + control (right)
- **Controls**: inline edit pill button, Switch, pill theme selector (Dark/Light/System)
- **Danger zone**: red section title, red outline pill buttons
- **Right panel**: Account status + Payment limits

### 8.8 Organization (`/organization`)
- **Sidebar**: Full labeled, Organization active (building/home icon)
- **Org header**: Square-rounded org avatar + name + KYB badge + handle + action buttons
- **Tabs**: Overview / Members / Broadcasts / Settings (lemon underline)
- **Members tab**: Table with Member / Role / Joined / actions columns. Role badges (Owner=lemon, Admin=white, Member=muted, Viewer=very dim). Pending invite rows at 60% opacity with dashed avatar
- **Broadcasts tab**: Compose box (org avatar, "Broadcast to N subscribers…") + broadcast posts with "BROADCAST" label tag + views count stat
- **Right panel Members**: Org stats + Invite pill button
- **Right panel Broadcasts**: Broadcast stats + Recent subscribers

### 8.9 Auth pages (`/login`, `/register`)
- **No sidebar, no shell**. Full screen black. Content centered at 360px.
- **Landing**: Logo mark + "Hedera Social" wordmark + tagline + Create account (lemon) + Sign in (ghost)
- **Email step**: Logo + title + subtitle + email pill input + Continue (lemon)
- **OTP**: Logo + title + email reminder + shadcn InputOTP (6 cells, separator dot, `border-radius: 12px`) + Verify (lemon, disabled until complete) + Resend / Back links

### 8.10 Onboarding (`/onboarding/*`)
- **No sidebar**. Step progress bar at top (pill segments, lemon=done/active, dim=upcoming)
- **Profile setup**: Avatar upload circle (dashed, lemon `+` badge) + Display name + Username + Bio textarea + Continue + Skip
- **Wallet creation**: Spinner (lemon border-top, rotates) + copy + Tamam explanation
- **KYC type selection**: Two option cards (Individual / Business), selected = lemon border + lemon-dim bg + lemon icon. CTA updates to match selection
- **KYC form**: Section headers (muted uppercase, border-top separator) + field rows (single + two-column pairs) + file upload areas + consent checkbox + Submit
- **Business KYB**: Same structure, more fields, error state on required missing uploads
- **Success**: All steps lemon, checkmark icon in lemon-dim circle + account ID + DID NFT info pills + Go to Hedera Social (lemon)

### Form patterns (KYC/Onboarding)
- **Two-column row**: For pairs of short fields (first/last name, city/postal)
- **Section divider**: `border-top: 1px solid --border`, muted uppercase label (e.g. "Personal details", "Documents")
- **File upload**: Empty = dashed border; Filled = lemon border + filename + "Tap to change"; Error = red border + red label
- **Checkbox**: `20×20px`, `border-radius: 6px`, lemon fill when checked, black checkmark
- **Disabled submit**: `opacity: 0.35`, descriptive text "complete all fields"

---

## 9. Iconography

**Library:** `@remixicon/react`
**Style:** Line (outline) icons throughout, `stroke-width: 1.8–2`
**Size:** 18–20px in navigation, 14–16px in post actions, 13–15px in header actions

**No emojis anywhere in the UI.** All visual indicators use Remixicon icons.

Quick-amount shortcuts in payment dialog use pill buttons, not icons.

---

## 10. Spacing System

| Context | Padding |
|---------|---------|
| Page header | `13px 18px` |
| Section/card row | `12–14px 18px` |
| Right panel | `14px` |
| Dialog body | `18px 20px` |
| Nav item | `11px 18px` |
| Compose box | `12–14px 18px` |
| Settings content | `20px 24px` |
| Auth content | `40px 24px` |

Gaps between stacked items: `6–8px` for tight groups, `12–14px` for distinct items.

---

## 11. Responsive / Mobile

- **Breakpoint**: 768px (md)
- **Mobile nav**: Bottom tab bar (5 tabs: Feed, Messages, Payments, Notifications, Profile)
- **Three-column collapses**: Right panel hides first, then sidebar becomes hamburger drawer
- **No bottom nav on auth/onboarding pages**

---

## 12. Dark/Light Mode

**Provider:** `next-themes`, `attribute="class"`, default `"dark"`
**Toggle:** In Settings → Appearance (Dark / Light / System pill selector)
**Classes:** `.dark` on `<html>` — all CSS variables switch via the `.dark` selector in `globals.css`

Dark: everything on `#000` / near-black
Light: white background, dark text, **charcoal `#2d2d2d` Post/Send buttons with `#f0d060` text**

---

## 13. Existing Components to Replace

| Old file | Replace with |
|----------|-------------|
| `components/ui/Button.tsx` | shadcn `Button` |
| `components/ui/Input.tsx` | shadcn `Input` |
| `components/ui/Avatar.tsx` | shadcn `Avatar` |
| `components/ui/VerifiedBadge.tsx` | shadcn `Badge` with icon |

---

## 14. shadcn Components Installed

`button` `input` `avatar` `badge` `card` `dialog` `sheet` `tabs` `dropdown-menu` `separator` `scroll-area` `tooltip` `form` `label` `textarea` `select` `switch` `skeleton` `sonner` `input-otp` `table` `progress` `sidebar`

---

## 15. Implementation Constraints

1. **Do NOT touch**: `packages/api/`, Zustand stores, API client (`lib/api.ts`), socket client, hooks
2. **Do NOT change**: Route structure, auth guard logic, store state shape
3. **Must preserve**: All existing functionality — forms submit, payments work, messages send
4. **Must pass**: `pnpm build`, `pnpm lint`, `pnpm tsc --noEmit` after each page
5. **No `any` types**, no hardcoded colors (use CSS variables), no `console.log`
6. All icons from `@remixicon/react` — remove `lucide-react` imports
