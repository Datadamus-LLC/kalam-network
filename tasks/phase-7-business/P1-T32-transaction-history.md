# P1-T32: Transaction History & Tracking

| Field | Value |
|-------|-------|
| Task ID | P1-T32 |
| Phase | Phase 7: Business Features |
| Priority | P1 |
| Estimated Time | 6 hours |
| Depends On | P0-T21 (Payment Service), P1-T29 (Organization), P1-T31 (Payment Requests) |
| Spec References | docs/SPECIFICATION.md: FR-PAY-004, US-021, US-022 |
| PRD Reference | docs/PRD-BUSINESS-FEATURES.md: Feature 5 (Transaction History & Tracking) |

---

## Objective

Implement a comprehensive transaction history for both personal and org-level views. All payments (send, receive, request fulfillment, split) are indexed in the `transactions` table. Users can filter by date range, direction, status, and counterparty. Each transaction links to on-chain proof via HashScan.

---

## Background

Currently, `payments_index` tracks basic payment data. This task creates a richer `transactions` table that supports org context, payment request linkage, and full metadata for a user-facing transaction dashboard. The source of truth remains on Hedera (HTS transfers + HCS receipts); the platform DB is an index/cache.

---

## Prerequisites

- [ ] Payment service functional and processes real HTS transfers (P0-T21)
- [ ] Organization model functional for org-level aggregation (P1-T29)
- [ ] Payment requests functional for request linkage (P1-T31)
- [ ] Next.js app with routing (P0-T07, P0-T13)

---

## Step-by-Step Implementation

### Step 1: Database Migration (30 min)

Create `transactions` table as specified in docs/SPECIFICATION.md Section 4.2:
- `id`, `user_id`, `organization_id` (nullable), `counterparty_id`, `conversation_id`
- `direction` (sent/received), `amount`, `currency`, `status`, `description`
- `hedera_tx_id`, `hcs_message_seq`, `tamam_tx_ref`, `payment_request_id`, `payment_type`
- `created_at`, `completed_at`
- Indexes on: `(user_id, created_at DESC)`, `(organization_id, created_at DESC)`, `(hedera_tx_id)`, `(status)`, `(counterparty_id, created_at DESC)`

Create TypeORM entity `TransactionEntity`.

### Step 2: Transaction Recording Service (1.5 hours)

Create `TransactionService`:

1. **Record transaction**: Called after every successful payment:
   - Create TWO records: one for sender (direction: 'sent'), one for recipient (direction: 'received')
   - Include: Hedera tx ID, HCS sequence number, Tamam Custody reference
   - If from payment request: link via `payment_request_id`
   - If org context: set `organization_id`
   - Set `payment_type`: 'send', 'request_fulfillment', 'split_payment'

2. Hook into existing payment flows:
   - FR-PAY-001 (Send Money): after HTS transfer confirmed, call `transactionService.record()`
   - FR-PAY-002 (Request fulfillment): link to payment request
   - FR-PAY-003 (Split payment): record each individual payment in the split

3. Status management:
   - `pending` → `completed` (on HTS confirmation) or `failed` (on error)
   - Set `completed_at` timestamp on completion

### Step 3: Transaction Query API (1.5 hours)

Implement API endpoints:

1. **GET `/api/v1/transactions`**:
   - Pagination: cursor-based using `created_at` timestamp
   - Filters via query params:
     - `direction`: 'sent' | 'received' | 'all' (default: 'all')
     - `status`: 'completed' | 'pending' | 'failed' (default: all)
     - `from` / `to`: date range (ISO8601)
     - `search`: counterparty name or Hedera tx ID
   - Org context: if `X-Org-Context` header present, query by `organization_id` instead of `user_id`
   - Org context aggregation: includes all members' transactions made as the org
   - Response: paginated array with counterparty profile data (name, avatar)

2. **GET `/api/v1/transactions/:id`**:
   - Full transaction detail with on-chain proof links
   - Include `onChainProof` object:
     ```json
     {
       "hcsExplorerUrl": "https://hashscan.io/testnet/topic/{topicId}/message/{seq}",
       "htsExplorerUrl": "https://hashscan.io/testnet/transaction/{txId}"
     }
     ```

### Step 4: Transaction History Frontend (1.5 hours)

Create `apps/web/src/app/transactions/page.tsx`:

1. **Transaction list view**:
   - Filter bar: date range picker, direction toggle (sent/received/all), status dropdown
   - Search input: counterparty name or transaction ID
   - Transaction rows:
     - Left: counterparty avatar + name
     - Center: description, payment type badge
     - Right: amount (green for received, red for sent), status badge
     - Date/time below
   - Infinite scroll pagination
   - Empty state: "No transactions yet"

2. **Transaction detail modal/page**:
   - Full metadata display
   - "View on HashScan" button (links to HCS message and HTS transfer)
   - Conversation link: "Go to conversation" button
   - Payment request link (if applicable)

3. **Context switching**:
   - When in org context (from context switcher): show org transaction history
   - Toggle between personal and org views
   - Org view: optionally filter by team member who initiated

4. **Navigation**: Add "Transactions" item to main sidebar/bottom nav

### Step 5: Integration with Existing Payment UI (30 min)

- After a payment is sent in chat, the transaction detail should be queryable immediately
- Payment receipt message in chat can link to the transaction detail page
- Wallet page: add "View All Transactions" link

---

## Validation Checklist

- [ ] Transaction recorded for both sender and recipient on every payment
- [ ] Transaction includes Hedera tx ID, HCS sequence, Tamam reference
- [ ] Payment request linkage works (transaction → payment request)
- [ ] Org context: transactions recorded with organization_id
- [ ] GET /api/v1/transactions returns paginated results with correct filters
- [ ] Date range filter works correctly
- [ ] Direction filter (sent/received/all) works
- [ ] Status filter (completed/pending/failed) works
- [ ] Counterparty search works
- [ ] Transaction detail includes on-chain proof links (HashScan URLs)
- [ ] Org transaction history aggregates across all org members
- [ ] Frontend list view renders correctly with filters
- [ ] Detail view shows full metadata + HashScan links
- [ ] Navigation item added to main nav
- [ ] `pnpm lint` passes
- [ ] `pnpm tsc --noEmit` passes
- [ ] No `any` types, no `console.log`, no mocking
