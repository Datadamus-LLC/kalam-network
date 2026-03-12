# S04: Error Handling, Logging & API Standards

| Field | Value |
|-------|-------|
| Task ID | S04 |
| Priority | 🔴 P0 — Do Immediately After T04 |
| Estimated Time | 3 hours |
| Depends On | P0-T04 (NestJS), P0-T02 (Shared Types) |
| Phase | Supplementary — Engineering Standards |
| Assignee | Backend developer |

---

## Overview

This task establishes comprehensive error handling, structured logging, and standardized API response formats across the entire Hedera social platform. Proper error handling is critical for blockchain applications where transactions are immutable and expensive. Structured logging enables debugging and monitoring in production.

### Objectives

1. Define standard API response envelope for all endpoints (success and error)
2. Create custom exception classes for all major error domains
3. Implement global exception filter to transform errors into standardized format
4. Add structured logging with request tracking
5. Enforce request ID propagation through system
6. Implement rate limiting to protect blockchain resources
7. Configure security headers and CORS properly
8. Validate all inputs with consistent error responses

### Scope

- API response envelope structure
- Custom exception hierarchy
- Global exception filter
- Request ID middleware
- Structured logging service
- Response transformation interceptor
- Input validation and error handling
- Rate limiting guards
- Security headers configuration

---

## Files to Create

### 1. `packages/shared/src/api-envelope.ts` — Response Envelope

```typescript
/**
 * API Response Envelope - Standardized response format for all endpoints
 * Ensures consistent client contract across the platform
 */

/**
 * Success response wrapper for all successful API calls
 */
export interface ApiResponse<T = unknown> {
  success: true;
  data: T;
  meta?: ApiResponseMeta;
}

/**
 * Pagination and response metadata
 */
export interface ApiResponseMeta {
  page?: number;
  limit?: number;
  total?: number;
  hasMore?: boolean;
  cursor?: string;
  timestamp?: string;
}

/**
 * Error response wrapper for all API errors
 */
export interface ApiErrorResponse {
  success: false;
  error: ApiError;
}

/**
 * Detailed error information
 */
export interface ApiError {
  /** Machine-readable error code for client handling */
  code: string;

  /** Human-readable error message for displaying to users */
  message: string;

  /** Additional context about the error (validation details, etc) */
  details?: Record<string, unknown> | unknown[];

  /** HTTP status code that was returned */
  statusCode: number;

  /** ISO 8601 timestamp when error occurred */
  timestamp: string;

  /** Request path for debugging */
  path: string;

  /** Unique request ID for tracing through logs */
  requestId: string;

  /** Stack trace (only in development) */
  stack?: string;
}

/**
 * Type guard to check if response is success
 */
export function isApiSuccess<T>(
  response: ApiResponse<T> | ApiErrorResponse
): response is ApiResponse<T> {
  return response.success === true;
}

/**
 * Type guard to check if response is error
 */
export function isApiError(
  response: ApiResponse | ApiErrorResponse
): response is ApiErrorResponse {
  return response.success === false;
}

/**
 * Helper to create success response
 */
export function createApiResponse<T>(
  data: T,
  meta?: ApiResponseMeta
): ApiResponse<T> {
  return {
    success: true,
    data,
    ...(meta && { meta })
  };
}

/**
 * Helper to create error response
 */
export function createApiError(
  code: string,
  message: string,
  statusCode: number,
  path: string,
  requestId: string,
  details?: unknown,
  stack?: string
): ApiErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      statusCode,
      timestamp: new Date().toISOString(),
      path,
      requestId,
      ...(details && { details }),
      ...(stack && { stack })
    }
  };
}

/**
 * Paginated response helper
 */
export function createPaginatedResponse<T>(
  items: T[],
  page: number,
  limit: number,
  total: number
): ApiResponse<T[]> {
  return {
    success: true,
    data: items,
    meta: {
      page,
      limit,
      total,
      hasMore: page * limit < total,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Cursor-based pagination response helper
 */
export function createCursorResponse<T>(
  items: T[],
  cursor?: string,
  hasMore?: boolean
): ApiResponse<T[]> {
  return {
    success: true,
    data: items,
    meta: {
      cursor,
      hasMore,
      timestamp: new Date().toISOString()
    }
  };
}
```

### 2. `packages/shared/src/error-codes.ts` — Error Code Registry

```typescript
/**
 * Central registry of all error codes used across the platform
 * Organized by module for easy discovery and prevention of duplicates
 */

export enum ErrorCode {
  // ==================== SYSTEM ERRORS ====================
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  REQUEST_TIMEOUT = 'REQUEST_TIMEOUT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INVALID_REQUEST = 'INVALID_REQUEST',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  CONFLICT = 'CONFLICT',
  GONE = 'GONE',

  // ==================== AUTHENTICATION ====================
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_INVALID = 'TOKEN_INVALID',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  REFRESH_TOKEN_EXPIRED = 'REFRESH_TOKEN_EXPIRED',
  INVALID_OTP = 'INVALID_OTP',
  OTP_EXPIRED = 'OTP_EXPIRED',
  OTP_ATTEMPTS_EXCEEDED = 'OTP_ATTEMPTS_EXCEEDED',
  INVALID_EMAIL = 'INVALID_EMAIL',
  EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
  EMAIL_ALREADY_EXISTS = 'EMAIL_ALREADY_EXISTS',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  ACCOUNT_DISABLED = 'ACCOUNT_DISABLED',
  PASSWORD_INVALID = 'PASSWORD_INVALID',
  PASSWORD_WEAK = 'PASSWORD_WEAK',
  PASSWORD_REUSE = 'PASSWORD_REUSE',
  SESSION_INVALID = 'SESSION_INVALID',
  SESSION_EXPIRED = 'SESSION_EXPIRED',

  // ==================== AUTHORIZATION ====================
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  INSUFFICIENT_PRIVILEGES = 'INSUFFICIENT_PRIVILEGES',
  FORBIDDEN = 'FORBIDDEN',

  // ==================== HEDERA BLOCKCHAIN ====================
  HEDERA_TRANSACTION_FAILED = 'HEDERA_TRANSACTION_FAILED',
  HEDERA_ACCOUNT_INVALID = 'HEDERA_ACCOUNT_INVALID',
  HEDERA_ACCOUNT_NOT_FOUND = 'HEDERA_ACCOUNT_NOT_FOUND',
  HEDERA_TOPIC_NOT_FOUND = 'HEDERA_TOPIC_NOT_FOUND',
  HEDERA_TOPIC_DELETED = 'HEDERA_TOPIC_DELETED',
  HEDERA_MESSAGE_INVALID = 'HEDERA_MESSAGE_INVALID',
  HEDERA_MESSAGE_TOO_LARGE = 'HEDERA_MESSAGE_TOO_LARGE',
  HEDERA_INSUFFICIENT_HBAR = 'HEDERA_INSUFFICIENT_HBAR',
  HEDERA_KEY_INVALID = 'HEDERA_KEY_INVALID',
  HEDERA_KEY_NOT_FOUND = 'HEDERA_KEY_NOT_FOUND',
  HEDERA_NETWORK_ERROR = 'HEDERA_NETWORK_ERROR',
  HEDERA_QUERY_FAILED = 'HEDERA_QUERY_FAILED',
  HEDERA_TRANSACTION_TIMEOUT = 'HEDERA_TRANSACTION_TIMEOUT',
  HEDERA_TRANSACTION_REJECTED = 'HEDERA_TRANSACTION_REJECTED',
  HEDERA_PRECHECK_FAILED = 'HEDERA_PRECHECK_FAILED',
  HEDERA_NOT_READY = 'HEDERA_NOT_READY',

  // ==================== MESSAGES & CONVERSATIONS ====================
  MESSAGE_NOT_FOUND = 'MESSAGE_NOT_FOUND',
  MESSAGE_ALREADY_PUBLISHED = 'MESSAGE_ALREADY_PUBLISHED',
  MESSAGE_EDIT_FAILED = 'MESSAGE_EDIT_FAILED',
  MESSAGE_DELETE_FAILED = 'MESSAGE_DELETE_FAILED',
  MESSAGE_TOO_LONG = 'MESSAGE_TOO_LONG',
  CONVERSATION_NOT_FOUND = 'CONVERSATION_NOT_FOUND',
  CONVERSATION_DELETED = 'CONVERSATION_DELETED',
  NOT_CONVERSATION_PARTICIPANT = 'NOT_CONVERSATION_PARTICIPANT',
  CONVERSATION_ARCHIVED = 'CONVERSATION_ARCHIVED',
  CONVERSATION_GROUP_FULL = 'CONVERSATION_GROUP_FULL',
  CONVERSATION_MEMBER_NOT_FOUND = 'CONVERSATION_MEMBER_NOT_FOUND',
  CONVERSATION_CREATION_FAILED = 'CONVERSATION_CREATION_FAILED',

  // ==================== PAYMENTS & TRANSFERS ====================
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  PAYMENT_INVALID_AMOUNT = 'PAYMENT_INVALID_AMOUNT',
  PAYMENT_INSUFFICIENT_BALANCE = 'PAYMENT_INSUFFICIENT_BALANCE',
  PAYMENT_AMOUNT_TOO_SMALL = 'PAYMENT_AMOUNT_TOO_SMALL',
  PAYMENT_AMOUNT_TOO_LARGE = 'PAYMENT_AMOUNT_TOO_LARGE',
  PAYMENT_CURRENCY_MISMATCH = 'PAYMENT_CURRENCY_MISMATCH',
  PAYMENT_RECIPIENT_INVALID = 'PAYMENT_RECIPIENT_INVALID',
  PAYMENT_RECIPIENT_NOT_FOUND = 'PAYMENT_RECIPIENT_NOT_FOUND',
  PAYMENT_TIMEOUT = 'PAYMENT_TIMEOUT',
  PAYMENT_ALREADY_PROCESSED = 'PAYMENT_ALREADY_PROCESSED',
  TRANSFER_FAILED = 'TRANSFER_FAILED',
  TRANSFER_LIMIT_EXCEEDED = 'TRANSFER_LIMIT_EXCEEDED',

  // ==================== PROFILE & SOCIAL ====================
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_DELETED = 'USER_DELETED',
  USER_PROFILE_INVALID = 'USER_PROFILE_INVALID',
  USERNAME_TAKEN = 'USERNAME_TAKEN',
  USERNAME_INVALID = 'USERNAME_INVALID',
  BIO_TOO_LONG = 'BIO_TOO_LONG',
  AVATAR_INVALID = 'AVATAR_INVALID',
  AVATAR_TOO_LARGE = 'AVATAR_TOO_LARGE',
  PROFILE_NOT_FOUND = 'PROFILE_NOT_FOUND',
  PROFILE_UPDATE_FAILED = 'PROFILE_UPDATE_FAILED',
  FOLLOWER_NOT_FOUND = 'FOLLOWER_NOT_FOUND',
  ALREADY_FOLLOWING = 'ALREADY_FOLLOWING',
  NOT_FOLLOWING = 'NOT_FOLLOWING',

  // ==================== POSTS & CONTENT ====================
  POST_NOT_FOUND = 'POST_NOT_FOUND',
  POST_DELETED = 'POST_DELETED',
  POST_CREATION_FAILED = 'POST_CREATION_FAILED',
  POST_UPDATE_FAILED = 'POST_UPDATE_FAILED',
  POST_EDIT_TIMEOUT = 'POST_EDIT_TIMEOUT',
  POST_CONTENT_INVALID = 'POST_CONTENT_INVALID',
  POST_CONTENT_TOO_LONG = 'POST_CONTENT_TOO_LONG',
  POST_CANNOT_EDIT = 'POST_CANNOT_EDIT',
  POST_CANNOT_DELETE = 'POST_CANNOT_DELETE',
  COMMENT_NOT_FOUND = 'COMMENT_NOT_FOUND',
  COMMENT_CREATION_FAILED = 'COMMENT_CREATION_FAILED',
  COMMENT_DELETE_FAILED = 'COMMENT_DELETE_FAILED',
  HASHTAG_INVALID = 'HASHTAG_INVALID',

  // ==================== REACTIONS & LIKES ====================
  REACTION_NOT_FOUND = 'REACTION_NOT_FOUND',
  REACTION_CREATION_FAILED = 'REACTION_CREATION_FAILED',
  REACTION_DELETE_FAILED = 'REACTION_DELETE_FAILED',
  REACTION_INVALID = 'REACTION_INVALID',
  LIKE_ALREADY_EXISTS = 'LIKE_ALREADY_EXISTS',
  LIKE_NOT_FOUND = 'LIKE_NOT_FOUND',

  // ==================== UPLOADS & FILES ====================
  FILE_UPLOAD_FAILED = 'FILE_UPLOAD_FAILED',
  FILE_INVALID = 'FILE_INVALID',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_ACCESS_DENIED = 'FILE_ACCESS_DENIED',
  IMAGE_RESIZE_FAILED = 'IMAGE_RESIZE_FAILED',
  STORAGE_QUOTA_EXCEEDED = 'STORAGE_QUOTA_EXCEEDED',

  // ==================== NOTIFICATIONS ====================
  NOTIFICATION_NOT_FOUND = 'NOTIFICATION_NOT_FOUND',
  NOTIFICATION_CREATION_FAILED = 'NOTIFICATION_CREATION_FAILED',

  // ==================== DATABASE ====================
  DATABASE_ERROR = 'DATABASE_ERROR',
  DATABASE_CONSTRAINT_VIOLATION = 'DATABASE_CONSTRAINT_VIOLATION',
  DATABASE_TRANSACTION_FAILED = 'DATABASE_TRANSACTION_FAILED',
  DATABASE_MIGRATION_FAILED = 'DATABASE_MIGRATION_FAILED',

  // ==================== CACHE ====================
  CACHE_ERROR = 'CACHE_ERROR',
  CACHE_MISS = 'CACHE_MISS',

  // ==================== CRYPTO & SECURITY ====================
  ENCRYPTION_FAILED = 'ENCRYPTION_FAILED',
  DECRYPTION_FAILED = 'DECRYPTION_FAILED',
  SIGNATURE_INVALID = 'SIGNATURE_INVALID',
  SIGNATURE_VERIFICATION_FAILED = 'SIGNATURE_VERIFICATION_FAILED',
  KEY_DERIVATION_FAILED = 'KEY_DERIVATION_FAILED',
  HASH_COMPUTATION_FAILED = 'HASH_COMPUTATION_FAILED',
}

/**
 * Default human-readable messages for error codes
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  // System Errors
  [ErrorCode.INTERNAL_SERVER_ERROR]: 'An unexpected error occurred. Our team has been notified.',
  [ErrorCode.SERVICE_UNAVAILABLE]: 'The service is temporarily unavailable. Please try again later.',
  [ErrorCode.REQUEST_TIMEOUT]: 'The request took too long to complete. Please try again.',
  [ErrorCode.RATE_LIMIT_EXCEEDED]:
    'Too many requests. Please wait a moment before trying again.',
  [ErrorCode.INVALID_REQUEST]: 'The request is invalid or malformed.',
  [ErrorCode.VALIDATION_FAILED]: 'Input validation failed. Please check your data.',
  [ErrorCode.RESOURCE_NOT_FOUND]: 'The requested resource was not found.',
  [ErrorCode.CONFLICT]: 'The request conflicts with existing data.',
  [ErrorCode.GONE]: 'The requested resource is no longer available.',

  // Authentication
  [ErrorCode.AUTH_REQUIRED]: 'Authentication is required to access this resource.',
  [ErrorCode.INVALID_CREDENTIALS]: 'Invalid email or password.',
  [ErrorCode.TOKEN_INVALID]: 'The authentication token is invalid or malformed.',
  [ErrorCode.TOKEN_EXPIRED]: 'Your authentication token has expired. Please log in again.',
  [ErrorCode.REFRESH_TOKEN_EXPIRED]: 'Your refresh token has expired. Please log in again.',
  [ErrorCode.INVALID_OTP]: 'The one-time password is invalid.',
  [ErrorCode.OTP_EXPIRED]: 'The one-time password has expired. Request a new one.',
  [ErrorCode.OTP_ATTEMPTS_EXCEEDED]:
    'Too many failed OTP attempts. Please request a new code.',
  [ErrorCode.INVALID_EMAIL]: 'The email address is invalid.',
  [ErrorCode.EMAIL_NOT_VERIFIED]: 'Your email address must be verified first.',
  [ErrorCode.EMAIL_ALREADY_EXISTS]: 'An account with this email already exists.',
  [ErrorCode.ACCOUNT_LOCKED]: 'Your account is locked. Contact support.',
  [ErrorCode.ACCOUNT_DISABLED]: 'Your account has been disabled.',
  [ErrorCode.PASSWORD_INVALID]: 'The password is invalid.',
  [ErrorCode.PASSWORD_WEAK]: 'The password does not meet security requirements.',
  [ErrorCode.PASSWORD_REUSE]: 'You cannot reuse a recent password.',
  [ErrorCode.SESSION_INVALID]: 'Your session is invalid. Please log in again.',
  [ErrorCode.SESSION_EXPIRED]: 'Your session has expired. Please log in again.',

  // Authorization
  [ErrorCode.PERMISSION_DENIED]: 'You do not have permission to perform this action.',
  [ErrorCode.INSUFFICIENT_PRIVILEGES]: 'Your account does not have sufficient privileges.',
  [ErrorCode.FORBIDDEN]: 'This action is forbidden.',

  // Hedera Blockchain
  [ErrorCode.HEDERA_TRANSACTION_FAILED]: 'The Hedera transaction failed.',
  [ErrorCode.HEDERA_ACCOUNT_INVALID]: 'The Hedera account ID is invalid.',
  [ErrorCode.HEDERA_ACCOUNT_NOT_FOUND]: 'The Hedera account was not found.',
  [ErrorCode.HEDERA_TOPIC_NOT_FOUND]: 'The Hedera topic was not found.',
  [ErrorCode.HEDERA_TOPIC_DELETED]: 'The Hedera topic has been deleted.',
  [ErrorCode.HEDERA_MESSAGE_INVALID]: 'The message is invalid for Hedera.',
  [ErrorCode.HEDERA_MESSAGE_TOO_LARGE]: 'The message is too large for Hedera (max 4096 bytes).',
  [ErrorCode.HEDERA_INSUFFICIENT_HBAR]:
    'Insufficient HBAR balance to complete this transaction.',
  [ErrorCode.HEDERA_KEY_INVALID]: 'The Hedera key is invalid.',
  [ErrorCode.HEDERA_KEY_NOT_FOUND]: 'The Hedera key was not found.',
  [ErrorCode.HEDERA_NETWORK_ERROR]: 'Could not connect to Hedera network.',
  [ErrorCode.HEDERA_QUERY_FAILED]: 'The Hedera query failed.',
  [ErrorCode.HEDERA_TRANSACTION_TIMEOUT]: 'The Hedera transaction timed out.',
  [ErrorCode.HEDERA_TRANSACTION_REJECTED]: 'The Hedera transaction was rejected.',
  [ErrorCode.HEDERA_PRECHECK_FAILED]: 'Hedera precheck validation failed.',
  [ErrorCode.HEDERA_NOT_READY]: 'Hedera service is not ready. Please try again.',

  // Messages & Conversations
  [ErrorCode.MESSAGE_NOT_FOUND]: 'The message was not found.',
  [ErrorCode.MESSAGE_ALREADY_PUBLISHED]: 'This message has already been published.',
  [ErrorCode.MESSAGE_EDIT_FAILED]: 'Failed to edit the message.',
  [ErrorCode.MESSAGE_DELETE_FAILED]: 'Failed to delete the message.',
  [ErrorCode.MESSAGE_TOO_LONG]: 'The message is too long.',
  [ErrorCode.CONVERSATION_NOT_FOUND]: 'The conversation was not found.',
  [ErrorCode.CONVERSATION_DELETED]: 'The conversation has been deleted.',
  [ErrorCode.NOT_CONVERSATION_PARTICIPANT]:
    'You are not a participant in this conversation.',
  [ErrorCode.CONVERSATION_ARCHIVED]: 'This conversation is archived.',
  [ErrorCode.CONVERSATION_GROUP_FULL]: 'The conversation group is full.',
  [ErrorCode.CONVERSATION_MEMBER_NOT_FOUND]: 'The conversation member was not found.',
  [ErrorCode.CONVERSATION_CREATION_FAILED]: 'Failed to create the conversation.',

  // Payments & Transfers
  [ErrorCode.PAYMENT_FAILED]: 'The payment failed.',
  [ErrorCode.PAYMENT_INVALID_AMOUNT]: 'The payment amount is invalid.',
  [ErrorCode.PAYMENT_INSUFFICIENT_BALANCE]:
    'Insufficient balance to complete this payment.',
  [ErrorCode.PAYMENT_AMOUNT_TOO_SMALL]: 'The payment amount is too small.',
  [ErrorCode.PAYMENT_AMOUNT_TOO_LARGE]: 'The payment amount exceeds the limit.',
  [ErrorCode.PAYMENT_CURRENCY_MISMATCH]: 'The payment currency does not match.',
  [ErrorCode.PAYMENT_RECIPIENT_INVALID]: 'The payment recipient is invalid.',
  [ErrorCode.PAYMENT_RECIPIENT_NOT_FOUND]: 'The payment recipient was not found.',
  [ErrorCode.PAYMENT_TIMEOUT]: 'The payment request timed out.',
  [ErrorCode.PAYMENT_ALREADY_PROCESSED]: 'This payment has already been processed.',
  [ErrorCode.TRANSFER_FAILED]: 'The transfer failed.',
  [ErrorCode.TRANSFER_LIMIT_EXCEEDED]: 'The transfer limit has been exceeded.',

  // Profile & Social
  [ErrorCode.USER_NOT_FOUND]: 'The user was not found.',
  [ErrorCode.USER_DELETED]: 'The user account has been deleted.',
  [ErrorCode.USER_PROFILE_INVALID]: 'The user profile is invalid.',
  [ErrorCode.USERNAME_TAKEN]: 'This username is already taken.',
  [ErrorCode.USERNAME_INVALID]: 'The username is invalid.',
  [ErrorCode.BIO_TOO_LONG]: 'The bio is too long.',
  [ErrorCode.AVATAR_INVALID]: 'The avatar image is invalid.',
  [ErrorCode.AVATAR_TOO_LARGE]: 'The avatar image is too large.',
  [ErrorCode.PROFILE_NOT_FOUND]: 'The profile was not found.',
  [ErrorCode.PROFILE_UPDATE_FAILED]: 'Failed to update the profile.',
  [ErrorCode.FOLLOWER_NOT_FOUND]: 'The follower was not found.',
  [ErrorCode.ALREADY_FOLLOWING]: 'You are already following this user.',
  [ErrorCode.NOT_FOLLOWING]: 'You are not following this user.',

  // Posts & Content
  [ErrorCode.POST_NOT_FOUND]: 'The post was not found.',
  [ErrorCode.POST_DELETED]: 'The post has been deleted.',
  [ErrorCode.POST_CREATION_FAILED]: 'Failed to create the post.',
  [ErrorCode.POST_UPDATE_FAILED]: 'Failed to update the post.',
  [ErrorCode.POST_EDIT_TIMEOUT]: 'The editing window for this post has closed.',
  [ErrorCode.POST_CONTENT_INVALID]: 'The post content is invalid.',
  [ErrorCode.POST_CONTENT_TOO_LONG]: 'The post content is too long.',
  [ErrorCode.POST_CANNOT_EDIT]: 'This post cannot be edited.',
  [ErrorCode.POST_CANNOT_DELETE]: 'This post cannot be deleted.',
  [ErrorCode.COMMENT_NOT_FOUND]: 'The comment was not found.',
  [ErrorCode.COMMENT_CREATION_FAILED]: 'Failed to create the comment.',
  [ErrorCode.COMMENT_DELETE_FAILED]: 'Failed to delete the comment.',
  [ErrorCode.HASHTAG_INVALID]: 'The hashtag is invalid.',

  // Reactions & Likes
  [ErrorCode.REACTION_NOT_FOUND]: 'The reaction was not found.',
  [ErrorCode.REACTION_CREATION_FAILED]: 'Failed to create the reaction.',
  [ErrorCode.REACTION_DELETE_FAILED]: 'Failed to delete the reaction.',
  [ErrorCode.REACTION_INVALID]: 'The reaction is invalid.',
  [ErrorCode.LIKE_ALREADY_EXISTS]: 'You have already liked this item.',
  [ErrorCode.LIKE_NOT_FOUND]: 'The like was not found.',

  // Uploads & Files
  [ErrorCode.FILE_UPLOAD_FAILED]: 'The file upload failed.',
  [ErrorCode.FILE_INVALID]: 'The file is invalid.',
  [ErrorCode.FILE_TOO_LARGE]: 'The file is too large.',
  [ErrorCode.FILE_NOT_FOUND]: 'The file was not found.',
  [ErrorCode.FILE_ACCESS_DENIED]: 'You do not have access to this file.',
  [ErrorCode.IMAGE_RESIZE_FAILED]: 'Failed to resize the image.',
  [ErrorCode.STORAGE_QUOTA_EXCEEDED]: 'Storage quota has been exceeded.',

  // Notifications
  [ErrorCode.NOTIFICATION_NOT_FOUND]: 'The notification was not found.',
  [ErrorCode.NOTIFICATION_CREATION_FAILED]: 'Failed to create the notification.',

  // Database
  [ErrorCode.DATABASE_ERROR]: 'A database error occurred.',
  [ErrorCode.DATABASE_CONSTRAINT_VIOLATION]: 'A database constraint was violated.',
  [ErrorCode.DATABASE_TRANSACTION_FAILED]: 'The database transaction failed.',
  [ErrorCode.DATABASE_MIGRATION_FAILED]: 'The database migration failed.',

  // Cache
  [ErrorCode.CACHE_ERROR]: 'A cache error occurred.',
  [ErrorCode.CACHE_MISS]: 'The requested data was not found in cache.',

  // Crypto & Security
  [ErrorCode.ENCRYPTION_FAILED]: 'Encryption failed.',
  [ErrorCode.DECRYPTION_FAILED]: 'Decryption failed.',
  [ErrorCode.SIGNATURE_INVALID]: 'The signature is invalid.',
  [ErrorCode.SIGNATURE_VERIFICATION_FAILED]: 'Signature verification failed.',
  [ErrorCode.KEY_DERIVATION_FAILED]: 'Key derivation failed.',
  [ErrorCode.HASH_COMPUTATION_FAILED]: 'Hash computation failed.'
};

/**
 * Get default message for error code
 */
export function getErrorMessage(code: ErrorCode | string): string {
  return ERROR_MESSAGES[code as ErrorCode] || 'An unexpected error occurred.';
}
```

### 3. `packages/api/src/common/exceptions/app.exception.ts` — Base Exception

```typescript
import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@hedera-social/shared';

/**
 * Base custom exception for the application
 * All business logic exceptions should extend this
 */
export class AppException extends HttpException {
  constructor(
    public code: ErrorCode | string,
    message: string,
    statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR,
    public details?: unknown
  ) {
    super(
      {
        code,
        message,
        statusCode,
        details
      },
      statusCode
    );

    // Maintain proper stack trace
    Object.setPrototypeOf(this, AppException.prototype);
  }

  /**
   * Check if this exception should be logged with full details
   */
  shouldLog(): boolean {
    return this.getStatus() >= 500;
  }
}
```

### 4. `packages/api/src/common/exceptions/auth.exceptions.ts` — Auth Exceptions

```typescript
import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@hedera-social/shared';
import { AppException } from './app.exception';

/**
 * Raised when OTP has expired
 */
export class OtpExpiredException extends AppException {
  constructor() {
    super(
      ErrorCode.OTP_EXPIRED,
      'The one-time password has expired. Request a new one.',
      HttpStatus.GONE
    );
    Object.setPrototypeOf(this, OtpExpiredException.prototype);
  }
}

/**
 * Raised when OTP is invalid
 */
export class InvalidOtpException extends AppException {
  constructor(attemptsRemaining?: number) {
    super(
      ErrorCode.INVALID_OTP,
      'The one-time password is invalid.',
      HttpStatus.UNAUTHORIZED,
      attemptsRemaining !== undefined ? { attemptsRemaining } : undefined
    );
    Object.setPrototypeOf(this, InvalidOtpException.prototype);
  }
}

/**
 * Raised when OTP attempts exceeded
 */
export class OtpAttemptsExceededException extends AppException {
  constructor(lockoutDurationSeconds: number) {
    super(
      ErrorCode.OTP_ATTEMPTS_EXCEEDED,
      'Too many failed OTP attempts. Please request a new code.',
      HttpStatus.TOO_MANY_REQUESTS,
      { lockoutDurationSeconds }
    );
    Object.setPrototypeOf(this, OtpAttemptsExceededException.prototype);
  }
}

/**
 * Raised when JWT token is invalid
 */
export class InvalidTokenException extends AppException {
  constructor(reason: string = 'Token is invalid or malformed') {
    super(
      ErrorCode.TOKEN_INVALID,
      'The authentication token is invalid or malformed.',
      HttpStatus.UNAUTHORIZED,
      { reason }
    );
    Object.setPrototypeOf(this, InvalidTokenException.prototype);
  }
}

/**
 * Raised when JWT token has expired
 */
export class TokenExpiredException extends AppException {
  constructor() {
    super(
      ErrorCode.TOKEN_EXPIRED,
      'Your authentication token has expired. Please log in again.',
      HttpStatus.UNAUTHORIZED
    );
    Object.setPrototypeOf(this, TokenExpiredException.prototype);
  }
}

/**
 * Raised when email is invalid
 */
export class InvalidEmailException extends AppException {
  constructor(email: string) {
    super(
      ErrorCode.INVALID_EMAIL,
      'The email address is invalid.',
      HttpStatus.BAD_REQUEST,
      { email }
    );
    Object.setPrototypeOf(this, InvalidEmailException.prototype);
  }
}

/**
 * Raised when email already exists
 */
export class EmailAlreadyExistsException extends AppException {
  constructor(email: string) {
    super(
      ErrorCode.EMAIL_ALREADY_EXISTS,
      'An account with this email already exists.',
      HttpStatus.CONFLICT,
      { email }
    );
    Object.setPrototypeOf(this, EmailAlreadyExistsException.prototype);
  }
}

/**
 * Raised when account is locked
 */
export class AccountLockedException extends AppException {
  constructor(unlockAt?: Date) {
    super(
      ErrorCode.ACCOUNT_LOCKED,
      'Your account is locked. Contact support.',
      HttpStatus.FORBIDDEN,
      unlockAt ? { unlockAt } : undefined
    );
    Object.setPrototypeOf(this, AccountLockedException.prototype);
  }
}

/**
 * Raised when authentication credentials are invalid
 */
export class InvalidCredentialsException extends AppException {
  constructor() {
    super(
      ErrorCode.INVALID_CREDENTIALS,
      'Invalid email or password.',
      HttpStatus.UNAUTHORIZED
    );
    Object.setPrototypeOf(this, InvalidCredentialsException.prototype);
  }
}

/**
 * Raised when password is weak
 */
export class WeakPasswordException extends AppException {
  constructor(requirements?: string[]) {
    super(
      ErrorCode.PASSWORD_WEAK,
      'The password does not meet security requirements.',
      HttpStatus.BAD_REQUEST,
      requirements ? { requirements } : undefined
    );
    Object.setPrototypeOf(this, WeakPasswordException.prototype);
  }
}
```

### 5. `packages/api/src/common/exceptions/hedera.exceptions.ts` — Hedera Exceptions

```typescript
import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@hedera-social/shared';
import { AppException } from './app.exception';
import { TransactionReceipt } from '@hashgraph/sdk';

/**
 * Raised when a Hedera transaction fails
 */
export class HederaTransactionFailedException extends AppException {
  constructor(
    message: string,
    public transactionId?: string,
    public receiptStatus?: string,
    details?: unknown
  ) {
    super(
      ErrorCode.HEDERA_TRANSACTION_FAILED,
      message,
      HttpStatus.BAD_GATEWAY,
      { transactionId, receiptStatus, ...details }
    );
    Object.setPrototypeOf(this, HederaTransactionFailedException.prototype);
  }
}

/**
 * Raised when Hedera topic is not found
 */
export class TopicNotFoundException extends AppException {
  constructor(topicId: string) {
    super(
      ErrorCode.HEDERA_TOPIC_NOT_FOUND,
      `The Hedera topic was not found.`,
      HttpStatus.NOT_FOUND,
      { topicId }
    );
    Object.setPrototypeOf(this, TopicNotFoundException.prototype);
  }
}

/**
 * Raised when message is too large for Hedera
 */
export class MessageTooLargeException extends AppException {
  constructor(size: number, maxSize: number = 4096) {
    super(
      ErrorCode.HEDERA_MESSAGE_TOO_LARGE,
      `The message is too large for Hedera (max ${maxSize} bytes).`,
      HttpStatus.PAYLOAD_TOO_LARGE,
      { size, maxSize }
    );
    Object.setPrototypeOf(this, MessageTooLargeException.prototype);
  }
}

/**
 * Raised when insufficient HBAR for transaction
 */
export class InsufficientHbarException extends AppException {
  constructor(required: number, available: number) {
    super(
      ErrorCode.HEDERA_INSUFFICIENT_HBAR,
      'Insufficient HBAR balance to complete this transaction.',
      HttpStatus.PAYMENT_REQUIRED,
      { required, available, shortage: required - available }
    );
    Object.setPrototypeOf(this, InsufficientHbarException.prototype);
  }
}

/**
 * Raised when Hedera account is invalid
 */
export class InvalidHederaAccountException extends AppException {
  constructor(accountId: string, reason?: string) {
    super(
      ErrorCode.HEDERA_ACCOUNT_INVALID,
      'The Hedera account ID is invalid.',
      HttpStatus.BAD_REQUEST,
      { accountId, reason }
    );
    Object.setPrototypeOf(this, InvalidHederaAccountException.prototype);
  }
}

/**
 * Raised when Hedera precheck fails
 */
export class HederaPrecheckFailedException extends AppException {
  constructor(code: string, message: string) {
    super(
      ErrorCode.HEDERA_PRECHECK_FAILED,
      'Hedera precheck validation failed.',
      HttpStatus.BAD_REQUEST,
      { code, message }
    );
    Object.setPrototypeOf(this, HederaPrecheckFailedException.prototype);
  }
}

/**
 * Raised when Hedera network is unavailable
 */
export class HederaNetworkException extends AppException {
  constructor(message: string = 'Could not connect to Hedera network.') {
    super(
      ErrorCode.HEDERA_NETWORK_ERROR,
      message,
      HttpStatus.SERVICE_UNAVAILABLE
    );
    Object.setPrototypeOf(this, HederaNetworkException.prototype);
  }
}
```

### 6. `packages/api/src/common/exceptions/payment.exceptions.ts` — Payment Exceptions

```typescript
import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@hedera-social/shared';
import { AppException } from './app.exception';

/**
 * Raised when payment amount is invalid
 */
export class InvalidAmountException extends AppException {
  constructor(amount: number, reason?: string) {
    super(
      ErrorCode.PAYMENT_INVALID_AMOUNT,
      'The payment amount is invalid.',
      HttpStatus.BAD_REQUEST,
      { amount, reason }
    );
    Object.setPrototypeOf(this, InvalidAmountException.prototype);
  }
}

/**
 * Raised when insufficient balance for payment
 */
export class InsufficientBalanceException extends AppException {
  constructor(required: number, available: number) {
    super(
      ErrorCode.PAYMENT_INSUFFICIENT_BALANCE,
      'Insufficient balance to complete this payment.',
      HttpStatus.PAYMENT_REQUIRED,
      { required, available, shortage: required - available }
    );
    Object.setPrototypeOf(this, InsufficientBalanceException.prototype);
  }
}

/**
 * Raised when payment fails
 */
export class PaymentFailedException extends AppException {
  constructor(reason: string, details?: unknown) {
    super(
      ErrorCode.PAYMENT_FAILED,
      'The payment failed.',
      HttpStatus.BAD_GATEWAY,
      { reason, ...details }
    );
    Object.setPrototypeOf(this, PaymentFailedException.prototype);
  }
}

/**
 * Raised when payment recipient is invalid
 */
export class InvalidPaymentRecipientException extends AppException {
  constructor(recipientId: string, reason?: string) {
    super(
      ErrorCode.PAYMENT_RECIPIENT_INVALID,
      'The payment recipient is invalid.',
      HttpStatus.BAD_REQUEST,
      { recipientId, reason }
    );
    Object.setPrototypeOf(this, InvalidPaymentRecipientException.prototype);
  }
}

/**
 * Raised when payment already processed
 */
export class PaymentAlreadyProcessedException extends AppException {
  constructor(paymentId: string) {
    super(
      ErrorCode.PAYMENT_ALREADY_PROCESSED,
      'This payment has already been processed.',
      HttpStatus.CONFLICT,
      { paymentId }
    );
    Object.setPrototypeOf(this, PaymentAlreadyProcessedException.prototype);
  }
}
```

### 7. `packages/api/src/common/exceptions/conversation.exceptions.ts` — Conversation Exceptions

```typescript
import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@hedera-social/shared';
import { AppException } from './app.exception';

/**
 * Raised when conversation is not found
 */
export class ConversationNotFoundException extends AppException {
  constructor(conversationId: string) {
    super(
      ErrorCode.CONVERSATION_NOT_FOUND,
      'The conversation was not found.',
      HttpStatus.NOT_FOUND,
      { conversationId }
    );
    Object.setPrototypeOf(this, ConversationNotFoundException.prototype);
  }
}

/**
 * Raised when user is not a conversation participant
 */
export class NotParticipantException extends AppException {
  constructor(conversationId: string, userId: string) {
    super(
      ErrorCode.NOT_CONVERSATION_PARTICIPANT,
      'You are not a participant in this conversation.',
      HttpStatus.FORBIDDEN,
      { conversationId, userId }
    );
    Object.setPrototypeOf(this, NotParticipantException.prototype);
  }
}

/**
 * Raised when group conversation is full
 */
export class GroupFullException extends AppException {
  constructor(maxMembers: number) {
    super(
      ErrorCode.CONVERSATION_GROUP_FULL,
      'The conversation group is full.',
      HttpStatus.CONFLICT,
      { maxMembers }
    );
    Object.setPrototypeOf(this, GroupFullException.prototype);
  }
}

/**
 * Raised when conversation member is not found
 */
export class ConversationMemberNotFoundException extends AppException {
  constructor(conversationId: string, memberId: string) {
    super(
      ErrorCode.CONVERSATION_MEMBER_NOT_FOUND,
      'The conversation member was not found.',
      HttpStatus.NOT_FOUND,
      { conversationId, memberId }
    );
    Object.setPrototypeOf(this, ConversationMemberNotFoundException.prototype);
  }
}

/**
 * Raised when conversation creation fails
 */
export class ConversationCreationFailedException extends AppException {
  constructor(reason: string, details?: unknown) {
    super(
      ErrorCode.CONVERSATION_CREATION_FAILED,
      'Failed to create the conversation.',
      HttpStatus.BAD_REQUEST,
      { reason, ...details }
    );
    Object.setPrototypeOf(this, ConversationCreationFailedException.prototype);
  }
}
```

### 8. `packages/api/src/common/filters/global-exception.filter.ts` — Global Exception Filter

```typescript
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  BadRequestException
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { createApiError, ApiErrorResponse } from '@hedera-social/shared';
import { AppException } from '../exceptions/app.exception';

/**
 * Global exception filter that transforms all exceptions into standard API error responses
 * Handles HTTP exceptions, custom app exceptions, database errors, and generic errors
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & { id?: string; user?: { id?: string } }>();
    const response = ctx.getResponse<Response>();
    const requestId = (request.id) || 'unknown';
    const path = request.path;
    const method = request.method;
    const userId = request.user?.id;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected error occurred';
    let details: unknown;
    let stack: string | undefined;

    // Handle custom AppException
    if (exception instanceof AppException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;

      // Log appropriately based on status
      if (exception.shouldLog()) {
        this.logger.error(
          `AppException: ${code} - ${message}`,
          {
            requestId,
            userId,
            path,
            method,
            status,
            details
          },
          exception.stack
        );
      } else {
        this.logger.debug(
          `AppException: ${code} - ${message}`,
          { requestId, userId, path, method, status, details }
        );
      }
    }
    // Handle NestJS HttpException
    else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const errorObj = exceptionResponse as Record<string, unknown>;
        code = (typeof errorObj.code === 'string' ? errorObj.code : 'HTTP_ERROR') || 'HTTP_ERROR';
        message = (typeof errorObj.message === 'string' ? errorObj.message : exception.message) || exception.message;
        details = errorObj;
      } else {
        code = 'HTTP_ERROR';
        message = typeof exceptionResponse === 'string' ? exceptionResponse : exception.message;
      }

      // BadRequestException often contains validation errors
      if (exception instanceof BadRequestException) {
        code = 'VALIDATION_FAILED';
        if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
          const errorObj = exceptionResponse as Record<string, unknown>;
          if (Array.isArray(errorObj.message)) {
            details = { validationErrors: errorObj.message };
          }
        }
      }

      this.logger.warn(`HttpException: ${code}`, {
        requestId,
        userId,
        path,
        method,
        status,
        details
      });
    }
    // Handle TypeORM database errors
    else if (exception instanceof QueryFailedError) {
      status = HttpStatus.BAD_REQUEST;
      code = 'DATABASE_ERROR';
      message = 'A database error occurred';

      // Don't expose database details in production
      if (process.env.NODE_ENV === 'development') {
        details = {
          query: exception.query,
          parameters: exception.parameters,
          message: exception.message
        };
        stack = exception.stack;
      }

      this.logger.error(`Database error: ${exception.message}`, {
        requestId,
        userId,
        path,
        method,
        query: exception.query
      });
    }
    // Handle generic Error
    else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = 'INTERNAL_SERVER_ERROR';
      message = 'An unexpected error occurred';

      // Include stack in development
      if (process.env.NODE_ENV === 'development') {
        stack = exception.stack;
      }

      this.logger.error(
        `Unhandled error: ${exception.message}`,
        { requestId, userId, path, method },
        exception.stack
      );
    }
    // Handle unknown exception
    else {
      this.logger.error(
        `Unknown exception type: ${typeof exception}`,
        { requestId, userId, path, method, exception }
      );
    }

    // Create standard error response
    const errorResponse = createApiError(
      code,
      message,
      status,
      path,
      requestId,
      details,
      stack
    );

    response.status(status).json(errorResponse);
  }
}
```

### 9. `packages/api/src/common/middleware/request-id.middleware.ts` — Request ID Middleware

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

/**
 * Middleware that generates and attaches a unique request ID to every request
 * Makes it easy to trace requests through logs and multiple services
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Use existing X-Request-ID header if provided, otherwise generate new UUID
    const requestId = req.headers['x-request-id'] || uuidv4();
    req.id = String(requestId);

    // Add request ID to response headers for client tracking
    res.setHeader('X-Request-ID', req.id);

    // Add request ID to response locals so it's available in all layers
    res.locals.requestId = req.id;

    next();
  }
}
```

### 10. `packages/api/src/common/logger/app-logger.service.ts` — Structured Logging

```typescript
import { Injectable, Logger as NestLogger, LogLevel } from '@nestjs/common';

export interface LogContext {
  requestId?: string;
  userId?: string;
  module?: string;
  function?: string;
  [key: string]: unknown;
}

/**
 * Application logger service with structured logging
 * Logs in JSON format for production, pretty-printed for development
 */
@Injectable()
export class AppLogger extends NestLogger {
  constructor() {
    super();
  }

  /**
   * Log error with full context
   */
  error(message: string, context?: LogContext | string, stack?: string) {
    const logData = this.buildLogData('error', message, context, stack);
    this.formatAndLog('error', logData);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext | string) {
    const logData = this.buildLogData('warn', message, context);
    this.formatAndLog('warn', logData);
  }

  /**
   * Log general information
   */
  log(message: string, context?: LogContext | string) {
    const logData = this.buildLogData('log', message, context);
    this.formatAndLog('log', logData);
  }

  /**
   * Log debug information
   */
  debug(message: string, context?: LogContext | string) {
    if (process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV === 'development') {
      const logData = this.buildLogData('debug', message, context);
      this.formatAndLog('debug', logData);
    }
  }

  /**
   * Log verbose information
   */
  verbose(message: string, context?: LogContext | string) {
    if (
      process.env.LOG_LEVEL === 'verbose' ||
      process.env.LOG_LEVEL === 'debug'
    ) {
      const logData = this.buildLogData('verbose', message, context);
      this.formatAndLog('verbose', logData);
    }
  }

  /**
   * Build structured log data
   */
  private buildLogData(
    level: string,
    message: string,
    context?: LogContext | string,
    stack?: string
  ): Record<string, unknown> {
    const logData: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      message
    };

    if (typeof context === 'string') {
      logData.context = context;
    } else if (context) {
      Object.assign(logData, context);
    }

    if (stack) {
      logData.stack = stack;
    }

    return logData;
  }

  /**
   * Format and output log
   */
  private formatAndLog(level: string, logData: Record<string, unknown>) {
    const isDevelopment = process.env.NODE_ENV === 'development';

    if (isDevelopment) {
      // Pretty-print for development
      console.log(this.formatPretty(level, logData));
    } else {
      // JSON format for production
      console.log(JSON.stringify(logData));
    }
  }

  /**
   * Format log data for pretty-printing
   */
  private formatPretty(level: string, logData: Record<string, unknown>): string {
    const levelColor = this.getLevelColor(level);
    const timestamp = logData.timestamp;
    const message = logData.message;
    const restData = Object.entries(logData)
      .filter(([key]) => !['timestamp', 'level', 'message'].includes(key))
      .reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {} as Record<string, unknown>);

    let output = `${levelColor}${level.toUpperCase()}\x1b[0m [${timestamp}] ${message}`;

    if (Object.keys(restData).length > 0) {
      output += ` ${JSON.stringify(restData, null, 2)}`;
    }

    return output;
  }

  /**
   * Get ANSI color code for log level
   */
  private getLevelColor(level: string): string {
    switch (level) {
      case 'error':
        return '\x1b[31m'; // Red
      case 'warn':
        return '\x1b[33m'; // Yellow
      case 'log':
        return '\x1b[36m'; // Cyan
      case 'debug':
        return '\x1b[35m'; // Magenta
      default:
        return '\x1b[0m'; // Reset
    }
  }
}
```

### 11. `packages/api/src/common/interceptors/transform.interceptor.ts` — Response Interceptor

```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { Response } from 'express';
import { createApiResponse } from '@hedera-social/shared';

/**
 * Transform all successful responses into standard API envelope
 * Automatically wraps data in ApiResponse format
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse> {
    const response = context.switchToHttp().getResponse<Response>();
    const startTime = Date.now();

    return next.handle().pipe(
      // Add response timing header
      tap(() => {
        const duration = Date.now() - startTime;
        response.setHeader('X-Response-Time', `${duration}ms`);
      }),
      // Transform successful responses
      map(data => {
        // If response is already wrapped (status, headers already set)
        if (data && typeof data === 'object' && 'success' in data) {
          return data;
        }

        // Check if response has pagination metadata
        const dataParsed = data as Record<string, unknown> | null | undefined;
        const meta = dataParsed && typeof dataParsed === 'object' && 'meta' in dataParsed ? dataParsed.meta : undefined;
        if (meta && typeof meta === 'object') {
          return createApiResponse((dataParsed as Record<string, unknown>).data || data, meta as Record<string, unknown>);
        }

        // Wrap plain data in success response
        return createApiResponse(data);
      })
    );
  }
}
```

### 12. `packages/api/src/common/pipes/validation.pipe.ts` — Custom Validation Pipe

```typescript
import {
  PipeTransform,
  Injectable,
  BadRequestException,
  ValidationPipe as NestValidationPipe,
  ValidationError,
  ArgumentMetadata
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { createApiError } from '@hedera-social/shared';

/**
 * Custom validation pipe that returns standardized error responses
 * Handles class validation with consistent error formatting
 */
@Injectable()
export class AppValidationPipe implements PipeTransform {
  async transform(value: unknown, metadata: ArgumentMetadata) {
    if (!metadata.type || !metadata.metatype) {
      return value;
    }

    // Skip validation for primitive types
    if (
      [String, Boolean, Number, Array].includes(metadata.metatype)
    ) {
      return value;
    }

    const object = plainToInstance(metadata.metatype, value);
    const errors = await validate(object, {
      skipMissingProperties: false,
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    });

    if (errors.length > 0) {
      const formattedErrors = this.formatErrors(errors);
      throw new BadRequestException(
        createApiError(
          'VALIDATION_FAILED',
          'Input validation failed. Please check your data.',
          400,
          '',
          '',
          { validationErrors: formattedErrors }
        )
      );
    }

    return object;
  }

  /**
   * Format validation errors for response
   */
  private formatErrors(
    errors: ValidationError[],
    parent = ''
  ): Record<string, string[]> {
    const formatted: Record<string, string[]> = {};

    for (const error of errors) {
      const field = parent ? `${parent}.${error.property}` : error.property;

      if (error.children && error.children.length > 0) {
        Object.assign(formatted, this.formatErrors(error.children, field));
      } else {
        formatted[field] = Object.values(error.constraints || {});
      }
    }

    return formatted;
  }
}

/**
 * Create a configured validation pipe for use in main.ts
 */
export function createValidationPipe() {
  return new NestValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true
    },
    errorHttpStatusCode: 400,
    exceptionFactory: (errors: ValidationError[]) => {
      const message = 'Input validation failed. Please check your data.';
      const formattedErrors: Record<string, string[]> = {};

      for (const error of errors) {
        if (error.constraints) {
          formattedErrors[error.property] = Object.values(error.constraints);
        }
      }

      return new BadRequestException({
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message,
          statusCode: 400,
          timestamp: new Date().toISOString(),
          path: '',
          requestId: '',
          details: { validationErrors: formattedErrors }
        }
      });
    }
  });
}
```

### 13. `packages/api/src/common/guards/throttle.guard.ts` — Rate Limiting Guard

```typescript
import { Injectable, HttpStatus, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';

/**
 * Custom throttle guard with specific limits per endpoint category
 * Protects against brute force attacks and ensures fair resource usage
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  /**
   * Generate key for throttling (IP-based by default)
   */
  protected generateKey(
    context: ExecutionContext,
    limit: number,
    ttl: number
  ): string {
    const request = context.switchToHttp().getRequest();
    const ip =
      request.ip ||
      request.connection.remoteAddress ||
      request.socket.remoteAddress ||
      'unknown';

    return `${ip}-${request.path}`;
  }

  /**
   * Can override per-route limits using decorator
   */
  getTrackers(request: Record<string, unknown>): string[] {
    // Get custom limit if set via decorator
    const route = request.route as { stack?: Array<{ handle?: unknown }> };
    const limit = Reflect.getMetadata('throttle:limit', route?.stack?.[0]?.handle);
    if (limit) {
      return [limit];
    }

    // Return default tracker
    return ['default'];
  }
}

/**
 * Define specific rate limit configurations
 */
export const RATE_LIMITS = {
  // Default: 100 requests per minute
  DEFAULT: {
    limit: 100,
    ttl: 60
  },
  // Auth endpoints: 10 requests per minute (brute force protection)
  AUTH: {
    limit: 10,
    ttl: 60
  },
  // Hedera transactions: 30 per minute (cost protection)
  HEDERA: {
    limit: 30,
    ttl: 60
  },
  // Signup: 5 per hour
  SIGNUP: {
    limit: 5,
    ttl: 3600
  },
  // Password reset: 3 per hour
  PASSWORD_RESET: {
    limit: 3,
    ttl: 3600
  },
  // File uploads: 20 per hour
  FILE_UPLOAD: {
    limit: 20,
    ttl: 3600
  }
};
```

### 14. `packages/api/src/main.ts` — Main Application Setup

```typescript
import { NestFactory } from '@nestjs/core';
import { HttpAdapterHost, NestApplication } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { createValidationPipe } from './common/pipes/validation.pipe';
import { AppLogger } from './common/logger/app-logger.service';

async function bootstrap() {
  const app = await NestFactory.create<NestApplication>(AppModule);
  const logger = new AppLogger();
  const httpAdapterHost = app.get(HttpAdapterHost);

  // ========== SECURITY HEADERS ==========
  // Helmet helps secure Express apps by setting various HTTP headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'data:']
        }
      },
      hsts: {
        maxAge: 31536000, // 1 year in seconds
        includeSubDomains: true,
        preload: true
      },
      frameguard: {
        action: 'deny'
      },
      noSniff: true,
      xssFilter: true
    })
  );

  // ========== CORS CONFIGURATION ==========
  const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',');

  app.enableCors({
    origin: corsOrigins.map(origin => origin.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID', 'X-Response-Time'],
    maxAge: 3600
  });

  // ========== PROXY TRUST ==========
  // Trust proxy if behind reverse proxy (required for getting client IP)
  app.set('trust proxy', true);

  // ========== MIDDLEWARE ==========
  app.use(new RequestIdMiddleware().use.bind(new RequestIdMiddleware()));

  // ========== PIPES ==========
  app.useGlobalPipes(createValidationPipe());

  // ========== INTERCEPTORS ==========
  app.useGlobalInterceptors(new TransformInterceptor());

  // ========== EXCEPTION FILTERS ==========
  app.useGlobalFilters(new GlobalExceptionFilter());

  // ========== VERSION & DOCUMENTATION ==========
  app.setGlobalPrefix('api/v1');

  // Swagger documentation (if available)
  try {
    const { SwaggerModule, DocumentBuilder } = await import('@nestjs/swagger');
    const config = new DocumentBuilder()
      .setTitle('Hedera Social Platform API')
      .setDescription('API for blockchain-based social platform')
      .setVersion('1.0.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access_token'
      )
      .addTag('Auth', 'Authentication and authorization endpoints')
      .addTag('Profile', 'User profile management')
      .addTag('Messages', 'Messaging and conversations')
      .addTag('Hedera', 'Hedera blockchain integration')
      .addTag('Payments', 'Payment and transfer endpoints')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);

    logger.log('Swagger documentation available at /api/docs');
  } catch (error) {
    logger.debug('Swagger not available');
  }

  // ========== START SERVER ==========
  const port = parseInt(process.env.PORT || '3000', 10);
  const env = process.env.NODE_ENV || 'development';

  await app.listen(port);

  logger.log(`Application started on port ${port}`, {
    environment: env,
    nodeVersion: process.version,
    corsOrigins: corsOrigins.join(', '),
    logLevel: process.env.LOG_LEVEL || 'log'
  });
}

bootstrap().catch(error => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
```

---

## Environment Configuration

### `.env` Example

```env
# Application
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug
ENVIRONMENT=development

# Security
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRY=24h
JWT_REFRESH_SECRET=your-refresh-token-secret
JWT_REFRESH_EXPIRY=30d

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=hedera_user
DATABASE_PASSWORD=secure-password
DATABASE_NAME=hedera_social

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=

# Hedera Network
HEDERA_NETWORK=testnet
HEDERA_ACCOUNT_ID=0.0.123456789
HEDERA_PRIVATE_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# File Upload
FILE_UPLOAD_MAX_SIZE=10485760
FILE_UPLOAD_DIR=./uploads

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_DEFAULT=100
RATE_LIMIT_AUTH=10

# Email (if needed)
EMAIL_FROM=noreply@hedera-social.com
```

---

## Verification Table

| Item | Status | Verified By |
|------|--------|-------------|
| `packages/shared/src/api-envelope.ts` created | ⬜ | Developer |
| `packages/shared/src/error-codes.ts` created | ⬜ | Developer |
| Response helpers working (createApiResponse, etc) | ⬜ | Tests |
| Exception base class implemented | ⬜ | Developer |
| Auth exceptions created and tested | ⬜ | Tests |
| Hedera exceptions created and tested | ⬜ | Tests |
| Payment exceptions created | ⬜ | Developer |
| Conversation exceptions created | ⬜ | Developer |
| Global exception filter catching all errors | ⬜ | Tests |
| Database errors transformed to ApiError | ⬜ | Tests |
| Request ID generated on every request | ⬜ | Tests |
| Request ID in response headers | ⬜ | Manual Test |
| Structured logging working | ⬜ | Manual Test |
| Response interceptor wrapping data | ⬜ | Tests |
| Validation pipe rejecting invalid input | ⬜ | Tests |
| Rate limiting guards configured | ⬜ | Manual Test |
| Security headers set (Helmet) | ⬜ | Manual Test |
| CORS configured correctly | ⬜ | Manual Test |
| All endpoints return ApiResponse envelope | ⬜ | Code Review |
| Stack traces hidden in production | ⬜ | Code Review |
| No sensitive data in error responses | ⬜ | Security Audit |
| Logging includes requestId and userId | ⬜ | Log Review |
| Custom exceptions have proper HTTP status codes | ⬜ | Tests |

---

## Definition of Done

Error handling and logging standards are complete when:

1. ✅ API response envelope structure is defined and shared across all packages
2. ✅ All error codes defined in centralized registry with human-readable messages
3. ✅ Custom exception classes created for all major domains
4. ✅ Global exception filter transforms all errors into standardized format
5. ✅ Request ID middleware generates and propagates IDs through system
6. ✅ Structured logging service logs with consistent format
7. ✅ Response interceptor wraps successful responses automatically
8. ✅ Validation pipe configured with standardized error responses
9. ✅ Rate limiting guards protect against brute force and abuse
10. ✅ Security headers (Helmet) configured in main.ts
11. ✅ CORS configured with allowed origins from environment
12. ✅ All API endpoints follow standard error response format
13. ✅ Stack traces hidden in production, shown in development
14. ✅ No sensitive data exposed in error responses
15. ✅ All integration tests verify error handling
16. ✅ Documentation updated for error response format
17. ✅ Team trained on using custom exceptions

---

## Troubleshooting

### Issue: Global exception filter not catching exceptions

**Solution:**
- Verify filter is registered with `app.useGlobalFilters()`
- Check that custom exceptions extend AppException
- Ensure exceptions are thrown (not returned)

```typescript
// Correct - thrown
throw new InvalidOtpException();

// Incorrect - returned
return new InvalidOtpException();
```

### Issue: Request ID not available in services

**Solution:**
- Inject REQUEST scope dependency
- Access via request object injected through REQUEST token

```typescript
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

@Injectable()
export class MyService {
  constructor(@Inject(REQUEST) private request: Request & { id?: string }) {}

  doSomething() {
    const requestId = this.request.id;
  }
}
```

### Issue: Validation errors not in standard format

**Solution:**
- Ensure custom validation pipe is registered globally
- Check exceptionFactory is properly configured
- Verify DTO is using class-validator decorators

```typescript
import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}
```

### Issue: Rate limiting not working

**Solution:**
- Verify `@nestjs/throttler` is installed
- Check ThrottlerModule is imported in AppModule
- Ensure guard is registered globally or per-controller

```typescript
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100
      }
    ])
  ]
})
export class AppModule {}
```

### Issue: CORS errors in development

**Solution:**
- Check CORS_ORIGINS environment variable
- Ensure frontend URL is in allowed origins
- Verify credentials are handled correctly

```bash
# In .env
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

---

## Files Created/Modified

| Path | Purpose |
|------|---------|
| `packages/shared/src/api-envelope.ts` | Standard response envelope types and helpers |
| `packages/shared/src/error-codes.ts` | Central error code registry |
| `packages/api/src/common/exceptions/app.exception.ts` | Base exception class |
| `packages/api/src/common/exceptions/auth.exceptions.ts` | Authentication exceptions |
| `packages/api/src/common/exceptions/hedera.exceptions.ts` | Hedera blockchain exceptions |
| `packages/api/src/common/exceptions/payment.exceptions.ts` | Payment-related exceptions |
| `packages/api/src/common/exceptions/conversation.exceptions.ts` | Conversation exceptions |
| `packages/api/src/common/filters/global-exception.filter.ts` | Global exception filter |
| `packages/api/src/common/middleware/request-id.middleware.ts` | Request ID generation |
| `packages/api/src/common/logger/app-logger.service.ts` | Structured logging service |
| `packages/api/src/common/interceptors/transform.interceptor.ts` | Response transformation |
| `packages/api/src/common/pipes/validation.pipe.ts` | Custom validation pipe |
| `packages/api/src/common/guards/throttle.guard.ts` | Rate limiting guard |
| `packages/api/src/main.ts` | Application setup and configuration |

---

## Integration with Other Tasks

- **P0-T04:** NestJS setup — This task builds on the basic NestJS structure
- **P0-T02:** Shared Types — Uses types from shared package
- **S01-S02:** Build system — Works within monorepo structure
- **T05+:** All backend endpoints should use these standards

---

## Best Practices Implemented

1. **Type Safety** — All exceptions and responses are fully typed
2. **Consistency** — Every endpoint returns same response format
3. **Security** — Stack traces hidden in production, no sensitive data
4. **Traceability** — Request IDs enable end-to-end request tracking
5. **Debugging** — Structured logs with context make debugging easier
6. **Performance** — Rate limiting protects against abuse
7. **User Experience** — Clear error messages help users understand problems
8. **Extensibility** — Easy to add new exception types or error codes

---

## Next Steps

1. Install all required dependencies
2. Configure environment variables
3. Run tests to verify error handling
4. Integrate with existing controllers
5. Document API error responses for frontend team
6. Set up monitoring and alerting for error rates
7. Train team on exception handling patterns

