# P1-T31: Enhanced Payment Requests

| Field | Value |
|-------|-------|
| Task ID | P1-T31 |
| Phase | Phase 7: Business Features |
| Priority | P1 |
| Estimated Time | 6 hours |
| Depends On | P0-T21 (Payment Service), P0-T14 (Conversations), P0-T22 (Payment UI) |
| Spec References | docs/SPECIFICATION.md: FR-PAY-002, US-020, DM-PAY-002, DM-PAY-004 |
| PRD Reference | docs/PRD-BUSINESS-FEATURES.md: Feature 4 (Payment Requests) |

---

## Objective

Implement structured payment requests that render as interactive cards in chat — amount, description, "Pay" button, expiry countdown. Both individual and business users can send payment requests. Status lifecycle tracked on HCS for immutable audit.

---

## Background

FR-PAY-002 already defines payment requests as HCS messages. This task enhances it with: a dedicated `payment_requests` DB table for queryable status, structured request/status-update HCS message types, expiry handling, decline option, and a rich UI card component in chat.

---

## Prerequisites

- [ ] Payment service functional (P0-T21)
- [ ] Conversations functional with HCS topics (P0-T14)
- [ ] Payment UI exists in chat (P0-T22)
- [ ] WebSocket gateway operational (P0-T16)

---

## Step-by-Step Implementation

### Step 1: Database Migration (30 min)

Create `payment_requests` table as specified in docs/SPECIFICATION.md Section 4.2:
- `id`, `requester_user_id`, `organization_id` (nullable), `conversation_id`, `hcs_topic_id`, `hcs_sequence_number`
- `amount`, `currency`, `description`, `status`, `paid_tx_id`, `paid_at`, `expires_at`, `created_at`
- Indexes on requester, status, conversation

Create TypeORM entity `PaymentRequestEntity`.

### Step 2: Payment Request Creation (1 hour)

Enhance `PaymentService`:

1. **Create payment request**:
   - Generate unique requestId (UUID)
   - Default expiry: 7 days from creation (configurable)
   - Construct HCS message payload (DM-PAY-002 format):
     ```json
     {
       "v": "1.0",
       "type": "payment_request",
       "sender": "0.0.REQUESTER",
       "content": {
         "action": "request",
         "amount": 50.00,
         "currency": "HBAR",
         "note": "Invoice #1234",
         "requestId": "uuid",
         "status": "pending",
         "expiresAt": "ISO8601",
         "paidTxHash": null
       }
     }
     ```
   - Submit to HCS (conversation topic, encrypted)
   - Store in `payment_requests` table
   - If org context: set `organization_id`, request shows org identity

2. **API endpoint: POST `/api/v1/payments/request`**:
   - Input: `topicId`, `amount`, `currency`, `description`, `expiresAt` (optional)
   - Validate: user is a conversation member, amount > 0
   - Org context: validate role (Owner/Admin/Member can create requests)
   - Response: `{ requestId, status, hcsSequenceNumber, expiresAt }`

### Step 3: Payment Request Fulfillment (1.5 hours)

When recipient pays a payment request:

1. Enhance FR-PAY-001 flow to accept optional `paymentRequestId` parameter
2. After successful HTS transfer:
   - Update `payment_requests.status` to `paid`
   - Set `paid_tx_id` and `paid_at`
   - Submit status update HCS message (DM-PAY-004 format):
     ```json
     {
       "v": "1.0",
       "type": "payment_request_update",
       "requestId": "uuid",
       "status": "paid",
       "paidTxId": "0.0.XXX@...",
       "paidAt": "ISO8601",
       "updatedBy": "0.0.PAYER"
     }
     ```
   - Record in `transactions` table (linked via `payment_request_id`)
3. Broadcast status update via WebSocket to conversation participants

### Step 4: Expiry & Decline Handling (30 min)

1. **Expiry**: On query, check if `expires_at < NOW()` and `status = 'pending'`:
   - Mark as `expired` in DB
   - Optionally submit expiry HCS message (or handle silently — see PRD open question #5)
2. **Decline**: API endpoint `POST /api/v1/payments/request/:requestId/decline`:
   - Set status to `declined`
   - Submit decline HCS message
   - Notify requester via WebSocket

### Step 5: PaymentRequestCard React Component (1.5 hours)

Create `apps/web/src/components/PaymentRequestCard.tsx`:

- Props: `request: PaymentRequestData` (requestId, amount, currency, description, status, expiresAt, paidTxId)
- States:
  - **Pending**: Shows amount, description, "Pay" button (for recipient), expiry countdown timer
  - **Paid**: Green background, checkmark, "Paid" label, transaction ID link to HashScan
  - **Expired**: Gray background, "Expired" label, no action available
  - **Declined**: Red/gray background, "Declined" label
- "Pay" button click: opens pre-filled payment confirmation modal (amount, currency from request)
- Expiry countdown: live timer showing "Expires in 6d 23h" etc.
- If sent from org context: shows org name + verified badge on the card

### Step 6: Chat Integration (30 min)

Update chat message renderer:
- Detect `payment_request` message type
- Render `<PaymentRequestCard />` instead of plain text
- Detect `payment_request_update` message type → update existing card in-place
- WebSocket handler: listen for `payment_request_update` events, update card state

---

## Validation Checklist

- [ ] Payment request creates HCS message and DB record
- [ ] Payment request renders as card in chat with amount, description, Pay button
- [ ] Recipient can pay via Pay button → triggers FR-PAY-001 flow
- [ ] After payment: card updates to "Paid" with transaction link
- [ ] Status update submitted to HCS (DM-PAY-004 format)
- [ ] Expired requests show "Expired" status and Pay button is disabled
- [ ] Decline flow works and submits HCS message
- [ ] Org context: request shows org identity
- [ ] Expiry countdown timer works in real-time
- [ ] WebSocket broadcasts status updates to all conversation participants
- [ ] `pnpm lint` passes
- [ ] `pnpm tsc --noEmit` passes
- [ ] No `any` types, no `console.log`, no mocking
