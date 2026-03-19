#!/usr/bin/env bash
# =============================================================
# PRODUCTION-READY LOOP — Continuous Platform Improvement
# =============================================================
# Comprehensive pipeline that runs until the platform is
# production-grade: 100% test pass rate, full feature coverage,
# no functional gaps. Only stops when everything passes or
# remaining issues truly need human input.
#
# PHASES PER CYCLE:
#   1. QA — Find what's broken (E2E tests against real app)
#   2. AUTO-FIX — Investigate & fix bugs (no skipping, no deleting)
#   3. FUNCTIONAL COMPLETENESS — Gap analysis vs PRD/spec
#   4. FEATURE BUILDER — Implement missing features from gap analysis
#   5. TEST COVERAGE — Add tests for new and under-tested features
#   6. VERIFICATION QA — Re-run full QA, measure improvement
#
# EXIT CONDITIONS:
#   - 100% pass rate on all tests → SUCCESS
#   - No improvement for 2 consecutive cycles → PLATEAU (needs human)
#   - Max cycles exhausted → report what's left
#
# Usage:
#   ./scripts/production-ready-loop.sh                    # defaults: 10 cycles
#   ./scripts/production-ready-loop.sh 20                 # 20 cycles
#   ./scripts/production-ready-loop.sh 10 400             # 10 cycles, 400 turns/phase
#
set -euo pipefail

MAX_CYCLES=${1:-20}
TURNS=${2:-400}

# State files
QA_REPORT=".claude/state/qa-report.md"
FIX_REPORT=".claude/state/auto-fix-report.md"
GAP_REPORT=".claude/state/gap-analysis.md"
GAP_LIST=".claude/state/gap-list.md"
FEATURE_REPORT=".claude/state/feature-builder-report.md"
TEST_REPORT=".claude/state/test-coverage-report.md"
PIPELINE_LOG=".claude/state/production-ready-log.md"
PIPELINE_STATUS=".claude/state/pipeline-status.md"

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
echo "║         PRODUCTION-READY LOOP — Continuous Improvement        ║"
echo "║   QA → Fix → Gap Analysis → Build → Test → Verify → Repeat   ║"
echo "╠═══════════════════════════════════════════════════════════════╣"
echo -e "║  Max cycles:    ${MAX_CYCLES}$(printf '%*s' $((44 - ${#MAX_CYCLES})) '')║"
echo -e "║  Turns/phase:   ${TURNS}$(printf '%*s' $((44 - ${#TURNS})) '')║"
echo -e "║  Target:        100% pass rate + 85%+ test coverage        ║"
echo -e "║  Exit:          100% pass OR 3 cycles no improvement       ║"
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

# ─── Initialize pipeline log ────────────────────────────────
cat > "$PIPELINE_LOG" << HEADER
# Production-Ready Pipeline Log

Started: $(date '+%Y-%m-%d %H:%M:%S')
Max cycles: ${MAX_CYCLES}
Turns per phase: ${TURNS}
Target: 100% pass rate, full functional completeness

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

# ─── Hedera balance check ──────────────────────────────────
check_balance() {
  if [ -f .env ]; then
    OPERATOR_ID=$(grep HEDERA_OPERATOR_ID .env | cut -d= -f2 | tr -d '"' | tr -d ' ')
    if [ -n "$OPERATOR_ID" ]; then
      BALANCE=$(curl -s "https://testnet.mirrornode.hedera.com/api/v1/balances?account.id=$OPERATOR_ID" 2>/dev/null | python3 -c "import sys,json; b=json.load(sys.stdin).get('balances',[]); print(b[0]['balance']/100000000 if b else 'unknown')" 2>/dev/null || echo "unknown")
      echo -e "${CYAN}[hedera] Operator: $OPERATOR_ID | Balance: $BALANCE HBAR${NC}"
      if [ "$BALANCE" != "unknown" ]; then
        LOW=$(python3 -c "print('yes' if float('$BALANCE') < 50 else 'no')" 2>/dev/null || echo "no")
        if [ "$LOW" = "yes" ]; then
          echo -e "${YELLOW}[hedera] Low balance, requesting faucet...${NC}"
          curl -s -X POST "https://faucet.hedera.com/api/v1/faucet" \
            -H "Content-Type: application/json" \
            -d "{\"address\": \"$OPERATOR_ID\", \"network\": \"testnet\"}" 2>/dev/null | head -1
          sleep 10
        fi
      fi
    fi
  fi
}

# ─── Extract pass rate from QA report ────────────────────────
get_pass_rate() {
  if [ -f "$QA_REPORT" ]; then
    RATE=$(grep -i "pass rate" "$QA_REPORT" | grep -oE '[0-9]+\.?[0-9]*%' | head -1 | tr -d '%')
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
- NEVER use console.log — NestJS Logger ONLY
- NEVER hardcode config — use env vars via ConfigService
- NEVER throw generic Error — use typed exception classes

## CRITICAL: NO DESTRUCTIVE CHANGES

- NEVER delete endpoints, services, methods, or features
- NEVER remove test files or skip tests to improve pass rate
- NEVER weaken assertions or remove functionality
- You are FIXING and BUILDING, never DESTROYING
- Adding new features, endpoints, and tests IS allowed and encouraged

## CROSS-REPO ACCESS — READ THE REAL BACKEND

The Tamam Custody backend source code is at:
  ../olara-mobile-app/packages/backend/src/

Key files:
- Routes: ../olara-mobile-app/packages/backend/src/routes/custody.routes.ts
- HMAC middleware: ../olara-mobile-app/packages/backend/src/middleware/request-signing.middleware.ts
- Services: ../olara-mobile-app/packages/backend/src/services/custody.service.ts

When our code doesnt match the real API, THE SOURCE CODE WINS.

## CUSTODY INTEGRATION — VERIFIED WORKING (DO NOT CHANGE THE FLOW)

This integration is confirmed working. Do NOT change endpoints, auth, or the polling flow.

**Auth** — ALL requests require HMAC request signing:
- `X-API-Key`: API key from env
- `X-Timestamp`: unix epoch seconds
- `X-Signature`: HMAC-SHA256 of `"{METHOD}\n{PATH}\n{TIMESTAMP}\n{BODY}"` signed with API secret

**Create Transaction**: `POST /api/custody/transactions`
```json
{
  "sourceVaultId": "<user vault UUID>",
  "type": "TRANSFER",
  "chain": "hedera",
  "assetSymbol": "HBAR",
  "amount": "0.1",
  "destinationAddress": "0.0.XXXXX",
  "destinationType": "EXTERNAL"
}
```
Response: `{ "success": true, "data": { "id": "...", "status": "PENDING_COMPLIANCE", "policyDecision": "AUTO_APPROVE" } }`

**Poll for Completion**: `GET /api/custody/transactions/{id}` every 2-3s.
Status progression: PENDING_COMPLIANCE → PENDING_SIGNING → SIGNING → COMPLETED
When COMPLETED: `{ "status": "COMPLETED", "txHash": "...", "explorerUrl": "..." }`
If FAILED: check `errorMessage` and `errorCode`.

**New Vaults**: `POST /api/v1/vaults` — auto-get AUTO_APPROVE policy. No extra setup needed.

**Prerequisites (already done for our org)**:
- KYB approved ✓
- AUTO_APPROVE policy on vault ✓
- Staging compliance bypass deployed ✓

## ENVIRONMENT

- PostgreSQL: localhost:5433 (user: test, pass: test, db: hedera_social_test)
- Redis: localhost:6380
- Hedera creds: .env
- Tamam Custody: TAMAM_CUSTODY_* in .env
- Mirror node: https://testnet.mirrornode.hedera.com/api/v1/
'

# ═══════════════════════════════════════════════════════════════
# PHASE FUNCTIONS
# ═══════════════════════════════════════════════════════════════

# ─── PHASE 1: QA ─────────────────────────────────────────────
run_qa() {
  local LABEL=$1
  echo -e "${YELLOW}${BOLD}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  PHASE 1: QA — $LABEL — $(date '+%H:%M:%S')"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "${NC}"

  echo -e "${CYAN}[build] Building API before QA...${NC}"
  (cd packages/shared && pnpm build 2>&1) || true
  (cd packages/api && pnpm build 2>&1) || echo -e "${YELLOW}[build] Build had issues${NC}"

  set +e
  claude --dangerously-skip-permissions --max-turns "$TURNS" -p "
You are a Senior Manual QA Tester. Test the REAL RUNNING APPLICATION exhaustively.

## INSTRUCTIONS
Read .claude/skills/e2e-qa/SKILL.md — your FULL test plan with 12 test suites and 140+ scenarios.

## WHAT YOU DO
1. Build the API: cd packages/api && pnpm build
2. Start the REAL server: node dist/main
3. Make REAL HTTP requests to EVERY endpoint using curl
4. Check the REAL database, REAL Hedera mirror node, REAL Redis
5. Test happy paths, error paths, edge cases, auth failures
6. Report EVIDENCE — actual curl outputs, actual responses

## KEY: Test EVERYTHING
Do NOT stop after a few tests. Run ALL 12 suites. Test ALL endpoints.
Count total scenarios, passed, failed, blocked. Calculate pass rate.

$SHARED_RULES

## THIS IS: $LABEL

$(if [ -f "$QA_REPORT" ]; then echo "Previous QA exists — compare to see improvement/regression."; fi)
$(if [ -f "$FIX_REPORT" ]; then echo "Auto-fix was run — verify those fixes work."; fi)
$(if [ -f "$FEATURE_REPORT" ]; then echo "New features were built — test those too."; fi)

## OUTPUT
Write to .claude/state/qa-report.md with evidence. Include pass rate as: | **Pass Rate** | **XX.X%** |
" 2>&1
  local EXIT=$?
  set -e
  return $EXIT
}

# ─── PHASE 2: AUTO-FIX ──────────────────────────────────────
run_autofix() {
  local CYCLE=$1
  local ITERS=${2:-3}

  echo -e "${RED}${BOLD}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  PHASE 2: AUTO-FIX — Cycle $CYCLE — $ITERS iterations"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "${NC}"

  for fi_num in $(seq 1 "$ITERS"); do
    echo -e "${CYAN}  Fix iteration $fi_num / $ITERS${NC}"
    ensure_infra

    if [ "$fi_num" -eq 1 ]; then
      FIX_PHASE="FIRST fix iteration. Read .claude/state/qa-report.md. Do DEEP code path traces. Implement fixes. Build + smoke test."
    elif [ "$fi_num" -le 2 ]; then
      FIX_PHASE="Continue fixing. Read auto-fix-report.md. Focus on STILL BROKEN bugs. Try DIFFERENT approaches."
    else
      FIX_PHASE="Final iteration. Validate ALL fixes. Build, lint, test, smoke test every endpoint."
    fi

    set +e
    claude --dangerously-skip-permissions --max-turns "$TURNS" -p "
You are an autonomous bug investigator and fixer.

## YOUR SKILL — READ FIRST
Read .claude/skills/auto-fix/SKILL.md — full methodology.

$SHARED_RULES

## FIX ITERATION $fi_num of $ITERS (Cycle $CYCLE)
$FIX_PHASE

## DO NOT SKIP BUGS
Skipping is NOT a solution. Investigate the full code path.
If an external service fails, read its SOURCE CODE at ../olara-mobile-app/.
Only mark BLOCKED if you truly cannot fix it without human credentials.

## OUTPUT
Write to .claude/state/auto-fix-report.md (overwrite).
Append summary to .claude/state/auto-fix-log.md.
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

# ─── PHASE 3: FUNCTIONAL COMPLETENESS ───────────────────────
run_gap_analysis() {
  local CYCLE=$1

  echo -e "${MAGENTA}${BOLD}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  PHASE 3: FUNCTIONAL COMPLETENESS — Cycle $CYCLE"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "${NC}"

  set +e
  claude --dangerously-skip-permissions --max-turns "$TURNS" -p "
You are a platform completeness auditor.

## YOUR SKILL — READ FIRST
Read .claude/skills/functional-completeness/SKILL.md — full gap analysis methodology.

$SHARED_RULES

## CYCLE $CYCLE

## MULTI-PERSPECTIVE VALIDATION (CRITICAL)

Do NOT just check progress.md or task lists. Cross-reference the ACTUAL codebase against
ALL of these source documents independently — they may describe things the task list missed:

1. **docs/SPECIFICATION.md** — Every endpoint, every DTO, every entity, every flow described here MUST exist in code.
   Go section by section. If the spec says an endpoint exists, verify the controller has the route.
   If the spec describes a DTO shape, verify the DTO class matches.

2. **docs/ARCHITECTURE.md** — Every service, module, integration, and data flow described here MUST be wired up.
   Check that each system component exists. Check that integrations are real, not stubs.

3. **docs/PRD-BUSINESS-FEATURES.md** — Every business feature described here MUST have a working implementation.
   Check org tenancy, RBAC, commerce features, not just the basic social features.

4. **docs/DEVELOPMENT-ROADMAP.md** — Cross-reference priorities. But treat the ABOVE docs as the real source of truth
   for WHAT should exist — the roadmap just tells you the order.

5. **.claude/state/progress.md** — What we THINK is done. Verify each 'DONE' task actually works.

6. **.claude/state/qa-report.md** — What actually passed real E2E tests.

The goal is to catch things we MISSED during task planning — features in the spec/architecture that never
became tasks, endpoints described in the spec that were never implemented, integration flows in the
architecture doc that are missing or incomplete.

Focus on CRITICAL (P0) and IMPORTANT (P1) gaps. Skip P2/future features.

$(if [ -f "$GAP_REPORT" ]; then echo "Previous gap analysis exists — check what was already addressed and what remains."; fi)
$(if [ -f "$FEATURE_REPORT" ]; then echo "Features were built — verify they're in the gap list as resolved."; fi)

## OUTPUT
Write to .claude/state/gap-analysis.md (detailed) and .claude/state/gap-list.md (machine-readable).
For each gap, cite WHICH DOCUMENT describes the missing feature (e.g. 'SPECIFICATION.md section 4.2').
If all critical gaps are addressed: write 'ALL CRITICAL GAPS ADDRESSED' at top of gap-analysis.md.
" 2>&1
  local EXIT=$?
  set -e
  return $EXIT
}

# ─── PHASE 4: FEATURE BUILDER ───────────────────────────────
run_feature_builder() {
  local CYCLE=$1
  local ITERS=${2:-2}

  echo -e "${GREEN}${BOLD}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  PHASE 4: FEATURE BUILDER — Cycle $CYCLE — $ITERS iterations"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "${NC}"

  # Skip if no gaps found
  if [ -f "$GAP_REPORT" ] && grep -q "ALL CRITICAL GAPS ADDRESSED" "$GAP_REPORT" 2>/dev/null; then
    echo -e "${GREEN}  All critical gaps already addressed — skipping feature builder${NC}"
    return 0
  fi

  for fb_num in $(seq 1 "$ITERS"); do
    echo -e "${CYAN}  Feature builder iteration $fb_num / $ITERS${NC}"
    ensure_infra

    set +e
    claude --dangerously-skip-permissions --max-turns "$TURNS" -p "
You are a feature builder for the Hedera Social Platform.

## YOUR SKILL — READ FIRST
Read .claude/skills/feature-builder/SKILL.md — full implementation guide.

$SHARED_RULES

## ITERATION $fb_num of $ITERS (Cycle $CYCLE)

Read .claude/state/gap-analysis.md and .claude/state/gap-list.md.
Implement the CRITICAL and IMPORTANT gaps in priority order.

$(if [ "$fb_num" -gt 1 ] && [ -f "$FEATURE_REPORT" ]; then echo "Read .claude/state/feature-builder-report.md for what was already built. Continue from where the previous iteration left off."; fi)

## KEY RULES
- Follow NestJS module structure exactly
- Every new feature needs: entity, DTOs, exceptions, service, controller, module registration
- Build + lint + test after each feature — ZERO regressions
- Smoke test each new endpoint

## OUTPUT
Write to .claude/state/feature-builder-report.md (overwrite).
If all critical gaps implemented: write 'ALL CRITICAL GAPS IMPLEMENTED' at top.
" 2>&1
    local EXIT=$?
    set -e

    if [ $EXIT -ne 0 ]; then
      echo -e "${YELLOW}  Feature builder iteration $fb_num exited with code $EXIT${NC}"
      sleep 15
    fi

    if [ -f "$FEATURE_REPORT" ] && grep -q "ALL CRITICAL GAPS IMPLEMENTED" "$FEATURE_REPORT" 2>/dev/null; then
      echo -e "${GREEN}  All critical gaps implemented — moving on${NC}"
      break
    fi
  done
}

# ─── PHASE 5: TEST COVERAGE ─────────────────────────────────
run_test_coverage() {
  local CYCLE=$1

  echo -e "${CYAN}${BOLD}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  PHASE 5: TEST COVERAGE — Cycle $CYCLE"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "${NC}"

  set +e
  claude --dangerously-skip-permissions --max-turns "$TURNS" -p "
You are a test engineer expanding test coverage.

## YOUR SKILL — READ FIRST
Read .claude/skills/test-coverage/SKILL.md — full test writing guide.

$SHARED_RULES

## CYCLE $CYCLE

## STEP 1: MEASURE ACTUAL COVERAGE

Run Jest with coverage enabled and record the REAL numbers:

\`\`\`bash
cd packages/api && npx jest --coverage --coverageReporters=text-summary 2>&1 | tail -20
\`\`\`

Record: Statements %, Branches %, Functions %, Lines % for each module.
If any module is below 85% line coverage, it NEEDS more tests.

## STEP 2: IDENTIFY UNCOVERED MODULES

For a per-file breakdown:
\`\`\`bash
cd packages/api && npx jest --coverage --coverageReporters=text 2>&1 | grep -E 'File|%' | head -80
\`\`\`

List every file below 85% and what it does. Prioritize:
1. Core business logic (payments, conversations, auth, social) — these MUST be high coverage
2. Integration services (tamam-custody, hedera, pinata) — cover what's testable without external services
3. Utility/helper modules — cover edge cases

## STEP 3: WRITE TESTS

Write REAL integration tests for uncovered paths:
1. All modules that lack tests
2. New features built this cycle (check .claude/state/feature-builder-report.md)
3. Edge cases and error paths not currently covered
4. Every controller route should have at least: happy path, auth failure, validation failure

## KEY RULES
- Tests use REAL services (PostgreSQL, Redis, Hedera testnet)
- NO mocking, NO faking, NO stubs
- NEVER delete existing passing tests
- NEVER weaken assertions
- Add new test files, new test cases, new test suites

## STEP 4: RE-MEASURE AND REPORT

After writing tests, run coverage again and compare before/after.

## OUTPUT
Write to .claude/state/test-coverage-report.md with:
- Coverage BEFORE: Stmts X% | Branch X% | Funcs X% | Lines X%
- Coverage AFTER:  Stmts X% | Branch X% | Funcs X% | Lines X%
- Per-module breakdown of what was added
- List of modules still below 85% and WHY (e.g. requires external service)

Run pnpm test and report total pass/fail counts.
If ALL testable modules are above 85% line coverage: write 'COVERAGE ADEQUATE' at top.
" 2>&1
  local EXIT=$?
  set -e
  return $EXIT
}


# ═══════════════════════════════════════════════════════════════
# MAIN LOOP
# ═══════════════════════════════════════════════════════════════

ensure_infra
check_balance

# Pre-build
echo -e "${CYAN}[build] Initial build...${NC}"
(cd packages/shared && pnpm build 2>&1) || true
(cd packages/api && pnpm build 2>&1) || true
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

  # ── Phase 1: QA ──
  run_qa "Cycle $cycle"
  CURRENT_RATE=$(get_pass_rate)
  echo -e "${CYAN}[result] QA pass rate: ${CURRENT_RATE}%${NC}"

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
    echo -e "${GREEN}${BOLD}  ✓ 100% PASS RATE ACHIEVED — Platform is production-ready!${NC}"
    echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    cat >> "$PIPELINE_LOG" << EOF
## Cycle $cycle — 100% ACHIEVED
- Pass rate: ${CURRENT_RATE}%
- Time: $(date '+%Y-%m-%d %H:%M:%S')
- STATUS: PRODUCTION READY

EOF
    break
  fi

  # Log QA result
  cat >> "$PIPELINE_LOG" << EOF
## Cycle $cycle — Phase 1: QA
- Pass rate: ${CURRENT_RATE}%
- Best: ${BEST_RATE}%
- Time: $(date '+%Y-%m-%d %H:%M:%S')

EOF

  # ── Phase 2: Auto-Fix ──
  echo -e "${CYAN}[pipeline] Pass rate ${CURRENT_RATE}% — running auto-fix...${NC}"
  run_autofix "$cycle" 3

  cat >> "$PIPELINE_LOG" << EOF
## Cycle $cycle — Phase 2: Auto-Fix
- Time: $(date '+%Y-%m-%d %H:%M:%S')
$(if [ -f "$FIX_REPORT" ]; then head -10 "$FIX_REPORT" | sed 's/^/  /'; fi)

EOF

  # ── Phase 3: Gap Analysis (every cycle to catch new gaps) ──
  run_gap_analysis "$cycle"

  cat >> "$PIPELINE_LOG" << EOF
## Cycle $cycle — Phase 3: Gap Analysis
- Time: $(date '+%Y-%m-%d %H:%M:%S')
$(if [ -f "$GAP_LIST" ]; then head -15 "$GAP_LIST" | sed 's/^/  /'; fi)

EOF

  # ── Phase 4: Feature Builder ──
  run_feature_builder "$cycle" 2

  cat >> "$PIPELINE_LOG" << EOF
## Cycle $cycle — Phase 4: Feature Builder
- Time: $(date '+%Y-%m-%d %H:%M:%S')
$(if [ -f "$FEATURE_REPORT" ]; then head -10 "$FEATURE_REPORT" | sed 's/^/  /'; fi)

EOF

  # ── Phase 5: Test Coverage ──
  run_test_coverage "$cycle"

  cat >> "$PIPELINE_LOG" << EOF
## Cycle $cycle — Phase 5: Test Coverage
- Time: $(date '+%Y-%m-%d %H:%M:%S')
$(if [ -f "$TEST_REPORT" ]; then head -10 "$TEST_REPORT" | sed 's/^/  /'; fi)

EOF

  # ── Phase 6: Verification QA ──
  echo -e "${CYAN}[pipeline] Running verification QA after all improvements...${NC}"
  run_qa "Cycle $cycle — Verification"
  VERIFY_RATE=$(get_pass_rate)
  echo -e "${CYAN}[result] Verification pass rate: ${VERIFY_RATE}%${NC}"

  # Update best
  BETTER=$(python3 -c "print('yes' if float('$VERIFY_RATE') > float('$BEST_RATE') else 'no')" 2>/dev/null || echo "no")
  if [ "$BETTER" = "yes" ]; then
    BEST_RATE="$VERIFY_RATE"
  fi

  cat >> "$PIPELINE_LOG" << EOF
## Cycle $cycle — Phase 6: Verification QA
- Pass rate: ${VERIFY_RATE}%
- Best: ${BEST_RATE}%
- Improvement from start of cycle: ${CURRENT_RATE}% → ${VERIFY_RATE}%

EOF

  CYCLE_END=$(date +%s)
  CYCLE_DURATION=$(( CYCLE_END - CYCLE_START ))
  echo -e "${CYAN}[timing] Cycle $cycle took $(( CYCLE_DURATION / 60 )) minutes${NC}"

  # Check if 100% after verification
  PERFECT=$(python3 -c "print('yes' if float('$VERIFY_RATE') >= 100.0 else 'no')" 2>/dev/null || echo "no")
  if [ "$PERFECT" = "yes" ]; then
    echo ""
    echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}${BOLD}  ✓ 100% PASS RATE — Platform is production-ready!${NC}"
    echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    cat >> "$PIPELINE_LOG" << EOF

## RESULT: PRODUCTION READY
100% pass rate achieved at cycle $cycle.

EOF
    break
  fi

  # Check for plateau (no improvement)
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
See reports for details.

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
# Pipeline Status — $(date '+%Y-%m-%d %H:%M:%S')

## Result
- Final pass rate: ${FINAL_RATE}%
- Best pass rate: ${BEST_RATE}%
- Cycles completed: ${cycle} / ${MAX_CYCLES}

## Reports
- QA: .claude/state/qa-report.md
- Fix: .claude/state/auto-fix-report.md
- Gaps: .claude/state/gap-analysis.md
- Features: .claude/state/feature-builder-report.md
- Tests: .claude/state/test-coverage-report.md
- Log: .claude/state/production-ready-log.md

## What's Left
$(if [ -f "$FIX_REPORT" ]; then grep -A 2 "STILL BROKEN\|BLOCKED" "$FIX_REPORT" 2>/dev/null | head -20 || echo "See fix report"; fi)
$(if [ -f "$GAP_LIST" ]; then echo ""; echo "### Remaining Gaps"; grep "CRITICAL\|IMPORTANT" "$GAP_LIST" 2>/dev/null | head -10 || echo "See gap analysis"; fi)
EOF

# ─── Final summary ────────────────────────────────────────────
echo ""
echo -e "${MAGENTA}${BOLD}"
echo "═══════════════════════════════════════════════════════════════"
echo "  PRODUCTION-READY PIPELINE COMPLETE"
echo "═══════════════════════════════════════════════════════════════"
echo "  Final pass rate:  ${FINAL_RATE}%"
echo "  Best pass rate:   ${BEST_RATE}%"
echo "  Cycles run:       ${cycle} / ${MAX_CYCLES}"
echo ""
echo "  Reports:"
echo "    QA:       $QA_REPORT"
echo "    Fix:      $FIX_REPORT"
echo "    Gaps:     $GAP_REPORT"
echo "    Features: $FEATURE_REPORT"
echo "    Tests:    $TEST_REPORT"
echo "    Log:      $PIPELINE_LOG"
echo "    Status:   $PIPELINE_STATUS"
echo "═══════════════════════════════════════════════════════════════"
echo -e "${NC}"
