import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  MirsadNotConfiguredException,
  MirsadDisabledException,
  MirsadOnboardingFailedException,
  MirsadTransactionScoringFailedException,
  MirsadNotImplementedException,
  MirsadValidationException,
} from "./mirsad-ai.exceptions";

// ---------------------------------------------------------------------------
// Public interfaces — per Mirsad AI API docs
// ---------------------------------------------------------------------------

/**
 * Identity information for individual KYC onboarding.
 * Maps to Mirsad AI individual onboarding request format.
 * Reference: mirsad-ai-integration.md
 */
export interface MirsadIndividualData {
  identity_info: {
    full_legal_name: string;
    date_of_birth: string;
    nationality: string;
    country_of_residence: string;
    current_residential_address: string;
    national_id_number: string;
    city_of_birth?: string;
    country_of_birth?: string;
    gender?: string;
    email?: string;
    phone_number?: string;
    passport_number?: string;
    occupation?: string;
    business_type?: string;
    industry?: string;
    declared_income?: number;
    net_worth?: number;
    currency_input?: string;
    iban?: string;
    swift_and_bic_code?: string;
    segment?: string;
  };
  document_data?: {
    document_type?: string;
    document_front_ref?: string;
    document_back_ref?: string;
    selfie_image_ref?: string;
  };
  compliance_data?: {
    source_of_funds_declaration?: string;
    source_of_funds_details?: string;
  };
}

/**
 * Entity information for corporate KYC/KYB onboarding.
 * Maps to Mirsad AI corporate onboarding request format.
 * Reference: mirsad-ai-integration.md
 */
export interface MirsadCorporateData {
  entity_info: {
    legal_entity_name: string;
    country_of_incorporation: string;
    business_registration_number: string;
    business_address: string;
    primary_activity_description?: string;
    tax_identification_number?: string;
    trade_licenses_ref?: string;
    email?: string;
    phone_number?: string;
    business_type?: string;
    industry?: string;
    declared_income?: number;
    net_worth?: number;
    currency_input?: string;
    iban?: string;
    swift_and_bic_code?: string;
    segment?: string;
  };
  beneficial_owners?: Array<{
    full_legal_name: string;
    date_of_birth: string;
    nationality: string;
    country_of_residence: string;
    current_residential_address: string;
    national_id_number: string;
    city_of_birth?: string;
    country_of_birth?: string;
    gender?: string;
    email?: string;
    phone_number?: string;
    passport_number?: string;
    occupation?: string;
  }>;
  ownership_structure?: {
    ubo_definition_satisfied?: boolean;
    total_beneficial_owner_count?: number;
    ownership_description_summary?: string;
  };
  document_data?: {
    document_type?: string;
    document_front_ref?: string;
    document_back_ref?: string;
    selfie_image_ref?: string;
  };
  compliance_data?: {
    source_of_funds_declaration?: string;
    source_of_funds_details?: string;
    countries_of_operation?: string[];
    estimated_annual_revenue_bhd?: number;
  };
}

/**
 * Response from Mirsad AI onboarding submission.
 */
export interface MirsadOnboardingResponse {
  request_id: string;
  submitted_at: string;
}

/**
 * Supported blockchain types for Mirsad AI transaction scoring.
 */
export type MirsadBlockchainType =
  | "HEDERA"
  | "ETHEREUM"
  | "BITCOIN"
  | "OPTIMISM"
  | "ALGORAND"
  | "CARDANO"
  | "SUI"
  | "AVALANCHE"
  | "TRON"
  | "ARBITRUMONE"
  | "POLYGON"
  | "SOLANA"
  | "RIPPLE"
  | "BSC";

/**
 * Supported transaction types for Mirsad AI transaction scoring.
 */
export type MirsadTransactionType =
  | "p2p"
  | "merchant_payment"
  | "cross_border"
  | "crypto_onramp"
  | "crypto_offramp"
  | "cash_deposit_withdrawal";

/**
 * Beneficiary information for individual transaction scoring.
 */
export interface MirsadIndividualBeneficiary {
  full_legal_name: string;
  date_of_birth?: string;
  nationality?: string;
  country_of_residence?: string;
  iban?: string;
  swift?: string;
  olara_recipient_id?: string;
  relationship?: string;
  national_id_number?: string;
  passport_number?: string;
  email?: string;
  phone_number?: string;
  current_residential_address?: string;
}

/**
 * Beneficiary information for corporate transaction scoring.
 */
export interface MirsadCorporateBeneficiary {
  legal_entity_name: string;
  business_registration_number: string;
  country_of_incorporation?: string;
  tax_identification_number?: string;
  business_address?: string;
  iban?: string;
  swift?: string;
  beneficial_owners?: Array<{
    full_legal_name: string;
    date_of_birth?: string;
    nationality?: string;
    ownership_percentage?: number;
  }>;
  olara_recipient_id?: string;
  relationship?: string;
}

/**
 * Transaction data for Mirsad AI AML scoring.
 */
export interface MirsadTransactionData {
  transaction_type: MirsadTransactionType;
  amount: number;
  currency_input: string;
  source_address: string;
  destination_address: string;
  blockchain_type?: MirsadBlockchainType;
  ip_location_country?: string;
  destination_country?: string;
  reference_number?: string;
  purpose_of_transaction?: string;
  is_on_chain?: boolean;
  beneficiary: MirsadIndividualBeneficiary | MirsadCorporateBeneficiary;
}

/**
 * Response from Mirsad AI transaction scoring submission.
 */
export interface MirsadTransactionScoringResponse {
  request_id: string;
  submitted_at: string;
}

// ---------------------------------------------------------------------------
// Internal types — payload shapes sent to the Mirsad AI API
// ---------------------------------------------------------------------------

/**
 * Full onboarding request payload as required by the Mirsad AI API.
 */
interface MirsadOnboardingRequestPayload {
  flow: "OnBoardingFlow";
  customer_type: "INDIVIDUAL" | "CORPORATE";
  timestamp: string;
  user_id: string;
  callback_url: string;
  data: MirsadIndividualData | MirsadCorporateData;
}

/**
 * Full transaction scoring request payload as required by the Mirsad AI API.
 */
interface MirsadTransactionScoringRequestPayload {
  flow: "TransactionFlow";
  customer_type: "INDIVIDUAL" | "CORPORATE";
  timestamp: string;
  user_id: string;
  callback_url: string;
  data: MirsadTransactionData;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class MirsadAiService implements OnModuleInit {
  private readonly logger = new Logger(MirsadAiService.name);

  /** Mirsad AI base URL (e.g. https://dashboard-api.olara.io) */
  private apiUrl: string | undefined;

  /** Platform callback URL that Mirsad AI will POST results to */
  private callbackUrl: string | undefined;

  /** Whether the Mirsad AI integration is enabled */
  private enabled = false;

  /** Whether the service has been fully configured (enabled + URLs present) */
  private configured = false;

  private static readonly ONBOARDING_PATH = "/api/v1/public/onboarding";
  private static readonly TRANSACTION_SCORING_PATH =
    "/api/v1/public/transaction-scoring";

  /** HTTP request timeout in milliseconds */
  private static readonly REQUEST_TIMEOUT_MS = 30_000;

  constructor(private readonly configService: ConfigService) {}

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  onModuleInit(): void {
    this.enabled =
      this.configService.get<boolean>("mirsadKyc.enabled") ?? false;
    this.apiUrl = this.configService.get<string>("mirsadKyc.apiUrl");
    this.callbackUrl = this.configService.get<string>("mirsadKyc.callbackUrl");

    if (!this.enabled) {
      this.logger.warn(
        "Mirsad AI KYC service is DISABLED. " +
          "Set MIRSAD_KYC_ENABLED=true to enable KYC/AML verification.",
      );
      return;
    }

    if (!this.apiUrl) {
      this.logger.error(
        "Mirsad AI KYC is enabled but MIRSAD_KYC_API_URL is not set. " +
          "The service will reject all requests until the URL is configured.",
      );
      return;
    }

    if (!this.callbackUrl) {
      this.logger.error(
        "Mirsad AI KYC is enabled but MIRSAD_KYC_CALLBACK_URL is not set. " +
          "The service will reject all requests until the callback URL is configured.",
      );
      return;
    }

    this.configured = true;
    this.logger.log(
      `Mirsad AI KYC service initialized — API: ${this.apiUrl}, callback: ${this.callbackUrl}`,
    );
  }

  // -----------------------------------------------------------------------
  // Public helpers
  // -----------------------------------------------------------------------

  /**
   * Whether the Mirsad AI service is fully configured and operational.
   */
  isConfigured(): boolean {
    return this.configured;
  }

  // -----------------------------------------------------------------------
  // Onboarding — Individual
  // -----------------------------------------------------------------------

  /**
   * Submit individual KYC onboarding data to Mirsad AI.
   *
   * This is an async-callback flow: the method returns a `request_id`
   * immediately. The final KYC decision (approved/rejected/on_hold)
   * will be delivered to the platform callback URL configured in
   * MIRSAD_KYC_CALLBACK_URL.
   *
   * @param userId  - Platform user ID for tracking
   * @param data    - Individual identity, document, and compliance data
   * @returns Onboarding response with request_id for callback correlation
   */
  async submitIndividualOnboarding(
    userId: string,
    data: MirsadIndividualData,
  ): Promise<MirsadOnboardingResponse> {
    this.ensureConfigured();
    this.validateIndividualData(data);

    const payload: MirsadOnboardingRequestPayload = {
      flow: "OnBoardingFlow",
      customer_type: "INDIVIDUAL",
      timestamp: new Date().toISOString(),
      user_id: userId,
      callback_url: this.callbackUrl!,
      data,
    };

    this.logger.log(
      `Submitting individual KYC onboarding for user ${userId} to Mirsad AI`,
    );

    return this.postOnboarding(payload, userId);
  }

  // -----------------------------------------------------------------------
  // Onboarding — Corporate
  // -----------------------------------------------------------------------

  /**
   * Submit corporate KYC/KYB onboarding data to Mirsad AI.
   *
   * Async-callback flow: returns `request_id` immediately.
   * Final decision delivered via callback.
   *
   * @param userId  - Platform user ID (account owner)
   * @param data    - Corporate entity, beneficial owner, and document data
   * @returns Onboarding response with request_id for callback correlation
   */
  async submitCorporateOnboarding(
    userId: string,
    data: MirsadCorporateData,
  ): Promise<MirsadOnboardingResponse> {
    this.ensureConfigured();
    this.validateCorporateData(data);

    const payload: MirsadOnboardingRequestPayload = {
      flow: "OnBoardingFlow",
      customer_type: "CORPORATE",
      timestamp: new Date().toISOString(),
      user_id: userId,
      callback_url: this.callbackUrl!,
      data,
    };

    this.logger.log(
      `Submitting corporate KYC onboarding for user ${userId} to Mirsad AI`,
    );

    return this.postOnboarding(payload, userId);
  }

  // -----------------------------------------------------------------------
  // Generic KYC wrapper
  // -----------------------------------------------------------------------

  /**
   * Submit KYC data to Mirsad AI for verification.
   *
   * This is a convenience wrapper that delegates to either
   * `submitIndividualOnboarding` or `submitCorporateOnboarding`
   * depending on the `customer_type` field in the data.
   *
   * @param kycData - Must include `customer_type`, `userId`, and
   *                  either individual or corporate data fields
   */
  async submitKyc(kycData: {
    customer_type: "INDIVIDUAL" | "CORPORATE";
    userId: string;
    individual?: MirsadIndividualData;
    corporate?: MirsadCorporateData;
  }): Promise<MirsadOnboardingResponse> {
    if (kycData.customer_type === "INDIVIDUAL") {
      if (!kycData.individual) {
        throw new MirsadValidationException(
          "individual",
          "Individual data is required when customer_type is INDIVIDUAL",
        );
      }
      return this.submitIndividualOnboarding(
        kycData.userId,
        kycData.individual,
      );
    }

    if (!kycData.corporate) {
      throw new MirsadValidationException(
        "corporate",
        "Corporate data is required when customer_type is CORPORATE",
      );
    }
    return this.submitCorporateOnboarding(kycData.userId, kycData.corporate);
  }

  // -----------------------------------------------------------------------
  // KYC Status
  // -----------------------------------------------------------------------

  /**
   * Check KYC verification status.
   *
   * The Mirsad AI API is purely callback-based and does **not** expose a
   * status-polling endpoint. KYC results are delivered asynchronously to
   * the callback URL provided during submission.
   *
   * This method always throws to make it clear that callers should rely on
   * the webhook/callback handler, not polling.
   *
   * @param _requestId - The request_id from the onboarding submission
   * @throws MirsadNotImplementedException always
   */
  async checkKycStatus(_requestId: string): Promise<never> {
    throw new MirsadNotImplementedException(
      "checkKycStatus",
      "Mirsad AI uses an async callback model. " +
        "KYC results are delivered via HTTP POST to the configured callback URL " +
        "(MIRSAD_KYC_CALLBACK_URL). There is no status-polling endpoint. " +
        "Implement a webhook handler to receive results.",
    );
  }

  // -----------------------------------------------------------------------
  // Transaction Scoring
  // -----------------------------------------------------------------------

  /**
   * Submit a transaction for AML risk scoring via Mirsad AI.
   *
   * Async-callback flow: returns `request_id` immediately.
   * The risk decision (approved/rejected/on_hold) is delivered
   * to the callback URL.
   *
   * @param userId          - Platform user ID initiating the transaction
   * @param customerType    - Whether the sender is INDIVIDUAL or CORPORATE
   * @param transactionData - Transaction details including beneficiary info
   * @returns Transaction scoring response with request_id
   */
  async submitTransactionScoring(
    userId: string,
    customerType: "INDIVIDUAL" | "CORPORATE",
    transactionData: MirsadTransactionData,
  ): Promise<MirsadTransactionScoringResponse> {
    this.ensureConfigured();
    this.validateTransactionData(transactionData);

    const payload: MirsadTransactionScoringRequestPayload = {
      flow: "TransactionFlow",
      customer_type: customerType,
      timestamp: new Date().toISOString(),
      user_id: userId,
      callback_url: this.callbackUrl!,
      data: transactionData,
    };

    this.logger.log(
      `Submitting transaction scoring for user ${userId} ` +
        `(type=${transactionData.transaction_type}, ` +
        `amount=${transactionData.amount} ${transactionData.currency_input}) ` +
        `to Mirsad AI`,
    );

    return this.postTransactionScoring(payload, userId);
  }

  // -----------------------------------------------------------------------
  // Private — HTTP callers
  // -----------------------------------------------------------------------

  /**
   * POST to the Mirsad AI onboarding endpoint and return the parsed response.
   */
  private async postOnboarding(
    payload: MirsadOnboardingRequestPayload,
    userId: string,
  ): Promise<MirsadOnboardingResponse> {
    const url = `${this.apiUrl}${MirsadAiService.ONBOARDING_PATH}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(MirsadAiService.REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(
          `Mirsad AI onboarding failed for user ${userId}: ` +
            `HTTP ${response.status} — ${errorBody}`,
        );
        throw new MirsadOnboardingFailedException(
          `HTTP ${response.status}: ${errorBody}`,
        );
      }

      const result = (await response.json()) as MirsadOnboardingResponse;

      this.logger.log(
        `Mirsad AI onboarding submitted for user ${userId} — ` +
          `request_id=${result.request_id}, submitted_at=${result.submitted_at}`,
      );

      return result;
    } catch (error: unknown) {
      if (error instanceof MirsadOnboardingFailedException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Mirsad AI onboarding request failed for user ${userId}: ${message}`,
      );
      throw new MirsadOnboardingFailedException(message);
    }
  }

  /**
   * POST to the Mirsad AI transaction scoring endpoint and return the parsed response.
   */
  private async postTransactionScoring(
    payload: MirsadTransactionScoringRequestPayload,
    userId: string,
  ): Promise<MirsadTransactionScoringResponse> {
    const url = `${this.apiUrl}${MirsadAiService.TRANSACTION_SCORING_PATH}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(MirsadAiService.REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(
          `Mirsad AI transaction scoring failed for user ${userId}: ` +
            `HTTP ${response.status} — ${errorBody}`,
        );
        throw new MirsadTransactionScoringFailedException(
          `HTTP ${response.status}: ${errorBody}`,
        );
      }

      const result =
        (await response.json()) as MirsadTransactionScoringResponse;

      this.logger.log(
        `Mirsad AI transaction scoring submitted for user ${userId} — ` +
          `request_id=${result.request_id}, submitted_at=${result.submitted_at}`,
      );

      return result;
    } catch (error: unknown) {
      if (error instanceof MirsadTransactionScoringFailedException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Mirsad AI transaction scoring request failed for user ${userId}: ${message}`,
      );
      throw new MirsadTransactionScoringFailedException(message);
    }
  }

  // -----------------------------------------------------------------------
  // Private — Guards & Validation
  // -----------------------------------------------------------------------

  /**
   * Ensure the service is enabled and fully configured before making API calls.
   * Throws a typed exception if not ready.
   */
  private ensureConfigured(): void {
    if (!this.enabled) {
      throw new MirsadDisabledException();
    }
    if (!this.configured) {
      throw new MirsadNotConfiguredException();
    }
  }

  /**
   * Validate required fields for individual onboarding data.
   */
  private validateIndividualData(data: MirsadIndividualData): void {
    const info = data.identity_info;
    if (!info.full_legal_name) {
      throw new MirsadValidationException(
        "identity_info.full_legal_name",
        "Full legal name is required for sanction list screening",
      );
    }
    if (!info.date_of_birth) {
      throw new MirsadValidationException(
        "identity_info.date_of_birth",
        "Date of birth is required (YYYY-MM-DD format)",
      );
    }
    if (!info.nationality) {
      throw new MirsadValidationException(
        "identity_info.nationality",
        "Nationality is required (ISO 3166-1 alpha-2 country code)",
      );
    }
    if (!info.country_of_residence) {
      throw new MirsadValidationException(
        "identity_info.country_of_residence",
        "Country of residence is required",
      );
    }
    if (!info.current_residential_address) {
      throw new MirsadValidationException(
        "identity_info.current_residential_address",
        "Residential address is required (comma-separated: street, city, postal code, country)",
      );
    }
    if (!info.national_id_number) {
      throw new MirsadValidationException(
        "identity_info.national_id_number",
        "National ID number is required for identity verification",
      );
    }
  }

  /**
   * Validate required fields for corporate onboarding data.
   */
  private validateCorporateData(data: MirsadCorporateData): void {
    const entity = data.entity_info;
    if (!entity.legal_entity_name) {
      throw new MirsadValidationException(
        "entity_info.legal_entity_name",
        "Legal entity name is required",
      );
    }
    if (!entity.country_of_incorporation) {
      throw new MirsadValidationException(
        "entity_info.country_of_incorporation",
        "Country of incorporation is required",
      );
    }
    if (!entity.business_registration_number) {
      throw new MirsadValidationException(
        "entity_info.business_registration_number",
        "Business registration number is required",
      );
    }
    if (!entity.business_address) {
      throw new MirsadValidationException(
        "entity_info.business_address",
        "Business address is required (comma-separated: street, city, postal code, country)",
      );
    }
  }

  /**
   * Validate required fields for transaction scoring data.
   */
  private validateTransactionData(data: MirsadTransactionData): void {
    if (!data.transaction_type) {
      throw new MirsadValidationException(
        "transaction_type",
        "Transaction type is required",
      );
    }
    if (data.amount === undefined || data.amount === null) {
      throw new MirsadValidationException(
        "amount",
        "Transaction amount is required",
      );
    }
    if (!data.currency_input) {
      throw new MirsadValidationException(
        "currency_input",
        "Currency input is required (ISO 4217 code, e.g. USD, HBAR, BHD)",
      );
    }
    if (!data.source_address) {
      throw new MirsadValidationException(
        "source_address",
        "Source blockchain address is required",
      );
    }
    if (!data.destination_address) {
      throw new MirsadValidationException(
        "destination_address",
        "Destination blockchain address is required",
      );
    }
    if (!data.beneficiary) {
      throw new MirsadValidationException(
        "beneficiary",
        "Beneficiary information is required",
      );
    }
  }
}
