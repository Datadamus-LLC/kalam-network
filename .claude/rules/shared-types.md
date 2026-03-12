---
paths:
  - "packages/shared/**/*.ts"
---

# Shared Types Package Rules

## Package Purpose
This package contains **ONLY**:
- TypeScript types and interfaces
- Zod validation schemas
- Constants and enums
- Utility types and type helpers
- No business logic
- No runtime implementations (except Zod validation)

This is a **types-only package** with the single exception of Zod as the validation runtime.

## Dependencies
- **Only Zod is allowed as a runtime dependency** — all other dependencies are type definitions
- `typescript` for type checking
- `zod` for schema validation at boundaries (API, HCS messages)
- No other npm packages — keep this package lightweight and dependency-free
- Re-export types from other packages only if necessary

## Export Convention
- Every type must be exported from `packages/shared/index.ts`
- Organize exports by concern: `api.ts`, `blockchain.ts`, `crypto.ts`, `entities.ts`
- File structure mirrors domain: `types/`, `schemas/`, `constants/`
- Single source of truth for each type — defined once, exported from index

## API Types
- Request types and response types must match DTOs in `packages/api` exactly
- Zod schemas for validation at API boundaries (client and server)
- Example structure:
  ```typescript
  // schemas/api.ts
  export const CreateMessageRequestSchema = z.object({
    topicId: z.string().uuid(),
    content: z.string().min(1).max(5000),
  });

  export type CreateMessageRequest = z.infer<typeof CreateMessageRequestSchema>;

  export const CreateMessageResponseSchema = z.object({
    success: z.boolean(),
    data: z.object({
      id: z.string().uuid(),
      topicId: z.string().uuid(),
      createdAt: z.string().datetime(),
    }).nullable(),
    error: z.object({
      code: z.string(),
      message: z.string(),
    }).nullable(),
  });

  export type CreateMessageResponse = z.infer<typeof CreateMessageResponseSchema>;
  ```

## HCS Message Payloads
- Every HCS message payload type must include `version` field
- `version` enables backward compatibility (number or string, application-defined)
- Example:
  ```typescript
  export interface HCSMessagePayload {
    version: 1;
    timestamp: string; // ISO 8601
    // ... other fields
  }
  ```
- Zod schema validates structure before posting to HCS
- Mirror Node responses validated against same schema

## Branded Types
All IDs typed as branded types (not plain strings):
```typescript
export type AccountId = string & { readonly brand: 'AccountId' };
export type TopicId = string & { readonly brand: 'TopicId' };
export type TokenId = string & { readonly brand: 'TokenId' };
export type ConversationId = string & { readonly brand: 'ConversationId' };
export type UserId = string & { readonly brand: 'UserId' };

// Helper functions to create branded types
export function createAccountId(value: string): AccountId {
  return value as AccountId;
}

export function createTopicId(value: string): TopicId {
  return value as TopicId;
}
```

Benefits:
- Prevents mixing ID types (TypeScript catches at compile time)
- `AccountId` not accidentally used as `TopicId`
- Runtime validation happens in services (not type level)

## Enums
- Use **string values**, not numeric
- String enums are self-documenting and serialization-safe
- Example:
  ```typescript
  export enum MessageStatus {
    PENDING = 'pending',
    SENT = 'sent',
    FAILED = 'failed',
  }

  export enum UserRole {
    ADMIN = 'admin',
    MODERATOR = 'moderator',
    USER = 'user',
  }
  ```
- String enums serialize to readable values in JSON

## Type Safety Rules
- **NO `any` type** — use specific types or `unknown`
- **NO `unknown` without type narrowing** — if used, narrow before access
- **NO type assertions (`as`) without runtime check** — when forced to use, add validation
  ```typescript
  // Good: runtime check first
  if (typeof value === 'string') {
    const accountId = value as AccountId;
  }

  // Bad: no validation
  const accountId = value as AccountId; // NO
  ```
- Discriminated unions for type safety
- Example:
  ```typescript
  export type Result<T> =
    | { success: true; data: T }
    | { success: false; error: ErrorDetails };
  ```

## Constants
- Define once in `constants.ts`
- Exported with clear naming: `MAX_MESSAGE_LENGTH`, `DEFAULT_TIMEOUT_MS`, `HEDERA_NETWORK`
- Group related constants together
- Include comments for non-obvious values
- Example:
  ```typescript
  export const HEDERA_ACCOUNT_ID_LENGTH = 10; // "0.0.123456789"
  export const MESSAGE_MAX_LENGTH = 5000;
  export const TOPIC_ID_PATTERN = /^0\.0\.\d+$/;
  ```

## Compatibility
- API response type evolution: add optional fields only, never remove
- HCS message payloads: always include `version` for migrations
- Type versioning: `MessageV1`, `MessageV2` if breaking changes needed
- Maintain backward compatibility across versions

## Testing
- Types are not tested directly (they're compile-time only)
- Zod schemas are tested: valid inputs accepted, invalid inputs rejected
- Example test:
  ```typescript
  describe('CreateMessageRequestSchema', () => {
    it('accepts valid request', () => {
      const data = { topicId: 'uuid', content: 'hello' };
      expect(() => CreateMessageRequestSchema.parse(data)).not.toThrow();
    });

    it('rejects missing topicId', () => {
      const data = { content: 'hello' };
      expect(() => CreateMessageRequestSchema.parse(data)).toThrow();
    });
  });
  ```
