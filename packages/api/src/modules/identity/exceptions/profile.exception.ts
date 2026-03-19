import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Thrown when a requested username is already taken by another user.
 */
export class UsernameUnavailableException extends HttpException {
  readonly code = "USERNAME_UNAVAILABLE";

  constructor(username: string) {
    super(
      {
        success: false,
        data: null,
        error: {
          code: "USERNAME_UNAVAILABLE",
          message: `Username @${username} is already taken`,
        },
        timestamp: new Date().toISOString(),
      },
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * Thrown when a provided username does not meet format requirements.
 */
export class InvalidUsernameException extends HttpException {
  readonly code = "USERNAME_INVALID";

  constructor() {
    super(
      {
        success: false,
        data: null,
        error: {
          code: "USERNAME_INVALID",
          message:
            "Username must be 3-30 characters: letters, numbers, underscores only",
        },
        timestamp: new Date().toISOString(),
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * Thrown when a profile is not found by Hedera account ID or user ID.
 */
export class ProfileNotFoundException extends HttpException {
  public readonly code = "PROFILE_NOT_FOUND";

  constructor(identifier: string) {
    super(
      {
        success: false,
        data: null,
        error: {
          code: "PROFILE_NOT_FOUND",
          message: `Profile not found: ${identifier}`,
        },
        timestamp: new Date().toISOString(),
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

/**
 * Thrown when a user attempts to update their profile but is not in 'active' status.
 * Users must complete full onboarding (KYC + DID NFT) before editing profiles.
 */
export class ProfileUpdateNotAllowedException extends HttpException {
  public readonly code = "PROFILE_UPDATE_NOT_ALLOWED";

  constructor(userId: string, currentStatus: string) {
    super(
      {
        success: false,
        data: null,
        error: {
          code: "PROFILE_UPDATE_NOT_ALLOWED",
          message:
            `Cannot update profile when account status is '${currentStatus}'. ` +
            `User ${userId} must complete onboarding first.`,
        },
        timestamp: new Date().toISOString(),
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * Thrown when a search query is invalid (too short, too long, etc.).
 */
export class InvalidSearchQueryException extends HttpException {
  public readonly code = "INVALID_SEARCH_QUERY";

  constructor(reason: string) {
    super(
      {
        success: false,
        data: null,
        error: {
          code: "INVALID_SEARCH_QUERY",
          message: reason,
        },
        timestamp: new Date().toISOString(),
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * Thrown when a DID NFT refresh (wipe old + mint new) fails during profile update.
 */
export class DidNftRefreshException extends HttpException {
  public readonly code: string;

  constructor(message: string, code: string = "DID_NFT_REFRESH_FAILED") {
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
 * Thrown when avatar upload to IPFS via Pinata fails.
 */
export class AvatarUploadException extends HttpException {
  public readonly code: string;

  constructor(message: string, code: string = "AVATAR_UPLOAD_FAILED") {
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
