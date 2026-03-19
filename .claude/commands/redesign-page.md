# Redesign a Page

You are implementing the Hedera Social UI redesign for a specific page or component.

## FIRST: Load the skill
Read `.claude/skills/ui-redesign/SKILL.md` — this is your complete design rulebook.
Read `docs/superpowers/specs/2026-03-16-ui-redesign-design.md` — this is the full spec.

## THEN: Identify the target
The user will specify a page or component. Map it to:

| User says | Files to touch |
|-----------|---------------|
| `layout` or `shell` | `apps/web/src/components/layout/AppLayout.tsx`, `apps/web/src/app/(app)/layout.tsx` |
| `feed` or `home` | `apps/web/src/app/(app)/feed/page.tsx`, `apps/web/src/components/feed/PostCard.tsx`, `apps/web/src/components/feed/PostList.tsx`, `apps/web/src/components/feed/CreatePostForm.tsx` |
| `messages` | `apps/web/src/app/(app)/messages/page.tsx`, `apps/web/src/app/(app)/messages/[topicId]/page.tsx`, `apps/web/src/components/chat/` (all) |
| `payments` | `apps/web/src/app/(app)/payments/page.tsx`, `apps/web/src/components/payments/` (all) |
| `notifications` | `apps/web/src/app/(app)/notifications/page.tsx`, `apps/web/src/components/notifications/` (all) |
| `discover` | `apps/web/src/app/(app)/discover/page.tsx`, `apps/web/src/app/(app)/trending/page.tsx` |
| `profile` | `apps/web/src/app/(app)/profile/me/page.tsx`, `apps/web/src/app/(app)/profile/[accountId]/page.tsx`, `apps/web/src/components/profile/` |
| `settings` | `apps/web/src/app/(app)/settings/page.tsx` |
| `organization` | `apps/web/src/app/(app)/organization/` (all) |
| `auth` | `apps/web/src/app/(auth)/login/page.tsx`, `apps/web/src/app/(auth)/register/page.tsx`, `apps/web/src/app/(auth)/page.tsx` |
| `onboarding` | `apps/web/src/app/(auth)/onboarding/` (all) |

## WORKFLOW

1. **Read all files** listed above for the target page
2. **Identify preserved logic**: list every store hook, API call, event handler
3. **Implement the redesign** following the skill doc rules
4. **Type check**: `cd apps/web && pnpm tsc --noEmit`
5. **Fix errors** — do not move on with TypeScript errors
6. **Build check** (if full page complete): `pnpm build`
7. **Report** what was changed and what logic was preserved

## RULES SUMMARY (from skill)
- Pill-shaped all interactive controls (rounded-full)
- Lemon fill (#f0d060) only on Post CTA and Send payment button
- No emoji — Remixicon icons only
- No elevation — single #000 plane, borders only
- No lucide-react — @remixicon/react only
- Feed/Profile/Org tabs = lemon underline, not pill fill
- Amounts in notifications/transactions = white, font-weight: 500
- Never touch stores, API, hooks, route structure

## OUTPUT
After completing:
- List all files modified
- List all preserved logic (hooks, calls, handlers)
- Confirm TypeScript passes
- Note any design decisions made that weren't in the spec
