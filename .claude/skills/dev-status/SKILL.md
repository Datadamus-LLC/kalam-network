---
name: dev-status
description: "Show current project development status. Displays task progress, active blockers, completion percentages, and what's ready to work on next. Quick health check for the project."
allowed-tools: "Read, Bash, Grep, Glob"
---

# Status Reporter

Report the current state of the Hedera Social Platform development.

## Gather Data

1. Read `.claude/state/progress.md`
2. Read `.claude/state/blockers.md`
3. Check if codebase exists: `ls apps/ packages/` — if not, report "No code yet"
4. If code exists, run quick health checks:
   ```bash
   pnpm tsc --noEmit 2>&1 | tail -5
   pnpm lint 2>&1 | tail -5
   ```

## Generate Report

```
PROJECT STATUS — Hedera Social Platform
========================================

PROGRESS:
  Done:        [X] / 38 tasks ([Y]%)
  In Progress: [X] tasks
  Blocked:     [X] tasks
  Not Started: [X] tasks

BY PHASE:
  Phase 0 Setup:        [X/14] ████░░░░░░ 40%
  Phase 1 Identity:     [X/5]  ░░░░░░░░░░ 0%
  Phase 2 Messaging:    [X/4]  ░░░░░░░░░░ 0%
  Phase 3 Social:       [X/3]  ░░░░░░░░░░ 0%
  Phase 4 Payments:     [X/2]  ░░░░░░░░░░ 0%
  Phase 5 Notifications:[X/2]  ░░░░░░░░░░ 0%
  Phase 6 Submission:   [X/4]  ░░░░░░░░░░ 0%

ACTIVE BLOCKERS:
  ✅ BLOCKER-001: Tamam MPC Custody API docs received (T10 unblocked)
  ✅ BLOCKER-002: HTS Payments via Tamam MPC Custody API docs received (T21, T22 unblocked)
  ✅ BLOCKER-003: Mirsad AI KYC/AML API docs received (T11 unblocked)

CODEBASE HEALTH:
  TypeScript:  [PASS/FAIL]
  Lint:        [PASS/FAIL]
  Tests:       [PASS/FAIL] ([X] passing, [Y] failing)
  Build:       [PASS/FAIL]

READY TO WORK ON:
  [List tasks that have no blockers and deps are done]

NEXT RECOMMENDED ACTION:
  [Specific suggestion based on state]
```
