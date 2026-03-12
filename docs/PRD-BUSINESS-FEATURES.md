# PRD: Business Features — Organization Tenancy, RBAC & Commerce

| Field | Value |
|-------|-------|
| Author | Dmitrij |
| Status | Draft |
| Date | 2026-03-12 |
| Hackathon Deadline | 2026-03-23 |
| Depends On | Phase 1 (Identity), Phase 2 (Messaging), Phase 4 (Payments) |

---

## Problem Statement

The platform currently treats business accounts as individual users with a `business` type flag and an extra `business_profiles` table. There's no multi-user organization structure — a business owner can't invite team members, delegate permissions, or operate the account as a team. There's also no structured way for businesses to request payments from customers, track transaction history, or present a verified business identity that builds trust. Without these features, the platform is a consumer messaging app that businesses have no reason to adopt.

## Goals

1. **Organization tenancy**: A business account becomes an *organization* with multiple members, each with their own login and scoped permissions
2. **Role-based access control**: Granular, auditable permissions for who can message customers, send payments, update the profile, and manage the team
3. **Verified business badges**: Visual trust signal for KYB-verified businesses, surfaced on profiles and in conversations
4. **Payment requests**: Businesses (and retail users) can send structured payment requests in chat — tap to pay
5. **Transaction history & tracking**: Searchable ledger of all payments sent/received, with status tracking, for both business and retail accounts

## Non-Goals

1. **Full CRM / contact management** — not building a Salesforce. Customer lists come from conversation history.
2. **Storefront / product catalog** — the platform is messaging + payments, not e-commerce.
3. **Automated chatbots / business workflows** — no bot framework for v1. Businesses reply manually.
4. **Multi-org management** — one user belongs to one org. Multi-org is a post-hackathon feature.
5. **Custom RBAC role creation** — fixed role set (Owner, Admin, Member, Viewer). Custom roles are post-hackathon.
6. **Org-level MPC wallet** — org uses the owner's Tamam MPC wallet. Shared org wallets require Tamam Custody support we don't have yet.

---

## Feature 1: Organization Tenancy

### User Stories

**As a** business owner, **I want to** create an organization tied to my business account **so that** my company has a structured presence on the platform.

**As a** business owner, **I want to** invite team members to my organization by email **so that** they can act on behalf of the business.

**As a** team member, **I want to** accept an org invitation and link my personal account **so that** I can operate within the business context.

**As a** team member, **I want to** switch between my personal context and my org context **so that** I can keep personal and business activity separate.

### Requirements

**P0 — Must Have**

- An organization is created automatically when a user completes KYB verification (business account)
- The KYB-verified user becomes the org Owner
- Org has its own profile: company name, logo, bio, category, website, business hours (sourced from existing `business_profiles` table)
- Org members list with roles displayed
- Invite flow: Owner/Admin generates invite → recipient gets email/in-app notification → accepts → linked to org
- Context switcher in the UI: personal ↔ org (affects which profile/wallet is used for actions)
- Org-scoped conversations: messages sent "as the business" show org name + logo, not the individual's name
- Max 50 members per org (hackathon limit)

**P1 — Nice to Have**

- Pending invitation management (revoke, resend)
- Org activity log (who did what, when)
- Org-level settings (notification preferences, auto-reply when offline)

**P2 — Future**

- Multiple orgs per user
- Org-level Tamam MPC wallet (shared treasury)
- Custom org branding on chat interfaces

### Database Changes

```
organizations
  id                  UUID PRIMARY KEY
  owner_user_id       UUID REFERENCES users(id)
  name                VARCHAR(128) NOT NULL
  hedera_account_id   VARCHAR(20) NOT NULL    -- same as owner's for now
  did_nft_serial      BIGINT                  -- org DID NFT
  broadcast_topic_id  VARCHAR(20)             -- existing field, moved here
  logo_cid            VARCHAR(128)            -- IPFS CID
  category            VARCHAR(64)
  website             VARCHAR(256)
  business_hours      JSONB
  kyb_status          VARCHAR(20) NOT NULL    -- from Mirsad AI
  kyb_verified_at     TIMESTAMPTZ
  created_at          TIMESTAMPTZ DEFAULT NOW()
  updated_at          TIMESTAMPTZ DEFAULT NOW()

organization_members
  id                  UUID PRIMARY KEY
  organization_id     UUID REFERENCES organizations(id)
  user_id             UUID REFERENCES users(id)
  role                VARCHAR(20) NOT NULL    -- 'owner' | 'admin' | 'member' | 'viewer'
  invited_by          UUID REFERENCES users(id)
  joined_at           TIMESTAMPTZ DEFAULT NOW()
  UNIQUE(organization_id, user_id)

organization_invitations
  id                  UUID PRIMARY KEY
  organization_id     UUID REFERENCES organizations(id)
  email               VARCHAR(256) NOT NULL
  role                VARCHAR(20) NOT NULL DEFAULT 'member'
  invited_by          UUID REFERENCES users(id)
  status              VARCHAR(20) DEFAULT 'pending'  -- 'pending' | 'accepted' | 'expired' | 'revoked'
  token               VARCHAR(128) UNIQUE NOT NULL
  expires_at          TIMESTAMPTZ NOT NULL
  created_at          TIMESTAMPTZ DEFAULT NOW()
```

### HCS Integration

- Org role changes recorded on HCS (social graph topic) for immutable audit:
  ```json
  {
    "type": "org_role_change",
    "orgId": "<org-uuid>",
    "targetUser": "0.0.XXXXX",
    "role": "admin",
    "action": "grant",
    "grantedBy": "0.0.YYYYY",
    "timestamp": "ISO8601"
  }
  ```

---

## Feature 2: Role-Based Access Control (RBAC)

### Roles & Permissions

| Permission | Owner | Admin | Member | Viewer |
|------------|:-----:|:-----:|:------:|:------:|
| Update org profile | ✅ | ✅ | ❌ | ❌ |
| Invite/remove members | ✅ | ✅ | ❌ | ❌ |
| Change member roles | ✅ | ❌ | ❌ | ❌ |
| Send messages as org | ✅ | ✅ | ✅ | ❌ |
| View org conversations | ✅ | ✅ | ✅ | ✅ |
| Send payments as org | ✅ | ✅ | ❌ | ❌ |
| Create payment requests | ✅ | ✅ | ✅ | ❌ |
| View transaction history | ✅ | ✅ | ✅ | ✅ |
| Post broadcasts | ✅ | ✅ | ❌ | ❌ |
| Delete org | ✅ | ❌ | ❌ | ❌ |
| Transfer ownership | ✅ | ❌ | ❌ | ❌ |

### Requirements

**P0 — Must Have**

- Permission check middleware: every org-scoped API endpoint validates the caller's role against the required permission
- Org context passed via JWT claim or request header (`X-Org-Context: <org-id>`)
- Role assignment enforced: only Owner can promote to Admin, only Owner/Admin can invite
- One Owner per org (transferable)
- Permission denied returns 403 with clear error code (`ORG_PERMISSION_DENIED`)

**P1 — Nice to Have**

- Spending limits per role (e.g., Members can request payments up to X HBAR)
- Permission audit log queryable via API

### Implementation Notes

- NestJS guard: `@RequiresOrgRole('admin', 'owner')` decorator
- Org context resolved from JWT or header in middleware, injected into request
- All org-scoped endpoints go through `OrgPermissionGuard` before reaching the controller

---

## Feature 3: Verified Business Badges

### User Stories

**As a** customer, **I want to** see a verified badge on business profiles **so that** I know I'm interacting with a legitimate company.

**As a** business, **I want** my verified status to be visible in conversations and search results **so that** customers trust me.

### Requirements

**P0 — Must Have**

- Verified badge (checkmark icon) displayed on:
  - Business profile page
  - Chat conversation header when messaging a business
  - Search results
  - Broadcast channel listings
- Badge links to on-chain verification proof (KYB attestation on HCS)
- Badge is non-fakeable — derived from server-side KYB status, not client-set
- Three tiers tied to existing KYB levels:
  - **Basic** (gray badge) — KYB submitted, pending
  - **Verified** (blue badge) — KYB approved by Mirsad AI
  - **Certified** (gold badge) — enhanced KYB with additional documentation (future)

**P1 — Nice to Have**

- Badge tooltip showing: "Verified by Mirsad AI on [date]" with link to HCS attestation
- Verification expiry and re-verification flow (annual)

---

## Feature 4: Payment Requests

### User Stories

**As a** business, **I want to** send a payment request to a customer in chat **so that** they can pay me with one tap.

**As a** retail user, **I want to** request money from a friend in chat **so that** I don't have to share wallet addresses or amounts verbally.

**As a** user receiving a payment request, **I want to** see the amount, description, and a "Pay" button **so that** I can review and pay instantly.

### Requirements

**P0 — Must Have**

- Payment request message type in chat:
  ```json
  {
    "type": "payment_request",
    "amount": "25.00",
    "currency": "HBAR",
    "description": "Invoice #1234 — March consulting",
    "requestedBy": "0.0.XXXXX",
    "expiresAt": "ISO8601",
    "status": "pending"
  }
  ```
- Renders as a card in chat: amount, description, "Pay" button, expiry countdown
- Tapping "Pay" triggers the existing FR-PAY-001 payment flow (Tamam MPC signing)
- After payment: request card updates to "Paid" with transaction ID and timestamp
- Request status tracked: `pending` → `paid` | `expired` | `declined`
- Status updates submitted to HCS (same conversation topic) as update messages
- Both business and retail users can send payment requests
- Payment request expiry: configurable, default 7 days

**P1 — Nice to Have**

- Recurring payment requests (weekly/monthly)
- Partial payments accepted (pay $10 of $25 request)
- Payment request templates for businesses (save common amounts/descriptions)

### HCS Message Format

```json
{
  "v": "1.0",
  "type": "payment_request",
  "requestId": "uuid",
  "amount": "25.000000",
  "currency": "HBAR",
  "description": "encrypted-description",
  "requestedBy": "0.0.XXXXX",
  "requestedFrom": "0.0.YYYYY",
  "expiresAt": "2026-03-20T00:00:00Z",
  "status": "pending",
  "paidTxId": null
}
```

Status update message:
```json
{
  "v": "1.0",
  "type": "payment_request_update",
  "requestId": "uuid",
  "status": "paid",
  "paidTxId": "0.0.XXXXX@1234567890.123",
  "paidAt": "ISO8601"
}
```

---

## Feature 5: Transaction History & Tracking

### User Stories

**As a** user, **I want to** see a chronological list of all my payments (sent and received) **so that** I can track my financial activity.

**As a** business owner, **I want to** see org-level transaction history **so that** I can reconcile payments and understand cash flow.

**As a** user, **I want to** filter transactions by date, amount, contact, and status **so that** I can find specific payments quickly.

### Requirements

**P0 — Must Have**

- Transaction history page accessible from main navigation (both personal and org context)
- Each transaction shows: date, counterparty (name + avatar), amount, currency, direction (sent/received), status, conversation link
- Filters: date range, direction (sent/received/all), status (completed/pending/failed)
- Search by counterparty name or transaction ID
- Transaction detail view: full metadata, HCS message link (on-chain proof), Tamam Custody transaction reference
- Org view: aggregated across all org members who sent/received payments as the org

**P1 — Nice to Have**

- Export to CSV
- Monthly/weekly summary with totals
- Transaction categories (manual tagging by user)
- Push notification on payment received

### Database Changes

```
transactions
  id                  UUID PRIMARY KEY
  user_id             UUID REFERENCES users(id)
  organization_id     UUID REFERENCES organizations(id) NULL  -- if org context
  counterparty_id     UUID REFERENCES users(id)
  conversation_id     UUID REFERENCES conversations(id) NULL
  direction           VARCHAR(10) NOT NULL    -- 'sent' | 'received'
  amount              DECIMAL(18,8) NOT NULL
  currency            VARCHAR(10) NOT NULL DEFAULT 'HBAR'
  status              VARCHAR(20) NOT NULL    -- 'pending' | 'completed' | 'failed'
  description         TEXT
  hedera_tx_id        VARCHAR(64)             -- Hedera transaction ID
  hcs_message_seq     BIGINT                  -- HCS sequence number (on-chain proof)
  tamam_tx_ref        VARCHAR(128)            -- Tamam Custody reference
  payment_request_id  UUID NULL               -- links to payment request if applicable
  created_at          TIMESTAMPTZ DEFAULT NOW()
  completed_at        TIMESTAMPTZ
```

**Indexes**: `(user_id, created_at DESC)`, `(organization_id, created_at DESC)`, `(hedera_tx_id)`, `(status)`

---

## Success Metrics

| Metric | Target | Type |
|--------|--------|------|
| Business accounts that invite ≥1 team member | >30% of business signups | Leading |
| Payment requests sent per business per week | >3 avg | Leading |
| Payment request conversion (sent → paid) | >50% | Leading |
| Transaction history page views per user/week | >2 avg | Lagging |
| Business accounts retained after 7 days | >60% | Lagging |

*Note: For hackathon judging, demo-able metrics matter more. Focus on showing the full flow working end-to-end.*

---

## Open Questions

| # | Question | Owner |
|---|----------|-------|
| 1 | Should org conversations be E2E encrypted the same way? If org has 5 members, each needs the symmetric key — key distribution becomes more complex. | Engineering |
| 2 | For hackathon demo, do we need real email invitations or is in-app invite + accept sufficient? | Product |
| 3 | Transaction history: should we index from HCS (source of truth) or from Tamam Custody webhooks? HCS has the conversation context, Tamam has the settlement status. | Engineering |
| 4 | Verified badge tiers — is "Certified" (gold) worth speccing now or defer entirely? | Product |
| 5 | Payment request expiry — should expired requests auto-cancel the HCS message or just update status? | Engineering |

---

## Timeline Considerations

- **Hard deadline**: March 23, 2026 (hackathon submission)
- **11 days remaining** from today
- **Dependencies**: Requires Phase 1 (Identity/KYB) and Phase 4 (Payments) to be functional
- **Phasing suggestion**:
  - **Days 1-3**: Organization model + RBAC (DB, API, guards)
  - **Days 4-5**: Verified badges + org profile UI
  - **Days 6-8**: Payment requests (HCS messages, chat UI card, pay flow)
  - **Days 9-10**: Transaction history (DB, API, UI)
  - **Day 11**: Polish, demo flow, edge cases

---

## Appendix: Impact on Existing Features

| Existing Feature | Change Required |
|-----------------|-----------------|
| User registration | After KYB: auto-create organization |
| Messaging | Support "send as org" context, show org badge in chat header |
| Payments (FR-PAY-001) | Add `payment_request_id` linkage, write to `transactions` table |
| Split payments | Payment requests as precursor to split flow |
| Business profiles | Migrate to `organizations` table, deprecate `business_profiles` |
| Broadcast topics | Scope to org (currently on user), support multi-member posting |
| WebSocket gateway | Org context awareness — route org messages to all online org members |
| DID NFT metadata | Add org reference in `businessProperties` |
