# P0-T01: Initialize Monorepo

| Field | Value |
|-------|-------|
| Task ID | P0-T01 |
| Priority | 🔴 P0 — Critical Path |
| Estimated Time | 2 hours |
| Depends On | Nothing — this is the first task |
| Phase | 0 — Project Setup |
| Assignee | Any developer |

---

## Objective

Set up the project's monorepo structure using pnpm workspaces. After this task, every developer can clone the repo, run `pnpm install`, and start working on their assigned package.

---

## Background

We use a **monorepo** (single git repository, multiple packages) because:
- The frontend, backend, and shared libraries all live together
- Changes to shared types are immediately available everywhere
- One `pnpm install` installs everything
- Easier to keep in sync during a hackathon

We use **pnpm** (not npm or yarn) because:
- Faster installs via content-addressable storage
- Built-in workspace support
- Strict node_modules (prevents phantom dependencies)

---

## Pre-requisites

Before you start, make sure you have installed:

```bash
# Check Node.js (need v18+)
node --version
# Should output v18.x.x or v20.x.x or v22.x.x

# Check pnpm (need v8+)
pnpm --version
# If not installed: npm install -g pnpm

# Check Docker (for Postgres + Redis)
docker --version
docker compose version

# Check Git
git --version
```

If any of these are missing, install them first:
- Node.js: https://nodejs.org (use LTS version)
- pnpm: `npm install -g pnpm@latest`
- Docker Desktop: https://www.docker.com/products/docker-desktop

---

## Step-by-Step Instructions

### Step 1: Create the repository

```bash
# Create project directory
mkdir hedera-social
cd hedera-social

# Initialize git
git init

# Initialize root package.json
pnpm init
```

Now open `package.json` and edit it to look exactly like this:

```json
{
  "name": "hedera-social",
  "version": "0.1.0",
  "private": true,
  "description": "Blockchain-native social platform built on Hedera",
  "scripts": {
    "dev:api": "pnpm --filter @hedera-social/api start:dev",
    "dev:web": "pnpm --filter @hedera-social/web dev",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "db:migrate": "pnpm --filter @hedera-social/api typeorm migration:run -d src/database/data-source.ts",
    "db:generate": "pnpm --filter @hedera-social/api typeorm migration:generate -d src/database/data-source.ts",
    "docker:up": "docker compose up -d",
    "docker:down": "docker compose down"
  },
  "engines": {
    "node": ">=18.0.0",
    "pnpm": ">=8.0.0"
  }
}
```

**What each script does:**
- `dev:api` — starts the NestJS backend in watch mode
- `dev:web` — starts the Next.js frontend in dev mode
- `build` — builds all packages recursively (`-r`)
- `db:migrate` — runs database migrations
- `docker:up` — starts Postgres and Redis containers

### Step 2: Create the pnpm workspace config

Create file `pnpm-workspace.yaml` at the repo root:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**What this does:** Tells pnpm that any folder inside `apps/` or `packages/` is a workspace package. When you `pnpm install`, it links them together so they can import from each other.

### Step 3: Create the full directory structure

Run these commands to create every directory we need:

```bash
# Application packages
mkdir -p apps/web
mkdir -p apps/mobile  # placeholder for future React Native

# Library packages
mkdir -p packages/api/src
mkdir -p packages/shared/src
mkdir -p packages/crypto/src

# Scripts directory
mkdir -p scripts

# Documentation (already exists)
# docs/
```

Verify the structure:

```bash
find . -type d -not -path '*/node_modules/*' -not -path '*/.git/*' | sort
```

Expected output:
```
.
./apps
./apps/mobile
./apps/web
./packages
./packages/api
./packages/api/src
./packages/crypto
./packages/crypto/src
./packages/shared
./packages/shared/src
./scripts
```

### Step 4: Create the root TypeScript configuration

Create file `tsconfig.base.json` at the repo root:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": ".",
    "paths": {
      "@hedera-social/shared": ["packages/shared/src"],
      "@hedera-social/shared/*": ["packages/shared/src/*"],
      "@hedera-social/crypto": ["packages/crypto/src"],
      "@hedera-social/crypto/*": ["packages/crypto/src/*"]
    }
  },
  "exclude": ["node_modules", "dist", ".next"]
}
```

**Why these settings:**
- `target: ES2022` — modern JavaScript, supports top-level await
- `moduleResolution: bundler` — works with both Next.js and NestJS bundlers
- `strict: true` — catches bugs at compile time (always use strict)
- `paths` — allows `import { User } from '@hedera-social/shared'` instead of relative paths

### Step 5: Create the environment template

Create file `.env.example` at the repo root:

```env
# ==============================================================================
# HEDERA SOCIAL PLATFORM — ENVIRONMENT VARIABLES
# ==============================================================================
# Copy this file to .env and fill in the values.
# NEVER commit .env to git (it's in .gitignore).
# ==============================================================================

# --- Hedera Network ---
# "testnet" for development, "mainnet" for production
HEDERA_NETWORK=testnet

# Your Hedera operator account (the platform's account).
# Get a testnet account at: https://portal.hedera.com
# Format: 0.0.XXXXX
HEDERA_OPERATOR_ID=

# Your Hedera operator private key (DER encoded hex string).
# This key signs all platform-level transactions.
# Format: 302e020100300506032b657004220420...
HEDERA_OPERATOR_KEY=

# --- Platform-Level Hedera Resources ---
# These are created by the setup script (P0-T08).
# Leave empty until you run scripts/setup-testnet.ts.
HEDERA_DID_TOKEN_ID=
HEDERA_SOCIAL_GRAPH_TOPIC=
HEDERA_KYC_ATTESTATION_TOPIC=
HEDERA_ANNOUNCEMENTS_TOPIC=

# --- Tamam Custody (MPC Wallet Management) ---
TAMAM_CUSTODY_API_URL=https://tamam-backend-staging-776426377628.us-central1.run.app
TAMAM_CUSTODY_API_KEY=
# Set to "true" to use local key generation instead of Tamam API (hackathon mode)
TAMAM_CUSTODY_MOCK=true

# --- Tamam Payment Rails ---
TAMAM_RAILS_API_URL=https://rails-api.tamam.com/v1
TAMAM_RAILS_API_KEY=
# Set to "true" to mock payments with direct HTS transfers (hackathon mode)
TAMAM_RAILS_MOCK=true

# --- Mirsad AI (KYC/KYB) ---
MIRSAD_KYC_API_URL=https://dashboard-api.mirsad.io
MIRSAD_KYC_CALLBACK_URL=
# Set to "true" to auto-approve all KYC submissions (hackathon mode)
MIRSAD_KYC_MOCK=true

# --- PostgreSQL ---
DATABASE_URL=postgresql://hedera_social:devpassword@localhost:5432/hedera_social
# Separate variables for TypeORM config
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=hedera_social
DB_PASSWORD=devpassword
DB_DATABASE=hedera_social

# --- Redis ---
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# --- IPFS (Pinata) ---
# Sign up at: https://www.pinata.cloud
PINATA_API_KEY=
PINATA_SECRET_KEY=
PINATA_GATEWAY_URL=https://gateway.pinata.cloud/ipfs

# --- JWT Authentication ---
# Generate a random secret: openssl rand -hex 32
JWT_SECRET=CHANGE_ME_TO_RANDOM_STRING
JWT_EXPIRY=24h
JWT_REFRESH_SECRET=CHANGE_ME_TO_DIFFERENT_RANDOM_STRING
JWT_REFRESH_EXPIRY=30d

# --- Application Ports ---
API_PORT=3001
WEB_PORT=3000
WS_PORT=3002

# --- CORS ---
CORS_ORIGIN=http://localhost:3000

# --- Logging ---
# "debug" | "info" | "warn" | "error"
LOG_LEVEL=debug
```

### Step 6: Create .gitignore

Create file `.gitignore` at the repo root:

```gitignore
# Dependencies
node_modules/
.pnpm-store/

# Build outputs
dist/
build/
.next/
out/

# Environment files (NEVER commit these)
.env
.env.local
.env.production
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS files
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
pnpm-debug.log*

# Test coverage
coverage/
.nyc_output/

# TypeScript build info
*.tsbuildinfo

# Docker data
pgdata/
redisdata/

# Temporary files
tmp/
temp/
```

### Step 7: Create docker-compose.yml

Create file `docker-compose.yml` at the repo root:

```yaml
# Hedera Social Platform — Local Development Services
# Start: docker compose up -d
# Stop:  docker compose down
# Reset: docker compose down -v  (WARNING: deletes all data)

version: '3.8'

services:
  # PostgreSQL — main database (index/cache of on-chain data)
  postgres:
    image: postgres:16-alpine
    container_name: hedera-social-postgres
    environment:
      POSTGRES_USER: hedera_social
      POSTGRES_PASSWORD: devpassword
      POSTGRES_DB: hedera_social
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hedera_social"]
      interval: 5s
      timeout: 5s
      retries: 5

  # Redis — session cache, OTP storage, pub/sub for WebSocket
  redis:
    image: redis:7-alpine
    container_name: hedera-social-redis
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
    driver: local
  redisdata:
    driver: local
```

### Step 8: Create placeholder package.json files for each workspace

**`apps/web/package.json`:**
```json
{
  "name": "@hedera-social/web",
  "version": "0.1.0",
  "private": true
}
```

**`packages/api/package.json`:**
```json
{
  "name": "@hedera-social/api",
  "version": "0.1.0",
  "private": true
}
```

**`packages/shared/package.json`:**
```json
{
  "name": "@hedera-social/shared",
  "version": "0.1.0",
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

**`packages/crypto/package.json`:**
```json
{
  "name": "@hedera-social/crypto",
  "version": "0.1.0",
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

**`packages/shared/src/index.ts`:**
```typescript
// Barrel export — will be populated in P0-T02
export {};
```

**`packages/crypto/src/index.ts`:**
```typescript
// Barrel export — will be populated in P0-T03
export {};
```

### Step 9: Install dependencies and verify

```bash
# From repo root
pnpm install
```

You should see output like:
```
Packages: +0
Lockfile is up to date, resolution step is skipped
Already up to date
Done in 0.5s
```

### Step 10: Start Docker services and verify

```bash
# Start Postgres and Redis
docker compose up -d

# Wait 5 seconds for services to start
sleep 5

# Verify Postgres
docker exec hedera-social-postgres pg_isready -U hedera_social
# Expected: /var/run/postgresql:5432 - accepting connections

# Verify Redis
docker exec hedera-social-redis redis-cli ping
# Expected: PONG

# Try connecting to Postgres
docker exec hedera-social-postgres psql -U hedera_social -c "SELECT 1;"
# Expected:
#  ?column?
# ----------
#         1
```

### Step 11: Create your local .env

```bash
cp .env.example .env
```

Now open `.env` and fill in at minimum:
- `JWT_SECRET` — run `openssl rand -hex 32` and paste the output
- `JWT_REFRESH_SECRET` — run `openssl rand -hex 32` again (different value!)
- Leave Hedera, Tamam, Mirsad AI, and Pinata values empty for now (will be filled in later tasks)
- Keep all `*_MOCK=true` flags as-is for hackathon mode

### Step 12: Initial git commit

```bash
git add -A
git commit -m "chore(P0-T01): initialize monorepo with pnpm workspaces

- Set up pnpm workspace with apps/ and packages/ directories
- Created workspace packages: web, api, shared, crypto
- Added docker-compose for Postgres 16 + Redis 7
- Added .env.example with all environment variables
- Added root tsconfig.base.json with path aliases"
```

---

## Verification Steps

Run each of these and confirm the expected output:

| # | Command | Expected |
|---|---------|----------|
| 1 | `pnpm install` | Completes without errors |
| 2 | `docker compose up -d` | Both containers start |
| 3 | `docker exec hedera-social-postgres pg_isready -U hedera_social` | "accepting connections" |
| 4 | `docker exec hedera-social-redis redis-cli ping` | "PONG" |
| 5 | `cat .env` | File exists, has JWT_SECRET filled in |
| 6 | `ls apps/web/package.json` | File exists |
| 7 | `ls packages/shared/src/index.ts` | File exists |
| 8 | `ls packages/crypto/src/index.ts` | File exists |
| 9 | `ls packages/api/package.json` | File exists |
| 10 | `git log --oneline -1` | Shows initial commit |

---

## Definition of Done

- [ ] `pnpm install` runs without errors from repo root
- [ ] Directory structure has: `apps/web`, `apps/mobile`, `packages/api`, `packages/shared`, `packages/crypto`, `scripts`
- [ ] `docker compose up -d` starts Postgres at port 5432 and Redis at port 6379
- [ ] Can connect to Postgres: `psql -h localhost -U hedera_social -d hedera_social`
- [ ] Can connect to Redis: `redis-cli ping` returns PONG
- [ ] `.env.example` has all variables documented with comments
- [ ] `.env` is created and has JWT secrets filled in
- [ ] `.env` is in `.gitignore` (never committed)
- [ ] Root `tsconfig.base.json` has path aliases for `@hedera-social/*`
- [ ] Initial commit is made

---

## Troubleshooting

**Problem:** `pnpm: command not found`
**Fix:** `npm install -g pnpm@latest`, then restart your terminal.

**Problem:** Docker containers won't start / port already in use
**Fix:** Check if something else is using ports 5432 or 6379:
```bash
lsof -i :5432
lsof -i :6379
# Kill the process or change ports in docker-compose.yml
```

**Problem:** `pg_isready` says "connection refused"
**Fix:** Wait 10 seconds and try again. Postgres takes a moment on first boot. If still failing:
```bash
docker compose logs postgres
# Look for errors in the output
```

**Problem:** pnpm workspace packages not resolving
**Fix:** Make sure `pnpm-workspace.yaml` is at the repo root (same level as `package.json`). Check for typos in the glob patterns.

---

## Files Created in This Task

```
hedera-social/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .env.example
├── .env                    (local only, not committed)
├── .gitignore
├── docker-compose.yml
├── apps/
│   ├── web/
│   │   └── package.json
│   └── mobile/             (empty placeholder)
├── packages/
│   ├── api/
│   │   └── package.json
│   ├── shared/
│   │   ├── package.json
│   │   └── src/
│   │       └── index.ts
│   └── crypto/
│       ├── package.json
│       └── src/
│           └── index.ts
└── scripts/                (empty, for future scripts)
```

---

## What Happens Next

After this task is complete, three streams of work can start in parallel:
- **P0-T02** (Shared Types) — can start immediately
- **P0-T04** (NestJS Backend) — can start immediately
- **P0-T07** (Next.js Frontend) — can start immediately
