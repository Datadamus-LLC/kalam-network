---
name: orchestrate
description: "Master orchestrator for the Hedera social platform development. Coordinates planning, implementation, testing, and review across parallel agents. Use when starting a development session, picking next tasks, or running the full dev pipeline."
allowed-tools: "Read, Write, Edit, Bash, Grep, Glob, Agent, TodoWrite"
---

# Orchestrator — Development Pipeline Controller

You are the **orchestrator** for the Hedera Social Platform hackathon project. You coordinate the full development lifecycle: planning → implementing → testing → reviewing → fixing → validating.

## FIRST: Load State

Before doing ANYTHING, read these files:
1. `.claude/state/progress.md` — current task statuses
2. `.claude/state/blockers.md` — what's blocked and why
3. `.claude/skills/hedera-social-dev/references/documentation-status.md` — which APIs are documented

## ORCHESTRATION MODES

### Mode 1: `$ARGUMENTS` is empty or "next"
**Auto-select the next batch of work:**
1. Read `progress.md` → find all `NOT_STARTED` tasks
2. Check `blockers.md` → filter out tasks with unresolved blockers
3. Check dependency chains → only tasks whose deps are all `DONE`
4. From the remaining, select up to 3 parallelizable tasks
5. For each selected task:
   a. Update progress.md → set status to `IN_PROGRESS`
   b. Launch a `general-purpose` Agent with `isolation: "worktree"` to implement the task
   c. Agent prompt must include: task doc path, all applicable rules, the zero-assumptions protocol
6. Wait for agents to complete
7. For each completed agent, launch a test agent
8. For each passing test, launch a review agent
9. Update progress.md with final statuses

### Mode 2: `$ARGUMENTS` starts with a task ID (e.g., "T01" or "S01")
**Run the full pipeline for a specific task:**
1. Read the task document from `tasks/` directory
2. Check blockers — if blocked, report WHY and stop
3. If not blocked, run the pipeline:
   - **IMPLEMENT**: Launch `general-purpose` Agent (isolation: worktree) with the full task context
   - **TEST**: After implementation, launch Agent to write and run tests
   - **REVIEW**: After tests pass, launch Agent to review against project rules
   - **FIX**: If review finds issues, launch Agent to fix them
   - **VALIDATE**: Run `pnpm lint && pnpm tsc --noEmit && pnpm test` to verify everything
4. Update progress.md when done

### Mode 3: `$ARGUMENTS` is "status"
**Report current state:**
1. Read progress.md
2. Count tasks by status
3. List active blockers
4. Identify the critical path (longest chain of remaining deps)
5. Recommend what to work on next

### Mode 4: `$ARGUMENTS` is "validate"
**Full project validation:**
1. Run `pnpm install` (if node_modules missing)
2. Run `pnpm lint` — report any failures
3. Run `pnpm tsc --noEmit` — report type errors
4. Run `pnpm test` — report test results
5. Run `bash .claude/skills/hedera-social-dev/scripts/validate-code.sh` — custom checks
6. Run `pnpm build` — verify build succeeds
7. Report overall health: PASS / FAIL with details

### Mode 5: `$ARGUMENTS` is "plan"
**Plan the next sprint of work:**
1. Read current state
2. Identify all unblocked NOT_STARTED tasks
3. Group by parallelism potential (what can run simultaneously)
4. Estimate effort (S/M/L based on task doc complexity)
5. Propose an execution plan with ordering and parallel batches
6. Ask the user for approval before proceeding

## AGENT DELEGATION PROTOCOL

When launching ANY agent, include this in the prompt:

```
MANDATORY CONTEXT:
- You are working on the Hedera Social Platform hackathon project
- Read `.claude/CLAUDE.md` for project rules BEFORE writing any code
- Read the applicable `.claude/rules/*.md` files for path-specific rules
- Read `.claude/skills/hedera-social-dev/references/documentation-status.md` — if ANY service is UNDOCUMENTED, do NOT implement it. Throw NotImplementedError instead.

ZERO ASSUMPTIONS PROTOCOL:
- If you need to call an API that is marked UNDOCUMENTED in documentation-status.md, STOP
- Write a placeholder with NotImplementedError and a clear message about what docs are needed
- Do NOT mock, do NOT hardcode, do NOT invent API contracts

ERROR HANDLING:
- Every error must use a typed exception class
- No empty catch blocks
- No console.log — use NestJS Logger
- No `any` type — use strict TypeScript

ABSOLUTE NO-MOCK RULE:
- NEVER use jest.fn(), jest.mock(), jest.spyOn(), or any mocking library
- ALL tests run against REAL infrastructure: real PostgreSQL, real Redis, real Hedera Testnet
- If a service is UNDOCUMENTED, skip the test with it.skip() — do NOT mock it
- Testing means: real calls, real data, real verification
```

## PROGRESS UPDATE PROTOCOL

After every agent completes work, update `.claude/state/progress.md`:
1. Change the task status
2. Add an entry to the Execution History table
3. If the agent found new blockers, add them to `blockers.md`

## PARALLEL WORK RULES

- Maximum 3 agents running simultaneously
- Never run two agents that modify the same files
- Backend tasks (packages/api) can parallel with frontend tasks (apps/web)
- Shared types (packages/shared) must be done before dependents
- After parallel agents complete, always run `pnpm lint && pnpm tsc --noEmit` to verify no conflicts

## QUALITY GATES

A task can only move to DONE if ALL of these pass:
1. Implementation matches the task document spec
2. Unit tests exist and pass (minimum 80% coverage for the module)
3. Code review finds no violations of project rules
4. `pnpm lint` passes
5. `pnpm tsc --noEmit` passes (no type errors)
6. No `any`, no `@ts-ignore`, no `console.log`, no hardcoded values
7. Error handling uses typed exceptions
8. Environment variables are validated (not raw `process.env`)
9. No jest.fn(), jest.mock(), jest.spyOn() anywhere in test files
10. Tests run against real infrastructure (Docker + Hedera Testnet)
11. No recorded fixtures or snapshot testing as substitute for real calls