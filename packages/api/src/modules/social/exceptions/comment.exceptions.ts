import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Thrown when a comment is not found.
 */
export class CommentNotFoundException extends HttpException {
  constructor(commentId: string) {
    super(
      {
        code: "COMMENT_NOT_FOUND",
        message: `Comment ${commentId} not found`,
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

/**
 * Thrown when a user tries to delete a comment they don't own.
 */
export class CommentDeleteNotAllowedException extends HttpException {
  constructor(commentId: string, accountId: string) {
    super(
      {
        code: "COMMENT_DELETE_NOT_ALLOWED",
        message: `User ${accountId} is not the author of comment ${commentId}`,
      },
      HttpStatus.FORBIDDEN,
    );
  }
}

/**
 * Thrown when comment creation fails.
 */
export class CommentCreationException extends HttpException {
  constructor(reason: string) {
    super(
      {
        code: "COMMENT_CREATION_FAILED",
        message: `Failed to create comment: ${reason}`,
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
