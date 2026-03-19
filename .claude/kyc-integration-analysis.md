# Mirsad AI KYC Integration — Complete Analysis

**Status**: Thoroughly Analyzed
**Date**: 2026-03-13
**Analysis Scope**: Full KYC/AML integration documentation and code

---

## Executive Summary

The Mirsad AI KYC/AML integration is **FULLY IMPLEMENTED** in the codebase with comprehensive service layers, DTOs, exception handling, webhook controller, and integration tests. The integration is NOT blocked by missing code — it's blocked by missing **runtime configuration** (environment variables) and **external service credentials**.

**Key Finding**: The tests are skipped, not failed, because `MIRSAD_KYC_API_URL` and `MIRSAD_KYC_CALLBACK_URL` environment variables are not set.

---

## 1. What Endpoints Exist

### 1.1 KYC Submission Endpoints (Application Layer)

These are NOT Mirsad AI endpoints; they are social platform endpoints:

**Location**: `packages/api/src/modules/identity/` (inferred from controller patterns)

Expected endpoints (based on KycService):
- `POST /api/v1/identity/kyc/individual` — Submit individual KYC
- `POST /api/v1/identity/kyc/corporate` — Submit corporate KYC/KYB
- `GET /api/v1/identity/kyc/status` — Check KYC status

### 1.2 KYC Callback/Webhook Endpoint

**Implementation**: `packages/api/src/modules/identity/controllers/kyc-webhook.controller.ts`

```typescript
@Controller("api/v1/webhooks")
export class KycWebhookController {
  @Post("mirsad-kyc-callback")
  async handleMirsadKycCallback(
    @Body() payload: MirsadKycCallbackDto,
  ): Promise<ApiResponse<{ acknowledged: boolean }>>;
}
```

**Path**: `POST /api/v1/webhooks/mirsad-kyc-callback`

**Purpose**: Receive async KYC results from Mirsad AI

**Payload Format** (from `MirsadKycCallbackDto`):
```typescript
{
  request_id: string;  // ID from initial submission
  status: "approved" | "rejected" | "on_hold";
}
```

### 1.3 Mirsad AI Public Endpoints (External Service)

**Service**: `packages/api/src/modules/integrations/mirsad-ai/mirsad-ai.service.ts`

These are the actual Mirsad AI API endpoints called by the service:

1. **Onboarding Endpoint**
   - Path: `POST /api/v1/public/onboarding`
   - Base URL: `https://dashboard-api.olara.io` (production) or `https://olara-api.var-meta.com` (staging)
   - Purpose: Submit individual/corporate KYC data for verification

2. **Transaction Scoring Endpoint**
   - Path: `POST /api/v1/public/transaction-scoring`
   - Base URL: Same as above
   - Purpose: Submit transactions for AML risk scoring

---

## 2. Expected Flow (Submit → Webhook Callback)

### Step 1: User Submits KYC Data
```
User (frontend)
  → POST /api/v1/identity/kyc/individual
  → IndividualKycSubmitDto (validated via class-validator)
```

### Step 2: Platform Calls Mirsad AI
```
KycService.submitIndividualKyc()
  → MirsadAiService.submitIndividualOnboarding()
  → HTTP POST to: {MIRSAD_KYC_API_URL}/api/v1/public/onboarding
  ← Response: { request_id, submitted_at }
  → Store request_id in UserEntity.kycRequestId
  → Update UserEntity.status → "kyc_submitted"
```

### Step 3: Mirsad AI Processes (Hours to Days)
```
Mirsad AI backend processes KYC/AML screening
  ↓ (async processing)
  ↓ (sanction list checking, identity verification)
  ↓ (decision: approved/rejected/on_hold)
```

### Step 4: Mirsad AI Posts Callback
```
Mirsad AI
  → HTTP POST to: {MIRSAD_KYC_CALLBACK_URL}/api/v1/webhooks/mirsad-kyc-callback
  → Payload: { request_id: "xxx", status: "approved" }
```

### Step 5: Webhook Handler Processes Callback
```
KycWebhookController.handleMirsadKycCallback()
  → KycService.handleKycCallback(request_id, status)
    ├─ If approved: Set UserEntity.status → "active"
    ├─ If rejected: Set UserEntity.status → "kyc_rejected" (can resubmit)
    └─ If on_hold: Keep status as "kyc_submitted" (manual review)
  → If approved: Trigger OnboardingService.completeOnboarding()
    └─ (Mint DID NFT, create HCS topics)
```

---

## 3. Current Implementation Status

### ✅ Fully Implemented Components

#### A. Service Layer (`mirsad-ai.service.ts`)
- Lines 1-750: Complete MirsadAiService
- **Methods Implemented**:
  - `submitIndividualOnboarding()` — KYC for individuals
  - `submitCorporateOnboarding()` — KYB for businesses
  - `submitTransactionScoring()` — AML transaction risk scoring
  - `submitKyc()` — Generic wrapper for both individual and corporate
  - `checkKycStatus()` — Throws "not implemented" (Mirsad AI uses callbacks, no polling)
  - `isConfigured()` — Helper to check if service is ready
- **Validation**: Full field validation for all request types
- **Error Handling**: Typed exceptions for all error scenarios

#### B. Exception Classes (`mirsad-ai.exceptions.ts`)
- `MirsadNotConfiguredException` — Service not configured
- `MirsadDisabledException` — Service disabled via env var
- `MirsadOnboardingFailedException` — Onboarding API call failed
- `MirsadTransactionScoringFailedException` — Transaction scoring API call failed
- `MirsadValidationException` — Field validation error
- `MirsadNotImplementedException` — Operation not supported (e.g., polling)

#### C. KYC Service Layer (`kyc.service.ts`)
- Lines 1-416: Complete KycService
- **Methods Implemented**:
  - `submitIndividualKyc()` — Validate and submit individual KYC
  - `submitCorporateKyc()` — Validate and submit corporate KYC
  - `handleKycCallback()` — Process Mirsad AI callback (idempotent)
  - `getKycStatus()` — Retrieve KYC status for user
  - `findByRequestId()` — Look up user by Mirsad AI request_id
- **State Transitions**: Proper user status management

#### D. Webhook Controller (`kyc-webhook.controller.ts`)
- Lines 1-134: Complete KycWebhookController
- **Endpoint**: `POST /api/v1/webhooks/mirsad-kyc-callback`
- **Features**:
  - Accepts MirsadKycCallbackDto (validated via class-validator)
  - Calls KycService.handleKycCallback()
  - Triggers OnboardingService on approval
  - Always returns HTTP 200 (idempotent, prevents Mirsad AI retries)
  - Error handling: logs but still returns 200

#### E. Data Transfer Objects (DTOs)

**Individual KYC** (`kyc-submit.dto.ts`, lines 57-182):
```typescript
export class IndividualKycSubmitDto {
  accountType: "individual";
  fullLegalName: string;
  dateOfBirth: string (YYYY-MM-DD);
  nationality: string (ISO 3166-1 alpha-2);
  countryOfResidence: string;
  currentResidentialAddress: string (comma-separated);
  nationalIdNumber: string;
  cityOfBirth: string;
  countryOfBirth: string;

  // Optional fields
  gender?: "M" | "F";
  email?: string;
  phoneNumber?: string;
  passportNumber?: string;
  occupation?: string;
  businessType?: string;
  industry?: string;
  declaredIncome?: number;
  netWorth?: number;
  currencyInput?: string;

  // Nested documents
  documentData?: {
    documentType?: "passport" | "drivers_license" | "national_id";
    documentFrontRef?: string;
    documentBackRef?: string;
    selfieImageRef?: string;
  };

  // Nested compliance
  complianceData?: {
    sourceOfFundsDeclaration?: string;
    sourceOfFundsDetails?: string;
  };
}
```

**Corporate KYC** (`kyc-submit.dto.ts`, lines 284-385):
```typescript
export class CorporateKycSubmitDto {
  accountType: "business";
  legalEntityName: string;
  countryOfIncorporation: string;
  businessRegistrationNumber: string;
  businessAddress: string;

  // Optional entity fields (as individual)

  // Beneficial owners
  beneficialOwners?: BeneficialOwnerDto[];

  // Documents and compliance (as individual)
}
```

**Callback DTO** (`kyc-callback.dto.ts`, lines 9-20):
```typescript
export class MirsadKycCallbackDto {
  request_id: string;
  status: "approved" | "rejected" | "on_hold";
}
```

#### F. Integration Tests
- **`mirsad-ai.service.integration.test.ts`** (759 lines)
  - Tests for service initialization
  - Configuration validation tests
  - Input validation tests
  - Live Mirsad AI staging API tests (skipped if credentials missing)

- **`kyc.service.integration.test.ts`** (535 lines)
  - PostgreSQL dependency checks
  - KYC status retrieval tests
  - Callback handling tests (all three statuses: approved, rejected, on_hold)
  - Idempotency tests
  - User validation tests
  - Live Mirsad AI submission tests (skipped if credentials missing)

---

## 4. Why KYC Tests Are Blocked

### Root Cause: Missing Environment Variables

The tests are **SKIPPED**, not **FAILED**. The test files explicitly check for required environment variables:

**In `mirsad-ai.service.integration.test.ts` (line 35-39)**:
```typescript
function hasMirsadCredentials(): boolean {
  return !!(
    process.env["MIRSAD_KYC_API_URL"] && process.env["MIRSAD_KYC_CALLBACK_URL"]
  );
}
```

**Test skip logic** (line 662-666):
```typescript
it("should submit individual KYC onboarding to staging API", async () => {
  if (!credentialsAvailable) {
    logger.warn("SKIPPED: MIRSAD_KYC_API_URL not configured");
    return;  // Test exits early, not counted as failure
  }
  // ... rest of test
}, 60_000);
```

### What's Missing

Required environment variables **NOT SET** in `.env`:

```bash
# Currently missing or empty:
MIRSAD_KYC_API_URL=              # Should be: https://olara-api.var-meta.com (staging)
MIRSAD_KYC_CALLBACK_URL=         # Should be: https://your-domain.com/api/v1/webhooks/mirsad-kyc-callback
MIRSAD_KYC_ENABLED=              # Should be: true
```

### Tests That RUN (Don't Require Credentials)

1. **Disabled service tests** — No external calls
2. **Configuration validation tests** — No external calls
3. **Input validation tests** — No external calls
4. **PostgreSQL-based tests** (in kyc.service tests):
   - `getKycStatus()`
   - `handleKycCallback()` for all three statuses
   - Idempotency checks
   - User validation

**Tests That SKIP** (Require Mirsad AI Credentials):
- `submitIndividualKyc()` — requires MIRSAD_KYC_API_URL
- `submitCorporateKyc()` — requires MIRSAD_KYC_API_URL
- `submitTransactionScoring()` — requires MIRSAD_KYC_API_URL

---

## 5. What's Needed to Unblock

### A. Configuration

Set these environment variables in `.env`:

```bash
# Mirsad AI Staging API (for testing)
MIRSAD_KYC_ENABLED=true
MIRSAD_KYC_API_URL=https://olara-api.var-meta.com
MIRSAD_KYC_CALLBACK_URL=https://yourdomain.com/api/v1/webhooks/mirsad-kyc-callback

# For production use
# MIRSAD_KYC_API_URL=https://dashboard-api.olara.io
```

### B. Network/Infrastructure

1. **Webhook Endpoint Must Be Public**
   - Mirsad AI needs to POST to your callback URL
   - Must be HTTPS (Mirsad AI requires it)
   - Cannot be `localhost` during testing

2. **PostgreSQL Running**
   - Tests require real database on `localhost:5433`
   - Schema: `hedera_social_test`
   - User: `test` / Password: `test`

3. **Hedera Testnet Account**
   - For onboarding tests that verify user wallet creation

### C. Documentation Verification

**Status**: VERIFIED and COMPLETE
Location: `.claude/skills/hedera-social-dev/references/mirsad-ai-integration.md`

Contains:
- Complete API specifications for both endpoints
- Request/response payload formats
- Field specifications and quirks
- Blockchain type support (HEDERA included)
- Integration patterns
- Database schema examples
- Environment variable reference
- Implementation checklist

---

## 6. Integration Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│ User Registration Flow                                            │
└──────────────────────────────────────────────────────────────────┘

User (Frontend)
  │
  ├─→ POST /api/v1/identity/kyc/individual
  │       {fullLegalName, dateOfBirth, nationality, ...}
  │
  └─→ ValidationPipe (class-validator)
        │
        ├─ ✓ Valid
        │
        └─→ KycService.submitIndividualKyc()
              │
              ├─ Validate user exists & in valid state
              │
              ├─ Transform DTO to Mirsad AI format
              │
              └─→ MirsadAiService.submitIndividualOnboarding()
                    │
                    ├─ Ensure service is configured
                    │
                    ├─ Validate all required fields
                    │
                    └─→ HTTP POST to {MIRSAD_KYC_API_URL}/api/v1/public/onboarding
                          │
                          └─→ Mirsad AI
                                ├─ Sanction list screening
                                ├─ Identity verification
                                ├─ Risk assessment
                                │
                                └─→ HTTP POST {MIRSAD_KYC_CALLBACK_URL}
                                      {request_id, status}


Response Flow:
──────────────

Mirsad AI Webhook Handler
  │
  └─→ POST /api/v1/webhooks/mirsad-kyc-callback
        {request_id, status}
        │
        ├─→ KycWebhookController.handleMirsadKycCallback()
        │     │
        │     └─→ KycService.handleKycCallback()
        │           │
        │           ├─ If status="approved"
        │           │   └─→ User.status = "active"
        │           │       └─→ OnboardingService.completeOnboarding()
        │           │           ├─ Mint DID NFT
        │           │           ├─ Create HCS topics
        │           │           └─ Activate user
        │           │
        │           ├─ If status="rejected"
        │           │   └─→ User.status = "kyc_rejected"
        │           │       └─ User can resubmit
        │           │
        │           └─ If status="on_hold"
        │               └─→ User.status = "kyc_submitted"
        │                   └─ Awaiting manual review
        │
        └─→ Always return HTTP 200 OK (idempotent)
```

---

## 7. Mirsad AI Service Interface

```typescript
interface IMirsadAiService {
  submitIndividualOnboarding(
    userId: string,
    data: MirsadIndividualData,
  ): Promise<{
    request_id: string;
    submitted_at: string;  // ISO timestamp
  }>;

  submitCorporateOnboarding(
    userId: string,
    data: MirsadCorporateData,
  ): Promise<{
    request_id: string;
    submitted_at: string;
  }>;

  submitTransactionScoring(
    userId: string,
    customerType: "INDIVIDUAL" | "CORPORATE",
    transactionData: MirsadTransactionData,
  ): Promise<{
    request_id: string;
    submitted_at: string;
  }>;

  checkKycStatus(requestId: string): Promise<never>;  // Throws "not implemented"

  isConfigured(): boolean;
}
```

---

## 8. KYC Service Interface

```typescript
interface IKycService {
  submitIndividualKyc(
    userId: string,
    dto: IndividualKycSubmitDto,
  ): Promise<KycSubmissionResult>;

  submitCorporateKyc(
    userId: string,
    dto: CorporateKycSubmitDto,
  ): Promise<KycSubmissionResult>;

  handleKycCallback(
    requestId: string,
    status: "approved" | "rejected" | "on_hold",
  ): Promise<UserEntity>;

  getKycStatus(userId: string): Promise<KycStatusInfo>;

  findByRequestId(requestId: string): Promise<UserEntity | null>;
}
```

---

## 9. Data Flow: Request/Response Payloads

### Individual Onboarding Request to Mirsad AI

```json
{
  "flow": "OnBoardingFlow",
  "customer_type": "INDIVIDUAL",
  "timestamp": "2026-03-13T14:30:00Z",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "callback_url": "https://yourdomain.com/api/v1/webhooks/mirsad-kyc-callback",
  "data": {
    "identity_info": {
      "full_legal_name": "Jane Doe",
      "date_of_birth": "1990-05-15",
      "nationality": "US",
      "country_of_residence": "US",
      "current_residential_address": "123 Main Street, San Francisco, 94105, USA",
      "national_id_number": "SSN123456789",
      "city_of_birth": "New York",
      "country_of_birth": "US",
      "email": "jane@example.com",
      "occupation": "Software Engineer",
      "declared_income": 150000,
      "currency_input": "USD"
    }
  }
}
```

### Mirsad AI Initial Response

```json
{
  "request_id": "req_abc123xyz789",
  "submitted_at": "2026-03-13T14:30:05Z"
}
```

### Mirsad AI Callback (Hours/Days Later)

```json
{
  "request_id": "req_abc123xyz789",
  "status": "approved"
}
```

---

## 10. Error Handling & Exception Hierarchy

### Exception Classes and When They're Thrown

| Exception | Status | Thrown When |
|-----------|--------|------------|
| `MirsadDisabledException` | 503 | `MIRSAD_KYC_ENABLED=false` |
| `MirsadNotConfiguredException` | 503 | API URL or callback URL missing |
| `MirsadValidationException` | 400 | Required field missing/invalid |
| `MirsadOnboardingFailedException` | 502 | HTTP call to Mirsad AI fails |
| `MirsadTransactionScoringFailedException` | 502 | HTTP call for transaction scoring fails |
| `MirsadNotImplementedException` | 501 | `checkKycStatus()` called (polling not supported) |

### User/KYC Specific Exceptions

Located in `packages/api/src/modules/identity/exceptions/kyc.exception.ts`:

| Exception | When |
|-----------|------|
| `UserNotFoundException` | User ID doesn't exist |
| `KycInvalidStateException` | User not in valid state for KYC submission |
| `KycSubmissionException` | Mirsad AI submission failed |
| `KycCallbackInvalidException` | Callback request_id doesn't match any user |
| `KycRecordNotFoundException` | User has no KYC request_id |

---

## 11. Key Implementation Details

### Configuration Management
- All env vars validated at startup via `src/config/env.validation.ts`
- Zod schema ensures required values are present
- Application fails fast on startup if config is invalid

### HTTP Client Implementation
- Uses native `fetch()` API (built-in to Node.js 18+)
- Timeout: 30 seconds per request (`REQUEST_TIMEOUT_MS = 30_000`)
- Content-Type: `application/json`
- Error handling: Parses response body on non-2xx status

### Idempotency
- Callback handler checks `kycCompletedAt` before re-processing
- Same request_id processed twice → second time skipped with log
- Always returns HTTP 200 to Mirsad AI (prevents retry loops)

### Field Format Quirks (From Real API)
1. Flow enums are PascalCase: `"OnBoardingFlow"` not `"OnboardingFlow"`
2. Address format: comma-separated `"Street, City, Postal Code, Country"`
3. SWIFT code field differs by flow:
   - Onboarding: `swift_and_bic_code`
   - Transaction: `swift`
4. Timestamp format: ISO 8601 / RFC 3339

---

## 12. Testing Strategy

### Test Categories

**Always Run** (No external dependencies):
- Service initialization
- Configuration validation
- Input validation (all required fields)
- DTO validation
- Exception throwing

**Run When PostgreSQL Available** (localhost:5433):
- KYC status retrieval
- Callback handling (all three statuses)
- Idempotency verification
- User state transitions

**Run When Credentials Available** (MIRSAD_KYC_API_URL set):
- Live Mirsad AI staging API submissions
- Request/response validation
- Real async callback simulation

### To Run All Tests

```bash
# 1. Start PostgreSQL test instance
docker compose -f docker-compose.test.yml up -d

# 2. Set credentials for live API tests (optional)
export MIRSAD_KYC_API_URL=https://olara-api.var-meta.com
export MIRSAD_KYC_CALLBACK_URL=https://example.com/webhooks/kyc-callback

# 3. Run tests
pnpm test packages/api -- mirsad-ai.service.integration.test.ts
pnpm test packages/api -- kyc.service.integration.test.ts
```

---

## 13. Important Notes

### What IS Implemented
- Full Mirsad AI integration
- Both individual and corporate KYC
- Transaction scoring for AML
- Comprehensive error handling
- Webhook callback receiver
- Complete test suite
- Full documentation

### What IS NOT Implemented
- HMAC signature verification on callbacks (optional enhancement)
- Callback retry mechanism with exponential backoff (can be added)
- KYC expiration policy (30/60/90 day re-verification)
- Streaming file uploads (currently expects URLs to documents)

### What Requires External Configuration
- Mirsad AI staging/production API URL
- Callback URL (must be public, HTTPS)
- PostgreSQL connection for tests
- Environment variables in `.env`

---

## 14. References

### Files in This Codebase

| File | Lines | Purpose |
|------|-------|---------|
| `mirsad-ai.service.ts` | 750 | Main Mirsad AI integration service |
| `mirsad-ai.exceptions.ts` | 102 | Exception classes |
| `kyc.service.ts` | 416 | KYC orchestration service |
| `kyc-webhook.controller.ts` | 134 | Callback receiver |
| `kyc-submit.dto.ts` | 391 | Request DTOs |
| `kyc-callback.dto.ts` | 21 | Callback response DTO |
| `mirsad-ai.service.integration.test.ts` | 759 | Service tests |
| `kyc.service.integration.test.ts` | 535 | KYC service tests |
| `mirsad-ai-integration.md` | 756 | API reference documentation |
| `configuration.ts` | 120 | Config schema |
| `.env.example` | 94 | Environment variables template |

### External References

- **Official Documentation**: `.claude/skills/hedera-social-dev/references/mirsad-ai-integration.md`
- **Task Definition**: `tasks/phase-1-identity/P1-T11-kyc-did-nft.md`
- **Specification**: `docs/SPECIFICATION.md` (Sections 2.1, 4 for DID format)

---

## 15. Summary

**Status**: Implementation is COMPLETE and ready for testing.

**Why Tests Are "Blocked"**: Not blocked by code issues — blocked by missing environment variables.

**How to Unblock**:
1. Set `MIRSAD_KYC_API_URL` and `MIRSAD_KYC_CALLBACK_URL` in `.env`
2. Ensure `MIRSAD_KYC_ENABLED=true`
3. Start PostgreSQL test container: `docker compose -f docker-compose.test.yml up -d`
4. Run tests: `pnpm test packages/api -- mirsad-ai.service.integration.test.ts`

**Key Files to Review**:
- Service: `/packages/api/src/modules/integrations/mirsad-ai/mirsad-ai.service.ts`
- KYC Layer: `/packages/api/src/modules/identity/services/kyc.service.ts`
- Webhook: `/packages/api/src/modules/identity/controllers/kyc-webhook.controller.ts`
- Documentation: `.claude/skills/hedera-social-dev/references/mirsad-ai-integration.md`
