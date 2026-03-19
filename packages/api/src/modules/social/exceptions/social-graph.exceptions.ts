import { HttpStatus } from "@nestjs/common";
import { BaseException } from "../../../common/exceptions/base.exception";

export class SelfFollowException extends BaseException {
  constructor() {
    super(
      "SELF_FOLLOW_NOT_ALLOWED",
      "Cannot follow yourself",
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class SelfUnfollowException extends BaseException {
  constructor() {
    super(
      "SELF_UNFOLLOW_NOT_ALLOWED",
      "Cannot unfollow yourself",
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class AlreadyFollowingException extends BaseException {
  constructor(followerAccountId: string, targetAccountId: string) {
    super(
      "ALREADY_FOLLOWING",
      `Account ${followerAccountId} is already following ${targetAccountId}`,
      HttpStatus.CONFLICT,
    );
  }
}

export class NotFollowingException extends BaseException {
  constructor(followerAccountId: string, targetAccountId: string) {
    super(
      "NOT_FOLLOWING",
      `Account ${followerAccountId} is not following ${targetAccountId}`,
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class FollowTargetNotFoundException extends BaseException {
  constructor(accountId: string) {
    super(
      "FOLLOW_TARGET_NOT_FOUND",
      `Target user not found: ${accountId}`,
      HttpStatus.NOT_FOUND,
    );
  }
}

export class FollowActorNotFoundException extends BaseException {
  constructor(accountId: string) {
    super(
      "FOLLOW_ACTOR_NOT_FOUND",
      `Follower user not found: ${accountId}`,
      HttpStatus.NOT_FOUND,
    );
  }
}

export class FollowHcsSubmissionException extends BaseException {
  constructor(reason: string) {
    super(
      "FOLLOW_HCS_SUBMISSION_FAILED",
      `Failed to submit follow event to HCS: ${reason}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

export class UnfollowHcsSubmissionException extends BaseException {
  constructor(reason: string) {
    super(
      "UNFOLLOW_HCS_SUBMISSION_FAILED",
      `Failed to submit unfollow event to HCS: ${reason}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

export class FollowIndexingException extends BaseException {
  constructor(reason: string) {
    super(
      "FOLLOW_INDEXING_FAILED",
      `Failed to index follow event in database: ${reason}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

export class SocialGraphTopicNotConfiguredException extends BaseException {
  constructor() {
    super(
      "SOCIAL_GRAPH_TOPIC_NOT_CONFIGURED",
      "HEDERA_SOCIAL_GRAPH_TOPIC environment variable is not configured",
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

export class SocialGraphSyncException extends BaseException {
  constructor(reason: string) {
    super(
      "SOCIAL_GRAPH_SYNC_FAILED",
      `Failed to sync social graph from Mirror Node: ${reason}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
