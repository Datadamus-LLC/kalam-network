/**
 * NotificationsService Coverage Cycle 4 — Integration Tests
 *
 * Targets uncovered paths: sendNotification, getNotifications pagination,
 * getUnreadCount, markAsRead, markAllAsRead, convenience methods.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 *
 * NO mocks. NO jest.fn(). NO jest.mock(). NO jest.spyOn().
 */

import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { Logger } from "@nestjs/common";
import { DataSource, Repository } from "typeorm";
import net from "net";

import { NotificationsService } from "../notifications.service";
import { HederaService } from "../../hedera/hedera.service";
import { MirrorNodeService } from "../../hedera/mirror-node.service";
import { RedisService } from "../../redis/redis.service";
import { NotificationEntity } from "../../../database/entities/notification.entity";
import { UserEntity } from "../../../database/entities/user.entity";
import { SocialFollowEntity } from "../../../database/entities/social-follow.entity";
import { FollowerCountEntity } from "../../../database/entities/follower-count.entity";
import { PostIndexEntity } from "../../../database/entities/post-index.entity";
import { FeedItemEntity } from "../../../database/entities/feed-item.entity";
import { PostLikeEntity } from "../../../database/entities/post-like.entity";
import { PostCommentEntity } from "../../../database/entities/post-comment.entity";
import {
  NotificationCategory,
  NotificationEvent,
} from "../dto/notification.dto";

const logger = new Logger("NotificationsCoverageCycle4");
const TEST_DB_HOST = "localhost";
const TEST_DB_PORT = 5433;
const TEST_DB_USER = "test";
const TEST_DB_PASS = "test";
const TEST_DB_NAME = "hedera_social_test";
const TEST_REDIS_HOST = "localhost";
const TEST_REDIS_PORT = 6380;

const ALL_ENTITIES = [
  NotificationEntity,
  UserEntity,
  SocialFollowEntity,
  FollowerCountEntity,
  PostIndexEntity,
  FeedItemEntity,
  PostLikeEntity,
  PostCommentEntity,
];

async function isPortReachable(port: number, host: string): Promise<boolean> {
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
    socket.connect(port, host);
  });
}

let accountIdCounter = 0;
function uniqueAccountId(): string {
  accountIdCounter += 1;
  return `0.0.${Date.now() % 999999}${accountIdCounter}${Math.floor(Math.random() * 100)}`;
}

describe("NotificationsService Coverage Cycle 4", () => {
  let module: TestingModule;
  let notificationsService: NotificationsService;
  let notificationRepo: Repository<NotificationEntity>;
  let postgresAvailable = false;

  const createdNotificationIds: string[] = [];

  async function createNotification(
    overrides?: Partial<NotificationEntity>,
  ): Promise<NotificationEntity> {
    const entity = notificationRepo.create({
      recipientAccountId: uniqueAccountId(),
      category: NotificationCategory.MESSAGE,
      event: NotificationEvent.NEW_MESSAGE,
      fromAccountId: uniqueAccountId(),
      preview: "Test notification",
      isRead: false,
      ...overrides,
    });
    const saved = await notificationRepo.save(entity);
    createdNotificationIds.push(saved.id);
    return saved;
  }

  beforeAll(async () => {
    const [pgReachable, redisReachable] = await Promise.all([
      isPortReachable(TEST_DB_PORT, TEST_DB_HOST),
      isPortReachable(TEST_REDIS_PORT, TEST_REDIS_HOST),
    ]);
    postgresAvailable = pgReachable && redisReachable;

    if (!postgresAvailable) {
      logger.warn("Infrastructure not available — tests will be skipped");
      return;
    }

    try {
      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                database: {
                  host: TEST_DB_HOST,
                  port: TEST_DB_PORT,
                  username: TEST_DB_USER,
                  password: TEST_DB_PASS,
                  database: TEST_DB_NAME,
                },
                redis: { host: TEST_REDIS_HOST, port: TEST_REDIS_PORT },
                hedera: {
                  network: "testnet",
                  operatorId: "",
                  operatorKey: "",
                  notificationTopic: "",
                  mirrorNodeUrl: "https://testnet.mirrornode.hedera.com/api/v1",
                },
                jwt: {
                  secret:
                    "test-jwt-secret-key-minimum-32-characters-long-for-testing",
                  expiresIn: "24h",
                },
                pinata: { gatewayUrl: "https://gateway.pinata.cloud/ipfs" },
              }),
            ],
          }),
          EventEmitterModule.forRoot(),
          TypeOrmModule.forRoot({
            type: "postgres",
            host: TEST_DB_HOST,
            port: TEST_DB_PORT,
            username: TEST_DB_USER,
            password: TEST_DB_PASS,
            database: TEST_DB_NAME,
            entities: ALL_ENTITIES,
            synchronize: true,
            logging: false,
          }),
          TypeOrmModule.forFeature(ALL_ENTITIES),
        ],
        providers: [
          NotificationsService,
          HederaService,
          MirrorNodeService,
          RedisService,
        ],
      }).compile();

      notificationsService =
        module.get<NotificationsService>(NotificationsService);
      const ds = module.get<DataSource>(DataSource);
      notificationRepo = ds.getRepository(NotificationEntity);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create test module: ${message}`);
      postgresAvailable = false;
    }
  });

  afterEach(async () => {
    if (!postgresAvailable) return;
    for (const id of createdNotificationIds) {
      try {
        await notificationRepo.delete(id);
      } catch {
        /* best-effort */
      }
    }
    createdNotificationIds.length = 0;
  });

  afterAll(async () => {
    if (module) await module.close();
  });

  function skip(): boolean {
    if (!postgresAvailable) {
      pending();
      return true;
    }
    return false;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // sendNotification
  // ───────────────────────────────────────────────────────────────────────────

  describe("sendNotification", () => {
    it("should create and persist a notification", async () => {
      if (skip()) return;
      const recipientAccountId = uniqueAccountId();
      const fromAccountId = uniqueAccountId();

      const saved = await notificationsService.sendNotification({
        recipientAccountId,
        category: NotificationCategory.PAYMENT,
        event: NotificationEvent.PAYMENT_RECEIVED,
        fromAccountId,
        preview: "Received 10 HBAR",
        data: { amount: 10, currency: "HBAR" },
      });

      createdNotificationIds.push(saved.id);

      expect(saved.id).toBeDefined();
      expect(saved.recipientAccountId).toBe(recipientAccountId);
      expect(saved.category).toBe(NotificationCategory.PAYMENT);
      expect(saved.event).toBe(NotificationEvent.PAYMENT_RECEIVED);
      expect(saved.fromAccountId).toBe(fromAccountId);
      expect(saved.preview).toBe("Received 10 HBAR");
      expect(saved.isRead).toBe(false);

      // Verify persisted in DB
      const found = await notificationRepo.findOne({ where: { id: saved.id } });
      expect(found).not.toBeNull();
      expect(found!.recipientAccountId).toBe(recipientAccountId);
    });

    it("should set isRead to false by default", async () => {
      if (skip()) return;
      const saved = await notificationsService.sendNotification({
        recipientAccountId: uniqueAccountId(),
        category: NotificationCategory.SYSTEM,
        event: NotificationEvent.ANNOUNCEMENT,
        preview: "Test announcement",
      });
      createdNotificationIds.push(saved.id);
      expect(saved.isRead).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // getNotifications (paginated)
  // ───────────────────────────────────────────────────────────────────────────

  describe("getNotifications", () => {
    it("should return paginated notifications for a user", async () => {
      if (skip()) return;
      const recipientAccountId = uniqueAccountId();
      for (let i = 0; i < 5; i++) {
        await createNotification({ recipientAccountId });
        await new Promise<void>((r) => {
          const t = setTimeout(() => {
            clearTimeout(t);
            r();
          }, 30);
        });
      }

      const result = await notificationsService.getNotifications(
        recipientAccountId,
        undefined,
        undefined,
        3,
      );
      expect(result.notifications).toHaveLength(3);
      expect(result.totalCount).toBe(5);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).not.toBeNull();
    });

    it("should paginate with cursor", async () => {
      if (skip()) return;
      const recipientAccountId = uniqueAccountId();
      for (let i = 0; i < 4; i++) {
        await createNotification({ recipientAccountId });
        await new Promise<void>((r) => {
          const t = setTimeout(() => {
            clearTimeout(t);
            r();
          }, 30);
        });
      }

      const page1 = await notificationsService.getNotifications(
        recipientAccountId,
        undefined,
        undefined,
        2,
      );
      expect(page1.notifications).toHaveLength(2);
      expect(page1.hasMore).toBe(true);

      const page2 = await notificationsService.getNotifications(
        recipientAccountId,
        undefined,
        page1.nextCursor ?? undefined,
        2,
      );
      expect(page2.notifications).toHaveLength(2);
      expect(page2.hasMore).toBe(false);

      // No overlap
      const page1Ids = page1.notifications.map((n) => n.id);
      const page2Ids = page2.notifications.map((n) => n.id);
      for (const id of page1Ids) {
        expect(page2Ids).not.toContain(id);
      }
    });

    it("should filter by category", async () => {
      if (skip()) return;
      const recipientAccountId = uniqueAccountId();
      await createNotification({
        recipientAccountId,
        category: NotificationCategory.MESSAGE,
      });
      await createNotification({
        recipientAccountId,
        category: NotificationCategory.PAYMENT,
      });
      await createNotification({
        recipientAccountId,
        category: NotificationCategory.SOCIAL,
      });

      const result = await notificationsService.getNotifications(
        recipientAccountId,
        NotificationCategory.PAYMENT,
      );
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0].category).toBe(
        NotificationCategory.PAYMENT,
      );
    });

    it("should return empty for user with no notifications", async () => {
      if (skip()) return;
      const result =
        await notificationsService.getNotifications(uniqueAccountId());
      expect(result.notifications).toHaveLength(0);
      expect(result.totalCount).toBe(0);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // getUnreadCount
  // ───────────────────────────────────────────────────────────────────────────

  describe("getUnreadCount", () => {
    it("should return correct unread count", async () => {
      if (skip()) return;
      const recipientAccountId = uniqueAccountId();
      await createNotification({ recipientAccountId, isRead: false });
      await createNotification({ recipientAccountId, isRead: false });
      await createNotification({ recipientAccountId, isRead: true });

      const result =
        await notificationsService.getUnreadCount(recipientAccountId);
      expect(result.unreadCount).toBe(2);
    });

    it("should return 0 when all are read", async () => {
      if (skip()) return;
      const recipientAccountId = uniqueAccountId();
      await createNotification({ recipientAccountId, isRead: true });

      const result =
        await notificationsService.getUnreadCount(recipientAccountId);
      expect(result.unreadCount).toBe(0);
    });

    it("should return 0 when no notifications exist", async () => {
      if (skip()) return;
      const result =
        await notificationsService.getUnreadCount(uniqueAccountId());
      expect(result.unreadCount).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // markAsRead
  // ───────────────────────────────────────────────────────────────────────────

  describe("markAsRead", () => {
    it("should mark specific notifications as read", async () => {
      if (skip()) return;
      const recipientAccountId = uniqueAccountId();
      const n1 = await createNotification({
        recipientAccountId,
        isRead: false,
      });
      const n2 = await createNotification({
        recipientAccountId,
        isRead: false,
      });
      await createNotification({ recipientAccountId, isRead: false });

      const result = await notificationsService.markAsRead(recipientAccountId, [
        n1.id,
        n2.id,
      ]);
      expect(result.updated).toBe(2);

      // Verify
      const found1 = await notificationRepo.findOne({ where: { id: n1.id } });
      expect(found1!.isRead).toBe(true);
      expect(found1!.readAt).not.toBeNull();
    });

    it("should not affect other users notifications", async () => {
      if (skip()) return;
      const user1 = uniqueAccountId();
      const user2 = uniqueAccountId();
      const n1 = await createNotification({
        recipientAccountId: user1,
        isRead: false,
      });

      // Try to mark user1's notification as user2
      const result = await notificationsService.markAsRead(user2, [n1.id]);
      expect(result.updated).toBe(0);

      // user1's notification should still be unread
      const found = await notificationRepo.findOne({ where: { id: n1.id } });
      expect(found!.isRead).toBe(false);
    });

    it("should not affect already-read notifications", async () => {
      if (skip()) return;
      const recipientAccountId = uniqueAccountId();
      const n1 = await createNotification({ recipientAccountId, isRead: true });

      const result = await notificationsService.markAsRead(recipientAccountId, [
        n1.id,
      ]);
      expect(result.updated).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // markAllAsRead
  // ───────────────────────────────────────────────────────────────────────────

  describe("markAllAsRead", () => {
    it("should mark all unread notifications as read", async () => {
      if (skip()) return;
      const recipientAccountId = uniqueAccountId();
      await createNotification({ recipientAccountId, isRead: false });
      await createNotification({ recipientAccountId, isRead: false });
      await createNotification({ recipientAccountId, isRead: true });

      const result =
        await notificationsService.markAllAsRead(recipientAccountId);
      expect(result.updated).toBe(2);

      const unread =
        await notificationsService.getUnreadCount(recipientAccountId);
      expect(unread.unreadCount).toBe(0);
    });

    it("should return 0 when no unread exist", async () => {
      if (skip()) return;
      const result =
        await notificationsService.markAllAsRead(uniqueAccountId());
      expect(result.updated).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Convenience methods
  // ───────────────────────────────────────────────────────────────────────────

  describe("convenience methods", () => {
    it("notifyNewMessage should create a message notification", async () => {
      if (skip()) return;
      const recipientAccountId = uniqueAccountId();
      const senderAccountId = uniqueAccountId();

      const saved = await notificationsService.notifyNewMessage(
        recipientAccountId,
        senderAccountId,
        "0.0.12345",
        "Hello world",
        "Alice",
      );
      createdNotificationIds.push(saved.id);

      expect(saved.category).toBe(NotificationCategory.MESSAGE);
      expect(saved.event).toBe(NotificationEvent.NEW_MESSAGE);
      expect(saved.preview).toContain("Alice");
    });

    it("notifyPaymentReceived should create a payment notification", async () => {
      if (skip()) return;
      const recipientAccountId = uniqueAccountId();

      const saved = await notificationsService.notifyPaymentReceived(
        recipientAccountId,
        uniqueAccountId(),
        50,
        "HBAR",
        "0.0.999",
        "Thanks!",
      );
      createdNotificationIds.push(saved.id);

      expect(saved.category).toBe(NotificationCategory.PAYMENT);
      expect(saved.event).toBe(NotificationEvent.PAYMENT_RECEIVED);
      expect(saved.preview).toContain("50");
    });

    it("notifyNewFollower should create a social notification", async () => {
      if (skip()) return;
      const recipientAccountId = uniqueAccountId();

      const saved = await notificationsService.notifyNewFollower(
        recipientAccountId,
        uniqueAccountId(),
        "Bob",
      );
      createdNotificationIds.push(saved.id);

      expect(saved.category).toBe(NotificationCategory.SOCIAL);
      expect(saved.event).toBe(NotificationEvent.NEW_FOLLOWER);
      expect(saved.preview).toContain("Bob");
    });

    it("notifyKycApproved should create a system notification", async () => {
      if (skip()) return;
      const recipientAccountId = uniqueAccountId();

      const saved =
        await notificationsService.notifyKycApproved(recipientAccountId);
      createdNotificationIds.push(saved.id);

      expect(saved.category).toBe(NotificationCategory.SYSTEM);
      expect(saved.event).toBe(NotificationEvent.KYC_APPROVED);
    });

    it("notifyPaymentConfirmed should create a payment notification", async () => {
      if (skip()) return;
      const recipientAccountId = uniqueAccountId();

      const saved = await notificationsService.notifyPaymentConfirmed(
        recipientAccountId,
        uniqueAccountId(),
        25,
        "HBAR",
        "0.0.999",
      );
      createdNotificationIds.push(saved.id);

      expect(saved.category).toBe(NotificationCategory.PAYMENT);
      expect(saved.event).toBe(NotificationEvent.PAYMENT_CONFIRMED);
    });

    it("notifyPostLiked should create a social notification", async () => {
      if (skip()) return;
      const recipientAccountId = uniqueAccountId();

      const saved = await notificationsService.notifyPostLiked(
        recipientAccountId,
        uniqueAccountId(),
        uuidv4(),
        "Charlie",
      );
      createdNotificationIds.push(saved.id);

      expect(saved.category).toBe(NotificationCategory.SOCIAL);
      expect(saved.event).toBe(NotificationEvent.POST_LIKED);
    });

    it("notifySplitPaymentCreated should create a payment notification", async () => {
      if (skip()) return;
      const recipientAccountId = uniqueAccountId();

      const saved = await notificationsService.notifySplitPaymentCreated(
        recipientAccountId,
        uniqueAccountId(),
        100,
        "HBAR",
        25,
      );
      createdNotificationIds.push(saved.id);

      expect(saved.category).toBe(NotificationCategory.PAYMENT);
      expect(saved.event).toBe(NotificationEvent.PAYMENT_SPLIT_CREATED);
    });

    it("notifyAnnouncement should create a system notification", async () => {
      if (skip()) return;
      const recipientAccountId = uniqueAccountId();

      const saved = await notificationsService.notifyAnnouncement(
        recipientAccountId,
        "Platform maintenance at midnight",
      );
      createdNotificationIds.push(saved.id);

      expect(saved.category).toBe(NotificationCategory.SYSTEM);
      expect(saved.event).toBe(NotificationEvent.ANNOUNCEMENT);
    });

    it("notifyPaymentRequest should create a payment notification", async () => {
      if (skip()) return;
      const recipientAccountId = uniqueAccountId();

      const saved = await notificationsService.notifyPaymentRequest(
        recipientAccountId,
        uniqueAccountId(),
        75,
        "HBAR",
        "0.0.12345",
        "For dinner",
      );
      createdNotificationIds.push(saved.id);

      expect(saved.category).toBe(NotificationCategory.PAYMENT);
      expect(saved.event).toBe(NotificationEvent.PAYMENT_REQUEST);
    });
  });
});

// Needed for import: uuid
import { v4 as uuidv4 } from "uuid";
