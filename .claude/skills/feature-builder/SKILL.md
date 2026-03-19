# Feature Builder — Implement Missing Platform Features

## Purpose

Implement missing features identified by the gap analysis. You receive a prioritized list of gaps and build them out — full NestJS modules with controllers, services, DTOs, entities, exceptions, and proper module registration. Every feature must compile, pass lint, and be smoke-testable.

## ABSOLUTE RULES (from CLAUDE.md)

- NEVER use jest.fn(), jest.mock(), jest.spyOn() or ANY mocking
- NEVER use `any` type or `@ts-ignore`
- NEVER use console.log — NestJS Logger ONLY
- NEVER hardcode config — use env vars via ConfigService
- NEVER throw generic Error — use typed exception classes
- NEVER use setTimeout for async — use proper async/await
- Follow NestJS module structure: controller → service → dto → entity → exceptions
- NEVER DELETE existing functionality — you are ADDING, not replacing
- NEVER remove endpoints, services, or features that already work

---

## CRITICAL: NO DESTRUCTIVE CHANGES

**You are BUILDING, not destroying.** Every line of existing code that currently works MUST continue to work after your changes. Specifically:

1. **NEVER delete a controller method** that responds to requests
2. **NEVER remove a service method** that other code depends on
3. **NEVER drop a database column or table** that has data
4. **NEVER change a working API response format** unless adding backward-compatible fields
5. **NEVER remove imports** that other modules use
6. If you need to REFACTOR something, ensure the old behavior still works identically

If you break existing functionality, you have failed. Build does NOT pass if any existing test regresses.

---

## PHASE 1: Read the Gap Analysis

Read `.claude/state/gap-analysis.md` and `.claude/state/gap-list.md` to understand:
- What gaps exist (CRITICAL, IMPORTANT, NICE-TO-HAVE)
- The implementation order
- Dependencies between gaps

Also read:
- `CLAUDE.md` — project rules
- `docs/ARCHITECTURE.md` — architecture patterns to follow
- `docs/SPECIFICATION.md` — detailed feature specs
- `.claude/skills/hedera-social-dev/references/` — integration docs

## PHASE 2: Implement Each Gap

For each gap, in priority order:

### Standard NestJS Module Structure

```
packages/api/src/modules/{feature}/
├── {feature}.module.ts          # Module with imports, controllers, providers
├── {feature}.controller.ts      # REST endpoints with guards, decorators
├── services/
│   └── {feature}.service.ts     # Business logic
├── dto/
│   ├── create-{feature}.dto.ts  # Input validation (class-validator)
│   └── {feature}-response.dto.ts
├── entities/
│   └── {feature}.entity.ts      # TypeORM entity
└── exceptions/
    └── {feature}.exceptions.ts  # Typed exception classes
```

### Implementation Checklist Per Feature

1. **Entity** — Define the TypeORM entity with proper column types, relations, indexes
2. **DTOs** — Create input DTOs with class-validator decorators, response DTOs with proper types
3. **Exceptions** — Create typed exception classes (extend HttpException)
4. **Service** — Implement business logic with proper error handling, Logger, ConfigService
5. **Controller** — Wire up REST endpoints with:
   - `@UseGuards(JwtAuthGuard)` on protected routes
   - `@HttpCode()` for non-201 POST responses
   - Proper `@ApiTags()`, `@ApiOperation()` decorators
   - Input validation via `@Body()` with DTO
   - Proper error responses
6. **Module** — Register everything: imports, controllers, providers, exports
7. **App Module** — Import the new module in `app.module.ts`
8. **Migration** — If new tables needed, TypeORM will auto-sync in dev (but note the entity)

### Hedera Integration Patterns

When building features that interact with Hedera:

```typescript
// HCS: Submit message to a topic
const receipt = await this.hederaService.submitMessage(topicId, payload);

// HTS: Mint NFT
const receipt = await this.hederaService.mintNft(tokenId, metadata);

// Custody: Sign transaction via MPC
const result = await this.tamamCustodyService.signTransaction(
  vaultId, transactionBytes, amount, destinationAddress
);

// Mirror Node: Query data
const response = await this.hederaService.queryMirrorNode(path);
```

### Database Patterns

```typescript
// Entity with proper relations
@Entity('table_name')
export class FeatureEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

## PHASE 3: Build & Validate

After implementing ALL gaps for this iteration:

```bash
# 1. Build shared package
cd packages/shared && pnpm build && cd ../..

# 2. Build API
cd packages/api && pnpm build && cd ../..

# 3. Lint
pnpm lint

# 4. Test (must not regress)
pnpm test
```

**Zero regressions allowed.** If existing tests break, your changes are wrong — fix them.

## PHASE 4: Smoke Test

Start the app and verify each new feature:

```bash
cd packages/api && node dist/main &
sleep 10

# Test each new endpoint
curl -s http://localhost:3333/api/v1/{new-endpoint} | jq .

kill %1
```

## PHASE 5: Report

Write results to `.claude/state/feature-builder-report.md`:

```markdown
# Feature Builder Report — [timestamp]

## Summary
- Gaps addressed: X
- Features implemented: Y
- Build: PASS/FAIL
- Lint: PASS/FAIL
- Tests: X passing, Y failing (0 regressions)

## Implemented Features

### GAP-001: [Feature Name]
- **Status**: IMPLEMENTED / PARTIAL / BLOCKED
- **Files created**: [list]
- **Files modified**: [list]
- **Endpoints added**: [list with methods]
- **Database tables**: [new tables]
- **Smoke test**: PASS/FAIL
- **Notes**: [any caveats]

### GAP-002: ...

## Still Missing
- GAP-XXX: [reason — missing credentials, depends on another gap, etc.]
```

If ALL critical gaps are implemented: write `ALL CRITICAL GAPS IMPLEMENTED` at the top.

---

## CROSS-REPO ACCESS

The Tamam Custody backend source code is at:
  `../olara-mobile-app/packages/backend/src/`

Key files:
- Routes: `../olara-mobile-app/packages/backend/src/routes/custody.routes.ts`
- HMAC signing: `../olara-mobile-app/packages/backend/src/middleware/request-signing.middleware.ts`

When building custody-related features, read the REAL API to ensure compatibility.

## ENVIRONMENT

- PostgreSQL: localhost:5433 (user: test, pass: test, db: hedera_social_test)
- Redis: localhost:6380
- Hedera credentials: .env
- Tamam Custody: TAMAM_CUSTODY_* in .env
- Mirror node: https://testnet.mirrornode.hedera.com/api/v1/
