import { HttpStatus } from "@nestjs/common";
import { BaseException } from "../../../common/exceptions/base.exception";

/**
 * Thrown when Tamam Custody API credentials are not configured.
 */
export class TamamCustodyNotConfiguredException extends BaseException {
  constructor() {
    super(
      "TAMAM_CUSTODY_NOT_CONFIGURED",
      "Tamam Custody API credentials are not configured. " +
        "Set TAMAM_CUSTODY_API_URL, TAMAM_CUSTODY_API_KEY, " +
        "TAMAM_CUSTODY_SIGNING_SECRET, TAMAM_CUSTODY_VAULT_ID, " +
        "and TAMAM_CUSTODY_ORG_ID to enable.",
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

/**
 * Thrown when a Tamam Custody API request fails with an error response.
 */
export class TamamCustodyApiException extends BaseException {
  constructor(
    operation: string,
    statusCode: number,
    apiErrorCode: string,
    apiMessage: string,
  ) {
    super(
      "TAMAM_CUSTODY_API_ERROR",
      `Tamam Custody ${operation} failed (HTTP ${statusCode}): [${apiErrorCode}] ${apiMessage}`,
      TamamCustodyApiException.mapHttpStatus(statusCode),
    );
  }

  private static mapHttpStatus(apiStatus: number): number {
    if (apiStatus === 401 || apiStatus === 403) {
      return HttpStatus.BAD_GATEWAY;
    }
    if (apiStatus === 429) {
      return HttpStatus.TOO_MANY_REQUESTS;
    }
    if (apiStatus >= 500) {
      return HttpStatus.BAD_GATEWAY;
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}

/**
 * Thrown when the Tamam Custody API is unreachable (network error).
 */
export class TamamCustodyNetworkException extends BaseException {
  constructor(operation: string, reason: string) {
    super(
      "TAMAM_CUSTODY_NETWORK_ERROR",
      `Tamam Custody ${operation} network error: ${reason}`,
      HttpStatus.BAD_GATEWAY,
    );
  }
}

/**
 * Thrown when the Tamam Custody API returns an unexpected response shape.
 */
export class TamamCustodyInvalidResponseException extends BaseException {
  constructor(operation: string, detail: string) {
    super(
      "TAMAM_CUSTODY_INVALID_RESPONSE",
      `Tamam Custody ${operation} returned an invalid response: ${detail}`,
      HttpStatus.BAD_GATEWAY,
    );
  }
}

/**
 * Thrown when transaction signing fails at the MPC layer.
 */
export class TamamCustodySigningException extends BaseException {
  constructor(keyShareId: string, reason: string) {
    super(
      "TAMAM_CUSTODY_SIGNING_FAILED",
      `MPC signing failed for key ${keyShareId}: ${reason}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

/**
 * Thrown when keypair generation / user onboarding fails.
 */
export class TamamCustodyKeypairException extends BaseException {
  constructor(reason: string) {
    super(
      "TAMAM_CUSTODY_KEYPAIR_FAILED",
      `MPC keypair generation failed: ${reason}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

/**
 * Thrown when custody transaction creation fails (step 1 of two-step signing).
 */
export class TamamCustodyTransactionCreationException extends BaseException {
  constructor(vaultId: string, reason: string) {
    super(
      "TAMAM_CUSTODY_TX_CREATION_FAILED",
      `Custody transaction creation failed for vault ${vaultId}: ${reason}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
