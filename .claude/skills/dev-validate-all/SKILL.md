---
name: dev-validate-all
description: "Run the complete validation pipeline on the entire codebase. Checks TypeScript compilation, linting, tests, custom code quality rules, and build. Use before committing, before PRs, or as a periodic health check."
allowed-tools: "Read, Bash, Grep, Glob"
---

# Full Validation Pipeline

Run every quality check on the Hedera Social Platform codebase.

## Validation Steps

Execute ALL of these in order. Do NOT stop on first failure — run everything and report all issues.

### Step 1: Dependencies
```bash
echo "=== STEP 1: Dependencies ==="
pnpm install --frozen-lockfile 2>&1 || pnpm install 2>&1
echo "Dependencies: $([ $? -eq 0 ] && echo 'PASS' || echo 'FAIL')"
```

### Step 2: TypeScript Compilation
```bash
echo "=== STEP 2: TypeScript ==="
pnpm tsc --noEmit 2>&1
TS_EXIT=$?
echo "TypeScript: $([ $TS_EXIT -eq 0 ] && echo 'PASS' || echo 'FAIL')"
```

### Step 3: Linting
```bash
echo "=== STEP 3: Linting ==="
pnpm lint 2>&1
LINT_EXIT=$?
echo "Linting: $([ $LINT_EXIT -eq 0 ] && echo 'PASS' || echo 'FAIL')"
```

### Step 4: Tests
```bash
echo "=== STEP 4: Tests ==="
pnpm test -- --coverage --passWithNoTests 2>&1
TEST_EXIT=$?
echo "Tests: $([ $TEST_EXIT -eq 0 ] && echo 'PASS' || echo 'FAIL')"
```

### Step 5: Custom Code Quality Checks
```bash
echo "=== STEP 5: Custom Checks ==="
bash .claude/skills/hedera-social-dev/scripts/validate-code.sh 2>&1
CUSTOM_EXIT=$?
echo "Custom Checks: $([ $CUSTOM_EXIT -eq 0 ] && echo 'PASS' || echo 'FAIL')"
```

### Step 6: Banned Pattern Deep Scan
```bash
echo "=== STEP 6: Banned Patterns ==="
ISSUES=0

# Check for `any` type
ANY_COUNT=$(grep -rn ": any\b" --include="*.ts" --include="*.tsx" apps/ packages/ 2>/dev/null | grep -v "node_modules" | grep -v ".d.ts" | wc -l)
[ $ANY_COUNT -gt 0 ] && echo "FAIL: $ANY_COUNT uses of 'any' type" && ISSUES=$((ISSUES+ANY_COUNT))

# Check for console.log
LOG_COUNT=$(grep -rn "console\.\(log\|warn\|error\|debug\|info\)" --include="*.ts" --include="*.tsx" apps/ packages/ 2>/dev/null | grep -v "node_modules" | grep -v ".spec." | grep -v ".test." | wc -l)
[ $LOG_COUNT -gt 0 ] && echo "FAIL: $LOG_COUNT uses of console.log" && ISSUES=$((ISSUES+LOG_COUNT))

# Check for @ts-ignore
IGNORE_COUNT=$(grep -rn "@ts-ignore\|@ts-expect-error" --include="*.ts" --include="*.tsx" apps/ packages/ 2>/dev/null | grep -v "node_modules" | wc -l)
[ $IGNORE_COUNT -gt 0 ] && echo "FAIL: $IGNORE_COUNT uses of @ts-ignore" && ISSUES=$((ISSUES+IGNORE_COUNT))

# Check for setTimeout
TIMEOUT_COUNT=$(grep -rn "setTimeout\|setInterval" --include="*.ts" --include="*.tsx" apps/ packages/ 2>/dev/null | grep -v "node_modules" | grep -v ".spec." | grep -v ".test." | wc -l)
[ $TIMEOUT_COUNT -gt 0 ] && echo "FAIL: $TIMEOUT_COUNT uses of setTimeout/setInterval" && ISSUES=$((ISSUES+TIMEOUT_COUNT))

# Check for hardcoded Hedera IDs
HARDCODED_COUNT=$(grep -rn "0\.0\.[0-9]\+" --include="*.ts" --include="*.tsx" apps/ packages/ 2>/dev/null | grep -v "node_modules" | grep -v ".spec." | grep -v ".test." | grep -v ".md" | wc -l)
[ $HARDCODED_COUNT -gt 0 ] && echo "FAIL: $HARDCODED_COUNT hardcoded Hedera IDs" && ISSUES=$((ISSUES+HARDCODED_COUNT))

# Check for generic Error throws
ERROR_COUNT=$(grep -rn "throw new Error(" --include="*.ts" --include="*.tsx" apps/ packages/ 2>/dev/null | grep -v "node_modules" | grep -v ".spec." | grep -v ".test." | wc -l)
[ $ERROR_COUNT -gt 0 ] && echo "FAIL: $ERROR_COUNT generic Error throws (use typed exceptions)" && ISSUES=$((ISSUES+ERROR_COUNT))

echo "Banned Patterns: $([ $ISSUES -eq 0 ] && echo 'PASS' || echo "FAIL ($ISSUES issues)")"
```

### Step 7: Build
```bash
echo "=== STEP 7: Build ==="
pnpm build 2>&1
BUILD_EXIT=$?
echo "Build: $([ $BUILD_EXIT -eq 0 ] && echo 'PASS' || echo 'FAIL')"
```

## Final Report

```
VALIDATION REPORT — Hedera Social Platform
============================================
Dependencies:     [PASS/FAIL]
TypeScript:       [PASS/FAIL] — [N errors]
Linting:          [PASS/FAIL] — [N warnings, M errors]
Tests:            [PASS/FAIL] — [N passing, M failing, K% coverage]
Custom Checks:    [PASS/FAIL]
Banned Patterns:  [PASS/FAIL] — [N total issues]
Build:            [PASS/FAIL]

OVERALL: [PASS / FAIL]

[If FAIL: list the specific failures with file:line where possible]
```
