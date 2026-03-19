import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  NotImplementedException,
} from "@nestjs/common";

export class MessageNotFoundException extends NotFoundException {
  constructor(topicId: string, sequenceNumber: number) {
    super({
      code: "MESSAGE_NOT_FOUND",
      message: `Message with sequence ${sequenceNumber} not found in topic ${topicId}`,
    });
  }
}

export class NotConversationParticipantException extends ForbiddenException {
  constructor(accountId: string, topicId: string) {
    super({
      code: "NOT_CONVERSATION_PARTICIPANT",
      message: `Account ${accountId} is not a participant of conversation topic ${topicId}`,
    });
  }
}

export class ConversationTopicNotFoundException extends NotFoundException {
  constructor(topicId: string) {
    super({
      code: "CONVERSATION_TOPIC_NOT_FOUND",
      message: `Conversation with topic ${topicId} not found`,
    });
  }
}

export class EncryptionKeyNotFoundException extends BadRequestException {
  constructor(accountId: string, topicId: string) {
    super({
      code: "ENCRYPTION_KEY_NOT_FOUND",
      message: `No encryption key found for account ${accountId} in conversation topic ${topicId}`,
    });
  }
}

export class MessageEncryptionException extends InternalServerErrorException {
  constructor(reason: string) {
    super({
      code: "MESSAGE_ENCRYPTION_FAILED",
      message: `Message encryption failed: ${reason}`,
    });
  }
}

export class MessageSubmissionException extends InternalServerErrorException {
  constructor(topicId: string, reason: string) {
    super({
      code: "MESSAGE_SUBMISSION_FAILED",
      message: `Failed to submit message to topic ${topicId}: ${reason}`,
    });
  }
}

export class MessageSyncException extends InternalServerErrorException {
  constructor(topicId: string, reason: string) {
    super({
      code: "MESSAGE_SYNC_FAILED",
      message: `Failed to sync messages for topic ${topicId}: ${reason}`,
    });
  }
}

export class InvalidPaginationCursorException extends BadRequestException {
  constructor(cursor: string) {
    super({
      code: "INVALID_PAGINATION_CURSOR",
      message: `Invalid pagination cursor: ${cursor}. Must be a positive integer sequence number.`,
    });
  }
}

export class InvalidMessageLimitException extends BadRequestException {
  constructor(limit: string) {
    super({
      code: "INVALID_MESSAGE_LIMIT",
      message: `Invalid message limit: ${limit}. Must be between 1 and 100.`,
    });
  }
}

export class MediaUploadNotImplementedException extends NotImplementedException {
  constructor() {
    super({
      code: "MEDIA_UPLOAD_NOT_IMPLEMENTED",
      message:
        "Encrypted media upload is not yet implemented. Text messages are supported.",
    });
  }
}

export class MessageTextTooLongException extends BadRequestException {
  constructor(length: number, maxLength: number) {
    super({
      code: "MESSAGE_TEXT_TOO_LONG",
      message: `Message text is ${length} characters but the maximum is ${maxLength}`,
    });
  }
}
