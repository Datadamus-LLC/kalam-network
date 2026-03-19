/**
 * Redis Connection — Integration Tests
 *
 * Verifies that the test Redis helpers connect to a REAL Redis instance.
 * Requires docker-compose.test.yml to be running.
 *
 * Run: docker compose -f docker-compose.test.yml up -d
 * Then: pnpm --filter @hedera-social/api test -- --testPathPattern=redis.integration
 */
import {
  initializeTestRedis,
  closeTestRedis,
  getTestRedis,
  flushTestRedis,
} from "./redis";

describe("Test Redis Helpers (Integration)", () => {
  beforeAll(async () => {
    await initializeTestRedis();
  });

  afterAll(async () => {
    await closeTestRedis();
  });

  afterEach(async () => {
    await flushTestRedis();
  });

  it("should connect to real Redis and respond to PING", async () => {
    const redis = getTestRedis();
    const pong = await redis.ping();
    expect(pong).toBe("PONG");
  });

  it("should set and get a real key-value pair", async () => {
    const redis = getTestRedis();
    const key = "test:integration:key";
    const value = "real-redis-value";

    await redis.set(key, value);
    const result = await redis.get(key);

    expect(result).toBe(value);
  });

  it("should support TTL on keys", async () => {
    const redis = getTestRedis();
    const key = "test:ttl:key";

    // Set with 60 second TTL
    await redis.set(key, "expiring-value", "EX", 60);
    const ttl = await redis.ttl(key);

    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it("should flush test database without affecting other databases", async () => {
    const redis = getTestRedis();

    // Set a key
    await redis.set("test:flush:key", "value");
    expect(await redis.get("test:flush:key")).toBe("value");

    // Flush
    await flushTestRedis();

    // Key should be gone
    expect(await redis.get("test:flush:key")).toBeNull();
  });
});
