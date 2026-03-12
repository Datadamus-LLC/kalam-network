# Tamam MPC Custody Integration Reference

**Status**: VERIFIED (from olara-mobile-app OpenAPI spec, authentication docs, security docs, onboarding guide, transaction signing guide, error handling)

**Date**: 2026-03-11

Comprehensive integration reference for Tamam MPC Custody service. This service provides institutional-grade digital asset custody using Multi-Party Computation (MPC) with FROST threshold signing, supporting Hedera natively alongside Ethereum, Polygon, and other blockchains.

---

## Service Overview

### What Tamam Does
Tamam is an MPC-based custody platform that manages private keys across 9 signer nodes with configurable thresholds (2-of-3 up to 8-of-9). It enables institutional-grade key management and transaction signing without centralizing key material.

### Hedera Integration
- Tamam creates and manages MPC-backed Hedera accounts
- Can auto-create a Hedera account when generating an MPC key: `{ createHederaAccount: true }`
- Supports HBAR transfers and HTS token transfers
- Audit logs are written to Hedera Consensus Service (HCS) for immutable record-keeping
- Each transaction is signed using FROST MPC threshold signing

### Key Characteristics
- **9 Signer Nodes**: Key shares distributed across independent nodes
- **Configurable Thresholds**: 2-of-3 minimum, up to 8-of-9 maximum (typical: 5-of-9)
- **MPC Implementation**: FROST (Flexible Round-Optimized Schnorr Threshold) signature scheme
- **Key Storage**: GCP Cloud KMS (FIPS 140-2 Level 3 certified)
- **Node Communication**: mTLS with certificate pinning
- **Staging URL**: `https://tamam-backend-staging-776426377628.us-central1.run.app`
- **Audit Trail**: All transactions logged to Hedera HCS for regulatory compliance

---

## Authentication Methods

### Method 1: API Key Authentication (Service Account)

Used for automated integrations and backend services.

**Format**: `olara_{prefix}{secret}`

**Header**: `X-API-Key: olara_xxx...`

**Example**:
```typescript
const apiKey = process.env.TAMAM_CUSTODY_API_KEY; // olara_sv_... or olara_live_...
const headers = {
  'X-API-Key': apiKey,
  'Content-Type': 'application/json',
};
```

**Scopes** (assigned per service account):
- `read` — Query operations only
- `write` — Transaction creation and approval
- `admin` — Organizational management, key management

**Best Practices**:
- Store in secrets manager (not env file)
- Rotate every 90 days
- Use IP allowlists for additional security
- One key per environment (dev, staging, prod)

### Method 2: JWT (Portal Sessions)

Used for interactive portal access, not for backend integrations.

**Token Expiry**: 15 minutes

**Refresh**: Use refresh token to obtain new access token

**Format**:
```typescript
const bearerToken = `Bearer ${jwtToken}`;
```

**Do Not Use For**: Backend service-to-service calls (use API key instead)

---

## Request Signing (Sensitive Operations)

Certain operations require HMAC-SHA256 request signature verification:
- Freeze/unfreeze MPC keys
- Reshare keys
- Delete service accounts

### Canonical Request Format

```
CANONICAL = METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + BODY_HASH
```

Where:
- `METHOD` = HTTP method (GET, POST, etc.)
- `PATH` = URL path with query string (e.g., `/api/custody/mpc/keys/key-123/freeze`)
- `TIMESTAMP` = `X-Request-Timestamp` header value (ISO 8601)
- `BODY_HASH` = SHA256(request body).hex() or "" for GET

### Signature Generation

```typescript
import crypto from 'crypto';

const signingSecret = process.env.TAMAM_CUSTODY_SIGNING_SECRET; // From onboarding

const canonical = [
  'POST',
  '/api/custody/mpc/keys/key-123/freeze',
  '2026-03-11T10:30:00Z',
  crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex'),
].join('\n');

const signature = crypto
  .createHmac('sha256', signingSecret)
  .update(canonical)
  .digest('base64');

const headers = {
  'X-API-Key': apiKey,
  'X-Request-Timestamp': '2026-03-11T10:30:00Z',
  'X-Request-Signature': signature,
};
```

### Signature Verification (Webhooks)

When receiving webhook events, verify the signature:

```typescript
import crypto from 'crypto';
import assert from 'assert';

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  webhookSecret: string,
): boolean {
  const computed = crypto
    .createHmac('sha256', webhookSecret)
    .update(payload)
    .digest('base64');

  // Use timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(computed),
  );
}
```

---

## API Endpoints

### Health Checks

#### GET `/api/custody/health`
System health status (no authentication required).

**Response**:
```typescript
interface HealthResponse {
  success: true;
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string; // ISO 8601
  nodes: {
    healthy: number;
    total: number;
  };
}
```

#### GET `/api/custody/health/nodes`
Individual node status and latency.

**Response**:
```typescript
interface NodesHealthResponse {
  success: true;
  nodes: {
    id: string;
    status: 'healthy' | 'unhealthy';
    latency_ms: number;
    last_heartbeat: string; // ISO 8601
  }[];
}
```

---

### Onboarding (Guided Setup)

#### POST `/api/custody/onboard`

One-call setup: creates organization, vault, service account, and API key.

**Requires**: No authentication (initial setup)

**Request Body**:
```typescript
interface OnboardingRequest {
  orgName: string;
  vaultName: string;
  serviceAccountName: string;
  adminEmail: string;
  scopes?: ('read' | 'write' | 'admin')[];
}
```

**Response** (⚠️ shown only once, must be stored immediately):
```typescript
interface OnboardingResponse {
  success: true;
  organization: {
    id: string;
    name: string;
    createdAt: string; // ISO 8601
  };
  vault: {
    id: string;
    name: string;
    type: 'GENERAL';
    organization_id: string;
  };
  serviceAccount: {
    id: string;
    name: string;
    apiKey: string; // olara_xxx... — SAVE THIS NOW
    signingSecret: string; // For request signing — SAVE THIS NOW
    scopes: string[];
    createdAt: string;
  };
  webhookSecret?: string; // If webhooks enabled
}
```

**Important**:
- The API key and signing secret are shown **only once**
- Store them immediately in a secrets manager
- Cannot be retrieved later
- If lost, use the `rotate` endpoint to create a new key (grace period: 24h)

---

### Organizations

#### GET `/api/organizations/{orgId}`

Get organization details and settings.

**Auth**: API Key with `read` scope

**Response**:
```typescript
interface Organization {
  id: string;
  name: string;
  admin_email: string;
  created_at: string; // ISO 8601
  updated_at: string;
  settings: {
    webhook_enabled: boolean;
    webhook_url?: string;
    mfa_required: boolean;
    ip_allowlist?: string[];
  };
}
```

---

### Vaults

#### GET `/api/organizations/{orgId}/vaults`

List all vaults in the organization.

**Auth**: API Key with `read` scope

**Query Parameters**:
- `limit?` (default: 50) — items per page
- `offset?` (default: 0) — pagination offset

**Response**:
```typescript
interface VaultsListResponse {
  success: true;
  vaults: Vault[];
  total: number;
  limit: number;
  offset: number;
}

interface Vault {
  id: string;
  name: string;
  type: 'GENERAL' | 'TREASURY' | 'COLD_STORAGE' | 'TRADING' | 'OMNIBUS';
  organization_id: string;
  description?: string;
  created_at: string; // ISO 8601
  updated_at: string;
  balance?: {
    hbar: string; // decimal string
    tokens: Record<string, string>; // token_id → balance
  };
}
```

#### POST `/api/organizations/{orgId}/vaults`

Create a new vault.

**Auth**: API Key with `write` scope

**Request Body**:
```typescript
interface CreateVaultRequest {
  name: string;
  type: 'GENERAL' | 'TREASURY' | 'COLD_STORAGE' | 'TRADING' | 'OMNIBUS';
  description?: string;
}
```

**Response**:
```typescript
interface CreateVaultResponse {
  success: true;
  vault: Vault;
}
```

---

### MPC Keys

#### POST `/api/custody/mpc/keys`

Create a new MPC key and optionally a Hedera account.

**Auth**: API Key with `write` scope

**Request Body**:
```typescript
interface CreateMPCKeyRequest {
  vaultId: string;
  keyType: 'ED25519' | 'ECDSA_SECP256K1';
  threshold: number; // e.g., 5
  totalShares: number; // e.g., 9
  createHederaAccount?: boolean; // Create account auto-assigned to this key
  description?: string;
}
```

**Response**:
```typescript
interface CreateMPCKeyResponse {
  success: true;
  key: {
    id: string;
    vault_id: string;
    key_type: 'ED25519' | 'ECDSA_SECP256K1';
    public_key: string; // hex format
    heder_account_id?: string; // 0.0.xxxxx format (if createHederaAccount=true)
    threshold: number;
    total_shares: number;
    status: 'ACTIVE';
    created_at: string; // ISO 8601
  };
  dkg_ceremony?: {
    id: string;
    status: 'in_progress' | 'completed' | 'failed';
  };
}
```

**Important**:
- DKG (Distributed Key Generation) runs asynchronously
- Check ceremony status via polling
- Key is usable once DKG completes
- If `createHederaAccount=true`, a new Hedera account (0.0.xxxx) is created and funded with 100 HBAR

#### GET `/api/custody/mpc/keys/{keyId}`

Get key details, including public key and status.

**Auth**: API Key with `read` scope

**Response**:
```typescript
interface MPCKey {
  id: string;
  vault_id: string;
  key_type: 'ED25519' | 'ECDSA_SECP256K1';
  public_key: string; // hex
  hedera_account_id?: string; // 0.0.xxxxx if created with createHederaAccount
  threshold: number;
  total_shares: number;
  status: 'ACTIVE' | 'FROZEN' | 'RESHARING';
  created_at: string; // ISO 8601
  last_used: string; // ISO 8601 or null
}
```

#### POST `/api/custody/mpc/keys/{keyId}/freeze`

Freeze key to prevent any signing operations (requires signature).

**Auth**: API Key with `write` scope + request signature

**Request Body**:
```typescript
interface FreezeKeyRequest {
  reason?: string; // e.g., "Suspected compromise"
}
```

**Response**:
```typescript
interface FreezeKeyResponse {
  success: true;
  key: {
    id: string;
    status: 'FROZEN';
    frozen_at: string; // ISO 8601
  };
}
```

#### POST `/api/custody/mpc/keys/{keyId}/unfreeze`

Unfreeze key to re-enable signing (requires signature).

**Auth**: API Key with `admin` scope + request signature

**Request Body**:
```typescript
interface UnfreezeKeyRequest {
  reason?: string;
}
```

**Response**:
```typescript
interface UnfreezeKeyResponse {
  success: true;
  key: {
    id: string;
    status: 'ACTIVE';
    unfrozen_at: string; // ISO 8601
  };
}
```

---

### Transactions

#### POST `/api/custody/transactions`

Create a new transaction for signing and broadcasting.

**Auth**: API Key with `write` scope

**Headers**:
- `X-Idempotency-Key` (strongly recommended) — UUID to prevent duplicates

**Request Body**:
```typescript
interface CreateTransactionRequest {
  vaultId: string;
  type: 'TRANSFER' | 'TOKEN_TRANSFER' | 'STAKING';
  chain: 'HEDERA' | 'ETHEREUM' | 'POLYGON';
  amount: string; // decimal string, e.g., "100.50"
  assetSymbol: string; // e.g., "HBAR", "USDC"
  destinationAddress: string; // Hedera account ID (0.0.xxx) or ETH address
  memo?: string; // Transaction memo
  metadata?: Record<string, unknown>; // Custom metadata
}
```

**Response**:
```typescript
interface CreateTransactionResponse {
  success: true;
  transaction: {
    id: string;
    vault_id: string;
    type: 'TRANSFER' | 'TOKEN_TRANSFER' | 'STAKING';
    chain: 'HEDERA' | 'ETHEREUM' | 'POLYGON';
    status: 'PENDING_POLICY';
    amount: string;
    asset_symbol: string;
    destination: string;
    created_at: string; // ISO 8601
    updated_at: string;
    policy_checks?: {
      daily_limit: { passed: boolean; remaining: string };
      counterparty_risk: { passed: boolean };
    };
  };
}
```

**Transaction Status Flow**:
```
PENDING_POLICY
  ↓
PENDING_APPROVAL (awaiting approver confirmation)
  ↓
APPROVED
  ↓
PENDING_SIGNING (MPC signing in progress)
  ↓
SIGNING (nodes coordinating threshold signature)
  ↓
SIGNED (transaction signed)
  ↓
BROADCASTING (submitted to Hedera/blockchain)
  ↓
PENDING_CONFIRMATION (awaiting blockchain confirmation)
  ↓
CONFIRMED
  ↓
COMPLETED
```

Failure states: `FAILED`, `REJECTED`, `EXPIRED`

#### GET `/api/custody/transactions`

List transactions with filtering.

**Auth**: API Key with `read` scope

**Query Parameters**:
- `vaultId?` — filter by vault
- `status?` — filter by status
- `limit?` (default: 50)
- `offset?` (default: 0)
- `startDate?` — ISO 8601 date
- `endDate?` — ISO 8601 date

**Response**:
```typescript
interface TransactionsListResponse {
  success: true;
  transactions: Transaction[];
  total: number;
  limit: number;
  offset: number;
}

interface Transaction {
  id: string;
  vault_id: string;
  type: 'TRANSFER' | 'TOKEN_TRANSFER' | 'STAKING';
  chain: 'HEDERA' | 'ETHEREUM' | 'POLYGON';
  status:
    | 'PENDING_POLICY'
    | 'PENDING_APPROVAL'
    | 'APPROVED'
    | 'PENDING_SIGNING'
    | 'SIGNING'
    | 'SIGNED'
    | 'BROADCASTING'
    | 'PENDING_CONFIRMATION'
    | 'CONFIRMED'
    | 'COMPLETED'
    | 'FAILED'
    | 'REJECTED'
    | 'EXPIRED';
  amount: string;
  asset_symbol: string;
  destination: string;
  memo?: string;
  hedera_transaction_id?: string; // 0.0.xxx@timestamp
  blockchain_hash?: string; // tx hash (once confirmed)
  created_at: string; // ISO 8601
  updated_at: string;
  completed_at?: string; // ISO 8601 (when moved to COMPLETED)
  error?: {
    code: string;
    message: string;
  };
}
```

#### GET `/api/custody/transactions/{txId}`

Get detailed transaction information.

**Auth**: API Key with `read` scope

**Response**:
```typescript
interface TransactionDetailResponse {
  success: true;
  transaction: Transaction & {
    approvals: {
      approved_by: string; // user/service account ID
      approved_at: string; // ISO 8601
      reason?: string;
    }[];
    signing_progress?: {
      threshold: number;
      current_signatures: number;
      status: 'not_started' | 'in_progress' | 'completed';
    };
  };
}
```

#### POST `/api/custody/transactions/{txId}/approve`

Approve or reject a pending transaction.

**Auth**: API Key with `write` scope

**Request Body**:
```typescript
interface ApproveTransactionRequest {
  decision: 'APPROVED' | 'REJECTED';
  reason?: string; // Required for rejections
}
```

**Response**:
```typescript
interface ApproveTransactionResponse {
  success: true;
  transaction: Transaction & {
    status: 'APPROVED' | 'REJECTED';
  };
}
```

#### POST `/api/custody/transactions/{txId}/retry`

Retry a failed transaction.

**Auth**: API Key with `write` scope

**Request Body**:
```typescript
interface RetryTransactionRequest {
  reason?: string; // e.g., "Network issue resolved"
}
```

**Response**:
```typescript
interface RetryTransactionResponse {
  success: true;
  transaction: Transaction & {
    status: 'PENDING_SIGNING';
  };
}
```

#### POST `/api/custody/mpc/sign`

Manually trigger signing for a transaction (usually triggered automatically).

**Auth**: API Key with `write` scope

**Request Body**:
```typescript
interface ManualSignRequest {
  transactionId: string;
}
```

**Response**:
```typescript
interface ManualSignResponse {
  success: true;
  transaction: Transaction & {
    status: 'SIGNING' | 'SIGNED';
  };
}
```

---

### Service Accounts (API Keys)

#### GET `/api/organizations/{orgId}/service-accounts`

List all service accounts (API keys).

**Auth**: API Key with `admin` scope

**Response**:
```typescript
interface ServiceAccountsListResponse {
  success: true;
  accounts: ServiceAccount[];
}

interface ServiceAccount {
  id: string;
  name: string;
  scopes: ('read' | 'write' | 'admin')[];
  allowed_vault_ids?: string[]; // null = all vaults
  ip_allowlist?: string[];
  created_at: string; // ISO 8601
  last_used: string | null; // ISO 8601
}
```

#### POST `/api/organizations/{orgId}/service-accounts`

Create a new service account (API key).

**Auth**: API Key with `admin` scope

**Request Body**:
```typescript
interface CreateServiceAccountRequest {
  name: string;
  scopes: ('read' | 'write' | 'admin')[];
  allowedVaultIds?: string[]; // null = all vaults
  ipAllowlist?: string[]; // e.g., ["203.0.113.0/24"]
}
```

**Response** (API key shown only once):
```typescript
interface CreateServiceAccountResponse {
  success: true;
  account: ServiceAccount & {
    apiKey: string; // olara_xxx... — SAVE THIS NOW
    signingSecret: string; // For request signing — SAVE THIS NOW
  };
}
```

#### POST `/api/organizations/{orgId}/service-accounts/{accountId}/rotate`

Rotate API key with grace period.

**Auth**: API Key with `admin` scope

**Request Body**:
```typescript
interface RotateKeyRequest {
  gracePeriodHours?: number; // default: 24
}
```

**Response**:
```typescript
interface RotateKeyResponse {
  success: true;
  newApiKey: string; // New key to use
  oldApiKey: string; // Old key (still works during grace period)
  gracePeriodUntil: string; // ISO 8601
  signingSecret: string; // Updated signing secret
}
```

#### DELETE `/api/organizations/{orgId}/service-accounts/{accountId}`

Revoke an API key immediately.

**Auth**: API Key with `admin` scope

**Response**:
```typescript
interface RevokeKeyResponse {
  success: true;
  account: {
    id: string;
    status: 'revoked';
    revoked_at: string; // ISO 8601
  };
}
```

---

### Compliance & Reporting

#### GET `/api/custody/compliance/summary`

Get activity summary for audit and compliance.

**Auth**: API Key with `read` scope

**Query Parameters**:
- `startDate` — ISO 8601 date (required)
- `endDate` — ISO 8601 date (required)

**Response**:
```typescript
interface ComplianceSummaryResponse {
  success: true;
  summary: {
    period: {
      startDate: string;
      endDate: string;
    };
    transactions: {
      total: number;
      completed: number;
      failed: number;
      total_value: string; // decimal
    };
    keys: {
      created: number;
      frozen: number;
    };
    approvals: {
      total: number;
      approved: number;
      rejected: number;
    };
  };
}
```

#### POST `/api/custody/compliance/export`

Export compliance report in multiple formats.

**Auth**: API Key with `read` scope

**Request Body**:
```typescript
interface ComplianceExportRequest {
  format: 'json' | 'csv' | 'pdf' | 'CBB_SANDBOX' | 'VARA_VIRTUAL' | 'SEC_17A4';
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
  filters?: {
    vaultIds?: string[];
    transactionTypes?: string[];
  };
}
```

**Response**: File download (json, csv, pdf) or structured report (regulatory formats)

---

### Webhooks

#### Event Types

- `transaction.created` — New transaction created
- `transaction.approved` — Transaction approved
- `transaction.executed` — Transaction signed and submitted
- `transaction.completed` — Transaction confirmed on-chain
- `transaction.failed` — Transaction failed
- `key.frozen` — Key was frozen
- `key.unfrozen` — Key was unfrozen

#### Webhook Payload Format

```typescript
interface WebhookEvent {
  id: string; // Event ID
  type: string; // e.g., "transaction.completed"
  timestamp: string; // ISO 8601
  data: Record<string, unknown>; // Event-specific data
}
```

**Signature Header**: `x-olara-signature` — Base64(HMAC-SHA256(webhook secret, payload))

**Verification Example**:
```typescript
import crypto from 'crypto';

export function handleWebhook(
  payload: string,
  signature: string,
  webhookSecret: string,
): void {
  const computed = crypto
    .createHmac('sha256', webhookSecret)
    .update(payload)
    .digest('base64');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computed))) {
    throw new Error('Invalid webhook signature');
  }

  const event = JSON.parse(payload) as WebhookEvent;
  // Handle event
}
```

**Webhook Registration**: Contact support or use onboarding response `webhookSecret`

---

## Error Handling

### Error Response Format

All error responses follow this structure:

```typescript
interface ErrorResponse {
  success: false;
  error: string; // User-friendly message
  code: string; // Machine-readable code
  details?: Record<string, unknown>; // Additional context
  timestamp: string; // ISO 8601
}
```

### HTTP Status Codes

| Code | Meaning | Retryable |
|------|---------|-----------|
| 400 | Bad Request | No |
| 401 | Unauthorized (invalid API key) | No |
| 403 | Forbidden (insufficient permissions) | No |
| 404 | Not Found | No |
| 409 | Conflict (idempotency key, already exists) | No |
| 429 | Rate Limited | **Yes** (backoff 60s) |
| 500 | Internal Server Error | **Yes** (backoff 30s) |
| 503 | Service Unavailable | **Yes** (backoff 60s) |

### Common Error Codes

```typescript
enum ErrorCode {
  // Auth errors
  INVALID_API_KEY = 'INVALID_API_KEY',
  EXPIRED_TOKEN = 'EXPIRED_TOKEN',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',

  // Validation errors
  INVALID_REQUEST = 'INVALID_REQUEST',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_VAULT_ID = 'INVALID_VAULT_ID',
  INVALID_KEY_ID = 'INVALID_KEY_ID',

  // Business logic errors
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  POLICY_DENIED = 'POLICY_DENIED',
  KEY_FROZEN = 'KEY_FROZEN',
  KEY_NOT_READY = 'KEY_NOT_READY', // DKG not completed
  TRANSACTION_ALREADY_SIGNED = 'TRANSACTION_ALREADY_SIGNED',
  COUNTERPARTY_RISK_EXCEEDED = 'COUNTERPARTY_RISK_EXCEEDED',

  // Signing/broadcast errors
  SIGNING_FAILED = 'SIGNING_FAILED',
  BROADCAST_FAILED = 'BROADCAST_FAILED',
  CONSENSUS_TIMEOUT = 'CONSENSUS_TIMEOUT', // DKG ceremony timed out

  // Rate limiting and system
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}
```

### Retryable Errors

```typescript
const RETRYABLE_CODES = [
  'RATE_LIMIT_EXCEEDED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
  'SIGNING_FAILED', // May succeed on retry
  'BROADCAST_FAILED', // May succeed on retry
  'CONSENSUS_TIMEOUT',
];

const BACKOFF = {
  RATE_LIMIT_EXCEEDED: 60_000, // 60 seconds
  SERVICE_UNAVAILABLE: 60_000,
  INTERNAL_ERROR: 30_000, // 30 seconds
};
```

---

## Rate Limiting

All endpoints are rate-limited.

**Limits**:
- 60 requests per minute
- 1,000 requests per hour
- Burst: 100 concurrent requests

**Response Headers**:
- `X-RateLimit-Limit` — total requests per period
- `X-RateLimit-Remaining` — requests left in period
- `X-RateLimit-Reset` — UNIX timestamp when limit resets

**Handling Rate Limits**:
```typescript
if (response.status === 429) {
  const resetTime = parseInt(
    response.headers.get('X-RateLimit-Reset') || '0',
  );
  const delayMs = (resetTime * 1000) - Date.now();
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  // Retry request
}
```

---

## Integration Pattern for Hedera Social Platform

### 1. Platform Setup (One-Time)

```typescript
// Call onboarding endpoint to create organization + vault + API key
const onboardResponse = await fetch(
  'https://tamam-backend-staging-776426377628.us-central1.run.app/api/custody/onboard',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orgName: 'Hedera Social Platform',
      vaultName: 'User Assets',
      serviceAccountName: 'hedera-social-service',
      adminEmail: 'admin@hedera-social.example.com',
      scopes: ['read', 'write'],
    }),
  },
);

const { apiKey, signingSecret } = await onboardResponse.json();

// Store in secrets manager
process.env.TAMAM_CUSTODY_API_KEY = apiKey;
process.env.TAMAM_CUSTODY_SIGNING_SECRET = signingSecret;
```

### 2. User Wallet Creation

When a user registers:

```typescript
// Create MPC key for user, auto-assign Hedera account
const response = await fetch(
  'https://tamam-backend-staging-776426377628.us-central1.run.app/api/custody/mpc/keys',
  {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      vaultId: vaultId,
      keyType: 'ED25519', // Hedera uses ED25519
      threshold: 5,
      totalShares: 9,
      createHederaAccount: true, // Auto-create Hedera account
    }),
  },
);

const { key } = await response.json();
const hederaAccountId = key.heder_account_id; // 0.0.xxxxx

// Store mapping: userId → hederaAccountId
await db.users.update(userId, {
  hederaAccountId,
  mpcKeyId: key.id,
});
```

### 3. Sending Messages (HCS)

When user sends a message:

```typescript
// Option A: Pay for HCS submission via HBAR transfer
const txResponse = await fetch(
  'https://tamam-backend-staging-776426377628.us-central1.run.app/api/custody/transactions',
  {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'X-Idempotency-Key': `msg-${messageId}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      vaultId,
      type: 'TRANSFER',
      chain: 'HEDERA',
      amount: '0.01', // 0.01 HBAR for HCS message
      assetSymbol: 'HBAR',
      destinationAddress: hederaOperatorAccountId,
      memo: `Message submission fee for ${messageId}`,
    }),
  },
);

// Wait for transaction to complete before submitting message to HCS

// Option B: Use MPC sign endpoint to sign TopicMessageSubmitTransaction
// (allows user's account to be the submitter)
const signResponse = await fetch(
  'https://tamam-backend-staging-776426377628.us-central1.run.app/api/custody/mpc/sign',
  {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      transactionId, // Pre-created transaction (not yet signed)
    }),
  },
);
```

### 4. Payments Between Users

```typescript
const paymentTx = await fetch(
  'https://tamam-backend-staging-776426377628.us-central1.run.app/api/custody/transactions',
  {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'X-Idempotency-Key': `pay-${paymentId}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      vaultId,
      type: 'TRANSFER',
      chain: 'HEDERA',
      amount: amountHbar.toString(),
      assetSymbol: 'HBAR',
      destinationAddress: recipientHederaAccountId,
      memo: `Payment from ${senderUserId}`,
    }),
  },
);

const { transaction } = await paymentTx.json();

// Poll for transaction status
let completed = false;
while (!completed) {
  const statusResponse = await fetch(
    `https://tamam-backend-staging-776426377628.us-central1.run.app/api/custody/transactions/${transaction.id}`,
    { headers: { 'X-API-Key': apiKey } },
  );
  const { transaction: tx } = await statusResponse.json();
  if (tx.status === 'COMPLETED') {
    completed = true;
    await db.payments.update(paymentId, {
      status: 'confirmed',
      blockchainHash: tx.blockchain_hash,
    });
  }
  await new Promise((r) => setTimeout(r, 2000)); // 2s poll interval
}
```

### 5. Webhook Integration

Register endpoint in your backend to receive transaction status updates:

```typescript
import crypto from 'crypto';

app.post('/webhooks/olara', (req, res) => {
  const signature = req.headers['x-olara-signature'];
  const payload = JSON.stringify(req.body);
  const webhookSecret = process.env.TAMAM_CUSTODY_WEBHOOK_SECRET;

  // Verify signature
  const computed = crypto
    .createHmac('sha256', webhookSecret)
    .update(payload)
    .digest('base64');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computed))) {
    return res.status(401).send('Unauthorized');
  }

  const { type, data } = req.body;

  switch (type) {
    case 'transaction.completed':
      // Update payment status in database
      await db.payments.update(data.transaction_id, {
        status: 'confirmed',
        blockchainHash: data.blockchain_hash,
      });
      break;

    case 'transaction.failed':
      // Handle failure
      await db.payments.update(data.transaction_id, {
        status: 'failed',
        error: data.error,
      });
      break;

    case 'key.frozen':
      // Alert user that their account has been frozen
      await alertUser(data.user_id, 'Account frozen due to security');
      break;
  }

  res.json({ success: true });
});
```

### 6. Compliance & Auditing

Export reports for regulatory requirements:

```typescript
const report = await fetch(
  'https://tamam-backend-staging-776426377628.us-central1.run.app/api/custody/compliance/export',
  {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      format: 'SEC_17A4', // or 'pdf', 'csv', 'json'
      startDate: '2026-01-01',
      endDate: '2026-03-11',
    }),
  },
);

// Save report to file storage
const buffer = await report.arrayBuffer();
await fs.writeFile('compliance-report-Q1.pdf', Buffer.from(buffer));
```

---

## TypeScript Interfaces

Full TypeScript types for all requests and responses:

```typescript
// ============================================================================
// AUTHENTICATION & COMMON
// ============================================================================

export interface APIKeyCredentials {
  apiKey: string; // olara_xxx...
}

export interface RequestSignatureHeaders {
  'X-API-Key': string;
  'X-Request-Timestamp': string; // ISO 8601
  'X-Request-Signature': string; // Base64 HMAC-SHA256
}

export interface APIResponse<T = unknown> {
  success: true;
  data?: T;
  timestamp: string;
}

export interface APIErrorResponse {
  success: false;
  error: string;
  code: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

// ============================================================================
// ONBOARDING
// ============================================================================

export interface OnboardingRequest {
  orgName: string;
  vaultName: string;
  serviceAccountName: string;
  adminEmail: string;
  scopes?: ('read' | 'write' | 'admin')[];
}

export interface OnboardingResponse {
  success: true;
  organization: {
    id: string;
    name: string;
    createdAt: string;
  };
  vault: {
    id: string;
    name: string;
    type: 'GENERAL';
    organization_id: string;
  };
  serviceAccount: {
    id: string;
    name: string;
    apiKey: string; // SAVE THIS
    signingSecret: string; // SAVE THIS
    scopes: ('read' | 'write' | 'admin')[];
    createdAt: string;
  };
  webhookSecret?: string;
}

// ============================================================================
// ORGANIZATIONS
// ============================================================================

export interface Organization {
  id: string;
  name: string;
  admin_email: string;
  created_at: string;
  updated_at: string;
  settings: {
    webhook_enabled: boolean;
    webhook_url?: string;
    mfa_required: boolean;
    ip_allowlist?: string[];
  };
}

// ============================================================================
// VAULTS
// ============================================================================

export type VaultType =
  | 'GENERAL'
  | 'TREASURY'
  | 'COLD_STORAGE'
  | 'TRADING'
  | 'OMNIBUS';

export interface Vault {
  id: string;
  name: string;
  type: VaultType;
  organization_id: string;
  description?: string;
  created_at: string;
  updated_at: string;
  balance?: {
    hbar: string;
    tokens: Record<string, string>;
  };
}

export interface CreateVaultRequest {
  name: string;
  type: VaultType;
  description?: string;
}

export interface VaultsListResponse {
  success: true;
  vaults: Vault[];
  total: number;
  limit: number;
  offset: number;
}

// ============================================================================
// MPC KEYS
// ============================================================================

export type KeyType = 'ED25519' | 'ECDSA_SECP256K1';
export type KeyStatus = 'ACTIVE' | 'FROZEN' | 'RESHARING';

export interface CreateMPCKeyRequest {
  vaultId: string;
  keyType: KeyType;
  threshold: number;
  totalShares: number;
  createHederaAccount?: boolean;
  description?: string;
}

export interface MPCKey {
  id: string;
  vault_id: string;
  key_type: KeyType;
  public_key: string; // hex
  hedera_account_id?: string; // 0.0.xxxxx
  threshold: number;
  total_shares: number;
  status: KeyStatus;
  created_at: string;
  last_used: string | null;
}

export interface CreateMPCKeyResponse {
  success: true;
  key: MPCKey;
  dkg_ceremony?: {
    id: string;
    status: 'in_progress' | 'completed' | 'failed';
  };
}

export interface FreezeKeyRequest {
  reason?: string;
}

export interface FreezeKeyResponse {
  success: true;
  key: {
    id: string;
    status: 'FROZEN';
    frozen_at: string;
  };
}

export interface UnfreezeKeyRequest {
  reason?: string;
}

export interface UnfreezeKeyResponse {
  success: true;
  key: {
    id: string;
    status: 'ACTIVE';
    unfrozen_at: string;
  };
}

// ============================================================================
// TRANSACTIONS
// ============================================================================

export type TransactionType = 'TRANSFER' | 'TOKEN_TRANSFER' | 'STAKING';
export type Chain = 'HEDERA' | 'ETHEREUM' | 'POLYGON';

export type TransactionStatus =
  | 'PENDING_POLICY'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PENDING_SIGNING'
  | 'SIGNING'
  | 'SIGNED'
  | 'BROADCASTING'
  | 'PENDING_CONFIRMATION'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'FAILED'
  | 'REJECTED'
  | 'EXPIRED';

export interface CreateTransactionRequest {
  vaultId: string;
  type: TransactionType;
  chain: Chain;
  amount: string; // decimal string
  assetSymbol: string;
  destinationAddress: string;
  memo?: string;
  metadata?: Record<string, unknown>;
}

export interface Transaction {
  id: string;
  vault_id: string;
  type: TransactionType;
  chain: Chain;
  status: TransactionStatus;
  amount: string;
  asset_symbol: string;
  destination: string;
  memo?: string;
  hedera_transaction_id?: string; // 0.0.xxx@timestamp
  blockchain_hash?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface CreateTransactionResponse {
  success: true;
  transaction: Transaction & {
    policy_checks?: {
      daily_limit: { passed: boolean; remaining: string };
      counterparty_risk: { passed: boolean };
    };
  };
}

export interface TransactionsListResponse {
  success: true;
  transactions: Transaction[];
  total: number;
  limit: number;
  offset: number;
}

export interface TransactionDetailResponse {
  success: true;
  transaction: Transaction & {
    approvals: {
      approved_by: string;
      approved_at: string;
      reason?: string;
    }[];
    signing_progress?: {
      threshold: number;
      current_signatures: number;
      status: 'not_started' | 'in_progress' | 'completed';
    };
  };
}

export interface ApproveTransactionRequest {
  decision: 'APPROVED' | 'REJECTED';
  reason?: string;
}

export interface ApproveTransactionResponse {
  success: true;
  transaction: Transaction & {
    status: 'APPROVED' | 'REJECTED';
  };
}

export interface RetryTransactionRequest {
  reason?: string;
}

export interface RetryTransactionResponse {
  success: true;
  transaction: Transaction & {
    status: 'PENDING_SIGNING';
  };
}

export interface ManualSignRequest {
  transactionId: string;
}

export interface ManualSignResponse {
  success: true;
  transaction: Transaction & {
    status: 'SIGNING' | 'SIGNED';
  };
}

// ============================================================================
// SERVICE ACCOUNTS (API KEYS)
// ============================================================================

export interface ServiceAccount {
  id: string;
  name: string;
  scopes: ('read' | 'write' | 'admin')[];
  allowed_vault_ids?: string[] | null;
  ip_allowlist?: string[];
  created_at: string;
  last_used: string | null;
}

export interface CreateServiceAccountRequest {
  name: string;
  scopes: ('read' | 'write' | 'admin')[];
  allowedVaultIds?: string[] | null;
  ipAllowlist?: string[];
}

export interface CreateServiceAccountResponse {
  success: true;
  account: ServiceAccount & {
    apiKey: string; // SAVE THIS
    signingSecret: string; // SAVE THIS
  };
}

export interface ServiceAccountsListResponse {
  success: true;
  accounts: ServiceAccount[];
}

export interface RotateKeyRequest {
  gracePeriodHours?: number;
}

export interface RotateKeyResponse {
  success: true;
  newApiKey: string;
  oldApiKey: string;
  gracePeriodUntil: string;
  signingSecret: string;
}

export interface RevokeKeyResponse {
  success: true;
  account: {
    id: string;
    status: 'revoked';
    revoked_at: string;
  };
}

// ============================================================================
// COMPLIANCE & REPORTING
// ============================================================================

export interface ComplianceSummaryResponse {
  success: true;
  summary: {
    period: {
      startDate: string;
      endDate: string;
    };
    transactions: {
      total: number;
      completed: number;
      failed: number;
      total_value: string;
    };
    keys: {
      created: number;
      frozen: number;
    };
    approvals: {
      total: number;
      approved: number;
      rejected: number;
    };
  };
}

export interface ComplianceExportRequest {
  format: 'json' | 'csv' | 'pdf' | 'CBB_SANDBOX' | 'VARA_VIRTUAL' | 'SEC_17A4';
  startDate: string;
  endDate: string;
  filters?: {
    vaultIds?: string[];
    transactionTypes?: string[];
  };
}

// ============================================================================
// WEBHOOKS
// ============================================================================

export type WebhookEventType =
  | 'transaction.created'
  | 'transaction.approved'
  | 'transaction.executed'
  | 'transaction.completed'
  | 'transaction.failed'
  | 'key.frozen'
  | 'key.unfrozen';

export interface WebhookEvent<T = unknown> {
  id: string;
  type: WebhookEventType;
  timestamp: string;
  data: T;
}

export interface WebhookTransactionEvent {
  transaction_id: string;
  vault_id: string;
  status: TransactionStatus;
  amount: string;
  asset_symbol: string;
  blockchain_hash?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface WebhookKeyEvent {
  key_id: string;
  vault_id: string;
  status: KeyStatus;
  timestamp: string;
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

export enum ErrorCode {
  // Auth
  INVALID_API_KEY = 'INVALID_API_KEY',
  EXPIRED_TOKEN = 'EXPIRED_TOKEN',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',

  // Validation
  INVALID_REQUEST = 'INVALID_REQUEST',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_VAULT_ID = 'INVALID_VAULT_ID',
  INVALID_KEY_ID = 'INVALID_KEY_ID',

  // Business logic
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  POLICY_DENIED = 'POLICY_DENIED',
  KEY_FROZEN = 'KEY_FROZEN',
  KEY_NOT_READY = 'KEY_NOT_READY',
  TRANSACTION_ALREADY_SIGNED = 'TRANSACTION_ALREADY_SIGNED',
  COUNTERPARTY_RISK_EXCEEDED = 'COUNTERPARTY_RISK_EXCEEDED',

  // Signing/broadcast
  SIGNING_FAILED = 'SIGNING_FAILED',
  BROADCAST_FAILED = 'BROADCAST_FAILED',
  CONSENSUS_TIMEOUT = 'CONSENSUS_TIMEOUT',

  // System
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

export interface ErrorDetail {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  backoffMs?: number;
}

export const RETRYABLE_ERROR_CODES: Set<ErrorCode> = new Set([
  ErrorCode.RATE_LIMIT_EXCEEDED,
  ErrorCode.INTERNAL_ERROR,
  ErrorCode.SERVICE_UNAVAILABLE,
  ErrorCode.SIGNING_FAILED,
  ErrorCode.BROADCAST_FAILED,
  ErrorCode.CONSENSUS_TIMEOUT,
]);
```

---

## Security Best Practices

### Key Management
- **Never log API keys or signing secrets** — not even at DEBUG level
- **Store in secrets manager** — HashiCorp Vault, AWS Secrets Manager, etc.
- **Rotate every 90 days** — use the `rotate` endpoint with grace period
- **Use IP allowlists** — restrict API key to specific networks
- **Separate keys by environment** — dev, staging, production

### Transaction Security
- **Always set `X-Idempotency-Key`** — prevents accidental duplicate transactions
- **Verify webhook signatures** — use `crypto.timingSafeEqual` for timing-safe comparison
- **Validate amounts** — ensure user input matches transaction request
- **Set transaction memo** — include reference IDs for audit trail
- **Use HTTPS only** — never transmit API keys over plain HTTP

### Hedera Account Security
- **Freeze soulbound NFTs after mint** — prevent identity theft
- **Use threshold keys for multi-sig** — require 2+ signers for critical operations
- **Monitor key freeze status** — notify user if account is frozen
- **Audit all transactions** — write to HCS for immutable record

### Operational Security
- **Monitor API usage** — alert on unusual request patterns
- **Rate limit on client side** — respect X-RateLimit-Remaining headers
- **Implement exponential backoff** — for retryable errors
- **Log all approvals** — maintain audit trail of who approved what
- **Use separate admin account** — for key freeze/unfreeze operations

---

## Open Questions & Known Limitations

### Unanswered Questions

1. **Onboarding Response Schema** — The quickstart shows a generic response, but does the full OpenAPI spec detail all fields returned?
   - Status: Awaiting clarification from Tamam team

2. **User-to-Key Mapping** — When creating MPC keys, how do we pass user context?
   - Current approach: Store mapping in platform database (userId → keyId → hederaAccountId)
   - Question: Is there a native user context field in the API?

3. **Sandbox vs. Production** — Is there a testnet environment or does development use production endpoint?
   - Current assumption: Development uses production endpoint with test vault
   - Question: Should we use a separate test organization?

4. **Webhook Registration** — Referenced in onboarding guide but not in OpenAPI spec
   - Current approach: Use onboarding response `webhookSecret` and provide endpoint URL separately
   - Question: Is there a webhook registration endpoint?

5. **Frozen Key Recovery** — What's the process if an MPC key is frozen?
   - Current assumption: Requires admin intervention via unfreeze endpoint
   - Question: Can users self-recover or is manual support required?

### Known Limitations

- **No batch transaction creation** — Must create transactions one at a time
- **No transaction scheduling** — Cannot schedule transactions for future execution
- **DKG ceremony timing** — Distributed Key Generation can take 5-30 minutes depending on network conditions
- **Webhook retries** — Service does not retry failed webhook deliveries (implement client-side queue)
- **Compliance export formats** — Some formats (CBB_SANDBOX, VARA_VIRTUAL) may not be fully documented

---

## References

- **Tamam Backend**: `https://tamam-backend-staging-776426377628.us-central1.run.app`
- **OpenAPI Spec**: Provided in olara-mobile-app project
- **Authentication Docs**: See auth guide in olara-mobile-app
- **Security Docs**: See security guide in olara-mobile-app
- **Onboarding Guide**: See quickstart in olara-mobile-app
- **Transaction Signing Guide**: See signing guide in olara-mobile-app
- **Error Handling**: See error codes reference in olara-mobile-app

---

## Document Versioning

| Date | Version | Notes |
|------|---------|-------|
| 2026-03-11 | 1.0 | Initial verified reference based on OpenAPI spec analysis |

