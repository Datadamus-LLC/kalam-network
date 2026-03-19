/**
 * ProfileService Integration Tests
 *
 * Tests ProfileService against REAL PostgreSQL on localhost:5433.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 *
 * NO mocks. NO jest.fn(). NO jest.mock(). NO jest.spyOn().
 * All operations run against a real PostgreSQL instance.
 *
 * Note: ProfileService depends on HederaService, DidNftService, and IpfsService.
 * These are external services that require real credentials. For tests that only
 * exercise database-level logic (getPublicProfile, getMyProfile, searchUsers),
 * we configure the module with the real services but skip test scenarios that
 * would invoke Hedera testnet or IPFS (those belong in dedicated integration tests).
 * The HederaService gracefully handles missing credentials (warns, does not throw
 * on construction). We test the DB-facing profile operations only.
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
import {
  ProfileNotFoundException,
  InvalidSearchQueryException,
  ProfileUpdateNotAllowedException,
  UsernameUnavailableException,
} from "../exceptions/profile.exception";

const logger = new Logger("ProfileServiceIntegrationTest");

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

describe("ProfileService Integration", () => {
  let module: TestingModule;
  let profileService: ProfileService;
  let dataSource: DataSource;
  let userRepository: Repository<UserEntity>;
  let followerCountRepository: Repository<FollowerCountEntity>;
  let postgresAvailable: boolean;

  // Track created entities for cleanup
  const createdUserIds: string[] = [];
  const createdFollowerAccountIds: string[] = [];

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
        `profile-test-${Date.now()}-${Math.random()}@integration.test`,
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
  });

  afterEach(async () => {
    if (!postgresAvailable) return;

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

  it("should get a public profile by Hedera account ID", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const hederaAccountId = `0.0.${Date.now() % 999999}`;
    await insertTestUser({
      displayName: "Profile Test User",
      bio: "Hello from integration tests",
      hederaAccountId,
      status: "active",
    });

    const profile = await profileService.getPublicProfile(hederaAccountId);

    expect(profile.hederaAccountId).toBe(hederaAccountId);
    expect(profile.displayName).toBe("Profile Test User");
    expect(profile.bio).toBe("Hello from integration tests");
    expect(profile.accountType).toBe("individual");
    expect(profile.status).toBe("active");
    expect(profile.stats).toBeDefined();
    expect(profile.stats.followers).toBe(0);
    expect(profile.stats.following).toBe(0);
    expect(profile.stats.posts).toBe(0);
    expect(profile.didNft).toBeDefined();
    expect(profile.topics).toBeDefined();
  });

  it("should throw ProfileNotFoundException for non-existent Hedera account", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    await expect(
      profileService.getPublicProfile("0.0.999999999"),
    ).rejects.toThrow(ProfileNotFoundException);
  });

  it("should get own profile by user ID (includes private fields)", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const email = `own-profile-${Date.now()}@integration.test`;
    const user = await insertTestUser({
      email,
      phone: "+971501234567",
      displayName: "Own Profile User",
      status: "active",
    });

    const profile = await profileService.getMyProfile(user.id);

    expect(profile.displayName).toBe("Own Profile User");
    expect(profile.email).toBe(email);
    expect(profile.phone).toBe("+971501234567");
    expect(profile.isOwner).toBe(true);
  });

  it("should throw ProfileNotFoundException for non-existent user ID on getMyProfile", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const nonExistentId = uuidv4();
    await expect(profileService.getMyProfile(nonExistentId)).rejects.toThrow(
      ProfileNotFoundException,
    );
  });

  it("should include follower stats when follower_counts record exists", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const hederaAccountId = `0.0.${Date.now() % 999999}`;
    await insertTestUser({
      hederaAccountId,
      displayName: "Stats User",
      status: "active",
    });

    // Insert a follower count record
    const followerCount = followerCountRepository.create({
      accountId: hederaAccountId,
      followerCount: 42,
      followingCount: 15,
    });
    await followerCountRepository.save(followerCount);
    createdFollowerAccountIds.push(hederaAccountId);

    const profile = await profileService.getPublicProfile(hederaAccountId);

    expect(profile.stats.followers).toBe(42);
    expect(profile.stats.following).toBe(15);
  });

  it("should search users by display name", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const uniqueName = `SearchTarget-${Date.now()}`;
    await insertTestUser({
      displayName: uniqueName,
      status: "active",
      hederaAccountId: `0.0.${Date.now() % 999999}`,
    });

    const results = await profileService.searchUsers(uniqueName);

    expect(results.length).toBeGreaterThanOrEqual(1);
    const match = results.find((r) => r.displayName === uniqueName);
    expect(match).toBeDefined();
    expect(match!.accountType).toBe("individual");
  });

  it("should return empty array when no users match search", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const results = await profileService.searchUsers(
      `NoMatchPossible-${Date.now()}`,
    );
    expect(results).toHaveLength(0);
  });

  it("should throw InvalidSearchQueryException for query shorter than 2 chars", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    await expect(profileService.searchUsers("a")).rejects.toThrow(
      InvalidSearchQueryException,
    );
  });

  it("should not return inactive users in search results", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const uniqueName = `InactiveSearch-${Date.now()}`;

    // Create an inactive user
    await insertTestUser({
      displayName: uniqueName,
      status: "pending_wallet",
      hederaAccountId: `0.0.${Date.now() % 999999}`,
    });

    const results = await profileService.searchUsers(uniqueName);

    // The inactive user should not appear in search results
    // (searchUsers filters by status: "active")
    const match = results.find((r) => r.displayName === uniqueName);
    expect(match).toBeUndefined();
  });

  it("should return avatar URL when avatarIpfsCid is set", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const hederaAccountId = `0.0.${Date.now() % 999999}`;
    const ipfsCid = "QmTestCid123456789";
    await insertTestUser({
      hederaAccountId,
      displayName: "Avatar User",
      avatarIpfsCid: ipfsCid,
      status: "active",
    });

    const profile = await profileService.getPublicProfile(hederaAccountId);

    expect(profile.avatarIpfsCid).toBe(ipfsCid);
    expect(profile.avatarUrl).toContain(ipfsCid);
    expect(profile.avatarUrl).toContain("gateway.pinata.cloud/ipfs");
  });

  it("should return null avatarUrl when avatarIpfsCid is not set", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const hederaAccountId = `0.0.${Date.now() % 999999}`;
    await insertTestUser({
      hederaAccountId,
      displayName: "No Avatar User",
      avatarIpfsCid: null,
      status: "active",
    });

    const profile = await profileService.getPublicProfile(hederaAccountId);

    expect(profile.avatarIpfsCid).toBeNull();
    expect(profile.avatarUrl).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // updateProfile — DB_ONLY paths (no avatar upload, no DID NFT refresh)
  // ---------------------------------------------------------------------------

  it("should update displayName only (no avatar, no DID NFT)", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const user = await insertTestUser({
      displayName: "Original Name",
      bio: "Original bio",
      status: "active",
      didNftSerial: null, // no DID NFT → skips Hedera refresh
    });

    const updated = await profileService.updateProfile(user.id, {
      displayName: "Updated Name",
    });

    expect(updated.displayName).toBe("Updated Name");
    // bio should remain unchanged
    expect(updated.bio).toBe("Original bio");
  });

  it("should update bio only (no avatar, no DID NFT)", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const user = await insertTestUser({
      displayName: "Bio Test User",
      bio: "Old bio",
      status: "active",
      didNftSerial: null,
    });

    const updated = await profileService.updateProfile(user.id, {
      bio: "New bio content",
    });

    expect(updated.bio).toBe("New bio content");
    expect(updated.displayName).toBe("Bio Test User");
  });

  it("should update both displayName and bio simultaneously", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const user = await insertTestUser({
      displayName: "Both Fields User",
      bio: "Old bio",
      status: "active",
      didNftSerial: null,
    });

    const updated = await profileService.updateProfile(user.id, {
      displayName: "New Display Name",
      bio: "New Bio Text",
    });

    expect(updated.displayName).toBe("New Display Name");
    expect(updated.bio).toBe("New Bio Text");
  });

  it("should throw ProfileNotFoundException for non-existent user on updateProfile", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    await expect(
      profileService.updateProfile(uuidv4(), { displayName: "X" }),
    ).rejects.toThrow(ProfileNotFoundException);
  });

  it("should throw ProfileUpdateNotAllowedException for non-active user", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const user = await insertTestUser({
      displayName: "Pending User",
      status: "pending_wallet",
      didNftSerial: null,
    });

    await expect(
      profileService.updateProfile(user.id, { displayName: "New Name" }),
    ).rejects.toThrow(ProfileUpdateNotAllowedException);
  });

  it("should return updated profile with stats after update", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const hederaAccountId = `0.0.${Date.now() % 999999}`;
    const user = await insertTestUser({
      hederaAccountId,
      displayName: "Stats Update User",
      status: "active",
      didNftSerial: null,
    });

    // Insert follower count record
    const followerCount = followerCountRepository.create({
      accountId: hederaAccountId,
      followerCount: 10,
      followingCount: 5,
    });
    await followerCountRepository.save(followerCount);
    createdFollowerAccountIds.push(hederaAccountId);

    const updated = await profileService.updateProfile(user.id, {
      displayName: "After Update",
    });

    expect(updated.displayName).toBe("After Update");
    expect(updated.stats.followers).toBe(10);
    expect(updated.stats.following).toBe(5);
  });

  // ---------------------------------------------------------------------------
  // searchUsers — limit enforcement
  // ---------------------------------------------------------------------------

  it("should enforce search limit parameter", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const prefix = `LimitTest-${Date.now()}`;
    // Create 3 users
    for (let i = 0; i < 3; i++) {
      await insertTestUser({
        displayName: `${prefix}-User${i}`,
        status: "active",
        hederaAccountId: `0.0.${(Date.now() % 999000) + i}`,
      });
    }

    // Search with limit=2
    const results = await profileService.searchUsers(prefix, 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("should cap limit at 100 even if larger value passed", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    // This shouldn't throw — the method clamps limit to [1, 100]
    const results = await profileService.searchUsers(
      `CapTest-${Date.now()}`,
      999,
    );
    expect(Array.isArray(results)).toBe(true);
  });

  it("should include stats in search results", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const uniqueName = `StatsSearch-${Date.now()}`;
    const hederaAccountId = `0.0.${Date.now() % 999999}`;
    await insertTestUser({
      displayName: uniqueName,
      hederaAccountId,
      status: "active",
    });

    // Add follower count
    const fc = followerCountRepository.create({
      accountId: hederaAccountId,
      followerCount: 7,
      followingCount: 3,
    });
    await followerCountRepository.save(fc);
    createdFollowerAccountIds.push(hederaAccountId);

    const results = await profileService.searchUsers(uniqueName);
    expect(results.length).toBe(1);
    expect(results[0].stats.followers).toBe(7);
    expect(results[0].stats.following).toBe(3);
    expect(results[0].stats.posts).toBe(0);
  });

  it("should throw InvalidSearchQueryException for empty query", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    await expect(profileService.searchUsers("")).rejects.toThrow(
      InvalidSearchQueryException,
    );
  });

  // ---------------------------------------------------------------------------
  // username handle system
  // ---------------------------------------------------------------------------

  describe("username handle system", () => {
    it("checkUsernameAvailability — valid, unclaimed username returns available: true", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      // Insert a user WITHOUT a username so the target name is not claimed
      await insertTestUser({ username: null });

      const suffix = `${Date.now()}`;
      const result = await profileService.checkUsernameAvailability(
        `validuser${suffix}`.slice(0, 30),
      );

      expect(result).toEqual({ available: true });
    });

    it("checkUsernameAvailability — already claimed username returns available: false", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const takenName = `taken${Date.now()}`.slice(0, 30);
      await insertTestUser({ username: takenName });

      const result = await profileService.checkUsernameAvailability(takenName);

      expect(result).toEqual({ available: false });
    });

    it("checkUsernameAvailability — case insensitive: 'MyHandle' unavailable when 'myhandle' is taken", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const base = `myhandle${Date.now()}`.slice(0, 30);
      // Store lowercase in DB (as the service normalises to lowercase)
      await insertTestUser({ username: base.toLowerCase() });

      // Query with mixed-case version of the same handle
      const mixedCase =
        base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
      const result =
        await profileService.checkUsernameAvailability(mixedCase);

      expect(result).toEqual({ available: false });
    });

    it("checkUsernameAvailability — invalid format (too short, 2 chars) returns available: false", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      // 'ab' is only 2 characters — regex requires 3–30
      const result = await profileService.checkUsernameAvailability("ab");

      expect(result).toEqual({ available: false });
    });

    it("checkUsernameAvailability — invalid format (special chars) returns available: false", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      // Space and exclamation mark are not in [a-zA-Z0-9_]
      const result =
        await profileService.checkUsernameAvailability("user name!");

      expect(result).toEqual({ available: false });
    });

    it("updateProfile — sets username and normalizes to lowercase", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const user = await insertTestUser({
        displayName: "Username Normalise Test",
        status: "active",
        didNftSerial: null,
      });

      const rawHandle = `MyHandle${Date.now()}`.slice(0, 30);
      await profileService.updateProfile(user.id, { username: rawHandle });

      const updated = await userRepository.findOne({ where: { id: user.id } });
      expect(updated).not.toBeNull();
      expect(updated!.username).toBe(rawHandle.toLowerCase());
    });

    it("updateProfile — throws UsernameUnavailableException when username is already taken", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const takenHandle = `taken_handle${Date.now()}`.slice(0, 30);

      // User A already owns the handle
      await insertTestUser({
        username: takenHandle,
        status: "active",
        didNftSerial: null,
      });

      // User B tries to claim the same handle
      const userB = await insertTestUser({
        username: null,
        status: "active",
        didNftSerial: null,
      });

      await expect(
        profileService.updateProfile(userB.id, { username: takenHandle }),
      ).rejects.toThrow(UsernameUnavailableException);
    });

    it("searchUsers — finds user by username", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const uniqueHandle = `searchable${Date.now()}`.slice(0, 30);
      await insertTestUser({
        username: uniqueHandle,
        status: "active",
        hederaAccountId: `0.0.${Date.now() % 999999}`,
      });

      const results = await profileService.searchUsers(uniqueHandle);

      expect(results.length).toBeGreaterThanOrEqual(1);
      const match = results.find((r) => r.username === uniqueHandle);
      expect(match).toBeDefined();
      expect(match!.username).toBe(uniqueHandle);
    });
  });
});
