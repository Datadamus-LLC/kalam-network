import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from "@nestjs/common";

// ---------------------------------------------------------------------------
// Not Found
// ---------------------------------------------------------------------------

export class BroadcastTopicNotFoundException extends NotFoundException {
  constructor(orgId: string) {
    super({
      code: "BROADCAST_TOPIC_NOT_FOUND",
      message: `Organization ${orgId} does not have a broadcast topic configured`,
    });
  }
}

export class BroadcastMessageNotFoundException extends NotFoundException {
  constructor(messageId: string) {
    super({
      code: "BROADCAST_MESSAGE_NOT_FOUND",
      message: `Broadcast message ${messageId} not found`,
    });
  }
}

export class BroadcastOrgNotFoundException extends NotFoundException {
  constructor(orgId: string) {
    super({
      code: "BROADCAST_ORG_NOT_FOUND",
      message: `Organization ${orgId} not found`,
    });
  }
}

// ---------------------------------------------------------------------------
// Forbidden
// ---------------------------------------------------------------------------

export class BroadcastNotAuthorizedToPostException extends ForbiddenException {
  constructor(userId: string, orgId: string) {
    super({
      code: "BROADCAST_NOT_AUTHORIZED_TO_POST",
      message: `User ${userId} is not authorized to post broadcasts for organization ${orgId}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Conflict
// ---------------------------------------------------------------------------

export class AlreadySubscribedException extends ConflictException {
  constructor(accountId: string, orgId: string) {
    super({
      code: "BROADCAST_ALREADY_SUBSCRIBED",
      message: `Account ${accountId} is already subscribed to organization ${orgId} broadcasts`,
    });
  }
}

// ---------------------------------------------------------------------------
// Bad Request
// ---------------------------------------------------------------------------

export class NotSubscribedException extends BadRequestException {
  constructor(accountId: string, orgId: string) {
    super({
      code: "BROADCAST_NOT_SUBSCRIBED",
      message: `Account ${accountId} is not subscribed to organization ${orgId} broadcasts`,
    });
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

export class BroadcastCreationFailedException extends InternalServerErrorException {
  constructor(reason: string) {
    super({
      code: "BROADCAST_CREATION_FAILED",
      message: `Broadcast creation failed: ${reason}`,
    });
  }
}
