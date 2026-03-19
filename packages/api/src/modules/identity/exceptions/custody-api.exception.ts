import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Thrown when the Tamam Custody API returns an error or is unreachable.
 */
export class CustodyApiException extends HttpException {
  public readonly code: string;

  constructor(
    message: string,
    code: string = "CUSTODY_API_ERROR",
    statusCode: HttpStatus = HttpStatus.BAD_GATEWAY,
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
 * Thrown when Tamam Custody API is not configured (missing required env vars).
 */
export class CustodyNotConfiguredException extends HttpException {
  public readonly code = "CUSTODY_NOT_CONFIGURED";

  constructor() {
    super(
      {
        success: false,
        data: null,
        error: {
          code: "CUSTODY_NOT_CONFIGURED",
          message:
            "Tamam Custody API not configured. Set TAMAM_CUSTODY_API_URL, TAMAM_CUSTODY_API_KEY, TAMAM_CUSTODY_SIGNING_SECRET, TAMAM_CUSTODY_VAULT_ID, and TAMAM_CUSTODY_ORG_ID to enable MPC custody operations.",
        },
        timestamp: new Date().toISOString(),
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

/**
 * Thrown when MPC key generation fails via Tamam Custody API.
 */
export class KeyGenerationException extends HttpException {
  public readonly code = "KEY_GENERATION_FAILED";

  constructor(message: string) {
    super(
      {
        success: false,
        data: null,
        error: {
          code: "KEY_GENERATION_FAILED",
          message,
        },
        timestamp: new Date().toISOString(),
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

/**
 * Thrown when transaction signing fails via Tamam MPC Custody.
 */
export class TransactionSigningException extends HttpException {
  public readonly code = "TRANSACTION_SIGNING_FAILED";

  constructor(message: string) {
    super(
      {
        success: false,
        data: null,
        error: {
          code: "TRANSACTION_SIGNING_FAILED",
          message,
        },
        timestamp: new Date().toISOString(),
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
