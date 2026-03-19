/**
 * NotificationsService Integration Tests
 *
 * Tests NotificationsService against REAL PostgreSQL on localhost:5433.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 *
 * NO mocks. NO jest.fn(). NO jest.mock(). NO jest.spyOn().
 * All operations run against a real PostgreSQL instance.
 *
 * Note: NotificationsService depends on HederaService (for HCS audit trail)
 * and EventEmitter2 (for WebSocket delivery). The HCS submission is
 * fire-and-forget and non-critical — it logs warnings if Hedera is not
 * configured but does not block notification creation. EventEmitter2 is
 * provided by the NestJS EventEmitterModule.
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

const logger = new Logger("NotificationsServiceIntegrationTest");

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
    socket.connect(5433, "localhost");
  });
}

describe("NotificationsService Integration", () => {
  let module: TestingModule;
  let service: NotificationsService;
  let dataSource: DataSource;
  let notificationRepository: Repository<NotificationEntity>;
  let postgresAvailable: boolean;

  // Track created notification IDs for cleanup
  const createdNotificationIds: string[] = [];

  /** Unique account ID for each test to avoid collisions */
  function testAccountId(): string {
    return `0.0.${Date.now() % 999999}${Math.floor(Math.random() * 100)}`;
  }

  beforeAll(async () => {
    postgresAvailable = await isPostgresAvailable();
    if (!postgresAvailable) {
      logger.warn(
        "PostgreSQL not available on port 5433 — tests will be skipped",
      );
      return;
    }

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
          port: 5433,
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

  it("should create a notification record in the database", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const recipientAccountId = testAccountId();
    const notification = await service.sendNotification({
      recipientAccountId,
      category: NotificationCategory.SYSTEM,
      event: NotificationEvent.ANNOUNCEMENT,
      preview: "Welcome to Hedera Social Platform!",
    });
    createdNotificationIds.push(notification.id);

    expect(notification.id).toBeDefined();
    expect(notification.recipientAccountId).toBe(recipientAccountId);
    expect(notification.category).toBe(NotificationCategory.SYSTEM);
    expect(notification.event).toBe(NotificationEvent.ANNOUNCEMENT);
    expect(notification.preview).toBe("Welcome to Hedera Social Platform!");
    expect(notification.isRead).toBe(false);
    expect(notification.readAt).toBeNull();

    // Verify in database
    const dbNotification = await notificationRepository.findOne({
      where: { id: notification.id },
    });
    expect(dbNotification).not.toBeNull();
    expect(dbNotification!.recipientAccountId).toBe(recipientAccountId);
  });

  it("should create a notification with fromAccountId and topicId", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const recipientAccountId = testAccountId();
    const fromAccountId = testAccountId();
    const notification = await service.sendNotification({
      recipientAccountId,
      category: NotificationCategory.MESSAGE,
      event: NotificationEvent.NEW_MESSAGE,
      fromAccountId,
      topicId: "0.0.54321",
      preview: "Hey, new message!",
      data: { senderName: "Alice" },
    });
    createdNotificationIds.push(notification.id);

    expect(notification.fromAccountId).toBe(fromAccountId);
    expect(notification.topicId).toBe("0.0.54321");
    expect(notification.data).toEqual({ senderName: "Alice" });
  });

  it("should return paginated notifications for a recipient", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const recipientAccountId = testAccountId();

    // Create 5 notifications
    for (let i = 0; i < 5; i++) {
      const notification = await service.sendNotification({
        recipientAccountId,
        category: NotificationCategory.SYSTEM,
        event: NotificationEvent.ANNOUNCEMENT,
        preview: `Notification ${i + 1}`,
      });
      createdNotificationIds.push(notification.id);
      // Small delay to ensure distinct timestamps
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Get first page (limit 3)
    const page1 = await service.getNotifications(
      recipientAccountId,
      undefined,
      undefined,
      3,
    );

    expect(page1.notifications.length).toBe(3);
    expect(page1.totalCount).toBe(5);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBeDefined();

    // Notifications should be newest first
    const timestamps = page1.notifications.map((n) =>
      new Date(n.createdAt).getTime(),
    );
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i - 1]).toBeGreaterThanOrEqual(timestamps[i]);
    }

    // Get second page using cursor
    const page2 = await service.getNotifications(
      recipientAccountId,
      undefined,
      page1.nextCursor!,
      3,
    );

    expect(page2.notifications.length).toBe(2);
    expect(page2.hasMore).toBe(false);
  });

  it("should filter notifications by category", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const recipientAccountId = testAccountId();

    // Create notifications with different categories
    const systemNotification = await service.sendNotification({
      recipientAccountId,
      category: NotificationCategory.SYSTEM,
      event: NotificationEvent.ANNOUNCEMENT,
      preview: "System message",
    });
    createdNotificationIds.push(systemNotification.id);

    const paymentNotification = await service.sendNotification({
      recipientAccountId,
      category: NotificationCategory.PAYMENT,
      event: NotificationEvent.PAYMENT_RECEIVED,
      preview: "Payment received",
    });
    createdNotificationIds.push(paymentNotification.id);

    // Filter by SYSTEM category
    const systemResults = await service.getNotifications(
      recipientAccountId,
      NotificationCategory.SYSTEM,
    );
    expect(systemResults.totalCount).toBe(1);
    expect(systemResults.notifications[0].category).toBe(
      NotificationCategory.SYSTEM,
    );

    // Filter by PAYMENT category
    const paymentResults = await service.getNotifications(
      recipientAccountId,
      NotificationCategory.PAYMENT,
    );
    expect(paymentResults.totalCount).toBe(1);
    expect(paymentResults.notifications[0].category).toBe(
      NotificationCategory.PAYMENT,
    );
  });

  it("should mark specific notifications as read", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const recipientAccountId = testAccountId();

    const n1 = await service.sendNotification({
      recipientAccountId,
      category: NotificationCategory.SYSTEM,
      event: NotificationEvent.ANNOUNCEMENT,
      preview: "First",
    });
    createdNotificationIds.push(n1.id);

    const n2 = await service.sendNotification({
      recipientAccountId,
      category: NotificationCategory.SYSTEM,
      event: NotificationEvent.ANNOUNCEMENT,
      preview: "Second",
    });
    createdNotificationIds.push(n2.id);

    // Mark only n1 as read
    const markResult = await service.markAsRead(recipientAccountId, [n1.id]);
    expect(markResult.updated).toBe(1);

    // Verify n1 is read
    const n1Db = await notificationRepository.findOne({
      where: { id: n1.id },
    });
    expect(n1Db!.isRead).toBe(true);
    expect(n1Db!.readAt).not.toBeNull();

    // Verify n2 is still unread
    const n2Db = await notificationRepository.findOne({
      where: { id: n2.id },
    });
    expect(n2Db!.isRead).toBe(false);
    expect(n2Db!.readAt).toBeNull();
  });

  it("should mark all notifications as read", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const recipientAccountId = testAccountId();

    const n1 = await service.sendNotification({
      recipientAccountId,
      category: NotificationCategory.SYSTEM,
      event: NotificationEvent.ANNOUNCEMENT,
      preview: "All Read 1",
    });
    createdNotificationIds.push(n1.id);

    const n2 = await service.sendNotification({
      recipientAccountId,
      category: NotificationCategory.SYSTEM,
      event: NotificationEvent.ANNOUNCEMENT,
      preview: "All Read 2",
    });
    createdNotificationIds.push(n2.id);

    const markResult = await service.markAllAsRead(recipientAccountId);
    expect(markResult.updated).toBe(2);

    // Verify both are read
    const all = await notificationRepository.find({
      where: { recipientAccountId },
    });
    for (const n of all) {
      expect(n.isRead).toBe(true);
      expect(n.readAt).not.toBeNull();
    }
  });

  it("should not mark another user's notifications as read", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const recipientA = testAccountId();
    const recipientB = testAccountId();

    const nA = await service.sendNotification({
      recipientAccountId: recipientA,
      category: NotificationCategory.SYSTEM,
      event: NotificationEvent.ANNOUNCEMENT,
      preview: "For A",
    });
    createdNotificationIds.push(nA.id);

    // Attempt to mark A's notification as read using B's account
    const markResult = await service.markAsRead(recipientB, [nA.id]);
    expect(markResult.updated).toBe(0);

    // Verify notification is still unread
    const nADb = await notificationRepository.findOne({
      where: { id: nA.id },
    });
    expect(nADb!.isRead).toBe(false);
  });

  it("should get unread count for a recipient", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const recipientAccountId = testAccountId();

    // Create 3 notifications
    for (let i = 0; i < 3; i++) {
      const n = await service.sendNotification({
        recipientAccountId,
        category: NotificationCategory.SYSTEM,
        event: NotificationEvent.ANNOUNCEMENT,
        preview: `Unread ${i + 1}`,
      });
      createdNotificationIds.push(n.id);
    }

    // All should be unread
    const unread1 = await service.getUnreadCount(recipientAccountId);
    expect(unread1.unreadCount).toBe(3);

    // Mark one as read
    const allNotifications = await notificationRepository.find({
      where: { recipientAccountId },
    });
    await service.markAsRead(recipientAccountId, [allNotifications[0].id]);

    // Unread count should decrease
    const unread2 = await service.getUnreadCount(recipientAccountId);
    expect(unread2.unreadCount).toBe(2);
  });

  it("should create convenience notification: notifyNewMessage", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const recipientAccountId = testAccountId();
    const senderAccountId = testAccountId();

    const notification = await service.notifyNewMessage(
      recipientAccountId,
      senderAccountId,
      "0.0.99999",
      "Hello, how are you?",
      "Bob",
    );
    createdNotificationIds.push(notification.id);

    expect(notification.category).toBe(NotificationCategory.MESSAGE);
    expect(notification.event).toBe(NotificationEvent.NEW_MESSAGE);
    expect(notification.fromAccountId).toBe(senderAccountId);
    expect(notification.topicId).toBe("0.0.99999");
    expect(notification.preview).toContain("Bob");
    expect(notification.preview).toContain("Hello, how are you?");
  });

  it("should create convenience notification: notifyPaymentReceived", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const recipientAccountId = testAccountId();
    const senderAccountId = testAccountId();

    const notification = await service.notifyPaymentReceived(
      recipientAccountId,
      senderAccountId,
      50,
      "HBAR",
    );
    createdNotificationIds.push(notification.id);

    expect(notification.category).toBe(NotificationCategory.PAYMENT);
    expect(notification.event).toBe(NotificationEvent.PAYMENT_RECEIVED);
    expect(notification.preview).toContain("50");
    expect(notification.preview).toContain("HBAR");
  });

  it("should create notifyPaymentReceived with topicId and note", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const recipientAccountId = testAccountId();
    const senderAccountId = testAccountId();

    const notification = await service.notifyPaymentReceived(
      recipientAccountId,
      senderAccountId,
      75,
      "HBAR",
      "0.0.55555",
      "Coffee money",
    );
    createdNotificationIds.push(notification.id);

    expect(notification.topicId).toBe("0.0.55555");
    expect(notification.preview).toContain("75");
    expect(notification.preview).toContain("Coffee money");
    expect(notification.data).toEqual({
      amount: 75,
      currency: "HBAR",
      note: "Coffee money",
    });
  });

  it("should create convenience notification: notifyNewFollower", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const recipientAccountId = testAccountId();
    const followerAccountId = testAccountId();

    const notification = await service.notifyNewFollower(
      recipientAccountId,
      followerAccountId,
      "Alice",
    );
    createdNotificationIds.push(notification.id);

    expect(notification.category).toBe(NotificationCategory.SOCIAL);
    expect(notification.event).toBe(NotificationEvent.NEW_FOLLOWER);
    expect(notification.preview).toContain("Alice");
    expect(notification.preview).toContain("followed you");
  });

  it("should create convenience notification: notifyPaymentRequest", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const recipientAccountId = testAccountId();
    const requesterAccountId = testAccountId();

    const notification = await service.notifyPaymentRequest(
      recipientAccountId,
      requesterAccountId,
      25,
      "HBAR",
      "0.0.77777",
      "Lunch split",
    );
    createdNotificationIds.push(notification.id);

    expect(notification.category).toBe(NotificationCategory.PAYMENT);
    expect(notification.event).toBe(NotificationEvent.PAYMENT_REQUEST);
    expect(notification.fromAccountId).toBe(requesterAccountId);
    expect(notification.topicId).toBe("0.0.77777");
    expect(notification.preview).toContain("25");
    expect(notification.preview).toContain("HBAR");
    expect(notification.preview).toContain("Lunch split");
  });

  it("should create convenience notification: notifyPaymentRequest without note", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const recipientAccountId = testAccountId();
    const requesterAccountId = testAccountId();

    const notification = await service.notifyPaymentRequest(
      recipientAccountId,
      requesterAccountId,
      10,
      "HBAR",
      "0.0.88888",
    );
    createdNotificationIds.push(notification.id);

    expect(notification.preview).toBe("Requested 10 HBAR");
    expect(notification.data).toEqual({
      amount: 10,
      currency: "HBAR",
      note: null,
    });
  });

  it("should create convenience notification: notifyPaymentConfirmed", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const recipientAccountId = testAccountId();
    const senderAccountId = testAccountId();

    const notification = await service.notifyPaymentConfirmed(
      recipientAccountId,
      senderAccountId,
      100,
      "HBAR",
      "0.0.66666",
    );
    createdNotificationIds.push(notification.id);

    expect(notification.category).toBe(NotificationCategory.PAYMENT);
    expect(notification.event).toBe(NotificationEvent.PAYMENT_CONFIRMED);
    expect(notification.fromAccountId).toBe(senderAccountId);
    expect(notification.topicId).toBe("0.0.66666");
    expect(notification.preview).toContain("100");
    expect(notification.preview).toContain("HBAR");
    expect(notification.preview).toContain("confirmed");
  });

  it("should create convenience notification: notifyPaymentConfirmed without topicId", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const recipientAccountId = testAccountId();
    const senderAccountId = testAccountId();

    const notification = await service.notifyPaymentConfirmed(
      recipientAccountId,
      senderAccountId,
      42,
      "HBAR",
    );
    createdNotificationIds.push(notification.id);

    expect(notification.topicId).toBeNull();
    expect(notification.data).toEqual({ amount: 42, currency: "HBAR" });
  });

  it("should create convenience notification: notifyAnnouncement", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const recipientAccountId = testAccountId();

    const notification = await service.notifyAnnouncement(
      recipientAccountId,
      "Platform maintenance scheduled for tomorrow.",
    );
    createdNotificationIds.push(notification.id);

    expect(notification.category).toBe(NotificationCategory.SYSTEM);
    expect(notification.event).toBe(NotificationEvent.ANNOUNCEMENT);
    expect(notification.preview).toBe(
      "Platform maintenance scheduled for tomorrow.",
    );
    expect(notification.fromAccountId).toBeNull();
  });

  it("should return empty result for recipient with no notifications", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const recipientAccountId = testAccountId();
    const result = await service.getNotifications(recipientAccountId);

    expect(result.notifications).toHaveLength(0);
    expect(result.totalCount).toBe(0);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("should create convenience notification: notifyKycApproved", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const recipientAccountId = testAccountId();

    const notification = await service.notifyKycApproved(recipientAccountId);
    createdNotificationIds.push(notification.id);

    expect(notification.category).toBe(NotificationCategory.SYSTEM);
    expect(notification.event).toBe(NotificationEvent.KYC_APPROVED);
    expect(notification.preview).toBe("Your KYC verification was approved!");
    expect(notification.fromAccountId).toBeNull();
    expect(notification.recipientAccountId).toBe(recipientAccountId);
    expect(notification.isRead).toBe(false);
  });

  it("should create notifyNewMessage without sender name (uses accountId)", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const recipientAccountId = testAccountId();
    const senderAccountId = testAccountId();

    const notification = await service.notifyNewMessage(
      recipientAccountId,
      senderAccountId,
      "0.0.88888",
      "Test message",
    );
    createdNotificationIds.push(notification.id);

    expect(notification.preview).toContain(senderAccountId);
    expect(notification.preview).toContain("Test message");
    expect(notification.data).toEqual({ senderName: null });
  });

  it("should create notifyNewFollower without follower name", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const recipientAccountId = testAccountId();
    const followerAccountId = testAccountId();

    const notification = await service.notifyNewFollower(
      recipientAccountId,
      followerAccountId,
    );
    createdNotificationIds.push(notification.id);

    expect(notification.preview).toContain(followerAccountId);
    expect(notification.preview).toContain("followed you");
    expect(notification.data).toEqual({ followerName: null });
  });

  it("should enforce limit bounds on getNotifications", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const recipientAccountId = testAccountId();

    // Create 3 notifications
    for (let i = 0; i < 3; i++) {
      const n = await service.sendNotification({
        recipientAccountId,
        category: NotificationCategory.SYSTEM,
        event: NotificationEvent.ANNOUNCEMENT,
        preview: `Limit test ${i + 1}`,
      });
      createdNotificationIds.push(n.id);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Request with limit=0 → should be clamped to 1
    const result0 = await service.getNotifications(
      recipientAccountId,
      undefined,
      undefined,
      0,
    );
    expect(result0.notifications.length).toBeLessThanOrEqual(1);

    // Request with limit=200 → should be clamped to 100
    const result200 = await service.getNotifications(
      recipientAccountId,
      undefined,
      undefined,
      200,
    );
    expect(result200.notifications.length).toBeLessThanOrEqual(100);
  });

  it("should return correct unread count after marking some as read", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const recipientAccountId = testAccountId();

    // Create 5 notifications
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const n = await service.sendNotification({
        recipientAccountId,
        category: NotificationCategory.SOCIAL,
        event: NotificationEvent.NEW_FOLLOWER,
        preview: `Follower ${i + 1}`,
      });
      createdNotificationIds.push(n.id);
      ids.push(n.id);
    }

    // All unread
    const count1 = await service.getUnreadCount(recipientAccountId);
    expect(count1.unreadCount).toBe(5);

    // Mark 2 as read
    await service.markAsRead(recipientAccountId, [ids[0], ids[1]]);

    const count2 = await service.getUnreadCount(recipientAccountId);
    expect(count2.unreadCount).toBe(3);

    // Mark all as read
    await service.markAllAsRead(recipientAccountId);

    const count3 = await service.getUnreadCount(recipientAccountId);
    expect(count3.unreadCount).toBe(0);
  });

  it("should not double-count when marking already-read notifications", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const recipientAccountId = testAccountId();

    const n = await service.sendNotification({
      recipientAccountId,
      category: NotificationCategory.SYSTEM,
      event: NotificationEvent.ANNOUNCEMENT,
      preview: "Double read test",
    });
    createdNotificationIds.push(n.id);

    // Mark as read
    const first = await service.markAsRead(recipientAccountId, [n.id]);
    expect(first.updated).toBe(1);

    // Mark same notification as read again — should be 0
    const second = await service.markAsRead(recipientAccountId, [n.id]);
    expect(second.updated).toBe(0);
  });
});
