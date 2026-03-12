---
paths:
  - "**/*"
---

# Git Conventions

## Commit Messages

Format: `type(scope): description`

Types:
- `feat` — new feature
- `fix` — bug fix
- `refactor` — code restructuring (no behavior change)
- `test` — adding or updating tests
- `docs` — documentation only
- `chore` — build, CI, deps, configs
- `style` — formatting (no logic change)
- `perf` — performance improvement

Scopes: `api`, `web`, `shared`, `crypto`, `hedera`, `auth`, `messaging`, `social`, `payments`, `notifications`, `ci`, `docker`

Examples:
- `feat(messaging): add HCS topic creation for conversations`
- `fix(auth): validate JWT expiration before token refresh`
- `test(crypto): add real AES-256-GCM encryption round-trip tests`
- `chore(ci): add GitHub Actions workflow for lint and test`

Rules:
- Imperative mood ("add" not "added" or "adds")
- No period at end
- Max 72 characters for first line
- Body explains WHY, not WHAT (the diff shows what)
- Reference task ID: `Implements T14` or `Part of S04`

## Branch Naming

Format: `type/task-id-short-description`

Examples:
- `feat/T14-create-conversation`
- `fix/T09-auth-token-refresh`
- `chore/S01-eslint-prettier-setup`

## Pull Request Rules

- One task per PR (don't mix unrelated changes)
- PR title matches commit message format
- Description includes: what changed, why, how to test
- Must pass: `pnpm lint`, `pnpm tsc --noEmit`, `pnpm test`, `pnpm build`
- No `any`, no `@ts-ignore`, no `console.log`, no mocking
- Request review from at least one other dev
