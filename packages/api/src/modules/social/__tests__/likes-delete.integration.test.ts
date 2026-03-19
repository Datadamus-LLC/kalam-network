/**
 * Post Like/Unlike/Delete Integration Tests
 *
 * Tests likePost, unlikePost, and deletePost against REAL PostgreSQL
 * and REAL Redis via Docker.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 *
 * NO mocks. NO jest.fn(). NO jest.mock(). NO jest.spyOn().
 */

import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import { DataSource, Repository } from "typeorm";
import net from "net";
import { randomUUID } from "crypto";
import { PostsService } from "../services/posts.service";
import { SocialGraphService } from "../services/social-graph.service";
import { HederaService } from "../../hedera/hedera.service";
import { MirrorNodeService } from "../../hedera/mirror-node.service";
import { RedisService } from "../../redis/redis.service";
import { PostIndexEntity } from "../../../database/entities/post-index.entity";
import { PostLikeEntity } from "../../../database/entities/post-like.entity";
import { PostCommentEntity } from "../../../database/entities/post-comment.entity";
import { FeedItemEntity } from "../../../database/entities/feed-item.entity";
import { UserEntity } from "../../../database/entities/user.entity";
import { SocialFollowEntity } from "../../../database/entities/social-follow.entity";
import { FollowerCountEntity } from "../../../database/entities/follower-count.entity";
import {
  PostNotFoundException,
  PostNotOwnedException,
  PostAlreadyLikedException,
  PostLikeNotFoundException,
} from "../exceptions/social.exceptions";

const logger = new Logger("LikesDeleteIntegrationTest");

const TEST_DB_HOST = "localhost";
const TEST_DB_PORT = 5433;
const TEST_DB_USER = "test";
const TEST_DB_PASS = "test";
const TEST_DB_NAME = "hedera_social_test";
const TEST_REDIS_HOST = "localhost";
const TEST_REDIS_PORT = 6380;

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

function uniqueAccountId(): string {
  return `0.0.${Date.now() % 999999}${Math.floor(Math.random() * 1000)}`;
}

describe("Post Like/Unlike/Delete Integration Tests", () => {
  let module: TestingModule;
  let postsService: PostsService;
  let dataSource: DataSource;
  let postRepository: Repository<PostIndexEntity>;
  let likeRepository: Repository<PostLikeEntity>;
  let userRepository: Repository<UserEntity>;
  let postgresAvailable = false;

  // Cleanup tracking
  const createdPostIds: string[] = [];
  const createdLikeIds: string[] = [];
  const createdUserIds: string[] = [];

  async function createTestUser(
    overrides?: Partial<UserEntity>,
  ): Promise<UserEntity> {
    const user = userRepository.create({
      displayName: `Like Test User ${Date.now()}`,
      email: `like-test-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`,
      hederaAccountId: uniqueAccountId(),
      status: "active",
      ...overrides,
    });
    const saved = await userRepository.save(user);
    createdUserIds.push(saved.id);
    return saved;
  }

  async function createTestPost(
    authorAccountId: string,
  ): Promise<PostIndexEntity> {
    const postId = randomUUID();
    const post = postRepository.create({
      id: postId,
      authorAccountId,
      hcsTopicId: `0.0.${900000 + Math.floor(Math.random() * 99999)}`,
      sequenceNumber: 1,
      consensusTimestamp: new Date(),
      contentText: "Test post for like/unlike/delete tests",
      hasMedia: false,
    });
    const saved = await postRepository.save(post);
    createdPostIds.push(saved.id);
    return saved;
  }

  beforeAll(async () => {
    postgresAvailable = await isPortReachable(TEST_DB_PORT, TEST_DB_HOST);

    if (!postgresAvailable) {
      logger.warn("PostgreSQL not available — tests will be skipped");
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
                redis: {
                  host: TEST_REDIS_HOST,
                  port: TEST_REDIS_PORT,
                },
                hedera: {
                  network: "testnet",
                  operatorId: "",
                  operatorKey: "",
                  socialGraphTopic: "",
                  mirrorNodeUrl: "https://testnet.mirrornode.hedera.com/api/v1",
                },
                jwt: {
                  secret:
                    "test-jwt-secret-key-minimum-32-characters-long-for-testing",
                  expiresIn: "24h",
                },
                pinata: {
                  gatewayUrl: "https://gateway.pinata.cloud/ipfs",
                },
              }),
            ],
          }),
          TypeOrmModule.forRoot({
            type: "postgres",
            host: TEST_DB_HOST,
            port: TEST_DB_PORT,
            username: TEST_DB_USER,
            password: TEST_DB_PASS,
            database: TEST_DB_NAME,
            entities: [
              PostIndexEntity,
              PostLikeEntity,
              PostCommentEntity,
              FeedItemEntity,
              UserEntity,
              SocialFollowEntity,
              FollowerCountEntity,
            ],
            synchronize: true,
            logging: false,
          }),
          TypeOrmModule.forFeature([
            PostIndexEntity,
            PostLikeEntity,
            PostCommentEntity,
            FeedItemEntity,
            UserEntity,
            SocialFollowEntity,
            FollowerCountEntity,
          ]),
        ],
        providers: [
          PostsService,
          SocialGraphService,
          HederaService,
          MirrorNodeService,
          RedisService,
        ],
      }).compile();

      postsService = module.get<PostsService>(PostsService);
      dataSource = module.get<DataSource>(DataSource);
      postRepository = dataSource.getRepository(PostIndexEntity);
      likeRepository = dataSource.getRepository(PostLikeEntity);
      userRepository = dataSource.getRepository(UserEntity);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create test module: ${message}`);
      postgresAvailable = false;
    }
  });

  afterEach(async () => {
    if (!postgresAvailable) return;

    for (const id of createdLikeIds) {
      try {
        await likeRepository
          .createQueryBuilder()
          .delete()
          .from(PostLikeEntity)
          .where("id = :id", { id })
          .execute();
      } catch {
        /* cleanup best-effort */
      }
    }
    createdLikeIds.length = 0;

    // Clean likes by post ID as well
    for (const id of createdPostIds) {
      try {
        await likeRepository
          .createQueryBuilder()
          .delete()
          .from(PostLikeEntity)
          .where('"postId" = :id', { id })
          .execute();
      } catch {
        /* cleanup best-effort */
      }
    }

    for (const id of createdPostIds) {
      try {
        await postRepository
          .createQueryBuilder()
          .delete()
          .from(PostIndexEntity)
          .where("id = :id", { id })
          .execute();
      } catch {
        /* cleanup best-effort */
      }
    }
    createdPostIds.length = 0;

    for (const id of createdUserIds) {
      try {
        await userRepository.delete(id);
      } catch {
        /* cleanup best-effort */
      }
    }
    createdUserIds.length = 0;
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  // -------------------------------------------------------------------------
  // likePost
  // -------------------------------------------------------------------------

  describe("likePost", () => {
    it("should like a post successfully", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const post = await createTestPost(user.hederaAccountId!);

      await postsService.likePost(user.id, post.id);

      // Verify like exists in database
      const like = await likeRepository.findOne({
        where: { userId: user.id, postId: post.id },
      });
      expect(like).not.toBeNull();
      expect(like!.userId).toBe(user.id);
      expect(like!.postId).toBe(post.id);
      if (like) createdLikeIds.push(like.id);
    });

    it("should throw PostNotFoundException for non-existent post", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const fakePostId = randomUUID();

      await expect(postsService.likePost(user.id, fakePostId)).rejects.toThrow(
        PostNotFoundException,
      );
    });

    it("should throw PostAlreadyLikedException for duplicate like", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const post = await createTestPost(user.hederaAccountId!);

      await postsService.likePost(user.id, post.id);

      // Track the like for cleanup
      const like = await likeRepository.findOne({
        where: { userId: user.id, postId: post.id },
      });
      if (like) createdLikeIds.push(like.id);

      // Try to like again
      await expect(postsService.likePost(user.id, post.id)).rejects.toThrow(
        PostAlreadyLikedException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // unlikePost
  // -------------------------------------------------------------------------

  describe("unlikePost", () => {
    it("should unlike a previously liked post", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const post = await createTestPost(user.hederaAccountId!);

      // Like first
      await postsService.likePost(user.id, post.id);
      const like = await likeRepository.findOne({
        where: { userId: user.id, postId: post.id },
      });
      if (like) createdLikeIds.push(like.id);

      // Unlike
      await postsService.unlikePost(user.id, post.id);

      // Verify like is removed
      const afterUnlike = await likeRepository.findOne({
        where: { userId: user.id, postId: post.id },
      });
      expect(afterUnlike).toBeNull();
    });

    it("should throw PostLikeNotFoundException if not previously liked", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const post = await createTestPost(user.hederaAccountId!);

      await expect(postsService.unlikePost(user.id, post.id)).rejects.toThrow(
        PostLikeNotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // deletePost
  // -------------------------------------------------------------------------

  describe("deletePost", () => {
    it("should soft-delete a post by its author", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const post = await createTestPost(user.hederaAccountId!);

      await postsService.deletePost(user.hederaAccountId!, post.id);

      // Post should not be findable normally
      await expect(postsService.getPost(post.id)).rejects.toThrow(
        PostNotFoundException,
      );

      // But should still exist in DB with deletedAt set
      const deleted = await postRepository.findOne({
        where: { id: post.id },
        withDeleted: true,
      });
      expect(deleted).not.toBeNull();
      expect(deleted!.deletedAt).not.toBeNull();
    });

    it("should throw PostNotFoundException for non-existent post", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const fakePostId = randomUUID();
      await expect(
        postsService.deletePost("0.0.12345", fakePostId),
      ).rejects.toThrow(PostNotFoundException);
    });

    it("should throw PostNotOwnedException for non-author", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const author = await createTestUser();
      const otherUser = await createTestUser();
      const post = await createTestPost(author.hederaAccountId!);

      await expect(
        postsService.deletePost(otherUser.hederaAccountId!, post.id),
      ).rejects.toThrow(PostNotOwnedException);

      // Verify post still exists
      const stillExists = await postsService.getPost(post.id);
      expect(stillExists).toBeDefined();
      expect(stillExists.id).toBe(post.id);
    });
  });
});
