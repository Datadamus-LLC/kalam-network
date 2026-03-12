---
paths:
  - "packages/api/**/*.ts"
---

# NestJS Backend Rules

## Module Structure
Every module follows strict organization:
- `module.ts` - Module definition with imports/exports
- `controller.ts` - HTTP endpoints and request handling
- `service.ts` - Business logic and external service calls
- `dto/` - Data Transfer Objects with validation decorators
- `entities/` - TypeORM entity definitions
- `exceptions/` - Custom exception classes

## Dependency Injection
- Use NestJS dependency injection — **NEVER** instantiate services with `new`
- All dependencies injected via constructor using `@Inject()` decorator
- Services are singletons by default — be aware of state management
- Circular dependencies indicate architectural issues — refactor instead

## Data Transfer Objects (DTOs)
- Every endpoint input must have a corresponding DTO class
- Use `class-validator` decorators: `@IsString()`, `@IsNotEmpty()`, `@IsEmail()`, etc.
- Use `class-transformer` for type coercion and nested object transformation
- DTOs match exactly with `packages/shared` API types — maintain consistency across the codebase
- Validation happens globally via `ValidationPipe` — no manual validation in controllers

## Logging
- Use injected NestJS Logger (not `console.log`)
- Inject via constructor: `private readonly logger = new Logger(ClassName)`
- Log significant state changes, external API calls, and errors
- Include context: user ID, transaction ID, operation name
- Never log sensitive data: passwords, private keys, API keys

## API Response Format
Every endpoint returns the standard API envelope:
```typescript
{
  success: boolean;
  data: T;          // null if error
  error: {
    code: string;   // error code for client handling
    message: string;
    details?: any;
  } | null;
  timestamp: string; // ISO 8601
}
```

## Exception Handling
- Create custom exception classes extending `BaseException`
- Custom exceptions must define: `code` (error code), `statusCode` (HTTP status), `message`
- Global exception filter converts all exceptions to standard envelope format
- All thrown exceptions are typed — no generic Error class
- Empty catch blocks are **prohibited** — every catch must handle or re-throw

## Hedera Transactions
- All Hedera SDK calls go through dedicated service methods
- Never call `@hashgraph/sdk` directly in controllers
- Transaction service handles: client setup, fee management, retry logic, logging
- Every transaction includes: `maxTransactionFee`, `transactionMemo` (for debugging)
- Transaction ID logged for auditability

## Database
- TypeORM entities with proper column types and constraints
- Every entity has: `id` (primary key), `createdAt`, `updatedAt` (auto-managed)
- Indexes on frequently queried columns: foreign keys, status fields, timestamps
- Database migrations required for schema changes — generated and tracked in version control
- No raw SQL queries — use QueryBuilder for type safety
- Soft deletes: use `@DeleteDateColumn()` instead of hard deletes

## External API Integration
- Every service method calling external APIs has try/catch
- Exceptions are typed and converted to custom exceptions
- Timeout handling: set reasonable timeouts (prevent hanging)
- Rate limiting awareness: implement backoff strategies
- Response validation: validate structure before using

## Environment Variables
- All configuration accessed via `ConfigService` from `@nestjs/config`
- Configuration validated with Zod at application startup
- Validation failure causes application to fail fast (no silent errors)
- No hardcoded values — everything is configurable
- Type-safe config: define interface and validate against it

## Guards and Pipes
- `JwtAuthGuard` for protected endpoints — applied to specific routes or controllers
- `ValidationPipe` applied globally in `main.ts`
- Custom pipes for domain-specific validation
- Order matters: guards run first, then pipes

## Type Safety
- **NO `any` type** — use specific types or generics
- **NO `@ts-ignore`** — fix the underlying type issue
- **NO empty catch blocks** — handle or re-throw with typed exceptions
- Strict TypeScript configuration in `tsconfig.json`
