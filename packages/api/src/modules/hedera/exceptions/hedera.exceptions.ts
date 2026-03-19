import { HttpStatus } from "@nestjs/common";
import { BaseException } from "../../../common/exceptions/base.exception";

export class HederaClientNotInitializedException extends BaseException {
  constructor(message: string) {
    super(
      "HEDERA_CLIENT_NOT_INITIALIZED",
      message,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

export class HederaTopicCreationException extends BaseException {
  constructor(message: string) {
    super(
      "HEDERA_TOPIC_CREATION_FAILED",
      message,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

export class HederaMessageSubmissionException extends BaseException {
  constructor(message: string) {
    super(
      "HEDERA_MESSAGE_SUBMISSION_FAILED",
      message,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

export class HederaTransactionException extends BaseException {
  constructor(message: string) {
    super(
      "HEDERA_TRANSACTION_FAILED",
      message,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

export class HederaNftMintException extends BaseException {
  constructor(message: string) {
    super("HEDERA_NFT_MINT_FAILED", message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

export class HederaTransferException extends BaseException {
  constructor(message: string) {
    super("HEDERA_TRANSFER_FAILED", message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

export class HederaAccountCreationException extends BaseException {
  constructor(message: string) {
    super(
      "HEDERA_ACCOUNT_CREATION_FAILED",
      message,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

export class MirrorNodeRequestException extends BaseException {
  constructor(message: string) {
    super("MIRROR_NODE_REQUEST_FAILED", message, HttpStatus.BAD_GATEWAY);
  }
}
