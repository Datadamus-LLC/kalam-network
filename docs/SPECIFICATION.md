# Hedera Social Platform — Detailed Specification

## Document Control
| Field | Value |
|-------|-------|
| Version | 1.0 |
| Status | Draft |
| Created | 2026-03-11 |
| Hackathon Track | Open Track |
| Submission Deadline | 2026-03-23, 11:59 PM ET |
| Related Document | ARCHITECTURE.md |

---

# TABLE OF CONTENTS

1. [Product Overview](#1-product-overview)
2. [Functional Requirements](#2-functional-requirements)
3. [User Stories & Acceptance Criteria](#3-user-stories--acceptance-criteria)
4. [Data Models](#4-data-models)
5. [API Specification](#5-api-specification)
6. [Hedera Integration Specification](#6-hedera-integration-specification)
7. [Security Specification](#7-security-specification)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [UI/UX Requirements](#9-uiux-requirements)
10. [Testing Requirements](#10-testing-requirements)
11. [Deployment Specification](#11-deployment-specification)
12. [Future Roadmap Features](#12-future-roadmap-features)

---

# 1. Product Overview

## 1.1 Vision Statement

A blockchain-native social platform where every user's Hedera wallet is their digital identity. Every message, post, payment, and interaction is a verifiable Hedera transaction. The user's on-chain history becomes their digital biography — portable, sovereign, and permanent.

## 1.2 Core Principles

| Principle | Description |
|-----------|-------------|
| **Wallet-as-Identity** | Your Hedera account IS your profile, not an account on a platform |
| **On-Chain First** | Every user action generates at least one Hedera transaction |
| **Privacy by Design** | All private messages are E2E encrypted; platform cannot read them |
| **Conversation-Centric** | Everything happens within conversations — messages, payments, documents |
| **Reconstructable** | If the platform database is wiped, all state is recoverable from Hedera |

## 1.3 Product Ecosystem

| Product | Integration Role | Integration Type |
|---------|-----------------|-----------------|
| **Mirsad AI** | KYC/KYB identity verification (formerly Mirsad) | API integration |
| **Tamam MPC Custody** | MPC wallet key management (FROST threshold signing) | API integration |
| **Tamam Consortium** | Stablecoin issuance (standard HTS tokens for payments) | Token usage |
| **Hedera Network** | Core infrastructure (HCS, HTS, Mirror Node) | SDK integration |
| **IPFS (Pinata)** | Decentralized media and document storage | API integration |

## 1.4 Account Types

| Aspect | Individual Account | Business Account |
|--------|-------------------|-----------------|
| Verification | Mirsad AI KYC | Mirsad AI KYB |
| DID NFT Metadata | Personal fields | Company fields |
| Broadcast Channel | No | Yes (1-to-many public topic) |
| Payment Features | Send, Request, Split | Send, Request, Split, Broadcast payments |
| Document Sharing | In-chat files | In-chat files + broadcast attachments |
| Group Size Limit | Up to 256 members | Up to 1,024 members |
| Profile Fields | Name, bio, avatar, location | Company name, category, website, hours, logo |
| API Access | No | Yes (future) |
| Organization Tenancy | No | Yes (multi-member team with RBAC) |
| Verified Badge | KYC verified (gray) | KYB verified (blue), KYB certified (gold) |
| Transaction Dashboard | Personal history | Org-level aggregated history |

---

# 2. Functional Requirements

## 2.1 Module: Identity & Onboarding

### FR-ID-001: User Registration
| Field | Detail |
|-------|--------|
| Description | User initiates registration with email or phone number and password |
| Input | Email address OR phone number, password |
| Process | 1. Validate input format and password strength. 2. Hash password with bcrypt (12 rounds). 3. Send OTP to email/phone. 4. User confirms OTP. 5. Create user record in platform DB (status: pending_wallet). |
| Output | Authenticated session, user proceeds to wallet creation |
| Hedera Transactions | None at this stage |

### FR-ID-002: Wallet Creation
| Field | Detail |
|-------|--------|
| Description | System creates Hedera account for the user via Tamam MPC Custody |
| Trigger | Successful OTP verification (FR-ID-001) |
| Process | 1. Call Tamam MPC Custody API to create vault and generate FROST threshold key shares across 9 MPC nodes (with `createHederaAccount: true`). 2. Custody API auto-creates a Hedera account with the MPC-derived public key. 3. Receive Hedera Account ID (0.0.XXXXX) and vault ID. 4. Client generates X25519 encryption keypair locally (Layer 2). 5. Store Hedera Account ID and vault mapping in platform DB. 6. Update user status to: pending_kyc. |
| Output | Hedera Account ID + X25519 encryption public key |
| Hedera Transactions | 1x AccountCreate (via Custody API, ~$0.05) |
| Error Handling | If Tamam MPC Custody API fails: retry 3x with exponential backoff, then show error to user. If Hedera account creation fails: log error, notify ops, show retry option to user. |

### FR-ID-003: KYC Submission (Individual)
| Field | Detail |
|-------|--------|
| Description | User submits identity documents for KYC verification via Mirsad AI |
| Trigger | User has wallet (FR-ID-002), selects "Individual" account type |
| Process | 1. Present KYC form (name, DOB, nationality, ID document upload). 2. Submit to Mirsad AI API for screening. 3. Mirsad AI processes and returns result (approved/rejected/pending_review). 4. If approved: update user status to kyc_approved, proceed to FR-ID-005. 5. If rejected: notify user with reason, allow re-submission. 6. If pending_review: notify user, await Mirsad AI callback. |
| Output | KYC status updated |
| Hedera Transactions | None (KYC attestation happens in FR-ID-005) |

### FR-ID-004: KYB Submission (Business)
| Field | Detail |
|-------|--------|
| Description | Business submits company documents for KYB verification via Mirsad AI |
| Trigger | User has wallet (FR-ID-002), selects "Business" account type |
| Process | 1. Present KYB form (company name, registration number, business category, authorized representative details, company document upload). 2. Submit to Mirsad AI API for business screening. 3. Mirsad AI processes and returns result. 4. If approved: update user status to kyb_approved, proceed to FR-ID-005. 5. If rejected/pending: same as FR-ID-003. |
| Output | KYB status updated |
| Hedera Transactions | None |

### FR-ID-005: DID NFT Minting
| Field | Detail |
|-------|--------|
| Description | System mints a soulbound DID NFT to the user's Hedera account |
| Trigger | KYC/KYB approved (FR-ID-003 or FR-ID-004) |
| Process | 1. Construct NFT metadata JSON (see Data Model DM-ID-001). 2. Upload metadata JSON to IPFS via Pinata → receive CID. 3. Upload profile image to IPFS (if provided) → receive image CID. 4. Mint NFT to user's Hedera account via HTS TokenMint. 5. Freeze the token on user's account (soulbound enforcement). 6. Record KYC attestation on platform attestation HCS topic. 7. Update user status to: active. 8. Create user's public feed HCS topic (FR-SOCIAL-001). 9. Create user's notification HCS topic (FR-NOTIF-001). |
| Output | User has soulbound DID NFT, is fully onboarded |
| Hedera Transactions | 1x HTS TokenMint (~$0.05), 1x HTS TokenFreeze (~$0.001), 1x HCS SubmitMessage for KYC attestation ($0.0008), 1x HCS CreateTopic for public feed ($0.01), 1x HCS CreateTopic for notifications ($0.01) |
| Total Hedera Cost | ~$0.07 per user onboarding |

### FR-ID-006: Profile View
| Field | Detail |
|-------|--------|
| Description | View any user's public profile |
| Input | Hedera Account ID |
| Process | 1. Query platform PostgreSQL index for cached profile data. 2. If cache miss: query Mirror Node for account info + DID NFT metadata. 3. Resolve NFT metadata CID from IPFS. 4. Construct profile view: display name, avatar, bio, account type, KYC status, creation date, on-chain activity summary (message count, payment count, follower count). |
| Output | Profile data object |
| Hedera Transactions | None (read from Mirror Node / cache) |

### FR-ID-007: Profile Update
| Field | Detail |
|-------|--------|
| Description | User updates their profile information |
| Input | Updated fields: display name, bio, avatar, location (individual) or company info (business) |
| Process | 1. Validate input fields. 2. If avatar changed: upload new image to IPFS. 3. Construct updated NFT metadata JSON. 4. Upload updated metadata to IPFS → new CID. 5. Wipe existing DID NFT from user's account. 6. Mint new DID NFT with updated metadata CID. 7. Re-freeze token on account. 8. Update platform DB index. |
| Output | Updated profile |
| Hedera Transactions | 1x HTS TokenWipe (~$0.001), 1x HTS TokenMint (~$0.05), 1x HTS TokenFreeze (~$0.001) |
| Note | Profile updates are infrequent; cost is acceptable |

### FR-ID-008: Create Organization (Auto on KYB Approval)
| Field | Detail |
|-------|--------|
| Description | System auto-creates an organization when a business account completes KYB verification |
| Trigger | KYB approved (FR-ID-004) |
| Process | 1. Create organization record in platform DB linked to the KYB-verified user. 2. Set user as org Owner role. 3. Migrate business profile data (company name, category, website, hours) to organization record. 4. Assign existing broadcast_topic to the organization. 5. Record org creation on social graph HCS topic. |
| Output | Organization with owner, ready for team invitations |
| Hedera Transactions | 1x HCS SubmitMessage on social graph topic ($0.0008) |

### FR-ID-009: Invite Team Member
| Field | Detail |
|-------|--------|
| Description | Org Owner or Admin invites a team member by email |
| Pre-condition | Caller has Owner or Admin role in the organization |
| Input | Email address, role (admin | member | viewer) |
| Process | 1. Validate caller has invite permission (Owner or Admin). 2. Generate invitation token (128-bit, URL-safe). 3. Create invitation record (pending, expires in 7 days). 4. Send invitation notification (in-app + email in production). 5. When recipient accepts: link their user account to org with assigned role. 6. Record role grant on social graph HCS topic. |
| Output | Invitation sent, pending acceptance |
| Hedera Transactions | 1x HCS SubmitMessage on acceptance ($0.0008) |

### FR-ID-010: Manage Organization Roles (RBAC)
| Field | Detail |
|-------|--------|
| Description | Owner manages member roles within the organization |
| Pre-condition | Caller is org Owner |
| Input | Target member user ID, new role |
| Process | 1. Validate caller is Owner. 2. Validate target is a member of the org. 3. Update role in organization_members table. 4. Record role change on social graph HCS topic (immutable audit). 5. Notify affected user. |
| Output | Role updated |
| Hedera Transactions | 1x HCS SubmitMessage ($0.0008) |
| RBAC Matrix | Owner: all permissions. Admin: invite/remove members, message as org, send payments, post broadcasts, update profile. Member: message as org, create payment requests. Viewer: read-only access to org conversations and transaction history. |

---

## 2.2 Module: Messaging

### FR-MSG-001: Create 1:1 Conversation
| Field | Detail |
|-------|--------|
| Description | User starts a private conversation with another user |
| Input | Recipient's Hedera Account ID |
| Process | 1. Check if conversation already exists between these two users (query platform DB). 2. If exists: return existing conversation. 3. If new: a. Generate AES-256-GCM symmetric key (Ks). b. Query platform DB for both users' X25519 encryption public keys (`users.encryption_public_key`). c. Encrypt Ks with sender's X25519 public key → EncKey_A (via nacl.box). d. Encrypt Ks with recipient's X25519 public key → EncKey_B (via nacl.box). e. Create private HCS topic with submitKey = platform operator key (access control enforced at application layer via JWT + DB permissions). f. Submit key exchange message as first message on topic (see DM-MSG-002). g. Discard Ks from server memory. h. Store topic-to-conversation mapping in platform DB. |
| Output | Conversation object with topicId |
| Hedera Transactions | 1x HCS CreateTopic ($0.01), 1x HCS SubmitMessage ($0.0008) |

### FR-MSG-002: Create Group Conversation
| Field | Detail |
|-------|--------|
| Description | User creates a group conversation with multiple participants |
| Input | Group name, list of participant Hedera Account IDs (2-256 for individual, 2-1024 for business) |
| Process | 1. Validate participant count against account type limits. 2. Generate AES-256-GCM symmetric key (Ks). 3. For each participant: query platform DB for their X25519 encryption public key (`users.encryption_public_key`), encrypt Ks with their key (via nacl.box). 4. Create private HCS topic with submitKey = platform operator key (access control enforced at application layer via JWT + DB permissions). 5. Submit key exchange message with all encrypted key bundles. 6. Submit group metadata message (name, creator, participant list). 7. Discard Ks from server memory. 8. Store in platform DB. |
| Output | Group conversation object with topicId |
| Hedera Transactions | 1x HCS CreateTopic ($0.01), 2x HCS SubmitMessage ($0.0016) |

### FR-MSG-003: Send Text Message
| Field | Detail |
|-------|--------|
| Description | User sends a text message in a conversation |
| Input | topicId, message text (max 800 bytes after encryption overhead) |
| Process | 1. Client retrieves cached symmetric key (Ks) for this topic. 2. Client generates random 96-bit nonce. 3. Client constructs message payload (see DM-MSG-001). 4. Client encrypts payload with AES-256-GCM(Ks, nonce). 5. Client sends encrypted payload to platform API. 6. Platform submits encrypted payload as HCS message to topicId. 7. Mirror Node subscription detects new message. 8. Platform forwards encrypted message to all connected participants via WebSocket. 9. Each participant's client decrypts message locally using Ks. |
| Output | Message delivered to all participants |
| Hedera Transactions | 1x HCS SubmitMessage ($0.0008) |
| Latency Target | < 3 seconds from send to display on recipient |

### FR-MSG-004: Send Media Message
| Field | Detail |
|-------|--------|
| Description | User sends an image, video, voice note, or file in a conversation |
| Input | topicId, media file, optional caption text |
| Process | 1. Client encrypts media file locally with conversation Ks. 2. Client uploads encrypted media to IPFS via platform API → receive CID. 3. Client constructs message payload with mediaRef = ipfs://CID, mediaMeta (filename, mimeType, size, dimensions). 4. Encrypt message payload with AES-256-GCM. 5. Submit encrypted payload as HCS message. 6. Recipient receives HCS message, decrypts payload, downloads encrypted media from IPFS, decrypts media with Ks. |
| Output | Media message delivered |
| Hedera Transactions | 1x HCS SubmitMessage ($0.0008) |
| Supported Formats | Images: JPEG, PNG, GIF, WebP (max 16MB). Video: MP4, MOV (max 64MB). Voice: OGG, M4A (max 16MB). Files: PDF, DOCX, XLSX, ZIP (max 100MB). |

### FR-MSG-005: Reply to Message
| Field | Detail |
|-------|--------|
| Description | User replies to a specific message in a conversation |
| Input | topicId, message text/media, replyToSequenceNumber |
| Process | Same as FR-MSG-003/004, but message payload includes "replyTo" field with the HCS sequence number of the referenced message |
| Output | Reply message with reference to original |
| Hedera Transactions | 1x HCS SubmitMessage ($0.0008) |

### FR-MSG-006: Message History / Scroll-back
| Field | Detail |
|-------|--------|
| Description | User loads historical messages for a conversation |
| Input | topicId, pagination cursor (last sequence number), limit (default 50) |
| Process | 1. Query platform PostgreSQL index for cached messages. 2. If cache miss or incomplete: query Mirror Node REST API for topic messages. 3. Return encrypted messages to client. 4. Client decrypts each message locally using Ks. |
| Output | Paginated list of decrypted messages |
| Hedera Transactions | None (read from Mirror Node / cache) |

### FR-MSG-007: Add Member to Group
| Field | Detail |
|-------|--------|
| Description | Group admin adds a new member to a group conversation |
| Input | topicId, new member's Hedera Account ID |
| Pre-condition | Requester is group admin |
| Process | 1. Generate new AES-256-GCM key (key rotation required — new member should not read old messages by default). 2. Encrypt new key for ALL current members + new member (using each member's X25519 public key from platform DB). 3. Submit key rotation message to HCS topic. 4. Submit system message: "[Admin] added [NewMember] to the group". 5. Update platform DB (add member to conversation_members). |
| Output | Member added, key rotated |
| Hedera Transactions | 2x HCS SubmitMessage ($0.0016) |
| Note | No TopicUpdate needed — submitKey is the platform operator key. Access control (who can send messages) is enforced at the application layer via JWT + DB permissions. |

### FR-MSG-008: Remove Member from Group
| Field | Detail |
|-------|--------|
| Description | Group admin removes a member from a group conversation |
| Input | topicId, member's Hedera Account ID to remove |
| Pre-condition | Requester is group admin |
| Process | 1. Generate new AES-256-GCM key (key rotation — removed member must not read future messages). 2. Encrypt new key for ALL remaining members (excluding removed member), using each member's X25519 public key from platform DB. 3. Submit key rotation message to HCS topic. 4. Submit system message: "[Admin] removed [Member] from the group". 5. Update platform DB (set left_at on conversation_members, revoke access at application layer). |
| Output | Member removed, key rotated |
| Hedera Transactions | 2x HCS SubmitMessage ($0.0016) |
| Note | No TopicUpdate needed — submitKey is the platform operator key. The removed member's access is revoked at the application layer (JWT + DB). Even if they could submit to the topic, they cannot decrypt future messages (key rotation). |

### FR-MSG-009: Typing Indicator
| Field | Detail |
|-------|--------|
| Description | Show when a user is typing in a conversation |
| Input | topicId |
| Process | 1. Client sends typing event via WebSocket (NOT via HCS — too expensive). 2. Platform broadcasts typing indicator to other connected participants via WebSocket. 3. Typing indicator auto-expires after 5 seconds without update. |
| Output | Real-time typing indicator |
| Hedera Transactions | None (WebSocket only — not on-chain) |

### FR-MSG-010: Read Receipts
| Field | Detail |
|-------|--------|
| Description | Track which messages a user has read |
| Input | topicId, lastReadSequenceNumber |
| Process | 1. Client sends read receipt via WebSocket. 2. Platform stores in Redis (hot data) and PostgreSQL (persistence). 3. Platform broadcasts to other participants via WebSocket. 4. NOT stored on HCS (too expensive for frequent updates). |
| Output | Read status per participant |
| Hedera Transactions | None (off-chain for cost reasons) |
| Note | Read receipt data is the one piece of state that is NOT on-chain. This is a deliberate cost/value tradeoff. Can be moved on-chain in future if costs decrease. |

### FR-MSG-011: Message Search (Client-Side Only)
| Field | Detail |
|-------|--------|
| Description | Search messages within a conversation — client-side only (true E2E) |
| Input | Search query, optional conversation filter |
| Process | 1. Client decrypts cached messages locally. 2. Client performs in-memory text search over decrypted plaintext. 3. Return matching messages with context. |
| Output | Search results with message previews (rendered client-side) |
| Hedera Transactions | None |
| Note | **Decision (A2): True E2E encryption — the server NEVER has access to message plaintext.** Search is client-side only, operating on messages the client has already decrypted and cached. This limits search to messages loaded on the current device but preserves the privacy guarantee that is core to a blockchain social platform. Server-side search applies only to public content (posts, profiles) via PostgreSQL full-text search. |

---

## 2.3 Module: Social Feed

### FR-SOCIAL-001: Create Public Feed Topic
| Field | Detail |
|-------|--------|
| Description | System creates a public HCS topic for the user's posts (during onboarding) |
| Trigger | Successful DID NFT minting (FR-ID-005) |
| Process | 1. Create public HCS topic with submitKey = user's account key (only they can post). 2. No admin key (topic is permanent). 3. Store topicId in user profile. |
| Output | User has a public feed topic |
| Hedera Transactions | 1x HCS CreateTopic ($0.01) — included in onboarding cost |

### FR-SOCIAL-002: Create Post
| Field | Detail |
|-------|--------|
| Description | User creates a public post on their feed |
| Input | Post content (text, optional media references) |
| Process | 1. If media attached: upload to IPFS → get CIDs. 2. Construct post message payload (see DM-SOCIAL-001). 3. Submit as HCS message to user's public feed topic (plaintext — public). 4. Index in PostgreSQL (full-text search for public content). 5. Distribute to followers' feeds (platform-level fan-out). |
| Output | Post visible on user's profile and followers' feeds |
| Hedera Transactions | 1x HCS SubmitMessage ($0.0008) |

### FR-SOCIAL-003: Follow User
| Field | Detail |
|-------|--------|
| Description | User follows another user to see their posts |
| Input | Target user's Hedera Account ID |
| Process | 1. Submit follow event to platform social graph HCS topic (see DM-SOCIAL-002). 2. Update platform PostgreSQL index (follower/following counts). 3. Send notification to target user (FR-NOTIF-002). |
| Output | Follower relationship recorded on-chain |
| Hedera Transactions | 1x HCS SubmitMessage ($0.0008) |

### FR-SOCIAL-004: Unfollow User
| Field | Detail |
|-------|--------|
| Description | User unfollows another user |
| Input | Target user's Hedera Account ID |
| Process | 1. Submit unfollow event to platform social graph HCS topic. 2. Update platform PostgreSQL index. |
| Output | Follow relationship removed |
| Hedera Transactions | 1x HCS SubmitMessage ($0.0008) |

### FR-SOCIAL-005: View Home Feed
| Field | Detail |
|-------|--------|
| Description | User views aggregated feed of posts from followed accounts |
| Input | Pagination cursor, limit (default 20) |
| Process | 1. Query PostgreSQL for user's following list. 2. Query indexed posts from followed accounts, sorted by consensus timestamp descending. 3. Return paginated feed. |
| Output | Paginated list of posts |
| Hedera Transactions | None (read from cache/index) |

### FR-SOCIAL-006: View User Profile Feed
| Field | Detail |
|-------|--------|
| Description | View all posts from a specific user |
| Input | Target user's Hedera Account ID, pagination |
| Process | 1. Query Mirror Node / PostgreSQL index for messages on target user's public feed topic. 2. Return paginated posts. |
| Output | Paginated list of user's posts |
| Hedera Transactions | None |

### FR-SOCIAL-007: Business Broadcast
| Field | Detail |
|-------|--------|
| Description | Business account sends a broadcast to subscribers |
| Pre-condition | Business account type |
| Input | Broadcast content (text, optional media, optional payment request) |
| Process | 1. If media: upload to IPFS. 2. Submit as HCS message to business broadcast topic. 3. Index and distribute to subscribers. |
| Output | Broadcast visible to all subscribers |
| Hedera Transactions | 1x HCS SubmitMessage ($0.0008) |

---

## 2.4 Module: In-Chat Payments

### FR-PAY-001: Send Money
| Field | Detail |
|-------|--------|
| Description | User sends money to another user within a conversation |
| Input | topicId, recipient Account ID, amount, currency, optional note |
| Process | 1. Validate sender has sufficient token balance (query Mirror Node). 2. Build `CryptoTransferTransaction` (sender → recipient for HTS token). 3. Sign transaction via Tamam MPC Custody (sender's vault). 4. Submit signed transaction to Hedera. 5. On confirmation: construct payment receipt message (see DM-PAY-001). 6. Encrypt and submit payment receipt as HCS message to conversation topic. 7. Send notification to recipient (FR-NOTIF-002). |
| Output | Payment confirmed, receipt visible in chat for both parties |
| Hedera Transactions | 1x HTS CryptoTransfer (~$0.001, signed via MPC Custody), 1x HCS SubmitMessage ($0.0008) |
| Error Handling | If MPC signing fails: retry, return error to sender. If Hedera transfer fails: do NOT submit HCS receipt, return error. If HCS receipt submission fails: payment is still valid (on-chain via HTS), retry receipt submission. |

### FR-PAY-002: Request Money
| Field | Detail |
|-------|--------|
| Description | User (individual or business) sends a structured payment request within a conversation |
| Input | topicId, amount, currency, description/note, expiresAt (optional, default 7 days) |
| Process | 1. Generate unique requestId (UUID). 2. Construct payment request message (see DM-PAY-002) with status "pending". 3. Encrypt and submit as HCS message to conversation topic. 4. Store request in `payment_requests` table with expiry timestamp. 5. Recipient sees payment request card: amount, description, "Pay" button, expiry countdown. 6. When recipient taps "Pay": execute FR-PAY-001 flow with pre-filled amount + requestId linkage. 7. On payment confirmation: submit HCS status update message (see DM-PAY-004) with status "paid" + paidTxId. 8. Update `payment_requests` table status. 9. Record in `transactions` table for both parties. |
| Output | Payment request card visible in chat, actionable by recipient, with real-time status tracking |
| Hedera Transactions | 1x HCS SubmitMessage for request ($0.0008). When paid: 1x HTS CryptoTransfer + 1x HCS SubmitMessage for status update. |
| Status Lifecycle | `pending` → `paid` (recipient pays) / `expired` (past expiresAt) / `declined` (recipient declines) |
| Org Context | If sent from org context: request shows org name + badge, uses org's Hedera account, recorded in org transaction history |

### FR-PAY-003: Split Payment
| Field | Detail |
|-------|--------|
| Description | User creates a split payment request in a group conversation |
| Input | topicId, total amount, currency, note, split method (equal / custom amounts per participant) |
| Pre-condition | Group conversation with 2+ participants |
| Process | 1. Calculate per-participant amounts (equal split or custom). 2. Construct split payment message (see DM-PAY-003). 3. Encrypt and submit as HCS message. 4. Each participant sees their share with "Pay" button. 5. When participant pays: execute FR-PAY-001 to initiator. 6. Submit HCS update message for each payment received. 7. When all paid: submit completion message. |
| Output | Split request visible in group, each participant can pay independently |
| Hedera Transactions | 1x HCS SubmitMessage for split request. Per payment: 1x HTS CryptoTransfer + 1x HCS SubmitMessage. For 4-way split: up to 9 total Hedera transactions. |

### FR-PAY-004: Transaction History & Tracking
| Field | Detail |
|-------|--------|
| Description | User views comprehensive transaction history (personal or org-level) |
| Input | Pagination, filters: date range, direction (sent/received/all), status (completed/pending/failed), counterparty search |
| Process | 1. Determine context: personal or org (from JWT/header). 2. Query `transactions` table with filters. 3. For org context: aggregate across all org members who transacted as the org. 4. Enrich with counterparty profile data (name, avatar). 5. Include conversation link and HCS proof reference for each transaction. 6. Return paginated history sorted by created_at DESC. |
| Output | Paginated list of transactions with full metadata, on-chain proof links |
| Hedera Transactions | None (reads from platform DB + Mirror Node for verification) |
| Transaction Detail | Each entry shows: date, counterparty (name + avatar), amount, currency, direction (sent/received), status, conversation link, HCS message link (on-chain proof), Tamam Custody reference |
| Org View | Aggregated across all org members who sent/received payments as the org, filterable by member |

---

## 2.5 Module: Notifications

### FR-NOTIF-001: Create Notification Topic
| Field | Detail |
|-------|--------|
| Description | System creates a per-user private HCS topic for notifications |
| Trigger | User onboarding (FR-ID-005) |
| Process | 1. Create private HCS topic with submitKey = platform key only. 2. Store topicId in user profile. |
| Output | User has notification topic |
| Hedera Transactions | 1x HCS CreateTopic ($0.01) — included in onboarding |

### FR-NOTIF-002: Send Notification
| Field | Detail |
|-------|--------|
| Description | System sends a notification to a user |
| Trigger | Various events (new message, payment received, new follower, etc.) |
| Process | 1. Construct notification payload (see DM-NOTIF-001). 2. Submit to user's notification HCS topic. 3. Forward via WebSocket if user is connected. 4. If user has push notifications enabled: send via FCM/APNs. |
| Output | Notification delivered |
| Hedera Transactions | 1x HCS SubmitMessage ($0.0008) |

### FR-NOTIF-003: Notification History
| Field | Detail |
|-------|--------|
| Description | User views their notification history |
| Input | Pagination |
| Process | 1. Query platform DB / Mirror Node for user's notification topic messages. 2. Return paginated notifications. |
| Output | List of notifications |
| Hedera Transactions | None |

---

## 2.6 Module: Document Sharing

### FR-DOC-001: Share Document in Conversation
| Field | Detail |
|-------|--------|
| Description | User shares a document (PDF, DOCX, etc.) in a conversation |
| Input | topicId, document file |
| Process | Same as FR-MSG-004 (media message) with file type |
| Output | Document shared as encrypted file on IPFS, referenced in HCS |
| Hedera Transactions | 1x HCS SubmitMessage ($0.0008) |

---

## 2.6 Module: Business & Organization

### FR-BIZ-001: Verified Business Badge
| Field | Detail |
|-------|--------|
| Description | Display trust badge on business profiles based on KYB verification status |
| Trigger | KYB status changes (submitted, approved, certified) |
| Process | 1. Badge tier derived from server-side KYB status (non-fakeable, not client-set). 2. Three tiers: Basic (gray) = KYB submitted/pending, Verified (blue) = KYB approved by Mirsad AI, Certified (gold) = enhanced KYB with additional documentation (future). 3. Badge displayed on: business profile page, chat conversation header, search results, broadcast channel listings. 4. Badge links to on-chain verification proof (KYB attestation on HCS KYC Attestations topic). |
| Output | Visual badge rendered on all business-facing surfaces |
| Hedera Transactions | None (reads from existing KYB attestation on HCS) |

### FR-BIZ-002: Organization Profile Management
| Field | Detail |
|-------|--------|
| Description | Owner or Admin updates the organization's profile |
| Pre-condition | Caller has Owner or Admin role |
| Input | Company name, logo, bio, category, website, business hours |
| Process | 1. Validate caller role (Owner or Admin). 2. If logo changed: upload to IPFS → get CID. 3. Update organization record in platform DB. 4. Update DID NFT metadata to reflect org changes (wipe + re-mint with updated businessProperties). |
| Output | Updated org profile visible to all users |
| Hedera Transactions | If DID NFT update needed: 1x HTS TokenWipe + 1x HTS TokenMint (~$0.052) |

### FR-BIZ-003: Context Switching (Personal ↔ Organization)
| Field | Detail |
|-------|--------|
| Description | Team member switches between personal and organization context |
| Input | Context selection (personal / org ID) |
| Process | 1. Client sends org context via `X-Org-Context` header or selects in UI. 2. Server validates user is a member of the specified org. 3. All subsequent actions (messaging, payments, broadcasts) use org identity: org name, org logo, org Hedera account. 4. Conversations initiated in org context show org name + badge, not individual name. |
| Output | Actions attributed to organization, not individual |
| Hedera Transactions | None (context switch is application-layer) |

### FR-BIZ-004: Org-Scoped Messaging
| Field | Detail |
|-------|--------|
| Description | Team member sends messages as the organization |
| Pre-condition | Caller has Owner, Admin, or Member role (Viewers cannot send) |
| Input | Standard message input + org context |
| Process | 1. Validate caller role allows messaging (Owner/Admin/Member). 2. Message sent to HCS topic as normal. 3. Message metadata includes org context flag. 4. Recipients see message from org name + logo (not individual team member). 5. All online org members with appropriate role see the conversation in their org inbox. |
| Output | Message appears from org identity in conversation |
| Hedera Transactions | 1x HCS SubmitMessage ($0.0008) |

---

# 3. User Stories & Acceptance Criteria

## 3.1 Epic: User Onboarding

### US-001: New User Registration
**As a** new user
**I want to** register with my phone number or email
**So that** I can start using the platform

**Acceptance Criteria:**
- [ ] User can enter phone number OR email on registration screen
- [ ] OTP is sent within 10 seconds
- [ ] OTP verification succeeds with correct code
- [ ] OTP expires after 5 minutes
- [ ] User can request new OTP after 60 seconds
- [ ] After OTP verification, user sees account type selection (Individual / Business)
- [ ] Error messages are clear and actionable

### US-002: Wallet Creation
**As a** registered user
**I want to** have a Hedera wallet created automatically
**So that** I have an on-chain identity without understanding blockchain

**Acceptance Criteria:**
- [ ] Wallet creation happens automatically after OTP verification
- [ ] User does NOT need to understand keypairs, seeds, or blockchain concepts
- [ ] Hedera Account ID is assigned and visible in profile
- [ ] FROST key shares are distributed via Tamam MPC Custody (9 nodes)
- [ ] Wallet creation completes within 15 seconds
- [ ] User sees a progress indicator during wallet creation

### US-003: KYC Verification
**As a** user with a wallet
**I want to** verify my identity
**So that** I can get my DID NFT and access all platform features

**Acceptance Criteria:**
- [ ] User can upload government-issued ID document
- [ ] User can take a selfie for liveness check
- [ ] Mirsad AI processes KYC within stated SLA
- [ ] User receives notification when KYC is approved/rejected
- [ ] On approval: DID NFT is minted to user's account within 30 seconds
- [ ] User sees their verified status on their profile
- [ ] DID NFT is visible on HashScan (Hedera block explorer)

### US-004: Profile Setup
**As a** verified user
**I want to** set up my profile
**So that** other users can find and identify me

**Acceptance Criteria:**
- [ ] User can set display name, bio, avatar, location
- [ ] Business users can set company name, category, website, hours
- [ ] Profile image is uploaded to IPFS
- [ ] Profile updates reflect on-chain (DID NFT metadata update)
- [ ] Other users can view my profile by my Account ID

---

## 3.2 Epic: Messaging

### US-005: Start 1:1 Conversation
**As a** verified user
**I want to** start a private conversation with another user
**So that** we can communicate securely

**Acceptance Criteria:**
- [ ] User can search for other users by name or Account ID
- [ ] Tapping "Message" creates a new conversation (or opens existing one)
- [ ] First message appears within 3 seconds of sending
- [ ] Messages are encrypted — platform cannot read them
- [ ] Conversation has a unique HCS Topic ID
- [ ] Both users see the same message history

### US-006: Send Messages
**As a** user in a conversation
**I want to** send text, images, files, and voice messages
**So that** I can communicate naturally

**Acceptance Criteria:**
- [ ] Text messages send and display within 3 seconds
- [ ] Images display inline with thumbnail preview
- [ ] Files show filename, size, and download button
- [ ] Voice messages show playback controls with duration
- [ ] Messages show sender avatar, timestamp, and delivery status
- [ ] Messages are ordered by HCS consensus timestamp

### US-007: Create Group Chat
**As a** verified user
**I want to** create a group conversation
**So that** I can communicate with multiple people at once

**Acceptance Criteria:**
- [ ] User can create group with 2-256 members (individual) or 2-1024 (business)
- [ ] User can set group name and avatar
- [ ] All members receive notification of group creation
- [ ] Messages from all members are visible to all other members
- [ ] Group admin can add/remove members
- [ ] When a member is removed, they cannot read future messages (key rotation)

### US-008: Typing Indicators and Read Receipts
**As a** user in a conversation
**I want to** see when others are typing and have read my messages
**So that** I know the conversation is active

**Acceptance Criteria:**
- [ ] Typing indicator appears within 1 second of the other user typing
- [ ] Typing indicator disappears after 5 seconds of inactivity
- [ ] Read receipts show when message has been seen
- [ ] Read receipts update in real-time via WebSocket

---

## 3.3 Epic: Social Feed

### US-009: Create Post
**As a** verified user
**I want to** create a public post
**So that** my followers can see my updates

**Acceptance Criteria:**
- [ ] User can write text posts (up to 800 chars)
- [ ] User can attach images (up to 4)
- [ ] Post appears on user's profile feed immediately
- [ ] Post appears in followers' home feed within 5 seconds
- [ ] Post has verifiable HCS transaction ID
- [ ] Post timestamp is from Hedera consensus (not client clock)

### US-010: Follow/Unfollow Users
**As a** user
**I want to** follow other users
**So that** I see their posts in my feed

**Acceptance Criteria:**
- [ ] User can follow/unfollow from profile page
- [ ] Follow action is recorded on-chain (HCS social graph topic)
- [ ] Follower count updates in real-time
- [ ] Home feed reflects follow/unfollow changes immediately
- [ ] Target user receives follow notification

### US-011: View Home Feed
**As a** user
**I want to** see a feed of posts from people I follow
**So that** I can stay updated on their activity

**Acceptance Criteria:**
- [ ] Feed shows posts sorted by consensus timestamp (newest first)
- [ ] Feed loads within 2 seconds
- [ ] Infinite scroll with pagination
- [ ] Pull-to-refresh loads new posts
- [ ] Empty state shown if user follows nobody

---

## 3.4 Epic: In-Chat Payments

### US-012: Send Money in Chat
**As a** user in a conversation
**I want to** send money to the other person directly in the chat
**So that** I don't need to leave the app to make a payment

**Acceptance Criteria:**
- [ ] Payment button is accessible from chat input bar (like attaching media)
- [ ] User enters amount, currency, optional note
- [ ] Confirmation screen shows amount, recipient, and estimated fees
- [ ] After confirmation: payment executes via MPC Custody-signed HTS transfer
- [ ] Payment receipt appears as a special message in the conversation
- [ ] Receipt shows amount, currency, status (confirmed), and HTS transaction ID
- [ ] Recipient can tap receipt to view transaction on HashScan
- [ ] Both users see the same receipt message

### US-013: Request Money in Chat
**As a** user in a conversation
**I want to** request money from the other person
**So that** they can pay me easily

**Acceptance Criteria:**
- [ ] Request button accessible from chat input bar
- [ ] User enters amount, currency, note (reason)
- [ ] Request appears as structured message with "Pay" button
- [ ] Recipient taps "Pay" → pre-filled payment flow
- [ ] After payment: request message updates to show "Paid" status
- [ ] Both users see the status update

### US-014: Split Payment in Group
**As a** user in a group chat
**I want to** split a bill among group members
**So that** everyone can pay their share conveniently

**Acceptance Criteria:**
- [ ] Split option available in group chat input bar
- [ ] User enters total amount, selects split method (equal / custom)
- [ ] Split request shows each participant's share with "Pay" button
- [ ] As each person pays, the group sees real-time updates
- [ ] Completion message when all participants have paid
- [ ] Participants who haven't paid see a reminder

---

## 3.5 Epic: Business Features

### US-015: Business Broadcast
**As a** business account holder
**I want to** send broadcast messages to subscribers
**So that** I can communicate updates to my audience

**Acceptance Criteria:**
- [ ] Business has a dedicated broadcast channel (public HCS topic)
- [ ] Any user can subscribe to a business's broadcast
- [ ] Business can post text, images, and announcements
- [ ] Subscribers see broadcasts in a dedicated "Channels" tab
- [ ] Broadcasts are public and visible to anyone (no encryption)

---

## 3.6 Epic: Organization & Business

### US-016: Create Organization
**As a** business owner who completed KYB verification
**I want to** have an organization automatically created for my business
**So that** my company has a structured team presence on the platform

**Acceptance Criteria:**
- [ ] Organization is auto-created when KYB is approved
- [ ] Owner role is automatically assigned to the KYB-verified user
- [ ] Business profile data (company name, category, website, hours) migrates to org record
- [ ] Existing broadcast topic is transferred to the organization
- [ ] Org creation is recorded on social graph HCS topic
- [ ] Org profile is visible on the business profile page

### US-017: Invite Team Members
**As an** organization owner or admin
**I want to** invite team members by email
**So that** they can act on behalf of my business

**Acceptance Criteria:**
- [ ] Owner or Admin can invite by entering an email and selecting a role (Admin/Member/Viewer)
- [ ] Invitation generates a unique 128-bit token with 7-day expiry
- [ ] Recipient receives in-app notification (and email in production)
- [ ] Recipient can accept the invitation and link their account to the org
- [ ] Role grant is recorded immutably on social graph HCS topic
- [ ] Org members list shows all members with their roles
- [ ] Maximum 50 members per organization

### US-018: Switch Context (Personal ↔ Organization)
**As a** team member belonging to an organization
**I want to** switch between my personal context and my org context
**So that** I can keep personal and business activity separate

**Acceptance Criteria:**
- [ ] Context switcher is accessible from the main navigation
- [ ] Switching to org context changes the active profile (name, avatar, wallet)
- [ ] Messages sent in org context show org name + logo, not my personal name
- [ ] Payments sent in org context use the org's Hedera account (owner's wallet)
- [ ] Switching back to personal context restores individual identity

### US-019: Verified Business Badge
**As a** customer interacting with a business
**I want to** see a verified badge on their profile
**So that** I know I'm dealing with a legitimate company

**Acceptance Criteria:**
- [ ] Gray badge appears for businesses with KYB submitted/pending
- [ ] Blue badge appears for businesses with KYB approved (verified)
- [ ] Badge is displayed on: profile page, chat header, search results, broadcast listings
- [ ] Badge links to on-chain verification proof (HCS attestation)
- [ ] Badge cannot be faked — derived from server-side KYB status only
- [ ] Tooltip shows "Verified by Mirsad AI on [date]"

### US-020: Send Payment Request
**As a** business or individual user
**I want to** send a structured payment request in chat
**So that** the recipient can review the amount and pay with one tap

**Acceptance Criteria:**
- [ ] Payment request appears as a card in chat: amount, description, "Pay" button, expiry countdown
- [ ] Tapping "Pay" triggers the standard payment flow (FR-PAY-001) with pre-filled amount
- [ ] After payment: request card updates to "Paid" with transaction ID and timestamp
- [ ] Expired requests show "Expired" status and cannot be paid
- [ ] Declined requests show "Declined" status
- [ ] Status updates are recorded on HCS (same conversation topic)
- [ ] Default expiry is 7 days, configurable by sender

### US-021: View Transaction History
**As a** user (individual or business)
**I want to** see a chronological list of all my payments
**So that** I can track my financial activity

**Acceptance Criteria:**
- [ ] Transaction history page accessible from main navigation
- [ ] Each transaction shows: date, counterparty, amount, direction, status, conversation link
- [ ] Filters available: date range, direction (sent/received), status
- [ ] Search by counterparty name or transaction ID
- [ ] Transaction detail view shows full metadata + on-chain proof link
- [ ] Loads within 2 seconds, supports infinite scroll

### US-022: View Org Transaction History
**As a** business owner or admin
**I want to** see organization-level transaction history
**So that** I can reconcile payments and understand cash flow

**Acceptance Criteria:**
- [ ] Org transaction view aggregates payments from all org members acting as the org
- [ ] Filterable by member who initiated the transaction
- [ ] Same filters as personal view: date range, direction, status
- [ ] Accessible when in org context

### US-023: Manage Organization Roles
**As an** organization owner
**I want to** change team member roles
**So that** I can control who can do what on behalf of my business

**Acceptance Criteria:**
- [ ] Owner can promote members to Admin or demote Admins to Member/Viewer
- [ ] Owner can transfer ownership to another member
- [ ] Role changes take effect immediately
- [ ] Role changes are recorded immutably on social graph HCS topic
- [ ] Affected member receives notification of role change
- [ ] Permission matrix enforced: Viewers read-only, Members can message + create requests, Admins can invite + pay + broadcast, Owner has full control

---

# 4. Data Models

## 4.1 Hedera On-Chain Data Models

### DM-ID-001: DID NFT Metadata (IPFS JSON)
```json
{
  "name": "DID:hedera:mainnet:{accountId}",
  "description": "Decentralized Identity Credential",
  "image": "ipfs://{profile_image_cid}",
  "type": "image/png",
  "format": "HIP412@2.0.0",
  "properties": {
    "accountType": "individual | business",
    "kycLevel": "basic | enhanced | institutional",
    "kycProvider": "mirsad-ai",
    "kycTimestamp": "ISO8601",
    "kycHash": "sha256 of KYC attestation",
    "displayName": "string (max 64 chars)",
    "bio": "string (max 256 chars)",
    "location": "string (max 128 chars, optional)",
    "createdAt": "ISO8601",
    "version": "1.0.0"
  },
  "businessProperties": {
    "companyName": "string (optional, max 128 chars)",
    "registrationNumber": "string (optional)",
    "businessCategory": "string (optional)",
    "kybLevel": "basic | verified | certified",
    "website": "URL (optional)"
  }
}
```

### DM-MSG-001: Chat Message (HCS Payload — encrypted)
```json
{
  "v": "1.0",
  "type": "message",
  "sender": "0.0.ACCOUNT_ID",
  "ts": 1710100000000,
  "content": {
    "type": "text | image | file | voice | location | contact",
    "text": "string (max 800 chars for text type)",
    "mediaRef": "ipfs://CID (for media types)",
    "mediaMeta": {
      "filename": "string",
      "mimeType": "string",
      "size": 12345,
      "dimensions": "WxH (for images/video)"
    }
  },
  "replyTo": "sequence_number (optional)",
  "nonce": "base64 encoded 96-bit nonce"
}
```
**Size constraint:** Entire JSON must fit within 1024 bytes after encryption. Text-only messages: ~800 chars available. Media messages: typically ~200-300 bytes (CID + metadata).

### DM-MSG-002: Key Exchange Message (HCS Payload — plaintext wrapper, encrypted keys)
```json
{
  "v": "1.0",
  "type": "key_exchange",
  "keys": {
    "0.0.ACCOUNT_1": "base64(encrypt(Ks, pubKey_1))",
    "0.0.ACCOUNT_2": "base64(encrypt(Ks, pubKey_2))"
  },
  "algorithm": "AES-256-GCM",
  "keyId": "uuid-v4",
  "rotationIndex": 0
}
```

### DM-MSG-003: Group Metadata Message (HCS Payload — encrypted)
```json
{
  "v": "1.0",
  "type": "group_meta",
  "action": "create | update",
  "data": {
    "name": "Group Name",
    "avatar": "ipfs://CID (optional)",
    "admin": "0.0.ADMIN_ACCOUNT",
    "participants": ["0.0.ACC1", "0.0.ACC2", "0.0.ACC3"]
  }
}
```

### DM-MSG-004: System Message (HCS Payload — encrypted)
```json
{
  "v": "1.0",
  "type": "system",
  "sender": "0.0.PLATFORM",
  "action": "member_added | member_removed | key_rotated | group_renamed",
  "data": {
    "actor": "0.0.ADMIN",
    "target": "0.0.AFFECTED_USER",
    "newKeyId": "uuid (for key_rotated)"
  }
}
```

### DM-PAY-001: Payment Receipt (HCS Payload — encrypted, in conversation topic)
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
    "note": "string (max 256 chars)",
    "txHash": "0.0.XXXXX@1710100000.000000000",
    "status": "confirmed | failed",
    "custodyTxId": "tamam-custody-transaction-id"
  }
}
```

### DM-PAY-002: Payment Request (HCS Payload — encrypted)
```json
{
  "v": "1.0",
  "type": "payment_request",
  "sender": "0.0.REQUESTER",
  "content": {
    "action": "request",
    "amount": 50.00,
    "currency": "USD",
    "note": "string",
    "requestId": "uuid-v4",
    "status": "pending | paid | declined",
    "paidTxHash": "null | hedera_tx_id"
  }
}
```

### DM-PAY-003: Split Payment (HCS Payload — encrypted)
```json
{
  "v": "1.0",
  "type": "payment_split",
  "sender": "0.0.INITIATOR",
  "content": {
    "action": "split",
    "totalAmount": 120.00,
    "currency": "USD",
    "note": "string",
    "splitId": "uuid-v4",
    "splitMethod": "equal | custom",
    "participants": {
      "0.0.USER_A": { "amount": 30.00, "status": "pending | paid", "txHash": "null | tx_id" },
      "0.0.USER_B": { "amount": 30.00, "status": "pending | paid", "txHash": "null | tx_id" }
    }
  }
}
```

### DM-SOCIAL-001: Public Post (HCS Payload — plaintext, on user's public feed topic)
```json
{
  "v": "1.0",
  "type": "post",
  "sender": "0.0.AUTHOR",
  "content": {
    "text": "string (max 800 chars)",
    "media": [
      {
        "type": "image | video",
        "ref": "ipfs://CID",
        "mimeType": "image/jpeg",
        "size": 245000,
        "dimensions": "1920x1080",
        "alt": "Alt text description"
      }
    ]
  }
}
```

### DM-SOCIAL-002: Social Graph Event (HCS Payload — plaintext, on platform social graph topic)
```json
{
  "v": "1.0",
  "type": "follow | unfollow | block",
  "actor": "0.0.FOLLOWER",
  "target": "0.0.FOLLOWING"
}
```

### DM-NOTIF-001: Notification (HCS Payload — on user's notification topic)
```json
{
  "v": "1.0",
  "type": "notification",
  "category": "message | payment | social | system",
  "data": {
    "event": "new_message | payment_received | payment_request | new_follower | kyc_approved | group_invite",
    "from": "0.0.SENDER",
    "topicId": "0.0.TOPIC (optional)",
    "preview": "string (max 100 chars, optional)",
    "amount": 50.00,
    "currency": "USD (optional, for payment events)",
    "ts": 1710100000000
  }
}
```

### DM-ORG-001: Organization Role Change (HCS Payload — on social graph topic)
```json
{
  "v": "1.0",
  "type": "org_role_change",
  "orgId": "uuid",
  "targetUser": "0.0.XXXXX",
  "role": "owner | admin | member | viewer",
  "action": "grant | revoke | change",
  "previousRole": "member (for change action)",
  "grantedBy": "0.0.YYYYY",
  "timestamp": "ISO8601"
}
```

### DM-ORG-002: Organization Creation (HCS Payload — on social graph topic)
```json
{
  "v": "1.0",
  "type": "org_created",
  "orgId": "uuid",
  "owner": "0.0.XXXXX",
  "name": "Company Name",
  "kybLevel": "verified",
  "timestamp": "ISO8601"
}
```

### DM-PAY-004: Payment Request Status Update (HCS Payload — encrypted, in conversation topic)
```json
{
  "v": "1.0",
  "type": "payment_request_update",
  "requestId": "uuid",
  "status": "paid | expired | declined",
  "paidTxId": "0.0.XXXXX@1234567890.123 (if paid)",
  "paidAt": "ISO8601 (if paid)",
  "updatedBy": "0.0.XXXXX"
}
```

---

## 4.2 Platform Database Schema (PostgreSQL — Index/Cache)

### Table: users
```sql
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hedera_account_id   VARCHAR(20) UNIQUE NOT NULL,    -- e.g., "0.0.12345"
    account_type        VARCHAR(10) NOT NULL,            -- "individual" | "business"
    email               VARCHAR(255),
    phone               VARCHAR(20),
    display_name        VARCHAR(64),
    bio                 VARCHAR(256),
    avatar_ipfs_cid     VARCHAR(100),
    status              VARCHAR(20) NOT NULL DEFAULT 'pending_wallet',
    -- Status: pending_wallet → pending_kyc → kyc_submitted → active | kyc_rejected
    kyc_level           VARCHAR(20),                     -- "basic" | "enhanced" | "institutional"
    did_nft_serial      BIGINT,                          -- HTS NFT serial number
    did_nft_metadata_cid VARCHAR(100),                   -- IPFS CID of current DID metadata
    public_feed_topic   VARCHAR(20),                     -- HCS Topic ID for public posts
    notification_topic  VARCHAR(20),                     -- HCS Topic ID for notifications
    broadcast_topic     VARCHAR(20),                     -- HCS Topic ID (business only)
    public_key          TEXT,                            -- Hedera account public key (from Tamam MPC Custody)
    encryption_public_key TEXT,                          -- X25519 encryption public key (client-generated)
    custody_vault_id    VARCHAR(100),                    -- Tamam MPC Custody vault identifier
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_hedera_account ON users(hedera_account_id);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_display_name ON users(display_name);
```

### Table: business_profiles
```sql
CREATE TABLE business_profiles (
    user_id             UUID PRIMARY KEY REFERENCES users(id),
    company_name        VARCHAR(128),
    registration_number VARCHAR(64),
    business_category   VARCHAR(64),
    kyb_level           VARCHAR(20),
    website             VARCHAR(255),
    business_hours      JSONB,                           -- { "mon": "9:00-17:00", ... }
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Table: conversations
```sql
CREATE TABLE conversations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hcs_topic_id        VARCHAR(20) UNIQUE NOT NULL,     -- HCS Topic ID
    conversation_type   VARCHAR(10) NOT NULL,             -- "direct" | "group"
    group_name          VARCHAR(128),
    group_avatar_cid    VARCHAR(100),
    admin_account_id    VARCHAR(20),                      -- Group admin (for groups)
    created_by          VARCHAR(20) NOT NULL,             -- Hedera Account ID
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_message_at     TIMESTAMP WITH TIME ZONE,
    last_message_seq    BIGINT DEFAULT 0
);

CREATE INDEX idx_conversations_topic ON conversations(hcs_topic_id);
CREATE INDEX idx_conversations_last_msg ON conversations(last_message_at DESC);
```

### Table: conversation_members
```sql
CREATE TABLE conversation_members (
    conversation_id     UUID REFERENCES conversations(id),
    hedera_account_id   VARCHAR(20) NOT NULL,
    role                VARCHAR(10) DEFAULT 'member',     -- "admin" | "member"
    joined_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    left_at             TIMESTAMP WITH TIME ZONE,         -- NULL if still member
    last_read_seq       BIGINT DEFAULT 0,                 -- Last read message sequence
    PRIMARY KEY (conversation_id, hedera_account_id)
);

CREATE INDEX idx_conv_members_account ON conversation_members(hedera_account_id);
```

### Table: messages_index
```sql
CREATE TABLE messages_index (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hcs_topic_id        VARCHAR(20) NOT NULL,
    sequence_number     BIGINT NOT NULL,
    consensus_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    sender_account_id   VARCHAR(20) NOT NULL,
    message_type        VARCHAR(20) NOT NULL,             -- "message" | "payment" | "payment_request" | "payment_split" | "system"
    encrypted_preview   BYTEA,                            -- Client-encrypted preview (optional, set by sender for push notifications)
    has_media           BOOLEAN DEFAULT FALSE,
    UNIQUE (hcs_topic_id, sequence_number)
);

CREATE INDEX idx_messages_topic_seq ON messages_index(hcs_topic_id, sequence_number DESC);
CREATE INDEX idx_messages_sender ON messages_index(sender_account_id);
CREATE INDEX idx_messages_timestamp ON messages_index(consensus_timestamp DESC);
```

### Table: social_follows
```sql
CREATE TABLE social_follows (
    follower_account_id  VARCHAR(20) NOT NULL,
    following_account_id VARCHAR(20) NOT NULL,
    hcs_sequence_number  BIGINT,                          -- HCS sequence number of follow event
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (follower_account_id, following_account_id)
);

CREATE INDEX idx_follows_following ON social_follows(following_account_id);
```

### Table: posts_index
```sql
CREATE TABLE posts_index (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_account_id   VARCHAR(20) NOT NULL,
    hcs_topic_id        VARCHAR(20) NOT NULL,
    sequence_number     BIGINT NOT NULL,
    consensus_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    content_text        TEXT,
    has_media           BOOLEAN DEFAULT FALSE,
    media_refs          JSONB,                            -- Array of IPFS CIDs
    UNIQUE (hcs_topic_id, sequence_number)
);

CREATE INDEX idx_posts_author ON posts_index(author_account_id, consensus_timestamp DESC);
CREATE INDEX idx_posts_timestamp ON posts_index(consensus_timestamp DESC);
```

### Table: payments_index
```sql
CREATE TABLE payments_index (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_account_id   VARCHAR(20) NOT NULL,
    recipient_account_id VARCHAR(20) NOT NULL,
    amount              DECIMAL(18,8) NOT NULL,
    currency            VARCHAR(10) NOT NULL,
    hts_transaction_id  VARCHAR(50),                      -- Hedera transaction ID
    hcs_topic_id        VARCHAR(20),                      -- Conversation where payment was made
    hcs_sequence_number BIGINT,
    payment_type        VARCHAR(20) NOT NULL,             -- "send" | "request_fulfillment" | "split_payment"
    custody_tx_id       VARCHAR(100),                     -- Tamam MPC Custody transaction ID
    status              VARCHAR(20) NOT NULL,             -- "confirmed" | "failed"
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_payments_sender ON payments_index(sender_account_id, created_at DESC);
CREATE INDEX idx_payments_recipient ON payments_index(recipient_account_id, created_at DESC);
```

### Table: platform_topics
```sql
CREATE TABLE platform_topics (
    topic_name          VARCHAR(50) PRIMARY KEY,          -- "social_graph" | "kyc_attestations" | "platform_announcements"
    hcs_topic_id        VARCHAR(20) UNIQUE NOT NULL,
    last_sequence       BIGINT DEFAULT 0,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Table: organizations
```sql
CREATE TABLE organizations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id       UUID NOT NULL REFERENCES users(id),
    name                VARCHAR(128) NOT NULL,
    hedera_account_id   VARCHAR(20) NOT NULL,             -- same as owner's for now (shared org wallet deferred)
    did_nft_serial      BIGINT,                           -- org DID NFT serial
    broadcast_topic_id  VARCHAR(20),                      -- migrated from business_profiles
    logo_cid            VARCHAR(128),                     -- IPFS CID
    bio                 VARCHAR(256),
    category            VARCHAR(64),
    website             VARCHAR(256),
    business_hours      JSONB,                            -- { "mon": "9:00-17:00", ... }
    kyb_status          VARCHAR(20) NOT NULL,             -- 'pending' | 'verified' | 'certified'
    kyb_verified_at     TIMESTAMP WITH TIME ZONE,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_organizations_owner ON organizations(owner_user_id);
CREATE INDEX idx_organizations_hedera ON organizations(hedera_account_id);
```

### Table: organization_members
```sql
CREATE TABLE organization_members (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    user_id             UUID NOT NULL REFERENCES users(id),
    role                VARCHAR(20) NOT NULL,              -- 'owner' | 'admin' | 'member' | 'viewer'
    invited_by          UUID REFERENCES users(id),
    joined_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, user_id)
);

CREATE INDEX idx_org_members_user ON organization_members(user_id);
CREATE INDEX idx_org_members_org ON organization_members(organization_id);
```

### Table: organization_invitations
```sql
CREATE TABLE organization_invitations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    email               VARCHAR(256) NOT NULL,
    role                VARCHAR(20) NOT NULL DEFAULT 'member',  -- 'admin' | 'member' | 'viewer'
    invited_by          UUID NOT NULL REFERENCES users(id),
    status              VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'expired' | 'revoked'
    token               VARCHAR(128) UNIQUE NOT NULL,
    expires_at          TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_org_invitations_org ON organization_invitations(organization_id);
CREATE INDEX idx_org_invitations_token ON organization_invitations(token);
CREATE INDEX idx_org_invitations_email ON organization_invitations(email);
```

### Table: payment_requests
```sql
CREATE TABLE payment_requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_user_id   UUID NOT NULL REFERENCES users(id),
    organization_id     UUID REFERENCES organizations(id),  -- NULL if personal context
    conversation_id     UUID REFERENCES conversations(id),
    hcs_topic_id        VARCHAR(20) NOT NULL,
    hcs_sequence_number BIGINT,
    amount              DECIMAL(18,8) NOT NULL,
    currency            VARCHAR(10) NOT NULL DEFAULT 'HBAR',
    description         TEXT,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending' | 'paid' | 'expired' | 'declined'
    paid_tx_id          VARCHAR(64),                        -- Hedera tx ID when paid
    paid_at             TIMESTAMP WITH TIME ZONE,
    expires_at          TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_payment_requests_requester ON payment_requests(requester_user_id, created_at DESC);
CREATE INDEX idx_payment_requests_status ON payment_requests(status);
CREATE INDEX idx_payment_requests_conversation ON payment_requests(conversation_id);
```

### Table: transactions
```sql
CREATE TABLE transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id),
    organization_id     UUID REFERENCES organizations(id),  -- NULL if personal context
    counterparty_id     UUID NOT NULL REFERENCES users(id),
    conversation_id     UUID REFERENCES conversations(id),
    direction           VARCHAR(10) NOT NULL,               -- 'sent' | 'received'
    amount              DECIMAL(18,8) NOT NULL,
    currency            VARCHAR(10) NOT NULL DEFAULT 'HBAR',
    status              VARCHAR(20) NOT NULL,               -- 'pending' | 'completed' | 'failed'
    description         TEXT,
    hedera_tx_id        VARCHAR(64),                        -- Hedera transaction ID
    hcs_message_seq     BIGINT,                             -- HCS sequence number (on-chain proof)
    tamam_tx_ref        VARCHAR(128),                       -- Tamam Custody reference
    payment_request_id  UUID REFERENCES payment_requests(id),  -- links to payment request if applicable
    payment_type        VARCHAR(20) NOT NULL,               -- 'send' | 'request_fulfillment' | 'split_payment'
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at        TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_transactions_user ON transactions(user_id, created_at DESC);
CREATE INDEX idx_transactions_org ON transactions(organization_id, created_at DESC);
CREATE INDEX idx_transactions_hedera ON transactions(hedera_tx_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_counterparty ON transactions(counterparty_id, created_at DESC);
```

---

# 5. API Specification

## 5.1 Authentication

All API requests require authentication via JWT bearer token.

**Token Format:**
```
Authorization: Bearer <jwt_token>
```

**JWT Payload:**
```json
{
  "sub": "0.0.12345",          // Hedera Account ID
  "uid": "uuid",               // Platform user ID
  "type": "individual",        // Account type
  "status": "active",          // User status
  "iat": 1710100000,
  "exp": 1710186400            // 24h expiry
}
```

**Token Refresh:** Tokens are refreshed via `/api/v1/auth/refresh` using a secure httpOnly refresh token cookie.

## 5.2 API Endpoints — Detailed

### 5.2.1 Identity & Auth

---

**POST /api/v1/auth/register**

Register a new user with email or phone and password.

Request:
```json
{
  "method": "email | phone",
  "value": "user@example.com | +971501234567",
  "password": "string (min 8 chars, must include uppercase, lowercase, number)"
}
```

Response 200:
```json
{
  "registrationId": "uuid",
  "otpSent": true,
  "expiresAt": "2026-03-11T00:05:00Z"
}
```

Errors: 400 (invalid format), 409 (already registered)

---

**POST /api/v1/auth/verify-otp**

Verify OTP and create wallet.

Request:
```json
{
  "registrationId": "uuid",
  "otp": "123456"
}
```

Response 200:
```json
{
  "token": "jwt_token",
  "refreshToken": "set_via_cookie",
  "user": {
    "id": "uuid",
    "hederaAccountId": "0.0.12345",
    "status": "pending_kyc",
    "accountType": null
  }
}
```

Errors: 400 (invalid OTP), 410 (OTP expired)

---

**POST /api/v1/auth/kyc**

Submit KYC/KYB documents.

Request (multipart/form-data):
```
accountType: "individual" | "business"
fullName: "John Doe"
dateOfBirth: "1990-01-15"                    // individual only
nationality: "AE"                             // ISO 3166-1 alpha-2
idDocument: <file>                            // passport, national ID
selfie: <file>                                // liveness check
companyName: "Acme Corp"                      // business only
registrationNumber: "12345"                   // business only
businessCategory: "technology"                // business only
companyDocument: <file>                       // business only
```

Response 202:
```json
{
  "kycId": "mirsad-ai-request-id",
  "status": "submitted",
  "estimatedCompletionTime": "2026-03-11T01:00:00Z"
}
```

---

**GET /api/v1/auth/kyc-status**

Check current KYC status.

Response 200:
```json
{
  "status": "submitted | approved | rejected | pending_review",
  "kycLevel": "basic",
  "rejectionReason": null,
  "canResubmit": false,
  "didNftSerial": 42,                         // present if approved
  "didNftMetadataCid": "QmXyz..."            // present if approved
}
```

---

**GET /api/v1/profile/:accountId**

Get a user's public profile.

Response 200:
```json
{
  "hederaAccountId": "0.0.12345",
  "accountType": "individual",
  "displayName": "John Doe",
  "bio": "Building the future of social",
  "avatarUrl": "https://ipfs.io/ipfs/QmXyz...",
  "kycVerified": true,
  "kycLevel": "basic",
  "publicFeedTopic": "0.0.67890",
  "broadcastTopic": null,
  "stats": {
    "followers": 142,
    "following": 89,
    "posts": 37,
    "messagesOnChain": 4521,
    "paymentsOnChain": 23
  },
  "createdAt": "2026-03-01T10:00:00Z",
  "didNft": {
    "tokenId": "0.0.TOKEN",
    "serial": 42,
    "metadataCid": "QmXyz..."
  }
}
```

---

**PUT /api/v1/profile/me**

Update current user's profile.

Request:
```json
{
  "displayName": "John Doe Updated",
  "bio": "New bio text",
  "avatar": "<base64 image data or ipfs CID>"
}
```

Response 200:
```json
{
  "updated": true,
  "didNftSerial": 43,
  "hederaTransactions": [
    { "type": "TokenWipe", "txId": "0.0.XXX@..." },
    { "type": "TokenMint", "txId": "0.0.XXX@..." }
  ]
}
```

---

### 5.2.2 Messaging

---

**POST /api/v1/conversations**

Create a new conversation.

Request:
```json
{
  "type": "direct | group",
  "participants": ["0.0.11111", "0.0.22222"],
  "groupName": "Team Chat",                   // required for group
  "groupAvatar": "base64 or ipfs CID"         // optional for group
}
```

Response 201:
```json
{
  "id": "uuid",
  "hcsTopicId": "0.0.99999",
  "type": "direct",
  "participants": [
    { "accountId": "0.0.11111", "displayName": "Alice" },
    { "accountId": "0.0.22222", "displayName": "Bob" }
  ],
  "createdAt": "2026-03-11T10:00:00Z",
  "hederaTransactions": [
    { "type": "TopicCreate", "txId": "0.0.XXX@..." },
    { "type": "SubmitMessage", "txId": "0.0.XXX@...", "note": "key_exchange" }
  ]
}
```

---

**GET /api/v1/conversations**

List user's conversations, sorted by most recent activity.

Query params: `?limit=20&cursor=<last_conversation_id>`

Response 200:
```json
{
  "conversations": [
    {
      "id": "uuid",
      "hcsTopicId": "0.0.99999",
      "type": "direct",
      "participants": [
        { "accountId": "0.0.22222", "displayName": "Bob", "avatarUrl": "..." }
      ],
      "lastMessage": {
        "type": "message",
        "senderAccountId": "0.0.22222",
        "timestamp": "2026-03-11T09:55:00Z",
        "sequenceNumber": 142
      },
      "_note": "Message preview is NOT included — messages are E2E encrypted. Client decrypts locally after fetching from HCS.",
      "unreadCount": 3
    }
  ],
  "nextCursor": "uuid-of-last",
  "hasMore": true
}
```

---

**POST /api/v1/conversations/:topicId/messages**

Send a message in a conversation.

Request:
```json
{
  "encryptedPayload": "base64(AES-256-GCM encrypted message JSON)",
  "nonce": "base64(96-bit nonce)",
  "keyId": "uuid of current symmetric key"
}
```

Response 201:
```json
{
  "sequenceNumber": 143,
  "consensusTimestamp": "2026-03-11T10:00:01.123456789Z",
  "transactionId": "0.0.XXX@1710100001.123456789"
}
```

---

**GET /api/v1/conversations/:topicId/messages**

Get messages for a conversation.

Query params: `?limit=50&before=<sequence_number>&after=<sequence_number>`

Response 200:
```json
{
  "messages": [
    {
      "sequenceNumber": 142,
      "consensusTimestamp": "2026-03-11T09:55:00Z",
      "senderAccountId": "0.0.22222",
      "encryptedPayload": "base64(...)",
      "nonce": "base64(...)",
      "keyId": "uuid",
      "transactionId": "0.0.XXX@..."
    }
  ],
  "hasMore": true,
  "oldestSequence": 1,
  "newestSequence": 142
}
```

Note: Messages are returned encrypted. The client decrypts them locally.

---

**POST /api/v1/conversations/:topicId/members**

Add a member to a group conversation.

Request:
```json
{
  "accountId": "0.0.33333"
}
```

Response 200:
```json
{
  "added": true,
  "hederaTransactions": [
    { "type": "SubmitMessage", "txId": "...", "note": "system_message" }
  ]
}
```

---

### 5.2.3 Social

---

**POST /api/v1/posts**

Create a public post.

Request:
```json
{
  "text": "Hello world, this is my first on-chain post!",
  "media": [
    {
      "ipfsCid": "QmXyz...",
      "mimeType": "image/jpeg",
      "size": 245000,
      "dimensions": "1920x1080",
      "alt": "A beautiful sunset"
    }
  ]
}
```

Response 201:
```json
{
  "sequenceNumber": 38,
  "consensusTimestamp": "2026-03-11T10:00:00Z",
  "transactionId": "0.0.XXX@...",
  "hcsTopicId": "0.0.FEED_TOPIC"
}
```

---

**GET /api/v1/feed**

Get the authenticated user's home feed.

Query params: `?limit=20&cursor=<consensus_timestamp>`

Response 200:
```json
{
  "posts": [
    {
      "id": "uuid",
      "author": {
        "accountId": "0.0.22222",
        "displayName": "Bob",
        "avatarUrl": "...",
        "kycVerified": true
      },
      "text": "Just shipped a new feature!",
      "media": [],
      "hcsTopicId": "0.0.BOB_FEED",
      "sequenceNumber": 15,
      "consensusTimestamp": "2026-03-11T09:30:00Z",
      "transactionId": "0.0.XXX@..."
    }
  ],
  "nextCursor": "2026-03-11T09:30:00Z",
  "hasMore": true
}
```

---

**POST /api/v1/social/follow/:accountId**

Follow a user.

Response 200:
```json
{
  "following": true,
  "hcsSequenceNumber": 5421,
  "transactionId": "0.0.XXX@..."
}
```

---

### 5.2.4 Payments

---

**POST /api/v1/payments/send**

Send money in a conversation.

Request:
```json
{
  "topicId": "0.0.99999",
  "recipientAccountId": "0.0.22222",
  "amount": 50.00,
  "currency": "USD",
  "note": "Here's the $50 I owe you"
}
```

Response 200:
```json
{
  "paymentId": "uuid",
  "status": "confirmed",
  "htsTransactionId": "0.0.XXX@...",
  "hcsReceiptSequence": 144,
  "hcsTransactionId": "0.0.XXX@...",
  "custodyTxId": "tamam-custody-tx-id",
  "amount": 50.00,
  "currency": "USD"
}
```

Errors: 400 (insufficient balance), 404 (recipient not found), 502 (MPC Custody signing error)

---

**POST /api/v1/payments/request**

Request money in a conversation.

Request:
```json
{
  "topicId": "0.0.99999",
  "amount": 50.00,
  "currency": "USD",
  "note": "Dinner last night"
}
```

Response 201:
```json
{
  "requestId": "uuid",
  "status": "pending",
  "hcsSequenceNumber": 145,
  "transactionId": "0.0.XXX@..."
}
```

---

**POST /api/v1/payments/split**

Create a split payment in a group.

Request:
```json
{
  "topicId": "0.0.88888",
  "totalAmount": 120.00,
  "currency": "USD",
  "note": "Dinner - split 4 ways",
  "splitMethod": "equal",
  "participants": ["0.0.11111", "0.0.22222", "0.0.33333", "0.0.44444"]
}
```

Response 201:
```json
{
  "splitId": "uuid",
  "status": "pending",
  "shares": {
    "0.0.11111": { "amount": 30.00, "status": "pending" },
    "0.0.22222": { "amount": 30.00, "status": "pending" },
    "0.0.33333": { "amount": 30.00, "status": "pending" },
    "0.0.44444": { "amount": 30.00, "status": "pending" }
  },
  "hcsSequenceNumber": 200,
  "transactionId": "0.0.XXX@..."
}
```

---

**POST /api/v1/payments/split/:splitId/pay**

Pay your share of a split.

Response 200:
```json
{
  "paid": true,
  "htsTransactionId": "0.0.XXX@...",
  "hcsSequenceNumber": 201,
  "remainingUnpaid": 2
}
```

---

**GET /api/v1/transactions**

Get transaction history (personal or org context).

Query params: `?limit=20&cursor=<timestamp>&direction=sent|received|all&status=completed|pending|failed&from=<date>&to=<date>&search=<counterparty_name_or_tx_id>`

Headers: `X-Org-Context: <org-id>` (optional, for org-level history)

Response 200:
```json
{
  "transactions": [
    {
      "id": "uuid",
      "direction": "sent",
      "amount": 50.00,
      "currency": "HBAR",
      "status": "completed",
      "counterparty": {
        "accountId": "0.0.22222",
        "displayName": "Bob",
        "avatarUrl": "..."
      },
      "description": "Invoice #1234",
      "conversationId": "uuid",
      "hcsTopicId": "0.0.99999",
      "hederaTxId": "0.0.XXX@...",
      "tamamTxRef": "tamam-ref-123",
      "paymentRequestId": "uuid (if from a payment request)",
      "paymentType": "send",
      "createdAt": "2026-03-11T10:00:00Z",
      "completedAt": "2026-03-11T10:00:05Z"
    }
  ],
  "nextCursor": "2026-03-11T09:00:00Z",
  "hasMore": true
}
```

---

**GET /api/v1/transactions/:id**

Get transaction detail with full on-chain proof.

Response 200:
```json
{
  "id": "uuid",
  "direction": "sent",
  "amount": 50.00,
  "currency": "HBAR",
  "status": "completed",
  "counterparty": {
    "accountId": "0.0.22222",
    "displayName": "Bob",
    "avatarUrl": "...",
    "kycVerified": true
  },
  "description": "Invoice #1234",
  "conversationId": "uuid",
  "hcsTopicId": "0.0.99999",
  "hcsMessageSeq": 145,
  "hederaTxId": "0.0.XXX@...",
  "tamamTxRef": "tamam-ref-123",
  "paymentRequestId": "uuid",
  "paymentType": "request_fulfillment",
  "createdAt": "2026-03-11T10:00:00Z",
  "completedAt": "2026-03-11T10:00:05Z",
  "onChainProof": {
    "hcsExplorerUrl": "https://hashscan.io/testnet/topic/0.0.99999/message/145",
    "htsExplorerUrl": "https://hashscan.io/testnet/transaction/0.0.XXX@..."
  }
}
```

---

### 5.2.5 Organization & Business

---

**GET /api/v1/organizations/me**

Get the caller's organization (if any).

Response 200:
```json
{
  "id": "uuid",
  "name": "Acme Corp",
  "logoUrl": "https://ipfs.io/ipfs/QmXyz...",
  "bio": "Building the future",
  "category": "technology",
  "website": "https://acme.com",
  "businessHours": { "mon": "9:00-17:00" },
  "kybStatus": "verified",
  "kybVerifiedAt": "2026-03-05T10:00:00Z",
  "hederaAccountId": "0.0.12345",
  "broadcastTopicId": "0.0.67890",
  "badgeTier": "verified",
  "members": [
    { "userId": "uuid", "displayName": "Alice", "role": "owner", "joinedAt": "..." },
    { "userId": "uuid", "displayName": "Bob", "role": "admin", "joinedAt": "..." }
  ],
  "memberCount": 5,
  "createdAt": "2026-03-05T10:00:00Z"
}
```

Errors: 404 (user has no organization)

---

**PUT /api/v1/organizations/me**

Update organization profile. Requires Owner or Admin role.

Request:
```json
{
  "name": "Acme Corp Updated",
  "bio": "New company bio",
  "category": "fintech",
  "website": "https://acme.io",
  "businessHours": { "mon": "8:00-18:00" },
  "logo": "base64 or ipfs CID"
}
```

Response 200:
```json
{
  "updated": true,
  "organization": { "...updated org object..." }
}
```

Errors: 403 (ORG_PERMISSION_DENIED — Viewer or Member role)

---

**POST /api/v1/organizations/me/invitations**

Invite a team member. Requires Owner or Admin role.

Request:
```json
{
  "email": "teammate@example.com",
  "role": "member"
}
```

Response 201:
```json
{
  "invitationId": "uuid",
  "email": "teammate@example.com",
  "role": "member",
  "status": "pending",
  "expiresAt": "2026-03-18T10:00:00Z"
}
```

Errors: 403 (ORG_PERMISSION_DENIED), 409 (user already a member), 400 (max 50 members reached)

---

**POST /api/v1/organizations/invitations/:token/accept**

Accept an organization invitation.

Response 200:
```json
{
  "accepted": true,
  "organization": {
    "id": "uuid",
    "name": "Acme Corp",
    "role": "member"
  },
  "hcsTransactionId": "0.0.XXX@..."
}
```

Errors: 400 (invalid token), 410 (invitation expired), 409 (already a member)

---

**PUT /api/v1/organizations/me/members/:userId/role**

Change a member's role. Requires Owner role.

Request:
```json
{
  "role": "admin"
}
```

Response 200:
```json
{
  "updated": true,
  "userId": "uuid",
  "newRole": "admin",
  "hcsTransactionId": "0.0.XXX@..."
}
```

Errors: 403 (only Owner can change roles), 400 (cannot change own role), 404 (user not a member)

---

**DELETE /api/v1/organizations/me/members/:userId**

Remove a member from the organization. Requires Owner or Admin role.

Response 200:
```json
{
  "removed": true,
  "userId": "uuid",
  "hcsTransactionId": "0.0.XXX@..."
}
```

Errors: 403 (ORG_PERMISSION_DENIED), 400 (cannot remove Owner)

---

## 5.3 WebSocket Protocol

### Connection
```
wss://api.platform.com/ws?token=<jwt_token>
```

### Client → Server Messages

| Event | Payload | Description |
|-------|---------|-------------|
| `subscribe` | `{ "topics": ["0.0.T1", "0.0.T2"] }` | Subscribe to conversation updates |
| `unsubscribe` | `{ "topics": ["0.0.T1"] }` | Unsubscribe from topics |
| `typing` | `{ "topicId": "0.0.T1" }` | Send typing indicator |
| `read` | `{ "topicId": "0.0.T1", "upToSeq": 142 }` | Mark messages as read |
| `ping` | `{}` | Keepalive |

### Server → Client Messages

| Event | Payload | Description |
|-------|---------|-------------|
| `message` | `{ "topicId": "0.0.T1", "data": { encrypted message } }` | New message in subscribed topic |
| `typing` | `{ "topicId": "0.0.T1", "accountId": "0.0.X" }` | Someone is typing |
| `read` | `{ "topicId": "0.0.T1", "accountId": "0.0.X", "upToSeq": 142 }` | Read receipt update |
| `notification` | `{ notification object }` | Real-time notification |
| `payment` | `{ "topicId": "0.0.T1", "data": { payment receipt } }` | Payment event |
| `presence` | `{ "accountId": "0.0.X", "status": "online\|offline" }` | User presence update |
| `pong` | `{}` | Keepalive response |

---

# 6. Hedera Integration Specification

## 6.1 Platform-Level HCS Topics

These topics are created once during platform deployment and used globally.

| Topic | Purpose | Submit Key | Public |
|-------|---------|-----------|--------|
| Social Graph | Records all follow/unfollow/block events | Platform key | Yes |
| KYC Attestations | Records all KYC/KYB approval attestations | Platform key | Yes |
| Platform Announcements | System-wide announcements | Platform key | Yes |

## 6.2 Per-User HCS Topics

Created during user onboarding (FR-ID-005).

| Topic | Purpose | Submit Key | Public |
|-------|---------|-----------|--------|
| Public Feed | User's posts and status updates | User's account key | Yes |
| Notifications | Platform → User notifications | Platform key | No (encrypted) |
| Broadcast (Business) | Business broadcasts | Business account key | Yes |

## 6.3 Per-Conversation HCS Topics

Created when a new conversation starts (FR-MSG-001, FR-MSG-002).

| Topic | Purpose | Submit Key | Public |
|-------|---------|-----------|--------|
| 1:1 Conversation | Private messages between two users | Platform operator key | No (encrypted) |
| Group Conversation | Private messages in a group | Platform operator key | No (encrypted) |

## 6.4 HTS Token Configuration

### DID NFT Token (Created Once)
```
Token Name:       "Platform DID"
Token Symbol:     "PDID"
Token Type:       NON_FUNGIBLE_UNIQUE
Supply Type:      INFINITE
Admin Key:        Platform admin key
Supply Key:       Platform supply key (for minting)
Freeze Key:       Platform freeze key (for soulbound enforcement)
Wipe Key:         Platform wipe key (for profile updates / revocation)
Pause Key:        Platform pause key (emergency)
Fee Schedule Key: None
```

## 6.5 Hedera SDK Usage Patterns

### Recommended SDK: `@hiero-ledger/sdk` v2.70+

Key operations and their SDK calls:

| Operation | SDK Call | Notes |
|-----------|---------|-------|
| Account creation | Via Tamam MPC Custody `createHederaAccount: true` | MPC key generation + auto account |
| Create HCS topic | `TopicCreateTransaction` | Set submitKey for private topics |
| Submit HCS message | `TopicMessageSubmitTransaction` | Max 1024 bytes per message |
| Subscribe to topic | Mirror Node gRPC `TopicMessageQuery` | Real-time message streaming |
| Query topic messages | Mirror Node REST `/api/v1/topics/{id}/messages` | Paginated history |
| Mint NFT | `TokenMintTransaction` | Include metadata CID |
| Freeze NFT | `TokenFreezeTransaction` | Soulbound enforcement |
| Wipe NFT | `TokenWipeTransaction` | For profile update (wipe + re-mint) |
| Token transfer | `TransferTransaction` (signed via MPC Custody) | For in-chat payments |
| Update topic | `TopicUpdateTransaction` | Admin metadata updates only (NOT for member key changes — access control is application-layer) |

## 6.6 Mirror Node Queries Used

| Query | Endpoint | Purpose |
|-------|----------|---------|
| Account info | `GET /api/v1/accounts/{id}` | Profile data, public key |
| Account tokens | `GET /api/v1/accounts/{id}/tokens` | DID NFT verification |
| Topic messages | `GET /api/v1/topics/{id}/messages` | Message history |
| Token info | `GET /api/v1/tokens/{id}` | DID NFT collection info |
| NFT info | `GET /api/v1/tokens/{id}/nfts/{serial}` | Individual DID NFT data |
| Transaction record | `GET /api/v1/transactions/{id}` | Payment verification |

---

# 7. Security Specification

## 7.1 Encryption Requirements

| Aspect | Specification |
|--------|---------------|
| Message encryption | AES-256-GCM |
| Key exchange | X25519 Diffie-Hellman key agreement (nacl.box / tweetnacl) |
| Nonce generation | Cryptographically secure random 96-bit nonce per message |
| Key storage (client) | Encrypted local storage (keychain on mobile, Web Crypto API on web) |
| Key storage (server) | NEVER stored. Generated, distributed, discarded. |
| TLS | TLS 1.3 minimum for all API traffic |
| JWT signing | HS256 with `JWT_SECRET` from env (minimum 256-bit) |

## 7.2 Authentication & Authorization

| Aspect | Specification |
|--------|---------------|
| Authentication | JWT bearer tokens, 24h expiry |
| Token refresh | Secure httpOnly cookie, 30-day expiry |
| Rate limiting | 100 API calls/minute per user, 10 HCS submissions/second per user |
| Authorization | Application-layer access control (JWT + DB membership). Platform operator key signs all HCS submissions. |
| KYC gate | All features except registration require active KYC status |
| Admin actions | Only group admin can add/remove members, update group metadata |
| Org RBAC | Organization endpoints require `OrgPermissionGuard` — validates caller role against required permission per endpoint. Org context passed via `X-Org-Context` header or JWT claim. Roles: Owner (all), Admin (invite/message/pay/broadcast/profile), Member (message/create requests), Viewer (read-only). |
| Org permission denied | Returns HTTP 403 with error code `ORG_PERMISSION_DENIED` and required role in response body |
| Role hierarchy | Owner > Admin > Member > Viewer. Only Owner can change roles. Only Owner/Admin can invite/remove members. |

## 7.3 Data Privacy

| Data | Storage Location | Encrypted | Access |
|------|-----------------|-----------|--------|
| KYC documents | Mirsad AI only | Yes (at rest) | Mirsad AI + user |
| KYC attestation hash | HCS (on-chain) | No (hash only) | Public |
| Private messages | HCS (on-chain) | Yes (AES-256-GCM) | Participants only |
| Public posts | HCS (on-chain) | No | Public |
| Media files | IPFS | Yes (for private) | Participants only |
| User email/phone | PostgreSQL | Yes (at rest) | Platform only |
| Hedera account keys | Tamam MPC Custody | FROST threshold shares (9 nodes) | No single party |
| X25519 encryption keys | Client device + IPFS backup | Backup encrypted with auth-derived key | User only |

---

# 8. Non-Functional Requirements

## 8.1 Performance

| Metric | Target |
|--------|--------|
| Message delivery latency | < 3 seconds (send to display) |
| API response time (p95) | < 500ms |
| Feed load time | < 2 seconds |
| WebSocket connection setup | < 1 second |
| Concurrent WebSocket connections | 10,000+ per node |
| HCS submission throughput | 100 messages/second (platform-wide) |

## 8.2 Scalability

| Metric | Target |
|--------|--------|
| Concurrent users | 10,000 (initial), 100,000 (6 months) |
| Total users | 50,000 (initial), 500,000 (12 months) |
| Messages per day | 500,000 (initial), 5M (6 months) |
| HCS transactions per day | 600,000+ |
| PostgreSQL storage | 100GB (initial), 1TB (12 months) |

## 8.3 Availability

| Metric | Target |
|--------|--------|
| Platform uptime | 99.9% |
| Hedera network (dependency) | 99.99% (SLA) |
| Data durability | 100% (on-chain data is permanent) |
| Disaster recovery | Platform DB reconstructable from Hedera in < 4 hours |

## 8.4 Compatibility

| Platform | Minimum Version |
|----------|----------------|
| Web browsers | Chrome 90+, Firefox 90+, Safari 15+, Edge 90+ |
| iOS | 15.0+ |
| Android | 10.0+ (API 29) |
| Node.js (backend) | 20 LTS |

---

# 9. UI/UX Requirements

## 9.1 Design Principles

| Principle | Description |
|-----------|-------------|
| **Blockchain invisible** | Users should never need to understand blockchain, keys, or transactions |
| **Familiar UX** | Messaging should feel like WhatsApp/Signal, social feed like Twitter/Instagram |
| **Verification visible** | KYC verification badges should be prominently displayed |
| **On-chain proof accessible** | Every message/post should have a "View on Explorer" option (for power users) |
| **Payment native** | Payment widgets should feel as natural as attaching a photo |

## 9.2 Key Screens

| Screen | Description |
|--------|-------------|
| **Splash / Onboarding** | Registration, OTP, account type selection, KYC submission |
| **Chat List** | All conversations sorted by recent activity, unread counts |
| **Chat View** | Individual conversation with messages, payment widgets, media |
| **Social Feed** | Home feed with posts from followed users |
| **User Profile** | Profile info, DID NFT details, on-chain stats, follow button |
| **My Wallet** | Balance, payment history, Hedera Account ID, DID NFT |
| **Transaction History** | Chronological payment ledger with filters, search, on-chain proof links (personal + org views) |
| **Settings** | Profile editing, notification preferences, security |
| **Business Dashboard** | Broadcast channel, subscriber analytics (business only) |
| **Organization Management** | Org profile, member list with roles, invite flow, role management (business only) |
| **Context Switcher** | Toggle between personal and org identity (visible in nav for org members) |

## 9.3 Payment Widget UX

The payment button sits alongside the attachment and camera buttons in the chat input bar. Tapping it opens a bottom sheet with three options: Send Money, Request Money, Split (group only). The flow is: select action → enter amount → add note (optional) → confirm → payment receipt appears as a message in chat.

---

# 10. Testing Requirements

## 10.1 Testing Strategy

| Level | Scope | Tools |
|-------|-------|-------|
| Unit Tests | Business logic, encryption, message formatting | Jest, Vitest |
| Integration Tests | API endpoints, Hedera SDK calls, Tamam MPC Custody/KYC integration | Supertest, Hedera Testnet |
| E2E Tests | Full user flows (onboard, message, pay) | Playwright (web), Detox (mobile) |
| Load Tests | Concurrent message submission, WebSocket connections | k6 |
| Security Tests | Encryption verification, auth bypass attempts | OWASP ZAP, manual |

## 10.2 Hedera Testnet Testing

All development and testing uses Hedera Testnet. Key test scenarios:

| Test | What to Verify |
|------|---------------|
| Account creation | Tamam MPC Custody creates valid Hedera account on Testnet |
| NFT minting | DID NFT mints correctly with metadata CID |
| NFT soulbound | Frozen token cannot be transferred |
| Topic creation | Private topics enforce submit key correctly |
| Message submission | Messages appear on topic with correct sequence numbers |
| Message encryption | Encrypted messages are unreadable without key |
| Key exchange | Participants can decrypt key bundles and read messages |
| Key rotation | Removed members cannot decrypt new messages |
| Token transfer | HTS transfers execute correctly via MPC Custody signing |
| Mirror Node queries | Historical data matches submitted transactions |

## 10.3 Acceptance Testing Checklist

- [ ] User can register, verify KYC, and see their DID NFT on HashScan
- [ ] User can start a 1:1 conversation and exchange encrypted messages
- [ ] User can create a group chat with 3+ members
- [ ] Messages display within 3 seconds of sending
- [ ] Removed group member cannot read new messages
- [ ] User can send money in a conversation and both parties see the receipt
- [ ] User can request money and recipient can pay with one tap
- [ ] User can create a split payment in a group chat
- [ ] User can create public posts visible on their profile
- [ ] User can follow another user and see their posts in feed
- [ ] Business user can send broadcasts
- [ ] KYB-approved business has auto-created organization with Owner role
- [ ] Org Owner can invite team member by email with role assignment
- [ ] Invited member can accept and join the organization
- [ ] Org Owner can change member roles (role change recorded on HCS)
- [ ] Team member can switch between personal and org context
- [ ] Messages sent in org context show org name + badge (not individual name)
- [ ] Verified badge (blue) displays on KYB-approved business profiles, chat headers, and search results
- [ ] Payment request sent in chat renders as card with amount, description, "Pay" button
- [ ] Recipient can pay a payment request with one tap (pre-filled FR-PAY-001 flow)
- [ ] Payment request status updates to "Paid" with transaction ID after payment
- [ ] Expired payment requests show "Expired" status and cannot be paid
- [ ] Transaction history page shows all payments with filters (date, direction, status)
- [ ] Transaction detail shows full metadata + on-chain proof link (HashScan)
- [ ] Org transaction history aggregates payments across all org members
- [ ] RBAC enforced: Viewer cannot send messages, Member cannot invite or send payments as org
- [ ] All on-chain transactions are verifiable on HashScan
- [ ] Platform database can be wiped and reconstructed from Mirror Node

---

# 11. Deployment Specification

## 11.1 Environment Configuration

### Environment Variables
```env
# Hedera
HEDERA_NETWORK=testnet|mainnet
HEDERA_OPERATOR_ID=0.0.XXXXX
HEDERA_OPERATOR_KEY=302e...
HEDERA_MIRROR_NODE_URL=https://mainnet.mirrornode.hedera.com

# DID NFT Token
DID_NFT_TOKEN_ID=0.0.XXXXX
DID_NFT_SUPPLY_KEY=302e...
DID_NFT_FREEZE_KEY=302e...
DID_NFT_WIPE_KEY=302e...

# Platform Topics
SOCIAL_GRAPH_TOPIC_ID=0.0.XXXXX
KYC_ATTESTATION_TOPIC_ID=0.0.XXXXX

# External APIs — Mirsad AI KYC/AML
MIRSAD_KYC_API_URL=https://olara-api.var-meta.com        # staging
# MIRSAD_KYC_API_URL=https://dashboard-api.olara.io     # production
MIRSAD_KYC_CALLBACK_URL=https://api.ourplatform.com/webhooks/mirsad-ai

# External APIs — Tamam MPC Custody
TAMAM_CUSTODY_API_URL=https://tamam-backend-staging-776426377628.us-central1.run.app
TAMAM_CUSTODY_API_KEY=olara_...
TAMAM_CUSTODY_WEBHOOK_SECRET=...

# IPFS
PINATA_API_KEY=...
PINATA_SECRET_KEY=...
PINATA_GATEWAY_URL=https://gateway.pinata.cloud

# Database
DATABASE_URL=postgresql://user:pass@host:5432/platform
REDIS_URL=redis://host:6379

# Auth
JWT_SECRET=...
JWT_EXPIRY=24h
JWT_REFRESH_EXPIRY=30d

# Server
PORT=3000
WS_PORT=3001
NODE_ENV=production
```

## 11.2 One-Time Setup (Platform Deployment)

Before the platform can serve users, these one-time operations must be executed:

1. **Create DID NFT Token** — Deploy HTS token with admin/supply/freeze/wipe keys
2. **Create Social Graph Topic** — Public HCS topic, platform submit key
3. **Create KYC Attestation Topic** — Public HCS topic, platform submit key
4. **Create Platform Announcements Topic** — Public HCS topic, platform submit key
5. **Deploy PostgreSQL schema** — Run migrations
6. **Configure PostgreSQL full-text search** — Create search indices for public content (user profiles, posts)
7. **Configure Tamam/Mirsad APIs** — Verify Tamam MPC Custody and Mirsad AI KYC connectivity and auth

## 11.3 GitHub Repository Structure

```
hedera-social-platform/
├── README.md                    # Setup + quickstart (hackathon requirement)
├── docs/
│   ├── ARCHITECTURE.md          # Architecture design document
│   ├── SPECIFICATION.md         # This document
│   ├── DEVELOPMENT-ROADMAP.md   # Development roadmap & task breakdown
│   └── PRD-BUSINESS-FEATURES.md # Business features roadmap
├── apps/
│   ├── web/                     # Next.js web application
│   │   ├── src/
│   │   │   ├── app/             # Next.js App Router pages
│   │   │   ├── components/      # React components
│   │   │   ├── hooks/           # Custom React hooks
│   │   │   ├── lib/             # Utilities, Hedera client, encryption
│   │   │   └── stores/          # Zustand stores
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── mobile/                  # React Native (Expo) app — POST-HACKATHON
│       ├── src/
│       └── package.json
├── packages/
│   ├── api/                     # NestJS API server
│   │   ├── src/
│   │   │   ├── routes/          # API route handlers
│   │   │   ├── services/        # Business logic services
│   │   │   ├── hedera/          # Hedera integration layer
│   │   │   ├── middleware/      # Auth, validation, rate limiting
│   │   │   └── websocket/       # WebSocket gateway
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── shared/                  # Shared types, constants, schemas
│   │   ├── src/
│   │   │   ├── types/           # TypeScript interfaces
│   │   │   ├── schemas/         # Message schemas, validation
│   │   │   └── constants/       # Shared constants
│   │   └── package.json
│   └── crypto/                  # Encryption utilities
│       ├── src/
│       │   ├── aes.ts           # AES-256-GCM encrypt/decrypt
│       │   ├── keys.ts          # Key exchange helpers
│       │   └── index.ts
│       └── package.json
├── contracts/                   # Solidity contracts (future)
│   └── README.md
├── scripts/
│   ├── setup-hedera.ts          # One-time Hedera setup script
│   ├── seed-testnet.ts          # Create test accounts on testnet
│   └── migrate-db.ts            # Database migrations
├── docker-compose.yml           # Local development environment
├── .github/
│   └── workflows/
│       ├── ci.yml               # CI: lint, test, build
│       └── deploy.yml           # CD: deploy to staging/production
├── turbo.json                   # Turborepo configuration
└── package.json                 # Root workspace configuration
```

---

# 12. Future Roadmap Features

Features designed in the architecture but NOT in hackathon scope:

| Feature | Module | Hedera Services | Priority |
|---------|--------|----------------|----------|
| Escrow smart contract | Payments | HSCS | High (post-hackathon) |
| Business product catalog | Business | HCS | Medium |
| Invoice management | Business | HCS + HSCS | Medium |
| Subscription payments | Payments | Scheduled Transactions | Medium |
| Recurring payment requests | Payments | HCS | Medium |
| Partial payments on requests | Payments | HCS + HTS | Medium |
| Payment request templates (businesses) | Payments | HCS | Low |
| Transaction CSV export | Payments | None (local) | Low |
| Stories (24h ephemeral) | Social | HCS | Medium |
| Message reactions/emoji | Messaging | HCS | Low |
| Marketplace / P2P commerce | Commerce | HCS + HTS + HSCS | High |
| Multi-device sync | Identity | Tamam MPC Custody + X25519 key backup | High |
| Metadata privacy (mixing) | Security | Custom | Low |
| Advanced client-side search (fuzzy, filters, date ranges) | Messaging | None (local) | Medium |
| AI-powered chat features | Messaging | HCS + AI | Low |
| Cross-platform deep links | UX | None | Medium |
| Advanced business analytics | Business | Mirror Node | Medium |
| Multi-org per user | Organization | DB | Medium (post-hackathon) |
| Org-level MPC wallet (shared treasury) | Organization | Tamam Custody | High (post-hackathon) |
| Custom RBAC roles | Organization | DB | Low |
| Certified badge tier (gold — enhanced KYB) | Organization | HCS | Medium |
| Org activity audit log (queryable API) | Organization | HCS + DB | Medium |
| Spending limits per role | Organization | DB | Low |

---

*Document Version: 1.1*
*Created: March 11, 2026*
*Updated: March 12, 2026 — Added Business Features (Org Tenancy, RBAC, Verified Badges, Payment Requests, Transaction History)*
*Status: Specification — Ready for Implementation Planning*
