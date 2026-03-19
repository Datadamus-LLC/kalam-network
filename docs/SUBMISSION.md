# Hackathon Submission — Kalam Network

## Project Description (100 words max)

Kalam Network is a blockchain-native social and communication platform built on Hedera where your wallet is your identity. Every user receives a Hedera account and soulbound DID NFT as their permanent, verifiable digital identity. Messages are E2E encrypted (AES-256-GCM) and consensus-timestamped via HCS. Payments use TMUSD — a stablecoin issued by the Tamam Consortium on HTS — signed through MPC custody. The platform includes KYC/AML screening, organization management with RBAC, broadcast channels, and real-time notifications. Built with production infrastructure partners (Tamam MPC Custody, Mirsad AI), not hackathon mocks. Fully developed, not a prototype.

*Word count: 97*

---

## Selected Track

**Open Track**

---

## Tech Stack

### Core Platform
- **Next.js 14** (App Router) — Frontend web application
- **NestJS** — Backend API framework
- **TypeScript** — Strict typing across entire codebase (zero `any` types)
- **PostgreSQL** — Indexed data storage (Hedera is source of truth)
- **Redis** — Caching, sessions, real-time pub/sub
- **Socket.io** — WebSocket gateway for real-time notifications and chat
- **BullMQ** — Async job queue (Redis-backed) for HCS submissions

### Hedera Network
- **Hedera Consensus Service (HCS)** — Messages, posts, social graph events, payment receipts, broadcasts
- **Hedera Token Service (HTS)** — DID NFT minting + freezing (soulbound), TMUSD stablecoin transfers
- **Hedera Mirror Node REST API** — Message sync, account queries, NFT lookups, transaction verification
- **Hedera Auto-Account Creation** — One Hedera account per user at registration
- **Hedera SDK (@hashgraph/sdk)** — 6 transaction types: TopicCreate, TopicMessageSubmit, TokenMint, TokenFreeze, Transfer, AccountCreate

### Infrastructure Partners
- **Tamam MPC Custody** — FROST threshold signing (9 nodes), per-user vault isolation, wallet creation
- **Mirsad AI** — KYC (individual) + KYB (corporate) screening, sanctions checks, document verification
- **TMUSD (Tamam Consortium)** — Stablecoin issued on HTS, payment rail for all platform transactions
- **Pinata IPFS** — Decentralized storage for media files and DID NFT metadata

### Security & Cryptography
- **AES-256-GCM** — Per-message encryption with fresh nonce (Web Crypto API)
- **X25519 (NaCl Box)** — Per-conversation key exchange, participant-specific key wrapping
- **JWT** — Authentication tokens with refresh rotation
- **HMAC** — Custody API request signing

### Development & Testing
- **pnpm** — Monorepo workspace management
- **Playwright** — E2E browser testing
- **Jest** — Backend integration tests (real services, no mocking)
- **Docker Compose** — PostgreSQL + Redis for development
- **ESLint + TypeScript strict mode** — Code quality enforcement

---

## Demo Video Structure (5 minutes max)

Suggested flow for recording:

**0:00–0:30 — Introduction**
- Kalam Network overview: "Your wallet is your identity"
- Problem statement (15 seconds)

**0:30–1:30 — Identity & Onboarding**
- Register with email → OTP verification
- Wallet creation (show Tamam MPC creating the vault)
- KYC screening (show Mirsad AI flow)
- DID NFT minted → show the NFT on HashScan (soulbound, frozen)
- "This user now has a permanent, verifiable digital identity on Hedera"

**1:30–2:30 — Communication**
- Create a post → show HCS message on HashScan
- Follow a user → show social graph event on HashScan
- Start a conversation → send encrypted messages
- "The platform cannot read these messages — only encrypted blobs on HCS"

**2:30–3:30 — Payments**
- Send TMUSD payment → show HTS transfer on HashScan
- Show HCS receipt (immutable audit trail)
- Payment request flow
- Split payment demonstration
- "Every payment has a consensus-timestamped receipt"

**3:30–4:15 — Enterprise**
- Create an organization
- Show RBAC (roles, permissions)
- Broadcast channel message
- "This is the infrastructure for banks, corporates, and government entities"

**4:15–5:00 — Architecture & Closing**
- Quick architecture overview (show the Mermaid diagram or a visual)
- Transaction numbers: "Every user action is a real Hedera transaction"
- Scaling projections: "279M annual transactions at 100K users"
- Team: Muneef + Dmitrij
- "Built in MENA. Launching in the US. Going global."

---

## Live Demo Link

Options:
- [ ] Deploy to Vercel (frontend) + Railway/Render (backend) — needs TMUSD testnet setup
- [ ] Provide local setup instructions in README for judges to run themselves
- [ ] Record comprehensive demo video that covers all features (sufficient if live deploy not ready)

---

## README.md Requirements

The README needs:
- Project overview
- Tech stack summary
- Setup instructions (step by step)
- Environment variables (.env.example)
- How to run (pnpm install, pnpm dev, etc.)
- Testing instructions
- Architecture overview
- Hedera integration summary
- Screenshots or demo video link
- Team
