---
paths:
  - "apps/web/**/*.ts"
  - "apps/web/**/*.tsx"
---

# Next.js 14 Frontend Rules

## App Router Architecture
- Every route lives in `app/` directory with App Router
- Route structure: `app/[segment]/page.tsx` for pages, `layout.tsx` for shared layouts
- Nested routes naturally inherit parent layouts
- Dynamic routes: `[id]` for single parameter, `[...slug]` for catch-all
- File conventions: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`

## Server vs Client Components
- **Server Components by default** — all components are server components unless otherwise marked
- Add `'use client'` **ONLY** when needed:
  - Using React hooks: `useState`, `useEffect`, `useCallback`, etc.
  - Event listeners: `onClick`, `onChange`, etc.
  - Browser APIs: `localStorage`, `window`, `document`, etc.
  - Client-side libraries: React Query, Zustand, form libraries
- Never use `'use client'` for: fetching data, accessing databases, using secrets
- Server components can fetch data directly — no need for client-side loading states

## State Management
- **Server state** (API data): React Query (TanStack Query)
  - Handles caching, refetching, background updates, offline support
  - Query keys: `['resource', id]` for unique identification
  - Configure stale time, cache time, retry logic
  - Use `useQuery` in client components, `prefetchQuery` in server components
- **Client state** (UI state): Zustand
  - Lightweight, no boilerplate, TypeScript support
  - Store: separate files in `lib/stores/`
  - No global state for UI state — use local `useState` when possible
- **Form state**: `react-hook-form` with Zod resolver
  - Uncontrolled inputs (better performance)
  - Type-safe validation with `zod` resolver
  - Custom fields for complex inputs

## API Integration
- All API calls through typed API client
- API client types imported from `packages/shared`
- Request/response types must match backend DTOs
- No hardcoded API URLs — use environment variables: `NEXT_PUBLIC_API_URL`
- Build-time validation: environment variables validated before build completes
- Error handling: global error boundary catches and displays API errors

## Error Boundaries
- Every route/page wrapped in error boundary
- Implement `error.tsx` for route-level error pages
- Global error boundary at root layout for unhandled errors
- Error boundary shows user-friendly message, not stack trace
- Errors logged to monitoring service with context

## Loading States
- Every async operation displays loading UI
- Use Skeleton components for content placeholders
- Loading UI matches content structure (same height/width)
- Avoid "flash of unstyled content" — pre-render skeleton before data loads
- Progressive enhancement: show partial content as it loads (streaming)

## Forms
- Use `react-hook-form` with `zod` resolver for validation
- All inputs managed by react-hook-form (uncontrolled by default for performance)
- Validation rules defined in Zod schema (matches backend)
- Form state: pristine, dirty, touched, invalid states automatically tracked
- Error messages: display validation error from schema, not hardcoded
- Submit buttons disabled until form valid
- No form submission on validation error

## Styling
- **Tailwind CSS only** — no inline styles, no CSS modules, no other CSS frameworks
- Utility-first approach: compose styles from Tailwind classes
- Dark mode support via Tailwind dark mode configuration
- Responsive design: mobile-first, use `sm:`, `md:`, `lg:` prefixes
- Custom colors/spacing: extend Tailwind config in `tailwind.config.ts`
- No hardcoded colors — use Tailwind color palette only

## Cryptography
- All crypto operations (AES-256-GCM) happen **client-side only**
- Crypto functions from `packages/crypto` package
- **NEVER** send unencrypted messages to API
- Message encryption before sending: ciphertext, IV, tag all base64 encoded
- Message decryption on receive: validate format, extract components, decrypt
- Encrypted keys stored in IndexedDB (via crypto package)
- No keys sent to server in plaintext

## Environment Variables
- All config accessed via `process.env.NEXT_PUBLIC_*` (public), `process.env.*` (server-only)
- `NEXT_PUBLIC_*` variables validated at build time
- No hardcoded URLs, API endpoints, or configuration
- `.env.local` for development, `.env.production` for production
- Type safety: define `env.ts` with validation schema for all env vars
- Build fails if required env vars missing — no silent failures

## Accessibility
- Semantic HTML: `<button>`, `<input>`, `<nav>`, `<main>`, etc. (not `<div>` roles)
- ARIA labels on interactive elements without text: `aria-label`, `aria-describedby`
- Focus management: keyboard navigation works, focus visible, logical tab order
- Color contrast: text meets WCAG AA standard (minimum 4.5:1)
- Form labels: `<label htmlFor={id}>` associated with inputs
- Alt text on images: descriptive, concise
- Screen reader testing: manual testing with screen readers

## Type Safety
- **NO `any` type** — use specific types or generics
- **NO `@ts-ignore`** — fix the underlying type issue
- **NO `console.log` in production code** — use monitoring service instead
- Strict TypeScript configuration: `strict: true` in `tsconfig.json`
- Component props typed with React.FC<Props> or function signature
- Event handlers properly typed: `React.FormEvent<HTMLFormElement>`

## Performance
- Code splitting: dynamic imports for heavy components
- Image optimization: `next/image` with lazy loading
- Font optimization: self-hosted fonts or system fonts, avoid Google Fonts in browser
- Bundle analysis: monitor bundle size in CI/CD
- Avoid prop drilling: use context or store for deeply nested data
- Memoization: use `React.memo()` only when proven necessary (measure first)
