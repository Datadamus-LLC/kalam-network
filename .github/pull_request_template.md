## Summary

<!-- Provide a brief description of the changes in this PR -->

## Type of Change

- [ ] Feature (new functionality)
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] Refactor (non-functional change to improve code quality)
- [ ] Documentation (updates to docs, comments, or ADRs)
- [ ] Tests (new or improved tests without functional changes)
- [ ] Configuration (changes to build, CI/CD, or environment)
- [ ] Security (security improvements or vulnerability fixes)

## Task Reference

<!-- Link to related task(s) from tasks/ directory -->

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

### Tests
- [ ] Added/updated tests for changed code
- [ ] All tests passing locally with `pnpm test`
- [ ] Test coverage meets minimum threshold

### Manual Testing (if applicable)
- [ ] Tested in development environment
- [ ] Verified on Hedera testnet (if blockchain-related)
- [ ] No console errors or warnings

## Checklist

General:
- [ ] Code follows the project style guide (`pnpm lint` passes)
- [ ] TypeScript compilation succeeds (`pnpm type-check`)
- [ ] Full build succeeds (`pnpm build`)
- [ ] No `console.log()` or debugger statements left in code
- [ ] No `any` types or `@ts-ignore` comments
- [ ] No secrets or sensitive data committed
- [ ] No mocking, stubbing, or faking in tests
- [ ] Commit messages follow conventional commits format

Backend (if applicable):
- [ ] NestJS controllers/services follow module structure
- [ ] DTOs and validators properly defined with class-validator
- [ ] Error handling uses typed exception classes
- [ ] Logging uses NestJS Logger (not console.log)

Frontend (if applicable):
- [ ] React components properly typed with TypeScript
- [ ] Responsive design verified
- [ ] No hardcoded API URLs or config values

## Dependencies

### New Dependencies
-

### Updated Dependencies
-

## Deployment Notes

<!-- Any special deployment instructions or considerations -->

- [ ] Requires database migration
- [ ] Requires environment variable changes (list new vars)
- [ ] Backward compatible

## Additional Context

<!-- Add any other relevant information -->
