# Mirsad AI KYC/AML Integration Reference

**Status**: VERIFIED — Integration tested against official Mirsad AI API documentation

Mirsad AI is a KYC (Know Your Customer) / AML (Anti-Money Laundering) compliance platform providing customer onboarding verification and transaction risk scoring. This document provides the complete verified integration contract for the social platform.

---

## Service Overview

**Service**: Mirsad AI KYC/AML Platform
**Type**: Async callback-based REST API
**Authentication**: Public endpoints (no auth required)
**Production Base URL**: `https://dashboard-api.olara.io`
**Staging Base URL**: `https://olara-api.var-meta.com`
**Admin Dashboard**: `https://olara.var-meta.com/` (for manual case review)
**Swagger Docs**: `https://olara-api.var-meta.com/swagger/index.html`

**Available Endpoints** (only two):
1. `POST /api/v1/public/onboarding` — KYC onboarding verification
2. `POST /api/v1/public/transaction-scoring` — AML transaction risk scoring

### Key Characteristics

- **Async Processing**: Submit verification request → receive `request_id` → results delivered via HTTP callback
- **Two Main Flows**: Onboarding (KYC for individuals/corporates) + Transaction Scoring (AML risk assessment)
- **Callback-Based**: Your platform provides a `callback_url` where Mirsad AI POSTs results
- **Blockchain Native**: Supports HEDERA blockchain type natively for on-chain transaction scoring

---

## Integration Flows

### 1. Onboarding Flow (KYC)

**Endpoint**: `POST /api/v1/public/onboarding`
**Auth**: None required
**Response**: Immediate (returns `request_id`); final result via callback

Submit identity information for individual or corporate customers. Mirsad AI performs:
- Sanction list screening
- Identity verification
- Risk scoring based on nationality, occupation, industry
- High net worth detection (CT-05 compliance)

#### Request Payload: Individual Onboarding

```typescript
interface OnboardingRequest {
  flow: 'OnBoardingFlow'; // EXACT enum value (case-sensitive)
  customer_type: 'INDIVIDUAL' | 'CORPORATE';
  timestamp: string; // ISO 8601 / RFC 3339 format
  user_id: string; // Your platform's unique user ID
  callback_url: string; // REQUIRED: where Mirsad AI POSTs completion results
  data: IndividualData | CorporateData;
}

interface IndividualData {
  identity_info: {
    // Required fields
    full_legal_name: string; // Used for sanction list screening
    date_of_birth: string; // YYYY-MM-DD format (required for sanction risk)
    nationality: string; // ISO 3166-1 alpha-2 country code (required for sanction risk)
    country_of_residence: string; // Where customer currently lives
    current_residential_address: string; // Comma-separated: street, city, postal code, country
    national_id_number: string; // ID document number for identity verification
    city_of_birth: string; // Used for sanction risk screening
    country_of_birth: string; // Used for sanction risk screening

    // Optional identity fields
    gender?: string; // M/F or other (sanction risk factor)
    email?: string;
    phone_number?: string; // International format preferred
    passport_number?: string; // Alternative to national_id for identity verification
    occupation?: string; // Profession (occupation risk rules)
    business_type?: string; // If applicable (e.g., 'msb' for money services)
    industry?: string; // Industry classification (industry risk rules)

    // Financial fields for high net worth detection (CT-05 compliance)
    declared_income?: number; // Annual income as number
    net_worth?: number; // Total net worth as number
    currency_input?: string; // Currency code for income/net_worth (e.g., 'USD', 'BHD', 'EUR')

    // Banking details
    iban?: string;
    swift_and_bic_code?: string; // SWIFT code for international transfers
    segment?: string; // Customer segment classification
  };

  // Optional document submission
  document_data?: {
    document_type?: string; // e.g., 'passport', 'drivers_license', 'national_id'
    document_front_ref?: string; // URL to front image (S3, etc.)
    document_back_ref?: string; // URL to back image (S3, etc.)
    selfie_image_ref?: string; // URL to selfie image for face matching
  };

  // Optional compliance declarations
  compliance_data?: {
    source_of_funds_declaration?: string; // E.g., 'employment', 'inheritance', 'business'
    source_of_funds_details?: string; // Detailed description if applicable
  };
}
```

#### Request Payload: Corporate Onboarding

```typescript
interface CorporateData {
  entity_info: {
    // Required fields
    legal_entity_name: string; // Official business name
    country_of_incorporation: string; // Where business is registered
    business_registration_number: string; // Tax ID, company registration number
    business_address: string; // Comma-separated: street, city, postal code, country

    // Optional entity fields
    primary_activity_description?: string; // What the business does
    tax_identification_number?: string; // Alternative tax ID
    trade_licenses_ref?: string; // URL to license document
    email?: string;
    phone_number?: string;
    business_type?: string; // E.g., 'msb' (money services business)
    industry?: string; // Industry classification
    declared_income?: number; // Annual revenue
    net_worth?: number; // Total entity net worth
    currency_input?: string; // Currency for income/net_worth (e.g., 'BHD')
    iban?: string;
    swift_and_bic_code?: string;
    segment?: string;
  };

  // Ownership structure information
  ownership_structure?: {
    ubo_definition_satisfied?: boolean; // Ultimate Beneficial Owner identified?
    total_beneficial_owner_count?: number; // How many beneficial owners
    ownership_description_summary?: string; // Text summary of ownership
  };

  // List of beneficial owners (required for KYB)
  beneficial_owners?: Array<{
    // Required fields (same as individual identity_info)
    full_legal_name: string;
    date_of_birth: string; // YYYY-MM-DD
    nationality: string; // ISO country code
    country_of_residence: string;
    current_residential_address: string; // Comma-separated
    national_id_number: string;
    city_of_birth: string;
    country_of_birth: string;

    // Optional fields
    gender?: string;
    email?: string;
    phone_number?: string;
    passport_number?: string;
    occupation?: string;
  }>;

  // Optional compliance info
  compliance_data?: {
    source_of_funds_declaration?: string;
    source_of_funds_details?: string;
    countries_of_operation?: string[]; // List of countries where business operates
    estimated_annual_revenue_bhd?: number; // Annual revenue in BHD currency
  };

  // Optional documents
  document_data?: {
    document_type?: string;
    document_front_ref?: string;
    document_back_ref?: string;
    selfie_image_ref?: string;
  };
}
```

#### Callback Response: Onboarding Completion

When processing completes (within hours to days), Mirsad AI POSTs to your `callback_url`:

```typescript
interface MirsadCallbackResponse {
  request_id: string; // ID from the initial request response
  status: 'approved' | 'rejected' | 'on_hold'; // Final decision
  // Additional metadata may be included (depends on Mirsad AI version)
}
```

Your callback endpoint MUST:
1. Accept POST requests with `Content-Type: application/json`
2. Validate the `request_id` matches a request you submitted
3. Update your user/account record with the new KYC status
4. Respond with HTTP 200 OK (Mirsad AI will retry if you return non-2xx)
5. Log the callback for audit trail

#### Example Callback Handler (NestJS)

```typescript
@Controller('webhooks')
export class MirsadWebhookController {
  constructor(
    private kycService: KycService,
    private logger: Logger,
  ) {}

  @Post('mirsad-kyc-callback')
  async handleMirsadKycCallback(@Body() payload: MirsadCallbackResponse) {
    this.logger.log(
      `Mirsad AI KYC callback: request_id=${payload.request_id} status=${payload.status}`,
    );

    // Verify request_id exists and belongs to a pending KYC
    const kycRecord = await this.kycService.findByRequestId(payload.request_id);
    if (!kycRecord) {
      this.logger.warn(`Unknown request_id in callback: ${payload.request_id}`);
      return { ok: true }; // Still return 200 to prevent Mirsad AI retries
    }

    // Update user KYC status
    await this.kycService.updateStatus(kycRecord.userId, {
      status: payload.status,
      completedAt: new Date(),
    });

    if (payload.status === 'approved') {
      // Trigger downstream actions: DID NFT minting, payment activation, etc.
      await this.didNftService.issueDID(kycRecord.userId);
    }

    return { ok: true };
  }
}
```

---

### 2. Transaction Scoring Flow (AML)

**Endpoint**: `POST /api/v1/public/transaction-scoring`
**Auth**: None required
**Response**: Immediate (returns `request_id`); final result via callback

Submit transaction details (individual or corporate) for AML risk scoring. Mirsad AI analyzes:
- Destination risk (country sanctions, PEP lists)
- Transaction type risk (high-risk transaction patterns)
- Blockchain risk (on-chain analysis if blockchain is specified)
- Beneficiary risk (if beneficiary details provided)

#### Request Payload: Individual Transaction

```typescript
interface TransactionScoringRequest {
  flow: 'TransactionFlow'; // EXACT enum value (case-sensitive)
  customer_type: 'INDIVIDUAL' | 'CORPORATE';
  timestamp: string; // ISO 8601 / RFC 3339
  user_id: string; // Your platform's unique user ID
  callback_url: string; // REQUIRED: where Mirsad AI POSTs result
  data: {
    transaction_type: // Required: specific transaction pattern
      | 'p2p' // Peer-to-peer transfer
      | 'merchant_payment' // Payment to merchant/service
      | 'cross_border' // International transfer
      | 'crypto_onramp' // Fiat-to-crypto conversion
      | 'crypto_offramp' // Crypto-to-fiat conversion
      | 'cash_deposit_withdrawal'; // Cash deposit or ATM withdrawal

    amount: number; // Transaction amount (required)
    currency_input: string; // ISO 4217 currency (e.g., 'USD', 'HBAR', 'BHD')

    // Blockchain fields
    source_address: string; // Sender blockchain address (required)
    destination_address: string; // Recipient blockchain address (required)
    blockchain_type?:
      | 'HEDERA' // Hedera network (supported)
      | 'ETHEREUM'
      | 'BITCOIN'
      | 'OPTIMISM'
      | 'ALGORAND'
      | 'CARDANO'
      | 'SUI'
      | 'AVALANCHE'
      | 'TRON'
      | 'ARBITRUMONE'
      | 'POLYGON'
      | 'SOLANA'
      | 'RIPPLE'
      | 'BSC'; // Binance Smart Chain

    // Risk context
    ip_location_country?: string; // Country where transaction originated
    destination_country?: string; // Country of destination address
    reference_number?: string; // Your internal transaction ID for audit
    purpose_of_transaction?: string; // Why this transaction (e.g., 'payment for services')
    is_on_chain?: boolean; // Is this an on-chain transaction? (for scoring purposes)

    // Beneficiary information
    beneficiary: {
      // Required fields
      full_legal_name: string;
      date_of_birth?: string; // YYYY-MM-DD if known
      nationality?: string;
      country_of_residence?: string;

      // Optional banking details
      iban?: string;
      swift?: string; // NOTE: "swift" not "swift_and_bic_code" (different from onboarding)

      // Mirsad AI reference
      olara_recipient_id?: string; // If beneficiary previously verified with Mirsad AI

      // Relationship context
      relationship?: string; // E.g., 'family', 'colleague', 'customer', 'vendor'

      // Optional identity
      national_id_number?: string;
      passport_number?: string;
      email?: string;
      phone_number?: string;
      current_residential_address?: string;
    };
  };
}
```

#### Request Payload: Corporate Transaction

For corporate customers, the `data.beneficiary` structure is similar, but uses:

```typescript
interface CorporateTransactionBeneficiary {
  // Entity identification
  legal_entity_name: string;
  business_registration_number: string;
  country_of_incorporation?: string;
  tax_identification_number?: string;
  business_address?: string;

  // Banking details
  iban?: string;
  swift?: string;

  // Beneficial owners (if known)
  beneficial_owners?: Array<{
    full_legal_name: string;
    date_of_birth?: string;
    nationality?: string;
    ownership_percentage?: number;
  }>;

  // Mirsad AI reference
  olara_recipient_id?: string;
  relationship?: string;
}
```

#### Callback Response: Transaction Scoring Completion

```typescript
interface TransactionScoringCallbackResponse {
  request_id: string;
  status: 'approved' | 'rejected' | 'on_hold'; // Risk decision
  risk_score?: number; // Optional risk percentage (0-100)
  risk_level?: 'low' | 'medium' | 'high'; // Optional risk tier
}
```

Your callback endpoint MUST:
1. Accept the transaction scoring result
2. Update transaction status: allow if approved, block/hold if rejected
3. Log for compliance audit trail
4. Notify user if transaction was rejected
5. Return HTTP 200 OK

---

## TypeScript Service Interface

```typescript
/**
 * VERIFIED: Mirsad AI KYC/AML Service
 * Based on official Mirsad AI API documentation
 *
 * Implementation Notes:
 * - Use @nestjs/axios for HTTP calls
 * - Validate all requests before submission (use class-validator DTOs)
 * - Store request_id in database for callback correlation
 * - Implement retry logic for callback failures (exponential backoff)
 * - Encrypt sensitive data fields in-flight (HTTPS only)
 */

interface IMirsadAiService {
  /**
   * Submit individual for KYC onboarding verification.
   * Async: returns request_id immediately, result via callback.
   *
   * @param userId - Platform user ID
   * @param data - Individual onboarding data
   * @param callbackUrl - URL where Mirsad AI will POST completion result
   * @returns request_id for tracking
   */
  submitIndividualOnboarding(
    userId: string,
    data: IndividualData,
    callbackUrl: string,
  ): Promise<{
    request_id: string;
    submitted_at: string; // ISO timestamp
  }>;

  /**
   * Submit business/corporate for KYB (Know Your Business) verification.
   * Async: returns request_id immediately, result via callback.
   *
   * @param userId - Platform user ID (account owner)
   * @param data - Corporate onboarding data
   * @param callbackUrl - URL where Mirsad AI will POST result
   * @returns request_id for tracking
   */
  submitCorporateOnboarding(
    userId: string,
    data: CorporateData,
    callbackUrl: string,
  ): Promise<{
    request_id: string;
    submitted_at: string;
  }>;

  /**
   * Submit individual transaction for AML risk scoring.
   * Async: returns request_id immediately, result via callback.
   *
   * @param userId - Platform user ID
   * @param transactionData - Transaction details
   * @param callbackUrl - URL where Mirsad AI will POST result
   * @returns request_id for tracking
   */
  submitIndividualTransactionScoring(
    userId: string,
    transactionData: any, // See TransactionScoringRequest.data
    callbackUrl: string,
  ): Promise<{
    request_id: string;
    submitted_at: string;
  }>;

  /**
   * Submit corporate transaction for AML risk scoring.
   * Async: returns request_id immediately, result via callback.
   *
   * @param userId - Platform user ID
   * @param transactionData - Transaction details
   * @param callbackUrl - URL where Mirsad AI will POST result
   * @returns request_id for tracking
   */
  submitCorporateTransactionScoring(
    userId: string,
    transactionData: any,
    callbackUrl: string,
  ): Promise<{
    request_id: string;
    submitted_at: string;
  }>;

}
```

---

## Integration Pattern for Social Platform

### 1. User Registration Flow

```
User submits identity → submitIndividualOnboarding() → receive request_id
                        ↓ (stored in database)
                    Mirsad AI processes (hours to days)
                        ↓
                    Mirsad AI POSTs callback (webhook)
                        ↓
                    handleMirsadKycCallback()
                        ↓
                    If approved: Mint DID NFT, enable payments
                    If rejected: Show rejection reason, suggest resubmission
```

### 2. Payment Authorization Flow

```
User initiates transaction → submitIndividualTransactionScoring()
                           → receive request_id
                           ↓
                       Mirsad AI risk scores (seconds to minutes)
                           ↓
                       Mirsad AI POSTs callback
                           ↓
                       handleTransactionCallback()
                           ↓
                       If approved: Execute transaction
                       If rejected: Block, notify user
```

### 3. Database Schema (User KYC Record)

```typescript
// Pseudo-schema for reference
interface UserKycRecord {
  user_id: string; // Platform user ID
  kyc_status: 'pending' | 'approved' | 'rejected' | 'expired';
  kyc_type: 'individual' | 'corporate';
  request_id: string; // Mirsad AI's request identifier
  submitted_at: Date;
  completed_at?: Date;
  rejection_reason?: string;
  verified_data?: {
    // Stored verified identity info for audit
    full_legal_name: string;
    date_of_birth?: string;
    nationality?: string;
    // ... other verified fields
  };
  ai_decision_summary?: string; // Summary from callback response if available
}

interface TransactionAmlRecord {
  transaction_id: string; // Your internal transaction ID
  user_id: string;
  request_id: string; // Mirsad AI's request identifier
  aml_status: 'pending' | 'approved' | 'rejected' | 'on_hold';
  risk_score?: number;
  risk_level?: string;
  submitted_at: Date;
  completed_at?: Date;
}
```

---

## Environment Variables

```bash
# Mirsad AI KYC/AML Configuration
MIRSAD_KYC_API_URL=https://dashboard-api.olara.io  # or staging: https://olara-api.var-meta.com

# Callback URL Configuration
MIRSAD_KYC_CALLBACK_URL=https://yourdomain.com/webhooks/mirsad-kyc-callback
MIRSAD_TRANSACTION_CALLBACK_URL=https://yourdomain.com/webhooks/mirsad-transaction-callback

# Feature Flags
MIRSAD_ENABLED=true
MIRSAD_VERIFY_REQUIRED_FOR_PAYMENTS=true  # Require KYC before transactions
MIRSAD_TRANSACTION_SCORING_ENABLED=true   # Enable real-time AML checks
```

---

## Important Implementation Notes

### Field Specification Quirks (From Real API)

1. **Flow Enum Values** (case-sensitive):
   - Onboarding: `"OnBoardingFlow"` (note PascalCase, not `OnboardingFlow`)
   - Transaction: `"TransactionFlow"` (PascalCase)

2. **Address Format**:
   - `current_residential_address` must be comma-separated: `"Street Address, City, Postal Code, Country"`
   - Not free-form text, but structured comma-delimited

3. **Banking Fields Differ by Flow**:
   - Onboarding beneficiary: `swift_and_bic_code`
   - Transaction beneficiary: `swift` (shorter field name)
   - Both refer to the same SWIFT code

4. **Blockchain Type Support**:
   - HEDERA is explicitly supported (use `"HEDERA"` exactly)
   - Full list: OPTIMISM, ALGORAND, CARDANO, SUI, BITCOIN, ETHEREUM, AVALANCHE, TRON, ARBITRUMONE, POLYGON, SOLANA, RIPPLE, HEDERA, BSC

5. **Callback URL Requirement**:
   - MUST be provided on every request (onboarding and transaction scoring)
   - Must be a public HTTPS endpoint
   - Mirsad AI will retry POSTs if endpoint returns non-2xx status

6. **Timestamp Format**:
   - ISO 8601 / RFC 3339 (e.g., `"2026-03-11T14:30:00Z"` or `"2026-03-11T14:30:00+00:00"`)

### Error Handling

```typescript
// Expected error scenarios:
// 1. Invalid request payload → 400 Bad Request
// 2. Missing required fields → 400 Bad Request (include validation details)
// 3. Server error → 500 Internal Server Error
// 4. Rate limit exceeded → 429 Too Many Requests
// 5. Service unavailable → 503 Service Unavailable

// Always log errors with request_id for support tickets
```

### Retry Strategy for Callbacks

Your webhook handler MUST be idempotent (safe to call multiple times):

```typescript
// Good: Check if request_id already processed before updating
async handleCallback(payload: MirsadCallbackResponse) {
  const existing = await db.findKycByRequestId(payload.request_id);

  if (existing && existing.completedAt) {
    // Already processed, return 200 to acknowledge without re-processing
    return { ok: true };
  }

  // First time processing this request_id
  await db.updateKyc(existing.userId, { status: payload.status });
  return { ok: true };
}
```

---

## Example Usage

### Submit Individual for KYC

```typescript
const kycRequest: OnboardingRequest = {
  flow: 'OnBoardingFlow',
  customer_type: 'INDIVIDUAL',
  timestamp: new Date().toISOString(),
  user_id: '550e8400-e29b-41d4-a716-446655440000',
  callback_url: 'https://app.hedera-social.io/webhooks/mirsad-kyc-callback',
  data: {
    identity_info: {
      full_legal_name: 'Jane Doe',
      date_of_birth: '1990-05-15',
      nationality: 'US',
      country_of_residence: 'US',
      current_residential_address: '123 Main Street, San Francisco, 94105, USA',
      national_id_number: 'SSN123456789',
      city_of_birth: 'New York',
      country_of_birth: 'US',
      email: 'jane@example.com',
      phone_number: '+14155551234',
      occupation: 'Software Engineer',
      declared_income: 150000,
      currency_input: 'USD',
    },
  },
};

const result = await mirsadService.submitIndividualOnboarding(
  user.id,
  kycRequest.data,
  kycRequest.callback_url,
);

console.log(`KYC submitted. Request ID: ${result.request_id}`);
// Store result.request_id in database for callback correlation
```

### Submit Transaction for AML Scoring

```typescript
const txRequest: TransactionScoringRequest = {
  flow: 'TransactionFlow',
  customer_type: 'INDIVIDUAL',
  timestamp: new Date().toISOString(),
  user_id: '550e8400-e29b-41d4-a716-446655440000',
  callback_url: 'https://app.hedera-social.io/webhooks/mirsad-transaction-callback',
  data: {
    transaction_type: 'p2p',
    amount: 100,
    currency_input: 'HBAR',
    source_address: '0.0.123456',
    destination_address: '0.0.789012',
    blockchain_type: 'HEDERA',
    purpose_of_transaction: 'Peer-to-peer payment',
    is_on_chain: true,
    beneficiary: {
      full_legal_name: 'John Smith',
      relationship: 'colleague',
    },
  },
};

const result = await mirsadService.submitIndividualTransactionScoring(
  user.id,
  txRequest.data,
  txRequest.callback_url,
);

console.log(`Transaction submitted for AML scoring: ${result.request_id}`);
```

---

## Open Questions & Known Gaps

### Clarifications Needed from Mirsad AI Team

1. **POST Response Schema**: What is the exact response format from `POST /api/v1/public/onboarding` and `POST /api/v1/public/transaction-scoring`? Docs show callback format, not initial POST response. We assume:
   ```json
   { "request_id": "uuid-or-string", "submitted_at": "ISO-timestamp" }
   ```

2. **Rate Limits**: Are there rate limits on public endpoints? Per-minute? Per-day? Per API key?

3. **Callback Retry Policy**: If our webhook is unreachable, how many times does Mirsad AI retry? What is the backoff strategy?

4. **Expiration**: How long are verification results valid? Does a KYC approval expire after 30/60/90 days?

5. **Document Upload**: For `document_front_ref`, `document_back_ref`, `selfie_image_ref` — must these be publicly accessible URLs, or can they be signed S3 URLs? Do they support multipart file uploads instead?

6. **Callback Signature**: Does Mirsad AI provide HMAC signatures on callbacks for verification? If so, what is the signing algorithm and secret?

7. **Data Retention**: How long does Mirsad AI retain submitted user data? Can we request deletion after verification is complete?

8. **High Net Worth Thresholds**: For CT-05 compliance and high net worth detection, what are the threshold amounts for different currencies? Is there a mapping for BHD, EUR, etc.?

---

## Related Documentation

- **hedera-integration.md** — Hedera SDK patterns (for DID NFT minting after KYC approval)
- **external-integrations.md** — Overview of all external service integrations
- **rules-and-standards.md** — API design and TypeScript standards
- **security.md** — Data handling and compliance requirements

---

## Checklist for Implementation

- [ ] Create `MirsadAiService` with interface from above
- [ ] Implement `submitIndividualOnboarding()` with full validation
- [ ] Implement `submitCorporateOnboarding()` with beneficial owner handling
- [ ] Implement transaction scoring for both individual and corporate
- [ ] Create webhook controllers for KYC and transaction callbacks
- [ ] Add database schema for storing `request_id` and KYC status
- [ ] Implement idempotent callback handlers (handle duplicates)
- [ ] Add error handling and retry logic
- [ ] Set up environment variables
- [ ] Write integration tests against Mirsad AI staging
- [ ] Document webhook payload validation
- [ ] Set up audit logging for all KYC/AML decisions
- [ ] Implement DID NFT minting trigger on KYC approval
- [ ] Add payment authorization gate (require KYC before transaction)

---

## Version History

- **2026-03-11**: Initial VERIFIED reference created from official Mirsad AI API documentation
- Flow enums, field specifications, and callback patterns verified
- Blockchain type support for HEDERA confirmed
- Only two endpoints: POST /api/v1/public/onboarding and POST /api/v1/public/transaction-scoring
