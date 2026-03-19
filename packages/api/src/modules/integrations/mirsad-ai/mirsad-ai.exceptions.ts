import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Thrown when the Mirsad AI KYC service is not configured (disabled or missing API URL).
 */
export class MirsadNotConfiguredException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: "MIRSAD_NOT_CONFIGURED",
        message:
          "Mirsad AI KYC service is not configured. " +
          "Set MIRSAD_KYC_API_URL and MIRSAD_KYC_CALLBACK_URL, and enable with MIRSAD_KYC_ENABLED=true.",
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

/**
 * Thrown when the Mirsad AI KYC service is explicitly disabled via configuration.
 */
export class MirsadDisabledException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: "MIRSAD_DISABLED",
        message:
          "Mirsad AI KYC service is disabled. Set MIRSAD_KYC_ENABLED=true to enable.",
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

/**
 * Thrown when a submission to the Mirsad AI onboarding endpoint fails.
 */
export class MirsadOnboardingFailedException extends HttpException {
  constructor(reason: string) {
    super(
      {
        statusCode: HttpStatus.BAD_GATEWAY,
        error: "MIRSAD_ONBOARDING_FAILED",
        message: `Mirsad AI onboarding submission failed: ${reason}`,
      },
      HttpStatus.BAD_GATEWAY,
    );
  }
}

/**
 * Thrown when a submission to the Mirsad AI transaction scoring endpoint fails.
 */
export class MirsadTransactionScoringFailedException extends HttpException {
  constructor(reason: string) {
    super(
      {
        statusCode: HttpStatus.BAD_GATEWAY,
        error: "MIRSAD_TRANSACTION_SCORING_FAILED",
        message: `Mirsad AI transaction scoring submission failed: ${reason}`,
      },
      HttpStatus.BAD_GATEWAY,
    );
  }
}

/**
 * Thrown when a required field is missing from the KYC submission data.
 */
export class MirsadValidationException extends HttpException {
  constructor(field: string, detail: string) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: "MIRSAD_VALIDATION_ERROR",
        message: `Mirsad AI validation error for field '${field}': ${detail}`,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * Thrown when the Mirsad AI API does not support a requested operation
 * (e.g., status polling — results come via callback only).
 */
export class MirsadNotImplementedException extends HttpException {
  constructor(operation: string, reason: string) {
    super(
      {
        statusCode: HttpStatus.NOT_IMPLEMENTED,
        error: "MIRSAD_NOT_IMPLEMENTED",
        message: `Mirsad AI operation '${operation}' is not available: ${reason}`,
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
