import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsNumberString,
} from "class-validator";

/**
 * DTO for creating a comment on a post.
 *
 * POST /api/v1/posts/:postId/comments
 */
export class CreateCommentDto {
  @IsString()
  @MinLength(1, { message: "Comment text must not be empty" })
  @MaxLength(500, { message: "Comment text must not exceed 500 characters" })
  text!: string;
}

/**
 * Query parameters for GET /api/v1/posts/:postId/comments
 */
export class GetCommentsQueryDto {
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @IsOptional()
  @IsString()
  cursor?: string;
}

/**
 * Comment response shape returned to API consumers.
 */
export interface CommentResponse {
  id: string;
  postId: string;
  authorAccountId: string;
  /** Display name of the commenter, or null if not set. */
  authorDisplayName: string | null;
  contentText: string;
  hcsTopicId: string | null;
  hcsSequenceNumber: number | null;
  createdAt: string;
}

/**
 * Paginated comments response.
 */
export interface PaginatedCommentsResponse {
  comments: CommentResponse[];
  cursor: string | null;
  hasMore: boolean;
}
