import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";

export class ConversationNotFoundException extends NotFoundException {
  constructor(conversationId: string) {
    super({
      code: "CONVERSATION_NOT_FOUND",
      message: `Conversation ${conversationId} not found`,
    });
  }
}

export class ConversationAlreadyExistsException extends ConflictException {
  constructor(participantA: string, participantB: string) {
    super({
      code: "DIRECT_CONVERSATION_EXISTS",
      message: `A direct conversation between ${participantA} and ${participantB} already exists`,
    });
  }
}

export class NotConversationMemberException extends ForbiddenException {
  constructor(accountId: string, conversationId: string) {
    super({
      code: "NOT_CONVERSATION_MEMBER",
      message: `Account ${accountId} is not a member of conversation ${conversationId}`,
    });
  }
}

export class NotConversationAdminException extends ForbiddenException {
  constructor(accountId: string, conversationId: string) {
    super({
      code: "NOT_CONVERSATION_ADMIN",
      message: `Account ${accountId} is not an admin of conversation ${conversationId}`,
    });
  }
}

export class InvalidParticipantsException extends BadRequestException {
  constructor(reason: string) {
    super({
      code: "INVALID_PARTICIPANTS",
      message: `Invalid participants: ${reason}`,
    });
  }
}

export class ConversationCreationFailedException extends InternalServerErrorException {
  constructor(reason: string) {
    super({
      code: "CONVERSATION_CREATION_FAILED",
      message: `Failed to create conversation: ${reason}`,
    });
  }
}

export class ParticipantNotFoundException extends NotFoundException {
  constructor(accountId: string) {
    super({
      code: "PARTICIPANT_NOT_FOUND",
      message: `User with Hedera account ${accountId} not found`,
    });
  }
}

export class GroupNameRequiredException extends BadRequestException {
  constructor() {
    super({
      code: "GROUP_NAME_REQUIRED",
      message: "Group name is required for group conversations",
    });
  }
}

export class CannotAddToDirectConversationException extends BadRequestException {
  constructor() {
    super({
      code: "CANNOT_ADD_TO_DIRECT",
      message: "Cannot add participants to a direct conversation",
    });
  }
}

export class AlreadyMemberException extends ConflictException {
  constructor(accountId: string) {
    super({
      code: "ALREADY_MEMBER",
      message: `Account ${accountId} is already a member of this conversation`,
    });
  }
}

export class MissingEncryptionKeyException extends BadRequestException {
  constructor(accountId: string) {
    super({
      code: "MISSING_ENCRYPTION_KEY",
      message: `User ${accountId} does not have an encryption public key registered`,
    });
  }
}
