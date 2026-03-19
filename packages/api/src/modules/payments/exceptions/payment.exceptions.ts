import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  BadGatewayException,
} from "@nestjs/common";

// ---------------------------------------------------------------------------
// Not Found
// ---------------------------------------------------------------------------

export class PaymentNotFoundException extends NotFoundException {
  constructor(paymentId: string) {
    super({
      code: "PAYMENT_NOT_FOUND",
      message: `Payment ${paymentId} not found`,
    });
  }
}

export class PaymentRequestNotFoundException extends NotFoundException {
  constructor(requestId: string) {
    super({
      code: "PAYMENT_REQUEST_NOT_FOUND",
      message: `Payment request ${requestId} not found`,
    });
  }
}

export class TransactionNotFoundException extends NotFoundException {
  constructor(transactionId: string) {
    super({
      code: "TRANSACTION_NOT_FOUND",
      message: `Transaction ${transactionId} not found`,
    });
  }
}

export class ConversationNotFoundException extends NotFoundException {
  constructor(topicId: string) {
    super({
      code: "CONVERSATION_NOT_FOUND",
      message: `Conversation with topic ${topicId} not found`,
    });
  }
}

export class UserNotFoundException extends NotFoundException {
  constructor(identifier: string) {
    super({
      code: "USER_NOT_FOUND",
      message: `User ${identifier} not found`,
    });
  }
}

// ---------------------------------------------------------------------------
// Forbidden / Authorization
// ---------------------------------------------------------------------------

export class NotConversationParticipantException extends ForbiddenException {
  constructor(accountId: string, topicId: string) {
    super({
      code: "NOT_CONVERSATION_PARTICIPANT",
      message: `Account ${accountId} is not a participant of conversation topic ${topicId}`,
    });
  }
}

export class PaymentRequestNotOwnedException extends ForbiddenException {
  constructor(requestId: string, accountId: string) {
    super({
      code: "PAYMENT_REQUEST_NOT_OWNED",
      message: `Payment request ${requestId} was not created by account ${accountId}`,
    });
  }
}

export class CannotPayOwnRequestException extends ForbiddenException {
  constructor() {
    super({
      code: "CANNOT_PAY_OWN_REQUEST",
      message: "Cannot fulfill your own payment request",
    });
  }
}

// ---------------------------------------------------------------------------
// Bad Request / Validation
// ---------------------------------------------------------------------------

export class InvalidPaymentAmountException extends BadRequestException {
  constructor(amount: number, reason: string) {
    super({
      code: "INVALID_PAYMENT_AMOUNT",
      message: `Invalid payment amount ${amount}: ${reason}`,
    });
  }
}

export class InvalidCurrencyException extends BadRequestException {
  constructor(currency: string) {
    super({
      code: "INVALID_CURRENCY",
      message: `Unsupported currency: ${currency}. Supported currencies: HBAR, USDC, USD`,
    });
  }
}

export class SelfPaymentException extends BadRequestException {
  constructor() {
    super({
      code: "SELF_PAYMENT_NOT_ALLOWED",
      message: "Cannot send a payment to yourself",
    });
  }
}

export class PaymentRequestExpiredException extends BadRequestException {
  constructor(requestId: string) {
    super({
      code: "PAYMENT_REQUEST_EXPIRED",
      message: `Payment request ${requestId} has expired`,
    });
  }
}

export class PaymentRequestAlreadyPaidException extends BadRequestException {
  constructor(requestId: string) {
    super({
      code: "PAYMENT_REQUEST_ALREADY_PAID",
      message: `Payment request ${requestId} has already been paid`,
    });
  }
}

export class PaymentRequestAlreadyDeclinedException extends BadRequestException {
  constructor(requestId: string) {
    super({
      code: "PAYMENT_REQUEST_ALREADY_DECLINED",
      message: `Payment request ${requestId} has already been declined`,
    });
  }
}

export class PaymentRequestAlreadyCancelledException extends BadRequestException {
  constructor(requestId: string) {
    super({
      code: "PAYMENT_REQUEST_ALREADY_CANCELLED",
      message: `Payment request ${requestId} has already been cancelled`,
    });
  }
}

export class PaymentRequestNotActionableException extends BadRequestException {
  constructor(requestId: string, currentStatus: string) {
    super({
      code: "PAYMENT_REQUEST_NOT_ACTIONABLE",
      message: `Payment request ${requestId} cannot be actioned (current status: ${currentStatus})`,
    });
  }
}

export class InvalidSplitParticipantsException extends BadRequestException {
  constructor(reason: string) {
    super({
      code: "INVALID_SPLIT_PARTICIPANTS",
      message: `Invalid split payment participants: ${reason}`,
    });
  }
}

export class InvalidPaginationException extends BadRequestException {
  constructor(reason: string) {
    super({
      code: "INVALID_PAGINATION",
      message: `Invalid pagination parameters: ${reason}`,
    });
  }
}

export class MissingWalletException extends BadRequestException {
  constructor(identifier: string) {
    super({
      code: "MISSING_WALLET",
      message: `User ${identifier} does not have a linked Hedera wallet`,
    });
  }
}

// ---------------------------------------------------------------------------
// Internal / Gateway Errors
// ---------------------------------------------------------------------------

export class PaymentExecutionException extends InternalServerErrorException {
  constructor(reason: string) {
    super({
      code: "PAYMENT_EXECUTION_FAILED",
      message: `Payment execution failed: ${reason}`,
    });
  }
}

export class PaymentEncryptionException extends InternalServerErrorException {
  constructor(reason: string) {
    super({
      code: "PAYMENT_ENCRYPTION_FAILED",
      message: `Payment message encryption failed: ${reason}`,
    });
  }
}

export class HcsSubmissionException extends InternalServerErrorException {
  constructor(topicId: string, reason: string) {
    super({
      code: "HCS_SUBMISSION_FAILED",
      message: `Failed to submit payment message to topic ${topicId}: ${reason}`,
    });
  }
}

export class BalanceQueryException extends BadGatewayException {
  constructor(accountId: string, reason: string) {
    super({
      code: "BALANCE_QUERY_FAILED",
      message: `Failed to query balance for account ${accountId}: ${reason}`,
    });
  }
}
