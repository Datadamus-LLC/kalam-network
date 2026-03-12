---
name: new-component
description: Scaffold a new React component for the Next.js frontend with proper types, error boundary, and loading state.
argument-hint: "[component-name e.g. ChatWindow, PaymentModal]"
---

# Scaffold React Component: $ARGUMENTS

Determine if this is a page component or a UI component:

## If page component (has its own route):

Create in `apps/web/app/[route]/`:
- `page.tsx` — Server Component wrapper (data fetching)
- `_components/$ARGUMENTS.tsx` — Client Component (if needs interactivity)
- `loading.tsx` — Skeleton loading state
- `error.tsx` — Error boundary

## If UI component:

Create in `apps/web/components/`:
- `$ARGUMENTS.tsx` — Component with proper TypeScript interface for props
- `$ARGUMENTS.test.tsx` — Tests

## Rules for ALL components:

- Props interface defined and exported: `interface ${ARGUMENTS}Props { ... }`
- No `any` props — every prop typed
- 'use client' ONLY if uses hooks, event handlers, or browser APIs
- Tailwind classes only — no inline styles
- Loading states for async operations
- Error handling: try/catch in event handlers, display user-friendly messages
- Accessibility: semantic HTML, ARIA labels on buttons/inputs
- All API calls via typed API client from packages/shared

Reference `.claude/rules/frontend.md` for detailed standards.
