# Branch Protection Rules

## Overview

This document describes the branch protection rules that should be configured in GitHub to maintain code quality and prevent accidental issues in production-critical branches.

## Configuration for `main` Branch

### Required Status Checks

All of the following CI status checks must pass before merging:

| Check | Description |
|-------|-------------|
| `lint` | ESLint across all packages |
| `type-check` | TypeScript type checking across all packages |
| `test-backend` | Backend API tests (requires PostgreSQL + Redis) |
| `test-frontend` | Frontend tests |
| `test-crypto` | Crypto package tests |
| `build` | Full monorepo build (depends on all tests passing) |

### Pull Request Requirements

- Require pull requests before merging
- Require at least 1 approval
- Require status checks to pass before merging
- Require branches to be up to date before merging
- Dismiss stale pull request approvals when new commits are pushed
- Require conversation resolution before merging

### Push Restrictions

- Allow force pushes: NO (prevent rewriting history)
- Allow deletions: NO (prevent branch deletion)

## Configuration for `develop` Branch

Same as `main` branch with the following differences:

- Signed commits optional (recommended but not required)
- Same status checks required

## How to Configure in GitHub Web UI

1. Navigate to your repository
2. Go to **Settings** > **Branches**
3. Under "Branch protection rules", click **Add rule**
4. Fill in the form:

   ```
   Branch name pattern: main

   [x] Require a pull request before merging
   [x] Require approvals (1)
   [x] Require status checks to pass before merging

   Status checks that must pass:
   - lint
   - type-check
   - test-backend
   - test-frontend
   - test-crypto
   - build

   [x] Require branches to be up to date before merging
   [x] Require conversation resolution before merging
   [ ] Require linear history
   [ ] Allow force pushes
   [ ] Allow deletions
   ```

5. Click **Create** to save the rule
6. Repeat for `develop` branch

### Using GitHub CLI

```bash
# Configure main branch
gh api repos/:owner/:repo/branches/main/protection \
  --method PUT \
  --input - <<EOF
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["lint", "type-check", "test-backend", "test-frontend", "test-crypto", "build"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "require_linear_history": false
}
EOF
```

## Environment Variables for CI

The CI/CD pipeline requires these secrets configured in GitHub:

### Required Secrets

| Secret | Description |
|--------|-------------|
| `TEST_HEDERA_ACCOUNT_ID` | Hedera testnet operator account (e.g., 0.0.XXXXX) |
| `TEST_HEDERA_PRIVATE_KEY` | ED25519 private key for testnet operator |

### Optional Secrets

| Secret | Description |
|--------|-------------|
| `CODECOV_TOKEN` | For coverage upload to Codecov |

### Configure Secrets in GitHub

1. Navigate to **Settings** > **Secrets and variables** > **Actions**
2. Click **New repository secret**
3. Add each secret with the name and value
4. Secrets are encrypted and never logged in CI output

## CI/CD Pipeline Flow

```
push / PR
  |
  +-- lint (ESLint)
  |
  +-- type-check (TypeScript)
  |
  +-- (both must pass)
       |
       +-- test-backend (PostgreSQL + Redis service containers)
       |
       +-- test-frontend
       |
       +-- test-crypto
       |
       +-- (all must pass)
            |
            +-- build (all packages)
```

## Troubleshooting

### Status Check Not Appearing

- Run at least one successful workflow first so the check name is registered
- Status check names are case-sensitive and must match exactly
- Verify the workflow file is committed and pushed

### Build Fails But Tests Pass

- Check if pnpm-lock.yaml is up to date
- Verify TypeScript compilation: `pnpm type-check`
- Check for missing environment variables in workflow

### Merge Blocked by Required Status Checks

1. Re-run all failed checks
2. If persistent, check logs for actual errors
3. Update branch with latest main/develop changes
4. Push new commits to trigger re-run
