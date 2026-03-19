---
name: ui-redesign
description: >
  UI/UX redesign guide for Hedera Social. Use when implementing any frontend page
  or component redesign. Enforces the design spec from
  docs/superpowers/specs/2026-03-16-ui-redesign-design.md.
  Triggers on: redesign, page rebuild, component, shadcn, styling, UI, layout,
  sidebar, feed, messages, payments, notifications, profile, auth, onboarding,
  settings, organization, dark mode, light mode.
---

# Hedera Social — UI Redesign Skill

You are implementing the visual redesign of the Hedera Social frontend.
The functional code (stores, API, hooks, routes) is COMPLETE — do not touch it.
Your job is to rebuild the visual layer only.

**ALWAYS read the full design spec first:**
`docs/superpowers/specs/2026-03-16-ui-redesign-design.md`

---

## RULE 0: Never Break Functionality

Before touching any file:
1. Note what API calls, store hooks, and event handlers it uses
2. Preserve ALL of them — just change the JSX and styles
3. After changes: `cd apps/web && pnpm tsc --noEmit` must pass
4. After changes: `pnpm build` must pass

If a component calls `usePaymentStore()`, `useAuth()`, `api.sendPayment()`, etc. — keep those calls exactly as they are. Only change the rendering.

---

## RULE 1: Design Token Usage

**Colors — use CSS variables, never hardcode hex:**
```tsx
// ✅ Correct
className="bg-background text-foreground"
className="border-border"
style={{ color: 'var(--fg-muted)' }}

// ❌ Wrong
style={{ color: '#71767b' }}
className="bg-[#000]"
```

**Lemon accent — only on Post CTA and Send button:**
```tsx
// ✅ The TWO places lemon is used as fill
<Button className="bg-[#f0d060] text-black hover:opacity-90">Post</Button>
<Button className="bg-[#f0d060] text-black">Send 150 HBAR</Button>

// ❌ Do NOT use lemon anywhere else as fill
```

**Icons — Remixicon only, no lucide-react:**
```tsx
// ✅ Correct
import { RiHomeLine, RiSearchLine } from '@remixicon/react'
<RiHomeLine size={20} />

// ❌ Wrong
import { Home } from 'lucide-react'
```

---

## RULE 2: Pill-First Controls

Every interactive control is `rounded-full` (border-radius: 999px).
The ONLY exception is `Textarea` which uses `rounded-[14px]`.

```tsx
// ✅ All buttons
<Button className="rounded-full">Follow</Button>
<Input className="rounded-full" />
<Select>...</Select>  // use shadcn Select, it gets rounded-full via globals

// ✅ Textarea
<Textarea className="rounded-[14px]" />

// ❌ Never use rounded-md, rounded-lg on interactive controls
```

---

## RULE 3: No Elevation

No card backgrounds that differ from the page background. No `bg-card` on inner surfaces — everything is `bg-background` or transparent with a border.

```tsx
// ✅ Container / card
<div className="border border-border rounded-[14px] overflow-hidden">

// ❌ No elevated surface
<div className="bg-card rounded-[14px]">  // avoid — creates visual lift
```

**Exception:** Dialogs use `bg-card` (the shadcn default) because they float above the overlay.

---

## RULE 4: Sidebar Behavior

| Page | Sidebar |
|------|---------|
| Feed, Discover, Notifications, Payments, Profile, Settings, Organization | Full labeled (220px) |
| Messages | Collapsed rail (56px) |

The `AppLayout.tsx` component controls this. Pass a prop or read the route to determine which sidebar to show.

---

## RULE 5: shadcn Components First

Always use the installed shadcn component before writing custom HTML. Installed components:
`Button Input Avatar Badge Card Dialog Sheet Tabs DropdownMenu Separator ScrollArea Tooltip Form Label Textarea Select Switch Skeleton Sonner InputOTP Table Progress Sidebar`

```tsx
// ✅ Use shadcn
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

// ❌ Don't write custom <button> or <input> styled with className when shadcn exists
```

---

## RULE 6: Dark Mode Classes

Use Tailwind dark: variant for anything that differs between modes:
```tsx
className="bg-background"           // auto-switches via CSS var
className="dark:bg-[#000] bg-white" // explicit if needed
```

The `ThemeProvider` is already in `providers.tsx` — dark is default.

---

## IMPLEMENTATION WORKFLOW

For each page/component:

### Step 1 — Read current implementation
```bash
Read apps/web/src/app/(app)/[page]/page.tsx
Read apps/web/src/components/[relevant-components]
```
Note every: store hook, API call, socket subscription, event handler, prop.

### Step 2 — Plan the new JSX
Reference the design spec section for this page.
Map each UI element to a shadcn component.
Identify what custom styling is needed beyond shadcn defaults.

### Step 3 — Implement
- Keep all existing logic/hooks
- Replace JSX with shadcn components + Tailwind classes
- Use Remixicon for all icons
- Apply the correct layout (sidebar type, right panel content)
- Apply pill borders to all interactive elements

### Step 4 — Verify TypeScript
```bash
cd apps/web && pnpm tsc --noEmit
```
Fix any TypeScript errors before moving to the next step.

### Step 5 — Write targeted Playwright tests

**This step is MANDATORY. A phase is not done without passing tests.**

Create `e2e/redesign-phase{N}-[page].spec.ts` covering:
- **Structure**: key elements are rendered (heading, nav, buttons, inputs)
- **Lemon discipline**: Post/Send button background is `rgb(240, 208, 96)` (use `getComputedStyle`)
- **No old styling**: old `bg-blue-*`, `bg-gray-*`, `text-blue-*` classes are gone from redesigned elements
- **Functional behavior**: navigation works, forms submit, modals open
- **Active states**: active nav item has `font-bold` class
- **Auth guard**: unauthenticated users are redirected to `/`
- **Multi-resolution**: test runs at 375px (mobile), 768px (tablet), 1280px (desktop) using `test.use({ viewport })`
- **Screenshots**: `await page.screenshot({ path: 'test-screenshots/phase{N}-[page]-{viewport}.png' })`

Use the helpers:
```typescript
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth } from './helpers';

let authData: { email: string; token: string; refreshToken: string; hederaAccountId: string };
test.beforeAll(async () => { authData = await registerUserViaApi('[page]'); });
test.beforeEach(async ({ page }) => {
  await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
  await page.goto('/[page]');
  await page.waitForURL(/[page]/);
});
```

### Step 6 — Run the tests

**Ensure services are running first.**

Check API:
```bash
npx tsx -e "fetch('http://localhost:3001/api/v1/health').then(r=>r.ok?console.log('API OK'):console.log('API DOWN')).catch(()=>console.log('API DOWN'))"
```

Run tests:
```bash
cd /Users/bedtreep/Documents/GitHub/social-platform && npx playwright test e2e/redesign-phase{N}-[page].spec.ts --reporter=list 2>&1
```

**All tests must pass before the phase is marked DONE.**
If tests fail: fix the component (not the test) unless it's a selector issue from a deliberate label change.

### Step 7 — Build check
```bash
cd apps/web && pnpm build 2>&1 | tail -10
```

---

## PAGE IMPLEMENTATION ORDER

Recommended order to minimize risk of breakage:

1. **Shared layout shell** (`AppLayout.tsx`, `(app)/layout.tsx`) — this unblocks everything
2. **Feed** (`/feed`) — establishes post card pattern used everywhere
3. **Payments** (`/payments`) — establishes transaction row + dialog patterns
4. **Notifications** (`/notifications`) — establishes notification row pattern
5. **Messages** (`/messages`, `/messages/[topicId]`) — collapsed sidebar + chat patterns
6. **Discover** (`/discover`) — user card pattern
7. **Profile** (`/profile/[accountId]`, `/profile/me`) — profile header pattern
8. **Settings** (`/settings`) — inner nav + toggle patterns
9. **Organization** (`/organization/*`) — table + broadcasts
10. **Auth** (`/login`, `/register`, `/onboarding/*`) — full-screen, no sidebar

---

## COMPONENT REFERENCE

### Post Card
```tsx
<div className="flex gap-[10px] px-[18px] py-[12px] border-b border-border hover:bg-white/[0.018] cursor-pointer">
  <Avatar className="h-[38px] w-[38px] flex-shrink-0" />
  <div className="flex-1 min-w-0">
    {/* name + badge + time */}
    <p className="text-[14px] text-foreground leading-[1.5]">{text}</p>
    {/* actions: like (red when active), reply (blue hover), repost (green hover), share */}
  </div>
</div>
```

### Pill Button (primary)
```tsx
<Button className="rounded-full h-[40px] px-[20px] bg-[#f0d060] text-black font-semibold hover:opacity-90">
  {label}
</Button>
```

### Pill Button (outline)
```tsx
<Button variant="outline" className="rounded-full h-[40px] px-[20px] border-border text-foreground">
  {label}
</Button>
```

### Pill Input
```tsx
<Input className="rounded-full h-[40px] bg-white/[0.06] border-border px-[18px] text-[14px]" />
```

### Filter Pill Group
```tsx
<div className="flex gap-[6px]">
  {['All', 'Sent', 'Received'].map(tab => (
    <button
      key={tab}
      className={cn(
        "h-[36px] px-[14px] rounded-full text-[13px] font-semibold border transition-all",
        active === tab
          ? "bg-white/10 border-white/15 text-white"
          : "border-transparent text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
      )}
      onClick={() => setActive(tab)}
    >
      {tab}
    </button>
  ))}
</div>
```

### Feed Tabs (lemon underline)
```tsx
<Tabs defaultValue="for-you">
  <TabsList className="border-b border-border rounded-none bg-transparent h-auto p-0">
    <TabsTrigger
      value="for-you"
      className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#f0d060] data-[state=active]:text-white text-muted-foreground font-semibold"
    >
      For you
    </TabsTrigger>
  </TabsList>
</Tabs>
```

### Dialog (Send Payment)
```tsx
<Dialog>
  <DialogContent className="bg-background border border-white/[0.14] rounded-[16px] p-0 max-w-[400px]">
    <DialogHeader className="px-[20px] pt-[18px] pb-[14px] border-b border-border">
      <DialogTitle>Send HBAR</DialogTitle>
      <DialogDescription>Signed via Tamam MPC custody</DialogDescription>
    </DialogHeader>
    {/* Amount section — bare number */}
    <div className="flex flex-col items-center py-[32px] px-[20px] border-b border-border gap-[6px]">
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">HBAR</span>
      <input className="text-[26px] font-extrabold text-white bg-transparent border-none outline-none text-center w-full caret-[#f0d060]" />
      <span className="text-[13px] text-muted-foreground">≈ $0.00 USD</span>
    </div>
    <div className="px-[20px] py-[18px] space-y-[14px]">
      {/* Recipient pill */}
      {/* Note pill */}
    </div>
    <DialogFooter className="px-[20px] py-[14px] border-t border-border">
      <Button variant="outline" className="rounded-full">Cancel</Button>
      <Button className="rounded-full bg-[#f0d060] text-black font-bold">Send 150 HBAR</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Switch Row (Settings)
```tsx
<div className="flex items-center justify-between py-[12px] border-b border-border">
  <div>
    <p className="text-[14px] font-semibold text-white">{label}</p>
    <p className="text-[12px] text-muted-foreground">{description}</p>
  </div>
  <Switch
    checked={value}
    onCheckedChange={onChange}
    className="data-[state=checked]:bg-[#f0d060]"
  />
</div>
```

---

## WHAT NEVER TO DO

1. Use emojis in UI — use Remixicon icons
2. Use `lucide-react` — use `@remixicon/react`
3. Hardcode color hex values — use CSS variables or the design token exceptions
4. Add card elevation (different bg shades for nested surfaces)
5. Use square/rectangular inputs — all single-line inputs are pills
6. Use green for payment amounts — amounts are always white
7. Overuse lemon — only Post CTA and Send button
8. Touch `packages/api/`, stores, hooks, or API client
9. Change route structure
10. Use `any` types or `@ts-ignore`
