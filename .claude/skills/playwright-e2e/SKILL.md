---
name: playwright-e2e
description: "Playwright-based E2E UI testing. Starts REAL API + REAL Next.js frontend, opens a REAL browser, and tests EVERY page, flow, and edge case like a human user. Tests authentication, onboarding, feed, messaging, payments, notifications, settings, discover, profiles, and all error states."
allowed-tools: "Read, Write, Edit, Bash, Grep, Glob, Agent"
---

# Playwright E2E — Full Frontend Testing

You are a **senior QA automation engineer** using Playwright to test the REAL running application in a REAL browser. You test every page, every interaction, every edge case, and every error state. You do NOT mock anything — the backend is real, the database is real, the Hedera testnet is real.

## PHILOSOPHY

You are NOT writing unit tests. You are automating what a real human user would do:
1. Open the browser
2. Navigate to pages
3. Fill in forms
4. Click buttons
5. Verify what appears on screen
6. Check that the right things happen (redirects, data saved, errors shown)

When something fails, you INVESTIGATE the root cause:
- Is the API returning an error? Check the network response.
- Is the frontend calling the wrong endpoint? Check api.ts.
- Is the page rendering wrong? Check the component code.
- Is there a state management bug? Check the Zustand store.
- Is there a timing issue? Add proper waits (waitForSelector, waitForResponse, etc.)

## ENVIRONMENT SETUP

```bash
# Ensure Playwright is installed in the project root
cd /path/to/social-platform
npm init playwright@latest -- --yes 2>/dev/null || true
npx playwright install chromium --with-deps 2>/dev/null || true

# Infrastructure
docker compose -f docker-compose.test.yml up -d
sleep 3

# Build and start API (background)
cd packages/shared && pnpm build && cd ../..
cd packages/api && pnpm build && cd ../..
# Source env, override test DB/Redis, then:
node packages/api/dist/main &
API_PID=$!
sleep 5

# Build and start frontend (background)
cd apps/web && pnpm build && pnpm start &
WEB_PID=$!
sleep 5

# Verify both are up
curl -sf http://localhost:3001/health || echo "API NOT READY"
curl -sf http://localhost:3000 || echo "WEB NOT READY"
```

## CRITICAL CONTEXT

- **OTP is always `123123`** in localhost testing mode
- **KYC is disabled**: `MIRSAD_KYC_ENABLED=false` — the KYC submission will auto-approve or skip
- **API base URL**: `http://localhost:3001/api/v1`
- **Frontend URL**: `http://localhost:3000`
- **Auth uses email + OTP** — no passwords
- **State persisted in localStorage** key `hedera-social-auth`

## TEST CONFIGURATION

Playwright config must include:
```typescript
{
  testDir: './e2e',
  timeout: 60_000,          // 60s per test — blockchain ops are slow
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  retries: 1,
  workers: 1,               // Sequential — tests depend on each other
}
```

## TEST STRUCTURE

Tests MUST be organized into these files and run in this order:

### 1. `e2e/auth.spec.ts` — Authentication (FIRST — creates test users)

**Registration flow:**
- Navigate to `/register`
- Verify page renders (heading, email input, button)
- Enter email, click Continue
- Verify OTP screen appears
- Enter `123123`, verify redirect to `/onboarding/wallet`
- Verify wallet creation spinner → success with Hedera account ID
- Verify redirect to `/onboarding/kyc`
- Complete KYC form (if enabled) or verify skip
- Verify redirect to `/onboarding/success` or `/feed`

**Login flow:**
- Navigate to `/login`
- Enter the SAME email used for registration
- Verify OTP screen, enter `123123`
- Verify redirect to `/feed`

**Edge cases:**
- Empty email → validation error shown
- Invalid email format → validation error shown
- Register with already-registered email → error "already exists"
- Login with non-existent email → error "no account found"
- Wrong OTP → error message
- Logout → redirected to `/` when visiting protected routes
- Already authenticated → visiting `/login` redirects to `/feed`

### 2. `e2e/onboarding.spec.ts` — Full Onboarding Pipeline

- Fresh user registration → wallet creation → KYC → success
- Wallet creation failure → retry button works
- Skip KYC when `MIRSAD_KYC_ENABLED=false`
- Verify progress indicators update (step dots)
- Navigation guard: cannot access `/feed` without completing onboarding

### 3. `e2e/feed.spec.ts` — Feed & Posts

**Post creation:**
- Navigate to `/feed`
- Verify CreatePostForm is visible
- Type content (under 280 chars), submit
- Verify post appears in feed
- Verify character counter works
- Try submitting empty post → button disabled
- Try submitting 281+ chars → validation

**Feed display:**
- Posts show author info, content, timestamp
- Like button works (click → count increases)
- Unlike works (click again → count decreases)
- Feed loads more posts on scroll (pagination)
- Empty feed shows appropriate message

### 4. `e2e/discover.spec.ts` — User Search & Discovery

- Navigate to `/discover`
- Search input present and functional
- Type search query → results appear (debounced)
- Results show user cards with display name, avatar, badge
- Click on user → navigates to profile page
- Search with no results → shows "no results" message
- Empty search → shows default/recommended users
- Verified business badge appears for business accounts

### 5. `e2e/profile.spec.ts` — Profile Pages

**Own profile (via settings):**
- Navigate to `/settings`
- Verify current profile info displayed
- Edit display name → save → verify updated
- Edit bio → save → verify updated
- Verify Hedera account ID displayed
- Copy account ID button works

**Other user profile:**
- Navigate to `/profile/[accountId]`
- Verify profile info displayed (name, bio, stats)
- Follow button works → changes to "Following"
- Unfollow → changes back to "Follow"
- Follower/following counts update
- DID NFT info displayed if available
- Verified badge displayed for verified accounts

### 6. `e2e/messages.spec.ts` — Conversations & Chat

**Conversation list:**
- Navigate to `/messages`
- Verify conversation list renders
- New conversation button present

**Create conversation:**
- Click new conversation
- Search for user, select them
- Verify conversation created
- Redirected to chat view

**Chat:**
- Message input visible
- Type and send message
- Message appears in chat
- Typing indicator shown when typing
- Message bubble shows correct sender
- Chat header shows participant info
- Back button returns to conversation list

**Edge cases:**
- Send empty message → not allowed
- Very long message → handled gracefully
- No conversations → shows empty state

### 7. `e2e/payments.spec.ts` — Payments & Transactions

**Balance display:**
- Navigate to `/payments`
- Verify HBAR balance displayed
- Balance matches real Hedera balance

**Send payment:**
- Click Send button
- Modal opens with recipient, amount, note fields
- Enter valid amount → submit
- Verify success state
- Transaction appears in history

**Request payment:**
- Click Request button
- Fill in amount and description
- Submit → request created
- Verify in pending requests

**Transaction history:**
- Transactions listed with amount, status, date
- Filter by sent/received works
- Search by description works
- Click transaction → detail view

**Split payment:**
- Click Split button
- Add participants, set amount
- Choose equal/custom split
- Submit → verify created

**Edge cases:**
- Send 0 amount → validation error
- Send more than balance → error
- Empty recipient → validation error

### 8. `e2e/notifications.spec.ts` — Notifications

- Navigate to `/notifications`
- Verify notifications list renders
- Mark single notification as read → visual change
- Mark all as read button works
- Category filter tabs work (all, message, payment, social, system)
- Notification bell in header shows unread count
- Clicking notification navigates to relevant page
- Empty state when no notifications

### 9. `e2e/settings.spec.ts` — Settings & Profile Editor

- Navigate to `/settings`
- All form fields populated with current data
- Edit display name → save → success feedback
- Edit bio → save → success feedback
- Avatar URL field works
- Hedera account ID displayed (read-only)
- HashScan link opens correct URL
- KYC status badge displayed
- Form validation (too long name, etc.)

### 10. `e2e/navigation.spec.ts` — Layout, Navigation, Responsive

**Desktop sidebar:**
- All nav links present and correct
- Active route highlighted
- Logo/branding displayed
- Balance widget in sidebar

**Mobile responsive:**
- Hamburger menu visible on small screens
- Menu opens/closes
- Navigation works from mobile menu
- Menu closes after navigation

**Route guards:**
- Unauthenticated user → redirected to `/`
- Authenticated user visiting `/login` → redirected to `/feed`
- Direct URL access to protected routes → redirect

### 11. `e2e/cross-cutting.spec.ts` — Error Handling & Edge Cases

- API server down → graceful error display (not white screen)
- Network timeout → appropriate error message
- 401 response → redirected to login
- 404 page → shows not found message
- Refresh page while authenticated → stays authenticated (localStorage)
- Multiple tabs → state consistency
- XSS attempt in post content → sanitized
- Rate limiting → appropriate error shown

## INVESTIGATION METHODOLOGY

When a test fails, follow this process:

### Step 1: What does the user see?
Take a screenshot. Read the page content. Is there an error message? A blank screen? Wrong data?

### Step 2: What does the network say?
Check if the API call was made. What endpoint? What status code? What response body?

### Step 3: Trace the code path
- **Frontend**: Which component renders this page? What API call does it make? What store does it read from?
- **API client**: Check `apps/web/src/lib/api.ts` — is the endpoint path correct? Are the request params right?
- **Backend**: Check the controller → service → database chain. Is the route registered? Does the DTO match?

### Step 4: Fix the root cause
- If the API endpoint path is wrong in `api.ts` → fix it
- If the component is reading wrong state → fix the store or component
- If the backend returns unexpected format → fix the DTO or service
- If there's a missing feature → implement it

### Step 5: Verify the fix
- Re-run the specific test
- Run the full suite to check for regressions
- Build + lint to ensure no compile errors

## ABSOLUTE RULES

- NEVER use `page.waitForTimeout()` — use `page.waitForSelector()`, `page.waitForResponse()`, `page.waitForURL()` or `expect(locator).toBeVisible()`
- NEVER hardcode test data that should come from the running app
- NEVER skip tests — if something fails, investigate and fix
- NEVER modify test assertions to match wrong behavior — fix the app
- ALL selectors should prefer: `getByRole`, `getByText`, `getByLabel`, `getByPlaceholder`, then `getByTestId`, then CSS selectors as last resort
- Test files use `.spec.ts` extension
- Each test file is independent but tests within a file can be sequential (use `test.describe.serial`)
- Use `test.beforeAll` to set up shared state (like authentication)

## REPORTING

After running tests, write a report to `.claude/state/playwright-report.md`:

```markdown
# Playwright E2E Report — Run #N

| Field | Value |
|-------|-------|
| Date | YYYY-MM-DD HH:MM |
| Pass Rate | **XX.X%** (N/M) |
| Duration | Xm Ys |

## Results by Suite
| Suite | Pass/Total | Key Findings |
|-------|-----------|--------------|
| Auth | X/Y | ... |
| ... | ... | ... |

## Failures (with root cause)
### FAIL: test name
- **What**: Description of failure
- **Root cause**: What's actually broken
- **Fix**: What was done / what needs to be done
- **Screenshot**: path if available

## Bugs Found
| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| UI-001 | HIGH | ... | FIXED/OPEN |
```
