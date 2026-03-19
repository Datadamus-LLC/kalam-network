import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { SocialGraphService } from "../services/social-graph.service";
import { FollowUserDto, UnfollowUserDto } from "../dto/follow.dto";
import { FeedQueryDto } from "../dto/feed-query.dto";
import type {
  FollowersListResponseDto,
  FollowingListResponseDto,
  FollowStatusResponseDto,
  UserStatsResponseDto,
} from "../dto/follow-response.dto";
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
 * SocialGraphController handles social graph REST endpoints for follow/unfollow
 * and follower/following queries.
 *
 * All endpoints require JWT authentication.
 */
@Controller("api/v1/social")
@UseGuards(JwtAuthGuard)
export class SocialGraphController {
  private readonly logger = new Logger(SocialGraphController.name);

  constructor(private readonly socialGraphService: SocialGraphService) {}

  /**
   * POST /api/v1/social/follow
   *
   * Follow a user. The follower is the authenticated user.
   * Submits a follow event to HCS and indexes it in the database.
   */
  @Post("follow")
  @HttpCode(HttpStatus.OK)
  async followUser(
    @CurrentUser() user: JwtPayload,
    @Body() dto: FollowUserDto,
  ): Promise<ApiResponse<{ message: string }>> {
    this.logger.log(
      `Follow request: ${user.sub} (${user.hederaAccountId}) -> ${dto.targetAccountId}`,
    );
    await this.socialGraphService.follow(
      user.sub,
      dto.targetAccountId,
      user.hederaAccountId,
    );
    return {
      success: true,
      data: {
        message: `Successfully followed ${dto.targetAccountId}`,
      },
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * POST /api/v1/social/unfollow
   *
   * Unfollow a user. The unfollower is the authenticated user.
   * Submits an unfollow event to HCS and removes the index entry.
   */
  @Post("unfollow")
  @HttpCode(HttpStatus.OK)
  async unfollowUser(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UnfollowUserDto,
  ): Promise<ApiResponse<{ message: string }>> {
    this.logger.log(
      `Unfollow request: ${user.sub} (${user.hederaAccountId}) -> ${dto.targetAccountId}`,
    );
    await this.socialGraphService.unfollow(
      user.sub,
      dto.targetAccountId,
      user.hederaAccountId,
    );
    return {
      success: true,
      data: {
        message: `Successfully unfollowed ${dto.targetAccountId}`,
      },
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/social/:accountId/followers
   *
   * Get paginated list of followers for a given account.
   */
  @Get(":accountId/followers")
  async getFollowers(
    @Param("accountId") accountId: string,
    @Query() query: FeedQueryDto,
  ): Promise<ApiResponse<FollowersListResponseDto>> {
    this.logger.debug(`Get followers request for ${accountId}`);
    const result = await this.socialGraphService.getFollowers(
      accountId,
      query.cursor,
      query.limit,
    );
    return {
      success: true,
      data: result,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/social/:accountId/following
   *
   * Get paginated list of accounts a user is following.
   */
  @Get(":accountId/following")
  async getFollowing(
    @Param("accountId") accountId: string,
    @Query() query: FeedQueryDto,
  ): Promise<ApiResponse<FollowingListResponseDto>> {
    this.logger.debug(`Get following request for ${accountId}`);
    const result = await this.socialGraphService.getFollowing(
      accountId,
      query.cursor,
      query.limit,
    );
    return {
      success: true,
      data: result,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/social/:accountId/is-following/:targetId
   *
   * Check if one account is following another.
   */
  @Get(":accountId/is-following/:targetId")
  async isFollowing(
    @Param("accountId") accountId: string,
    @Param("targetId") targetId: string,
  ): Promise<ApiResponse<FollowStatusResponseDto>> {
    this.logger.debug(`Is-following check: ${accountId} -> ${targetId}`);
    const isFollowing = await this.socialGraphService.isFollowing(
      accountId,
      targetId,
    );
    return {
      success: true,
      data: {
        accountId,
        targetAccountId: targetId,
        isFollowing,
      },
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/social/:accountId/stats
   *
   * Get follower and following counts for a user.
   */
  @Get(":accountId/stats")
  async getUserStats(
    @Param("accountId") accountId: string,
  ): Promise<ApiResponse<UserStatsResponseDto>> {
    this.logger.debug(`Stats request for ${accountId}`);
    const stats = await this.socialGraphService.getUserStats(accountId);
    return {
      success: true,
      data: stats,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }
}
