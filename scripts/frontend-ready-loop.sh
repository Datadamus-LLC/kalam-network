#!/usr/bin/env bash
# =============================================================
# FRONTEND-READY LOOP — Continuous UI Testing & Fixing
# =============================================================
# Playwright-based pipeline that tests every page, interaction,
# and edge case in the frontend. Finds failures, traces root
# causes (frontend or backend), fixes them, and re-tests.
#
# PHASES PER CYCLE:
#   1. PLAYWRIGHT E2E — Run full Playwright test suite
#   2. INVESTIGATE & FIX — Trace failures, fix root causes
#   3. SCOPE VALIDATION — Check all pages/features vs spec
#   4. BUILD & LINT — Ensure no regressions (tsc, lint, build)
#   5. RULES CHECK — Verify compliance with project rules
#   6. VERIFICATION E2E — Re-run Playwright, measure improvement
#
# EXIT CONDITIONS:
#   - 100% Playwright pass rate → SUCCESS
#   - No improvement for 3 consecutive cycles → PLATEAU
#   - Max cycles exhausted → report what's left
#
# Usage:
#   ./scripts/frontend-ready-loop.sh                # defaults: 20 cycles
#   ./scripts/frontend-ready-loop.sh 30             # 30 cycles
#   ./scripts/frontend-ready-loop.sh 20 400         # 20 cycles, 400 turns/phase
#
set -euo pipefail

MAX_CYCLES=${1:-20}
TURNS=${2:-400}

# State files
E2E_REPORT=".claude/state/playwright-report.md"
FIX_REPORT=".claude/state/frontend-fix-report.md"
SCOPE_REPORT=".claude/state/frontend-scope-report.md"
RULES_REPORT=".claude/state/frontend-rules-report.md"
PIPELINE_LOG=".claude/state/frontend-ready-log.md"
PIPELINE_STATUS=".claude/state/frontend-pipeline-status.md"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

# ─── Banner ─────────────────────────────────────────────────
echo -e "${MAGENTA}${BOLD}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║       FRONTEND-READY LOOP — Playwright UI Testing            ║"
echo "║   E2E → Fix → Scope → Build → Rules → Verify → Repeat       ║"
echo "╠═══════════════════════════════════════════════════════════════╣"
echo -e "║  Max cycles:    ${MAX_CYCLES}$(printf '%*s' $((44 - ${#MAX_CYCLES})) '')║"
echo -e "║  Turns/phase:   ${TURNS}$(printf '%*s' $((44 - ${#TURNS})) '')║"
echo -e "║  Target:        100% Playwright pass rate                    ║"
echo -e "║  Exit:          100% pass OR 3 cycles no improvement        ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── Preflight checks ──────────────────────────────────────
if ! command -v claude &> /dev/null; then
  echo -e "${RED}ERROR: 'claude' CLI not found.${NC}"
  exit 1
fi

if [ ! -f "CLAUDE.md" ]; then
  echo -e "${RED}ERROR: Run from project root (where CLAUDE.md is).${NC}"
  exit 1
fi

if [ ! -f ".env" ]; then
  echo -e "${RED}ERROR: .env not found.${NC}"
  exit 1
fi

mkdir -p .claude/state

# ─── Cleanup on exit ──────────────────────────────────────────
cleanup() {
  echo -e "${YELLOW}[cleanup] Stopping servers...${NC}"
  kill_frontend 2>/dev/null
  kill_backend 2>/dev/null
  echo -e "${GREEN}[cleanup] Done. Run 'pnpm dev' to restart in dev mode.${NC}"
}
trap cleanup EXIT

# ─── Initialize pipeline log ────────────────────────────────
cat > "$PIPELINE_LOG" << HEADER
# Frontend-Ready Pipeline Log

Started: $(date '+%Y-%m-%d %H:%M:%S')
Max cycles: ${MAX_CYCLES}
Turns per phase: ${TURNS}
Target: 100% Playwright pass rate

---

HEADER

# ─── Infrastructure ──────────────────────────────────────────
ensure_infra() {
  echo -e "${CYAN}[infra] Checking Docker...${NC}"
  if ! docker compose -f docker-compose.test.yml ps --status running 2>/dev/null | grep -q "hedera-social-test-db"; then
    echo -e "${CYAN}[infra] Starting containers...${NC}"
    docker compose -f docker-compose.test.yml up -d
    sleep 5
  fi
  docker exec hedera-social-test-db pg_isready -U test -d hedera_social_test 2>/dev/null || {
    echo -e "${YELLOW}[infra] PostgreSQL not ready, restarting...${NC}"
    docker compose -f docker-compose.test.yml down -v
    docker compose -f docker-compose.test.yml up -d
    sleep 8
  }
  docker exec hedera-social-test-redis redis-cli ping 2>/dev/null || {
    echo -e "${YELLOW}[infra] Redis not ready, restarting...${NC}"
    docker compose -f docker-compose.test.yml restart hedera-social-test-redis
    sleep 3
  }
  echo -e "${GREEN}[infra] OK${NC}"
}

# ─── Dev Server Management ──────────────────────────────────
# Kills any running Next.js dev/start, clears .next, rebuilds, restarts in production mode.
# Production mode (next build + next start) avoids HMR/webpack cache corruption
# that happens when files are edited while `next dev` is running.

kill_frontend() {
  echo -e "${CYAN}[frontend] Stopping any running frontend servers...${NC}"
  # Kill next dev or next start processes
  pkill -f "next dev" 2>/dev/null || true
  pkill -f "next start" 2>/dev/null || true
  pkill -f "node.*apps/web" 2>/dev/null || true
  # Also kill anything on port 3000
  lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true
  sleep 2
  echo -e "${GREEN}[frontend] Stopped${NC}"
}

rebuild_and_start_frontend() {
  echo -e "${CYAN}[frontend] Starting frontend (dev mode)...${NC}"

  # Kill existing
  kill_frontend

  # Clear stale webpack cache to avoid corruption
  rm -rf apps/web/.next

  # Rebuild shared (in case types changed)
  (cd packages/shared && pnpm build 2>&1) || true

  # Start in dev mode (production build fails due to SSG + useContext in app pages)
  (cd apps/web && pnpm dev) &
  FRONTEND_PID=$!
  echo -e "${CYAN}[frontend] Waiting for dev server to be ready...${NC}"

  # Wait up to 60 seconds for frontend (dev mode compiles on first request)
  for i in $(seq 1 60); do
    if curl -sf http://localhost:3000 > /dev/null 2>&1; then
      echo -e "${GREEN}[frontend] Running on :3000 (PID: $FRONTEND_PID, dev mode)${NC}"
      return 0
    fi
    sleep 1
  done

  echo -e "${RED}[frontend] Failed to start within 60s${NC}"
  return 1
}

kill_backend() {
  echo -e "${CYAN}[backend] Stopping any running backend servers...${NC}"
  pkill -f "node.*dist/main" 2>/dev/null || true
  lsof -ti:3001 2>/dev/null | xargs kill -9 2>/dev/null || true
  sleep 2
  echo -e "${GREEN}[backend] Stopped${NC}"
}

rebuild_and_start_backend() {
  echo -e "${CYAN}[backend] Rebuilding and starting API...${NC}"

  kill_backend

  (cd packages/shared && pnpm build 2>&1) || true
  (cd packages/api && pnpm build 2>&1) || {
    echo -e "${RED}[backend] Build failed!${NC}"
    return 1
  }

  # Load env and start (subshell to preserve working directory)
  set -a && source .env && set +a
  (cd packages/api && node dist/main) &
  BACKEND_PID=$!
  echo -e "${CYAN}[backend] Waiting for API to be ready...${NC}"

  for i in $(seq 1 30); do
    if curl -sf http://localhost:3001/health > /dev/null 2>&1 || curl -sf http://localhost:3001/api/v1/health > /dev/null 2>&1; then
      echo -e "${GREEN}[backend] Running on :3001 (PID: $BACKEND_PID)${NC}"
      return 0
    fi
    sleep 1
  done

  echo -e "${RED}[backend] Failed to start within 30s${NC}"
  return 1
}

restart_all_servers() {
  echo -e "${CYAN}[servers] Rebuilding and restarting ALL servers...${NC}"
  rebuild_and_start_backend
  rebuild_and_start_frontend
  echo -e "${GREEN}[servers] All servers restarted${NC}"
}

# ─── Extract pass rate from Playwright report ────────────────
get_pass_rate() {
  if [ -f "$E2E_REPORT" ]; then
    # macOS-compatible: use grep -oE instead of grep -oP
    RATE=$(grep -i "pass rate" "$E2E_REPORT" | grep -oE '[0-9]+\.?[0-9]*%' | head -1 | tr -d '%')
    if [ -n "$RATE" ]; then
      echo "$RATE"
    else
      echo "0"
    fi
  else
    echo "0"
  fi
}

# ─── Shared prompt rules (injected into every phase) ─────────
SHARED_RULES='
## ABSOLUTE RULES (from CLAUDE.md)

- NEVER use jest.fn(), jest.mock(), jest.spyOn() or ANY mocking
- NEVER use `any` type or `@ts-ignore`
- NEVER use console.log — NestJS Logger ONLY (backend), or remove from frontend
- NEVER hardcode config — use env vars
- NEVER throw generic Error — use typed exception classes (backend)

## CRITICAL: NO DESTRUCTIVE CHANGES

- NEVER delete endpoints, services, methods, or features
- NEVER remove test files or skip tests to improve pass rate
- NEVER weaken assertions or remove functionality
- You are FIXING and BUILDING, never DESTROYING

## FRONTEND SPECIFICS

- Next.js 14 App Router at apps/web/
- Pages: src/app/(auth)/ for auth, src/app/(app)/ for app routes
- Components: src/components/
- Stores: src/stores/ (Zustand)
- API client: src/lib/api.ts
- Socket: src/lib/socket.ts
- Crypto: src/lib/crypto-utils.ts
- Env validation: src/lib/env.ts

## TESTING CONTEXT

- OTP is always `123123` in localhost testing mode
- `MIRSAD_KYC_ENABLED=false` — KYC auto-approves or is skipped
- API: http://localhost:3001/api/v1
- Frontend: http://localhost:3000
- Auth: email + OTP → JWT in localStorage key `hedera-social-auth`

## BACKEND REFERENCE (for root cause investigation)

- API source: packages/api/src/modules/
- Controllers define routes, services contain logic
- DTOs validate request bodies
- Check the REAL endpoint paths in controllers, not what api.ts assumes

## CUSTODY INTEGRATION — VERIFIED WORKING (DO NOT CHANGE)

- `POST /api/custody/transactions` for HBAR transfers
- HMAC signed requests
- DO NOT change the custody flow

## ENVIRONMENT

- PostgreSQL: localhost:5433 (user: test, pass: test, db: hedera_social_test)
- Redis: localhost:6380
- Hedera creds: .env
- Mirror node: https://testnet.mirrornode.hedera.com/api/v1/
'

# ═══════════════════════════════════════════════════════════════
# PHASE FUNCTIONS
# ═══════════════════════════════════════════════════════════════

# ─── PHASE 1: PLAYWRIGHT E2E ──────────────────────────────────
run_playwright() {
  local LABEL=$1
  echo -e "${YELLOW}${BOLD}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  PHASE 1: PLAYWRIGHT E2E — $LABEL — $(date '+%H:%M:%S')"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "${NC}"

  set +e
  claude --dangerously-skip-permissions --max-turns "$TURNS" -p "
You are a Playwright E2E test engineer. Test the REAL RUNNING UI exhaustively.

## YOUR SKILL — READ FIRST
Read .claude/skills/playwright-e2e/SKILL.md — your FULL test methodology with 11 test suites.

## WHAT YOU DO

### Step 1: Verify infrastructure is running
- Check if API is running at http://localhost:3001/health (curl -sf)
- Check if frontend is running at http://localhost:3000 (curl -sf)
- Both servers are managed by the pipeline script (production mode, NOT dev mode).
- If either is down, just report it — the pipeline script will restart them.
- DO NOT start servers yourself — the pipeline handles server lifecycle.

### Step 2: Ensure Playwright is set up
- Check if \`npx playwright --version\` works
- If not: \`npm init playwright@latest -- --yes\` then \`npx playwright install chromium --with-deps\`
- Check if playwright.config.ts exists at project root
- Check if e2e/ directory exists with test files

### Step 3: Write or update test files
- If e2e/ directory is empty or missing test files, CREATE them based on the skill doc
- Each file should cover one area (auth, feed, messages, payments, etc.)
- Start with auth.spec.ts — it creates the test users that other tests depend on
- Use REAL Playwright assertions: \`expect(page.getByRole(...))\`, \`toBeVisible()\`, etc.
- Use page.waitForURL(), page.waitForResponse() for async operations
- NEVER use page.waitForTimeout() — always wait for specific conditions

### Step 4: Run the tests
\`\`\`bash
npx playwright test --reporter=list 2>&1
\`\`\`

### Step 5: Analyze results
- Count pass/fail/skip per suite
- For each failure: What was expected? What happened? Screenshot?
- Identify root causes (frontend bug? API bug? wrong endpoint? timing?)

## KEY: Test EVERYTHING
Do NOT stop after a few tests. Write and run ALL 11 suites from the skill doc.
Test every page, every form, every button, every error state.

$SHARED_RULES

## THIS IS: $LABEL

$(if [ -f "$E2E_REPORT" ]; then echo "Previous Playwright report exists — compare to see improvement/regression."; fi)
$(if [ -f "$FIX_REPORT" ]; then echo "Fixes were applied — verify those fixes work in the browser."; fi)

## OUTPUT
Write to .claude/state/playwright-report.md with evidence. Include pass rate as: | **Pass Rate** | **XX.X%** |
" 2>&1
  local EXIT=$?
  set -e
  return $EXIT
}

# ─── PHASE 2: INVESTIGATE & FIX ──────────────────────────────
run_frontend_fix() {
  local CYCLE=$1
  local ITERS=${2:-3}

  echo -e "${RED}${BOLD}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  PHASE 2: INVESTIGATE & FIX — Cycle $CYCLE — $ITERS iterations"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "${NC}"

  for fi_num in $(seq 1 "$ITERS"); do
    echo -e "${CYAN}  Fix iteration $fi_num / $ITERS${NC}"

    if [ "$fi_num" -eq 1 ]; then
      FIX_PHASE="FIRST fix iteration. Read .claude/state/playwright-report.md. For EACH failure, trace the full code path: component → api.ts → backend controller → service. Find the REAL root cause. Fix it."
    elif [ "$fi_num" -le 2 ]; then
      FIX_PHASE="Continue fixing. Read frontend-fix-report.md. Focus on STILL BROKEN tests. Try DIFFERENT approaches. Check if the API endpoint path matches what api.ts calls."
    else
      FIX_PHASE="Final iteration. Validate ALL fixes by running: pnpm build (both api and web), then re-run the specific failing Playwright tests."
    fi

    set +e
    claude --dangerously-skip-permissions --max-turns "$TURNS" -p "
You are a frontend bug investigator and fixer for the Hedera Social Platform.

## YOUR METHODOLOGY — READ FIRST
Read .claude/skills/playwright-e2e/SKILL.md — the investigation methodology section.

$SHARED_RULES

## FIX ITERATION $fi_num of $ITERS (Cycle $CYCLE)
$FIX_PHASE

## INVESTIGATION PROTOCOL (MANDATORY)

For EVERY Playwright test failure, you MUST:

1. **Read the test code** — understand what was expected
2. **Read the component code** — what does the page actually render?
3. **Read api.ts** — what endpoint is being called? Is the path correct?
4. **Read the backend controller** — is the route registered? Does the DTO match?
5. **Check the backend service** — does the logic work?
6. **Fix the REAL problem** — not a workaround

Common issues to look for:
- api.ts calls \`/social/feed\` but controller has \`/posts/feed\`
- api.ts sends \`{accountId}\` but DTO expects \`{targetAccountId}\`
- Component reads \`response.data.posts\` but API returns \`{success: true, data: {posts: [...]}}\`
- Store action doesn't unwrap the API envelope correctly
- Missing error handling → white screen instead of error message
- Auth token not being sent → 401 → redirect loop
- Component uses wrong route for navigation

## DO NOT SKIP BUGS
Skipping is NOT a solution. If something is broken, find the root cause and fix it.
If a fix requires backend changes, make them (but respect the custody integration rules).

## OUTPUT
Write to .claude/state/frontend-fix-report.md (overwrite).
If all fixable bugs resolved: write 'ALL BUGS RESOLVED' at top.
" 2>&1
    local EXIT=$?
    set -e

    if [ $EXIT -ne 0 ]; then
      echo -e "${YELLOW}  Fix iteration $fi_num exited with code $EXIT${NC}"
      sleep 15
    fi

    if [ -f "$FIX_REPORT" ] && grep -q "ALL BUGS RESOLVED" "$FIX_REPORT" 2>/dev/null; then
      echo -e "${GREEN}  All bugs resolved — moving to next phase${NC}"
      break
    fi
  done
}

# ─── PHASE 3: SCOPE VALIDATION ────────────────────────────────
run_scope_validation() {
  local CYCLE=$1

  echo -e "${MAGENTA}${BOLD}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  PHASE 3: SCOPE VALIDATION — Cycle $CYCLE"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "${NC}"

  set +e
  claude --dangerously-skip-permissions --max-turns "$TURNS" -p "
You are a frontend completeness auditor for the Hedera Social Platform.

$SHARED_RULES

## CYCLE $CYCLE

## YOUR TASK

Cross-reference EVERY frontend page and feature against the specification and architecture docs:

1. **docs/SPECIFICATION.md** — Every user-facing feature described here MUST have a working UI
2. **docs/ARCHITECTURE.md** — Every frontend component described here MUST exist
3. **docs/PRD-BUSINESS-FEATURES.md** — Every business feature MUST have UI

## PAGE-BY-PAGE AUDIT

For each page in the app, verify:

### Auth Pages (src/app/(auth)/)
- [ ] Landing page (/) — register/login links work
- [ ] Register page — form, validation, OTP flow, error states
- [ ] Login page — form, validation, OTP flow, error states
- [ ] Wallet creation — auto-create, retry on failure, progress display
- [ ] KYC form — individual/business, all required fields, submission
- [ ] Success page — confirmation, proceed to feed

### App Pages (src/app/(app)/)
- [ ] Feed (/feed) — post creation, feed display, likes, comments, infinite scroll
- [ ] Discover (/discover) — search, user cards, badges, navigation to profiles
- [ ] Messages (/messages) — conversation list, new conversation, empty state
- [ ] Chat (/messages/[topicId]) — send/receive messages, typing indicators, encryption
- [ ] Payments (/payments) — balance, send, request, split, history, filters
- [ ] Notifications (/notifications) — list, mark read, categories, bell badge
- [ ] Settings (/settings) — edit profile, view account info, KYC status
- [ ] Profile (/profile/[accountId]) — view profile, follow/unfollow, stats, badge

### Layout & Navigation
- [ ] Sidebar navigation — all links correct, active state
- [ ] Mobile responsive — hamburger menu, overlay
- [ ] Balance widget — shows real HBAR balance
- [ ] Notification bell — shows unread count
- [ ] Route guards — redirect unauthenticated users

### Cross-Cutting
- [ ] Error states — API errors show messages, not white screens
- [ ] Loading states — spinners/skeletons while data loads
- [ ] Empty states — appropriate messages when no data
- [ ] Form validation — client-side validation on all forms

## CHECK PLAYWRIGHT TEST COVERAGE

Read the e2e/ directory. For each page/feature above, verify there IS a Playwright test.
If a feature exists in the spec but has NO test, flag it as a gap.

$(if [ -f "$SCOPE_REPORT" ]; then echo "Previous scope report exists — check what was already addressed."; fi)

## OUTPUT
Write to .claude/state/frontend-scope-report.md with:
- Page-by-page audit results
- Missing features (spec says X, UI doesn't have it)
- Missing Playwright tests
- Priority ranking for fixes
If all pages verified: write 'ALL PAGES VERIFIED' at top.
" 2>&1
  local EXIT=$?
  set -e
  return $EXIT
}

# ─── PHASE 4: BUILD & LINT ────────────────────────────────────
run_build_lint() {
  local CYCLE=$1

  echo -e "${GREEN}${BOLD}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  PHASE 4: BUILD & LINT — Cycle $CYCLE"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "${NC}"

  set +e
  claude --dangerously-skip-permissions --max-turns "$TURNS" -p "
You are a build engineer ensuring zero regressions.

$SHARED_RULES

## CYCLE $CYCLE

## MANDATORY CHECKS — ALL MUST PASS

### 1. TypeScript Compilation (Frontend)
\`\`\`bash
cd apps/web && npx tsc --noEmit 2>&1
\`\`\`
Fix ALL type errors. No \`any\`, no \`@ts-ignore\`.

### 2. TypeScript Compilation (Backend)
\`\`\`bash
cd packages/api && npx tsc --noEmit 2>&1
\`\`\`

### 3. Lint (Frontend)
\`\`\`bash
cd apps/web && pnpm lint 2>&1
\`\`\`
Fix ALL lint errors. Warnings are acceptable.

### 4. Lint (Backend)
\`\`\`bash
cd packages/api && pnpm lint 2>&1
\`\`\`

### 5. Build (Shared)
\`\`\`bash
cd packages/shared && pnpm build 2>&1
\`\`\`

### 6. Build (Backend)
\`\`\`bash
cd packages/api && pnpm build 2>&1
\`\`\`

### 7. Build (Frontend)
\`\`\`bash
cd apps/web && pnpm build 2>&1
\`\`\`

### 8. Backend Tests (no regressions)
\`\`\`bash
cd packages/api && pnpm test 2>&1 | tail -30
\`\`\`
All existing tests MUST still pass.

## FIX ANY FAILURES
If anything fails, fix it. Do NOT skip. Do NOT weaken checks.
After fixing, re-run to verify.

## OUTPUT
Write results to console. If everything passes, echo 'BUILD AND LINT CLEAN'.
" 2>&1
  local EXIT=$?
  set -e
  return $EXIT
}

# ─── PHASE 5: RULES VALIDATION ────────────────────────────────
run_rules_check() {
  local CYCLE=$1

  echo -e "${CYAN}${BOLD}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  PHASE 5: RULES CHECK — Cycle $CYCLE"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "${NC}"

  set +e
  claude --dangerously-skip-permissions --max-turns "$TURNS" -p "
You are a code quality auditor for the Hedera Social Platform.

$SHARED_RULES

## CYCLE $CYCLE

## SCAN FOR BANNED PATTERNS

Run these checks against the entire codebase:

### Backend (packages/api/src/)
\`\`\`bash
# No console.log
grep -rn 'console\.log\|console\.warn\|console\.error' packages/api/src/ --include='*.ts' | grep -v node_modules | grep -v '.spec.' | grep -v '.test.' || echo 'CLEAN: no console.log'

# No any types
grep -rn ': any\b\|as any\b' packages/api/src/ --include='*.ts' | grep -v node_modules | grep -v '.spec.' | grep -v '.test.' | grep -v 'd.ts' || echo 'CLEAN: no any types'

# No @ts-ignore
grep -rn '@ts-ignore\|@ts-expect-error' packages/api/src/ --include='*.ts' | grep -v node_modules || echo 'CLEAN: no ts-ignore'

# No jest.fn/mock/spyOn in production code
grep -rn 'jest\.fn\|jest\.mock\|jest\.spyOn' packages/api/src/ --include='*.ts' | grep -v node_modules | grep -v '.spec.' | grep -v '.test.' || echo 'CLEAN: no mocking'

# No hardcoded secrets
grep -rn 'password.*=' packages/api/src/ --include='*.ts' | grep -v node_modules | grep -v '.spec.' | grep -v '.test.' | grep -v 'password.*:.*string' | grep -v PasswordDto | grep -v class-validator | grep -v ConfigService || echo 'CLEAN: no hardcoded passwords'
\`\`\`

### Frontend (apps/web/src/)
\`\`\`bash
# No hardcoded API URLs
grep -rn 'localhost:3001\|localhost:3000' apps/web/src/ --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v '.spec.' || echo 'CLEAN: no hardcoded URLs'

# No console.log in production code
grep -rn 'console\.log' apps/web/src/ --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v '.spec.' | grep -v '.test.' || echo 'CLEAN: no console.log'
\`\`\`

## FIX ALL VIOLATIONS
If any banned pattern is found, fix it immediately.

## OUTPUT
Write to .claude/state/frontend-rules-report.md with:
- Total violations found (before fix)
- What was fixed
- Remaining violations (should be 0)
If clean: write 'RULES COMPLIANT' at top.
" 2>&1
  local EXIT=$?
  set -e
  return $EXIT
}


# ═══════════════════════════════════════════════════════════════
# MAIN LOOP
# ═══════════════════════════════════════════════════════════════

ensure_infra

# Stop any user-started dev servers (they conflict with production mode)
echo -e "${YELLOW}[init] Stopping any existing dev/start servers...${NC}"
kill_frontend
kill_backend

# Initial build and start in production mode
echo -e "${CYAN}[build] Initial build and server start...${NC}"
rebuild_and_start_backend || echo -e "${YELLOW}[warning] Backend start failed — agents will handle it${NC}"
rebuild_and_start_frontend || echo -e "${YELLOW}[warning] Frontend start failed — agents will handle it${NC}"
echo -e "${GREEN}[build] Done${NC}"
echo ""

BEST_RATE="0"
PREV_RATE="0"
NO_IMPROVEMENT_COUNT=0

for cycle in $(seq 1 "$MAX_CYCLES"); do
  CYCLE_START=$(date +%s)

  echo ""
  echo -e "${MAGENTA}${BOLD}"
  echo "═══════════════════════════════════════════════════════════════"
  echo "  CYCLE $cycle / $MAX_CYCLES — $(date '+%Y-%m-%d %H:%M:%S')"
  echo "  Best rate so far: ${BEST_RATE}%"
  echo "═══════════════════════════════════════════════════════════════"
  echo -e "${NC}"

  # ── Phase 1: Playwright E2E ──
  run_playwright "Cycle $cycle"
  CURRENT_RATE=$(get_pass_rate)
  echo -e "${CYAN}[result] Playwright pass rate: ${CURRENT_RATE}%${NC}"

  # Track improvement
  BETTER=$(python3 -c "print('yes' if float('$CURRENT_RATE') > float('$BEST_RATE') else 'no')" 2>/dev/null || echo "no")
  if [ "$BETTER" = "yes" ]; then
    BEST_RATE="$CURRENT_RATE"
    NO_IMPROVEMENT_COUNT=0
  fi

  # Check if 100%
  PERFECT=$(python3 -c "print('yes' if float('$CURRENT_RATE') >= 100.0 else 'no')" 2>/dev/null || echo "no")
  if [ "$PERFECT" = "yes" ]; then
    echo ""
    echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}${BOLD}  ✓ 100% PLAYWRIGHT PASS — Frontend is production-ready!${NC}"
    echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    cat >> "$PIPELINE_LOG" << EOF
## Cycle $cycle — 100% ACHIEVED
- Pass rate: ${CURRENT_RATE}%
- Time: $(date '+%Y-%m-%d %H:%M:%S')
- STATUS: FRONTEND PRODUCTION READY

EOF
    break
  fi

  # Log Phase 1
  cat >> "$PIPELINE_LOG" << EOF
## Cycle $cycle — Phase 1: Playwright E2E
- Pass rate: ${CURRENT_RATE}%
- Best: ${BEST_RATE}%
- Time: $(date '+%Y-%m-%d %H:%M:%S')

EOF

  # ── Kill frontend BEFORE fix phase (prevents webpack corruption from HMR) ──
  echo -e "${CYAN}[pipeline] Stopping frontend before fix phase (prevents HMR corruption)...${NC}"
  kill_frontend

  # ── Phase 2: Investigate & Fix ──
  echo -e "${CYAN}[pipeline] Pass rate ${CURRENT_RATE}% — running fix phase...${NC}"
  run_frontend_fix "$cycle" 3

  cat >> "$PIPELINE_LOG" << EOF
## Cycle $cycle — Phase 2: Investigate & Fix
- Time: $(date '+%Y-%m-%d %H:%M:%S')
$(if [ -f "$FIX_REPORT" ]; then head -10 "$FIX_REPORT" | sed 's/^/  /'; fi)

EOF

  # ── Restart servers after fixes (prevents webpack cache corruption) ──
  echo -e "${CYAN}[pipeline] Restarting servers after fix phase...${NC}"
  restart_all_servers

  # ── Phase 3: Scope Validation ──
  run_scope_validation "$cycle"

  cat >> "$PIPELINE_LOG" << EOF
## Cycle $cycle — Phase 3: Scope Validation
- Time: $(date '+%Y-%m-%d %H:%M:%S')
$(if [ -f "$SCOPE_REPORT" ]; then head -15 "$SCOPE_REPORT" | sed 's/^/  /'; fi)

EOF

  # ── Kill frontend before build phase (may edit files) ──
  kill_frontend

  # ── Phase 4: Build & Lint ──
  run_build_lint "$cycle"

  cat >> "$PIPELINE_LOG" << EOF
## Cycle $cycle — Phase 4: Build & Lint
- Time: $(date '+%Y-%m-%d %H:%M:%S')

EOF

  # ── Restart servers after build phase (code may have changed) ──
  echo -e "${CYAN}[pipeline] Restarting servers after build phase...${NC}"
  restart_all_servers

  # ── Phase 5: Rules Check ──
  run_rules_check "$cycle"

  cat >> "$PIPELINE_LOG" << EOF
## Cycle $cycle — Phase 5: Rules Check
- Time: $(date '+%Y-%m-%d %H:%M:%S')
$(if [ -f "$RULES_REPORT" ]; then head -10 "$RULES_REPORT" | sed 's/^/  /'; fi)

EOF

  # ── Phase 6: Verification E2E ──
  echo -e "${CYAN}[pipeline] Running verification Playwright tests...${NC}"
  run_playwright "Cycle $cycle — Verification"
  VERIFY_RATE=$(get_pass_rate)
  echo -e "${CYAN}[result] Verification pass rate: ${VERIFY_RATE}%${NC}"

  # Update best
  BETTER=$(python3 -c "print('yes' if float('$VERIFY_RATE') > float('$BEST_RATE') else 'no')" 2>/dev/null || echo "no")
  if [ "$BETTER" = "yes" ]; then
    BEST_RATE="$VERIFY_RATE"
  fi

  cat >> "$PIPELINE_LOG" << EOF
## Cycle $cycle — Phase 6: Verification E2E
- Pass rate: ${VERIFY_RATE}%
- Best: ${BEST_RATE}%
- Improvement: ${CURRENT_RATE}% → ${VERIFY_RATE}%

EOF

  CYCLE_END=$(date +%s)
  CYCLE_DURATION=$(( CYCLE_END - CYCLE_START ))
  echo -e "${CYAN}[timing] Cycle $cycle took $(( CYCLE_DURATION / 60 )) minutes${NC}"

  # Check if 100% after verification
  PERFECT=$(python3 -c "print('yes' if float('$VERIFY_RATE') >= 100.0 else 'no')" 2>/dev/null || echo "no")
  if [ "$PERFECT" = "yes" ]; then
    echo ""
    echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}${BOLD}  ✓ 100% PLAYWRIGHT — Frontend is production-ready!${NC}"
    echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    cat >> "$PIPELINE_LOG" << EOF

## RESULT: FRONTEND PRODUCTION READY
100% Playwright pass rate achieved at cycle $cycle.

EOF
    break
  fi

  # Check for plateau
  IMPROVED=$(python3 -c "print('yes' if float('$VERIFY_RATE') > float('$PREV_RATE') else 'no')" 2>/dev/null || echo "no")
  if [ "$IMPROVED" = "no" ] && [ "$cycle" -gt 1 ]; then
    NO_IMPROVEMENT_COUNT=$((NO_IMPROVEMENT_COUNT + 1))
    echo -e "${YELLOW}[plateau] No improvement this cycle (${NO_IMPROVEMENT_COUNT}/3 before pause)${NC}"

    if [ $NO_IMPROVEMENT_COUNT -ge 3 ]; then
      echo ""
      echo -e "${YELLOW}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
      echo -e "${YELLOW}${BOLD}  ⚠ PLATEAU — No improvement for 3 consecutive cycles${NC}"
      echo -e "${YELLOW}${BOLD}  Remaining issues likely need human input.${NC}"
      echo -e "${YELLOW}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
      cat >> "$PIPELINE_LOG" << EOF

## RESULT: PLATEAU
No improvement for 3 consecutive cycles.
Best pass rate: ${BEST_RATE}%
Remaining issues need human investigation.

EOF
      break
    fi
  else
    NO_IMPROVEMENT_COUNT=0
  fi

  PREV_RATE="$VERIFY_RATE"

  echo ""
  echo -e "${CYAN}Cycle $cycle complete. Best: ${BEST_RATE}%. $(($MAX_CYCLES - $cycle)) cycles remaining.${NC}"
  echo ""
done

# ─── Write final pipeline status ─────────────────────────────
FINAL_RATE=$(get_pass_rate)
cat > "$PIPELINE_STATUS" << EOF
# Frontend Pipeline Status — $(date '+%Y-%m-%d %H:%M:%S')

## Result
- Final pass rate: ${FINAL_RATE}%
- Best pass rate: ${BEST_RATE}%
- Cycles completed: ${cycle} / ${MAX_CYCLES}

## Reports
- Playwright: .claude/state/playwright-report.md
- Fix: .claude/state/frontend-fix-report.md
- Scope: .claude/state/frontend-scope-report.md
- Rules: .claude/state/frontend-rules-report.md
- Log: .claude/state/frontend-ready-log.md

## What's Left
$(if [ -f "$FIX_REPORT" ]; then grep -A 2 "STILL BROKEN\|BLOCKED\|OPEN" "$FIX_REPORT" 2>/dev/null | head -20 || echo "See fix report"; fi)
$(if [ -f "$SCOPE_REPORT" ]; then echo ""; echo "### Missing Features"; grep "MISSING\|NOT IMPLEMENTED\|NO TEST" "$SCOPE_REPORT" 2>/dev/null | head -10 || echo "See scope report"; fi)
EOF

# ─── Final summary ────────────────────────────────────────────
echo ""
echo -e "${MAGENTA}${BOLD}"
echo "═══════════════════════════════════════════════════════════════"
echo "  FRONTEND-READY PIPELINE COMPLETE"
echo "═══════════════════════════════════════════════════════════════"
echo "  Final pass rate:  ${FINAL_RATE}%"
echo "  Best pass rate:   ${BEST_RATE}%"
echo "  Cycles run:       ${cycle} / ${MAX_CYCLES}"
echo ""
echo "  Reports:"
echo "    Playwright: $E2E_REPORT"
echo "    Fix:        $FIX_REPORT"
echo "    Scope:      $SCOPE_REPORT"
echo "    Rules:      $RULES_REPORT"
echo "    Log:        $PIPELINE_LOG"
echo "    Status:     $PIPELINE_STATUS"
echo "═══════════════════════════════════════════════════════════════"
echo -e "${NC}"
