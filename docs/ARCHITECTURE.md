# Hedera Social Platform — Production Architecture Design

## Project Codename: TBD
**Hackathon Track:** Open Track — Hedera Hello Future Apex Hackathon 2026
**Submission Deadline:** March 23, 2026

---

## 1. Executive Summary

### Vision
A blockchain-native social platform where every user's Hedera wallet **is** their digital identity. Unlike traditional social platforms that bolt blockchain onto existing infrastructure, this platform is built from the ground up on Hedera — every message is an HCS transaction, every identity is a soulbound DID NFT, every payment flows through Hedera Token Service signed via Tamam MPC Custody.

### Core Thesis
Your wallet is not an account *on* a platform — **your wallet is your digital self**. Your DID (as a soulbound NFT) is your verified identity. Your HCS message history is your communication record. Your HTS transaction history is your financial biography. If the platform disappears, your identity, your data, and your reputation remain — they live on Hedera.

### Product Ecosystem Integration
| Product | Role in Platform |
|---------|-----------------|
| **Mirsad AI** | KYC/KYB screening and identity verification (formerly Mirsad) |
| **Tamam MPC Custody** | MPC-based key management for user wallets (FROST threshold signing) |
| **Tamam Consortium** | Stablecoin issuance — platform uses their HTS tokens for payments |
| **Hedera Network** | Core infrastructure — identity, messaging, payments |

### Hedera Services Used
| Hedera Service | Platform Function |
|----------------|------------------|
| **HCS (Consensus Service)** | Messaging, posts, social feed, notifications |
| **HTS (Token Service)** | DID NFTs, payments, soulbound credentials |
| **HSCS (Smart Contracts)** | Future: escrow, group governance (not hackathon priority) |
| **Mirror Node** | Profile rendering, conversation history, analytics |
| **Auto-Account Creation** | Frictionless user onboarding (via Tamam MPC Custody `createHederaAccount`) |
| **DID Method (did:hedera)** | Decentralized identity standard (HIP-27) |
| **Scheduled Transactions** | Multi-sig approvals, delayed operations |

---

## 2. System Architecture

### 2.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                    │
│                                                                          │
│   ┌─────────────┐   ┌─────────────┐   ┌──────────────────────────┐    │
│   │  Mobile App  │   │   Web App   │   │  Business Portal (Web)   │    │
│   │  (React      │   │  (Next.js)  │   │  (Next.js + Dashboard)   │    │
│   │   Native)    │   │             │   │                          │    │
│   └──────┬───────┘   └──────┬──────┘   └────────────┬─────────────┘    │
│          │                  │                        │                   │
│          └──────────────────┼────────────────────────┘                   │
│                             │                                            │
│                     ┌───────▼──────┐                                    │
│                     │   API Layer  │                                    │
│                     │  (REST/WS)   │                                    │
│                     └───────┬──────┘                                    │
└─────────────────────────────┼────────────────────────────────────────────┘
                              │
┌─────────────────────────────┼────────────────────────────────────────────┐
│                     PLATFORM SERVICES LAYER                              │
│                              │                                           │
│   ┌──────────────────────────▼──────────────────────────────────────┐   │
│   │                    API Gateway / Load Balancer                   │   │
│   └──┬──────────┬──────────┬──────────┬──────────┬──────────┬───────┘   │
│      │          │          │          │          │          │            │
│   ┌──▼───┐  ┌──▼───┐  ┌──▼───┐  ┌──▼───┐  ┌──▼───┐  ┌──▼────────┐  │
│   │Ident-│  │Messg-│  │Social│  │In-   │  │Media │  │Notification│  │
│   │ity   │  │ing   │  │Feed  │  │Chat  │  │& IPFS│  │Service     │  │
│   │Svc   │  │Svc   │  │Svc   │  │Pay   │  │Svc   │  │            │  │
│   └──┬───┘  └──┬───┘  └──┬───┘  └──┬───┘  └──┬───┘  └──┬─────────┘  │
│      │         │         │         │         │         │              │
│   ┌──▼─────────▼─────────▼─────────▼─────────▼─────────▼───────────┐ │
│   │                    Hedera Integration Layer                     │ │
│   │   ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │ │
│   │   │HCS Mgr  │  │HTS Mgr   │  │HSCS Mgr  │  │Mirror Node    │  │ │
│   │   │(Topics, │  │(NFTs,    │  │(Escrow,  │  │Client         │  │ │
│   │   │Messages)│  │Tokens,   │  │Contracts)│  │(Query,History) │  │ │
│   │   │         │  │Transfers)│  │          │  │               │  │ │
│   │   └─────────┘  └──────────┘  └──────────┘  └───────────────┘  │ │
│   └─────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│   ┌─────────────────────────────────────────────────────────────────┐ │
│   │                    External Integrations                        │ │
│   │   ┌──────────────────┐         ┌──────────────────────────┐    │ │
│   │   │ Mirsad AI         │         │ Tamam MPC Custody        │    │ │
│   │   │ KYC/KYB          │         │ Key Mgmt + Tx Signing    │    │ │
│   │   └──────────────────┘         └──────────────────────────┘    │ │
│   └─────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│   ┌─────────────────────────────────────────────────────────────────┐ │
│   │                    Data Layer                                   │ │
│   │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │ │
│   │   │PostgreSQL│  │  Redis   │  │  IPFS    │  │ Hedera       │  │ │
│   │   │(Indexes, │  │(Cache,   │  │(Media,   │  │ (Source of   │  │ │
│   │   │Metadata) │  │Sessions, │  │Documents)│  │  Truth)      │  │ │
│   │   │          │  │PubSub)   │  │          │  │              │  │ │
│   │   └──────────┘  └──────────┘  └──────────┘  └──────────────┘  │ │
│   └─────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────┼────────────────────────────────────────────┐
│                     HEDERA NETWORK                                       │
│                              │                                           │
│   ┌──────────────────────────▼──────────────────────────────────────┐   │
│   │                                                                  │   │
│   │  ┌──────┐  ┌──────┐  ┌──────┐  ┌─────────┐  ┌──────────────┐  │   │
│   │  │ HCS  │  │ HTS  │  │ HSCS │  │ Mirror  │  │ Auto-Account │  │   │
│   │  │Topics│  │Tokens│  │ EVM  │  │ Nodes   │  │ Creation     │  │   │
│   │  └──────┘  └──────┘  └──────┘  └─────────┘  └──────────────┘  │   │
│   │                                                                  │   │
│   └──────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow: Source of Truth Model

**Critical Design Principle**: Hedera is the source of truth. The platform database (PostgreSQL) is an **index/cache** — not the canonical data store. If the database is wiped, the entire platform state can be reconstructed from on-chain data via the Mirror Node.

```
WRITE PATH:
User Action → Platform Service → Hedera Transaction → Mirror Node → Platform Index (PostgreSQL)

READ PATH:
User Query → Platform Service → PostgreSQL (fast reads) → Return to User
                                     │
                                     ├── Cache hit: Serve immediately
                                     └── Cache miss: Query Mirror Node → Update index → Return
```

---

## 3. Core Modules — Detailed Design

### 3.1 Identity Service

#### 3.1.1 User Onboarding Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  User     │     │ Platform │     │ Mirsad AI │     │ Tamam MPC│     │  Hedera  │
│  Client   │     │  Backend │     │  KYC/KYB │     │  MPC     │     │  Network │
└─────┬─────┘     └─────┬────┘     └─────┬────┘     └─────┬────┘     └─────┬────┘
      │                 │               │               │               │
      │ 1. Register     │               │               │               │
      │ (email/phone)   │               │               │               │
      ├────────────────►│               │               │               │
      │                 │               │               │               │
      │                 │ 2. Create MPC │               │               │
      │                 │ key + Hedera  │               │               │
      │                 │ account       │               │               │
      │                 ├──────────────────────────────►│               │
      │                 │               │  createHederaAccount: true    │
      │                 │◄──────────────────────────────┤               │
      │                 │  FROST key shares distributed │               │
      │                 │  + Hedera account 0.0.XXXXX   │               │
      │                 │               │               │               │
      │ 3. Generate     │               │               │               │
      │ X25519 keypair  │               │               │               │
      │ (client-side)   │               │               │               │
      │────────────────►│               │               │               │
      │ encryption      │               │               │               │
      │ public key      │               │               │               │
      │                 │               │               │               │
      │ 4. KYC/KYB      │               │               │               │
      │ submission      │               │               │               │
      ├────────────────►│               │               │               │
      │                 │ 5. Screen     │               │               │
      │                 │ identity      │               │               │
      │                 ├──────────────►│               │               │
      │                 │               │               │               │
      │                 │◄──────────────┤               │               │
      │                 │ KYC result    │               │               │
      │                 │ (async callback)              │               │
      │                 │               │               │               │
      │                 │ 6. Mint DID NFT (soulbound)   │               │
      │                 │ (signed via MPC Custody)      │               │
      │                 ├──────────────────────────────►│               │
      │                 │               │               │──────────────►│
      │                 │               │               │    NFT minted │
      │                 │◄──────────────────────────────┤────to account │
      │                 │               │               │               │
      │ 7. Onboarding   │               │               │               │
      │ complete!       │               │               │               │
      │◄────────────────┤               │               │               │
      │ Hedera account  │               │               │               │
      │ + DID NFT       │               │               │               │
      │ + encryption key│               │               │               │
```

**Two-Layer Cryptographic Architecture:**
- **Layer 1 — MPC Custody (Tamam):** The user's Hedera account key is managed via FROST threshold signing across 9 MPC nodes. The client never touches this private key. Used exclusively for transaction signing (payments, NFT minting, topic creation).
- **Layer 2 — Client-Side Encryption (X25519):** A separate X25519 keypair is generated on the user's device for E2E message encryption. This key never touches MPC infrastructure. Used for encrypting/decrypting conversation symmetric keys via nacl.box (XSalsa20-Poly1305).
- **Bridge — DID NFT Metadata:** The DID NFT stores both the Hedera account public key (Layer 1) and the X25519 encryption public key (Layer 2), linking the two layers under a single verifiable identity.

#### 3.1.2 DID NFT Schema (Soulbound)

**Token Configuration:**
```json
{
  "tokenName": "Platform DID",
  "tokenSymbol": "PDID",
  "tokenType": "NON_FUNGIBLE_UNIQUE",
  "supplyType": "INFINITE",
  "adminKey": "<platform_admin_key>",
  "supplyKey": "<platform_supply_key>",
  "freezeKey": "<platform_freeze_key>",
  "wipeKey": "<platform_wipe_key>",
  "pauseKey": "<platform_pause_key>",
  "metadata": "<ipfs_collection_metadata_cid>"
}
```

**Individual NFT Metadata (stored on IPFS, CID on-chain):**
```json
{
  "name": "DID:hedera:mainnet:<accountId>",
  "description": "Decentralized Identity Credential",
  "image": "ipfs://<profile_image_cid>",
  "type": "image/png",
  "format": "HIP412@2.0.0",
  "did": {
    "method": "hedera",
    "account": "0.0.XXXXX",
    "publicKey": "<hedera-account-public-key-hex>"
  },
  "encryption": {
    "publicKey": "<x25519-public-key-base64>",
    "algorithm": "x25519-xsalsa20-poly1305",
    "keyBackupCid": "ipfs://<encrypted-backup-cid>",
    "keyBackupMethod": "platform-auth-derived"
  },
  "properties": {
    "accountType": "individual | business",
    "kycLevel": "basic | enhanced | institutional",
    "kycProvider": "mirsad-ai",
    "kycTimestamp": "2026-03-11T00:00:00Z",
    "kycHash": "<hash_of_kyc_attestation>",
    "displayName": "<user_chosen_name>",
    "createdAt": "2026-03-11T00:00:00Z",
    "version": "1.0.0"
  },
  "businessProperties": {
    "companyName": "<optional>",
    "registrationNumber": "<optional>",
    "businessCategory": "<optional>",
    "kybLevel": "basic | verified | certified",
    "website": "<optional>"
  }
}
```

**Key Backup & Recovery:**
The X25519 encryption private key is backed up on IPFS, encrypted with a key derived from the user's platform authentication session (no separate passphrase). On device loss: user logs in → server releases the decryption material to the authenticated session → client fetches encrypted blob from IPFS → decrypts → recovers X25519 keypair. The backup CID is stored in the DID NFT metadata (`encryption.keyBackupCid`).

**Soulbound Enforcement:**
After minting the DID NFT to the user's account, the freeze key is used to freeze the token on that account. This prevents any transfer of the NFT while still allowing the platform to update metadata (via wipe + re-mint) or revoke the credential (via wipe).

#### 3.1.3 Account Types

| Feature | Individual | Business |
|---------|-----------|----------|
| KYC Level | Mirsad AI KYC | Mirsad AI KYB |
| DID NFT | Personal DID | Business DID |
| Organization | No | Yes (auto-created on KYB approval, multi-member team with RBAC) |
| Broadcast Topics | No | Yes (scoped to organization, multi-member posting for Owner/Admin) |
| Document Sharing | Send/receive in chat | Send/receive in chat + broadcast |
| Payment Features | Send, request, split | Send, request, split + broadcast payments (org-scoped) |
| Payment Requests | Create & pay requests | Create & pay requests (org members with Member+ role) |
| Transaction History | Personal ledger | Personal + org-level aggregated ledger |
| Verified Badge | KYC verified (gray) | KYB verified (blue), KYB certified (gold — future) |
| Group Limits | Standard | Extended |
| Profile Fields | Name, bio, avatar | Company info, catalog, hours, location (managed via org) |
| API Access | No | Yes (programmatic access) |

#### 3.1.4 Organization Model

Business accounts operate through organizations. An organization is auto-created when KYB is approved.

```
ORGANIZATION STRUCTURE:
┌─────────────────────────────────────────────────────────────┐
│  ORGANIZATION (auto-created on KYB approval)                │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Profile: name, logo, bio, category, website, hours  │  │
│  │  Hedera Account: owner's account (shared wallet TBD) │  │
│  │  KYB Status: pending → verified → certified          │  │
│  │  Badge: gray → blue → gold (based on KYB status)     │  │
│  │  Broadcast Topic: org-scoped HCS topic               │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  MEMBERS (max 50):                                          │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐      │
│  │  Owner   │  │  Admin   │  │ Member  │  │ Viewer  │      │
│  │ (1 only) │  │ (N)     │  │ (N)     │  │ (N)     │      │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘      │
│                                                              │
│  RBAC PERMISSION MATRIX:                                    │
│  ┌────────────────────┬───────┬───────┬────────┬────────┐  │
│  │ Permission         │ Owner │ Admin │ Member │ Viewer │  │
│  ├────────────────────┼───────┼───────┼────────┼────────┤  │
│  │ Update org profile │  ✅   │  ✅   │   ❌   │   ❌   │  │
│  │ Invite/remove      │  ✅   │  ✅   │   ❌   │   ❌   │  │
│  │ Change roles       │  ✅   │  ❌   │   ❌   │   ❌   │  │
│  │ Send messages      │  ✅   │  ✅   │   ✅   │   ❌   │  │
│  │ View conversations │  ✅   │  ✅   │   ✅   │   ✅   │  │
│  │ Send payments      │  ✅   │  ✅   │   ❌   │   ❌   │  │
│  │ Create pay requests│  ✅   │  ✅   │   ✅   │   ❌   │  │
│  │ View transactions  │  ✅   │  ✅   │   ✅   │   ✅   │  │
│  │ Post broadcasts    │  ✅   │  ✅   │   ❌   │   ❌   │  │
│  │ Delete org         │  ✅   │  ❌   │   ❌   │   ❌   │  │
│  └────────────────────┴───────┴───────┴────────┴────────┘  │
│                                                              │
│  CONTEXT SWITCHING:                                         │
│  User toggles between personal ↔ org context in UI.         │
│  Org context passed via X-Org-Context header or JWT claim.  │
│  All org-scoped endpoints go through OrgPermissionGuard.    │
│                                                              │
│  AUDIT TRAIL:                                               │
│  All role changes recorded on social graph HCS topic        │
│  (immutable, verifiable on HashScan).                       │
└─────────────────────────────────────────────────────────────┘
```

#### 3.1.5 Verified Business Badges

Badge tiers derived from server-side KYB status (non-fakeable):

| Tier | Badge | KYB Status | Description |
|------|-------|-----------|-------------|
| Basic | Gray checkmark | KYB submitted, pending review | Business has started verification |
| Verified | Blue checkmark | KYB approved by Mirsad AI | Fully verified business identity |
| Certified | Gold checkmark | Enhanced KYB (future) | Additional documentation verified |

Badge surfaces: profile page, chat conversation header, search results, broadcast channel listings. Badge links to on-chain verification proof (KYB attestation on HCS KYC Attestations topic).

---

### 3.2 Messaging Service

#### 3.2.1 HCS Topic Architecture

Every conversation maps to exactly one HCS topic. The topic type determines its privacy model.

```
TOPIC TYPES:
┌───────────────────────────────────────────────────────────────┐
│                                                               │
│  1:1 PRIVATE CHAT                                            │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ HCS Topic (private)                                  │     │
│  │ - submitKey: Platform operator key                  │     │
│  │ - Access control: Application layer (JWT + DB)      │     │
│  │ - Encrypted: AES-256-GCM (shared symmetric key)    │     │
│  │ - Key exchange: X25519 via nacl.box per participant │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                               │
│  GROUP CHAT                                                  │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ HCS Topic (private)                                  │     │
│  │ - submitKey: Platform operator key                  │     │
│  │ - Access control: Application layer (JWT + DB)      │     │
│  │ - Encrypted: AES-256-GCM (group symmetric key)     │     │
│  │ - Key rotation on member leave                       │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                               │
│  PUBLIC POST / SOCIAL FEED                                   │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ HCS Topic (public)                                   │     │
│  │ - submitKey: Single user's key (only they can post) │     │
│  │ - No encryption: Publicly readable via Mirror Node  │     │
│  │ - Followers subscribe by querying this topic         │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                               │
│  BUSINESS BROADCAST CHANNEL                                  │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ HCS Topic (public, restricted submit)                │     │
│  │ - submitKey: Business account key only              │     │
│  │ - No encryption: Public announcements               │     │
│  │ - Structured messages: Promotions, updates, catalog │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                               │
│  SYSTEM/NOTIFICATION TOPIC                                   │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ HCS Topic (per-user, private)                        │     │
│  │ - submitKey: Platform key only                      │     │
│  │ - Encrypted: User's public key                      │     │
│  │ - Platform → User notifications                      │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

#### 3.2.2 Message Format (HCS Payload)

All messages follow a standardized JSON schema, encrypted before submission.

**Chat Message:**
```json
{
  "v": "1.0",
  "type": "message",
  "sender": "0.0.123456",
  "timestamp": 1710100000000,
  "content": {
    "type": "text | image | file | voice | location | contact",
    "text": "Hello, how are you?",
    "mediaRef": "ipfs://<cid>",
    "mediaMeta": {
      "mimeType": "image/jpeg",
      "size": 245000,
      "dimensions": "1920x1080"
    }
  },
  "replyTo": "<sequence_number>",
  "nonce": "<random_nonce_for_encryption>"
}
```

**Note on 1KB HCS limit:** Text-only messages easily fit within 1024 bytes. For media messages, the actual file is stored on IPFS, and only the CID reference (typically ~60 bytes) is included in the HCS message. For messages approaching the limit, the HCS-1 fragmentation standard can split across multiple submissions, though this should be rare with proper schema design.

#### 3.2.3 Encryption Architecture

**Two-Layer Model:** Message encryption uses client-side X25519 keypairs (Layer 2), completely separate from the MPC custody key (Layer 1). The platform can submit messages to HCS topics (it holds the submitKey) but **cannot read** message content (it does not hold any participant's X25519 private key).

```
KEY EXCHANGE FLOW (on conversation creation):
═══════════════════════════════════════════════

1. Initiating client generates AES-256-GCM symmetric key (Ks)
2. For each participant (P1, P2, ... Pn):
   a. Retrieve participant's X25519 encryption public key from platform DB
      (query users.encryption_public_key — fast path; DID NFT metadata is the backup/verification source)
   b. Encrypt Ks with participant's X25519 key via nacl.box → EncKey_Pi
3. Client sends key bundle to platform backend
4. Platform submits key bundle to HCS topic as first message (using platform operator submitKey):

   {
     "v": "1.0",
     "type": "key_exchange",
     "keys": {
       "0.0.111111": "<EncKey_P1_base64>",
       "0.0.222222": "<EncKey_P2_base64>"
     },
     "algorithm": "AES-256-GCM",
     "keyExchange": "x25519-xsalsa20-poly1305",
     "keyId": "<uuid>",
     "rotationIndex": 0
   }

5. Platform backend NEVER sees Ks (it was encrypted client-side)
6. Each participant decrypts their key bundle locally using their X25519 private key

MESSAGE ENCRYPTION FLOW:
═══════════════════════════════════════════════

1. Client retrieves Ks (cached locally after key exchange)
2. Generate random nonce (96-bit for GCM)
3. Encrypt message payload: AES-256-GCM(Ks, nonce, plaintext)
4. Send encrypted payload to platform backend
5. Platform submits to HCS: { encrypted_payload, nonce, sender, keyId }
6. Recipient decrypts using same Ks + nonce

KEY ROTATION FLOW (on member leave):
═══════════════════════════════════════════════

1. Group admin's client generates new AES-256-GCM key (Ks_new)
2. Encrypt Ks_new for ALL REMAINING members (excluding departed) using their X25519 keys
3. Submit new key_exchange message with incremented rotationIndex
4. All future messages use Ks_new
5. Previous messages remain readable with Ks_old (forward secrecy not enforced)
```

**Privacy Guarantee:** The platform backend submits messages to HCS topics (it holds the submitKey for fast, low-latency submission) but **never** possesses symmetric conversation keys or X25519 private keys. All encryption/decryption happens client-side. The platform sees only opaque ciphertext. This is architecturally equivalent to Signal's model: the server routes encrypted blobs but cannot read them.

**Why platform submitKey instead of per-user MPC signing:** MPC threshold signing (FROST across 9 nodes) takes 1-5 seconds per signature. For chat messages requiring sub-second delivery, this latency is unacceptable. The platform operator key enables instant HCS submission while E2E encryption ensures the platform cannot read content. Access control (who can send to which conversation) is enforced at the application layer via JWT authentication and database membership checks.

#### 3.2.4 Real-Time Message Delivery

```
REAL-TIME ARCHITECTURE:
═══════════════════════════════════════════════

┌──────────┐        ┌──────────────┐        ┌──────────────┐
│  Client  │◄──WS──►│  Platform    │◄──gRPC─┤  Mirror Node │
│  (App)   │        │  WebSocket   │        │  Subscription│
│          │        │  Gateway     │        │              │
└──────────┘        └──────────────┘        └──────────────┘

Flow:
1. User opens app → WebSocket connection established
2. Platform subscribes to Mirror Node for all user's active topics
3. Mirror Node streams new messages as they achieve consensus
4. Platform forwards encrypted message to client via WebSocket (platform NEVER decrypts)
5. Client decrypts locally using cached conversation symmetric key
6. Client displays message with sequence number and consensus timestamp

Fallback:
- If WebSocket disconnects, client queries Mirror Node REST API
  for missed messages using last known sequence number
- Messages are never lost — they're on-chain permanently
```

---

### 3.3 Social Feed Service

#### 3.3.1 Post Types

| Post Type | HCS Topic | Encrypted | Content |
|-----------|-----------|-----------|---------|
| Public Post | User's public feed topic | No | Text, media refs (IPFS) |
| Story (24h) | User's story topic | No | Media ref + expiry metadata |
| Business Update | Business broadcast topic | No | Structured announcement |

#### 3.3.2 Social Graph (On-Chain)

The social graph is derived from on-chain activity, not stored in a centralized database:

```
FOLLOW: User A subscribes to User B's public feed topic
        → Recorded as a platform-level HCS message:
          { "type": "follow", "follower": "0.0.AAAA", "following": "0.0.BBBB" }

UNFOLLOW: Same topic, new message:
          { "type": "unfollow", "follower": "0.0.AAAA", "following": "0.0.BBBB" }

SOCIAL GRAPH TOPIC: A dedicated platform-wide HCS topic that records all
social graph mutations (follows, unfollows, blocks). The current state
is derived by replaying all events — classic event-sourcing on-chain.
```

**Platform Index:** For performance, the platform maintains a PostgreSQL index of the social graph (who follows whom, follower counts, etc.) rebuilt from on-chain events. This enables fast queries (e.g., "show me my followers") without querying the full HCS topic history on every request.

#### 3.3.3 Feed Construction

```
USER'S HOME FEED:
1. Query PostgreSQL index for list of accounts user follows
2. For each followed account, query Mirror Node (or cached index)
   for recent posts from their public feed topic
3. Merge, sort by consensus timestamp, paginate
4. Return to client

Note: Feed ranking/algorithm is applied at the platform layer,
not on-chain. On-chain data is raw and chronological.
The platform adds value through curation, recommendations, etc.
```

---

### 3.4 In-Chat Payments Service

**Design Principle:** Payments are not a separate feature — they're a native part of conversations. Sending money is as natural as sending a message. The payment (HTS transfer signed via Tamam MPC Custody) is recorded alongside messages (HCS) in the same conversation. Your social and financial interactions are unified on one chain.

**Payment Tokens:** The Tamam Consortium manages stablecoins as standard HTS tokens. Our platform simply uses these tokens for transfers — no external "Payment Rails" API. Transfers are standard `CryptoTransferTransaction` operations signed through MPC Custody.

#### 3.4.1 Payment Flow (via MPC Custody + HTS)

```
P2P PAYMENT:
═══════════════════════════════════════════════

┌──────────┐    ┌──────────┐    ┌─────────────┐    ┌──────────┐
│  Sender  │    │ Platform │    │ Tamam MPC   │    │  Hedera  │
│  Client  │    │ Backend  │    │ Custody     │    │  Network │
└────┬─────┘    └────┬─────┘    └──────┬──────┘    └────┬─────┘
     │               │                │                │
     │ Send $50 to   │                │                │
     │ User B        │                │                │
     ├──────────────►│                │                │
     │               │                │                │
     │               │ Build          │                │
     │               │ CryptoTransfer │                │
     │               │ transaction    │                │
     │               ├───────────────►│                │
     │               │ Sign via MPC   │                │
     │               │ (FROST 9-node) │                │
     │               │                │                │
     │               │                │ Execute HTS    │
     │               │                │ token transfer │
     │               │                ├───────────────►│
     │               │                │                │
     │               │                │◄───────────────┤
     │               │                │ Tx confirmed   │
     │               │◄───────────────┤                │
     │               │ Payment        │                │
     │               │ confirmed      │                │
     │◄──────────────┤                │                │
     │               │                │                │
     │ Post payment  │                │                │
     │ receipt to    │                │                │
     │ conversation  │                │                │
     │ via HCS       │                │                │
     │               ├──────────────────────────────────►│
     │               │                │            HCS msg│
```

#### 3.4.2 In-Chat Payment Widgets

**Widget 1: Send Money**
User taps a payment button in the chat input bar (like attaching a photo). They enter an amount and optional note. The platform builds a `CryptoTransferTransaction`, signs it via MPC Custody, and submits to Hedera. A payment receipt message is posted to the conversation HCS topic. One action = TWO Hedera transactions (HTS transfer + HCS receipt).

```json
{
  "v": "1.0",
  "type": "payment",
  "sender": "0.0.SENDER",
  "content": {
    "action": "send",
    "amount": 50.00,
    "currency": "USD",
    "tokenId": "0.0.TOKEN_ID",
    "recipient": "0.0.RECIPIENT",
    "note": "Here's the $50 I owe you",
    "txHash": "<hedera_transaction_id>",
    "status": "confirmed"
  }
}
```

**Widget 2: Request Money**
User sends a structured payment request within a conversation. Recipient sees a "Pay" button. One tap triggers the MPC Custody signing flow.

```json
{
  "v": "1.0",
  "type": "payment_request",
  "sender": "0.0.REQUESTER",
  "content": {
    "action": "request",
    "amount": 50.00,
    "currency": "USD",
    "note": "Dinner last night",
    "requestId": "<uuid>",
    "status": "pending | paid | declined",
    "paidTxHash": null
  }
}
```

**Widget 3: Split Payment (Group Chat)**
In a group conversation, a user creates a split request. Each participant sees their share with a "Pay" button. As each person pays, the group sees real-time confirmations.

```json
{
  "v": "1.0",
  "type": "payment_split",
  "sender": "0.0.INITIATOR",
  "content": {
    "action": "split",
    "totalAmount": 120.00,
    "currency": "USD",
    "note": "Dinner - split 4 ways",
    "splitId": "<uuid>",
    "participants": {
      "0.0.USER_A": { "amount": 30.00, "status": "paid", "txHash": "<tx>" },
      "0.0.USER_B": { "amount": 30.00, "status": "pending", "txHash": null },
      "0.0.USER_C": { "amount": 30.00, "status": "paid", "txHash": "<tx>" },
      "0.0.USER_D": { "amount": 30.00, "status": "pending", "txHash": null }
    }
  }
}
```

**Hackathon impact:** Each split payment in a 4-person group generates up to 4 HTS transfers + 5 HCS messages = 9 Hedera transactions from a single user action. Organic transaction volume that scores highly on "Success" criteria.

#### 3.4.3 Payment Request Lifecycle

Payment requests have a full status lifecycle tracked both on-chain (HCS) and in the platform DB:

```
PAYMENT REQUEST FLOW:
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Created  │────▶│  Pending  │────▶│   Paid   │
│ (HCS msg) │     │ (in chat) │     │(HTS+HCS) │
└──────────┘     └────┬─────┘     └──────────┘
                      │
                      ├──────────▶ Expired (past expiresAt)
                      │
                      └──────────▶ Declined (recipient declines)
```

Status updates are submitted as separate HCS messages (`payment_request_update` type) to the same conversation topic for immutable audit trail. Platform DB (`payment_requests` table) serves as the queryable index.

Both individual and business users can send payment requests. In org context, requests show the org name + verified badge and are recorded in org transaction history.

#### 3.4.4 Transaction History

All payments (send, receive, request fulfillment, split) are indexed in the `transactions` table for fast querying. This is a **platform-side index** — the source of truth remains on Hedera (HTS transfers + HCS receipts).

```
TRANSACTION INDEXING:
  HTS Transfer (on-chain) ─┐
                            ├──▶ transactions table (platform DB)
  HCS Receipt (on-chain) ──┘           │
                                       ├── Personal view (user_id)
                                       └── Org view (organization_id)
```

Org transaction history aggregates all payments made by org members acting in org context, filterable by member. Both personal and org views are accessible via the same API endpoint with context switching.

---

### 3.5 Document Sharing (via Chat)

**Note:** Document sharing is a message type within conversations, not a separate service. This keeps the architecture conversation-centric and avoids unnecessary backend complexity.

Documents are shared as encrypted files on IPFS, referenced by HCS messages in the conversation topic:

```json
{
  "v": "1.0",
  "type": "message",
  "sender": "0.0.SENDER",
  "content": {
    "type": "file",
    "mediaRef": "ipfs://<encrypted_document_cid>",
    "mediaMeta": {
      "filename": "Contract-Draft-v2.pdf",
      "mimeType": "application/pdf",
      "size": 125000,
      "hash": "<sha256_of_original>"
    }
  }
}
```

The HCS message provides immutable proof: timestamp (when shared), hash (document integrity), and sender (who shared it). Full document management (catalogs, signed contracts, invoice templates) is **future roadmap**.

---

### 3.6 Notification Service

#### 3.6.1 Notification Architecture

Each user has a dedicated **notification topic** (private HCS topic, platform submit key only). The platform writes structured notifications here:

```json
{
  "v": "1.0",
  "type": "notification",
  "category": "message | payment | social | system",
  "data": {
    "event": "new_message | payment_received | new_follower | kyc_approved",
    "from": "0.0.SENDER",
    "topicId": "0.0.TOPIC",
    "preview": null,
    "_note": "Message previews are NOT available server-side (E2E encrypted). Client shows generic 'New message' until decrypted locally.",
    "amount": null,
    "timestamp": 1710100000000
  }
}
```

Notifications are delivered in real-time via WebSocket and persisted on HCS for history. Push notifications to mobile are handled by a standard push service (FCM/APNs) triggered by the notification service when it writes to the HCS topic.

---

## 4. Technology Stack

### 4.1 Frontend

| Component | Technology | Justification |
|-----------|-----------|---------------|
| **Web App** | Next.js 14+ (App Router) | SSR for SEO, React ecosystem, API routes |
| **Mobile App** | React Native + Expo | Code sharing with web, Hedera SDK compatibility |
| **State Management** | Zustand + React Query | Lightweight, server state management |
| **Real-time** | WebSocket (native) | Low-latency message delivery |
| **Encryption** | Web Crypto API + tweetnacl | Browser-native AES-256-GCM, X25519 key exchange |
| **UI Framework** | Tailwind CSS + shadcn/ui | Rapid development, consistent design |
| **Media** | IPFS HTTP Gateway | Decentralized media delivery |

### 4.2 Backend

| Component | Technology | Justification |
|-----------|-----------|---------------|
| **API Server** | Node.js + NestJS | Modular architecture, TypeScript native |
| **API Protocol** | REST + WebSocket | REST for CRUD, WS for real-time |
| **Hedera SDK** | @hiero-ledger/sdk v2.70+ | Official SDK, full service coverage |
| **Database** | PostgreSQL 16 | Relational indexing of on-chain data |
| **Cache** | Redis 7 | Session management, topic subscriptions, hot data |
| **Queue** | BullMQ (Redis-backed) | Async job processing (HCS submissions, notifications) |
| **File Storage** | IPFS (Pinata/nft.storage) | Decentralized media and document storage |
| **Search** | PostgreSQL full-text search | Full-text search over public content (profiles, posts). Messages are E2E encrypted — search is client-side only. Meilisearch can be added in production for scale. |

### 4.3 Infrastructure

| Component | Technology | Justification |
|-----------|-----------|---------------|
| **Container Runtime** | Docker + Docker Compose | Local dev and deployment consistency |
| **Orchestration** | Kubernetes (production) | Horizontal scaling, health management |
| **CI/CD** | GitHub Actions | Integrated with repo, free for public repos |
| **Monitoring** | Prometheus + Grafana | Metrics, alerting, Hedera transaction monitoring |
| **Logging** | Loki + structured JSON logs | Centralized logging |
| **CDN** | Cloudflare | Static assets, DDoS protection, edge caching |
| **DNS** | Cloudflare DNS | Fast resolution, DDoS protection |

### 4.4 Hedera Integration

| Component | Service | Cost (2026) |
|-----------|---------|-------------|
| **Account Creation** | Tamam MPC + Auto-Account | ~$0.05 (via Custody createHederaAccount) |
| **DID NFT Minting** | HTS (TokenMint) | ~$0.05 per NFT |
| **Chat Message** | HCS (SubmitMessage) | $0.0008 per message |
| **Topic Creation** | HCS (CreateTopic) | $0.01 per topic |
| **Token Transfer** | HTS (CryptoTransfer) | ~$0.001 per transfer |
| **Smart Contract Deploy** | HSCS (ContractCreate) | ~$0.05-1.00 (depends on size) |
| **Smart Contract Call** | HSCS (ContractCall) | ~$0.005-0.05 per call |
| **Mirror Node Query** | REST API | Free |

---

## 5. Hedera Service Mapping — Complete Feature Matrix

```
┌──────────────────────────┬──────────────┬──────────────────────────────┐
│ PLATFORM FEATURE         │ HEDERA SVC   │ IMPLEMENTATION               │
├──────────────────────────┼──────────────┼──────────────────────────────┤
│ User onboarding          │ MPC Custody  │ Tamam MPC key generation     │
│                          │ + Auto-Acct  │ with createHederaAccount     │
├──────────────────────────┼──────────────┼──────────────────────────────┤
│ Identity (DID)           │ HTS + IPFS   │ Soulbound NFT with metadata  │
│                          │              │ on IPFS (HIP-412 schema)     │
├──────────────────────────┼──────────────┼──────────────────────────────┤
│ KYC/KYB attestation      │ HCS          │ Mirsad AI result recorded on  │
│                          │              │ attestation topic            │
├──────────────────────────┼──────────────┼──────────────────────────────┤
│ 1:1 messaging            │ HCS          │ Private topic, AES-256-GCM   │
│                          │              │ encrypted, key via HCS       │
├──────────────────────────┼──────────────┼──────────────────────────────┤
│ Group chat               │ HCS          │ Private topic, shared key,   │
│                          │              │ key rotation on leave        │
├──────────────────────────┼──────────────┼──────────────────────────────┤
│ Public posts             │ HCS          │ Public topic, plaintext,     │
│                          │              │ media via IPFS               │
├──────────────────────────┼──────────────┼──────────────────────────────┤
│ Stories (ephemeral)      │ HCS          │ Public topic with expiry     │
│                          │              │ metadata (UI enforced)       │
├──────────────────────────┼──────────────┼──────────────────────────────┤
│ Social graph (follow)    │ HCS          │ Event-sourced on platform    │
│                          │              │ social graph topic           │
├──────────────────────────┼──────────────┼──────────────────────────────┤
│ In-chat Send Money       │ HTS + HCS    │ CryptoTransfer signed via    │
│                          │ + MPC Custody│ MPC Custody + HCS receipt    │
├──────────────────────────┼──────────────┼──────────────────────────────┤
│ In-chat Request Money    │ HCS + HTS    │ Request as HCS msg, payment  │
│                          │ + MPC Custody│ via HTS (MPC-signed), HCS    │
├──────────────────────────┼──────────────┼──────────────────────────────┤
│ In-chat Split Payment    │ HCS + HTS    │ Split request + N individual │
│                          │ + MPC Custody│ MPC-signed transfers + HCS   │
├──────────────────────────┼──────────────┼──────────────────────────────┤
│ Business broadcast       │ HCS          │ Public topic, restricted     │
│                          │              │ submit key (business only)   │
├──────────────────────────┼──────────────┼──────────────────────────────┤
│ Document sharing         │ IPFS + HCS   │ Encrypted file on IPFS,     │
│                          │              │ hash + ref on HCS            │
├──────────────────────────┼──────────────┼──────────────────────────────┤
│ Notifications            │ HCS          │ Per-user private topic,      │
│                          │              │ platform submit key          │
├──────────────────────────┼──────────────┼──────────────────────────────┤
│ Profile rendering        │ Mirror Node  │ Query account's full on-chain│
│                          │              │ history to build profile     │
├──────────────────────────┼──────────────┼──────────────────────────────┤
│ Transaction history      │ Mirror Node  │ All HTS transfers queryable  │
├──────────────────────────┼──────────────┼──────────────────────────────┤
│ Message history          │ Mirror Node  │ All HCS messages queryable   │
│                          │              │ (encrypted, client decrypts) │
├──────────────────────────┼──────────────┼──────────────────────────────┤
│ Wallet management        │ Tamam MPC    │ FROST threshold signing,     │
│                          │ Custody      │ 9-node MPC, no SPOF         │
├──────────────────────────┼──────────────┼──────────────────────────────┤
│ Multi-sig operations     │ HSS          │ Scheduled transactions for   │
│                          │              │ business approvals           │
└──────────────────────────┴──────────────┴──────────────────────────────┘
```

---

## 6. Cost Model

### 6.1 Per-User Economics (Monthly)

**Casual User (50 messages/day, 5 posts/month):**
| Activity | Transactions | Cost/Month |
|----------|-------------|------------|
| Messages | 1,500 HCS msgs | $1.20 |
| Posts | 5 HCS msgs | $0.004 |
| Follows/interactions | ~20 HCS msgs | $0.016 |
| Topic creation (new chats) | ~2 | $0.02 |
| **Total** | **~1,527** | **~$1.24** |

**Active User (200 messages/day, 20 posts/month):**
| Activity | Transactions | Cost/Month |
|----------|-------------|------------|
| Messages | 6,000 HCS msgs | $4.80 |
| Posts | 20 HCS msgs | $0.016 |
| Interactions | ~100 HCS msgs | $0.08 |
| Payments | ~10 HTS transfers | $0.01 |
| **Total** | **~6,130** | **~$4.91** |

**Business Account (500 messages/day, 50 broadcasts/month):**
| Activity | Transactions | Cost/Month |
|----------|-------------|------------|
| Messages | 15,000 HCS msgs | $12.00 |
| Broadcasts | 50 HCS msgs | $0.04 |
| Catalog updates | ~30 HCS msgs | $0.024 |
| Invoices/docs | ~20 HCS msgs | $0.016 |
| Payments | ~50 HTS transfers | $0.05 |
| **Total** | **~15,150** | **~$12.13** |

### 6.2 Revenue Model Considerations

| Revenue Stream | Description |
|---------------|-------------|
| **Premium accounts** | Higher limits, business features, API access |
| **Transaction fees** | Small fee on HTS payment transfers |
| **Platform fee on escrow** | 1% on marketplace transactions |
| **Business subscriptions** | Monthly fee for business tools, analytics |
| **HIP-991 topic fees** | Optional per-message fees on business channels |

---

## 7. Security Architecture

### 7.1 Threat Model

| Threat | Mitigation |
|--------|-----------|
| **Key compromise** | Tamam MPC Custody — FROST threshold signing across 9 nodes, no single party holds full key |
| **Message interception** | AES-256-GCM encryption, X25519 key exchange, platform never sees plaintext |
| **Identity spoofing** | Soulbound DID NFT tied to KYC-verified account |
| **Platform compromise** | Platform holds submitKey but cannot read messages (no X25519 private keys) |
| **Data loss** | All data on Hedera — platform is reconstructable; X25519 backup on IPFS |
| **Spam/abuse** | KYC gate + rate limiting + platform-controlled submit key |
| **Sybil attacks** | Mirsad AI KYC prevents multiple fake identities |

### 7.2 Privacy Layers

```
LAYER 1: Network Level
- Hedera nodes process transactions but don't interpret content
- Encrypted payloads are opaque to consensus layer

LAYER 2: Application Level
- AES-256-GCM encryption for all private messages
- X25519 key exchange via nacl.box (encrypted key bundles on HCS)
- Platform holds submitKey for HCS but cannot decrypt content
- All encryption/decryption happens client-side

LAYER 3: Identity Level
- KYC data stored by Mirsad AI, NOT on-chain
- Only attestation hash + verification status on-chain
- User controls what profile data is public vs private

LAYER 4: Metadata Level
- Topic existence is visible (who has conversations)
- Message timing is visible (when messages are sent)
- Content is NOT visible (encrypted)
- Future: Metadata privacy via mixing/batching (roadmap)
```

---

## 8. API Design — Key Contracts

### 8.1 REST API Overview

```
BASE URL: /api/v1

IDENTITY
  POST   /auth/register          - Begin registration
  POST   /auth/verify-kyc        - Submit KYC documents (Mirsad AI)
  GET    /auth/kyc-status         - Check KYC status
  GET    /profile/:accountId      - Get user profile (from index)
  PUT    /profile/me              - Update profile metadata
  GET    /profile/:accountId/did  - Get DID NFT details

MESSAGING
  POST   /conversations           - Create new conversation (1:1 or group)
  GET    /conversations           - List user's conversations
  GET    /conversations/:topicId  - Get conversation details
  POST   /conversations/:topicId/messages - Submit message to HCS
  GET    /conversations/:topicId/messages - Get messages (from index/mirror)
  POST   /conversations/:topicId/members  - Add member to group
  DELETE /conversations/:topicId/members/:accountId - Remove member

SOCIAL
  POST   /posts                   - Create public post
  GET    /feed                    - Get user's home feed
  GET    /posts/:accountId        - Get user's posts
  POST   /social/follow/:accountId    - Follow user
  DELETE /social/follow/:accountId    - Unfollow user
  GET    /social/followers/:accountId - Get followers
  GET    /social/following/:accountId - Get following

IN-CHAT PAYMENTS (via MPC Custody + HTS)
  POST   /payments/send           - Send money in conversation (MPC sign → HTS + HCS)
  POST   /payments/request        - Request money in conversation (HCS)
  POST   /payments/split          - Create split payment in group (HCS)
  POST   /payments/split/:id/pay  - Pay your share of a split (MPC sign → HTS + HCS)
  GET    /payments/history        - Get payment history (Mirror Node)

BUSINESS
  POST   /business/broadcast      - Send broadcast message (HCS)

NOTIFICATIONS
  GET    /notifications           - Get notification history
  WS     /ws                      - WebSocket for real-time updates
```

### 8.2 WebSocket Events

```
// Client → Server
{ "type": "subscribe", "topics": ["0.0.12345", "0.0.12346"] }
{ "type": "typing", "topicId": "0.0.12345" }
{ "type": "read", "topicId": "0.0.12345", "upToSeq": 42 }

// Server → Client
{ "type": "message", "topicId": "0.0.12345", "data": { ... } }
{ "type": "typing", "topicId": "0.0.12345", "accountId": "0.0.67890" }
{ "type": "notification", "data": { ... } }
{ "type": "payment", "data": { ... } }
```

---

## 9. Deployment Architecture

### 9.1 Production Infrastructure

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLOUDFLARE                                │
│   ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│   │     CDN     │  │  DDoS Prot.  │  │  DNS + SSL Termination│  │
│   └──────┬──────┘  └──────┬───────┘  └──────────┬───────────┘  │
└──────────┼─────────────────┼────────────────────┼───────────────┘
           │                 │                    │
┌──────────▼─────────────────▼────────────────────▼───────────────┐
│                     KUBERNETES CLUSTER                           │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  INGRESS CONTROLLER (nginx)                              │   │
│   └─────────┬───────────────────┬────────────────────────────┘   │
│             │                   │                                │
│   ┌─────────▼──────┐  ┌────────▼──────┐                        │
│   │  API Pods (x3) │  │  WS Pods (x3) │  ← Horizontal scaling  │
│   │  (NestJS)      │  │  (WebSocket)  │                        │
│   └─────────┬──────┘  └────────┬──────┘                        │
│             │                   │                                │
│   ┌─────────▼───────────────────▼──────────────────────────┐   │
│   │  INTERNAL SERVICES                                      │   │
│   │  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐ │   │
│   │  │ Identity │ │Messaging │ │  Payment  │ │  Social  │ │   │
│   │  │ Worker   │ │ Worker   │ │  Worker   │ │  Worker  │ │   │
│   │  └──────────┘ └──────────┘ └───────────┘ └──────────┘ │   │
│   └────────────────────────────────────────────────────────┘   │
│                                                                  │
│   ┌────────────────────────────────────────────────────────┐   │
│   │  DATA LAYER                                             │   │
│   │  ┌────────────┐ ┌─────────┐ ┌───────────────────────┐ │   │
│   │  │ PostgreSQL │ │  Redis  │ │ PG Full-Text Search   │ │   │
│   │  │ (Primary + │ │ Cluster │ │ (Public content only) │ │   │
│   │  │  Replica)  │ │         │ │                       │ │   │
│   │  └────────────┘ └─────────┘ └───────────────────────┘ │   │
│   └────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
           │                                    │
           ▼                                    ▼
┌──────────────────────┐            ┌───────────────────────┐
│  Hedera Network      │            │  External Services    │
│  (Mainnet/Testnet)   │            │  - Mirsad AI KYC API   │
│  - HCS               │            │  - Tamam MPC Custody  │
│  - HTS               │            │  - IPFS (Pinata)      │
│  - HSCS              │            │  - FCM/APNs (Push)    │
│  - Mirror Node       │            │                       │
└──────────────────────┘            └───────────────────────┘
```

### 9.2 Environment Strategy

| Environment | Hedera Network | Database | Purpose |
|-------------|---------------|----------|---------|
| **Local Dev** | Testnet | Local PostgreSQL | Developer workstations |
| **Staging** | Testnet | Cloud PostgreSQL | Integration testing, QA |
| **Production** | Mainnet | Cloud PostgreSQL (HA) | Live users |

---

## 10. Risk Assessment

### 10.1 Technical Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|------------|
| HCS message costs at scale | Medium | High | Batch non-critical messages, subsidize via revenue |
| 1KB HCS message limit | Low | Medium | HCS-1 fragmentation, IPFS for media |
| Mirror Node query latency | Medium | Medium | PostgreSQL index as read cache |
| Key management UX | High | Medium | Tamam MPC Custody abstracts complexity |
| Hedera network outage | High | Low | Queue messages, retry on recovery |
| Encryption key loss | High | Medium | Platform auth-derived backup on IPFS, CID in DID NFT |

### 10.2 Business Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|------------|
| User adoption friction (Web3 UX) | High | High | Abstract blockchain entirely — user sees chat app, not transactions |
| Regulatory (messaging + payments) | High | Medium | Mirsad AI KYC/KYB, Tamam Consortium compliance |
| Cost sustainability | Medium | Medium | Tiered pricing, business subscriptions |
| Competition (WhatsApp, Signal) | High | High | Unique value: data sovereignty, on-chain identity |

---

## 11. Hackathon Scoring Strategy

Mapping platform features to the judging criteria:

| Criteria | Weight | Our Strength |
|----------|--------|-------------|
| **Innovation (10%)** | Every message on-chain, wallet-as-identity, DID NFTs — novel in Hedera ecosystem |
| **Feasibility (10%)** | Existing products (Mirsad AI, Tamam MPC Custody) prove team capability; Web3 adds genuine value over Web2 |
| **Execution (20%)** | Working demo with real messaging, real HCS transactions, real NFT minting |
| **Integration (15%)** | Uses HCS, HTS, HSCS, Mirror Node, Auto-Account, DID method — deepest possible integration |
| **Success (20%)** | Every user = new Hedera account; every message = HCS transaction; massive TPS potential |
| **Validation (15%)** | Existing Tamam platform user base for market feedback; early adopter testing |
| **Pitch (10%)** | Compelling narrative: "Your wallet is your digital self" |

---

## 12. Glossary

| Term | Definition |
|------|-----------|
| **HCS** | Hedera Consensus Service — pub/sub messaging with consensus timestamps |
| **HTS** | Hedera Token Service — native token creation (fungible + NFT) |
| **HSCS** | Hedera Smart Contract Service — EVM-compatible smart contracts |
| **DID** | Decentralized Identifier — W3C standard for self-sovereign identity |
| **NFT** | Non-Fungible Token — unique on-chain asset |
| **Soulbound** | Non-transferable token permanently bound to an account |
| **MPC** | Multi-Party Computation — distributed key management |
| **HIP** | Hedera Improvement Proposal — network upgrade specifications |
| **Mirror Node** | Read-only node that indexes and serves historical Hedera data |
| **Topic** | HCS construct for organizing related messages |
| **Submit Key** | Cryptographic key required to publish messages to a private topic |

---

*Document Version: 1.0*
*Created: March 11, 2026*
*Status: Architecture Design — Pending Implementation Planning*
