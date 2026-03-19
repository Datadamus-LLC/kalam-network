import { HttpException, HttpStatus } from "@nestjs/common";

export class PostNotFoundException extends HttpException {
  constructor(postId: string) {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        error: "POST_NOT_FOUND",
        message: `Post not found: ${postId}`,
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class UserNotFoundException extends HttpException {
  constructor(accountId: string) {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        error: "USER_NOT_FOUND",
        message: `User not found: ${accountId}`,
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class UserMissingFeedTopicException extends HttpException {
  constructor(accountId: string) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: "USER_MISSING_FEED_TOPIC",
        message: `User does not have a public feed topic configured: ${accountId}`,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class PostCreationFailedException extends HttpException {
  constructor(reason: string) {
    super(
      {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: "POST_CREATION_FAILED",
        message: `Failed to create post: ${reason}`,
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

export class IpfsNotConfiguredException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: "IPFS_NOT_CONFIGURED",
        message: "IPFS (Pinata) credentials are not configured",
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

export class IpfsUploadFailedException extends HttpException {
  constructor(reason: string) {
    super(
      {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: "IPFS_UPLOAD_FAILED",
        message: `IPFS upload failed: ${reason}`,
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

export class FeedRetrievalFailedException extends HttpException {
  constructor(reason: string) {
    super(
      {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: "FEED_RETRIEVAL_FAILED",
        message: `Failed to retrieve feed: ${reason}`,
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

export class MirrorNodeSyncFailedException extends HttpException {
  constructor(topicId: string, reason: string) {
    super(
      {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: "MIRROR_NODE_SYNC_FAILED",
        message: `Mirror node sync failed for topic ${topicId}: ${reason}`,
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

export class PostNotOwnedException extends HttpException {
  constructor(postId: string) {
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        error: "POST_NOT_OWNED",
        message: `You do not own post: ${postId}`,
      },
      HttpStatus.FORBIDDEN,
    );
  }
}

export class PostAlreadyLikedException extends HttpException {
  constructor(postId: string) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: "POST_ALREADY_LIKED",
        message: `You already liked post: ${postId}`,
      },
      HttpStatus.CONFLICT,
    );
  }
}

export class PostLikeNotFoundException extends HttpException {
  constructor(postId: string) {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        error: "POST_LIKE_NOT_FOUND",
        message: `You have not liked post: ${postId}`,
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class PostDeletionFailedException extends HttpException {
  constructor(reason: string) {
    super(
      {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: "POST_DELETION_FAILED",
        message: `Failed to delete post: ${reason}`,
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

export class SocialGraphQueryException extends HttpException {
  constructor(operation: string, reason: string) {
    super(
      {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: "SOCIAL_GRAPH_QUERY_FAILED",
        message: `Social graph query failed (${operation}): ${reason}`,
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
