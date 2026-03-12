# S01: Code Quality & Linting Rules

**Hedera Blockchain Social Platform Hackathon — Engineering Standards**

---

## Task Metadata

| Field | Value |
|-------|-------|
| **Task ID** | S01 |
| **Priority** | 🔴 **P0** — Do Immediately After T01 |
| **Estimated Time** | 2 hours |
| **Depends On** | P0-T01 (Monorepo Init) |
| **Phase** | Supplementary — Engineering Standards |
| **Assignee** | Any developer (ideally tech lead) |
| **Status** | ⏳ Ready to Start |
| **Last Updated** | 2026-03-11 |

---

## Overview

This task establishes **consistent code quality, linting, formatting, and commit standards** across the entire Hedera blockchain social platform monorepo. It ensures:

- **Code style consistency** across all packages (api, web, shared, crypto)
- **Automated formatting** with Prettier and ESLint
- **Pre-commit hooks** to prevent bad code from being committed
- **TypeScript strict mode** to catch type errors early
- **Conventional commit messages** for semantic versioning
- **IDE-level consistency** with EditorConfig and VS Code settings

All junior developers will work within these standardized rules, reducing code review friction and improving maintainability.

---

## Technical Stack

- **Monorepo**: pnpm workspaces
- **Apps**: `apps/web` (Next.js)
- **Packages**: `packages/api` (NestJS), `packages/shared` (Types), `packages/crypto` (Encryption)
- **Linting**: ESLint + TypeScript plugin
- **Formatting**: Prettier
- **Pre-commit Hooks**: Husky + lint-staged
- **Commit Convention**: Commitlint + Conventional Commits
- **Type Checking**: TypeScript strict mode

---

## Step 1: Install Root-Level Linting Dependencies

From the monorepo **root directory**, install all linting tools at the workspace level:

```bash
pnpm add -Dw \
  eslint \
  @typescript-eslint/eslint-plugin \
  @typescript-eslint/parser \
  eslint-plugin-import \
  eslint-config-prettier \
  prettier \
  husky \
  lint-staged \
  @commitlint/cli \
  @commitlint/config-conventional \
  commitlint
```

**Breaking down each package:**

- **eslint** (^8.50.0): Core linting engine
- **@typescript-eslint/eslint-plugin**: Rules for TypeScript best practices
- **@typescript-eslint/parser**: Parser to understand TypeScript syntax
- **eslint-plugin-import**: Rules for import/export organization and cycle detection
- **eslint-config-prettier**: Disables ESLint rules that conflict with Prettier
- **prettier** (^3.0.0): Code formatter
- **husky** (^8.0.0): Git hooks framework
- **lint-staged** (^13.0.0): Run linters on staged files
- **@commitlint/cli** & **@commitlint/config-conventional**: Enforce conventional commits
- **commitlint**: Commit message linting

---

## Step 2: Create Root `.eslintrc.js`

**File path**: `/eslintrc.js` (at monorepo root)

```javascript
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: ['./tsconfig.base.json', './packages/*/tsconfig.json', './apps/*/tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  env: {
    node: true,
    es2020: true,
    browser: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:import/errors',
    'plugin:import/warnings',
    'plugin:import/typescript',
    'prettier',
  ],
  plugins: ['@typescript-eslint', 'import'],
  rules: {
    // ESLint Core Rules
    'no-console': ['error', { allow: [] }], // Strict: no console at all, use NestJS Logger
    'no-debugger': 'error',
    'no-unused-vars': 'off', // Handled by TypeScript plugin
    'prefer-const': 'error',
    'no-var': 'error',
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],
    'brace-style': ['error', '1tbs'],
    'semi': ['error', 'always'],
    'quotes': ['error', 'single', { avoidEscape: true }],
    'comma-dangle': ['error', 'always-multiline'],
    'arrow-parens': ['error', 'always'],
    'object-curly-spacing': ['error', 'always'],
    'indent': ['error', 2, { SwitchCase: 1 }],
    'max-len': ['warn', { code: 100, ignoreUrls: true, ignoreComments: true }],

    // TypeScript-specific Rules
    '@typescript-eslint/explicit-function-return-types': [
      'warn',
      {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
        allowHigherOrderFunctions: true,
      },
    ],
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    '@typescript-eslint/naming-convention': [
      'error',
      {
        selector: 'variable',
        format: ['camelCase', 'UPPER_CASE'],
        leadingUnderscore: 'allow',
        trailingUnderscore: 'allow',
      },
      {
        selector: 'function',
        format: ['camelCase'],
        leadingUnderscore: 'allow',
      },
      {
        selector: 'typeLike',
        format: ['PascalCase'],
      },
      {
        selector: 'enumMember',
        format: ['UPPER_CASE'],
      },
    ],
    '@typescript-eslint/explicit-module-boundary-types': [
      'warn',
      { allowArgumentsExplicitlyTypedAsAny: true },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/no-unnecessary-condition': 'warn',
    '@typescript-eslint/restrict-template-expressions': [
      'warn',
      { allowNumber: true, allowBoolean: true },
    ],
    '@typescript-eslint/prefer-nullish-coalescing': 'warn',
    '@typescript-eslint/prefer-optional-chain': 'warn',
    '@typescript-eslint/no-explicit-any': 'error', // Strict: no implicit any

    // Banned Patterns - Project Rules Enforcement
    'no-restricted-syntax': [
      'error',
      {
        selector: "CallExpression[callee.object.name='jest'][callee.property.name='fn']",
        message: 'jest.fn() is banned. Use real services instead of mocking. See CLAUDE.md for testing rules.',
      },
      {
        selector: "CallExpression[callee.object.name='jest'][callee.property.name='mock']",
        message: 'jest.mock() is banned. Use real services instead of mocking. See CLAUDE.md for testing rules.',
      },
      {
        selector: "CallExpression[callee.object.name='jest'][callee.property.name='spyOn']",
        message: 'jest.spyOn() is banned. Use real services instead of mocking. See CLAUDE.md for testing rules.',
      },
    ],
    'no-restricted-imports': [
      'error',
      {
        name: 'sinon',
        message: 'sinon is banned. Use real services instead of mocking. See CLAUDE.md for testing rules.',
      },
      {
        name: 'nock',
        message: 'nock is banned. Use real services instead of mocking. See CLAUDE.md for testing rules.',
      },
      {
        name: 'proxyquire',
        message: 'proxyquire is banned. Use real services instead of mocking. See CLAUDE.md for testing rules.',
      },
      {
        name: 'testdouble',
        message: 'testdouble is banned. Use real services instead of mocking. See CLAUDE.md for testing rules.',
      },
    ],

    // Import Rules
    'import/order': [
      'error',
      {
        groups: [
          'builtin',
          'external',
          'internal',
          ['parent', 'sibling'],
          'index',
        ],
        pathGroups: [
          {
            pattern: '@/**',
            group: 'internal',
            position: 'before',
          },
        ],
        alphabeticallyOptions: {
          order: 'asc',
          caseInsensitive: true,
        },
        newlines: 'always',
        'newlines-between': 'always',
      },
    ],
    'import/no-unresolved': 'error',
    'import/no-cycle': ['error', { maxDepth: 3 }],
    'import/no-unused-modules': ['warn', { unusedExports: true }],
    'import/newline-after-import': 'error',
    'import/no-default-export': 'off', // Next.js pages need default exports
  },
  overrides: [
    {
      files: ['*.spec.ts', '*.test.ts', '**/__tests__/**/*.ts'],
      env: { jest: true },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        'max-len': 'off',
      },
    },
    {
      files: ['apps/web/**/*.{ts,tsx}'],
      rules: {
        'import/no-default-export': 'off', // Next.js pages require default exports
      },
    },
    {
      files: ['packages/api/**/*.ts'],
      rules: {
        '@typescript-eslint/explicit-function-return-types': 'error',
      },
    },
  ],
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: ['./tsconfig.base.json', './packages/*/tsconfig.json', './apps/*/tsconfig.json'],
      },
    },
  },
};
```

### 2B: Understanding the Banned Patterns Rules

The root ESLint configuration enforces the project's core rule: **No Mocking. No Faking. No Simulating.**

**Key Rules Enforced:**

1. **`no-console` set to `error`** — All `console.log()`, `console.warn()`, etc. are banned. Use NestJS Logger instead.
   - Exception: Can be overridden per-package (e.g., CLI scripts may need console output)

2. **`@typescript-eslint/no-explicit-any` set to `error`** — All `any` type assertions are banned, including `as any` and implicit anys. Use explicit types.

3. **`no-restricted-syntax` rules ban:**
   - `jest.fn()` — banned, use real services
   - `jest.mock()` — banned, use real services
   - `jest.spyOn()` — banned, use real services

4. **`no-restricted-imports` rules ban mock libraries:**
   - `sinon` — banned, use real services
   - `nock` — banned, use real services
   - `proxyquire` — banned, use real services
   - `testdouble` — banned, use real services

**What This Means for Developers:**

- **Testing**: Every test must use REAL databases (PostgreSQL), REAL caches (Redis), and REAL blockchain calls (Hedera Testnet). No mocks, no stubs, no fixtures.
- **Typing**: Every variable and parameter must have an explicit type. No `any`, no `unknown` without narrowing.
- **Logging**: Use the NestJS Logger service in backend code, not `console.log()`.

**Valid Example:**
```typescript
// Good: Real service test
const db = new TypeORM_Connection();
const user = await db.users.create({ name: 'John' });
expect(user.id).toBeDefined();

// Bad: Mocked test (will fail linter)
jest.mock('database');
const db = jest.fn();
```

---

## Step 3: Create Package-Specific ESLint Configurations

### 3A: `packages/api/.eslintrc.js` (NestJS)

**File path**: `packages/api/.eslintrc.js`

```javascript
module.exports = {
  extends: ['../../.eslintrc.js'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  env: {
    node: true,
  },
  rules: {
    '@typescript-eslint/explicit-function-return-types': 'error',
    '@typescript-eslint/explicit-module-boundary-types': 'error',
    'no-console': ['warn', { allow: ['error', 'warn'] }],
  },
  overrides: [
    {
      files: ['src/main.ts'],
      rules: {
        '@typescript-eslint/explicit-function-return-types': 'off',
      },
    },
  ],
};
```

### 3B: `apps/web/.eslintrc.js` (Next.js)

**File path**: `apps/web/.eslintrc.js`

```javascript
module.exports = {
  extends: ['../../.eslintrc.js', 'next/core-web-vitals'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  env: {
    browser: true,
    node: true,
  },
  rules: {
    'import/no-default-export': 'off',
    '@next/next/no-html-link-for-pages': 'off',
    '@typescript-eslint/explicit-function-return-types': 'off',
    'react/display-name': 'off',
  },
  overrides: [
    {
      files: ['pages/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'],
      rules: {
        'import/no-default-export': 'off',
      },
    },
  ],
};
```

### 3C: `packages/shared/.eslintrc.js` (Shared Types)

**File path**: `packages/shared/.eslintrc.js`

```javascript
module.exports = {
  extends: ['../../.eslintrc.js'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  rules: {
    '@typescript-eslint/explicit-function-return-types': 'warn',
    'max-len': 'off', // Type definitions can be long
  },
};
```

### 3D: `packages/crypto/.eslintrc.js` (Encryption)

**File path**: `packages/crypto/.eslintrc.js`

```javascript
module.exports = {
  extends: ['../../.eslintrc.js'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  env: {
    node: true,
  },
  rules: {
    '@typescript-eslint/explicit-function-return-types': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    'no-console': 'error',
  },
};
```

---

## Step 4: Create Prettier Configuration

### 4A: Root `.prettierrc`

**File path**: `/.prettierrc`

```json
{
  "semi": true,
  "trailingComma": "all",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf",
  "bracketSpacing": true,
  "jsxSingleQuote": false,
  "proseWrap": "preserve",
  "htmlWhitespaceSensitivity": "css"
}
```

### 4B: Root `.prettierignore`

**File path**: `/.prettierignore`

```
# Dependencies
node_modules
pnpm-lock.yaml
package-lock.json
yarn.lock

# Build outputs
dist
build
out
.next
coverage
.turbo

# Environment
.env
.env.local
.env.*.local

# IDE
.idea
.vscode
*.swp
*.swo
*~
.DS_Store

# Generated files
*.generated.ts
*.generated.js
codegen.yml

# Documentation
docs

# Temporary
tmp
temp
.tmp
```

---

## Step 5: Create EditorConfig

**File path**: `/.editorconfig`

```
# EditorConfig is awesome: https://EditorConfig.org

# top-most EditorConfig file
root = true

# Unix-style newlines with a newline ending every file
[*]
end_of_line = lf
insert_final_newline = true
charset = utf-8
trim_trailing_whitespace = true

# JavaScript, TypeScript, JSON
[*.{js,jsx,ts,tsx,json}]
indent_style = space
indent_size = 2

# YAML
[*.{yaml,yml}]
indent_style = space
indent_size = 2

# Markdown
[*.md]
trim_trailing_whitespace = false
max_line_length = 100

# Markdown in code blocks should not be formatted
[*.md]
insert_final_newline = false
```

---

## Step 6: Set Up Husky & lint-staged

### 6A: Initialize Husky

From the monorepo root:

```bash
npx husky init
```

This creates the `.husky` directory and updates package.json.

### 6B: Create Pre-commit Hook

**File path**: `.husky/pre-commit`

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "🔍 Running lint-staged..."
pnpm lint-staged

if [ $? -ne 0 ]; then
  echo "❌ Lint-staged check failed. Please fix errors and try again."
  exit 1
fi

echo "✅ Pre-commit checks passed!"
```

Make it executable:

```bash
chmod +x .husky/pre-commit
```

### 6C: Create Commit Message Hook

**File path**: `.husky/commit-msg`

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "📝 Validating commit message..."
npx commitlint --edit "$1"

if [ $? -ne 0 ]; then
  echo "❌ Commit message validation failed. Please follow Conventional Commits format."
  exit 1
fi

echo "✅ Commit message is valid!"
```

Make it executable:

```bash
chmod +x .husky/commit-msg
```

### 6D: Add lint-staged Configuration to Root package.json

In the root `package.json`, add:

```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{js,jsx,mjs}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md,yml,yaml}": [
      "prettier --write"
    ]
  }
}
```

---

## Step 7: Configure Commitlint

**File path**: `commitlint.config.js`

```javascript
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',      // A new feature
        'fix',       // A bug fix
        'docs',      // Documentation only changes
        'style',     // Changes that do not affect the meaning of the code (formatting, etc.)
        'refactor',  // A code change that neither fixes a bug nor adds a feature
        'perf',      // A code change that improves performance
        'test',      // Adding missing tests or correcting existing tests
        'chore',     // Changes to build process, dependencies, or tooling
        'ci',        // Changes to CI/CD configuration
        'build',     // Changes that affect the build system
      ],
    ],
    'scope-enum': [
      1, // Warning, not error
      'always',
      [
        'api',           // API package (NestJS)
        'web',           // Web app (Next.js)
        'shared',        // Shared types and utilities
        'crypto',        // Crypto package
        'hedera',        // Hedera integration
        'auth',          // Authentication
        'messaging',     // Messaging system
        'social',        // Social features
        'payments',      // Payment integration
        'notifications', // Notifications
        'infra',         // Infrastructure
        'monorepo',      // Monorepo-level changes
      ],
    ],
    'subject-max-length': [2, 'always', 100],
    'subject-min-length': [2, 'always', 10],
    'subject-empty': [2, 'never'],
    'type-case': [2, 'always', 'lowercase'],
    'type-empty': [2, 'never'],
  },
};
```

---

## Step 8: Add NPM Scripts to Root package.json

In the root `package.json`, add these scripts:

```json
{
  "scripts": {
    "lint": "eslint . --ext .ts,.tsx,.js,.jsx",
    "lint:fix": "eslint . --ext .ts,.tsx,.js,.jsx --fix",
    "format": "prettier --write '**/*.{ts,tsx,js,jsx,json,md,yml,yaml}'",
    "format:check": "prettier --check '**/*.{ts,tsx,js,jsx,json,md,yml,yaml}'",
    "type-check": "tsc -b --noEmit",
    "validate": "pnpm lint && pnpm format:check && pnpm type-check",
    "prepare": "husky install"
  }
}
```

**Script descriptions:**

- `lint`: Check for ESLint violations
- `lint:fix`: Automatically fix ESLint violations
- `format`: Format all files with Prettier
- `format:check`: Check if files are formatted correctly
- `type-check`: Run TypeScript type checking across all packages
- `validate`: Run all checks (lint, format, type-check) — use before committing manually
- `prepare`: Install Husky hooks (runs automatically on `npm install`)

---

## Step 9: TypeScript Strict Mode Configuration

### 9A: Root `tsconfig.base.json` (Compiler Options)

**File path**: `tsconfig.base.json`

Key compiler options enforcing strict type checking:

```json
{
  "compilerOptions": {
    // Strict Mode
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,

    // Additional Strict Checks
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,

    // Module Resolution
    "module": "esnext",
    "target": "es2020",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,

    // Emit
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "removeComments": false,
    "importHelpers": true,

    // Output
    "outDir": "./dist",
    "rootDir": "./src",

    // Paths
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "build", ".next"]
}
```

**What these options enforce:**

- **strict: true** — Enables all strict type-checking options
- **noUncheckedIndexedAccess: true** — Require explicit type guards when accessing object keys
- **noImplicitReturns: true** — Error if function doesn't always return a value
- **noFallthroughCasesInSwitch: true** — Error if switch cases don't have break/return
- **noPropertyAccessFromIndexSignature: true** — Prevent unsafe property access via index
- **noUnusedLocals: true** — Error on unused local variables
- **noUnusedParameters: true** — Error on unused function parameters (use `_` prefix to disable)

---

## Step 10: VS Code Configuration

### 10A: `.vscode/settings.json`

**File path**: `.vscode/settings.json`

```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "editor.rulers": [100],
  "editor.wordWrap": "on",
  "editor.detectIndentation": false,
  "editor.tabSize": 2,
  "editor.insertSpaces": true,
  "editor.trimAutoWhitespace": true,
  "files.trimTrailingWhitespace": true,
  "files.insertFinalNewline": true,
  "files.eol": "\n",
  "files.exclude": {
    "**/.DS_Store": true,
    "**/node_modules": true,
    "**/.turbo": true
  },
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.fixAll.eslint": "explicit"
    }
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.fixAll.eslint": "explicit"
    }
  },
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true
  },
  "[json]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true
  },
  "[markdown]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true,
    "editor.wordWrap": "on"
  },
  "[yaml]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true,
    "editor.tabSize": 2
  },
  "eslint.validate": [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact"
  ],
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

### 10B: `.vscode/extensions.json`

**File path**: `.vscode/extensions.json`

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "prisma.prisma",
    "redhat.vscode-yaml",
    "ms-vscode.vscode-typescript-next",
    "eamodio.gitlens",
    "github.copilot",
    "ms-python.python",
    "sonarsource.sonarlint-vscode",
    "ms-azuretools.vscode-docker",
    "github.vscode-github-actions"
  ]
}
```

---

## Step 11: Verification Checklist

After completing all steps, verify the setup with these checks:

| # | Check | Command/Expected Output |
|---|-------|------------------------|
| 1 | ESLint dependencies installed | `pnpm list eslint @typescript-eslint/eslint-plugin` — should show installed packages |
| 2 | Prettier dependencies installed | `pnpm list prettier` — should show installed |
| 3 | Root .eslintrc.js exists | `ls -la .eslintrc.js` — file exists |
| 4 | .prettierrc exists | `ls -la .prettierrc` — file exists |
| 5 | lint-staged in package.json | `cat package.json \| grep -A 5 "lint-staged"` — config visible |
| 6 | Husky hooks installed | `ls -la .husky/pre-commit .husky/commit-msg` — files exist |
| 7 | commitlint.config.js exists | `ls -la commitlint.config.js` — file exists |
| 8 | ESLint test (lint all files) | `pnpm lint` — no critical errors in src code |
| 9 | Prettier test (dry run) | `pnpm format:check` — should pass or show which files need formatting |
| 10 | TypeScript test (type-check) | `pnpm type-check` — should succeed with no errors |
| 11 | Create test commit (with bad message) | `git commit --allow-empty -m "bad message"` — should fail with commitlint error |
| 12 | Create test commit (with valid message) | `git commit --allow-empty -m "feat(api): add new endpoint"` — should succeed |

---

## Step 12: Definition of Done Checklist

This task is complete when ALL the following are verified:

- [ ] **Root `.eslintrc.js`** created with all core rules (console warnings, unused vars errors, import ordering)
- [ ] **Package-specific ESLint configs** created for api, web, shared, crypto with correct overrides
- [ ] **`.prettierrc`** created with standard formatting rules (100 char width, 2-space tabs, single quotes)
- [ ] **`.prettierignore`** created with appropriate exclusions (dist, node_modules, .next, etc.)
- [ ] **`.editorconfig`** created for cross-IDE consistency
- [ ] **Husky initialized** with `.husky/pre-commit` hook functional
- [ ] **`.husky/commit-msg`** hook created for commitlint validation
- [ ] **`lint-staged`** configured in root package.json
- [ ] **`commitlint.config.js`** created with type, scope, and subject rules
- [ ] **NPM scripts** added: lint, lint:fix, format, format:check, type-check, validate
- [ ] **TypeScript strict mode** enabled in tsconfig.base.json (strict: true, noUncheckedIndexedAccess, etc.)
- [ ] **`.vscode/settings.json`** created with format-on-save and eslint-auto-fix
- [ ] **`.vscode/extensions.json`** created with recommended extensions
- [ ] **All 12 verification checks** pass without critical errors
- [ ] **Test commit** created and validated with conventional commit format
- [ ] **Team notified** and setup instructions documented (link to this task)

---

## Step 13: Troubleshooting

### Issue: "ESLint and Prettier conflict on formatting"

**Solution:** Ensure `eslint-config-prettier` is installed and extends LAST in ESLint config:

```javascript
extends: [
  'eslint:recommended',
  'plugin:@typescript-eslint/recommended',
  // ... other plugins ...
  'prettier', // Must be last
]
```

Then run `pnpm lint:fix && pnpm format` to apply both rules.

### Issue: "Husky hooks not executing on commit"

**Solution:** Husky needs to be initialized:

```bash
pnpm add -Dw husky
npx husky install
chmod +x .husky/pre-commit .husky/commit-msg
```

Then verify hooks are in `.git/hooks/` directory.

### Issue: "commitlint says commit message is invalid"

**Solution:** Ensure your commit message follows Conventional Commits format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Valid examples:**
- `feat(api): add user authentication endpoint`
- `fix(web): resolve styling issue on mobile layout`
- `docs(shared): update type definitions in README`
- `test(crypto): add unit tests for encryption functions`

**Invalid examples:**
- `Updated code` (no type/scope)
- `Feature: added new thing` (wrong type format)
- `feat: this is a very long subject line that exceeds the maximum allowed character limit` (> 100 chars)

### Issue: "TypeScript reports strict mode errors"

**Solution:** These are intentional. Either:

1. **Fix the error** (add explicit types, handle null cases, etc.)
2. **Use type assertion** (if unavoidable): `(value as Type)`
3. **Suppress for specific line** (only when necessary):
   ```typescript
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   const anyValue: any = unknownType;
   ```

### Issue: "Prettier reformats code immediately after linting"

**Solution:** Both tools should agree. Run full validation:

```bash
pnpm lint:fix
pnpm format
pnpm validate
```

If still conflicts, check ESLint rules against `.prettierrc` options manually.

### Issue: "Pre-commit hook runs but doesn't prevent commits"

**Solution:** Verify hook scripts have proper exit codes. Test manually:

```bash
bash .husky/pre-commit
echo $? # Should be 0 for success, non-zero for failure
```

### Issue: "VS Code doesn't auto-format on save"

**Solution:**
1. Ensure Prettier extension installed: `ext install esbenp.prettier-vscode`
2. Verify settings: Editor → Format On Save checkbox enabled
3. Check `.vscode/settings.json` has correct formatter:
   ```json
   "editor.defaultFormatter": "esbenp.prettier-vscode"
   ```
4. Restart VS Code

### Issue: "Import ordering shows as error but seems correct"

**Solution:** ESLint import ordering requires:
1. Builtin (node modules)
2. External (third-party packages)
3. Internal (your code: @/...)
4. Parent/sibling (relative paths)
5. Index files

**Wrong:**
```typescript
import { z } from 'zod'; // external
import fs from 'fs'; // builtin (should be first)
import { User } from '@/types'; // internal
```

**Correct:**
```typescript
import fs from 'fs'; // builtin
import { z } from 'zod'; // external
import { User } from '@/types'; // internal
```

---

## Files Created Summary

This task creates or modifies the following files:

| File Path | Type | Purpose |
|-----------|------|---------|
| `/.eslintrc.js` | Config | Root ESLint configuration |
| `/packages/api/.eslintrc.js` | Config | NestJS-specific ESLint rules |
| `/apps/web/.eslintrc.js` | Config | Next.js-specific ESLint rules |
| `/packages/shared/.eslintrc.js` | Config | Shared package ESLint rules |
| `/packages/crypto/.eslintrc.js` | Config | Crypto package ESLint rules |
| `/.prettierrc` | Config | Prettier formatting rules |
| `/.prettierignore` | Config | Files to exclude from formatting |
| `/.editorconfig` | Config | Editor consistency settings |
| `/.husky/pre-commit` | Hook | Pre-commit linting hook |
| `/.husky/commit-msg` | Hook | Commit message validation hook |
| `/commitlint.config.js` | Config | Conventional commits rules |
| `/.vscode/settings.json` | Config | VS Code workspace settings |
| `/.vscode/extensions.json` | Config | Recommended VS Code extensions |
| `/package.json` (modified) | Config | Added lint-staged config and scripts |
| `/tsconfig.base.json` (modified) | Config | Enabled strict TypeScript mode |

---

## Next Steps After Completion

Once S01 is complete:

1. **Notify all developers** to pull latest code and restart their IDEs
2. **Run `pnpm validate`** to ensure everyone passes linting
3. **Create a onboarding guide** referencing this task for new team members
4. **Schedule periodic reviews** (weekly) to ensure compliance
5. **Proceed to P0-T02** (next task in monorepo setup)

---

## Additional Resources

- **ESLint Documentation**: https://eslint.org/docs/latest/
- **TypeScript ESLint Plugin**: https://typescript-eslint.io/
- **Prettier Configuration**: https://prettier.io/docs/en/configuration.html
- **Conventional Commits**: https://www.conventionalcommits.org/
- **Husky Git Hooks**: https://typicode.github.io/husky/
- **lint-staged**: https://github.com/okonet/lint-staged

---

## Notes for Junior Developers

- **Don't bypass linting**: Hooks are there to help catch bugs early. If you can't commit, fix the errors (they're usually simple).
- **Ask for help**: If ESLint rules seem too strict, ask your tech lead. Some rules can be adjusted.
- **Use `_` prefix** for intentionally unused variables (e.g., `const _unused = value;`).
- **Strict mode is your friend**: Type errors caught at compile time = no bugs in production.
- **Format code regularly**: Run `pnpm format` before committing to avoid surprises.

---

**Created**: 2026-03-11
**Status**: Ready for Implementation
**Estimated Duration**: 2 hours
**Point of Contact**: Tech Lead / Senior Developer
