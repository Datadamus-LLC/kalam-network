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
import { BroadcastService } from "../services/broadcast.service";
import { CreateBroadcastDto } from "../dto/broadcast.dto";
import type {
  BroadcastMessageResponse,
  BroadcastFeedResponse,
  BroadcastSubscriptionResponse,
} from "../dto/broadcast.dto";
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
 * BroadcastController handles business broadcast endpoints.
 *
 * Endpoints:
 *   POST   /api/v1/broadcasts/:orgId                 — Create broadcast (owner/admin)
 *   GET    /api/v1/broadcasts/:orgId                 — Get org broadcast feed
 *   GET    /api/v1/broadcasts/feed/subscribed         — Get subscribed broadcast feed
 *   POST   /api/v1/broadcasts/:orgId/subscribe        — Subscribe to broadcasts
 *   DELETE /api/v1/broadcasts/:orgId/subscribe        — Unsubscribe from broadcasts
 *   GET    /api/v1/broadcasts/:orgId/subscribers/count — Get subscriber count
 *   GET    /api/v1/broadcasts/:orgId/subscribed       — Check subscription status
 */
@Controller("api/v1/broadcasts")
@UseGuards(JwtAuthGuard)
export class BroadcastController {
  private readonly logger = new Logger(BroadcastController.name);

  constructor(private readonly broadcastService: BroadcastService) {}

  /**
   * POST /api/v1/broadcasts/:orgId
   *
   * Create a new broadcast message. Only org owners/admins can post.
   */
  @Post(":orgId")
  @HttpCode(HttpStatus.CREATED)
  async createBroadcast(
    @CurrentUser() user: JwtPayload,
    @Param("orgId", new ParseUUIDPipe({ version: "4" })) orgId: string,
    @Body() dto: CreateBroadcastDto,
  ): Promise<ApiResponse<BroadcastMessageResponse>> {
    this.logger.log(
      `Creating broadcast for org ${orgId} by ${user.hederaAccountId}`,
    );

    const broadcast = await this.broadcastService.createBroadcast(
      orgId,
      user.hederaAccountId,
      user.sub,
      dto,
    );

    return {
      success: true,
      data: broadcast,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/broadcasts/feed/subscribed
   *
   * Get broadcasts from all organizations the user is subscribed to.
   * NOTE: This route must be declared BEFORE `:orgId` to avoid route collision.
   */
  @Get("feed/subscribed")
  @HttpCode(HttpStatus.OK)
  async getSubscribedFeed(
    @CurrentUser() user: JwtPayload,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ): Promise<ApiResponse<BroadcastFeedResponse>> {
    const feed = await this.broadcastService.getSubscribedFeed(
      user.hederaAccountId,
      cursor,
      limit ? parseInt(limit, 10) : undefined,
    );

    return {
      success: true,
      data: feed,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/broadcasts/:orgId
   *
   * Get broadcast feed for a specific organization.
   */
  @Get(":orgId")
  @HttpCode(HttpStatus.OK)
  async getOrgBroadcasts(
    @Param("orgId", new ParseUUIDPipe({ version: "4" })) orgId: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ): Promise<ApiResponse<BroadcastFeedResponse>> {
    const feed = await this.broadcastService.getOrgBroadcasts(
      orgId,
      cursor,
      limit ? parseInt(limit, 10) : undefined,
    );

    return {
      success: true,
      data: feed,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * POST /api/v1/broadcasts/:orgId/subscribe
   *
   * Subscribe to an organization's broadcast channel.
   */
  @Post(":orgId/subscribe")
  @HttpCode(HttpStatus.CREATED)
  async subscribe(
    @CurrentUser() user: JwtPayload,
    @Param("orgId") orgId: string,
  ): Promise<ApiResponse<BroadcastSubscriptionResponse>> {
    const subscription = await this.broadcastService.subscribe(
      user.hederaAccountId,
      orgId,
    );

    return {
      success: true,
      data: subscription,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * DELETE /api/v1/broadcasts/:orgId/subscribe
   *
   * Unsubscribe from an organization's broadcast channel.
   */
  @Delete(":orgId/subscribe")
  @HttpCode(HttpStatus.OK)
  async unsubscribe(
    @CurrentUser() user: JwtPayload,
    @Param("orgId", new ParseUUIDPipe({ version: "4" })) orgId: string,
  ): Promise<ApiResponse<{ message: string }>> {
    await this.broadcastService.unsubscribe(user.hederaAccountId, orgId);

    return {
      success: true,
      data: { message: `Unsubscribed from organization ${orgId} broadcasts` },
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/broadcasts/:orgId/subscribers/count
   *
   * Get subscriber count for an organization's broadcast channel.
   */
  @Get(":orgId/subscribers/count")
  @HttpCode(HttpStatus.OK)
  async getSubscriberCount(
    @Param("orgId", new ParseUUIDPipe({ version: "4" })) orgId: string,
  ): Promise<ApiResponse<{ count: number }>> {
    const count = await this.broadcastService.getSubscriberCount(orgId);

    return {
      success: true,
      data: { count },
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/broadcasts/:orgId/subscribed
   *
   * Check if the current user is subscribed to an org's broadcasts.
   */
  @Get(":orgId/subscribed")
  @HttpCode(HttpStatus.OK)
  async checkSubscription(
    @CurrentUser() user: JwtPayload,
    @Param("orgId", new ParseUUIDPipe({ version: "4" })) orgId: string,
  ): Promise<ApiResponse<{ subscribed: boolean }>> {
    const subscribed = await this.broadcastService.isSubscribed(
      user.hederaAccountId,
      orgId,
    );

    return {
      success: true,
      data: { subscribed },
      error: null,
      timestamp: new Date().toISOString(),
    };
  }
}
