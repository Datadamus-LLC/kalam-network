/**
 * RedisService Integration Tests
 *
 * Tests RedisService against REAL Redis on localhost:6380.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 *
 * NO mocks. NO jest.fn(). NO jest.mock(). NO jest.spyOn().
 * All operations run against a real Redis instance.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import net from "net";
import { RedisService } from "../redis.service";

const logger = new Logger("RedisServiceIntegrationTest");

async function isRedisAvailable(): Promise<boolean> {
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
    socket.connect(6380, "localhost");
  });
}

describe("RedisService Integration", () => {
  let module: TestingModule;
  let service: RedisService;
  let redisAvailable: boolean;

  // Track keys for cleanup
  const keysToClean: string[] = [];

  /** Generate a unique test key to avoid collisions between tests */
  function testKey(suffix: string): string {
    const key = `test:redis-svc:${Date.now()}:${suffix}`;
    keysToClean.push(key);
    return key;
  }

  beforeAll(async () => {
    redisAvailable = await isRedisAvailable();
    if (!redisAvailable) {
      logger.warn("Redis not available on port 6380 — tests will be skipped");
      return;
    }

    // Set env vars for Redis connection to test port
    process.env.REDIS_HOST = "localhost";
    process.env.REDIS_PORT = "6380";

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              redis: { host: "localhost", port: 6380 },
            }),
          ],
        }),
      ],
      providers: [RedisService],
    }).compile();

    service = module.get(RedisService);

    // Wait briefly for Redis connection to establish
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  afterEach(async () => {
    if (!redisAvailable) return;
    for (const key of keysToClean) {
      try {
        await service.del(key);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Cleanup failed for key ${key}: ${msg}`);
      }
    }
    keysToClean.length = 0;
  });

  afterAll(async () => {
    if (module) await module.close();
  });

  it("should set and get a string value", async () => {
    if (!redisAvailable) {
      logger.warn("SKIPPED: Redis not available");
      pending();
      return;
    }

    const key = testKey("set-get");
    const value = "hello-redis-integration";

    const setResult = await service.set(key, value);
    expect(setResult).toBe("OK");

    const getResult = await service.get(key);
    expect(getResult).toBe(value);
  });

  it("should return null for non-existent key", async () => {
    if (!redisAvailable) {
      logger.warn("SKIPPED: Redis not available");
      pending();
      return;
    }

    const key = testKey("non-existent");
    const result = await service.get(key);
    expect(result).toBeNull();
  });

  it("should set value with TTL using setex", async () => {
    if (!redisAvailable) {
      logger.warn("SKIPPED: Redis not available");
      pending();
      return;
    }

    const key = testKey("setex");
    const value = "expires-soon";

    const setResult = await service.setex(key, 10, value);
    expect(setResult).toBe("OK");

    const getResult = await service.get(key);
    expect(getResult).toBe(value);

    // Verify TTL is set
    const ttl = await service.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(10);
  });

  it("should expire key after TTL (using short TTL)", async () => {
    if (!redisAvailable) {
      logger.warn("SKIPPED: Redis not available");
      pending();
      return;
    }

    const key = testKey("ttl-expire");
    const value = "short-lived";

    await service.setex(key, 1, value);

    // Immediately the key should exist
    const beforeExpiry = await service.get(key);
    expect(beforeExpiry).toBe(value);

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const afterExpiry = await service.get(key);
    expect(afterExpiry).toBeNull();
  });

  it("should delete a key using del()", async () => {
    if (!redisAvailable) {
      logger.warn("SKIPPED: Redis not available");
      pending();
      return;
    }

    const key = testKey("del");
    await service.set(key, "to-be-deleted");

    const beforeDel = await service.get(key);
    expect(beforeDel).toBe("to-be-deleted");

    const delResult = await service.del(key);
    expect(delResult).toBe(1);

    const afterDel = await service.get(key);
    expect(afterDel).toBeNull();
  });

  it("should return 0 when deleting non-existent key", async () => {
    if (!redisAvailable) {
      logger.warn("SKIPPED: Redis not available");
      pending();
      return;
    }

    const key = testKey("del-nonexistent");
    const delResult = await service.del(key);
    expect(delResult).toBe(0);
  });

  it("should increment a counter using incr()", async () => {
    if (!redisAvailable) {
      logger.warn("SKIPPED: Redis not available");
      pending();
      return;
    }

    const key = testKey("incr");

    // First incr creates key with value 1
    const first = await service.incr(key);
    expect(first).toBe(1);

    // Second incr increments to 2
    const second = await service.incr(key);
    expect(second).toBe(2);

    // Third incr increments to 3
    const third = await service.incr(key);
    expect(third).toBe(3);

    // Verify via get
    const value = await service.get(key);
    expect(value).toBe("3");
  });

  it("should check key existence using exists()", async () => {
    if (!redisAvailable) {
      logger.warn("SKIPPED: Redis not available");
      pending();
      return;
    }

    const key = testKey("exists");

    // Key does not exist yet
    const beforeSet = await service.exists(key);
    expect(beforeSet).toBe(0);

    // Set the key
    await service.set(key, "present");

    // Key should exist now
    const afterSet = await service.exists(key);
    expect(afterSet).toBe(1);
  });

  it("should find keys using pattern matching with keys()", async () => {
    if (!redisAvailable) {
      logger.warn("SKIPPED: Redis not available");
      pending();
      return;
    }

    const prefix = `test:pattern:${Date.now()}`;
    const key1 = `${prefix}:alpha`;
    const key2 = `${prefix}:beta`;
    const key3 = `${prefix}:gamma`;
    keysToClean.push(key1, key2, key3);

    await service.set(key1, "a");
    await service.set(key2, "b");
    await service.set(key3, "c");

    const matchingKeys = await service.keys(`${prefix}:*`);
    expect(matchingKeys).toHaveLength(3);
    expect(matchingKeys.sort()).toEqual([key1, key2, key3].sort());
  });

  it("should return empty array for non-matching pattern", async () => {
    if (!redisAvailable) {
      logger.warn("SKIPPED: Redis not available");
      pending();
      return;
    }

    const pattern = `test:no-match-${Date.now()}:*`;
    const matchingKeys = await service.keys(pattern);
    expect(matchingKeys).toHaveLength(0);
  });

  it("should set TTL on existing key using expire()", async () => {
    if (!redisAvailable) {
      logger.warn("SKIPPED: Redis not available");
      pending();
      return;
    }

    const key = testKey("expire");
    await service.set(key, "will-expire");

    // Before expire, TTL should be -1 (no TTL set)
    const ttlBefore = await service.ttl(key);
    expect(ttlBefore).toBe(-1);

    // Set TTL
    const expireResult = await service.expire(key, 30);
    expect(expireResult).toBe(1);

    // After expire, TTL should be positive
    const ttlAfter = await service.ttl(key);
    expect(ttlAfter).toBeGreaterThan(0);
    expect(ttlAfter).toBeLessThanOrEqual(30);
  });

  it("should return -2 for TTL of non-existent key", async () => {
    if (!redisAvailable) {
      logger.warn("SKIPPED: Redis not available");
      pending();
      return;
    }

    const key = testKey("ttl-nonexistent");
    const ttl = await service.ttl(key);
    expect(ttl).toBe(-2);
  });

  it("should overwrite existing value on set()", async () => {
    if (!redisAvailable) {
      logger.warn("SKIPPED: Redis not available");
      pending();
      return;
    }

    const key = testKey("overwrite");
    await service.set(key, "first");
    await service.set(key, "second");

    const result = await service.get(key);
    expect(result).toBe("second");
  });
});
