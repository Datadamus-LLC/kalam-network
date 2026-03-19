#!/usr/bin/env bash
# =============================================================
# Finalize — Audit, Implement, Validate, Loop
# =============================================================
# Finds every gap between task tracker and reality, implements
# missing code, fixes bugs, validates with real infrastructure,
# and loops until everything passes or max iterations reached.
#
# Usage:
#   ./scripts/finalize.sh              # 10 iterations, 300 turns each
#   ./scripts/finalize.sh 5            # 5 iterations
#   ./scripts/finalize.sh 20 400       # 20 iterations, 400 turns each
#
set -euo pipefail

ITERATIONS=${1:-10}
MAX_TURNS=${2:-300}
LOG_FILE=".claude/state/finalize-log.md"
REPORT_FILE=".claude/state/finalize-report.md"

# ─── Banner ─────────────────────────────────────────────────
echo "╔══════════════════════════════════════════════════════╗"
echo "║        FINALIZE — Audit + Implement + Validate       ║"
echo "║   Find gaps. Write code. Test real. Loop until done. ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Iterations:  $ITERATIONS                                   ║"
echo "║  Turns/iter:  $MAX_TURNS                                 ║"
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
      # Top up if low
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
# Finalization Log

Tracks each iteration of the finalize pipeline.

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
  echo "  ITERATION $i / $ITERATIONS — $(date '+%Y-%m-%d %H:%M:%S')"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  ensure_docker

  # Determine focus based on iteration
  if [ "$i" -eq 1 ]; then
    FOCUS="This is the FIRST iteration. Start with PHASE 1 (full audit). Identify ALL gaps. Then start implementing from GAP 1 (wallet creation) — it's the critical path that unblocks everything else."
  elif [ "$i" -le 3 ]; then
    FOCUS="Focus on implementing remaining gaps from your audit. Read .claude/state/finalize-report.md for what's already been done. Continue where the last iteration left off. Prioritize: wallet creation → WebSocket → XSS → other bugs."
  elif [ "$i" -le 6 ]; then
    FOCUS="Most gaps should be implemented by now. Focus on PHASE 3 (validation) — start the real app, run smoke tests for every fix. If any test fails, fix the code and re-test. Also run the full QA suite from .claude/skills/e2e-qa/SKILL.md on the fixed endpoints."
  else
    FOCUS="Late iteration. Read .claude/state/finalize-report.md — focus on anything still marked BROKEN or BLOCKED. Run the full validation pipeline (lint, tsc, build, test). If everything passes, do a final comprehensive smoke test. Check for any CLAUDE.md rule violations."
  fi

  set +e
  claude --dangerously-skip-permissions --max-turns "$MAX_TURNS" -p "
You are finalizing the Hedera Social Platform for hackathon submission (deadline: March 23, 2026).

## YOUR SKILL

Read .claude/skills/finalize/SKILL.md — it contains the full audit of gaps, implementation instructions, and validation steps.

## ABSOLUTE RULES (from CLAUDE.md)

- NEVER use jest.fn(), jest.mock(), jest.spyOn() or ANY mocking
- NEVER use \`any\` type or \`@ts-ignore\`
- NEVER use console.log — NestJS Logger ONLY
- NEVER hardcode config — use env vars
- NEVER throw generic Error — use typed exception classes
- NEVER use setTimeout for async — use proper async/await
- All config from validated env vars
- Every error typed, logged, propagated

## ITERATION CONTEXT

This is iteration $i of $ITERATIONS.
$FOCUS

## PREVIOUS RESULTS

Read these files to understand current state:
- .claude/state/finalize-report.md — previous iteration results (if exists)
- .claude/state/qa-report.md — E2E QA results showing what's broken
- .claude/state/progress.md — task tracker

## REFERENCE DOCS

Before implementing custody/wallet code, READ:
- .claude/skills/hedera-social-dev/references/custody-integration.md — Tamam Custody API
- .claude/skills/hedera-social-dev/references/mirsad-ai-integration.md — Mirsad AI KYC API

## ENVIRONMENT

- Test PostgreSQL: localhost:5433 (user: test, pass: test, db: hedera_social_test)
- Test Redis: localhost:6380
- Hedera credentials: in .env file
- Mirror node: https://testnet.mirrornode.hedera.com/api/v1/

## OUTPUT

Write your results to .claude/state/finalize-report.md (overwrite previous).
Include: gaps found, changes made, validation results, what's still broken.

At the end, append a summary to .claude/state/finalize-log.md:
\`\`\`
## Iteration $i — [timestamp]
- Gaps addressed: [list]
- Files changed: [count]
- Build: PASS/FAIL
- Lint: PASS/FAIL
- Smoke tests: X/Y passed
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

  # Check if finalize-report says everything is fixed
  if [ -f "$REPORT_FILE" ]; then
    STILL_BROKEN=$(grep -c "STILL BROKEN\|BLOCKED\|FAIL" "$REPORT_FILE" 2>/dev/null || echo "0")
    if [ "$STILL_BROKEN" -eq 0 ] || grep -q "ALL GAPS RESOLVED" "$REPORT_FILE" 2>/dev/null; then
      echo ""
      echo "════════════════════════════════════════════════════"
      echo "  ALL GAPS RESOLVED — Finalization complete!"
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
echo "  FINALIZATION COMPLETE"
echo "════════════════════════════════════════════════════════"
echo "  Report: $REPORT_FILE"
echo "  Log:    $LOG_FILE"
echo ""
if [ -f "$REPORT_FILE" ]; then
  echo "Final status:"
  grep -E "FIXED|BROKEN|BLOCKED|PASS|FAIL|ALL GAPS" "$REPORT_FILE" | head -20
fi
echo "════════════════════════════════════════════════════════"
