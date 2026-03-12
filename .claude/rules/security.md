---
paths:
  - "**/*"
---

# Security Rules

## Secrets Management

- NEVER hardcode secrets, API keys, private keys, or passwords in source code
- NEVER commit `.env` files — use `.env.example` with placeholder values
- ALL secrets come from environment variables, validated at startup with Zod
- Hedera operator keys MUST be in env vars, never in code or config files
- JWT secrets MUST be cryptographically random, minimum 256 bits
- Database passwords MUST NOT be the defaults from docker-compose (in production)

## Authentication

- JWT tokens: access token (24h) + refresh token (30d)
- Passwords: bcrypt with minimum 12 rounds
- Never log tokens, passwords, or private keys — even at DEBUG level
- Rate limit auth endpoints: max 5 attempts per minute per IP
- Validate JWT on every WebSocket connection and reconnection

## Input Validation

- Validate ALL external input at API boundary (DTOs with class-validator)
- Validate Hedera account IDs format before any SDK call
- Validate HCS message payloads against schema before submission
- Sanitize user-generated content before storing or rendering
- Never trust client-side validation alone — always validate server-side

## Hedera-Specific Security

- Operator private keys: ONLY in env vars, NEVER logged, NEVER in responses
- Transaction fees: set maxTransactionFee on EVERY transaction to prevent drain
- Topic keys: private conversations use platform operator key as submitKey, access control at application layer (JWT + DB permissions)
- NFT soulbound: freeze after mint, no transfer key — prevent identity theft
- Mirror Node: use for reads only — NEVER submit transactions via mirror node

## Encryption

- AES-256-GCM only — no ECB, no CBC without authentication
- Fresh random IV (12 bytes) for EVERY message — NEVER reuse
- Key exchange: X25519 (Curve25519) via nacl.box (`tweetnacl`) — per-conversation symmetric keys encrypted with each participant's X25519 public key
- Private keys stay on client — server NEVER sees plaintext conversation keys
- Encrypted data format must include version field for future algorithm migration

## API Security

- CORS: restrict to known origins only (not `*`)
- All endpoints behind auth guard (except register/login)
- Standard API envelope: `{ success, data, error, timestamp }` — never leak stack traces
- Rate limiting on all public endpoints
- Request size limits to prevent abuse
- No sensitive data in URL parameters (use POST body or headers)

## Logging Security

- NEVER log: passwords, tokens, private keys, encryption keys, personal data
- DO log: transaction IDs, error codes, request metadata (without body)
- Structured logging (JSON format) for production — parseable by log aggregators
- Log level from env var — DEBUG only in development, INFO+ in production
