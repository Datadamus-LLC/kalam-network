---
name: redesign-orchestrate
description: >
  Master orchestrator for the Hedera Social UI/UX redesign. Tracks progress,
  validates design rule compliance, checks functional coverage, audits BE API gaps,
  runs build/lint/E2E tests, and assigns the next task. Run this at the start of
  every redesign session and after completing each phase. This is the single source
  of truth for redesign health.
  Triggers on: redesign status, redesign progress, redesign validate, check redesign,
  what's next redesign, UI compliance, design rules check.
---

# Hedera Social — Redesign Orchestrator

You are the orchestrator for the Hedera Social UI redesign.
Run ALL phases in order. Never skip a phase. Fix issues before moving forward.

**Core references:**
- Spec: `docs/superpowers/specs/2026-03-16-ui-redesign-design.md`
- Implementation skill: `.claude/skills/ui-redesign/SKILL.md`
- Progress state: `.claude/state/redesign-progress.md`
- Per-phase test files: `e2e/redesign-phase{N}-*.spec.ts`
- Command: `/redesign-page <page>`

---

## PHASE 0 — Read State

```bash
cat .claude/state/redesign-progress.md
```

Identify:
1. Which phases are DONE vs TODO
2. Any known issues or blockers
3. The last validation results
4. Any BE gaps previously found

Determine the **current active phase** — the first phase marked TODO.

---

## PHASE 1 — Build Validation

Run in this exact order. Stop and fix any failures before continuing.

### 1a. TypeScript
```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | head -50
```
**Pass:** zero errors.
**Fail:** read each error, identify root cause, fix, re-run.

### 1b. Lint
```bash
cd apps/web && pnpm lint 2>&1 | head -50
```
**Pass:** zero errors (warnings acceptable but document them).
**Fail:** fix lint errors.

### 1c. Build
```bash
cd apps/web && pnpm build 2>&1 | tail -20
```
**Pass:** successful build output, no webpack errors.
**Fail:** read error, fix, re-run.

---

## PHASE 2 — Design Compliance Audit

Run these checks against ALL redesigned files (phases that are DONE).
For each check: report violations by file + line number.

### 2a. No lucide-react imports
```bash
grep -rn "from 'lucide-react'" apps/web/src/ 2>/dev/null
grep -rn "from \"lucide-react\"" apps/web/src/ 2>/dev/null
```
**Pass:** zero results.
**Fail:** list each file. These must be replaced with `@remixicon/react` equivalents.

### 2b. No hardcoded hex colors (should use CSS vars)
```bash
grep -rn "style={{" apps/web/src/app/ apps/web/src/components/ 2>/dev/null | grep -E "color: '#|background: '#|backgroundColor: '#" | grep -v "node_modules"
```
Also check for hardcoded Tailwind hex classes:
```bash
grep -rn "bg-\[#" apps/web/src/ 2>/dev/null | grep -v "f0d060\|2d2d2d\|0f1419\|000000\|e0245e\|00ba7c" | head -20
grep -rn "text-\[#" apps/web/src/ 2>/dev/null | grep -v "f0d060\|000\|fff" | head -20
```
**Acceptable hex exceptions:** `#f0d060` (lemon), `#2d2d2d` (light mode button), `#000`, `#fff`, `#0f1419`, `#e0245e` (red like), `#00ba7c` (green confirmed), `rgba` values.
**Fail:** anything else is a hardcoded color. Replace with CSS variable.

### 2c. Lemon used only on Post + Send buttons
```bash
grep -rn "f0d060\|lemon" apps/web/src/ 2>/dev/null | grep -v "\.md\|globals\.css\|\.test\.\|spec\." | head -40
```
For each result, verify it is ONLY used on:
- Post CTA button in sidebar
- Send/Pay button in payment dialog / chat payment card
- Notification dot (lemon dot indicator, acceptable)
- Unread count pill background (acceptable as `rgba(240,208,96,0.1)`)
- KYC badge background tint (acceptable as `rgba(240,208,96,0.1)`)
**Fail:** lemon as a fill on any other element. Report and fix.

### 2d. No emojis in JSX
```bash
grep -rn "🏠\|💬\|💸\|🔔\|🔍\|❤️\|✓\|📎\|🖼\|📍\|✨\|🎉\|⚡\|🚀" apps/web/src/ 2>/dev/null | grep -v "\.md\|\.test\.\|spec\." | head -20
```
**Pass:** zero results.
**Fail:** replace every emoji with the equivalent `@remixicon/react` icon.

### 2e. All interactive controls use rounded-full (pill)
Check that buttons and inputs in redesigned components use `rounded-full`:
```bash
grep -rn "<Button\|<Input\|<Select\|<button\|<input" apps/web/src/components/ apps/web/src/app/ 2>/dev/null | grep -v "rounded-full\|rounded-\[999" | grep -v "Textarea\|textarea\|\.test\.\|\.md\|spec\." | head -30
```
**Note:** `Textarea` is exempt (uses `rounded-[14px]`). OTP cells use `rounded-[12px]`. Cards use `rounded-[14px]` or `rounded-[16px]`.
**Fail:** any interactive control missing pill radius.

### 2f. No elevation (no bg-card on non-dialog surfaces)
```bash
grep -rn "bg-card\|bg-muted\b" apps/web/src/components/ apps/web/src/app/\(app\)/ 2>/dev/null | grep -v "\.test\.\|\.md\|spec\." | head -20
```
**Acceptable:** `bg-card` inside `<Dialog>` components only.
**Fail:** `bg-card` or `bg-muted` used as container backgrounds outside dialogs.

### 2g. Remixicon usage (confirm icons are from correct lib)
```bash
grep -rn "from '@remixicon/react'" apps/web/src/ 2>/dev/null | wc -l
grep -rn "from 'lucide-react'" apps/web/src/ 2>/dev/null | wc -l
```
Should see: remixicon imports > 0 (in redesigned files), lucide-react = 0.

### Compliance Report
After all checks, produce a table:

| Check | Status | Violations |
|-------|--------|------------|
| No lucide-react | ✅/❌ | N files |
| No hardcoded colors | ✅/❌ | N instances |
| Lemon only on 2 buttons | ✅/❌ | N violations |
| No emojis in JSX | ✅/❌ | N instances |
| Pill controls everywhere | ✅/❌ | N missing |
| No elevation | ✅/❌ | N violations |

**If any check fails:** use `/redesign-page <affected-page>` to fix before continuing.

---

## PHASE 3 — Per-Phase Playwright Tests

**This phase is mandatory for every completed redesign phase.**
Each phase has a dedicated test file: `e2e/redesign-phase{N}-*.spec.ts`

### 3a. Check services are running

Check if the API is running:
```bash
npx tsx -e "fetch('http://localhost:3001/api/v1/health').then(r=>r.ok?console.log('API OK'):console.log('API DOWN')).catch(()=>console.log('API DOWN'))"
```

Check if the frontend is running:
```bash
npx tsx -e "fetch('http://localhost:3000').then(r=>console.log('FRONTEND OK')).catch(()=>console.log('FRONTEND DOWN'))"
```

If API is down: tell the user to start the API (`pnpm dev` from `packages/api`). Do NOT proceed until it's up.
If frontend is down: start it — `cd apps/web && pnpm dev &` — wait 10 seconds before proceeding.

### 3b. Ensure test-screenshots directory exists
```bash
mkdir -p test-screenshots
```

### 3c. Run per-phase tests (targeted — FAST)

**Run ONLY the tests for completed phases:**
```bash
cd /Users/bedtreep/Documents/GitHub/social-platform
npx playwright test e2e/redesign-phase1-layout.spec.ts --reporter=list 2>&1 | tail -40
```

For multiple completed phases:
```bash
npx playwright test "e2e/redesign-phase*.spec.ts" --reporter=list 2>&1 | tail -40
```

**Pass criteria per phase:**
- Phase 1 (Layout): auth guard, dark theme, sidebar structure, Post button lemon, nav active state, mobile menu, collapsed rail, logout, screenshots at 375/768/1280px — ALL pass
- Phase 2 (Feed): feed renders, post creation form visible, tabs present, post card structure
- Phase 3 (Payments): transaction list, filter controls, send/request buttons
- Phase 4 (Notifications): list renders, category filters, mark-read works
- Phase 5 (Messages): conversation list, collapsed rail verified, message input
- Phase 6 (Discover): search input, user cards
- Phase 7 (Profile): header renders, stats, follow button
- Phase 8 (Settings): sections render, save button
- Phase 9 (Organization): org details, member list
- Phase 10 (Auth): login form, register form, OTP screen

**If any test fails:**
1. Read the failure output carefully
2. If it's a selector mismatch (button text changed): update the test — this is acceptable
3. If it's a functional regression (nav link broken, form doesn't submit): fix the component
4. Never skip or comment out a failing test — fix the root cause
5. Re-run after fixing

### 3d. Check screenshots were created
```bash
ls -la test-screenshots/phase*.png 2>/dev/null | head -20
```
Screenshots must exist for every completed phase at 3 resolutions (mobile/tablet/desktop).
If missing: the test ran but screenshot capture failed — investigate.

---

## PHASE 4 — Multi-Resolution Smoke Tests

Verify the core user flows still work after redesign, at each viewport.

### 4a. Run the smoke test suite
```bash
cd /Users/bedtreep/Documents/GitHub/social-platform
npx playwright test e2e/redesign-smoke.spec.ts --reporter=list 2>&1 | tail -40
```

The smoke test file (`e2e/redesign-smoke.spec.ts`) must exist. If it doesn't, create it with the template below.

### Smoke Test File Template (`e2e/redesign-smoke.spec.ts`)

This file is created once and never modified per phase — it tests the complete redesigned app end-to-end:

```typescript
/**
 * Redesign Smoke Tests — runs after every phase to verify no regression.
 * Tests core user flows at 3 resolutions: mobile (375), tablet (768), desktop (1280).
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth } from './helpers';

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

let authData: { email: string; token: string; refreshToken: string; hederaAccountId: string };

test.beforeAll(async () => {
  authData = await registerUserViaApi('smoke');
});

for (const vp of VIEWPORTS) {
  test.describe(`Smoke — ${vp.name} (${vp.width}×${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test.beforeEach(async ({ page }) => {
      await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    });

    test('auth guard: unauthenticated → redirect to /', async ({ page }) => {
      await page.context().clearCookies();
      await page.evaluate(() => localStorage.clear());
      await page.goto('/feed');
      await page.waitForURL('/', { timeout: 10_000 });
    });

    test('feed page loads with content area', async ({ page }) => {
      await page.goto('/feed');
      await page.waitForURL(/feed/, { timeout: 15_000 });
      await expect(page.locator('main')).toBeVisible();
      await page.screenshot({ path: `test-screenshots/smoke-feed-${vp.name}.png` });
    });

    test('navigate to discover page', async ({ page }) => {
      await page.goto('/feed');
      await page.waitForURL(/feed/);
      if (vp.width >= 768) {
        await page.getByRole('navigation').getByRole('link', { name: 'Discover', exact: true }).click();
      } else {
        await page.getByRole('button', { name: 'Open menu' }).click();
        await page.getByRole('link', { name: 'Discover', exact: true }).first().click();
      }
      await page.waitForURL(/discover/, { timeout: 10_000 });
      await page.screenshot({ path: `test-screenshots/smoke-discover-${vp.name}.png` });
    });

    test('navigate to notifications page', async ({ page }) => {
      await page.goto('/feed');
      await page.waitForURL(/feed/);
      if (vp.width >= 768) {
        await page.getByRole('navigation').getByRole('link', { name: 'Notifications', exact: true }).click();
      } else {
        await page.getByRole('button', { name: 'Open menu' }).click();
        await page.getByRole('link', { name: 'Notifications', exact: true }).first().click();
      }
      await page.waitForURL(/notifications/, { timeout: 10_000 });
      await page.screenshot({ path: `test-screenshots/smoke-notifications-${vp.name}.png` });
    });

    test('navigate to payments page', async ({ page }) => {
      await page.goto('/feed');
      await page.waitForURL(/feed/);
      if (vp.width >= 768) {
        await page.getByRole('navigation').getByRole('link', { name: 'Payments', exact: true }).click();
      } else {
        await page.getByRole('button', { name: 'Open menu' }).click();
        await page.getByRole('link', { name: 'Payments', exact: true }).first().click();
      }
      await page.waitForURL(/payments/, { timeout: 10_000 });
      await page.screenshot({ path: `test-screenshots/smoke-payments-${vp.name}.png` });
    });

    test('navigate to settings page', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForURL(/settings/, { timeout: 10_000 });
      await expect(page.locator('main')).toBeVisible();
      await page.screenshot({ path: `test-screenshots/smoke-settings-${vp.name}.png` });
    });

    test('logout flow works', async ({ page }) => {
      await page.goto('/feed');
      await page.waitForURL(/feed/);
      if (vp.width >= 768) {
        // Click user row ··· dropdown
        const userRowBtn = page.getByRole('complementary').locator('button').last();
        await userRowBtn.click();
        await page.getByRole('menuitem', { name: /log out/i }).click();
      } else {
        await page.getByRole('button', { name: 'Open menu' }).click();
        await page.getByRole('button', { name: /log out/i }).click();
      }
      await page.waitForURL('/', { timeout: 10_000 });
    });
  });
}
```

### 4b. Pass criteria

**All viewports × all smoke tests must pass.**
- Mobile (375px): hamburger nav works, all pages reachable, logout works
- Tablet (768px): sidebar visible, all pages reachable, logout works
- Desktop (1280px): full sidebar, all pages reachable, logout works
- Screenshots created for all 5 pages × 3 viewports = 15 screenshots minimum

If any smoke test fails at any resolution:
1. Identify which viewport is broken
2. Fix the responsive CSS/logic
3. Re-run

---

## PHASE 5 — BE Coverage Gap Analysis

For each UI feature that has been or will be implemented, verify the required API endpoint exists and returns the needed data shape.

Read the API client to confirm endpoints:
```bash
grep -n "async " apps/web/src/lib/api.ts | head -60
```

### Coverage Matrix

Check each item. Mark ✅ COVERED, ⚠️ PARTIAL, or ❌ MISSING.

#### Feed
| UI Feature | Required API | Status | Notes |
|-----------|-------------|--------|-------|
| "For you" feed | `GET /posts/feed` | Check | Does it return personalized/following content? |
| "Following" tab | `GET /posts/feed?filter=following` | Check | Does a following filter exist? |
| "Trending" tab | `GET /posts/trending` | ✅ | Exists in api.ts |
| Create post | `POST /posts` | ✅ | Exists |
| Like / unlike | `POST/DELETE /posts/:id/like` | ✅ | Exists |
| Comments | `GET/POST /posts/:id/comments` | ✅ | Exists |

#### Feed Right Panel
| UI Feature | Required API | Status | Notes |
|-----------|-------------|--------|-------|
| Balance widget | `GET /payments/balance` | ✅ | Exists |
| "Who to follow" suggestions | `GET /users/suggestions` | ❌ | Missing — UI adapts |
| Send payment from right panel | `POST /payments/send` | ✅ | Exists |

#### Messages
| UI Feature | Required API | Status | Notes |
|-----------|-------------|--------|-------|
| Conversation list | `GET /conversations` | ✅ | Exists |
| Send message | `POST /conversations/:topicId/messages` | ✅ | Exists |
| Online status | WebSocket `server_user_online/offline` | ✅ | Exists |
| Typing indicator | WebSocket `server_typing` | ✅ | Exists |
| Unread count per conversation | `GET /conversations` | ✅ | unreadCount in DTO |
| Payment request in chat | `POST /conversations/:topicId/payment-requests` | ✅ | Exists |

#### Notifications
| UI Feature | Required API | Status | Notes |
|-----------|-------------|--------|-------|
| Notification list | `GET /notifications` | ✅ | Exists |
| Mark as read | `POST /notifications/read` | ✅ | Exists |
| Category filter | `GET /notifications?category=X` | ✅ | Param supported |
| Real-time notifications | WebSocket `server_notification` | ✅ | Exists |
| Notification preferences | `PUT /users/notification-preferences` | ❌ | Missing — localStorage only |

#### Payments
| UI Feature | Required API | Status | Notes |
|-----------|-------------|--------|-------|
| Transaction history | `GET /payments/history` | ✅ | Exists |
| Filter by direction | `GET /payments/transactions?direction=sent` | ✅ | Exists |
| Filter by status | `GET /payments/transactions?status=confirmed` | ✅ | Exists |
| Search transactions | `GET /payments/transactions?search=X` | ✅ | search param exists |
| Date range filter | `GET /payments/transactions?from=X&to=Y` | ✅ | Exists |
| Pending requests | `GET /payments/requests` | ✅ | Exists |

#### Discover
| UI Feature | Required API | Status | Notes |
|-----------|-------------|--------|-------|
| Search users | `GET /users/search?q=X` | ✅ | Exists |
| "KYC verified" filter | `GET /users/search?kycLevel=verified` | ❌ | Not supported |
| "Organizations" filter | `GET /users/search?accountType=business` | ❌ | Not supported |
| Suggested users | `GET /users/suggestions` | ❌ | Missing — UI adapts |
| Trending posts (right panel) | `GET /posts/trending` | ✅ | Exists |

#### Profile
| UI Feature | Required API | Status | Notes |
|-----------|-------------|--------|-------|
| Profile data | `GET /profile/:accountId` | ✅ | Exists |
| Profile stats (followers/following) | `GET /profile/:accountId` | ✅ | FollowerCountEntity |
| User's posts | `GET /posts/user/:accountId` | ✅ | Exists |
| Update profile | `PUT /profile/me` | ✅ | Exists |
| Follow/unfollow | `POST /social/follow`, `POST /social/unfollow` | ✅ | Exists |

#### Settings
| UI Feature | Required API | Status | Notes |
|-----------|-------------|--------|-------|
| Update profile fields | `PUT /profile/me` | ✅ | Exists |
| Theme preference | localStorage only | ✅ | No BE needed |
| Notification preferences | ❌ | Missing — localStorage only |

#### Organization
| UI Feature | Required API | Status | Notes |
|-----------|-------------|--------|-------|
| Get org | `GET /organizations/me` | ✅ | Exists |
| Update org | `PUT /organizations/me` | ✅ | Exists |
| Members list | `GET /organizations/me/members` | ✅ | Exists |
| Invite member | `POST /organizations/me/invitations` | ✅ | Exists |
| Change role | `PUT /organizations/me/members/:userId/role` | ✅ | Exists |
| Remove member | `DELETE /organizations/me/members/:userId` | ✅ | Exists |
| Publish broadcast | `POST /broadcasts/:orgId` | ✅ | Exists |
| Broadcast feed | `GET /broadcasts/feed/subscribed` | ✅ | Exists |

### Gap Report

Produce a prioritized list of gaps not yet addressed. For items classified as **B (BE needs fix)**, create a task and use `/dev-implement` to add the endpoint/field.

---

## PHASE 6 — Progress Update & Next Task Assignment

Update `.claude/state/redesign-progress.md`:
```
Read .claude/state/redesign-progress.md
```
Mark any phases that have been verified as completed. Update the validation run date. Include test results.
Fix any notes on issues found.

Update the Last Validation Run block with:
- TypeScript result
- Lint result
- Build result
- Per-phase tests result (pass/fail counts)
- Smoke tests result (pass/fail at each viewport)
- Screenshot count

Then determine the next task:

```
NEXT TASK:
Phase N — [Phase Name]
Command: /redesign-page [page-name]
Files: [list of files to touch]
Test file to create: e2e/redesign-phase{N}-[page].spec.ts
Blocked by: [any unresolved issues from this run]
```

---

## PHASE 7 — Full Report

Output a structured report:

```
═══════════════════════════════════════════
HEDERA SOCIAL REDESIGN — STATUS REPORT
Date: [today]
═══════════════════════════════════════════

PROGRESS
────────
Completed: X/12 phases
In progress: Phase N — [name]
Remaining: Y phases

BUILD HEALTH
────────────
TypeScript:  ✅ PASS / ❌ FAIL (N errors)
Lint:        ✅ PASS / ❌ FAIL (N errors)
Build:       ✅ PASS / ❌ FAIL

DESIGN COMPLIANCE
─────────────────
lucide-react:       ✅ Clean / ❌ N violations
Hardcoded colors:   ✅ Clean / ❌ N violations
Lemon discipline:   ✅ Clean / ❌ N violations
No emojis:          ✅ Clean / ❌ N violations
Pill controls:      ✅ Clean / ❌ N violations
No elevation:       ✅ Clean / ❌ N violations

PER-PHASE TESTS
───────────────
Phase 1 (Layout):  ✅ N/N passing / ❌ N failing
Phase 2 (Feed):    ✅ N/N passing / ❌ N failing
[...etc for each completed phase]
Screenshots:       N files created

MULTI-RESOLUTION SMOKE TESTS
─────────────────────────────
Mobile  (375px):  ✅ N/N passing / ❌ N failing
Tablet  (768px):  ✅ N/N passing / ❌ N failing
Desktop (1280px): ✅ N/N passing / ❌ N failing

BE COVERAGE GAPS
────────────────
Critical:    N gaps
Nice-to-have: N gaps
No action:   N items

TOP CRITICAL GAPS:
1. [gap description + recommended fix]
2. [gap description + recommended fix]

NEXT ACTION
───────────
[If build failing]: Fix TypeScript/lint errors first
[If compliance failing]: Run /redesign-page [page] to fix [specific issue]
[If phase tests failing]: Fix regression in [component], update selector if layout changed
[If smoke tests failing at resolution]: Fix responsive CSS for [viewport]
[If screenshots missing]: Investigate screenshot capture in test
[If BE gap critical]: Run /dev-implement to add [endpoint]
[If all green]: Run /redesign-page [next-phase-page]
═══════════════════════════════════════════
```

---

## VALIDATION RULES (never compromise)

1. **Never skip a phase** — each phase catches different issues
2. **Never mark a phase complete** unless TypeScript + build + per-phase tests + smoke tests ALL pass
3. **Never weaken tests** — if selectors changed, update them; if functionality broke, fix the code; never skip or comment out failing tests
4. **Per-phase tests are required** — no phase is complete without a passing `e2e/redesign-phase{N}-*.spec.ts` file
5. **All 3 resolutions must pass** — mobile (375px), tablet (768px), desktop (1280px)
6. **Screenshots must exist** — visual proof for every phase at every resolution
7. **BE gaps are real bugs** — if the UI promises a feature the API can't deliver, that's a bug
8. **Design rules are hard rules** — lemon on 2 buttons only, pills everywhere, no lucide-react
9. **Functional coverage takes precedence** — a beautiful page that doesn't work is worse than an ugly page that does
