#!/usr/bin/env bash
# =============================================================
# QA → Auto-Fix → QA — Full Loop Pipeline
# =============================================================
# Runs the complete cycle:
#   1. QA pass — find what's broken
#   2. Auto-fix — investigate root causes, implement fixes
#   3. QA pass — verify improvements
#   4. Repeat until pass rate target is hit or max cycles exhausted
#
# Usage:
#   ./scripts/qa-fix-loop.sh                    # defaults: 3 cycles, target 95%
#   ./scripts/qa-fix-loop.sh 5                  # 5 cycles
#   ./scripts/qa-fix-loop.sh 5 98               # 5 cycles, target 98%
#   ./scripts/qa-fix-loop.sh 3 95 300 400       # custom QA/fix turns
#
set -euo pipefail

CYCLES=${1:-3}
TARGET_PASS_RATE=${2:-95}
QA_TURNS=${3:-300}
FIX_TURNS=${4:-400}
FIX_ITERATIONS_PER_CYCLE=${5:-3}

QA_REPORT=".claude/state/qa-report.md"
FIX_REPORT=".claude/state/auto-fix-report.md"
LOOP_LOG=".claude/state/qa-fix-loop-log.md"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}${BOLD}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║           QA → AUTO-FIX → QA   Full Loop Pipeline         ║"
echo "║    Find bugs → Investigate & fix → Verify improvements     ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo -e "║  Cycles:           ${CYCLES}$(printf '%*s' $((39 - ${#CYCLES})) '')║"
echo -e "║  Target pass rate: ${TARGET_PASS_RATE}%$(printf '%*s' $((38 - ${#TARGET_PASS_RATE})) '')║"
echo -e "║  QA turns:         ${QA_TURNS}$(printf '%*s' $((39 - ${#QA_TURNS})) '')║"
echo -e "║  Fix turns:        ${FIX_TURNS}$(printf '%*s' $((39 - ${#FIX_TURNS})) '')║"
echo -e "║  Fix iters/cycle:  ${FIX_ITERATIONS_PER_CYCLE}$(printf '%*s' $((39 - ${#FIX_ITERATIONS_PER_CYCLE})) '')║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── Preflight ────────────────────────────────────────────────
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

# ─── Initialize loop log ─────────────────────────────────────
cat > "$LOOP_LOG" << HEADER
# QA → Fix Loop Log

Started: $(date '+%Y-%m-%d %H:%M:%S')
Target pass rate: ${TARGET_PASS_RATE}%
Max cycles: ${CYCLES}

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

# ─── Hedera balance check ────────────────────────────────────
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

# ─── Extract pass rate from QA report ─────────────────────────
get_pass_rate() {
  if [ -f "$QA_REPORT" ]; then
    # Look for "Pass Rate" line like "| **Pass Rate** | **89.9%** |"
    RATE=$(grep -i "pass rate" "$QA_REPORT" | grep -oP '\d+\.?\d*%' | head -1 | tr -d '%')
    if [ -n "$RATE" ]; then
      echo "$RATE"
    else
      echo "0"
    fi
  else
    echo "0"
  fi
}

# ─── Run QA pass ──────────────────────────────────────────────
run_qa() {
  local CYCLE_NUM=$1
  echo -e "${YELLOW}${BOLD}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  QA PASS — Cycle $CYCLE_NUM — $(date '+%H:%M:%S')"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "${NC}"

  # Build before QA
  echo -e "${CYAN}[build] Building API...${NC}"
  (cd packages/api && pnpm build 2>&1) || echo -e "${YELLOW}[build] Build had issues${NC}"

  set +e
  claude --dangerously-skip-permissions --max-turns "$QA_TURNS" -p "
You are a Senior Manual QA Tester. Your job is to exhaustively test the REAL RUNNING APPLICATION.

## INSTRUCTIONS

Read .claude/skills/e2e-qa/SKILL.md — it has your FULL test plan with 12 test suites and 140+ individual test scenarios.

## CRITICAL UNDERSTANDING

You are NOT running unit tests. You are NOT running pnpm test. You are:
1. Starting the REAL NestJS server (build it first, then run node dist/main)
2. Making REAL HTTP requests to REAL endpoints using curl
3. Checking the REAL database (PostgreSQL on localhost:5433, user: test, pass: test, db: hedera_social_test)
4. Checking REAL Hedera testnet via the mirror node API
5. Testing MULTIPLE SCENARIOS per endpoint
6. Reporting what actually happened with EVIDENCE

## ENVIRONMENT

- Test PostgreSQL: localhost:5433 (user: test, pass: test, db: hedera_social_test)
- Test Redis: localhost:6380
- App port: 3333
- Hedera credentials: in .env file (source it before starting the app)
- Mirror node: https://testnet.mirrornode.hedera.com/api/v1/

## THE FLOW

1. Source .env for Hedera creds
2. Export test DB/Redis overrides (port 5433, 6380)
3. Start the app: cd packages/api && node dist/main &
4. Wait for health check to respond
5. Register 3 test users and authenticate them
6. Run ALL 12 test suites — every single scenario
7. Verify on mirror node and in PostgreSQL
8. Write the QA report to .claude/state/qa-report.md
9. Kill the app process when done

## THIS IS CYCLE $CYCLE_NUM

$(if [ -f "$QA_REPORT" ]; then echo "Previous QA results exist in .claude/state/qa-report.md — compare your results to see what improved or regressed."; else echo "This is the first QA run — no previous results."; fi)
$(if [ -f "$FIX_REPORT" ]; then echo "Auto-fix was run — read .claude/state/auto-fix-report.md to understand what was fixed. Pay extra attention to those areas."; fi)

## OUTPUT

Write everything to .claude/state/qa-report.md with actual curl outputs and evidence. Count: total, passed, failed, blocked.
" 2>&1
  QA_EXIT=$?
  set -e

  return $QA_EXIT
}

# ─── Run auto-fix ─────────────────────────────────────────────
run_fix() {
  local CYCLE_NUM=$1
  local FIX_ITERS=$FIX_ITERATIONS_PER_CYCLE

  echo -e "${RED}${BOLD}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  AUTO-FIX — Cycle $CYCLE_NUM — $FIX_ITERS iterations"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "${NC}"

  for fi_num in $(seq 1 "$FIX_ITERS"); do
    echo -e "${CYAN}  Fix iteration $fi_num / $FIX_ITERS${NC}"

    ensure_infra

    if [ "$fi_num" -eq 1 ]; then
      FIX_PHASE="FIRST fix iteration. Read .claude/state/qa-report.md for all current failures. Do a DEEP code path trace for each failure. Implement fixes. Build and smoke test."
    elif [ "$fi_num" -le 2 ]; then
      FIX_PHASE="Continue fixing. Read .claude/state/auto-fix-report.md for what's already done. Focus on STILL BROKEN bugs. Try a different approach — your previous investigation may have been wrong."
    else
      FIX_PHASE="Final fix iteration. Validate ALL fixes. Build, lint, test. Smoke test every endpoint. Write final report."
    fi

    set +e
    claude --dangerously-skip-permissions --max-turns "$FIX_TURNS" -p "
You are an autonomous bug investigator and fixer for the Hedera Social Platform.

## YOUR SKILL — READ FIRST

Read .claude/skills/auto-fix/SKILL.md — it has the full methodology.

## ABSOLUTE RULES (from CLAUDE.md)

- NEVER use jest.fn(), jest.mock(), jest.spyOn() or ANY mocking
- NEVER use \`any\` type or \`@ts-ignore\`
- NEVER use console.log — NestJS Logger ONLY
- NEVER hardcode config — use env vars via ConfigService
- NEVER throw generic Error — use typed exception classes

## FIX ITERATION $fi_num of $FIX_ITERS (Cycle $CYCLE_NUM)

$FIX_PHASE

## INVESTIGATION METHODOLOGY — THE KEY

The #1 reason bugs persist is SHALLOW investigation. Trace the FULL path:
1. Which controller? 2. Which service method? 3. What does it ACTUALLY do?
4. If it calls another service, what method? 5. Right key/token/signature?
6. Request format match what external service expects?

Example: BUG-003 INVALID_SIGNATURE on payments
- Shallow: 'HMAC must be wrong' → fix HMAC → still fails
- Deep: payments.service calls hederaService.transferHbar()
  → signs with OPERATOR KEY → but from a USER account
  → ROOT CAUSE: wrong service, need custody signing

## CRITICAL: DO NOT SKIP BUGS

Skipping is NOT a solution. If a test fails:
1. Investigate WHY — trace the full code path
2. If it involves an external service, read that service's SOURCE CODE (see below)
3. If our integration code doesn't match the real API, REWRITE IT
4. Only mark as BLOCKED if you've exhaustively investigated AND the fix requires credentials/access you truly don't have

## CROSS-REPO ACCESS — READ THE REAL BACKEND

The Tamam Custody backend source code is available at:
  ../olara-mobile-app/packages/backend/src/

Key files:
- Routes (real endpoints + Zod schemas): ../olara-mobile-app/packages/backend/src/routes/custody.routes.ts
- HMAC middleware: ../olara-mobile-app/packages/backend/src/middleware/request-signing.middleware.ts
- Services: ../olara-mobile-app/packages/backend/src/services/custody.service.ts

When our integration docs don't match the source code, THE SOURCE CODE WINS.
Read it. Compare. Rewrite our code to match reality.

## ENVIRONMENT

- PostgreSQL: localhost:5433 (user: test, pass: test, db: hedera_social_test)
- Redis: localhost:6380
- Hedera creds: .env
- Tamam Custody staging: TAMAM_CUSTODY_* in .env

## OUTPUT

Write to .claude/state/auto-fix-report.md (overwrite).
Append summary to .claude/state/auto-fix-log.md.
If all fixable bugs resolved: write 'ALL BUGS RESOLVED' at top.
" 2>&1
    FIX_EXIT=$?
    set -e

    if [ $FIX_EXIT -ne 0 ]; then
      echo -e "${YELLOW}  Fix iteration $fi_num exited with code $FIX_EXIT${NC}"
      sleep 15
    fi

    # Early exit if all bugs resolved
    if [ -f "$FIX_REPORT" ] && grep -q "ALL BUGS RESOLVED" "$FIX_REPORT" 2>/dev/null; then
      echo -e "${GREEN}  All bugs resolved — skipping remaining fix iterations${NC}"
      break
    fi
  done
}

# ─── MAIN LOOP ────────────────────────────────────────────────

ensure_infra
check_balance

BEST_RATE="0"

for cycle in $(seq 1 "$CYCLES"); do
  echo ""
  echo -e "${CYAN}${BOLD}══════════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}${BOLD}  CYCLE $cycle / $CYCLES — $(date '+%Y-%m-%d %H:%M:%S')${NC}"
  echo -e "${CYAN}${BOLD}══════════════════════════════════════════════════════════${NC}"
  echo ""

  # ── Step 1: QA ──
  run_qa "$cycle"
  CURRENT_RATE=$(get_pass_rate)
  echo -e "${CYAN}[result] QA pass rate: ${CURRENT_RATE}%${NC}"

  # Track best
  BETTER=$(python3 -c "print('yes' if float('$CURRENT_RATE') > float('$BEST_RATE') else 'no')" 2>/dev/null || echo "no")
  if [ "$BETTER" = "yes" ]; then
    BEST_RATE="$CURRENT_RATE"
  fi

  # Log it
  cat >> "$LOOP_LOG" << EOF
## Cycle $cycle — QA
- Time: $(date '+%Y-%m-%d %H:%M:%S')
- Pass rate: ${CURRENT_RATE}%
- Best so far: ${BEST_RATE}%

EOF

  # Check if target reached
  TARGET_MET=$(python3 -c "print('yes' if float('$CURRENT_RATE') >= float('$TARGET_PASS_RATE') else 'no')" 2>/dev/null || echo "no")
  if [ "$TARGET_MET" = "yes" ]; then
    echo ""
    echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}${BOLD}  ✓ TARGET REACHED: ${CURRENT_RATE}% >= ${TARGET_PASS_RATE}%${NC}"
    echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════════${NC}"
    cat >> "$LOOP_LOG" << EOF
## TARGET REACHED
Pass rate ${CURRENT_RATE}% meets target ${TARGET_PASS_RATE}%.
Pipeline complete at cycle $cycle.

EOF
    break
  fi

  # ── Step 2: Auto-Fix ──
  echo ""
  echo -e "${CYAN}[pipeline] Pass rate ${CURRENT_RATE}% < target ${TARGET_PASS_RATE}% — running auto-fix...${NC}"
  echo ""

  run_fix "$cycle"

  cat >> "$LOOP_LOG" << EOF
## Cycle $cycle — Fix
- Time: $(date '+%Y-%m-%d %H:%M:%S')
$(if [ -f "$FIX_REPORT" ]; then head -15 "$FIX_REPORT" | sed 's/^/- /'; fi)

EOF

  # Don't run another QA on the last cycle — let the loop end
  if [ "$cycle" -eq "$CYCLES" ]; then
    echo ""
    echo -e "${CYAN}[pipeline] Last cycle — running final QA verification...${NC}"
    run_qa "$((cycle + 0))-final"
    CURRENT_RATE=$(get_pass_rate)
    BETTER=$(python3 -c "print('yes' if float('$CURRENT_RATE') > float('$BEST_RATE') else 'no')" 2>/dev/null || echo "no")
    if [ "$BETTER" = "yes" ]; then BEST_RATE="$CURRENT_RATE"; fi

    cat >> "$LOOP_LOG" << EOF
## Cycle $cycle — Final QA
- Pass rate: ${CURRENT_RATE}%
- Best: ${BEST_RATE}%

EOF
  fi
done

# ─── Final Summary ────────────────────────────────────────────
FINAL_RATE=$(get_pass_rate)
echo ""
echo -e "${CYAN}${BOLD}"
echo "════════════════════════════════════════════════════════════"
echo "  QA → FIX LOOP COMPLETE"
echo "════════════════════════════════════════════════════════════"
echo "  Final pass rate:  ${FINAL_RATE}%"
echo "  Best pass rate:   ${BEST_RATE}%"
echo "  Target:           ${TARGET_PASS_RATE}%"
echo "  Cycles run:       ${cycle} / ${CYCLES}"
echo ""
echo "  QA report:   $QA_REPORT"
echo "  Fix report:  $FIX_REPORT"
echo "  Loop log:    $LOOP_LOG"
echo "════════════════════════════════════════════════════════════"
echo -e "${NC}"
