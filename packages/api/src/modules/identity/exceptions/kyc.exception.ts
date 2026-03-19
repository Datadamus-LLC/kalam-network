import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Thrown when KYC submission to Mirsad AI fails.
 */
export class KycSubmissionException extends HttpException {
  public readonly code: string;

  constructor(message: string, code: string = "KYC_SUBMISSION_FAILED") {
    super(
      {
        success: false,
        data: null,
        error: {
          code,
          message,
        },
        timestamp: new Date().toISOString(),
      },
      HttpStatus.BAD_GATEWAY,
    );
    this.code = code;
  }
}

/**
 * Thrown when a user is not in the correct status to submit KYC.
 * E.g., user hasn't created a wallet yet, or KYC already submitted.
 */
export class KycInvalidStateException extends HttpException {
  public readonly code: string;

  constructor(userId: string, currentStatus: string, requiredStatus: string) {
    const code = "KYC_INVALID_STATE";
    super(
      {
        success: false,
        data: null,
        error: {
          code,
          message: `User ${userId} is in status '${currentStatus}', but '${requiredStatus}' is required for KYC submission`,
        },
        timestamp: new Date().toISOString(),
      },
      HttpStatus.CONFLICT,
    );
    this.code = code;
  }
}

/**
 * Thrown when a KYC callback references an unknown request_id.
 */
export class KycCallbackInvalidException extends HttpException {
  public readonly code = "KYC_CALLBACK_INVALID";

  constructor(requestId: string) {
    super(
      {
        success: false,
        data: null,
        error: {
          code: "KYC_CALLBACK_INVALID",
          message: `Unknown KYC request_id in callback: ${requestId}`,
        },
        timestamp: new Date().toISOString(),
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

/**
 * Thrown when DID NFT minting fails on Hedera.
 */
export class DidNftMintException extends HttpException {
  public readonly code: string;

  constructor(message: string, code: string = "DID_NFT_MINT_FAILED") {
    super(
      {
        success: false,
        data: null,
        error: {
          code,
          message,
        },
        timestamp: new Date().toISOString(),
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    this.code = code;
  }
}

/**
 * Thrown when HCS topic creation fails during onboarding.
 */
export class TopicCreationException extends HttpException {
  public readonly code: string;

  constructor(message: string, code: string = "TOPIC_CREATION_FAILED") {
    super(
      {
        success: false,
        data: null,
        error: {
          code,
          message,
        },
        timestamp: new Date().toISOString(),
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    this.code = code;
  }
}

/**
 * Thrown when the overall onboarding orchestration fails.
 */
export class OnboardingException extends HttpException {
  public readonly code: string;

  constructor(
    message: string,
    code: string = "ONBOARDING_FAILED",
    statusCode: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
  ) {
    super(
      {
        success: false,
        data: null,
        error: {
          code,
          message,
        },
        timestamp: new Date().toISOString(),
      },
      statusCode,
    );
    this.code = code;
  }
}

/**
 * Thrown when KYC auto-approval is attempted in a production environment.
 * Auto-approval is only permitted in development/staging with Mirsad AI disabled.
 * Configure MIRSAD_KYC_ENABLED=true and supply valid MIRSAD_KYC_API_URL credentials.
 */
export class KycAutoApprovalDisabledException extends HttpException {
  public readonly code = "KYC_AUTO_APPROVAL_DISABLED";

  constructor() {
    super(
      {
        success: false,
        data: null,
        error: {
          code: "KYC_AUTO_APPROVAL_DISABLED",
          message:
            "KYC auto-approval is disabled in production. Configure Mirsad AI credentials.",
        },
        timestamp: new Date().toISOString(),
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

/**
 * Thrown when KYC status check finds the user has no pending KYC record.
 */
export class KycRecordNotFoundException extends HttpException {
  public readonly code = "KYC_RECORD_NOT_FOUND";

  constructor(userId: string) {
    super(
      {
        success: false,
        data: null,
        error: {
          code: "KYC_RECORD_NOT_FOUND",
          message: `No KYC record found for user ${userId}`,
        },
        timestamp: new Date().toISOString(),
      },
      HttpStatus.NOT_FOUND,
    );
  }
}
