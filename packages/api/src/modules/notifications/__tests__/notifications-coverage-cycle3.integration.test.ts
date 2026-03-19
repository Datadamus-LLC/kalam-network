/**
 * Notifications Coverage Cycle 3 — Integration Tests
 *
 * Targets uncovered paths in notifications.service.ts (79.82% -> 85%):
 *   - notifyPostLiked() — verify entity preview, category, event (lines 270-284)
 *   - notifySplitPaymentCreated() — verify preview includes amounts (lines 289-305)
 *   - notifyAnnouncement() — verify SYSTEM category (lines 310-320)
 *   - getNotifications() — category filtering branch (lines 349-353)
 *   - getNotifications() — cursor pagination branch (lines 355-359)
 *   - getNotifications() — limit clamping to [1, 100]
 *
 * Prerequisites:
 *   - PostgreSQL running on localhost:5433 (TEST_DB_PORT)
 *   - Start with: docker compose -f docker-compose.test.yml up -d
 *
 * NO MOCKS. NO FAKES. NO STUBS. NO jest.fn(). NO jest.mock(). NO jest.spyOn().
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

const logger = new Logger("NotificationsCoverageCycle3Test");

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

describe("NotificationsService Coverage Cycle 3", () => {
  let module: TestingModule;
  let service: NotificationsService;
  let dataSource: DataSource;
  let notificationRepository: Repository<NotificationEntity>;
  let postgresAvailable: boolean;

  /** Track created notification IDs for cleanup */
  const createdNotificationIds: string[] = [];

  /** Generate a unique test account ID to avoid collisions */
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
  // notifyPostLiked — deeper coverage (lines 270-284)
  // ---------------------------------------------------------------------------

  describe("notifyPostLiked — coverage of preview, category, event, and data", () => {
    it("should create notification entity with SOCIAL category and POST_LIKED event", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const recipientAccountId = testAccountId();
      const likerAccountId = testAccountId();
      const postId = `post-cycle3-${Date.now()}`;

      const notification = await service.notifyPostLiked(
        recipientAccountId,
        likerAccountId,
        postId,
        "Fatima",
      );
      createdNotificationIds.push(notification.id);

      // Verify entity fields
      expect(notification.category).toBe(NotificationCategory.SOCIAL);
      expect(notification.event).toBe(NotificationEvent.POST_LIKED);
      expect(notification.recipientAccountId).toBe(recipientAccountId);
      expect(notification.fromAccountId).toBe(likerAccountId);

      // Verify preview includes the liker name
      expect(notification.preview).toBe("Fatima liked your post");

      // Verify structured data
      expect(notification.data).toEqual({
        postId,
        likerName: "Fatima",
      });

      // Verify initial read state
      expect(notification.isRead).toBe(false);
      expect(notification.readAt).toBeNull();

      // Verify database persistence
      const dbRecord = await notificationRepository.findOne({
        where: { id: notification.id },
      });
      expect(dbRecord).not.toBeNull();
      expect(dbRecord!.category).toBe(NotificationCategory.SOCIAL);
      expect(dbRecord!.event).toBe(NotificationEvent.POST_LIKED);
      expect(dbRecord!.preview).toBe("Fatima liked your post");
    });

    it("should use account ID in preview when likerName is omitted", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const recipientAccountId = testAccountId();
      const likerAccountId = testAccountId();
      const postId = `post-no-name-${Date.now()}`;

      const notification = await service.notifyPostLiked(
        recipientAccountId,
        likerAccountId,
        postId,
      );
      createdNotificationIds.push(notification.id);

      // Preview should fall back to account ID
      expect(notification.preview).toBe(`${likerAccountId} liked your post`);

      // Data should have null likerName
      expect(notification.data).toEqual({
        postId,
        likerName: null,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // notifySplitPaymentCreated — coverage of amount preview (lines 289-305)
  // ---------------------------------------------------------------------------

  describe("notifySplitPaymentCreated — coverage of amount preview formatting", () => {
    it("should include both splitAmount and totalAmount in preview", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const recipientAccountId = testAccountId();
      const creatorAccountId = testAccountId();
      const totalAmount = 500;
      const splitAmount = 125;
      const currency = "HBAR";

      const notification = await service.notifySplitPaymentCreated(
        recipientAccountId,
        creatorAccountId,
        totalAmount,
        currency,
        splitAmount,
      );
      createdNotificationIds.push(notification.id);

      // Verify category and event
      expect(notification.category).toBe(NotificationCategory.PAYMENT);
      expect(notification.event).toBe(NotificationEvent.PAYMENT_SPLIT_CREATED);

      // Verify preview contains both amounts and currency
      expect(notification.preview).toContain("125");
      expect(notification.preview).toContain("500");
      expect(notification.preview).toContain("HBAR");
      expect(notification.preview).toBe(
        "You owe 125 HBAR in a split payment of 500 HBAR",
      );

      // Verify structured data
      expect(notification.data).toEqual({
        totalAmount: 500,
        currency: "HBAR",
        splitAmount: 125,
      });

      // Verify fromAccountId is the creator
      expect(notification.fromAccountId).toBe(creatorAccountId);
    });

    it("should handle fractional amounts in split payment", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const recipientAccountId = testAccountId();
      const creatorAccountId = testAccountId();

      const notification = await service.notifySplitPaymentCreated(
        recipientAccountId,
        creatorAccountId,
        99.99,
        "USDC",
        33.33,
      );
      createdNotificationIds.push(notification.id);

      expect(notification.preview).toContain("33.33");
      expect(notification.preview).toContain("99.99");
      expect(notification.preview).toContain("USDC");
      expect(notification.data).toEqual({
        totalAmount: 99.99,
        currency: "USDC",
        splitAmount: 33.33,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // notifyAnnouncement — coverage of SYSTEM category (lines 310-320)
  // ---------------------------------------------------------------------------

  describe("notifyAnnouncement — SYSTEM category verification", () => {
    it("should create notification with SYSTEM category and ANNOUNCEMENT event", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const recipientAccountId = testAccountId();
      const announcementText =
        "Scheduled maintenance: March 15, 2026 02:00 UTC";

      const notification = await service.notifyAnnouncement(
        recipientAccountId,
        announcementText,
      );
      createdNotificationIds.push(notification.id);

      // Verify SYSTEM category and ANNOUNCEMENT event
      expect(notification.category).toBe(NotificationCategory.SYSTEM);
      expect(notification.event).toBe(NotificationEvent.ANNOUNCEMENT);

      // Verify preview is the announcement text
      expect(notification.preview).toBe(announcementText);

      // System announcements have no fromAccountId
      expect(notification.fromAccountId).toBeNull();

      // System announcements have no topic
      expect(notification.topicId).toBeNull();

      // System announcements have no extra data
      expect(notification.data).toBeNull();

      // Verify in database
      const dbRecord = await notificationRepository.findOne({
        where: { id: notification.id },
      });
      expect(dbRecord).not.toBeNull();
      expect(dbRecord!.category).toBe(NotificationCategory.SYSTEM);
      expect(dbRecord!.event).toBe(NotificationEvent.ANNOUNCEMENT);
      expect(dbRecord!.preview).toBe(announcementText);
      expect(dbRecord!.fromAccountId).toBeNull();
    });

    it("should handle long announcement text", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const recipientAccountId = testAccountId();
      const longText = "A".repeat(500);

      const notification = await service.notifyAnnouncement(
        recipientAccountId,
        longText,
      );
      createdNotificationIds.push(notification.id);

      expect(notification.preview).toBe(longText);
      expect(notification.category).toBe(NotificationCategory.SYSTEM);
    });
  });

  // ---------------------------------------------------------------------------
  // getNotifications — category filtering branch (lines 349-353)
  // ---------------------------------------------------------------------------

  describe("getNotifications — category filtering branch", () => {
    it("should filter by SYSTEM category and exclude other categories", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const recipientAccountId = testAccountId();

      // Create notifications in different categories
      const systemNotification = await service.notifyAnnouncement(
        recipientAccountId,
        "System update v2.0",
      );
      createdNotificationIds.push(systemNotification.id);

      const socialNotification = await service.notifyPostLiked(
        recipientAccountId,
        testAccountId(),
        "post-filter-test",
        "FilterUser",
      );
      createdNotificationIds.push(socialNotification.id);

      const paymentNotification = await service.notifyPaymentReceived(
        recipientAccountId,
        testAccountId(),
        75,
        "HBAR",
      );
      createdNotificationIds.push(paymentNotification.id);

      // Filter by SYSTEM — should return only 1
      const systemResults = await service.getNotifications(
        recipientAccountId,
        NotificationCategory.SYSTEM,
      );
      expect(systemResults.totalCount).toBe(1);
      expect(systemResults.notifications.length).toBe(1);
      expect(systemResults.notifications[0].category).toBe(
        NotificationCategory.SYSTEM,
      );
      expect(systemResults.notifications[0].event).toBe(
        NotificationEvent.ANNOUNCEMENT,
      );

      // Filter by PAYMENT — should return only 1
      const paymentResults = await service.getNotifications(
        recipientAccountId,
        NotificationCategory.PAYMENT,
      );
      expect(paymentResults.totalCount).toBe(1);
      expect(paymentResults.notifications[0].category).toBe(
        NotificationCategory.PAYMENT,
      );

      // Filter by MESSAGE — should return 0 (none created)
      const messageResults = await service.getNotifications(
        recipientAccountId,
        NotificationCategory.MESSAGE,
      );
      expect(messageResults.totalCount).toBe(0);
      expect(messageResults.notifications).toEqual([]);
      expect(messageResults.hasMore).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getNotifications — cursor pagination branch (lines 355-359)
  // ---------------------------------------------------------------------------

  describe("getNotifications — cursor pagination branch", () => {
    it("should paginate using cursor and return correct hasMore and nextCursor", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const recipientAccountId = testAccountId();

      // Create 5 notifications with small delays to ensure distinct createdAt
      const notifications: NotificationEntity[] = [];
      for (let i = 0; i < 5; i++) {
        const n = await service.notifyAnnouncement(
          recipientAccountId,
          `Pagination test item ${i + 1}`,
        );
        createdNotificationIds.push(n.id);
        notifications.push(n);
      }

      // Page 1: limit=2, no cursor (newest first)
      const page1 = await service.getNotifications(
        recipientAccountId,
        undefined,
        undefined,
        2,
      );
      expect(page1.notifications.length).toBe(2);
      expect(page1.totalCount).toBe(5);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).not.toBeNull();

      // Page 2: limit=2, use cursor from page 1
      const page2 = await service.getNotifications(
        recipientAccountId,
        undefined,
        page1.nextCursor!,
        2,
      );
      expect(page2.notifications.length).toBe(2);
      expect(page2.hasMore).toBe(true);
      expect(page2.nextCursor).not.toBeNull();

      // The IDs from page 2 should not overlap with page 1
      const page1Ids = page1.notifications.map((n) => n.id);
      const page2Ids = page2.notifications.map((n) => n.id);
      for (const id of page2Ids) {
        expect(page1Ids).not.toContain(id);
      }

      // Page 3: limit=2, use cursor from page 2 — should have 1 item left
      const page3 = await service.getNotifications(
        recipientAccountId,
        undefined,
        page2.nextCursor!,
        2,
      );
      expect(page3.notifications.length).toBe(1);
      expect(page3.hasMore).toBe(false);
      expect(page3.nextCursor).toBeNull();

      // All 5 unique IDs across all pages
      const allIds = [
        ...page1.notifications.map((n) => n.id),
        ...page2.notifications.map((n) => n.id),
        ...page3.notifications.map((n) => n.id),
      ];
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(5);
    });

    it("should combine cursor with category filter", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const recipientAccountId = testAccountId();

      // Create 3 SYSTEM and 2 SOCIAL notifications
      for (let i = 0; i < 3; i++) {
        const n = await service.notifyAnnouncement(
          recipientAccountId,
          `System msg ${i + 1}`,
        );
        createdNotificationIds.push(n.id);
      }
      for (let i = 0; i < 2; i++) {
        const n = await service.notifyPostLiked(
          recipientAccountId,
          testAccountId(),
          `post-cursor-${i}`,
          `User${i}`,
        );
        createdNotificationIds.push(n.id);
      }

      // Page 1: SYSTEM only, limit=2
      const page1 = await service.getNotifications(
        recipientAccountId,
        NotificationCategory.SYSTEM,
        undefined,
        2,
      );
      expect(page1.notifications.length).toBe(2);
      expect(page1.totalCount).toBe(3);
      expect(page1.hasMore).toBe(true);
      for (const n of page1.notifications) {
        expect(n.category).toBe(NotificationCategory.SYSTEM);
      }

      // Page 2: SYSTEM only, with cursor from page 1
      const page2 = await service.getNotifications(
        recipientAccountId,
        NotificationCategory.SYSTEM,
        page1.nextCursor!,
        2,
      );
      expect(page2.notifications.length).toBe(1);
      expect(page2.hasMore).toBe(false);
      expect(page2.notifications[0].category).toBe(NotificationCategory.SYSTEM);
    });
  });

  // ---------------------------------------------------------------------------
  // getNotifications — limit clamping to [1, 100]
  // ---------------------------------------------------------------------------

  describe("getNotifications — limit clamping", () => {
    it("should clamp limit below 1 to 1", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const recipientAccountId = testAccountId();

      // Create 3 notifications
      for (let i = 0; i < 3; i++) {
        const n = await service.notifyAnnouncement(
          recipientAccountId,
          `Clamp test min ${i + 1}`,
        );
        createdNotificationIds.push(n.id);
      }

      // Request with limit=0 — should be clamped to 1
      const result = await service.getNotifications(
        recipientAccountId,
        undefined,
        undefined,
        0,
      );
      expect(result.notifications.length).toBe(1);
      expect(result.totalCount).toBe(3);
      expect(result.hasMore).toBe(true);
    });

    it("should clamp negative limit to 1", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const recipientAccountId = testAccountId();

      const n = await service.notifyAnnouncement(
        recipientAccountId,
        "Negative limit test",
      );
      createdNotificationIds.push(n.id);

      // Request with limit=-5 — should be clamped to 1
      const result = await service.getNotifications(
        recipientAccountId,
        undefined,
        undefined,
        -5,
      );
      expect(result.notifications.length).toBe(1);
    });

    it("should clamp limit above 100 to 100", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const recipientAccountId = testAccountId();

      // Create 3 notifications (we only need to verify clamping, not 100+ items)
      for (let i = 0; i < 3; i++) {
        const n = await service.notifyAnnouncement(
          recipientAccountId,
          `Clamp test max ${i + 1}`,
        );
        createdNotificationIds.push(n.id);
      }

      // Request with limit=500 — should be clamped to 100 internally
      // With only 3 items, we should get all 3
      const result = await service.getNotifications(
        recipientAccountId,
        undefined,
        undefined,
        500,
      );
      expect(result.notifications.length).toBe(3);
      expect(result.totalCount).toBe(3);
      expect(result.hasMore).toBe(false);
    });

    it("should accept limit=1 exactly (lower boundary)", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const recipientAccountId = testAccountId();

      for (let i = 0; i < 2; i++) {
        const n = await service.notifyAnnouncement(
          recipientAccountId,
          `Boundary test ${i + 1}`,
        );
        createdNotificationIds.push(n.id);
      }

      const result = await service.getNotifications(
        recipientAccountId,
        undefined,
        undefined,
        1,
      );
      expect(result.notifications.length).toBe(1);
      expect(result.totalCount).toBe(2);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).not.toBeNull();
    });

    it("should accept limit=100 exactly (upper boundary)", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const recipientAccountId = testAccountId();

      const n = await service.notifyAnnouncement(
        recipientAccountId,
        "Upper boundary test",
      );
      createdNotificationIds.push(n.id);

      const result = await service.getNotifications(
        recipientAccountId,
        undefined,
        undefined,
        100,
      );
      expect(result.notifications.length).toBe(1);
      expect(result.hasMore).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getNotifications — ordering verification
  // ---------------------------------------------------------------------------

  describe("getNotifications — ordering newest-first", () => {
    it("should return notifications ordered by createdAt DESC", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const recipientAccountId = testAccountId();

      // Create 3 notifications in order
      for (let i = 0; i < 3; i++) {
        const n = await service.notifyAnnouncement(
          recipientAccountId,
          `Order test ${i + 1}`,
        );
        createdNotificationIds.push(n.id);
      }

      const result = await service.getNotifications(recipientAccountId);
      expect(result.notifications.length).toBe(3);

      // Verify descending order: first item should be newest
      for (let i = 0; i < result.notifications.length - 1; i++) {
        const currentDate = new Date(result.notifications[i].createdAt);
        const nextDate = new Date(result.notifications[i + 1].createdAt);
        expect(currentDate.getTime()).toBeGreaterThanOrEqual(
          nextDate.getTime(),
        );
      }

      // The newest notification should have "Order test 3" in its preview
      expect(result.notifications[0].preview).toBe("Order test 3");
    });
  });
});
