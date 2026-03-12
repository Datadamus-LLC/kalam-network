#!/usr/bin/env bash
# validate-code.sh — Run before every commit / PR
# Checks for violations of project rules

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

echo "======================================="
echo "  Hedera Social — Code Validator"
echo "======================================="
echo ""

# 1. Check for console.log (should use NestJS Logger)
echo -n "Checking for console.log usage... "
CONSOLE_HITS=$(grep -rn "console\.\(log\|warn\|error\|info\)" \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next \
  --exclude="*.spec.ts" --exclude="*.test.ts" \
  packages/ apps/ 2>/dev/null | grep -v "// allowed" || true)
if [ -n "$CONSOLE_HITS" ]; then
  echo -e "${RED}FAIL${NC}"
  echo "  Use NestJS Logger instead of console.log:"
  echo "$CONSOLE_HITS" | head -10
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS${NC}"
fi

# 2. Check for hardcoded Hedera Account IDs
echo -n "Checking for hardcoded Hedera IDs... "
HARDCODED=$(grep -rn "'0\.0\.[0-9]\{4,\}'" \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=dist \
  --exclude="*.spec.ts" --exclude="*.test.ts" \
  --exclude="*.md" \
  packages/ apps/ 2>/dev/null | grep -v "// example" | grep -v "// test" || true)
if [ -n "$HARDCODED" ]; then
  echo -e "${RED}FAIL${NC}"
  echo "  Hedera IDs must come from environment variables:"
  echo "$HARDCODED" | head -10
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS${NC}"
fi

# 3. Check for 'any' type usage
echo -n "Checking for 'any' type usage... "
ANY_HITS=$(grep -rn ": any\b\|as any\b\|<any>" \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next \
  --exclude="*.spec.ts" --exclude="*.test.ts" --exclude="*.d.ts" \
  packages/ apps/ 2>/dev/null | grep -v "// justified:" || true)
if [ -n "$ANY_HITS" ]; then
  echo -e "${RED}FAIL${NC}"
  echo "  Use 'unknown' instead of 'any'. If justified, add '// justified: reason':"
  echo "$ANY_HITS" | head -10
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS${NC}"
fi

# 4. Check for @ts-ignore
echo -n "Checking for @ts-ignore... "
TS_IGNORE=$(grep -rn "@ts-ignore\|@ts-nocheck" \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=dist \
  packages/ apps/ 2>/dev/null || true)
if [ -n "$TS_IGNORE" ]; then
  echo -e "${RED}FAIL${NC}"
  echo "  Fix the type error instead of ignoring it:"
  echo "$TS_IGNORE" | head -10
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS${NC}"
fi

# 5. Check for empty catch blocks
echo -n "Checking for empty catch blocks... "
EMPTY_CATCH=$(grep -rn "catch.*{" \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=dist \
  -A 1 packages/ apps/ 2>/dev/null | grep -B1 "^\s*}" | grep "catch" || true)
if [ -n "$EMPTY_CATCH" ]; then
  echo -e "${YELLOW}WARN${NC}"
  echo "  Possible empty catch blocks (verify manually):"
  echo "$EMPTY_CATCH" | head -10
  WARNINGS=$((WARNINGS + 1))
else
  echo -e "${GREEN}PASS${NC}"
fi

# 6. Check for secrets in code
echo -n "Checking for potential secrets... "
SECRETS=$(grep -rni \
  "private.key\s*=\s*['\"]" \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=dist \
  --exclude="*.spec.ts" --exclude="*.md" --exclude=".env*" \
  packages/ apps/ 2>/dev/null || true)
if [ -n "$SECRETS" ]; then
  echo -e "${RED}FAIL${NC}"
  echo "  Possible secrets in code:"
  echo "$SECRETS" | head -5
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS${NC}"
fi

# 7. Check for HCS messages without version field
echo -n "Checking HCS payloads have version... "
HCS_NO_VERSION=$(grep -rn "type.*message\|type.*key_exchange\|type.*payment\|type.*notification\|type.*post\|type.*follow" \
  --include="*.ts" \
  --exclude-dir=node_modules --exclude-dir=dist \
  packages/api/ 2>/dev/null | grep -v '"v"' | grep -v "// non-hcs" || true)
if [ -n "$HCS_NO_VERSION" ]; then
  echo -e "${YELLOW}WARN${NC}"
  echo "  HCS payloads should include version field (\"v\": \"1.0\"):"
  echo "$HCS_NO_VERSION" | head -5
  WARNINGS=$((WARNINGS + 1))
else
  echo -e "${GREEN}PASS${NC}"
fi

# 8. Check .env is not committed
echo -n "Checking .env not in git... "
if git ls-files --cached | grep -q "^\.env$\|\.env\.local$\|\.env\.production$"; then
  echo -e "${RED}FAIL${NC}"
  echo "  .env files must not be committed to git"
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}PASS${NC}"
fi

# 9. Check for TODO without task ID
echo -n "Checking TODOs have task IDs... "
BAD_TODO=$(grep -rn "// TODO\b" \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=dist \
  packages/ apps/ 2>/dev/null | grep -v "// TODO(T[0-9]\|S[0-9])" || true)
if [ -n "$BAD_TODO" ]; then
  echo -e "${YELLOW}WARN${NC}"
  echo "  TODOs should reference a task ID: // TODO(T14): description"
  echo "$BAD_TODO" | head -5
  WARNINGS=$((WARNINGS + 1))
else
  echo -e "${GREEN}PASS${NC}"
fi

echo ""
echo "======================================="
if [ $ERRORS -gt 0 ]; then
  echo -e "  ${RED}FAILED: $ERRORS errors, $WARNINGS warnings${NC}"
  exit 1
elif [ $WARNINGS -gt 0 ]; then
  echo -e "  ${YELLOW}PASSED with $WARNINGS warnings${NC}"
  exit 0
else
  echo -e "  ${GREEN}ALL CHECKS PASSED${NC}"
  exit 0
fi
