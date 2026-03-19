import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Repository, In } from "typeorm";
import { NotificationEntity } from "../../database/entities/notification.entity";
import { UserEntity } from "../../database/entities/user.entity";
import { HederaService } from "../hedera/hedera.service";
import {
  NotificationCategory,
  NotificationEvent,
} from "./dto/notification.dto";
import type {
  CreateNotificationParams,
  NotificationResponseDto,
  NotificationListResponseDto,
  UnreadCountResponseDto,
  MarkReadResponseDto,
} from "./dto/notification.dto";
import {
  NotificationCreateException,
  NotificationQueryException,
  NotificationMarkReadException,
  NotificationUnreadCountException,
} from "./exceptions/notification.exceptions";

/**
 * Event name used to emit notifications via the NestJS EventEmitter.
 *
 * The ChatGateway (or any other listener) can subscribe to this event
 * using @OnEvent('notification.created') to deliver real-time WebSocket
 * notifications to connected users.
 */
export const NOTIFICATION_CREATED_EVENT = "notification.created";

/**
 * Payload shape for the notification.created event.
 */
export interface NotificationCreatedPayload {
  recipientAccountId: string;
  notification: NotificationResponseDto;
}

/**
 * HCS notification audit payload submitted to the user's notification topic.
 */
interface HcsNotificationPayload {
  version: 1;
  type: "notification";
  timestamp: string;
  category: string;
  event: string;
  recipientAccountId: string;
  fromAccountId: string | null;
  preview: string | null;
  ts: number;
}

/**
 * NotificationsService manages the full lifecycle of user notifications:
 *
 * 1. **Creation**: Triggered by system events (messages, payments, follows, KYC).
 * 2. **Persistence**: Stored in PostgreSQL for offline retrieval.
 * 3. **Real-time delivery**: Emits EventEmitter events consumed by WebSocket gateways.
 * 4. **HCS audit trail**: Optionally submits encrypted notifications to HCS topics.
 * 5. **Read tracking**: Mark individual or batch notifications as read.
 * 6. **Querying**: Paginated, category-filtered notification retrieval.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationRepository: Repository<NotificationEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly hederaService: HederaService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ---------------------------------------------------------------------------
  // Core: Send Notification
  // ---------------------------------------------------------------------------

  /**
   * Create and deliver a notification.
   *
   * Steps:
   * 1. Persist the notification in PostgreSQL
   * 2. Optionally submit to HCS for audit trail (non-blocking, non-critical)
   * 3. Emit EventEmitter event for real-time WebSocket delivery
   * 4. Return the saved notification
   */
  async sendNotification(
    params: CreateNotificationParams,
  ): Promise<NotificationEntity> {
    this.logger.log(
      `Creating notification for ${params.recipientAccountId}: ${params.event}`,
    );

    // 1. Persist in database
    let saved: NotificationEntity;
    try {
      const entity = this.notificationRepository.create({
        recipientAccountId: params.recipientAccountId,
        category: params.category,
        event: params.event,
        fromAccountId: params.fromAccountId ?? null,
        topicId: params.topicId ?? null,
        preview: params.preview ?? null,
        data: params.data ?? null,
        isRead: false,
      });
      saved = await this.notificationRepository.save(entity);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to save notification for ${params.recipientAccountId}: ${reason}`,
      );
      throw new NotificationCreateException(reason);
    }

    // 2. Optionally submit to HCS (non-blocking, non-critical)
    this.submitToHcsAsync(saved);

    // 3. Emit EventEmitter event for WebSocket delivery
    const formattedNotification = this.toResponseDto(saved);
    const eventPayload: NotificationCreatedPayload = {
      recipientAccountId: saved.recipientAccountId,
      notification: formattedNotification,
    };
    this.eventEmitter.emit(NOTIFICATION_CREATED_EVENT, eventPayload);

    this.logger.log(
      `Notification ${saved.id} created for ${saved.recipientAccountId} (${saved.event})`,
    );

    return saved;
  }

  // ---------------------------------------------------------------------------
  // Convenience methods for specific notification types
  // ---------------------------------------------------------------------------

  /**
   * Send a "new message" notification to a conversation participant.
   */
  async notifyNewMessage(
    recipientAccountId: string,
    senderAccountId: string,
    conversationTopicId: string,
    messagePreview: string | null, // null = E2E encrypted, don't store content
    senderName?: string,
  ): Promise<NotificationEntity> {
    // Only show sender name — never expose message content (E2E encrypted)
    const preview = senderName ?? senderAccountId;
    return this.sendNotification({
      recipientAccountId,
      category: NotificationCategory.MESSAGE,
      event: NotificationEvent.NEW_MESSAGE,
      fromAccountId: senderAccountId,
      topicId: conversationTopicId,
      preview,
      data: { senderName: senderName ?? null },
    });
  }

  /**
   * Send a "payment received" notification.
   */
  async notifyPaymentReceived(
    recipientAccountId: string,
    senderAccountId: string,
    amount: number,
    currency: string,
    conversationTopicId?: string,
    note?: string,
  ): Promise<NotificationEntity> {
    const preview = `Received ${amount} ${currency}${note ? `: ${note}` : ""}`;
    return this.sendNotification({
      recipientAccountId,
      category: NotificationCategory.PAYMENT,
      event: NotificationEvent.PAYMENT_RECEIVED,
      fromAccountId: senderAccountId,
      topicId: conversationTopicId,
      preview,
      data: { amount, currency, note: note ?? null },
    });
  }

  /**
   * Send a "payment request" notification.
   */
  async notifyPaymentRequest(
    recipientAccountId: string,
    requesterAccountId: string,
    amount: number,
    currency: string,
    conversationTopicId: string,
    note?: string,
  ): Promise<NotificationEntity> {
    const preview = `Requested ${amount} ${currency}${note ? `: ${note}` : ""}`;
    return this.sendNotification({
      recipientAccountId,
      category: NotificationCategory.PAYMENT,
      event: NotificationEvent.PAYMENT_REQUEST,
      fromAccountId: requesterAccountId,
      topicId: conversationTopicId,
      preview,
      data: { amount, currency, note: note ?? null },
    });
  }

  /**
   * Send a "new follower" notification.
   */
  async notifyNewFollower(
    recipientAccountId: string,
    followerAccountId: string,
    followerName?: string,
  ): Promise<NotificationEntity> {
    const preview = `${followerName ?? followerAccountId} followed you`;
    return this.sendNotification({
      recipientAccountId,
      category: NotificationCategory.SOCIAL,
      event: NotificationEvent.NEW_FOLLOWER,
      fromAccountId: followerAccountId,
      preview,
      data: { followerName: followerName ?? null },
    });
  }

  /**
   * Send a "KYC approved" notification.
   */
  async notifyKycApproved(
    recipientAccountId: string,
  ): Promise<NotificationEntity> {
    return this.sendNotification({
      recipientAccountId,
      category: NotificationCategory.SYSTEM,
      event: NotificationEvent.KYC_APPROVED,
      preview: "Your KYC verification was approved!",
    });
  }

  /**
   * Send a "payment confirmed" notification.
   */
  async notifyPaymentConfirmed(
    recipientAccountId: string,
    senderAccountId: string,
    amount: number,
    currency: string,
    conversationTopicId?: string,
  ): Promise<NotificationEntity> {
    const preview = `Payment of ${amount} ${currency} confirmed`;
    return this.sendNotification({
      recipientAccountId,
      category: NotificationCategory.PAYMENT,
      event: NotificationEvent.PAYMENT_CONFIRMED,
      fromAccountId: senderAccountId,
      topicId: conversationTopicId,
      preview,
      data: { amount, currency },
    });
  }

  /**
   * Send a "post liked" notification to the post author.
   */
  async notifyPostLiked(
    recipientAccountId: string,
    likerAccountId: string,
    postId: string,
    likerName?: string,
  ): Promise<NotificationEntity> {
    const preview = `${likerName ?? likerAccountId} liked your post`;
    return this.sendNotification({
      recipientAccountId,
      category: NotificationCategory.SOCIAL,
      event: NotificationEvent.POST_LIKED,
      fromAccountId: likerAccountId,
      preview,
      data: { postId, likerName: likerName ?? null },
    });
  }

  /**
   * Send a "split payment created" notification to each participant.
   */
  async notifySplitPaymentCreated(
    recipientAccountId: string,
    creatorAccountId: string,
    totalAmount: number,
    currency: string,
    splitAmount: number,
  ): Promise<NotificationEntity> {
    const preview = `You owe ${splitAmount} ${currency} in a split payment of ${totalAmount} ${currency}`;
    return this.sendNotification({
      recipientAccountId,
      category: NotificationCategory.PAYMENT,
      event: NotificationEvent.PAYMENT_SPLIT_CREATED,
      fromAccountId: creatorAccountId,
      preview,
      data: { totalAmount, currency, splitAmount },
    });
  }

  /**
   * Send a system announcement notification to a specific user.
   */
  async notifyAnnouncement(
    recipientAccountId: string,
    announcementText: string,
  ): Promise<NotificationEntity> {
    return this.sendNotification({
      recipientAccountId,
      category: NotificationCategory.SYSTEM,
      event: NotificationEvent.ANNOUNCEMENT,
      preview: announcementText,
    });
  }

  // ---------------------------------------------------------------------------
  // Query: Get Notifications (paginated)
  // ---------------------------------------------------------------------------

  /**
   * Get notifications for a user with optional category filtering and cursor-based pagination.
   *
   * Uses createdAt-based cursor pagination (ISO timestamp string).
   * Results are ordered newest-first.
   */
  async getNotifications(
    recipientAccountId: string,
    category?: NotificationCategory,
    cursor?: string,
    limit: number = 20,
  ): Promise<NotificationListResponseDto> {
    const effectiveLimit = Math.min(Math.max(limit, 1), 100);

    try {
      const queryBuilder = this.notificationRepository
        .createQueryBuilder("notification")
        .where("notification.recipientAccountId = :recipientAccountId", {
          recipientAccountId,
        })
        .orderBy("notification.createdAt", "DESC")
        .take(effectiveLimit + 1);

      if (category) {
        queryBuilder.andWhere("notification.category = :category", {
          category,
        });
      }

      if (cursor) {
        queryBuilder.andWhere("notification.createdAt < :cursor", {
          cursor: new Date(cursor),
        });
      }

      const [notifications, totalCount] = await Promise.all([
        queryBuilder.getMany(),
        this.getFilteredCount(recipientAccountId, category),
      ]);

      const hasMore = notifications.length > effectiveLimit;
      const items = hasMore
        ? notifications.slice(0, effectiveLimit)
        : notifications;

      const lastItem = items.length > 0 ? items[items.length - 1] : undefined;
      const nextCursor =
        hasMore && lastItem ? lastItem.createdAt.toISOString() : null;

      // Batch-fetch display names for all senders
      const fromAccountIds = [
        ...new Set(
          items
            .map((n) => n.fromAccountId)
            .filter((id): id is string => id !== null),
        ),
      ];
      const senderUsers =
        fromAccountIds.length > 0
          ? await this.userRepository.find({
              where: { hederaAccountId: In(fromAccountIds) },
              select: ["hederaAccountId", "displayName"],
            })
          : [];
      const displayNameMap = new Map(
        senderUsers.map((u) => [u.hederaAccountId, u.displayName]),
      );

      return {
        notifications: items.map((n) =>
          this.toResponseDto(
            n,
            n.fromAccountId
              ? (displayNameMap.get(n.fromAccountId) ?? null)
              : null,
          ),
        ),
        totalCount,
        nextCursor,
        hasMore,
      };
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to get notifications for ${recipientAccountId}: ${reason}`,
      );
      throw new NotificationQueryException("getNotifications", reason);
    }
  }

  // ---------------------------------------------------------------------------
  // Query: Get Unread Count
  // ---------------------------------------------------------------------------

  /**
   * Get the count of unread notifications for a user.
   */
  async getUnreadCount(
    recipientAccountId: string,
  ): Promise<UnreadCountResponseDto> {
    try {
      const unreadCount = await this.notificationRepository.count({
        where: {
          recipientAccountId,
          isRead: false,
        },
      });
      return { unreadCount };
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to get unread count for ${recipientAccountId}: ${reason}`,
      );
      throw new NotificationUnreadCountException(reason);
    }
  }

  // ---------------------------------------------------------------------------
  // Mutation: Mark as Read
  // ---------------------------------------------------------------------------

  /**
   * Mark specific notifications as read.
   *
   * Only updates notifications that belong to the given recipientAccountId
   * (prevents users from marking other users' notifications as read).
   */
  async markAsRead(
    recipientAccountId: string,
    notificationIds: string[],
  ): Promise<MarkReadResponseDto> {
    try {
      const result = await this.notificationRepository.update(
        {
          id: In(notificationIds),
          recipientAccountId,
          isRead: false,
        },
        {
          isRead: true,
          readAt: new Date(),
        },
      );

      const updated = result.affected ?? 0;

      this.logger.log(
        `Marked ${updated} notifications as read for ${recipientAccountId}`,
      );

      return { updated };
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to mark notifications as read for ${recipientAccountId}: ${reason}`,
      );
      throw new NotificationMarkReadException(reason);
    }
  }

  /**
   * Mark all notifications as read for a user.
   */
  async markAllAsRead(
    recipientAccountId: string,
  ): Promise<MarkReadResponseDto> {
    try {
      const result = await this.notificationRepository.update(
        {
          recipientAccountId,
          isRead: false,
        },
        {
          isRead: true,
          readAt: new Date(),
        },
      );

      const updated = result.affected ?? 0;

      this.logger.log(
        `Marked all (${updated}) notifications as read for ${recipientAccountId}`,
      );

      return { updated };
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to mark all notifications as read for ${recipientAccountId}: ${reason}`,
      );
      throw new NotificationMarkReadException(reason);
    }
  }

  // ---------------------------------------------------------------------------
  // Private: HCS audit trail (non-critical, async fire-and-forget)
  // ---------------------------------------------------------------------------

  /**
   * Submit notification to HCS for audit trail. This is fire-and-forget:
   * failures are logged but do not block notification delivery.
   *
   * Uses the user's notification HCS topic if configured, or a global
   * notification topic from environment variables.
   */
  private submitToHcsAsync(notification: NotificationEntity): void {
    // Fire-and-forget — do not await
    void this.submitToHcs(notification);
  }

  private async submitToHcs(notification: NotificationEntity): Promise<void> {
    try {
      // Use a global notification topic from config (optional)
      const notificationTopicId = this.configService.get<string>(
        "hedera.notificationTopic",
      );

      if (!notificationTopicId) {
        this.logger.warn(
          "HCS audit trail skipped — configure NOTIFICATION_AUDIT_TOPIC_ID (hedera.notificationTopic)",
        );
        return;
      }

      const hcsPayload: HcsNotificationPayload = {
        version: 1,
        type: "notification",
        timestamp: new Date().toISOString(),
        category: notification.category,
        event: notification.event,
        recipientAccountId: notification.recipientAccountId,
        fromAccountId: notification.fromAccountId,
        preview: notification.preview,
        ts: notification.createdAt.getTime(),
      };

      const messageBuffer = Buffer.from(JSON.stringify(hcsPayload));
      const sequenceNumber = await this.hederaService.submitMessage(
        notificationTopicId,
        messageBuffer,
      );

      // Update the notification with the HCS sequence number (best-effort)
      await this.notificationRepository.update(notification.id, {
        hcsSequenceNumber: sequenceNumber,
      });

      this.logger.debug(
        `Notification ${notification.id} submitted to HCS (seq: ${sequenceNumber})`,
      );
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `HCS audit trail submission failed for notification ${notification.id}: ${reason}`,
      );
      // Non-critical — notification is still delivered via DB + WebSocket
    }
  }

  // ---------------------------------------------------------------------------
  // Private: Helpers
  // ---------------------------------------------------------------------------

  /**
   * Get filtered notification count for a user and optional category.
   */
  private async getFilteredCount(
    recipientAccountId: string,
    category?: NotificationCategory,
  ): Promise<number> {
    const where: Record<string, unknown> = { recipientAccountId };
    if (category) {
      where.category = category;
    }
    return this.notificationRepository.count({ where });
  }

  /**
   * Convert a NotificationEntity to the API response DTO.
   */
  private toResponseDto(
    entity: NotificationEntity,
    fromDisplayName?: string | null,
  ): NotificationResponseDto {
    return {
      id: entity.id,
      recipientAccountId: entity.recipientAccountId,
      category: entity.category,
      event: entity.event,
      fromAccountId: entity.fromAccountId,
      fromDisplayName: fromDisplayName ?? null,
      topicId: entity.topicId,
      preview: entity.preview,
      data: entity.data,
      isRead: entity.isRead,
      readAt: entity.readAt ? entity.readAt.toISOString() : null,
      createdAt: entity.createdAt.toISOString(),
    };
  }
}
