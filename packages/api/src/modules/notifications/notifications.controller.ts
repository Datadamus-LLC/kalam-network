import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import type { JwtPayload } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import {
  GetNotificationsQueryDto,
  MarkNotificationsReadDto,
} from "./dto/notification.dto";
import type {
  NotificationListResponseDto,
  UnreadCountResponseDto,
  MarkReadResponseDto,
} from "./dto/notification.dto";

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
 * NotificationsController exposes REST endpoints for notification management.
 *
 * All endpoints require JWT authentication.
 *
 * Endpoints:
 * - GET  /api/v1/notifications           — List notifications (paginated, filterable by category)
 * - GET  /api/v1/notifications/unread-count — Get unread notification count
 * - POST /api/v1/notifications/read       — Mark specific notifications as read
 * - PUT  /api/v1/notifications/read-all   — Mark all notifications as read
 */
@Controller("api/v1/notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  // ---------------------------------------------------------------------------
  // GET /api/v1/notifications
  // ---------------------------------------------------------------------------

  /**
   * Get paginated notifications for the authenticated user.
   *
   * Query params:
   * - category?: 'message' | 'payment' | 'social' | 'system'
   * - cursor?: string (ISO timestamp for cursor-based pagination)
   * - limit?: number (default 20, max 100)
   */
  @Get()
  async getNotifications(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetNotificationsQueryDto,
  ): Promise<ApiResponse<NotificationListResponseDto>> {
    this.logger.debug(
      `Get notifications for ${user.hederaAccountId} (category: ${query.category ?? "all"})`,
    );

    const result = await this.notificationsService.getNotifications(
      user.hederaAccountId,
      query.category,
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

  // ---------------------------------------------------------------------------
  // GET /api/v1/notifications/unread-count
  // ---------------------------------------------------------------------------

  /**
   * Get the count of unread notifications for the authenticated user.
   */
  @Get("unread-count")
  async getUnreadCount(
    @CurrentUser() user: JwtPayload,
  ): Promise<ApiResponse<UnreadCountResponseDto>> {
    this.logger.debug(`Get unread count for ${user.hederaAccountId}`);

    const result = await this.notificationsService.getUnreadCount(
      user.hederaAccountId,
    );

    return {
      success: true,
      data: result,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // POST /api/v1/notifications/read
  // ---------------------------------------------------------------------------

  /**
   * Mark specific notifications as read.
   *
   * Body:
   * {
   *   "notificationIds": ["uuid1", "uuid2", ...]
   * }
   */
  @Post("read")
  @HttpCode(HttpStatus.OK)
  async markAsRead(
    @CurrentUser() user: JwtPayload,
    @Body() dto: MarkNotificationsReadDto,
  ): Promise<ApiResponse<MarkReadResponseDto>> {
    this.logger.log(
      `Mark as read for ${user.hederaAccountId}: ${dto.notificationIds.length} notifications`,
    );

    const result = await this.notificationsService.markAsRead(
      user.hederaAccountId,
      dto.notificationIds,
    );

    return {
      success: true,
      data: result,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // PUT /api/v1/notifications/read-all
  // ---------------------------------------------------------------------------

  /**
   * Mark all notifications as read for the authenticated user.
   */
  @Put("read-all")
  async markAllAsRead(
    @CurrentUser() user: JwtPayload,
  ): Promise<ApiResponse<MarkReadResponseDto>> {
    this.logger.log(`Mark all as read for ${user.hederaAccountId}`);

    const result = await this.notificationsService.markAllAsRead(
      user.hederaAccountId,
    );

    return {
      success: true,
      data: result,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }
}
