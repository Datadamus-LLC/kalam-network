#!/usr/bin/env bash
# =============================================================
# E2E QA Runner — Manual QA Simulation
# =============================================================
# Launches a Claude Code session that acts as a manual QA tester:
# - Starts the REAL NestJS app
# - Hits REAL API endpoints with REAL HTTP requests
# - Verifies results in the REAL database and on REAL Hedera testnet
# - Reports what works and what doesn't
#
# Usage:
#   ./scripts/e2e-qa.sh              # Single QA pass
#   ./scripts/e2e-qa.sh 3            # 3 QA passes (iterative fixing)
#   ./scripts/e2e-qa.sh 3 200        # 3 passes, 200 max-turns each
#
# Prerequisites:
#   - Claude Code CLI installed
#   - Docker running
#   - .env configured with Hedera Testnet credentials
#   - Run from the project root directory
# =============================================================

set -euo pipefail

MAX_ITERATIONS=${1:-1}
MAX_TURNS=${2:-300}
LOG_DIR=".claude/state"
QA_REPORT="${LOG_DIR}/qa-report.md"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}${BOLD}"
echo "╔══════════════════════════════════════════════════╗"
echo "║          E2E QA — Real App Testing               ║"
echo "║     Start app. Hit endpoints. Verify results.    ║"
echo "╠══════════════════════════════════════════════════╣"
echo -e "║  Passes:      ${MAX_ITERATIONS}$(printf '%*s' $((35 - ${#MAX_ITERATIONS})) '')║"
echo -e "║  Turns/pass:  ${MAX_TURNS}$(printf '%*s' $((34 - ${#MAX_TURNS})) '')║"
echo "╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

# Preflight
if ! command -v claude &> /dev/null; then
  echo -e "${RED}ERROR: 'claude' CLI not found.${NC}"
  exit 1
fi

if [ ! -f "CLAUDE.md" ]; then
  echo -e "${RED}ERROR: Run from project root (where CLAUDE.md is).${NC}"
  exit 1
fi

if [ ! -f ".env" ]; then
  echo -e "${RED}ERROR: .env not found. Copy .env.example and fill in credentials.${NC}"
  exit 1
fi

mkdir -p "$LOG_DIR"

# Start infrastructure
echo -e "${CYAN}Starting test infrastructure...${NC}"
docker compose -f docker-compose.test.yml up -d 2>/dev/null || {
  echo -e "${RED}Docker compose failed. Is Docker running?${NC}"
  exit 1
}
sleep 3

# Build the API
echo -e "${CYAN}Building API...${NC}"
cd packages/api && pnpm build && cd ../..

echo -e "${GREEN}Infrastructure ready. Starting QA...${NC}"

for i in $(seq 1 "$MAX_ITERATIONS"); do
  TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
  echo ""
  echo -e "${YELLOW}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${YELLOW}${BOLD}  QA PASS $i / $MAX_ITERATIONS — $TIMESTAMP${NC}"
  echo -e "${YELLOW}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  set +e
  claude --dangerously-skip-permissions --max-turns "$MAX_TURNS" -p "
You are a Senior Manual QA Tester. Your job is to exhaustively test the REAL RUNNING APPLICATION.

## INSTRUCTIONS

Read .claude/skills/e2e-qa/SKILL.md — it has your FULL test plan with 12 test suites and 140+ individual test scenarios.

## CRITICAL UNDERSTANDING

You are NOT running unit tests. You are NOT running pnpm test. You are:
1. Starting the REAL NestJS server (build it first, then run node dist/main)
2. Making REAL HTTP requests to REAL endpoints using curl
3. Checking the REAL database (PostgreSQL on localhost:5433, user: test, pass: test, db: hedera_social_test)
4. Checking REAL Hedera testnet via the mirror node API
5. Testing MULTIPLE SCENARIOS per endpoint: happy path, validation errors, auth errors, edge cases
6. Reporting what actually happened — not what should happen

## ENVIRONMENT

- Test PostgreSQL: localhost:5433 (user: test, pass: test, db: hedera_social_test)
- Test Redis: localhost:6380
- App port: use 3333
- Hedera credentials: in .env file (source it before starting the app)
- Mirror node: https://testnet.mirrornode.hedera.com/api/v1/

## THE FLOW

1. Source .env for Hedera creds
2. Export test DB/Redis overrides (port 5433, 6380)
3. Start the app: cd packages/api && node dist/main &
4. Wait for health check to respond
5. Register 3 test users and authenticate them (needed for multi-user tests)
6. Run ALL 12 test suites from the skill — every single scenario
7. For EVERY endpoint that touches Hedera: verify on mirror node
8. For EVERY endpoint that writes data: verify in PostgreSQL
9. Test validation errors with exact boundary values from the DTOs
10. Test auth failures at every protected endpoint
11. Run cross-cutting tests: CORS, SQL injection, XSS, large payloads, concurrent requests
12. Write the QA report to .claude/state/qa-report.md
13. Kill the app process when done

## THE 12 TEST SUITES

1. Root & Health (2 tests)
2. Authentication (22 tests) — register, login, OTP, refresh, error paths
3. Profile (14 tests) — get, update, boundary values, public profile
4. User Search (6 tests) — query validation, pagination
5. Posts & Feed (18 tests) — create, feed, trending, media, boundary
6. Social Graph (16 tests) — follow, unfollow, bidirectional, duplicates
7. Conversations (14 tests) — direct, group, participants, pagination
8. Payments (24 tests) — send, request, fulfill, decline, balance, history, filters
9. Notifications (10 tests) — list, filter, read, mark-all
10. Organizations (16 tests) — KYC webhook, org CRUD, roles
11. WebSocket Chat (8 tests) — connect, join, typing, read receipts
12. Cross-Cutting (8 tests) — CORS, SQL injection, XSS, envelope format

## IF SOMETHING FAILS

- If the app won't start: READ THE ERROR, fix the code, rebuild, try again
- If an endpoint returns 500: check the app logs, fix the bug, restart, retest
- If Hedera verification fails: that's a CRITICAL bug — the app claims success but nothing happened on-chain
- If the database is empty after a 'successful' write: that's a CRITICAL bug
- If a validation error doesn't match the expected message: that's a bug in the DTO

## PREVIOUS QA RESULTS

Read .claude/state/qa-report.md if it exists — focus on previously failing flows and verify fixes.

## OUTPUT

Write everything to .claude/state/qa-report.md. Include actual curl outputs, actual database query results, actual mirror node responses. Evidence, not opinions. Count every test — total, passed, failed, blocked.
" 2>&1

  QA_EXIT=${PIPESTATUS[0]}
  set -e

  if [ "$QA_EXIT" -ne 0 ] && [ "$i" -lt "$MAX_ITERATIONS" ]; then
    echo -e "${YELLOW}QA session exited with code $QA_EXIT — retrying in 15s...${NC}"
    sleep 15
  fi
done

echo ""
echo -e "${GREEN}${BOLD}QA complete. Report: .claude/state/qa-report.md${NC}"
echo ""
