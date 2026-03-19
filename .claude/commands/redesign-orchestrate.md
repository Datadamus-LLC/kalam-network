# Redesign Orchestrator

You are running the full Hedera Social redesign orchestration pipeline.

## FIRST: Load the skill
Read `.claude/skills/redesign-orchestrate/SKILL.md` and follow it exactly.
Run ALL 6 phases in order. Do not skip any phase.

## CONTEXT
- Design spec: `docs/superpowers/specs/2026-03-16-ui-redesign-design.md`
- Progress state: `.claude/state/redesign-progress.md`
- Implementation skill: `.claude/skills/ui-redesign/SKILL.md`
- E2E test baseline: 61 pass, 10 skip, 0 fail
- Frontend port: 3002 (3000 may be in use)
- API port: 3001

## WHAT YOU PRODUCE
1. Build health (TypeScript + lint + build)
2. Design compliance report (6 rule checks)
3. E2E functional regression results
4. BE coverage gap analysis — which UI features have/lack API support
5. Updated `.claude/state/redesign-progress.md`
6. Clear next action with exact command to run

## IMPORTANT: BE Gap Analysis
Some UI features may require endpoints or response fields that don't exist yet.
You MUST identify these and classify them as:
- **Critical**: UI is broken/misleading without this → add the endpoint
- **Nice-to-have**: UI degrades gracefully → decide based on effort
- **No action**: Can be handled in frontend logic

For critical gaps: use `/dev-implement` to add the missing endpoint/field before
the UI phase that needs it. Check `packages/api/src/modules/` to understand
what already exists before proposing new work.
