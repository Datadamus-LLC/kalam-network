import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserEntity } from "../../../database/entities/user.entity";
import {
  MirsadAiService,
  MirsadIndividualData,
  MirsadCorporateData,
} from "../../integrations/mirsad-ai/mirsad-ai.service";
import {
  IndividualKycSubmitDto,
  CorporateKycSubmitDto,
} from "../dto/kyc-submit.dto";
import {
  KycSubmissionException,
  KycInvalidStateException,
  KycCallbackInvalidException,
  KycRecordNotFoundException,
  KycAutoApprovalDisabledException,
} from "../exceptions/kyc.exception";
import { UserNotFoundException } from "../exceptions/wallet-creation.exception";
import { OnboardingService } from "./onboarding.service";

/**
 * Result of a KYC submission.
 */
export interface KycSubmissionResult {
  requestId: string;
  submittedAt: string;
  userId: string;
  customerType: "INDIVIDUAL" | "CORPORATE";
}

/**
 * KYC status information returned to the controller.
 */
export interface KycStatusInfo {
  status: string;
  kycRequestId: string | null;
  kycSubmittedAt: Date | null;
  kycCompletedAt: Date | null;
  canResubmit: boolean;
}

/**
 * KycService — orchestrates KYC submission, callback handling, and status management.
 *
 * Flow:
 * 1. User submits KYC data via controller
 * 2. Data is validated by DTO layer
 * 3. Data is transformed to Mirsad AI format and submitted
 * 4. request_id is stored in user record
 * 5. User status changes to 'kyc_submitted'
 * 6. Mirsad AI processes and POSTs callback to webhook endpoint
 * 7. Callback handler verifies request_id and updates status
 *
 * Reference: mirsad-ai-integration.md
 */
@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly mirsadAiService: MirsadAiService,
    private readonly onboardingService: OnboardingService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Submit individual KYC data to Mirsad AI.
   *
   * @param userId - Platform user ID (from JWT)
   * @param dto - Validated individual KYC data
   * @returns KycSubmissionResult with request_id for tracking
   * @throws UserNotFoundException if user does not exist
   * @throws KycInvalidStateException if user is not in 'pending_kyc' or 'kyc_rejected' status
   * @throws KycSubmissionException if Mirsad AI API call fails
   */
  async submitIndividualKyc(
    userId: string,
    dto: IndividualKycSubmitDto,
  ): Promise<KycSubmissionResult> {
    const user = await this.validateUserForKyc(userId);

    const mirsadData: MirsadIndividualData = {
      identity_info: {
        full_legal_name: dto.fullLegalName,
        date_of_birth: dto.dateOfBirth,
        nationality: dto.nationality,
        country_of_residence: dto.countryOfResidence,
        current_residential_address: dto.currentResidentialAddress,
        national_id_number: dto.nationalIdNumber,
        city_of_birth: dto.cityOfBirth,
        country_of_birth: dto.countryOfBirth,
        gender: dto.gender,
        email: dto.email,
        phone_number: dto.phoneNumber,
        passport_number: dto.passportNumber,
        occupation: dto.occupation,
        business_type: dto.businessType,
        industry: dto.industry,
        declared_income: dto.declaredIncome,
        net_worth: dto.netWorth,
        currency_input: dto.currencyInput,
      },
    };

    // Add optional document data if provided
    if (dto.documentData) {
      mirsadData.document_data = {
        document_type: dto.documentData.documentType,
        document_front_ref: dto.documentData.documentFrontRef,
        document_back_ref: dto.documentData.documentBackRef,
        selfie_image_ref: dto.documentData.selfieImageRef,
      };
    }

    // Add optional compliance data if provided
    if (dto.complianceData) {
      mirsadData.compliance_data = {
        source_of_funds_declaration:
          dto.complianceData.sourceOfFundsDeclaration,
        source_of_funds_details: dto.complianceData.sourceOfFundsDetails,
      };
    }

    // Persist full legal name as display name
    await this.userRepository.update(user.id, {
      displayName: dto.fullLegalName,
    });

    if (!this.mirsadAiService.isConfigured()) {
      return this.autoApproveForDemo(user, "INDIVIDUAL");
    }

    return this.submitToMirsadAndUpdateUser(user, "INDIVIDUAL", mirsadData);
  }

  /**
   * Submit corporate KYC/KYB data to Mirsad AI.
   *
   * @param userId - Platform user ID (from JWT)
   * @param dto - Validated corporate KYC data
   * @returns KycSubmissionResult with request_id for tracking
   * @throws UserNotFoundException if user does not exist
   * @throws KycInvalidStateException if user is not in valid state for KYC
   * @throws KycSubmissionException if Mirsad AI API call fails
   */
  async submitCorporateKyc(
    userId: string,
    dto: CorporateKycSubmitDto,
  ): Promise<KycSubmissionResult> {
    const user = await this.validateUserForKyc(userId);

    const mirsadData: MirsadCorporateData = {
      entity_info: {
        legal_entity_name: dto.legalEntityName,
        country_of_incorporation: dto.countryOfIncorporation,
        business_registration_number: dto.businessRegistrationNumber,
        business_address: dto.businessAddress,
        primary_activity_description: dto.primaryActivityDescription,
        tax_identification_number: dto.taxIdentificationNumber,
        trade_licenses_ref: dto.tradeLicensesRef,
        email: dto.email,
        phone_number: dto.phoneNumber,
        business_type: dto.businessType,
        industry: dto.industry,
        declared_income: dto.declaredIncome,
        net_worth: dto.netWorth,
        currency_input: dto.currencyInput,
      },
    };

    // Add beneficial owners if provided
    if (dto.beneficialOwners && dto.beneficialOwners.length > 0) {
      mirsadData.beneficial_owners = dto.beneficialOwners.map((owner) => ({
        full_legal_name: owner.fullLegalName,
        date_of_birth: owner.dateOfBirth,
        nationality: owner.nationality,
        country_of_residence: owner.countryOfResidence,
        current_residential_address: owner.currentResidentialAddress,
        national_id_number: owner.nationalIdNumber,
        city_of_birth: owner.cityOfBirth,
        country_of_birth: owner.countryOfBirth,
        gender: owner.gender,
        email: owner.email,
        phone_number: owner.phoneNumber,
        passport_number: owner.passportNumber,
        occupation: owner.occupation,
      }));

      mirsadData.ownership_structure = {
        ubo_definition_satisfied: true,
        total_beneficial_owner_count: dto.beneficialOwners.length,
      };
    }

    // Add optional document data
    if (dto.documentData) {
      mirsadData.document_data = {
        document_type: dto.documentData.documentType,
        document_front_ref: dto.documentData.documentFrontRef,
        document_back_ref: dto.documentData.documentBackRef,
        selfie_image_ref: dto.documentData.selfieImageRef,
      };
    }

    // Add optional compliance data
    if (dto.complianceData) {
      mirsadData.compliance_data = {
        source_of_funds_declaration:
          dto.complianceData.sourceOfFundsDeclaration,
        source_of_funds_details: dto.complianceData.sourceOfFundsDetails,
        countries_of_operation: dto.complianceData.countriesOfOperation,
        estimated_annual_revenue_bhd:
          dto.complianceData.estimatedAnnualRevenueBhd,
      };
    }

    // Persist legal entity name as display name
    await this.userRepository.update(user.id, {
      displayName: dto.legalEntityName,
    });

    if (!this.mirsadAiService.isConfigured()) {
      return this.autoApproveForDemo(user, "CORPORATE");
    }

    return this.submitToMirsadAndUpdateUser(user, "CORPORATE", mirsadData);
  }

  /**
   * Handle a KYC callback from Mirsad AI.
   * Idempotent: if already processed, returns success without re-processing.
   *
   * @param requestId - The request_id from Mirsad AI callback
   * @param status - The KYC decision: 'approved', 'rejected', or 'on_hold'
   * @returns The user whose KYC status was updated
   * @throws KycCallbackInvalidException if request_id does not match any user
   */
  async handleKycCallback(
    requestId: string,
    status: "approved" | "rejected" | "on_hold",
  ): Promise<UserEntity> {
    this.logger.log(
      `Processing KYC callback: request_id=${requestId}, status=${status}`,
    );

    const user = await this.userRepository.findOne({
      where: { kycRequestId: requestId },
    });

    if (!user) {
      this.logger.warn(
        `KYC callback received for unknown request_id: ${requestId}`,
      );
      throw new KycCallbackInvalidException(requestId);
    }

    // Idempotent: if KYC already completed, do not re-process
    if (user.kycCompletedAt) {
      this.logger.log(
        `KYC callback for request_id=${requestId} already processed at ${user.kycCompletedAt.toISOString()} — skipping`,
      );
      return user;
    }

    const updateData: Partial<UserEntity> = {
      kycCompletedAt: new Date(),
    };

    if (status === "approved") {
      updateData.status = "active";
      updateData.kycLevel = "basic";
      this.logger.log(
        `KYC approved for user ${user.id} — transitioning to active`,
      );
    } else if (status === "rejected") {
      updateData.status = "kyc_rejected";
      this.logger.log(`KYC rejected for user ${user.id} — user can resubmit`);
    } else {
      // on_hold: keep as kyc_submitted, will be reviewed manually
      this.logger.log(
        `KYC on_hold for user ${user.id} — awaiting manual review`,
      );
    }

    await this.userRepository.update(user.id, updateData);

    // Return updated user
    const updatedUser = await this.userRepository.findOne({
      where: { id: user.id },
    });

    if (!updatedUser) {
      throw new UserNotFoundException(user.id);
    }

    return updatedUser;
  }

  /**
   * Get KYC status for a user.
   *
   * @param userId - Platform user ID
   * @returns KycStatusInfo with current status and metadata
   */
  async getKycStatus(userId: string): Promise<KycStatusInfo> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new UserNotFoundException(userId);
    }

    if (!user.kycRequestId) {
      throw new KycRecordNotFoundException(userId);
    }

    const canResubmit =
      user.status === "kyc_rejected" || user.status === "pending_kyc";

    return {
      status: user.status,
      kycRequestId: user.kycRequestId,
      kycSubmittedAt: user.kycSubmittedAt,
      kycCompletedAt: user.kycCompletedAt,
      canResubmit,
    };
  }

  /**
   * Find a user by their Mirsad AI KYC request_id.
   * Used internally for callback correlation.
   */
  async findByRequestId(requestId: string): Promise<UserEntity | null> {
    return this.userRepository.findOne({
      where: { kycRequestId: requestId },
    });
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Validate that a user exists and is in a valid state for KYC submission.
   */
  private async validateUserForKyc(userId: string): Promise<UserEntity> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new UserNotFoundException(userId);
    }

    // User must be in 'pending_kyc' (first submission) or 'kyc_rejected' (resubmission)
    const validStatuses = ["pending_kyc", "kyc_rejected"];
    if (!validStatuses.includes(user.status)) {
      throw new KycInvalidStateException(
        userId,
        user.status,
        "pending_kyc or kyc_rejected",
      );
    }

    // User must have a Hedera wallet
    if (!user.hederaAccountId) {
      throw new KycInvalidStateException(
        userId,
        user.status,
        "pending_kyc (wallet must be created first)",
      );
    }

    return user;
  }

  /**
   * Auto-approve KYC when Mirsad AI is disabled (development / staging mode only).
   * Runs the full post-KYC onboarding (DID NFT mint + HCS topics) and
   * returns a synthetic submission result.
   *
   * This method is intentionally blocked in production to prevent bypassing
   * identity verification. Set MIRSAD_KYC_ENABLED=true and configure valid
   * Mirsad AI credentials before deploying to production.
   */
  private async autoApproveForDemo(
    user: UserEntity,
    customerType: "INDIVIDUAL" | "CORPORATE",
  ): Promise<KycSubmissionResult> {
    if (this.configService.get<string>("NODE_ENV") === "production") {
      throw new KycAutoApprovalDisabledException();
    }

    const requestId = `demo-${user.id}`;
    const submittedAt = new Date().toISOString();

    await this.userRepository.update(user.id, {
      kycRequestId: requestId,
      kycSubmittedAt: new Date(),
      accountType: customerType === "INDIVIDUAL" ? "individual" : "business",
    });

    this.logger.warn(
      `KYC auto-approved for user ${user.id} (Mirsad AI disabled — demo mode)`,
    );

    // Run the full onboarding: mint DID NFT, create HCS topics, set active
    await this.onboardingService.completeOnboarding(user.id);

    return { requestId, submittedAt, userId: user.id, customerType };
  }

  /**
   * Submit data to Mirsad AI and update the user record with request tracking info.
   */
  private async submitToMirsadAndUpdateUser(
    user: UserEntity,
    customerType: "INDIVIDUAL" | "CORPORATE",
    data: MirsadIndividualData | MirsadCorporateData,
  ): Promise<KycSubmissionResult> {
    let response;

    try {
      if (customerType === "INDIVIDUAL") {
        response = await this.mirsadAiService.submitIndividualOnboarding(
          user.id,
          data as MirsadIndividualData,
        );
      } else {
        response = await this.mirsadAiService.submitCorporateOnboarding(
          user.id,
          data as MirsadCorporateData,
        );
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown Mirsad AI API error";
      this.logger.error(
        `Mirsad AI KYC submission failed for user ${user.id}: ${message}`,
      );
      throw new KycSubmissionException(
        `KYC submission to Mirsad AI failed: ${message}`,
      );
    }

    // Update user record with KYC tracking data
    await this.userRepository.update(user.id, {
      status: "kyc_submitted",
      kycRequestId: response.request_id,
      kycSubmittedAt: new Date(response.submitted_at),
      kycCompletedAt: undefined,
      accountType: customerType === "INDIVIDUAL" ? "individual" : "business",
    });

    this.logger.log(
      `KYC submitted for user ${user.id} — ` +
        `request_id: ${response.request_id}, type: ${customerType}`,
    );

    return {
      requestId: response.request_id,
      submittedAt: response.submitted_at,
      userId: user.id,
      customerType,
    };
  }
}
