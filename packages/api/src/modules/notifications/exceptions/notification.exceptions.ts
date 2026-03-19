import { HttpStatus } from "@nestjs/common";
import { BaseException } from "../../../common/exceptions/base.exception";

/**
 * Thrown when creating a notification fails (database save).
 */
export class NotificationCreateException extends BaseException {
  constructor(reason: string) {
    super(
      "NOTIFICATION_CREATE_FAILED",
      `Failed to create notification: ${reason}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

/**
 * Thrown when fetching notifications from the database fails.
 */
export class NotificationQueryException extends BaseException {
  constructor(operation: string, reason: string) {
    super(
      "NOTIFICATION_QUERY_FAILED",
      `Failed to ${operation}: ${reason}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

/**
 * Thrown when the mark-as-read operation fails.
 */
export class NotificationMarkReadException extends BaseException {
  constructor(reason: string) {
    super(
      "NOTIFICATION_MARK_READ_FAILED",
      `Failed to mark notifications as read: ${reason}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

/**
 * Thrown when the unread count query fails.
 */
export class NotificationUnreadCountException extends BaseException {
  constructor(reason: string) {
    super(
      "NOTIFICATION_UNREAD_COUNT_FAILED",
      `Failed to get unread count: ${reason}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

/**
 * Thrown when a notification is not found by ID (e.g., for mark-as-read
 * if the caller provides an invalid ID).
 */
export class NotificationNotFoundException extends BaseException {
  constructor(notificationId: string) {
    super(
      "NOTIFICATION_NOT_FOUND",
      `Notification not found: ${notificationId}`,
      HttpStatus.NOT_FOUND,
    );
  }
}

/**
 * Thrown when submitting a notification to HCS fails.
 * This is a non-critical error — the notification is still stored in PostgreSQL
 * and delivered via WebSocket. HCS is an optional audit trail.
 */
export class NotificationHcsException extends BaseException {
  constructor(reason: string) {
    super(
      "NOTIFICATION_HCS_SUBMISSION_FAILED",
      `Failed to submit notification to HCS: ${reason}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

/**
 * Thrown when emitting a notification via WebSocket fails.
 * This is a non-critical error — the notification is still persisted.
 */
export class NotificationWebSocketException extends BaseException {
  constructor(reason: string) {
    super(
      "NOTIFICATION_WEBSOCKET_EMIT_FAILED",
      `Failed to emit notification via WebSocket: ${reason}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

/**
 * Thrown when the provided mark-as-read request is invalid.
 */
export class InvalidMarkReadRequestException extends BaseException {
  constructor(reason: string) {
    super("INVALID_MARK_READ_REQUEST", reason, HttpStatus.BAD_REQUEST);
  }
}
