import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Thrown when wallet creation fails due to key generation, Hedera network errors,
 * or database persistence issues.
 */
export class WalletCreationException extends HttpException {
  public readonly code: string;

  constructor(message: string, code: string = "WALLET_CREATION_FAILED") {
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
      HttpStatus.BAD_REQUEST,
    );
    this.code = code;
  }
}

/**
 * Thrown when a user already has a Hedera wallet and attempts to create another.
 */
export class WalletAlreadyExistsException extends HttpException {
  public readonly code = "WALLET_ALREADY_EXISTS";

  constructor(userId: string, hederaAccountId: string) {
    super(
      {
        success: false,
        data: null,
        error: {
          code: "WALLET_ALREADY_EXISTS",
          message: `User ${userId} already has Hedera account ${hederaAccountId}`,
        },
        timestamp: new Date().toISOString(),
      },
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * Thrown when a user is not found in the database during wallet operations.
 */
export class UserNotFoundException extends HttpException {
  public readonly code = "USER_NOT_FOUND";

  constructor(identifier: string) {
    super(
      {
        success: false,
        data: null,
        error: {
          code: "USER_NOT_FOUND",
          message: `User not found: ${identifier}`,
        },
        timestamp: new Date().toISOString(),
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

/**
 * Thrown when account info lookup fails (account not found on Mirror Node or in DB).
 */
export class AccountNotFoundException extends HttpException {
  public readonly code = "ACCOUNT_NOT_FOUND";

  constructor(hederaAccountId: string) {
    super(
      {
        success: false,
        data: null,
        error: {
          code: "ACCOUNT_NOT_FOUND",
          message: `Hedera account not found: ${hederaAccountId}`,
        },
        timestamp: new Date().toISOString(),
      },
      HttpStatus.NOT_FOUND,
    );
  }
}
