---
name: new-module
description: Scaffold a new NestJS module with the standard file structure, following all project conventions.
argument-hint: "[module-name e.g. conversations, payments]"
---

# Scaffold NestJS Module: $ARGUMENTS

Create the following structure under `packages/api/src/$ARGUMENTS/`:

```
$ARGUMENTS/
├── $ARGUMENTS.module.ts          # NestJS module with imports/providers/exports
├── $ARGUMENTS.controller.ts      # REST endpoints with Swagger decorators
├── $ARGUMENTS.service.ts         # Business logic with DI
├── dto/
│   ├── create-$ARGUMENTS.dto.ts  # class-validator decorators
│   └── update-$ARGUMENTS.dto.ts  # PartialType(Create)
├── entities/
│   └── $ARGUMENTS.entity.ts      # TypeORM entity with proper columns
├── exceptions/
│   └── $ARGUMENTS.exception.ts   # Custom exception extending BaseException
└── __tests__/
    ├── $ARGUMENTS.controller.spec.ts
    └── $ARGUMENTS.service.spec.ts
```

Rules:
- Module registered in app.module.ts
- Controller uses @ApiTags('$ARGUMENTS')
- Service injects Logger and ConfigService
- Entity has @CreateDateColumn and @UpdateDateColumn
- DTOs use class-validator: @IsString(), @IsNotEmpty(), etc.
- Exception has unique error code: `$ARGUMENTS_ERROR`
- Tests include at least: 1 success case, 1 error case per method
- All types exported to packages/shared

Reference `.claude/skills/hedera-social-dev/references/rules-and-standards.md` for exact patterns.
