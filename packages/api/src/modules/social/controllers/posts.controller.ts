import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { PostsService } from "../services/posts.service";
import { CreatePostDto } from "../dto/create-post.dto";
import { CreateCommentDto, GetCommentsQueryDto } from "../dto/comment.dto";
import type {
  CommentResponse,
  PaginatedCommentsResponse,
} from "../dto/comment.dto";
import { FeedQueryDto } from "../dto/feed-query.dto";
import type {
  PostResponseDto,
  FeedResponseDto,
} from "../dto/post-response.dto";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import type { JwtPayload } from "../../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../../common/decorators/current-user.decorator";

/**
 * Standard API envelope response.
 */
interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
  } | null;
  timestamp: string;
}

/**
 * PostsController handles all post-related HTTP endpoints.
 *
 * All endpoints require JWT authentication via JwtAuthGuard.
 * The authenticated user is extracted via the @CurrentUser decorator.
 *
 * Rate limits:
 *   POST /posts              — 20 per minute
 *   POST /posts/:id/like     — 60 per minute (same as comments)
 *   POST /:id/comments       — 30 per minute
 */
@Controller("api/v1/posts")
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class PostsController {
  private readonly logger = new Logger(PostsController.name);

  constructor(private readonly postsService: PostsService) {}

  /**
   * POST /api/v1/posts
   *
   * Create a new public post. The post is submitted as an HCS message
   * to the author's public feed topic and indexed in the database.
   * Rate limited: 20 posts per minute per user.
   */
  @Post()
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  async createPost(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePostDto,
  ): Promise<ApiResponse<PostResponseDto>> {
    this.logger.log(`Creating post for account ${user.hederaAccountId}`);
    const post = await this.postsService.createPost(user.hederaAccountId, dto);
    return {
      success: true,
      data: post,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/posts/feed
   *
   * Get the authenticated user's home feed (posts from accounts they follow).
   * Supports cursor-based pagination.
   */
  @Get("feed")
  @Throttle({ default: { ttl: 60000, limit: 300 } })
  async getHomeFeed(
    @CurrentUser() user: JwtPayload,
    @Query() query: FeedQueryDto,
  ): Promise<ApiResponse<FeedResponseDto>> {
    this.logger.debug(`Home feed request for ${user.hederaAccountId}`);
    const feed = await this.postsService.getHomeFeed(
      user.hederaAccountId,
      query.cursor,
      query.limit,
    );
    return {
      success: true,
      data: feed,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/posts/following
   *
   * Get posts from accounts the current user follows.
   * Unlike /feed, this always includes historical posts (direct query, not fan-out).
   */
  @Get("following")
  @Throttle({ default: { ttl: 60000, limit: 300 } })
  async getFollowingFeed(
    @CurrentUser() user: JwtPayload,
    @Query() query: FeedQueryDto,
  ): Promise<ApiResponse<FeedResponseDto>> {
    this.logger.debug(`Following feed request for ${user.hederaAccountId}`);
    const feed = await this.postsService.getFollowingFeed(
      user.hederaAccountId,
      query.cursor,
      query.limit,
    );
    return {
      success: true,
      data: feed,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/posts/trending
   *
   * Get trending posts across the platform.
   * Supports cursor-based pagination.
   */
  @Get("trending")
  @Throttle({ default: { ttl: 60000, limit: 300 } })
  async getTrendingPosts(
    @CurrentUser() user: JwtPayload,
    @Query() query: FeedQueryDto,
  ): Promise<ApiResponse<FeedResponseDto>> {
    this.logger.debug("Trending posts request");
    const feed = await this.postsService.getTrendingPosts(
      query.cursor,
      query.limit,
      user.sub,
    );
    return {
      success: true,
      data: feed,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/posts/:id
   *
   * Get a single post by its UUID.
   */
  @Get(":id")
  @Throttle({ default: { ttl: 60000, limit: 300 } })
  async getPost(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ApiResponse<PostResponseDto>> {
    const post = await this.postsService.getPost(id);
    return {
      success: true,
      data: post,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/posts/user/:accountId
   *
   * Get all posts by a specific user.
   * Supports cursor-based pagination.
   */
  @Get("user/:accountId")
  @Throttle({ default: { ttl: 60000, limit: 300 } })
  async getUserFeed(
    @CurrentUser() user: JwtPayload,
    @Param("accountId") accountId: string,
    @Query() query: FeedQueryDto,
  ): Promise<ApiResponse<FeedResponseDto>> {
    this.logger.debug(`User feed request for ${accountId}`);
    const feed = await this.postsService.getUserFeed(
      accountId,
      query.cursor,
      query.limit,
      user.sub,
    );
    return {
      success: true,
      data: feed,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * POST /api/v1/posts/:id/like
   *
   * Like a post. Returns 201 on success, 409 if already liked.
   * Rate limited: 60 per minute per user.
   */
  @Post(":id/like")
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  async likePost(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ApiResponse<{ liked: boolean }>> {
    this.logger.log(`User ${user.sub} liking post ${id}`);
    await this.postsService.likePost(user.sub, id);
    return {
      success: true,
      data: { liked: true },
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * DELETE /api/v1/posts/:id/like
   *
   * Unlike a post. Returns 200 on success, 404 if not liked.
   */
  @Delete(":id/like")
  @HttpCode(HttpStatus.OK)
  async unlikePost(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ApiResponse<{ liked: boolean }>> {
    this.logger.log(`User ${user.sub} unliking post ${id}`);
    await this.postsService.unlikePost(user.sub, id);
    return {
      success: true,
      data: { liked: false },
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * DELETE /api/v1/posts/:id
   *
   * Delete a post (soft delete). Only the author can delete their own post.
   * Returns 200 on success, 403 if not the owner, 404 if not found.
   */
  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  async deletePost(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ApiResponse<{ deleted: boolean }>> {
    this.logger.log(`User ${user.hederaAccountId} deleting post ${id}`);
    await this.postsService.deletePost(user.hederaAccountId, id);
    return {
      success: true,
      data: { deleted: true },
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Post Comments (GAP-007)
  // ---------------------------------------------------------------------------

  /**
   * POST /api/v1/posts/:postId/comments
   *
   * Create a comment on a post. The comment event is submitted to
   * the post's HCS topic for audit and indexed locally.
   * Rate limited: 30 comments per minute per user.
   */
  @Post(":postId/comments")
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  async createComment(
    @CurrentUser() user: JwtPayload,
    @Param("postId", ParseUUIDPipe) postId: string,
    @Body() dto: CreateCommentDto,
  ): Promise<ApiResponse<CommentResponse>> {
    this.logger.log(
      `POST /posts/${postId}/comments — user: ${user.hederaAccountId}`,
    );
    const comment = await this.postsService.createComment(
      user.hederaAccountId,
      postId,
      dto.text,
    );
    return {
      success: true,
      data: comment,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/posts/:postId/comments
   *
   * Get paginated comments for a post, ordered by creation time.
   */
  @Get(":postId/comments")
  async getComments(
    @Param("postId", ParseUUIDPipe) postId: string,
    @Query() query: GetCommentsQueryDto,
  ): Promise<ApiResponse<PaginatedCommentsResponse>> {
    const limit = query.limit ? parseInt(query.limit, 10) : undefined;
    const result = await this.postsService.getComments(
      postId,
      limit,
      query.cursor,
    );
    return {
      success: true,
      data: result,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * DELETE /api/v1/posts/:postId/comments/:commentId
   *
   * Delete a comment (soft delete). Only the comment author can delete.
   */
  @Delete(":postId/comments/:commentId")
  @HttpCode(HttpStatus.OK)
  async deleteComment(
    @CurrentUser() user: JwtPayload,
    @Param("postId", ParseUUIDPipe) _postId: string,
    @Param("commentId", ParseUUIDPipe) commentId: string,
  ): Promise<ApiResponse<{ deleted: boolean }>> {
    this.logger.log(
      `DELETE /posts/comments/${commentId} — user: ${user.hederaAccountId}`,
    );
    await this.postsService.deleteComment(user.hederaAccountId, commentId);
    return {
      success: true,
      data: { deleted: true },
      error: null,
      timestamp: new Date().toISOString(),
    };
  }
}
