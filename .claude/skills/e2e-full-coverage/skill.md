# E2E Full Coverage — Autonomous Test Runner

Autonomous skill that runs all Playwright E2E tests, auto-fixes failures, and loops until 0 failures across 5 consecutive cycles.

## Trigger

Use when: asked to run full E2E coverage, validate all user flows, or run the complete test suite.

## State File

Track all run state in `.claude/state/e2e-full-coverage-state.md`. Create it on first run, append each cycle's results.

## Process

### Step 1: Start Servers (if not running)

```bash
# Check if API is running
curl -s http://localhost:3001/api/v1/health | grep -q "ok" || (
  cd packages/api && npx nest start --watch &
  sleep 10
)

# Check if Next.js is running
curl -s http://localhost:3000 | grep -q "html" || (
  cd apps/web && npx next dev --port 3000 &
  sleep 10
)
```

### Step 2: Pre-warm Routes

Before running tests, warm these routes to trigger Next.js compilation (prevents 30s timeout on first access):

```bash
for route in /feed /messages /payments /notifications /settings /discover /broadcasts /organization; do
  curl -s http://localhost:3000$route -o /dev/null
done
sleep 3
```

### Step 3: Run Full Test Suite

```bash
npx playwright test --reporter=list 2>&1 | tee .claude/state/e2e-run-$(date +%s).log
```

Parse results: extract total, passed, failed, skipped counts.

### Step 4: On Failures — Auto-Fix and Retry

For each failing test:
1. Read the failure output (error message, screenshot path if any)
2. Identify root cause:
   - Selector not found → check if UI changed, update selector
   - API response mismatch → check if API endpoint changed
   - Timeout → add explicit wait or increase timeout
   - Import error → fix TypeScript compilation issue
3. Dispatch `dev-fix` agent with specific failure details
4. Re-run ONLY the failing spec: `npx playwright test --grep "test name" 2>&1`
5. If fixed, continue to next failure
6. If not fixed after 2 attempts, mark as BLOCKED and continue

### Step 5: Track State

Update `.claude/state/e2e-full-coverage-state.md` after each cycle:

```markdown
## Cycle N — [timestamp]
- Total: X
- Passed: Y
- Failed: Z
- Skipped: W
- Fixed: [list]
- Blocked: [list with reason]
```

### Step 6: Loop Until Zero Failures

- Run up to 5 full cycles
- Stop when: 0 failures across a complete run
- If still failures after 5 cycles: report all blocked items to user

## Reporting Format

After completion:
```
✅ E2E Full Coverage Complete
Cycles run: N
Final result: X passed, 0 failed, W skipped
```

Or if blocked:
```
⚠️ E2E Full Coverage — Blocked Items Remain
Cycles run: 5
Final result: X passed, Z failed
Blocked tests:
- test name: reason
```

## Rules

- Never give up after one failure — always attempt fixes
- Never mock, stub, or fake responses to make tests pass
- Selector updates are acceptable when UI legitimately changed
- Test logic fixes are acceptable for incorrect assertions
- Infrastructure changes (API contract changes) require escalation
- Always run against REAL servers with REAL data
- Rate limit awareness: tests run sequentially (not parallel) to avoid 429s
