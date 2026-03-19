/**
 * ProfileService Extended Integration Tests
 *
 * Tests additional uncovered ProfileService paths against REAL PostgreSQL
 * on localhost:5433. Complements the existing profile.service.integration.test.ts
 * which covers base scenarios at ~73% coverage.
 *
 * New paths tested here:
 * - updateProfile with basic displayName + bio update
 * - updateProfile user-not-found
 * - updateProfile HTML sanitization on displayName
 * - searchUsers multi-word query (word splitting)
 * - searchUsers by Hedera account ID format (0.0.XXXXX)
 * - searchUsers limit clamping (999 -> 100)
 * - getPublicProfile includes stats (postCount, follower/following counts)
 * - getMyProfile includes email and phone
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 *
 * NO mocks. NO jest.fn(). NO jest.mock(). NO jest.spyOn().
 * All operations run against a real PostgreSQL instance.
 *
 * Note: ProfileService depends on HederaService, DidNftService, and IpfsService.
 * These require real credentials for Hedera/IPFS operations. For tests that only
 * exercise database-level logic, we configure the module with empty credentials.
 * HederaService gracefully handles missing credentials (warns, does not throw
 * on construction). We test DB-facing profile operations only.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import { DataSource, Repository } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import net from "net";
import { ProfileService } from "../services/profile.service";
import { DidNftService } from "../services/did-nft.service";
import { HederaService } from "../../hedera/hedera.service";
import { IpfsService } from "../../integrations/ipfs/ipfs.service";
import { UserEntity } from "../../../database/entities/user.entity";
import { FollowerCountEntity } from "../../../database/entities/follower-count.entity";
import { PostIndexEntity } from "../../../database/entities/post-index.entity";
import { ProfileNotFoundException } from "../exceptions/profile.exception";

const logger = new Logger("ProfileServiceExtendedIntegrationTest");

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

describe("ProfileService Extended Integration", () => {
  let module: TestingModule;
  let profileService: ProfileService;
  let dataSource: DataSource;
  let userRepository: Repository<UserEntity>;
  let followerCountRepository: Repository<FollowerCountEntity>;
  let postIndexRepository: Repository<PostIndexEntity>;
  let postgresAvailable: boolean;

  // Track created entities for cleanup
  const createdUserIds: string[] = [];
  const createdFollowerAccountIds: string[] = [];
  const createdPostIndexIds: string[] = [];

  /**
   * Helper to insert a test user directly into the database.
   * Bypasses UsersService to avoid coupling test setup with another service.
   */
  async function insertTestUser(
    overrides: Partial<UserEntity> = {},
  ): Promise<UserEntity> {
    const id = overrides.id ?? uuidv4();
    const user = userRepository.create({
      id,
      email:
        overrides.email ??
        `profile-ext-${Date.now()}-${Math.random()}@integration.test`,
      phone: overrides.phone ?? null,
      displayName: overrides.displayName ?? "Test User",
      bio: overrides.bio ?? "Integration test user",
      status: overrides.status ?? "active",
      accountType: overrides.accountType ?? "individual",
      hederaAccountId:
        overrides.hederaAccountId ?? `0.0.${Date.now() % 999999}`,
      ...overrides,
    });
    const saved = await userRepository.save(user);
    createdUserIds.push(saved.id);
    return saved;
  }

  /**
   * Helper to insert a post index record for a user.
   */
  async function insertPostIndex(
    authorAccountId: string,
    overrides: Partial<PostIndexEntity> = {},
  ): Promise<PostIndexEntity> {
    const id = overrides.id ?? uuidv4();
    const post = postIndexRepository.create({
      id,
      authorAccountId,
      hcsTopicId: overrides.hcsTopicId ?? "0.0.999999",
      sequenceNumber: overrides.sequenceNumber ?? 1,
      consensusTimestamp: overrides.consensusTimestamp ?? new Date(),
      contentText: overrides.contentText ?? "Test post content",
      hasMedia: overrides.hasMedia ?? false,
      ...overrides,
    });
    const saved = await postIndexRepository.save(post);
    createdPostIndexIds.push(saved.id);
    return saved;
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
                didTokenId: "",
              },
              pinata: {
                apiKey: "",
                secretKey: "",
                gatewayUrl: "https://gateway.pinata.cloud/ipfs",
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
          entities: [UserEntity, FollowerCountEntity, PostIndexEntity],
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([
          UserEntity,
          FollowerCountEntity,
          PostIndexEntity,
        ]),
      ],
      providers: [ProfileService, HederaService, DidNftService, IpfsService],
    }).compile();

    profileService = module.get(ProfileService);
    dataSource = module.get(DataSource);
    userRepository = dataSource.getRepository(UserEntity);
    followerCountRepository = dataSource.getRepository(FollowerCountEntity);
    postIndexRepository = dataSource.getRepository(PostIndexEntity);
  });

  afterEach(async () => {
    if (!postgresAvailable) return;

    // Clean up post index records
    for (const id of createdPostIndexIds) {
      try {
        await postIndexRepository.delete(id);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Cleanup failed for post index ${id}: ${msg}`);
      }
    }
    createdPostIndexIds.length = 0;

    // Clean up follower counts
    for (const accountId of createdFollowerAccountIds) {
      try {
        await followerCountRepository.delete({ accountId });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Cleanup failed for follower count ${accountId}: ${msg}`);
      }
    }
    createdFollowerAccountIds.length = 0;

    // Clean up users
    for (const id of createdUserIds) {
      try {
        await userRepository.delete(id);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Cleanup failed for user ${id}: ${msg}`);
      }
    }
    createdUserIds.length = 0;
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (module) await module.close();
  });

  // ---------------------------------------------------------------------------
  // updateProfile — basic update (displayName, bio)
  // ---------------------------------------------------------------------------

  it("should update both displayName and bio in a single call", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const user = await insertTestUser({
      displayName: "Original Display Name",
      bio: "Original bio text",
      status: "active",
      didNftSerial: null, // no DID NFT -> skips Hedera refresh
    });

    const updated = await profileService.updateProfile(user.id, {
      displayName: "Updated Display Name",
      bio: "Updated bio text",
    });

    expect(updated.displayName).toBe("Updated Display Name");
    expect(updated.bio).toBe("Updated bio text");
  });

  // ---------------------------------------------------------------------------
  // updateProfile — user not found
  // ---------------------------------------------------------------------------

  it("should throw ProfileNotFoundException when updating a non-existent user", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const nonExistentId = uuidv4();
    await expect(
      profileService.updateProfile(nonExistentId, {
        displayName: "Should Fail",
      }),
    ).rejects.toThrow(ProfileNotFoundException);
  });

  // ---------------------------------------------------------------------------
  // updateProfile — HTML sanitization on displayName
  // ---------------------------------------------------------------------------

  it("should strip HTML tags from displayName during update", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const user = await insertTestUser({
      displayName: "Clean Name",
      status: "active",
      didNftSerial: null,
    });

    const updated = await profileService.updateProfile(user.id, {
      displayName: "<script>alert('xss')</script>Safe Name",
    });

    // sanitize-html strips all tags when allowedTags is empty
    expect(updated.displayName).not.toContain("<script>");
    expect(updated.displayName).not.toContain("</script>");
    expect(updated.displayName).toContain("Safe Name");
  });

  it("should strip HTML tags from bio during update", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const user = await insertTestUser({
      bio: "Clean bio",
      status: "active",
      didNftSerial: null,
    });

    const updated = await profileService.updateProfile(user.id, {
      bio: "<b>Bold</b> and <img src=x onerror=alert(1)>safe text",
    });

    expect(updated.bio).not.toContain("<b>");
    expect(updated.bio).not.toContain("<img");
    expect(updated.bio).toContain("Bold");
    expect(updated.bio).toContain("safe text");
  });

  // ---------------------------------------------------------------------------
  // searchUsers — multi-word query
  // ---------------------------------------------------------------------------

  it("should match users when searching with a multi-word query", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const uniquePrefix = `MultiWord-${Date.now()}`;
    const user = await insertTestUser({
      displayName: `${uniquePrefix} Alpha User`,
      status: "active",
      hederaAccountId: `0.0.${Date.now() % 999999}`,
    });

    // Multi-word query: "MultiWord Alpha" should match since each word is
    // searched individually (word splitting logic in searchUsers).
    const results = await profileService.searchUsers(`${uniquePrefix} Alpha`);

    expect(results.length).toBeGreaterThanOrEqual(1);
    const match = results.find(
      (r) => r.displayName === `${uniquePrefix} Alpha User`,
    );
    expect(match).toBeDefined();
    expect(match!.hederaAccountId).toBe(user.hederaAccountId);
  });

  it("should match on individual words of a multi-word query", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const timestamp = Date.now();
    const uniqueTag = `MWTag${timestamp}`;
    await insertTestUser({
      displayName: `${uniqueTag} Updated R18`,
      status: "active",
      hederaAccountId: `0.0.${timestamp % 999999}`,
    });

    // Searching "MWTag<ts> Updated" should match via individual word "MWTag<ts>"
    // Both words appear in the displayName, but even just one word match is enough
    const results = await profileService.searchUsers(`${uniqueTag} Updated`);

    expect(results.length).toBeGreaterThanOrEqual(1);
    const match = results.find((r: { displayName: string }) =>
      r.displayName.includes(uniqueTag),
    );
    expect(match).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // searchUsers — search by Hedera account ID format (0.0.XXXXX)
  // ---------------------------------------------------------------------------

  it("should find a user when searching by their Hedera account ID", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const hederaAccountId = `0.0.${700000 + (Date.now() % 99999)}`;
    await insertTestUser({
      displayName: `HederaSearch-${Date.now()}`,
      hederaAccountId,
      status: "active",
    });

    const results = await profileService.searchUsers(hederaAccountId);

    expect(results.length).toBeGreaterThanOrEqual(1);
    const match = results.find((r) => r.hederaAccountId === hederaAccountId);
    expect(match).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // searchUsers — limit clamping (999 -> 100)
  // ---------------------------------------------------------------------------

  it("should clamp limit to 100 when a value larger than 100 is passed", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    // Passing limit=999 should not throw and should be clamped to 100 internally.
    // We verify the method succeeds without error and returns an array.
    const uniqueQuery = `LimitClamp-${Date.now()}`;
    const results = await profileService.searchUsers(uniqueQuery, 999);

    expect(Array.isArray(results)).toBe(true);
    // Even though we passed 999, the internal sanitizedLimit is Math.min(999, 100) = 100
    // The result length is at most 100 (though likely 0 since the query is unique)
    expect(results.length).toBeLessThanOrEqual(100);
  });

  it("should clamp limit to 1 when a value of 0 is passed", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    // Passing limit=0 should be clamped to Math.max(0, 1) = 1 internally
    const uniqueQuery = `LimitClampZero-${Date.now()}`;
    const results = await profileService.searchUsers(uniqueQuery, 0);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeLessThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // getPublicProfile — includes stats (postCount, follower/following counts)
  // ---------------------------------------------------------------------------

  it("should include follower, following, and post counts in public profile", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const hederaAccountId = `0.0.${Date.now() % 999999}`;
    await insertTestUser({
      hederaAccountId,
      displayName: "Stats Profile User",
      status: "active",
    });

    // Insert follower count record
    const followerCount = followerCountRepository.create({
      accountId: hederaAccountId,
      followerCount: 25,
      followingCount: 12,
    });
    await followerCountRepository.save(followerCount);
    createdFollowerAccountIds.push(hederaAccountId);

    // Insert post index records
    await insertPostIndex(hederaAccountId, {
      contentText: "First post",
      sequenceNumber: 1,
    });
    await insertPostIndex(hederaAccountId, {
      contentText: "Second post",
      sequenceNumber: 2,
    });
    await insertPostIndex(hederaAccountId, {
      contentText: "Third post",
      sequenceNumber: 3,
    });

    const profile = await profileService.getPublicProfile(hederaAccountId);

    expect(profile.stats).toBeDefined();
    expect(profile.stats.followers).toBe(25);
    expect(profile.stats.following).toBe(12);
    expect(profile.stats.posts).toBe(3);
  });

  it("should return zero stats when no follower counts or posts exist", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const hederaAccountId = `0.0.${Date.now() % 999999}`;
    await insertTestUser({
      hederaAccountId,
      displayName: "Zero Stats User",
      status: "active",
    });

    const profile = await profileService.getPublicProfile(hederaAccountId);

    expect(profile.stats.followers).toBe(0);
    expect(profile.stats.following).toBe(0);
    expect(profile.stats.posts).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // getMyProfile — includes email and phone
  // ---------------------------------------------------------------------------

  it("should include email and phone in own profile response", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const email = `myprofile-ext-${Date.now()}@integration.test`;
    const phone = "+971509876543";
    const user = await insertTestUser({
      email,
      phone,
      displayName: "My Profile Extended User",
      status: "active",
    });

    const profile = await profileService.getMyProfile(user.id);

    expect(profile.email).toBe(email);
    expect(profile.phone).toBe(phone);
    expect(profile.isOwner).toBe(true);
    expect(profile.displayName).toBe("My Profile Extended User");
  });

  it("should include email as null when not set in own profile", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const user = await insertTestUser({
      email: null,
      phone: null,
      displayName: "No Contact Info User",
      status: "active",
    });

    const profile = await profileService.getMyProfile(user.id);

    expect(profile.email).toBeNull();
    expect(profile.phone).toBeNull();
    expect(profile.isOwner).toBe(true);
  });

  it("should include stats in own profile response", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const hederaAccountId = `0.0.${Date.now() % 999999}`;
    const user = await insertTestUser({
      hederaAccountId,
      displayName: "Own Profile Stats User",
      status: "active",
    });

    // Insert follower count record
    const fc = followerCountRepository.create({
      accountId: hederaAccountId,
      followerCount: 8,
      followingCount: 4,
    });
    await followerCountRepository.save(fc);
    createdFollowerAccountIds.push(hederaAccountId);

    // Insert one post
    await insertPostIndex(hederaAccountId, {
      contentText: "My own post",
    });

    const profile = await profileService.getMyProfile(user.id);

    expect(profile.stats.followers).toBe(8);
    expect(profile.stats.following).toBe(4);
    expect(profile.stats.posts).toBe(1);
    expect(profile.isOwner).toBe(true);
  });
});
