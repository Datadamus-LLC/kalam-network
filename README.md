# Kalam

A blockchain-native social platform built on Hedera. Every user identity is an on-chain DID NFT, every private message is an HCS transaction, and every payment is a verifiable HBAR transfer — all secured by MPC custody with no user-managed keys.

---

## Overview

Kalam combines social networking, encrypted messaging, and peer-to-peer payments into a single application where the blockchain is not an optional feature but the foundational layer. User accounts are Hedera wallets. Conversations are Hedera Consensus Service topics. Payments are Hedera Token Service transfers.

Key design principles:

- **Wallet-as-identity** — a user's Hedera account ID is their persistent identity across the platform
- **On-chain first** — every action of consequence generates a Hedera transaction
- **Non-custodial UX** — Tamam MPC custody handles signing without exposing private keys to users or the platform
- **Privacy by default** — messages are end-to-end encrypted; the platform cannot read private conversations

---

## Architecture

### System Layers

```
Client (Next.js)
    |
    | HTTPS / WebSocket
    |
API Server (NestJS)
    |
    |-- PostgreSQL  (read index, user data, conversation metadata)
    |-- Redis       (session cache, rate limiting, real-time state)
    |-- Hedera SDK  (HCS message submission, HTS token operations)
    |-- Tamam MPC   (wallet creation, transaction signing)
    |-- Mirsad AI   (KYC/KYB identity verification)
    |-- Pinata IPFS (DID NFT metadata, profile media)
```

### Monorepo Structure

```
apps/
  web/                  Next.js 14 App Router frontend
packages/
  api/                  NestJS backend
  shared/               Shared TypeScript types, constants, utilities
  crypto/               AES-256-GCM encryption library
```

### Identity Flow

1. User registers with email and verifies via OTP
2. Tamam MPC custody generates a Hedera account (FROST threshold signatures)
3. Mirsad AI performs KYC/KYB verification
4. A soulbound DID NFT is minted on Hedera HTS and frozen to the user's account
5. The Hedera account ID becomes the user's permanent platform identity

### Messaging Architecture

Each conversation is a dedicated HCS topic. Messages are submitted as HCS transactions, making them:

- Tamper-evident (consensus timestamp, sequence number)
- Ordered (Hedera provides deterministic ordering)
- Permanently auditable on the ledger

The API server maintains a PostgreSQL index of messages for fast retrieval, synced from Hedera Mirror Node. End-to-end encryption uses AES-256-GCM with per-conversation symmetric keys. Key exchange is performed via X25519 (TweetNaCl); the server never holds plaintext conversation keys.

### Payment Architecture

Payments are HBAR transfers executed through Tamam MPC custody. The platform constructs the transaction, Tamam signs it using the user's threshold key, and the signed transaction is submitted directly to Hedera. The platform has no ability to unilaterally move user funds.

Payment requests, split payments, and payment receipts are all relayed through the conversation's HCS topic, creating an auditable payment history linked to the conversation context.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React, TypeScript |
| Styling | shadcn/ui, Tailwind CSS v4 |
| State management | Zustand, TanStack Query |
| Backend | NestJS, TypeScript |
| Database | PostgreSQL 16 |
| Cache / Pub-Sub | Redis 7 |
| Real-time | Socket.io (WebSocket gateway) |
| Blockchain | Hedera SDK (@hashgraph/sdk) |
| Wallet custody | Tamam MPC (FROST threshold signatures) |
| Identity verification | Mirsad AI KYC/KYB |
| File storage | Pinata IPFS |
| Encryption | AES-256-GCM, X25519 (TweetNaCl) |
| Auth | Email OTP, JWT (access + refresh tokens) |

---

## Prerequisites

- Node.js 18+
- pnpm 8+
- Docker and Docker Compose
- A Hedera Testnet account (operator key and account ID)
- Tamam MPC custody API credentials
- Mirsad AI API credentials
- Pinata IPFS API key
- Resend API key (email delivery)

---

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

Copy the example and fill in your credentials:

```bash
cp .env.example .env
```

Required environment variables are documented in `.env.example`. The application will refuse to start if required variables are missing or malformed.

### 3. Start infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL and Redis.

### 4. Run database migrations

```bash
pnpm --filter @hedera-social/api db:migrate
```

### 5. Start the development servers

```bash
# Start API and web separately
pnpm dev:api    # API on :3001
pnpm dev:web    # Web on :3000
```

---

## Environment Variables

All configuration is injected via environment variables. There are no hardcoded secrets or environment-specific values in the source code.

**General**

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `development` or `production` |
| `LOG_LEVEL` | Log verbosity: `debug`, `info`, `warn`, `error` |
| `API_PORT` | Port the NestJS API listens on |
| `API_PREFIX` | URL prefix for all API routes (e.g. `api/v1`) |
| `CORS_ORIGIN` | Allowed CORS origin for the API |
| `FRONTEND_URL` | Frontend URL used in email links |

**Database**

| Variable | Description |
|----------|-------------|
| `DB_HOST` | PostgreSQL host |
| `DB_PORT` | PostgreSQL port |
| `DB_USERNAME` | PostgreSQL username |
| `DB_PASSWORD` | PostgreSQL password |
| `DB_DATABASE` | PostgreSQL database name |

**Redis**

| Variable | Description |
|----------|-------------|
| `REDIS_HOST` | Redis host |
| `REDIS_PORT` | Redis port |
| `REDIS_PASSWORD` | Redis password (empty if none) |

**Encryption & Auth**

| Variable | Description |
|----------|-------------|
| `ENCRYPTION_MASTER_KEY` | 64-char hex key used for server-side encryption |
| `JWT_SECRET` | Secret for signing access tokens (min 256 bits) |
| `JWT_EXPIRY` | Access token lifetime (e.g. `24h`) |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens |
| `JWT_REFRESH_EXPIRY` | Refresh token lifetime (e.g. `30d`) |

**Hedera**

| Variable | Description |
|----------|-------------|
| `HEDERA_NETWORK` | `testnet` or `mainnet` |
| `HEDERA_OPERATOR_ID` | Account ID used to pay transaction fees |
| `HEDERA_OPERATOR_KEY` | Operator private key (DER hex — never commit) |
| `HEDERA_MIRROR_NODE_URL` | Hedera Mirror Node REST API base URL |
| `HEDERA_DID_TOKEN_ID` | HTS token ID for DID NFT issuance |
| `HEDERA_KYC_ATTESTATION_TOPIC` | HCS topic ID for KYC attestation events |
| `HEDERA_SOCIAL_GRAPH_TOPIC` | HCS topic ID for follow/unfollow events |
| `HEDERA_ANNOUNCEMENTS_TOPIC` | HCS topic ID for platform announcements |
| `HEDERA_NOTIFICATION_TOPIC` | HCS topic ID for notification events |

**Tamam MPC Custody**

| Variable | Description |
|----------|-------------|
| `TAMAM_CUSTODY_API_URL` | Tamam custody API base URL |
| `TAMAM_CUSTODY_SIGNING_SECRET` | 32-byte hex secret for HMAC request signing |
| `TAMAM_CUSTODY_VAULT_ID` | UUID of the MPC vault |
| `TAMAM_CUSTODY_ORG_ID` | UUID of the Tamam organisation |

**Mirsad AI KYC/KYB**

| Variable | Description |
|----------|-------------|
| `MIRSAD_KYC_API_URL` | Mirsad API base URL |
| `MIRSAD_KYC_CALLBACK_URL` | Webhook URL for KYC status callbacks |
| `MIRSAD_KYC_ENABLED` | `true` to enforce KYC, `false` to auto-approve (dev only) |

**Pinata IPFS**

| Variable | Description |
|----------|-------------|
| `PINATA_API_KEY` | Pinata API key |
| `PINATA_SECRET_KEY` | Pinata secret key |
| `PINATA_GATEWAY_URL` | Pinata dedicated gateway base URL |

**Email**

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Resend API key |
| `RESEND_FROM_EMAIL` | Sender address for OTP emails |

**Frontend (NEXT_PUBLIC_\*)**

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | API base URL (e.g. `http://localhost:3001/api/v1`) |
| `NEXT_PUBLIC_WS_URL` | WebSocket URL (e.g. `ws://localhost:3001`) |
| `NEXT_PUBLIC_HEDERA_NETWORK` | Hedera network shown in the UI |

See `.env.example` for the complete list including all optional variables.

---

## API Structure

The API follows a modular NestJS architecture. Each domain is an isolated module with its own controller, service, DTOs, and typed exceptions.

```
packages/api/src/modules/
  auth/           Email OTP registration and login, JWT issuance
  identity/       KYC/KYB submission, DID NFT minting, profile management
  messaging/      Conversation creation, HCS message submission and sync
  chat/           WebSocket gateway — real-time events, typing indicators, presence
  social/         Posts, likes, comments, follow graph
  payments/       HBAR transfers, payment requests, split payments
  notifications/  Real-time notification delivery via WebSocket
  organization/   Multi-user org accounts, RBAC, broadcast channels
  hedera/         Hedera SDK wrapper, Mirror Node client
  redis/          Redis client and pub/sub service
  integrations/   Tamam MPC custody, Mirsad AI, Pinata IPFS
```

All endpoints return a standard envelope:

```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

Errors return a typed error code alongside an HTTP status, with no stack traces exposed in production.

---

## Frontend Structure

```
apps/web/src/
  app/
    (auth)/       Unauthenticated routes: landing, login, register, onboarding
    (app)/        Authenticated routes: feed, messages, payments, etc.
  components/
    chat/         Conversation list, message bubbles, payment cards in chat
    feed/         Post cards, compose form, infinite scroll
    layout/       App shell, sidebar, navigation
    payments/     Balance widget, send/request/split modals
    notifications/ Notification items, bell indicator
    onboarding/   OTP input, KYC polling, wallet creation
    ui/           Shared design system components (shadcn + custom)
  stores/         Zustand state (auth, feed, chat, payments, notifications)
  lib/            API client, Socket.io client, encryption utilities, hooks
```

---

## Key Features

**Social**
- Public posts to a personal feed topic with like, comment, and repost
- Follow graph with HCS event sourcing
- User search and discovery
- Verified KYC/KYB badges

**Messaging**
- End-to-end encrypted direct and group conversations
- Real-time delivery via WebSocket with typing indicators and read receipts
- Online presence
- Inline payment requests within conversations

**Payments**
- Send and receive HBAR
- Payment requests with expiry
- Split payments across multiple recipients
- Full transaction history with Hedera transaction ID proof

**Organizations**
- Business accounts with KYB verification
- Role-based access control (Owner, Admin, Member, Viewer)
- Team member management with email invitations
- Broadcast channels for one-to-many announcements

**Onboarding**
- Email OTP authentication — no passwords
- Automatic Hedera wallet creation via Tamam MPC
- Individual (KYC) and corporate (KYB) identity verification via Mirsad AI
- Soulbound DID NFT issuance on successful verification

---

## Development Commands

```bash
pnpm build                                      # Build all packages
pnpm lint                                       # Run ESLint across all packages
pnpm dev:api                                    # Start API (port 3001)
pnpm dev:web                                    # Start web (port 3000)
pnpm --filter @hedera-social/api db:migrate     # Run pending migrations
pnpm --filter @hedera-social/api db:revert      # Revert last migration
```

---

## License

Private. All rights reserved.
