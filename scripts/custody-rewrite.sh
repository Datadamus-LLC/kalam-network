#!/usr/bin/env bash
# =============================================================
# Custody Rewrite — Align TamamCustodyService with Real API
# =============================================================
# Rewrites the TamamCustodyService to use the REAL Tamam Custody
# backend endpoints (verified from olara-mobile-app source).
#
# Fixes BUG-003: HTTP 404 on custody sign-transaction (endpoint
# doesn't exist on real backend).
#
# Usage:
#   ./scripts/custody-rewrite.sh              # 5 iterations, 300 turns
#   ./scripts/custody-rewrite.sh 3            # 3 iterations
#   ./scripts/custody-rewrite.sh 10 400       # 10 iterations, 400 turns
#
set -euo pipefail

ITERATIONS=${1:-5}
MAX_TURNS=${2:-300}
REPORT_FILE=".claude/state/custody-rewrite-report.md"
LOG_FILE=".claude/state/custody-rewrite-log.md"

# ─── Banner ─────────────────────────────────────────────────
echo "╔══════════════════════════════════════════════════════╗"
echo "║   CUSTODY REWRITE — Fix BUG-003 (HTTP 404)          ║"
echo "║   Align TamamCustodyService with real API            ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Iterations:  $ITERATIONS                                   ║"
echo "║  Turns/iter:  $MAX_TURNS                                 ║"
echo "╚══════════════════════════════════════════════════════╝"

# ─── Preflight ─────────────────────────────────────────────
if ! command -v claude &> /dev/null; then
  echo "ERROR: 'claude' CLI not found."
  exit 1
fi

if [ ! -f "CLAUDE.md" ]; then
  echo "ERROR: Run from project root (where CLAUDE.md is)."
  exit 1
fi

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
    sleep 8
  }
  echo "Infrastructure OK."
}

# ─── Initialize log ────────────────────────────────────────
mkdir -p .claude/state
if [ ! -f "$LOG_FILE" ]; then
  cat > "$LOG_FILE" << 'HEADER'
# Custody Rewrite Log

Tracks each iteration of the custody API rewrite (BUG-003 fix).
Target: Rewrite TamamCustodyService to use real Tamam Custody backend API endpoints.

HEADER
fi

# ─── Pre-flight ─────────────────────────────────────────────
ensure_docker

echo ""
echo "Building API before first iteration..."
(cd packages/shared && pnpm build 2>&1) || echo "shared build failed (may not have buildable content)"
(cd packages/api && pnpm build 2>&1) || echo "API build had warnings/errors"
echo "Build complete."
echo ""

# ─── Main loop ──────────────────────────────────────────────
CONSECUTIVE_FAILURES=0

for i in $(seq 1 "$ITERATIONS"); do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  CUSTODY REWRITE — ITERATION $i / $ITERATIONS — $(date '+%Y-%m-%d %H:%M:%S')"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  ensure_docker

  if [ "$i" -eq 1 ]; then
    FOCUS="FIRST iteration. Read .claude/skills/custody-rewrite/SKILL.md for the full rewrite plan. Implement ALL changes:
1. Rewrite tamam-custody.service.ts (interfaces, generateKeypair→onboard, signTransaction→two-step, signMessage)
2. Update payments.service.ts executeCustodyTransfer() to pass new parameters
3. Add executePreSignedTransaction() to hedera.service.ts if needed
4. Update wallet.service.ts if generateKeypair return type changes
5. Add any new exception classes
6. Build + lint + test to verify zero regressions"
  elif [ "$i" -le 3 ]; then
    FOCUS="Read .claude/state/custody-rewrite-report.md. Fix anything that didn't compile or broke in the previous iteration. Verify the rewrite is complete and correct. Build + lint + test. Start the app and smoke test the payment flow."
  else
    FOCUS="Late iteration. Everything should be working. Run comprehensive validation:
- pnpm build (zero errors)
- pnpm lint (zero errors)
- pnpm test (zero regressions)
- Start app and smoke test: register user, send payment
- Verify custody endpoints are called correctly (check logs)
If all good, mark CUSTODY REWRITE COMPLETE in the report."
  fi

  set +e
  claude --dangerously-skip-permissions --max-turns "$MAX_TURNS" -p "
You are rewriting the TamamCustodyService to fix BUG-003 (HTTP 404 on custody endpoints).

## YOUR SKILL — READ THIS FIRST

Read .claude/skills/custody-rewrite/SKILL.md — it has the COMPLETE rewrite plan with:
- Exact real API endpoints (verified from olara-mobile-app source code)
- Zod schemas showing exact request/response formats
- Step-by-step rewrite instructions for each method
- File list and validation checklist

## ABSOLUTE RULES (from CLAUDE.md)

- NEVER use jest.fn(), jest.mock(), jest.spyOn() or ANY mocking
- NEVER use \`any\` type or \`@ts-ignore\`
- NEVER use console.log — NestJS Logger ONLY
- NEVER hardcode config — use env vars via ConfigService
- NEVER throw generic Error — use typed exception classes
- Follow NestJS module structure

## ITERATION $i of $ITERATIONS
$FOCUS

## IMPORTANT: HMAC FIX ALREADY DONE

The signedRequest() HMAC signing logic is CORRECT. DO NOT modify it.
- Timestamp: Unix seconds (not ISO 8601)
- Canonical: direct concatenation (no separators)
- Body hash: always SHA256

## CROSS-REFERENCE: Real Backend Source

The real Tamam Custody backend routes are in:
  ../olara-mobile-app/packages/backend/src/routes/custody.routes.ts

You can read this file to verify endpoint paths, request schemas, and response formats.
The request-signing middleware is in:
  ../olara-mobile-app/packages/backend/src/middleware/request-signing.middleware.ts

## PREVIOUS RESULTS

Read .claude/state/custody-rewrite-report.md if it exists.

## ENVIRONMENT

- PostgreSQL: localhost:5433 (user: test, pass: test, db: hedera_social_test)
- Redis: localhost:6380
- Hedera credentials: in .env file
- Mirror node: https://testnet.mirrornode.hedera.com/api/v1/

## OUTPUT

Write results to .claude/state/custody-rewrite-report.md (overwrite).
Include: what was changed, what was verified, build/lint/test results.

Append iteration summary to .claude/state/custody-rewrite-log.md:
\`\`\`
## Iteration $i — [timestamp]
- Changes: [list files modified]
- Build: PASS/FAIL
- Lint: PASS/FAIL
- Tests: X passing, Y failing
- Smoke test: PASS/FAIL/SKIPPED
- Status: [description]
\`\`\`

If the rewrite is complete and verified: write 'CUSTODY REWRITE COMPLETE' at the top of the report.
" 2>&1
  EXIT_CODE=$?
  set -e

  if [ $EXIT_CODE -ne 0 ]; then
    CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
    echo "⚠ Iteration $i exited with code $EXIT_CODE (consecutive: $CONSECUTIVE_FAILURES)"

    if [ $CONSECUTIVE_FAILURES -ge 3 ]; then
      echo "3 consecutive failures. Restarting Docker..."
      docker compose -f docker-compose.test.yml down -v
      sleep 10
      docker compose -f docker-compose.test.yml up -d
      sleep 10
      CONSECUTIVE_FAILURES=0
    else
      sleep 15
    fi
  else
    CONSECUTIVE_FAILURES=0
  fi

  # Check if done
  if [ -f "$REPORT_FILE" ]; then
    if grep -q "CUSTODY REWRITE COMPLETE" "$REPORT_FILE" 2>/dev/null; then
      echo ""
      echo "════════════════════════════════════════════════════"
      echo "  CUSTODY REWRITE COMPLETE — BUG-003 fixed!"
      echo "════════════════════════════════════════════════════"
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
echo "════════════════════════════════════════════════════════"
echo "  CUSTODY REWRITE PIPELINE COMPLETE"
echo "════════════════════════════════════════════════════════"
echo "  Iterations run: $i / $ITERATIONS"
echo "  Report: $REPORT_FILE"
echo "  Log:    $LOG_FILE"
echo ""
if [ -f "$REPORT_FILE" ]; then
  echo "Final status:"
  head -20 "$REPORT_FILE"
fi
echo "════════════════════════════════════════════════════════"
