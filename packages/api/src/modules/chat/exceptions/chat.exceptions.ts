import {
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";

export class WsAuthenticationFailedException extends UnauthorizedException {
  constructor(reason: string) {
    super({
      code: "WS_AUTHENTICATION_FAILED",
      message: `WebSocket authentication failed: ${reason}`,
    });
  }
}

export class WsTokenMissingException extends UnauthorizedException {
  constructor() {
    super({
      code: "WS_TOKEN_MISSING",
      message:
        "WebSocket connection requires a JWT token in auth.token or Authorization header",
    });
  }
}

export class WsNotConversationMemberException extends ForbiddenException {
  constructor(accountId: string, topicId: string) {
    super({
      code: "WS_NOT_CONVERSATION_MEMBER",
      message: `Account ${accountId} is not a member of conversation topic ${topicId}`,
    });
  }
}

export class WsInvalidTopicIdException extends BadRequestException {
  constructor(topicId: string) {
    super({
      code: "WS_INVALID_TOPIC_ID",
      message: `Invalid topic ID: ${topicId}`,
    });
  }
}

export class WsInvalidReadReceiptException extends BadRequestException {
  constructor(reason: string) {
    super({
      code: "WS_INVALID_READ_RECEIPT",
      message: `Invalid read receipt: ${reason}`,
    });
  }
}

export class WsRedisConnectionException extends InternalServerErrorException {
  constructor(reason: string) {
    super({
      code: "WS_REDIS_CONNECTION_FAILED",
      message: `Redis connection failed for WebSocket service: ${reason}`,
    });
  }
}

export class WsConversationStateException extends InternalServerErrorException {
  constructor(topicId: string, reason: string) {
    super({
      code: "WS_CONVERSATION_STATE_ERROR",
      message: `Failed to get conversation state for topic ${topicId}: ${reason}`,
    });
  }
}
