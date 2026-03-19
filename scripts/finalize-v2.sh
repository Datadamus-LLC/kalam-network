#!/usr/bin/env bash
# =============================================================
# Finalize V2 — Fix remaining QA failures
# =============================================================
# Implements 11 missing features and bug fixes identified by
# E2E QA Run #11. Loops until all are resolved.
#
# Usage:
#   ./scripts/finalize-v2.sh              # 10 iterations, 300 turns
#   ./scripts/finalize-v2.sh 5            # 5 iterations
#   ./scripts/finalize-v2.sh 15 400       # 15 iterations, 400 turns
#
set -euo pipefail

ITERATIONS=${1:-10}
MAX_TURNS=${2:-300}
LOG_FILE=".claude/state/finalize-v2-log.md"
REPORT_FILE=".claude/state/finalize-v2-report.md"

# ─── Banner ─────────────────────────────────────────────────
echo "╔══════════════════════════════════════════════════════╗"
echo "║     FINALIZE V2 — Fix 11 Remaining QA Failures      ║"
echo "║   WebSocket auth, like/unlike, delete, rate limit    ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Iterations:  $ITERATIONS                                   ║"
echo "║  Turns/iter:  $MAX_TURNS                                 ║"
echo "║  Gaps to fix: 11                                     ║"
echo "╚══════════════════════════════════════════════════════╝"

# ─── Ensure infrastructure ──────────────────────────────────
ensure_docker() {
  echo "Checking Docker infrastructure..."
  if ! docker compose -f docker-compose.test.yml ps --status running 2>/dev/null | grep -q "hedera-social-test-db"; then
    echo "Starting Docker containers..."
    docker compose -f docker-compose.test.yml up -d
    sleep 5
  fi
  docker exec hedera-social-test-db pg_isready -U test -d hedera_social_test || {
    echo "PostgreSQL not ready, restarting..."
    docker compose -f docker-compose.test.yml down -v
    docker compose -f docker-compose.test.yml up -d
    sleep 5
  }
  docker exec hedera-social-test-redis redis-cli ping || {
    echo "Redis not ready, restarting..."
    docker compose -f docker-compose.test.yml restart hedera-social-test-redis
    sleep 3
  }
  echo "Infrastructure OK."
}

# ─── Check Hedera balance ──────────────────────────────────
check_hedera_balance() {
  if [ -f .env ]; then
    OPERATOR_ID=$(grep HEDERA_OPERATOR_ID .env | cut -d= -f2 | tr -d '"' | tr -d ' ')
    if [ -n "$OPERATOR_ID" ]; then
      BALANCE=$(curl -s "https://testnet.mirrornode.hedera.com/api/v1/balances?account.id=$OPERATOR_ID" 2>/dev/null | python3 -c "import sys,json; b=json.load(sys.stdin).get('balances',[]); print(b[0]['balance']/100000000 if b else 'unknown')" 2>/dev/null || echo "unknown")
      echo "Hedera operator: $OPERATOR_ID | Balance: $BALANCE HBAR"
      if [ "$BALANCE" != "unknown" ]; then
        LOW=$(python3 -c "print('yes' if float('$BALANCE') < 50 else 'no')" 2>/dev/null || echo "no")
        if [ "$LOW" = "yes" ]; then
          echo "Balance low, requesting faucet top-up..."
          for attempt in 1 2 3; do
            FAUCET=$(curl -s -X POST "https://faucet.hedera.com/api/v1/faucet" \
              -H "Content-Type: application/json" \
              -d "{\"address\": \"$OPERATOR_ID\", \"network\": \"testnet\"}" 2>/dev/null)
            if echo "$FAUCET" | grep -q "amount"; then
              echo "Faucet top-up successful!"
              break
            fi
            echo "Faucet attempt $attempt failed, waiting..."
            sleep $((30 * attempt))
          done
        fi
      fi
    fi
  fi
}

# ─── Initialize log ────────────────────────────────────────
mkdir -p .claude/state
if [ ! -f "$LOG_FILE" ]; then
  cat > "$LOG_FILE" << 'HEADER'
# Finalization V2 Log

Tracks each iteration of the finalize-v2 pipeline.
Target: Fix 11 remaining QA failures (BUG-002, 005, 006, 008, 013, 014, 015, 016, 019, 021, + cancel payment).

HEADER
fi

# ─── Pre-flight ─────────────────────────────────────────────
ensure_docker
check_hedera_balance

echo ""
echo "Building API before first iteration..."
cd packages/api && pnpm build && cd ../..
echo "Build complete."
echo ""

# ─── Main loop ──────────────────────────────────────────────
CONSECUTIVE_FAILURES=0

for i in $(seq 1 "$ITERATIONS"); do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  FINALIZE V2 — ITERATION $i / $ITERATIONS — $(date '+%Y-%m-%d %H:%M:%S')"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  ensure_docker

  # Determine focus based on iteration
  if [ "$i" -eq 1 ]; then
    FOCUS="FIRST iteration. Read .claude/skills/finalize-v2/SKILL.md for the full gap list. Start implementing from GAP 1 (WebSocket auth) through GAP 4 (cancel payment) — these are the HIGH/MEDIUM priority features. Work through as many gaps as you can."
  elif [ "$i" -le 3 ]; then
    FOCUS="Continue implementing remaining gaps. Read .claude/state/finalize-v2-report.md to see what's done. Focus on any gaps not yet addressed. Prioritize: WebSocket auth → like/unlike → delete → cancel → search auth → rate limiting."
  elif [ "$i" -le 6 ]; then
    FOCUS="Most gaps should be implemented. Focus on VALIDATION — build the app, start it, and smoke test EVERY fix with real HTTP requests. If any test fails, fix the code. Run the full validation pipeline (lint, tsc, build, test). Fix any regressions."
  else
    FOCUS="Late iteration. Read .claude/state/finalize-v2-report.md — fix anything still broken. Run comprehensive smoke tests on all 11 fixes. Verify zero regressions in existing tests. If everything passes, mark ALL V2 GAPS RESOLVED."
  fi

  set +e
  claude --dangerously-skip-permissions --max-turns "$MAX_TURNS" -p "
You are finalizing the Hedera Social Platform for hackathon submission (deadline: March 23, 2026).

## YOUR SKILL

Read .claude/skills/finalize-v2/SKILL.md — it contains the full list of 11 gaps with exact implementation instructions.

## ABSOLUTE RULES (from CLAUDE.md)

- NEVER use jest.fn(), jest.mock(), jest.spyOn() or ANY mocking
- NEVER use \`any\` type or \`@ts-ignore\`
- NEVER use console.log — NestJS Logger ONLY
- NEVER hardcode config — use env vars
- NEVER throw generic Error — use typed exception classes
- NEVER use setTimeout for async — use proper async/await
- All config from validated env vars
- Every error typed, logged, propagated
- Follow NestJS module structure: controller → service → dto → entity → exceptions

## ITERATION CONTEXT

This is iteration $i of $ITERATIONS.
$FOCUS

## PREVIOUS RESULTS

Read these files to understand current state:
- .claude/state/finalize-v2-report.md — previous V2 iteration results (if exists)
- .claude/state/qa-report.md — E2E QA Run #11 results showing all 11 failures
- .claude/state/finalize-report.md — V1 finalization results (all original gaps fixed)

## THE 11 GAPS TO FIX

1. WebSocket handshake JWT auth (BUG-013) — reject unauthenticated connections
2. Like/unlike post endpoints (BUG-015) — POST/DELETE /posts/:id/like
3. Delete post endpoint (BUG-016) — DELETE /posts/:id with ownership check
4. Cancel payment request — POST /payments/request/:id/cancel
5. Auth guard on search (BUG-002) — require JWT for /search/users
6. Rate limiting on auth (BUG-005) — ThrottlerGuard on register/login
7. Org name @MinLength(2) (BUG-006)
8. Login 404 for non-existent user (BUG-008)
9. Health endpoint standard envelope (BUG-019)
10. Decline returns 200 not 201 (BUG-021)
11. Search by accountId/email (BUG-014)

## IMPORTANT: HMAC FIX ALREADY DONE

The TamamCustodyService HMAC signing has already been fixed in tamam-custody.service.ts.
DO NOT touch that file. The fix changes:
- Timestamp: Unix seconds (not ISO 8601)
- Canonical string: direct concatenation (no newline separators)
- Body hash: always SHA256 through the hash function (empty string for no body)

## ENVIRONMENT

- Test PostgreSQL: localhost:5433 (user: test, pass: test, db: hedera_social_test)
- Test Redis: localhost:6380
- Hedera credentials: in .env file
- Mirror node: https://testnet.mirrornode.hedera.com/api/v1/

## OUTPUT

Write results to .claude/state/finalize-v2-report.md (overwrite previous).
Include: for each of the 11 gaps — FIXED / STILL BROKEN / BLOCKED with details.

Append a summary to .claude/state/finalize-v2-log.md:
\`\`\`
## Iteration $i — [timestamp]
- Gaps addressed: [list by number]
- Files changed: [count]
- New files created: [list]
- Build: PASS/FAIL
- Lint: PASS/FAIL
- Tests: X passing, Y failing
- Smoke tests: X/11 passed
- Still broken: [list or NONE]
\`\`\`
" 2>&1
  EXIT_CODE=$?
  set -e

  # Check results
  if [ $EXIT_CODE -ne 0 ]; then
    CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
    echo "⚠ Iteration $i exited with code $EXIT_CODE (consecutive failures: $CONSECUTIVE_FAILURES)"

    if [ $CONSECUTIVE_FAILURES -ge 3 ]; then
      echo "3 consecutive failures. Restarting Docker and waiting 120s..."
      docker compose -f docker-compose.test.yml down -v
      sleep 10
      docker compose -f docker-compose.test.yml up -d
      sleep 120
      CONSECUTIVE_FAILURES=0
    else
      sleep 30
    fi
  else
    CONSECUTIVE_FAILURES=0
  fi

  # Check if all gaps resolved
  if [ -f "$REPORT_FILE" ]; then
    if grep -q "ALL V2 GAPS RESOLVED" "$REPORT_FILE" 2>/dev/null; then
      echo ""
      echo "════════════════════════════════════════════════════"
      echo "  ALL V2 GAPS RESOLVED — Finalization V2 complete!"
      echo "════════════════════════════════════════════════════"
      echo "Report: $REPORT_FILE"
      echo "Log: $LOG_FILE"
      break
    fi
  fi

  echo ""
  echo "Iteration $i complete. $(($ITERATIONS - $i)) remaining."
  echo ""
done

# ─── Final summary ──────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════"
echo "  FINALIZATION V2 COMPLETE"
echo "════════════════════════════════════════════════════════"
echo "  Report: $REPORT_FILE"
echo "  Log:    $LOG_FILE"
echo ""
if [ -f "$REPORT_FILE" ]; then
  echo "Final status:"
  grep -E "GAP|FIXED|BROKEN|BLOCKED|PASS|FAIL|ALL V2" "$REPORT_FILE" | head -25
fi
echo "════════════════════════════════════════════════════════"
