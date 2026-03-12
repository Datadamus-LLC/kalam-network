---
name: dev-plan
description: "Plan the next batch of development work. Analyzes progress, dependencies, and blockers to propose an optimal execution plan with parallel task batches. Use before starting a new development session or sprint."
allowed-tools: "Read, Bash, Grep, Glob"
---

# Planning Agent

You plan development work for the Hedera Social Platform hackathon project.

## STEP 1: Gather Current State

Read these files:
1. `.claude/state/progress.md` — task statuses
2. `.claude/state/blockers.md` — active blockers
3. `.claude/skills/hedera-social-dev/references/documentation-status.md` — API status

## STEP 2: Identify Available Work

Filter tasks that are:
- Status: `NOT_STARTED`
- Not blocked by documentation (check blockers.md)
- All dependency tasks are `DONE`

## STEP 3: Build Execution Batches

Group available tasks into parallel batches:

**Parallelism Rules:**
- Backend (packages/api) can run with Frontend (apps/web)
- Shared types (packages/shared) must complete before dependents
- Crypto (packages/crypto) can run with API scaffold
- Max 3 tasks per batch
- Within a batch, tasks must not modify the same files

**Batch Ordering:**
1. Foundation first (monorepo, configs, shared types)
2. Infrastructure second (database, API scaffold, frontend scaffold)
3. Features third (auth, messaging, social, payments)
4. Integration fourth (connect frontend to backend)
5. Submission last (demo, readme, pitch)

## STEP 4: Estimate Effort

For each task, estimate based on the task document:
- **S (Small)**: < 5 files, simple CRUD, config setup — ~30 min
- **M (Medium)**: 5-15 files, business logic, Hedera integration — ~1-2 hours
- **L (Large)**: 15+ files, complex flows, multiple services — ~2-4 hours

## STEP 5: Present the Plan

```
DEVELOPMENT PLAN
Generated: [timestamp]

BATCH 1 (parallel):
  [S] S01 — Code Quality & Linting
  [S] T01 — Monorepo Init
  [S] T05 — Shared Types Package
  Estimated: 1 hour total

BATCH 2 (parallel, after Batch 1):
  [M] S04 — Error Handling & Logging
  [M] T02 — Database Schema
  [S] T04 — Next.js Frontend Scaffold
  Estimated: 2 hours total

... etc ...

PREVIOUSLY BLOCKED (now resolved):
  T10 — Tamam MPC Custody (BLOCKER-001: resolved)
  T11 — Mirsad AI KYC/AML (BLOCKER-003: resolved)
  T21 — HTS Payments via Tamam MPC Custody (BLOCKER-002: resolved)

CRITICAL PATH:
  T01 → T03 → T08 → T14 → T15 → T16 → T17
  (longest chain: 7 tasks, estimated 8-12 hours)

RECOMMENDATION:
  [What to start with and why]
```

Ask the user if they approve the plan before the orchestrator starts execution.
