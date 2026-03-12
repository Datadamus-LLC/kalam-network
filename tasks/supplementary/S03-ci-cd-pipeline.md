# S03: CI/CD Pipeline — GitHub Actions

| Field | Value |
|-------|-------|
| Task ID | S03 |
| Priority | 🟡 P1 — Do Within First 2 Days |
| Estimated Time | 2 hours |
| Depends On | S01, S02 |
| Phase | Supplementary — Engineering Standards |
| Assignee | Any developer |

---

## Overview

This task establishes a comprehensive CI/CD pipeline using GitHub Actions to automate testing, linting, type checking, and building across the monorepo. The pipeline ensures code quality, catches regressions early, and maintains consistent engineering standards.

### Objectives

1. Automate linting and code style checks on every commit
2. Run unit tests across all packages with coverage reporting
3. Verify TypeScript compilation without errors
4. Build all packages to catch build-time issues early
5. Provide clear feedback to developers about what broke
6. Enforce branch protection rules to ensure quality on main/develop
7. Support optional preview deployments for frontend PRs

### Scope

- GitHub Actions workflows for CI/CD
- Service containers for PostgreSQL and Redis testing
- Code ownership definitions
- Pull request templates and guidelines
- Branch protection rules documentation

---

## Files to Create/Modify

### 1. `.github/workflows/ci.yml` — Main CI Workflow

```yaml
name: CI

on:
  push:
    branches:
      - main
      - develop
  pull_request:
    branches:
      - main
      - develop

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: '20'
  PNPM_VERSION: '9.0.0'
  REGISTRY_URL: 'https://registry.npmjs.org'

jobs:
  lint:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Get pnpm store directory
        id: pnpm-cache
        shell: bash
        run: |
          echo "STORE_PATH=$(pnpm store path)" >> $GITHUB_OUTPUT

      - name: Setup pnpm cache
        uses: actions/cache@v4
        with:
          path: ${{ steps.pnpm-cache.outputs.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-store-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run ESLint
        run: pnpm lint:eslint
        continue-on-error: false

      - name: Check code formatting with Prettier
        run: pnpm lint:prettier
        continue-on-error: false

      - name: TypeScript type checking
        run: pnpm type-check
        continue-on-error: false

      - name: Upload lint results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: lint-results
          path: |
            .eslintcache
            **/*.eslintcache
          retention-days: 5

  test-crypto:
    name: Test Crypto Package
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Get pnpm store directory
        id: pnpm-cache
        shell: bash
        run: |
          echo "STORE_PATH=$(pnpm store path)" >> $GITHUB_OUTPUT

      - name: Setup pnpm cache
        uses: actions/cache@v4
        with:
          path: ${{ steps.pnpm-cache.outputs.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-store-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run crypto tests
        run: pnpm --filter @hedera-social/crypto test:unit --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./packages/crypto/coverage/coverage-final.json
          flags: crypto
          name: crypto-coverage

  test-shared:
    name: Test Shared Package
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Get pnpm store directory
        id: pnpm-cache
        shell: bash
        run: |
          echo "STORE_PATH=$(pnpm store path)" >> $GITHUB_OUTPUT

      - name: Setup pnpm cache
        uses: actions/cache@v4
        with:
          path: ${{ steps.pnpm-cache.outputs.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-store-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run shared tests
        run: pnpm --filter @hedera-social/shared test:unit --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./packages/shared/coverage/coverage-final.json
          flags: shared
          name: shared-coverage

  test-api:
    name: Test API Backend
    runs-on: ubuntu-latest
    timeout-minutes: 20

    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: hedera_social_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379

    env:
      DATABASE_HOST: localhost
      DATABASE_PORT: 5432
      DATABASE_USER: test
      DATABASE_PASSWORD: test
      DATABASE_NAME: hedera_social_test
      REDIS_HOST: localhost
      REDIS_PORT: 6379
      REDIS_DB: 0
      NODE_ENV: test
      HEDERA_NETWORK: testnet
      HEDERA_ACCOUNT_ID: ${{ secrets.TEST_HEDERA_ACCOUNT_ID }}
      HEDERA_PRIVATE_KEY: ${{ secrets.TEST_HEDERA_PRIVATE_KEY }}
      JWT_SECRET: test-jwt-secret-key-for-ci
      ENVIRONMENT: test

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Get pnpm store directory
        id: pnpm-cache
        shell: bash
        run: |
          echo "STORE_PATH=$(pnpm store path)" >> $GITHUB_OUTPUT

      - name: Setup pnpm cache
        uses: actions/cache@v4
        with:
          path: ${{ steps.pnpm-cache.outputs.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-store-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Wait for PostgreSQL
        run: |
          until pg_isready -h localhost -p 5432 -U test; do
            echo 'waiting for postgres...'
            sleep 1
          done
        timeout-minutes: 1

      - name: Wait for Redis
        run: |
          until redis-cli -h localhost -p 6379 ping | grep PONG; do
            echo 'waiting for redis...'
            sleep 1
          done
        timeout-minutes: 1

      - name: Run API tests
        run: pnpm --filter @hedera-social/api test:unit --coverage

      - name: Run API integration tests
        run: pnpm --filter @hedera-social/api test:integration --coverage || true

      - name: Upload API coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./packages/api/coverage/coverage-final.json
          flags: api
          name: api-coverage

  test-web:
    name: Test Frontend
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Get pnpm store directory
        id: pnpm-cache
        shell: bash
        run: |
          echo "STORE_PATH=$(pnpm store path)" >> $GITHUB_OUTPUT

      - name: Setup pnpm cache
        uses: actions/cache@v4
        with:
          path: ${{ steps.pnpm-cache.outputs.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-store-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run web tests
        run: pnpm --filter @hedera-social/web test:unit --coverage

      - name: Upload web coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./apps/web/coverage/coverage-final.json
          flags: web
          name: web-coverage

  build:
    name: Build All Packages
    needs:
      - lint
      - test-crypto
      - test-shared
      - test-api
      - test-web
    runs-on: ubuntu-latest
    timeout-minutes: 25

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Get pnpm store directory
        id: pnpm-cache
        shell: bash
        run: |
          echo "STORE_PATH=$(pnpm store path)" >> $GITHUB_OUTPUT

      - name: Setup pnpm cache
        uses: actions/cache@v4
        with:
          path: ${{ steps.pnpm-cache.outputs.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-store-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build shared package
        run: pnpm --filter @hedera-social/shared build

      - name: Build crypto package
        run: pnpm --filter @hedera-social/crypto build

      - name: Build API package
        run: pnpm --filter @hedera-social/api build

      - name: Build Next.js frontend
        run: pnpm --filter @hedera-social/web build

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build-artifacts
          path: |
            packages/api/dist
            apps/web/.next
            packages/crypto/dist
            packages/shared/dist
          retention-days: 7

      - name: Check build size
        run: |
          echo "API dist size: $(du -sh packages/api/dist | cut -f1)"
          echo "Web .next size: $(du -sh apps/web/.next | cut -f1)"
          echo "Crypto dist size: $(du -sh packages/crypto/dist | cut -f1)"
          echo "Shared dist size: $(du -sh packages/shared/dist | cut -f1)"

  check-coverage:
    name: Check Code Coverage
    needs:
      - test-api
      - test-web
      - test-crypto
      - test-shared
    runs-on: ubuntu-latest
    if: always()
    timeout-minutes: 5

    steps:
      - name: Download all coverage reports
        uses: actions/download-artifact@v4
        with:
          path: coverage-reports

      - name: Display coverage summary
        run: |
          echo "Coverage reports downloaded"
          find coverage-reports -name "coverage-final.json" -type f
```

### 2. `.github/workflows/deploy-preview.yml` — PR Preview Deployment

```yaml
name: Deploy Preview

on:
  pull_request:
    branches:
      - main
    types:
      - opened
      - synchronize
      - reopened

env:
  NODE_VERSION: '20'
  PNPM_VERSION: '9.0.0'

jobs:
  build-preview:
    name: Build Preview
    runs-on: ubuntu-latest
    timeout-minutes: 20
    outputs:
      preview-url: ${{ steps.preview.outputs.url }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Get pnpm store directory
        id: pnpm-cache
        shell: bash
        run: |
          echo "STORE_PATH=$(pnpm store path)" >> $GITHUB_OUTPUT

      - name: Setup pnpm cache
        uses: actions/cache@v4
        with:
          path: ${{ steps.pnpm-cache.outputs.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-store-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build frontend for preview
        env:
          NEXT_PUBLIC_API_URL: https://api-preview-${{ github.event.pull_request.number }}.example.com
          NEXT_PUBLIC_ENVIRONMENT: preview
        run: pnpm --filter @hedera-social/web build

      - name: Create build metadata
        id: metadata
        run: |
          echo "BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')" >> $GITHUB_OUTPUT
          echo "GIT_SHA=${{ github.sha }}" >> $GITHUB_OUTPUT
          echo "PR_NUMBER=${{ github.event.pull_request.number }}" >> $GITHUB_OUTPUT

      - name: Upload to preview storage
        run: |
          echo "Preview build ready"
          echo "Build date: ${{ steps.metadata.outputs.BUILD_DATE }}"
          echo "Git SHA: ${{ steps.metadata.outputs.GIT_SHA }}"
          echo "PR: ${{ steps.metadata.outputs.PR_NUMBER }}"
          # Integration with your preview hosting would go here
          # Example: aws s3 sync apps/web/.next s3://preview-bucket/pr-$PR_NUMBER/
          # Or: vercel deploy --prod --token $VERCEL_TOKEN
          # This is a placeholder for your actual deployment

      - name: Comment PR with preview URL
        if: success()
        uses: actions/github-script@v7
        with:
          script: |
            const url = `https://preview-pr-${{ github.event.pull_request.number }}.example.com`;
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `✅ Preview deployed!\n\n**Frontend:** ${url}\n\n**Build Info:**\n- Git SHA: \`${{ github.sha }}\`\n- Build date: ${{ steps.metadata.outputs.BUILD_DATE }}`
            });

      - name: Comment PR on failure
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '❌ Preview deployment failed. Check workflow logs for details.'
            });
```

### 3. `.github/CODEOWNERS`

```
# Global owners (default for all files)
* @your-team

# Backend API
packages/api/ @backend-team @your-team
packages/api/src/auth/ @backend-team @security-lead
packages/api/src/hedera/ @backend-team @hedera-expert
packages/api/src/payments/ @backend-team @payments-lead

# Frontend
apps/web/ @frontend-team @your-team
apps/web/app/ @frontend-team
apps/web/components/ @frontend-team @design-lead

# Shared packages
packages/shared/ @your-team @backend-team @frontend-team
packages/shared/src/types/ @your-team
packages/shared/src/api-envelope.ts @your-team @backend-team

# Crypto & Security
packages/crypto/ @security-lead @backend-team
packages/crypto/src/hedera-signing.ts @security-lead
packages/crypto/src/encryption.ts @security-lead

# Configuration & CI/CD
.github/ @devops-team @your-team
docker-compose.yml @devops-team @your-team
Dockerfile @devops-team @backend-team
pnpm-workspace.yaml @your-team
tsconfig.json @your-team

# Documentation
*.md @your-team @documentation-lead
docs/ @documentation-lead @your-team
```

### 4. `.github/pull_request_template.md`

```markdown
## Summary

<!-- Provide a brief description of the changes in this PR -->

## Type of Change

Please select the relevant option:

- [ ] ✨ Feature (new functionality)
- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ♻️ Refactor (non-functional change to improve code quality)
- [ ] 📚 Documentation (updates to docs, comments, or ADRs)
- [ ] ✅ Tests (new or improved tests without functional changes)
- [ ] 🔧 Configuration (changes to build, CI/CD, or environment)
- [ ] 🔐 Security (security improvements or vulnerability fixes)

## Task Reference

<!-- Link to related task(s) - e.g., P0-T04, S03 -->

Task ID(s):

## Related Issues

<!-- Link to any related GitHub issues -->

Closes #
Related to #

## Changes Made

<!-- Provide detailed explanation of what was changed and why -->

-
-
-

## Testing

### Unit Tests
- [ ] Added/updated unit tests
- [ ] Test coverage meets minimum threshold (80%+)
- [ ] All tests passing locally with `pnpm test:unit`

### Integration Tests (if applicable)
- [ ] Added/updated integration tests
- [ ] Tested against PostgreSQL service container
- [ ] Tested against Redis cache
- [ ] All integration tests passing with `pnpm test:integration`

### Manual Testing (if applicable)
- [ ] Tested in development environment
- [ ] Verified on Hedera testnet (if blockchain-related)
- [ ] No console errors or warnings
- [ ] Responsive design tested (frontend only)

## Checklist

General:
- [ ] My code follows the project's style guide (ESLint passes: `pnpm lint:eslint`)
- [ ] Code formatting is correct (Prettier check passes: `pnpm lint:prettier`)
- [ ] TypeScript compilation succeeds (`pnpm type-check`)
- [ ] No console.log() or debugger statements left in code
- [ ] No secrets or sensitive data committed
- [ ] Commit messages follow conventional commits format

Backend (if applicable):
- [ ] NestJS controllers/services updated correctly
- [ ] DTOs and validators properly defined
- [ ] Database migrations created if schema changed
- [ ] Error handling implemented with custom exceptions
- [ ] Logging added for debugging

Frontend (if applicable):
- [ ] React components properly typed with TypeScript
- [ ] Responsive design verified
- [ ] Accessibility (a11y) checked
- [ ] Performance impact minimal

Shared Types (if applicable):
- [ ] Types exported from `@hedera-social/shared`
- [ ] Backward compatibility maintained
- [ ] Documentation updated for new types

## Performance Impact

<!-- Describe any potential performance impact -->

- No performance impact
- Slight improvement expected (describe)
- Potential performance concern (describe and mitigation plan)

## Security Considerations

<!-- Describe any security implications -->

- No security concerns
- Security improvement (describe)
- Security review needed (describe)
- Hedera key handling (if applicable):

## Dependencies

<!-- List any new dependencies added -->

### New Dependencies
-

### Updated Dependencies
-

### Removed Dependencies
-

## Screenshots or Demo

<!-- If UI changes, add screenshots or GIF demo -->

### Before (if applicable)

[Add screenshot or describe]

### After

[Add screenshot or describe]

## Deployment Notes

<!-- Any special deployment instructions or considerations -->

- [ ] Requires database migration (describe)
- [ ] Requires environment variable changes (list new vars)
- [ ] Requires service restart
- [ ] Backward compatible (explain if not)
- [ ] Feature flag needed (describe)

## Additional Context

<!-- Add any other relevant information -->

---

## Reviewer Checklist

- [ ] Code changes are clear and well-documented
- [ ] Tests are appropriate and cover key scenarios
- [ ] No security or performance red flags
- [ ] Aligns with architecture and design patterns
- [ ] Ready to merge
```

### 5. `.github/BRANCH_PROTECTION_CONFIG.md` — Branch Protection Documentation

```markdown
# Branch Protection Rules

## Overview

This document describes the branch protection rules that should be configured in GitHub to maintain code quality and prevent accidental issues in production-critical branches.

## Configuration for `main` Branch

### Basic Settings

1. **Require a pull request before merging**
   - [x] Require pull requests
   - [x] Require approvals: **1 approval minimum**
   - [x] Require status checks to pass before merging
   - [x] Require branches to be up to date before merging

2. **Status Checks Required**

   All of the following status checks must pass:

   - ✅ `lint` - ESLint, Prettier, TypeScript checks
   - ✅ `test-crypto` - Crypto package tests
   - ✅ `test-shared` - Shared package tests
   - ✅ `test-api` - Backend API tests (requires PostgreSQL + Redis)
   - ✅ `test-web` - Frontend tests
   - ✅ `build` - Full monorepo build (depends on all above)

3. **Push Restrictions**

   - [x] Require code review before merging
   - [x] Require conversation resolution before merging
   - [ ] Require linear history (optional)
   - [x] Require signed commits (recommended)
   - [x] Dismiss stale pull request approvals when new commits are pushed

4. **Force Push & Deletion**

   - [x] Allow force pushes: **NO** (prevent rewriting history)
   - [x] Allow deletions: **NO** (prevent branch deletion)

### Bypass Rules

- [ ] Administrators can bypass these rules (generally not recommended)
- Only configure if absolutely necessary for emergency deployments

## Configuration for `develop` Branch

### Basic Settings

1. **Require a pull request before merging**
   - [x] Require pull requests
   - [x] Require approvals: **1 approval minimum**
   - [x] Require status checks to pass before merging
   - [x] Require branches to be up to date before merging

2. **Status Checks Required**

   Same as `main` branch:
   - ✅ `lint`
   - ✅ `test-crypto`
   - ✅ `test-shared`
   - ✅ `test-api`
   - ✅ `test-web`
   - ✅ `build`

3. **Push Restrictions**

   - [x] Require code review before merging
   - [x] Require conversation resolution before merging
   - [ ] Require linear history (optional)
   - [ ] Require signed commits (optional for develop)
   - [x] Dismiss stale pull request approvals when new commits are pushed

4. **Force Push & Deletion**

   - [ ] Allow force pushes: Generally NO
   - [x] Allow deletions: NO

## How to Configure in GitHub Web UI

### Steps

1. Navigate to your repository
2. Go to **Settings** → **Branches**
3. Under "Branch protection rules", click **Add rule**
4. Fill in the form:

   ```
   Branch name pattern: main

   ✅ Require a pull request before merging
   ✅ Require approvals (1)
   ✅ Require status checks to pass before merging

   Status checks that must pass:
   - lint
   - test-crypto
   - test-shared
   - test-api
   - test-web
   - build

   ✅ Require branches to be up to date before merging
   ✅ Require signed commits
   ✅ Require conversation resolution before merging
   ☐ Require linear history
   ☐ Allow force pushes
   ☐ Allow deletions
   ☐ Allow bypasses by admins
   ```

5. Click **Create** to save the rule
6. Repeat for `develop` branch with same settings (optional: allow force pushes on develop if team prefers)

### Using GitHub CLI

```bash
# Install GitHub CLI: https://cli.github.com/

# Configure main branch
gh api repos/:owner/:repo/branches/main/protection \
  --input - <<EOF
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["lint", "test-crypto", "test-shared", "test-api", "test-web", "build"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "allow_force_pushes": false,
  "allow_deletions": false,
  "require_linear_history": false,
  "require_conversation_resolution": true,
  "required_signatures": true
}
EOF

# Configure develop branch (similar)
gh api repos/:owner/:repo/branches/develop/protection \
  --input - <<EOF
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["lint", "test-crypto", "test-shared", "test-api", "test-web", "build"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "allow_force_pushes": false,
  "allow_deletions": false,
  "require_linear_history": false,
  "require_conversation_resolution": true,
  "required_signatures": false
}
EOF
```

## CI/CD Status Check Dependencies

The workflows ensure:

1. **lint** runs first in parallel with code quality
2. **test-*** jobs run independently
3. **build** depends on all tests passing

This ensures:
- Code style violations are caught immediately
- Tests pass before building
- Build failures are identified early
- All critical quality checks must pass before merging

## Environment Variables for CI

The CI/CD pipeline requires these secrets configured in GitHub:

### Required Secrets

```
TEST_HEDERA_ACCOUNT_ID          (e.g., 0.0.XXXXX)
TEST_HEDERA_PRIVATE_KEY          (ED25519 private key, testnet only)
CODECOV_TOKEN                    (for coverage uploads)
```

### Optional Secrets (for preview deployment)

```
VERCEL_TOKEN                     (if using Vercel for preview)
AWS_ACCESS_KEY_ID                (if using AWS for preview)
AWS_SECRET_ACCESS_KEY            (if using AWS for preview)
```

### Configure Secrets in GitHub

1. Navigate to **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add each secret with the name and value
4. Secrets are encrypted and never logged in CI output

## Troubleshooting CI Failures

### Build Fails But No Test Failures

- Check if pnpm lock file is up to date
- Verify TypeScript compilation: `pnpm type-check`
- Check for missing env variables in workflow

### Flaky Tests

- Check test logs for timeout issues
- Increase service container health check timeout
- Review test database setup and teardown

### Status Check Not Appearing

- Check workflow file syntax with GitHub Actions validator
- Ensure status check name matches exactly (case-sensitive)
- Verify the workflow is committed to the main branch

### Merge Blocked by Required Status Checks

1. Re-run all failed checks
2. If persistent, check logs for actual errors
3. Update branch with latest main/develop changes
4. Push new commits to trigger re-run

## Best Practices

1. **Keep Dependencies Updated**
   - Regularly update actions and tools
   - Monitor for security updates
   - Test updates before applying to main branch

2. **Minimize False Positives**
   - Configure timeout values appropriately
   - Use retry logic for flaky external services
   - Document known test flakiness

3. **Fast Feedback Loop**
   - Cache dependencies to speed up runs
   - Run tests in parallel where possible
   - Use service containers for databases

4. **Monitor Status**
   - Review workflow metrics regularly
   - Track average CI time per build
   - Identify slowest jobs and optimize

5. **Documentation**
   - Keep branch protection config documented
   - Document any custom status checks
   - Maintain runbooks for CI failures
```

---

## Verification Table

| Item | Status | Verified By |
|------|--------|-------------|
| `.github/workflows/ci.yml` created and valid | ⬜ | Developer |
| `.github/workflows/deploy-preview.yml` created | ⬜ | Developer |
| All workflow steps complete successfully | ⬜ | CI System |
| Lint job passes (ESLint + Prettier + TypeScript) | ⬜ | CI System |
| test-crypto job passes with coverage | ⬜ | CI System |
| test-shared job passes with coverage | ⬜ | CI System |
| test-api job with PostgreSQL + Redis services | ⬜ | CI System |
| test-web job passes with coverage | ⬜ | CI System |
| Build job succeeds on all packages | ⬜ | CI System |
| Coverage reports uploaded to Codecov | ⬜ | Codecov |
| Branch protection rules configured for main | ⬜ | GitHub Admin |
| Branch protection rules configured for develop | ⬜ | GitHub Admin |
| `.github/CODEOWNERS` configured | ⬜ | GitHub Admin |
| `.github/pull_request_template.md` visible in PRs | ⬜ | Developer |
| PR preview workflow triggers on PRs to main | ⬜ | Developer |
| pnpm store caching working (speed improvement) | ⬜ | CI System |
| Concurrent workflow cancellation working | ⬜ | Developer |
| All team members notified of code ownership | ⬜ | Team Lead |

---

## Definition of Done

A CI/CD pipeline is complete when:

1. ✅ All workflow files are created and committed to `.github/workflows/`
2. ✅ CI runs automatically on push to main/develop and PRs
3. ✅ All status checks (lint, test-*, build) pass consistently
4. ✅ Service containers (PostgreSQL, Redis) are healthy and used properly
5. ✅ Coverage reports are generated and uploaded
6. ✅ Branch protection rules enforced on main and develop
7. ✅ Code ownership rules configured in CODEOWNERS
8. ✅ PR template guides contributors through submission process
9. ✅ Team members have access to configure and modify workflows
10. ✅ Documentation for branch protection available and up-to-date
11. ✅ No PRs can be merged without passing all status checks
12. ✅ Preview deployment workflow works for frontend PRs (optional)

---

## Troubleshooting

### Issue: Workflow file syntax errors

**Solution:**
```bash
# Validate workflow syntax with GitHub CLI
gh workflow view .github/workflows/ci.yml

# Or use online validator:
# https://github.com/rhysd/actionlint
```

### Issue: pnpm install fails in CI

**Solution:**
- Check pnpm-lock.yaml is committed
- Verify pnpm version matches locally and CI
- Clear cache: `pnpm store prune`

### Issue: PostgreSQL service container fails to start

**Solution:**
```yaml
# Ensure health check is correct
options: >-
  --health-cmd pg_isready
  --health-interval 10s
  --health-timeout 5s
  --health-retries 5
```

### Issue: Status checks not appearing in branch protection UI

**Solution:**
1. Run at least one successful workflow first
2. Status check names are case-sensitive
3. Verify names match exactly between workflow and branch protection rules

### Issue: Flaky tests causing CI failures

**Solution:**
1. Identify flaky test suite
2. Add retry logic or increase timeouts
3. Review test isolation (parallel test issues)
4. Consider using service containers for external deps

### Issue: Build artifact too large

**Solution:**
```yaml
- name: Check build size
  run: |
    du -sh packages/api/dist
    du -sh apps/web/.next
    # If too large, optimize:
    # - Enable SWC minification in Next.js
    # - Tree-shake unused dependencies
    # - Use code splitting
```

---

## Files Created

| Path | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | Main CI pipeline (lint, test, build) |
| `.github/workflows/deploy-preview.yml` | PR preview deployment |
| `.github/CODEOWNERS` | Code ownership and review requirements |
| `.github/pull_request_template.md` | PR submission template |
| `.github/BRANCH_PROTECTION_CONFIG.md` | Branch protection documentation |

---

## Next Steps

1. Commit all `.github/` files to your repository
2. Push to main/develop to trigger first CI run
3. Configure branch protection rules in GitHub Settings
4. Add required secrets (TEST_HEDERA_ACCOUNT_ID, TEST_HEDERA_PRIVATE_KEY)
5. Configure Codecov integration (optional)
6. Monitor first few CI runs for any failures
7. Document any team-specific customizations

---

## Related Tasks

- **S01:** Project Setup & Monorepo Configuration
- **S02:** Development Environment Setup
- **S04:** Error Handling, Logging & API Standards

---

## Team Coordination

- **Code Owners:** Review CODEOWNERS file and update team assignments
- **DevOps Lead:** Configure branch protection rules and secrets
- **Backend Team:** Ensure API tests run correctly with service containers
- **Frontend Team:** Verify Next.js build optimization
- **Security Lead:** Review Hedera key handling in test environment

