# ============================
# Stage 1: Install dependencies
# ============================
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace config and lockfile first for layer caching
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/api/package.json packages/api/
COPY packages/shared/package.json packages/shared/
COPY packages/crypto/package.json packages/crypto/

RUN pnpm install --frozen-lockfile

# ============================
# Stage 2: Build
# ============================
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/crypto/node_modules ./packages/crypto/node_modules

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./

# Copy source
COPY packages/shared packages/shared
COPY packages/crypto packages/crypto
COPY packages/api packages/api

# Build shared and crypto first (API depends on them)
RUN pnpm --filter @hedera-social/shared build || true
RUN pnpm --filter @hedera-social/crypto build || true

# Build API
RUN pnpm --filter @hedera-social/api build

# ============================
# Stage 3: Production runtime
# ============================
FROM node:20-alpine

RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy built output and production dependencies
COPY --from=builder /app/packages/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/api/node_modules ./packages/api/node_modules

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "const h=require('http');h.get('http://localhost:3001/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main"]
