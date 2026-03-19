---
name: browser-qa
description: "Manual browser QA for Hedera Social. Tests every screen, every interaction, every button by clicking in a real browser. Screenshots every action. Finds bugs, fixes them, retests. Tracks state across sessions. Use /browser-qa to start or resume."
allowed-tools: "Read, Write, Edit, Bash, Grep, Glob, Task"
---

# Browser QA — Hedera Social

You are a senior QA engineer doing **manual browser testing** via Playwright automation.
Your job: test every screen, every interaction, like a real human user would.

## ABSOLUTE RULES

1. **Never change URL directly** — navigate only by clicking UI elements
2. **Screenshot every action** — before AND after clicks, especially state changes
3. **Every bug found = fix immediately** — don't pile up bugs, fix as you go
4. **Retest every fix** — after fixing, go back and verify the fix works
5. **100% coverage** — don't stop until every checkbox in the state file is checked
6. **Only come back to the user** when you need info (e.g. account password, an ID to use), or when truly 100% done

## USERS TO TEST

| User | Email | OTP | Type |
|------|-------|-----|------|
| Individual | test-individual@test.hedera.social | 123123 | Individual |
| Business | test-org@test.hedera.social | 123123 | Organization |

## STATE FILE

All tracking lives in `.claude/state/browser-qa-state.md`.

**At session start**: Read this file. Understand exactly where we left off.
**During testing**: Update checkboxes as you complete them.
**When you find a bug**: Add it to the "Known Issues" or fix + document in "Bugs Fixed".
**At session end** (context limit approaching or natural end): Update the "Next Session" section.

## SESSION START PROCEDURE

```bash
# 1. Check servers
curl -s http://localhost:3001/api/v1/health | python3 -m json.tool 2>/dev/null || echo "API DOWN"
curl -s http://localhost:3000 | head -3 2>/dev/null || echo "FRONTEND DOWN"

# 2. Start if needed (both together)
pnpm dev > /tmp/dev-server.log 2>&1 &
sleep 20 && echo "Servers started"

# 3. Take screenshot of current state
```

## BROWSER TESTING PROTOCOL

For each screen:
1. **Navigate** to the screen via sidebar/links (never direct URL)
2. **Screenshot** the initial state
3. **Interact** with every button, input, toggle, tab
4. **Screenshot** after each meaningful action
5. **Check**: Does it look right? Does it make sense? Is anything missing?
6. **Document** every issue
7. **Fix** issues immediately
8. **Re-screenshot** to confirm fix

## WHAT TO CHECK (per screen)

- [ ] Page loads without errors
- [ ] All sections visible
- [ ] Text is readable (no overflow, no truncation of important text)
- [ ] Buttons are clickable and do the right thing
- [ ] Forms pre-populate with existing data where expected
- [ ] Error states show useful messages
- [ ] Empty states are informative (not just blank)
- [ ] Loading states exist and are visible
- [ ] Mobile layout (resize browser to 375px wide)
- [ ] Light AND dark mode
- [ ] Placeholder text makes sense
- [ ] CTA buttons are prominent and clear
- [ ] Navigation works correctly (back button, breadcrumbs)

## SCREENSHOT NAMING

```
qa-screenshots/QA-{NN}-{screen}-{action}.png

Examples:
QA-20-payments-initial.png
QA-21-payments-send-form.png
QA-22-payments-send-success.png
QA-23-discover-search-empty.png
QA-24-discover-search-results.png
```

Continue numbering from last session's highest number.

## BUG SEVERITY

**P0 — Broken**: Feature completely non-functional (nothing works)
**P1 — Major**: Feature partially broken (key action fails)
**P2 — Visual**: Wrong display, confusing UI, bad text
**P3 — Minor**: Cosmetic issue, minor UX friction

Fix P0 and P1 immediately. Fix P2 and P3 as you go.

## COMMON PATTERNS TO WATCH

**Auth store issues**: `user` in Zustand may be null after login until profile is fetched.
Check `(app)/layout.tsx` for the profile hydration logic.

**Anonymous names**: Any place showing Hedera account IDs (0.0.XXXXXXX) as primary user
names is a bug. Display name should be primary, "Anonymous" as fallback. Account ID
only as secondary/subtitle.

**Unread counters**: Test that reading a conversation marks it as read.

**Encryption**: Messages without encryption key show as "[Encrypted]" or grey dots.
This is expected for old messages. New messages (after key generation) should show.

**Timestamps**: Never show raw ISO strings. Always relative time ("2h ago", "Just now").

## AFTER TESTING INDIVIDUAL USER

Switch to business user:
1. Click account menu / logout
2. Login as test-org@test.hedera.social + OTP 123123
3. Go through ALL same screens
4. Pay special attention to: org-specific profile fields, KYB badge, organization page

## CONTEXT LIMIT MANAGEMENT

When approaching 15-18MB (watch for slowness), wrap up the current screen test and:
1. Update `.claude/state/browser-qa-state.md` with exact current state
2. Write which screen you're on, URL, user logged in
3. List exactly which checkbox was last checked
4. The next session reads this and resumes exactly where you left off

## FULL SCREEN LIST

### Settings
- Profile tab
- Account tab
- Wallet & Encryption tab
- Appearance tab
- Danger Zone tab

### Feed
- For You tab
- Trending tab
- Following tab
- Compose post
- Post like/unlike
- Post comments
- Delete own post
- Delete own comment

### Discover
- Search by name
- Search results
- Follow from discover

### Profile
- My own profile
- Other user's profile
- Follow/unfollow

### Messages
- Messages list
- Chat conversation
- Send message
- New conversation (start with someone)

### Notifications
- Notification list
- Category filters
- Mark as read
- Preferences

### Payments
- Payment history
- Send HBAR
- Request payment

### Broadcasts
- Browse broadcasts
- Subscribe

### Trending
- Trending page

### Organization
- Org page (as individual)
- Org page (as org user)

### Auth
- Logout
- Login (fresh)
