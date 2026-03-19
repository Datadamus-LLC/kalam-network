#!/usr/bin/env bash
# =============================================================
# Auto-Fix — Autonomous Bug Investigation & Resolution
# =============================================================
# Reads QA results, investigates failures, traces root causes,
# implements fixes, validates, and smoke tests. Full cycle.
#
# Usage:
#   ./scripts/auto-fix.sh                  # defaults: 10 iters, 400 turns
#   ./scripts/auto-fix.sh 5                # 5 iterations
#   ./scripts/auto-fix.sh 15 500           # 15 iterations, 500 turns
#
set -euo pipefail

ITERATIONS=${1:-10}
MAX_TURNS=${2:-400}
REPORT_FILE=".claude/state/auto-fix-report.md"
LOG_FILE=".claude/state/auto-fix-log.md"

# ─── Banner ─────────────────────────────────────────────────
echo "╔══════════════════════════════════════════════════════════╗"
echo "║       AUTO-FIX — Autonomous Bug Investigation            ║"
echo "║    Diagnose → Fix → Build → Test → Verify                ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Iterations:  $ITERATIONS                                         ║"
echo "║  Turns/iter:  $MAX_TURNS                                       ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ─── Ensure infrastructure ──────────────────────────────────
ensure_docker() {
  echo "[infra] Checking Docker infrastructure..."
  if ! docker compose -f docker-compose.test.yml ps --status running 2>/dev/null | grep -q "hedera-social-test-db"; then
    echo "[infra] Starting Docker containers..."
    docker compose -f docker-compose.test.yml up -d
    sleep 5
  fi
  docker exec hedera-social-test-db pg_isready -U test -d hedera_social_test || {
    echo "[infra] PostgreSQL not ready, restarting..."
    docker compose -f docker-compose.test.yml down -v
    docker compose -f docker-compose.test.yml up -d
    sleep 8
  }
  docker exec hedera-social-test-redis redis-cli ping || {
    echo "[infra] Redis not ready, restarting..."
    docker compose -f docker-compose.test.yml restart hedera-social-test-redis
    sleep 3
  }
  echo "[infra] Infrastructure OK."
}

# ─── Check Hedera balance ──────────────────────────────────
check_hedera_balance() {
  if [ -f .env ]; then
    OPERATOR_ID=$(grep HEDERA_OPERATOR_ID .env | cut -d= -f2 | tr -d '"' | tr -d ' ')
    if [ -n "$OPERATOR_ID" ]; then
      BALANCE=$(curl -s "https://testnet.mirrornode.hedera.com/api/v1/balances?account.id=$OPERATOR_ID" 2>/dev/null | python3 -c "import sys,json; b=json.load(sys.stdin).get('balances',[]); print(b[0]['balance']/100000000 if b else 'unknown')" 2>/dev/null || echo "unknown")
      echo "[hedera] Operator: $OPERATOR_ID | Balance: $BALANCE HBAR"
      if [ "$BALANCE" != "unknown" ]; then
        LOW=$(python3 -c "print('yes' if float('$BALANCE') < 50 else 'no')" 2>/dev/null || echo "no")
        if [ "$LOW" = "yes" ]; then
          echo "[hedera] Balance low (<50 HBAR), requesting faucet top-up..."
          for attempt in 1 2 3; do
            FAUCET=$(curl -s -X POST "https://faucet.hedera.com/api/v1/faucet" \
              -H "Content-Type: application/json" \
              -d "{\"address\": \"$OPERATOR_ID\", \"network\": \"testnet\"}" 2>/dev/null)
            if echo "$FAUCET" | grep -q "amount"; then
              echo "[hedera] Faucet top-up successful!"
              break
            fi
            echo "[hedera] Faucet attempt $attempt failed, waiting..."
            sleep $((30 * attempt))
          done
        fi
      fi
    fi
  fi
}

# ─── Initialize logs ────────────────────────────────────────
mkdir -p .claude/state
if [ ! -f "$LOG_FILE" ]; then
  cat > "$LOG_FILE" << 'HEADER'
# Auto-Fix Log

Tracks each iteration of the autonomous bug investigation and fix pipeline.

HEADER
fi

# ─── Pre-flight ─────────────────────────────────────────────
ensure_docker
check_hedera_balance

echo ""
echo "[build] Building packages before first iteration..."
(cd packages/shared && pnpm build 2>&1) || echo "[build] shared build failed (may not have buildable content)"
(cd packages/api && pnpm build 2>&1) || echo "[build] API build had warnings/errors"
echo "[build] Pre-build complete."
echo ""

# ─── Main loop ──────────────────────────────────────────────
CONSECUTIVE_FAILURES=0

for i in $(seq 1 "$ITERATIONS"); do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  AUTO-FIX — ITERATION $i / $ITERATIONS — $(date '+%Y-%m-%d %H:%M:%S')"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  ensure_docker

  # Build context-aware prompt based on iteration number
  if [ "$i" -eq 1 ]; then
    PHASE_GUIDANCE="
## FIRST ITERATION — Full Investigation Required

1. Read .claude/state/qa-report.md to understand ALL current failures
2. Categorize each failure: FIXABLE vs BLOCKED vs INFRA
3. For each FIXABLE bug, do a DEEP code path trace:
   - Read the controller → service → repository → external calls
   - Understand exactly WHY it fails, not just WHAT fails
   - Check if the right service/method is being called
   - Check if the signing/auth/format is correct
4. Implement fixes for ALL fixable bugs
5. Build, lint, and run existing tests
6. Start the app and smoke test each fix with real HTTP requests
7. Write detailed report to .claude/state/auto-fix-report.md
"
  elif [ "$i" -le 3 ]; then
    PHASE_GUIDANCE="
## EARLY ITERATION — Fix What Remains

1. Read .claude/state/auto-fix-report.md — see what was fixed and what's still broken
2. For STILL BROKEN bugs: your previous investigation was WRONG or INCOMPLETE
   - Go deeper — read MORE files in the call chain
   - Check for bugs you missed: wrong imports, missing module registration, wrong config key names
   - Try a COMPLETELY DIFFERENT approach if the first fix didn't work
3. Implement new fixes
4. Build + lint + test — ensure zero regressions
5. Smoke test ALL fixes (both new and previously fixed)
6. Update report
"
  elif [ "$i" -le 6 ]; then
    PHASE_GUIDANCE="
## MID ITERATION — Validate Everything

1. Read .claude/state/auto-fix-report.md
2. Focus on comprehensive VALIDATION:
   - Build the full project: pnpm build
   - Run all tests: pnpm test
   - Start the app and make REAL HTTP calls for every fixed bug
3. For any remaining broken bugs:
   - This is your 3rd+ attempt — the issue is subtle
   - Read the external service's source code if available
   - Check for race conditions, async issues, missing awaits
   - Verify env vars are actually loaded at runtime (log them)
4. Update report with detailed verification results
"
  else
    PHASE_GUIDANCE="
## LATE ITERATION — Final Verification

1. Read .claude/state/auto-fix-report.md
2. Everything fixable should be fixed by now
3. Run the FULL validation pipeline:
   - pnpm lint (zero errors)
   - pnpm build (zero errors)
   - pnpm test (zero regressions)
4. Start the app and do a comprehensive smoke test of EVERY endpoint
5. For anything still broken: write detailed analysis of WHY it can't be fixed
   (missing external service, missing credentials, API doc gap, etc.)
6. Write final report. If all fixable bugs are resolved: 'ALL BUGS RESOLVED'
"
  fi

  set +e
  claude --dangerously-skip-permissions --max-turns "$MAX_TURNS" -p "
You are an autonomous bug investigator and fixer for the Hedera Social Platform (hackathon deadline: March 23, 2026).

## YOUR SKILL — READ THIS FIRST

Read .claude/skills/auto-fix/SKILL.md — it contains the full methodology for investigating and fixing bugs.

## ABSOLUTE RULES (from CLAUDE.md — violations = instant disqualification)

- NEVER use jest.fn(), jest.mock(), jest.spyOn() or ANY mocking
- NEVER use \`any\` type or \`@ts-ignore\`
- NEVER use console.log — NestJS Logger ONLY
- NEVER hardcode config — use env vars via ConfigService
- NEVER throw generic Error — use typed exception classes
- NEVER use setTimeout for async — use proper async/await
- Every error typed, logged, propagated
- Follow NestJS module structure: controller → service → dto → entity → exceptions

## ITERATION $i of $ITERATIONS
$PHASE_GUIDANCE

## INVESTIGATION METHODOLOGY — THE KEY TO SUCCESS

The #1 reason bugs persist is SHALLOW investigation. Don't just read the error message — trace the FULL execution path:

1. Which controller handles the request?
2. Which service method does it call?
3. What does that service method ACTUALLY do (not what you think it does)?
4. If it calls another service (Hedera, Custody, KYC), what method?
5. Does that method use the right key/token/signature?
6. Is the request format exactly what the external service expects?
7. Is the response being parsed correctly?

Example of a DEEP investigation (BUG-003):
- QA says: INVALID_SIGNATURE on payment transfer
- Shallow: 'HMAC signing must be wrong' → fix HMAC → still fails
- Deep: payments.service.ts line 101 calls hederaService.transferHbar()
  → hedera.service.ts transferHbar() signs with OPERATOR KEY
  → but fromAccountId is a USER account (created via custody MPC)
  → operator doesn't have signing authority on user accounts
  → ROOT CAUSE: wrong service being called, not an HMAC issue
  → FIX: route through tamamCustodyService.signTransaction() instead

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
Read it. Compare. Rewrite our code to match reality. ACT ON YOUR FINDINGS.

## PREVIOUS STATE

Read these files for context:
- .claude/state/qa-report.md — latest QA results
- .claude/state/auto-fix-report.md — previous auto-fix results (if exists)
- .claude/state/blockers.md — known blockers (if exists)
- CLAUDE.md — project rules (skim for rules you must follow)

## ENVIRONMENT

- PostgreSQL: localhost:5433 (user: test, pass: test, db: hedera_social_test)
- Redis: localhost:6380
- Hedera Testnet credentials: .env file
- Tamam Custody staging: TAMAM_CUSTODY_* env vars in .env
- Mirror node: https://testnet.mirrornode.hedera.com/api/v1/

## OUTPUT — REQUIRED

1. Write detailed report to .claude/state/auto-fix-report.md (overwrite)
2. Append iteration summary to .claude/state/auto-fix-log.md:

\`\`\`
## Iteration $i — [timestamp]
- Bugs investigated: [count]
- Root causes found: [list with 1-line descriptions]
- Fixes applied: [count, list files]
- Build: PASS/FAIL
- Lint: PASS/FAIL
- Tests: X passing, Y failing
- Smoke tests: X/Y passed
- Still broken: [list or NONE]
\`\`\`

If ALL fixable bugs are resolved, write 'ALL BUGS RESOLVED' at the top of the report.
" 2>&1
  EXIT_CODE=$?
  set -e

  # Handle failures
  if [ $EXIT_CODE -ne 0 ]; then
    CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
    echo "⚠ Iteration $i exited with code $EXIT_CODE (consecutive: $CONSECUTIVE_FAILURES)"

    if [ $CONSECUTIVE_FAILURES -ge 3 ]; then
      echo "3 consecutive failures. Restarting Docker infrastructure..."
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

  # Check if done
  if [ -f "$REPORT_FILE" ]; then
    if grep -q "ALL BUGS RESOLVED" "$REPORT_FILE" 2>/dev/null; then
      echo ""
      echo "════════════════════════════════════════════════════════════"
      echo "  ✓ ALL BUGS RESOLVED — Auto-Fix pipeline complete!"
      echo "════════════════════════════════════════════════════════════"
      echo "  Report: $REPORT_FILE"
      echo "  Log:    $LOG_FILE"
      break
    fi
  fi

  echo ""
  echo "Iteration $i complete. $(($ITERATIONS - $i)) remaining."
  echo ""
done

# ─── Final summary ──────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  AUTO-FIX PIPELINE COMPLETE"
echo "════════════════════════════════════════════════════════════"
echo "  Iterations run: $i / $ITERATIONS"
echo "  Report: $REPORT_FILE"
echo "  Log:    $LOG_FILE"
echo ""
if [ -f "$REPORT_FILE" ]; then
  echo "Final status:"
  head -30 "$REPORT_FILE"
fi
echo "════════════════════════════════════════════════════════════"
