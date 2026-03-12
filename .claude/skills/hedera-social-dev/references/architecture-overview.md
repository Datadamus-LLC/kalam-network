# Architecture Overview

Quick reference guide for the Hedera Social platform architecture. This is a condensed version for context during coding — see the full docs/ARCHITECTURE.md for details.

---

## System Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                        │
│  Components, pages, stores, encryption/decryption logic     │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ REST / WebSocket
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                  Backend API (NestJS)                        │
│  Routes, services, transaction orchestration                 │
└───┬────────────┬──────────────────┬─────────────────┬───────┘
    │            │                  │                 │
    │            │                  │                 │
┌───▼────┐ ┌────▼──────┐  ┌────────▼──────┐  ┌──────▼──────┐
│ Hedera │ │  External │  │   PostgreSQL  │  │    Cache    │
│ Network│ │ Services  │  │    (Index)    │  │   (Redis)   │
│ (HCS,  │ │(Mirsad AI, │  │               │  │             │
│ HTS)   │ │ Tamam MPC,│  │ Read-only     │  │  Sessions,  │
│        │ │ Pinata)   │  │ index of      │  │ topics,     │
│        │ │           │  │ blockchain    │  │ rate limits │
│        │ │           │  │ data          │  │             │
└────────┘ └───────────┘  └───────────────┘  └─────────────┘
```

**Key principle**: PostgreSQL is a READ INDEX, not source of truth. Hedera is the source of truth. All data is ultimately stored on Hedera (HCS or HTS), with PostgreSQL providing fast querying and caching.

---

## Data Flows

### 1. User Registration Flow

```
Frontend (Sign-up form)
    ↓
POST /auth/register {email, password}
    ↓
Backend: Hash password, create local user record
    ↓
Generate OTP, send via email
    ↓
Frontend: User enters OTP
    ↓
POST /auth/verify-otp {otp}
    ↓
Backend: Issue JWT token
    ↓
Frontend: Request wallet creation
    ↓
POST /wallet/generate
    ↓
Backend: Call Tamam MPC Custody → generates secp256k1 keypair
    ↓
Tamam MPC: Returns public key (private key shards stay with Tamam MPC)
    ↓
Backend: Assign new Hedera account ID (0.0.X) — auto-generated via MPC
    ↓
Backend: Create DID NFT → Hedera HTS mint transaction
    ↓
Store metadata on Pinata IPFS
    ↓
Mint NFT with metadata CID
    ↓
Transfer NFT from treasury to user account
    ↓
Freeze NFT (soulbound — non-transferable)
    ↓
Backend: Optional — Initiate KYC via Mirsad AI
    ↓
Backend: Store user account ID in PostgreSQL (indexed)
    ↓
Frontend: User is now registered and active
```

**Cost**: ~$0.06 per user (Mint + Freeze + Transfer). First-time platform setup adds $1.00 (one-time TokenCreate).

### 2. Send Direct Message Flow

```
Sender Frontend
    ↓
User types message + selects recipient
    ↓
Generate symmetric key (AES-256-GCM) for conversation
    ↓
Encrypt message content with symmetric key
    ↓
POST /messages/send {recipientId, encryptedContent}
    ↓
Backend: Check if conversation topic exists
    ↓
If NO: Create conversation topic with platform operator key as submitKey (access control at application layer)
    ↓
Backend: Generate encrypted symmetric key shares (one per participant, encrypted with their public key)
    ↓
Submit first message to HCS topic: {keyShares, messageIndex: 0}
    ↓
HCS returns sequence number (immutable order identifier)
    ↓
Backend: Store message metadata in PostgreSQL (indexed for fast retrieval)
    ↓
WebSocket: Push notification to recipient (if online)
    ↓
Recipient Frontend
    ↓
Receive WebSocket notification
    ↓
Fetch message from Mirror Node (HCS topic)
    ↓
Decrypt key share using recipient's X25519 private key (client-side, Layer 2)
    ↓
Decrypt message content using symmetric key
    ↓
Display message
```

**Cost per message**: ~$0.0008 (TopicMessageSubmit)

### 3. Create Post (Public Feed) Flow

```
Creator Frontend
    ↓
User types post content
    ↓
POST /posts {content, attachmentCids}
    ↓
Backend: Fetch user's feed topic ID from PostgreSQL
    ↓
Prepare post object {
  type: 'post',
  author: accountId,
  timestamp: now,
  content: plaintext or Markdown,
  attachmentCids: [],
}
    ↓
Submit to user's feed topic (plaintext — anyone can read)
    ↓
HCS returns sequence number
    ↓
Backend: Index post in PostgreSQL
    ↓
Backend: Enqueue followers for notification delivery
    ↓
WebSocket: Notify followers (if subscribed to feed)
    ↓
Followers see new post in real-time
```

**Cost per post**: ~$0.0008 (TopicMessageSubmit)

### 4. Send Payment Flow

```
Sender Frontend
    ↓
User selects recipient + amount (in HBAR or HTS token)
    ↓
POST /payments/send {recipientId, amount, tokenId?}
    ↓
Backend: Validate recipient, build CryptoTransferTransaction
    ↓
Display: "Send {amount} HBAR to {recipient}?"
    ↓
User confirms
    ↓
Backend: Submit transaction to Tamam MPC Custody for FROST threshold signing
    ↓
Tamam MPC: Signs and submits CryptoTransfer to Hedera
    ↓
Backend: Receives webhook confirmation from Tamam
    ↓
HCS: Backend submits payment record to sender's feed topic
    ↓
WebSocket: Notify both parties
    ↓
Both frontends: Display payment confirmation
```

**Cost per payment**: ~$0.001 (CryptoTransfer)
**Note**: Tamam MPC Custody is a signing/custody service only — no fiat conversion. Payments are standard HTS CryptoTransferTransaction.

### 5. Social Graph (Follow/Unfollow) Flow

```
User Frontend
    ↓
User clicks "Follow" on profile
    ↓
POST /social/follow {targetUserId}
    ↓
Backend: Create follow event
    ↓
Follow event: {
  type: 'follow',
  follower: senderAccountId,
  followee: targetAccountId,
  timestamp: now,
  status: 'active',
}
    ↓
Submit to platform-wide "social graph" HCS topic
    ↓
HCS returns sequence number
    ↓
Backend: Index follow relationship in PostgreSQL
    ↓
Backend: Check if following user has a feed topic
    ↓
If NO: Create feed topic on-demand (first follower creates it)
    ↓
WebSocket: Notify target user that they have a new follower
    ↓
Both users see updated follower counts
```

**Cost per follow action**: ~$0.0008 (TopicMessageSubmit)

---

## Key Design Decisions

### 1. Topic-Per-Conversation Model

**Why**: Each private conversation gets its own HCS topic to:
- Isolate encrypted messages per pair/group
- Access control enforced at application layer (platform operator key as submitKey, JWT + DB permissions)
- Allow efficient indexing and message history queries

**Implication**: Creating N conversations costs N TopicCreate transactions (~$0.01 each).

### 2. AES-256-GCM Per-Conversation Encryption

**Why**:
- Symmetric encryption is fast and cheap (client-side, no blockchain cost)
- Asymmetric encryption (public key) is only used for key exchange
- Key shares are encrypted with each participant's public key and stored on HCS

**Flow**:
1. Generate random 256-bit symmetric key
2. Encrypt message content with AES-256-GCM
3. Encrypt symmetric key share for each participant using their public key
4. Submit encrypted key shares to HCS (first message on new topic)
5. Each participant decrypts their key share, then decrypts messages

### 3. Key Exchange as First HCS Message

**Why**: All participants must be able to decrypt all messages in a conversation.

**Implementation**:
- When conversation is created, submit a special "keyexchange" message to HCS
- Message contains symmetric key encrypted for each participant
- Each participant decrypts their share and caches the symmetric key client-side (IndexedDB/memory — NEVER server-side Redis)
- All subsequent messages use the same symmetric key

### 4. Soulbound DID NFTs (HIP-412)

**Why**:
- Proves account ownership and identity on-chain
- Cannot be transferred or traded away (frozen)
- Metadata is immutable (points to IPFS CID)
- Standard format (HIP-412) for interoperability

**Implementation**:
- Create one NFT collection at deployment (TokenCreate)
- Mint one NFT per user at registration
- Freeze NFT to user's account (soulbound)
- If profile updates, wipe old NFT and mint new one with updated metadata

### 5. Event-Sourced Social Graph

**Why**: Keep social graph fully on-chain without duplicating data.

**Implementation**:
- Platform-wide HCS topic stores all follow/unfollow events
- Each event: `{type: 'follow', follower, followee, timestamp}`
- Backend subscribes to this topic and indexes in PostgreSQL
- PostgreSQL is a denormalized read cache of the event stream
- Source of truth is HCS events (fully auditable)

### 6. PostgreSQL as Read Index

**Why**: HCS is the source of truth, but querying HCS directly is slow.

**Implementation**:
- Backend subscribes to all HCS topics on startup
- Messages are indexed in PostgreSQL as they arrive
- Frontend queries PostgreSQL for fast pagination, filtering, full-text search
- If data diverges, backend can rebuild PostgreSQL from HCS topics

**Consequence**: PostgreSQL must be deterministic and reproducible. All data must come from HCS.

---

## Real vs. Pending

### REAL — Ready for Implementation

| Component | Status | Reference |
|-----------|--------|-----------|
| Hedera SDK integration | REAL | See hedera-integration.md |
| HCS topic creation/messaging | REAL | SDK is documented |
| HTS token creation/minting | REAL | SDK is documented |
| NFT freezing (soulbound) | REAL | SDK is documented |
| Mirror Node REST API | REAL | https://testnet.mirrornode.hedera.com |
| AES-256-GCM encryption (Layer 1) | REAL | Web Crypto API (SubtleCrypto) |
| Pinata IPFS service | VERIFIED | See external-integrations.md |

### VERIFIED — Documentation Provided

| Component | Status | Reference |
|-----------|--------|-----------|
| Tamam MPC Custody (key generation + signing) | VERIFIED | See custody-integration.md |
| Mirsad AI KYC (identity verification) | VERIFIED | See mirsad-ai-integration.md |

**Note**: There is no separate "Payment Rails" service. Payments are standard HTS CryptoTransferTransaction signed through Tamam MPC Custody.

---

## Cost Breakdown

Typical user journey costs (testnet approximation):

| Operation | Cost | Frequency | Total |
|-----------|------|-----------|-------|
| TokenCreate (DID collection) | $1.00 | Once at deploy | $1.00 |
| Register user | $0.06 | Per user | 1000 users = $60 |
| Create conversation topic | $0.01 | Per conversation | 1000 = $10 |
| Send message | $0.0008 | Per message | 10K = $8 |
| Create post | $0.0008 | Per post | 5K = $4 |
| Follow action | $0.0008 | Per follow | 10K = $8 |
| Update profile (wipe+mint) | $0.12 | Per update | 100 = $12 |

**Monthly estimate for 1000 users, avg 10 messages + 2 posts each**: ~$100

---

## API Routes (Quick Reference)

### Authentication
```
POST /auth/register          → Register new user + OTP
POST /auth/verify-otp        → Confirm email via OTP
POST /auth/login             → Get JWT token
POST /auth/logout            → Invalidate token
```

### Wallet & Account
```
POST /wallet/generate        → Create DID NFT + Hedera account
GET /wallet/status           → Check account status + KYC status
```

### Messages (Direct)
```
POST /messages/send          → Send encrypted message
GET /messages/conversation/{id}   → Fetch conversation history
GET /messages/conversations  → List all conversations
```

### Posts (Public Feed)
```
POST /posts                  → Create public post
GET /posts/feed              → Get follower's posts
GET /posts/user/{id}         → Get user's posts
```

### Social
```
POST /social/follow          → Follow user
POST /social/unfollow        → Unfollow user
GET /social/followers        → List followers
GET /social/following        → List following
```

### Payments
```
POST /payments/send          → Send payment to user
GET /payments/history        → Get payment history
```

### Users
```
GET /users/{id}              → Get public profile
PATCH /users/profile         → Update profile (triggers re-mint)
```

---

## Environment Variables

```bash
# Hedera
HEDERA_NETWORK=testnet                # testnet or mainnet
HEDERA_OPERATOR_ID=0.0.123456          # Your operator account ID
HEDERA_OPERATOR_KEY=302e020100300506032b...  # Your operator private key (DER-encoded)

# External Services
TAMAM_CUSTODY_API_KEY=olara_...       # Tamam MPC Custody API key (format: olara_{prefix}{secret})
TAMAM_CUSTODY_API_URL=https://tamam-backend-staging-776426377628.us-central1.run.app  # Tamam MPC Custody base URL
TAMAM_CUSTODY_SIGNING_SECRET=...      # HMAC-SHA256 signing secret for sensitive operations
TAMAM_CUSTODY_WEBHOOK_SECRET=...      # HMAC-SHA256 secret for verifying x-olara-signature webhook header
MIRSAD_KYC_API_URL=...                # Mirsad AI KYC API URL
PINATA_API_KEY=...                    # Pinata API key
PINATA_SECRET_API_KEY=...             # Pinata secret key

# Database
DATABASE_URL=postgresql://...         # PostgreSQL connection string
REDIS_URL=redis://...                 # Redis connection string

# JWT
JWT_SECRET=...                        # Random secret for signing JWTs
JWT_EXPIRY=24h                        # Access token expiration
JWT_REFRESH_EXPIRY=30d                # Refresh token expiration

# Email
SMTP_HOST=...                         # Email service host
SMTP_PORT=587                         # Email service port
SMTP_USER=...                         # Email service user
SMTP_PASS=...                         # Email service password
```

---

## Technology Stack

**Frontend**:
- Next.js 14 App Router (React framework)
- TypeScript
- TailwindCSS or similar for styling
- zustand or similar for state management
- @hashgraph/sdk for Hedera SDK
- Web Crypto API (SubtleCrypto) for AES-256-GCM (Layer 1), tweetnacl for X25519/nacl.box (Layer 2)

**Backend**:
- NestJS (Node.js framework)
- TypeScript
- PostgreSQL (data index)
- Redis (caching user sessions, topic metadata — NOT encryption keys)
- @hashgraph/sdk for Hedera SDK
- External service SDKs (Mirsad AI, Tamam MPC, Pinata)

**Infrastructure**:
- pnpm for monorepo dependency management
- Docker for containerization
- GitHub Actions for CI/CD

---

## See Also

- hedera-integration.md — Detailed Hedera SDK patterns
- external-integrations.md — External service interfaces (Mirsad AI, Tamam MPC, Pinata)
