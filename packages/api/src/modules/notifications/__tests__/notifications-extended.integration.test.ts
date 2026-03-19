/**
 * Extended Integration Tests for NotificationsService.
 *
 * Covers uncovered paths identified by coverage analysis (76% -> higher):
 *   - notifyPostLiked — verify creates notification with correct type/metadata
 *   - notifySplitPaymentCreated — verify creates notification
 *   - getNotifications — with type filter (SOCIAL category)
 *   - markAllAsRead — verify all notifications marked read
 *   - sendNotification — handles missing HCS config gracefully
 *
 * Prerequisites:
 *   - PostgreSQL running on localhost:5433 (TEST_DB_PORT)
 *
 * NO MOCKS. NO FAKES. NO STUBS.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { Logger } from "@nestjs/common";
import { DataSource, Repository } from "typeorm";
import net from "net";
import { NotificationsService } from "../notifications.service";
import { NotificationEntity } from "../../../database/entities/notification.entity";
import { HederaService } from "../../hedera/hedera.service";
import {
  NotificationCategory,
  NotificationEvent,
} from "../dto/notification.dto";

const logger = new Logger("NotificationsExtendedIntegrationTest");

const TEST_DB_PORT = 5433;

async function isPostgresAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      resolve(false);
    });
    socket.connect(TEST_DB_PORT, "localhost");
  });
}

describe("NotificationsService Extended Integration", () => {
  let module: TestingModule;
  let service: NotificationsService;
  let dataSource: DataSource;
  let notificationRepository: Repository<NotificationEntity>;
  let postgresAvailable: boolean;

  // Track created notification IDs for cleanup
  const createdNotificationIds: string[] = [];

  /** Unique account ID for each test to avoid collisions */
  function testAccountId(): string {
    return `0.0.${Date.now() % 999999}${Math.floor(Math.random() * 1000)}`;
  }

  beforeAll(async () => {
    postgresAvailable = await isPostgresAvailable();
    if (!postgresAvailable) {
      logger.warn(
        `PostgreSQL not available on port ${TEST_DB_PORT} — tests will be skipped. ` +
          "Start with: docker compose -f docker-compose.test.yml up -d",
      );
      return;
    }

    try {
      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                hedera: {
                  network: "testnet",
                  operatorId: "",
                  operatorKey: "",
                  notificationTopic: "", // No HCS topic — HCS audit trail skipped
                },
              }),
            ],
          }),
          TypeOrmModule.forRoot({
            type: "postgres",
            host: "localhost",
            port: TEST_DB_PORT,
            username: "test",
            password: "test",
            database: "hedera_social_test",
            entities: [NotificationEntity],
            synchronize: true,
            logging: false,
          }),
          TypeOrmModule.forFeature([NotificationEntity]),
          EventEmitterModule.forRoot(),
        ],
        providers: [NotificationsService, HederaService],
      }).compile();

      service = module.get(NotificationsService);
      dataSource = module.get(DataSource);
      notificationRepository = dataSource.getRepository(NotificationEntity);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize test module: ${message}`);
      postgresAvailable = false;
    }
  });

  afterEach(async () => {
    if (!postgresAvailable) return;
    for (const id of createdNotificationIds) {
      try {
        await notificationRepository.delete(id);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Cleanup failed for notification ${id}: ${msg}`);
      }
    }
    createdNotificationIds.length = 0;
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (module) await module.close();
  });

  // ---------------------------------------------------------------------------
  // notifyPostLiked
  // ---------------------------------------------------------------------------

  describe("notifyPostLiked", () => {
    it("should create notification with correct type, category, and metadata", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const recipientAccountId = testAccountId();
      const likerAccountId = testAccountId();
      const postId = "post-abc-123";

      const notification = await service.notifyPostLiked(
        recipientAccountId,
        likerAccountId,
        postId,
        "Charlie",
      );
      createdNotificationIds.push(notification.id);

      expect(notification.id).toBeDefined();
      expect(notification.recipientAccountId).toBe(recipientAccountId);
      expect(notification.category).toBe(NotificationCategory.SOCIAL);
      expect(notification.event).toBe(NotificationEvent.POST_LIKED);
      expect(notification.fromAccountId).toBe(likerAccountId);
      expect(notification.preview).toContain("Charlie");
      expect(notification.preview).toContain("liked your post");
      expect(notification.data).toEqual({
        postId,
        likerName: "Charlie",
      });
      expect(notification.isRead).toBe(false);
      expect(notification.readAt).toBeNull();

      // Verify persisted in database
      const dbNotification = await notificationRepository.findOne({
        where: { id: notification.id },
      });
      expect(dbNotification).not.toBeNull();
      expect(dbNotification!.event).toBe(NotificationEvent.POST_LIKED);
      expect(dbNotification!.data).toEqual({
        postId,
        likerName: "Charlie",
      });
    });

    it("should use liker account ID when likerName is not provided", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const recipientAccountId = testAccountId();
      const likerAccountId = testAccountId();
      const postId = "post-def-456";

      const notification = await service.notifyPostLiked(
        recipientAccountId,
        likerAccountId,
        postId,
      );
      createdNotificationIds.push(notification.id);

      expect(notification.preview).toContain(likerAccountId);
      expect(notification.preview).toContain("liked your post");
      expect(notification.data).toEqual({
        postId,
        likerName: null,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // notifySplitPaymentCreated
  // ---------------------------------------------------------------------------

  describe("notifySplitPaymentCreated", () => {
    it("should create notification with correct split payment metadata", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const recipientAccountId = testAccountId();
      const creatorAccountId = testAccountId();
      const totalAmount = 100;
      const currency = "HBAR";
      const splitAmount = 25;

      const notification = await service.notifySplitPaymentCreated(
        recipientAccountId,
        creatorAccountId,
        totalAmount,
        currency,
        splitAmount,
      );
      createdNotificationIds.push(notification.id);

      expect(notification.id).toBeDefined();
      expect(notification.recipientAccountId).toBe(recipientAccountId);
      expect(notification.category).toBe(NotificationCategory.PAYMENT);
      expect(notification.event).toBe(NotificationEvent.PAYMENT_SPLIT_CREATED);
      expect(notification.fromAccountId).toBe(creatorAccountId);
      expect(notification.preview).toContain("25");
      expect(notification.preview).toContain("HBAR");
      expect(notification.preview).toContain("100");
      expect(notification.data).toEqual({
        totalAmount: 100,
        currency: "HBAR",
        splitAmount: 25,
      });
      expect(notification.isRead).toBe(false);

      // Verify persisted in database
      const dbNotification = await notificationRepository.findOne({
        where: { id: notification.id },
      });
      expect(dbNotification).not.toBeNull();
      expect(dbNotification!.event).toBe(
        NotificationEvent.PAYMENT_SPLIT_CREATED,
      );
      expect(dbNotification!.data).toEqual({
        totalAmount: 100,
        currency: "HBAR",
        splitAmount: 25,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // getNotifications — with type (category) filter
  // ---------------------------------------------------------------------------

  describe("getNotifications with category filter", () => {
    it("should return only SOCIAL notifications when filtered by SOCIAL category", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const recipientAccountId = testAccountId();

      // Create a SOCIAL notification (post liked)
      const socialNotification = await service.notifyPostLiked(
        recipientAccountId,
        testAccountId(),
        "post-filter-1",
        "Alice",
      );
      createdNotificationIds.push(socialNotification.id);

      // Create a SOCIAL notification (new follower)
      const followerNotification = await service.notifyNewFollower(
        recipientAccountId,
        testAccountId(),
        "Bob",
      );
      createdNotificationIds.push(followerNotification.id);

      // Create a PAYMENT notification
      const paymentNotification = await service.notifyPaymentReceived(
        recipientAccountId,
        testAccountId(),
        50,
        "HBAR",
      );
      createdNotificationIds.push(paymentNotification.id);

      // Create a SYSTEM notification
      const systemNotification = await service.notifyAnnouncement(
        recipientAccountId,
        "Maintenance tonight",
      );
      createdNotificationIds.push(systemNotification.id);

      // Filter by SOCIAL — should return exactly 2
      const socialResults = await service.getNotifications(
        recipientAccountId,
        NotificationCategory.SOCIAL,
      );
      expect(socialResults.totalCount).toBe(2);
      expect(socialResults.notifications.length).toBe(2);
      for (const n of socialResults.notifications) {
        expect(n.category).toBe(NotificationCategory.SOCIAL);
      }

      // Filter by PAYMENT — should return exactly 1
      const paymentResults = await service.getNotifications(
        recipientAccountId,
        NotificationCategory.PAYMENT,
      );
      expect(paymentResults.totalCount).toBe(1);
      expect(paymentResults.notifications[0].category).toBe(
        NotificationCategory.PAYMENT,
      );

      // All notifications — should return 4
      const allResults = await service.getNotifications(recipientAccountId);
      expect(allResults.totalCount).toBe(4);
    });
  });

  // ---------------------------------------------------------------------------
  // markAllAsRead
  // ---------------------------------------------------------------------------

  describe("markAllAsRead", () => {
    it("should mark all notifications as read and verify in database", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const recipientAccountId = testAccountId();

      // Create 3 notifications across different categories
      const n1 = await service.notifyPostLiked(
        recipientAccountId,
        testAccountId(),
        "post-mark-1",
        "Alice",
      );
      createdNotificationIds.push(n1.id);

      const n2 = await service.notifySplitPaymentCreated(
        recipientAccountId,
        testAccountId(),
        200,
        "HBAR",
        50,
      );
      createdNotificationIds.push(n2.id);

      const n3 = await service.notifyAnnouncement(
        recipientAccountId,
        "All read test",
      );
      createdNotificationIds.push(n3.id);

      // Verify all are unread
      const unreadBefore = await service.getUnreadCount(recipientAccountId);
      expect(unreadBefore.unreadCount).toBe(3);

      // Mark all as read
      const markResult = await service.markAllAsRead(recipientAccountId);
      expect(markResult.updated).toBe(3);

      // Verify all are read in database
      const allNotifications = await notificationRepository.find({
        where: { recipientAccountId },
      });
      expect(allNotifications.length).toBe(3);
      for (const n of allNotifications) {
        expect(n.isRead).toBe(true);
        expect(n.readAt).not.toBeNull();
      }

      // Verify unread count is 0
      const unreadAfter = await service.getUnreadCount(recipientAccountId);
      expect(unreadAfter.unreadCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // sendNotification — handles missing HCS config gracefully
  // ---------------------------------------------------------------------------

  describe("sendNotification with missing HCS config", () => {
    it("should create notification successfully even when HCS topic is not configured", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      // The test module is configured with an empty notificationTopic,
      // so HCS audit trail submission is skipped. This tests the graceful
      // handling path in submitToHcsAsync / submitToHcs.

      const recipientAccountId = testAccountId();
      const notification = await service.sendNotification({
        recipientAccountId,
        category: NotificationCategory.SYSTEM,
        event: NotificationEvent.ANNOUNCEMENT,
        preview: "HCS config test — no topic set",
      });
      createdNotificationIds.push(notification.id);

      // Notification should still be created successfully in the database
      expect(notification.id).toBeDefined();
      expect(notification.recipientAccountId).toBe(recipientAccountId);
      expect(notification.category).toBe(NotificationCategory.SYSTEM);
      expect(notification.event).toBe(NotificationEvent.ANNOUNCEMENT);
      expect(notification.isRead).toBe(false);

      // HCS sequence number should be null (no HCS submission occurred)
      const dbNotification = await notificationRepository.findOne({
        where: { id: notification.id },
      });
      expect(dbNotification).not.toBeNull();
      expect(dbNotification!.hcsSequenceNumber).toBeNull();
    });
  });
});
