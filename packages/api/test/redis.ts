/**
 * Real Redis connection helper for integration tests.
 *
 * Connects to a REAL Redis instance. No mocking, no faking.
 * Start the test Redis before running: `docker compose -f docker-compose.test.yml up -d`
 *
 * Uses database index 1 (separate from dev on index 0) to prevent conflicts.
 */
import Redis from "ioredis";
import { Logger } from "@nestjs/common";
import { TestNotInitializedException } from "./exceptions";

const logger = new Logger("TestRedis");

let redis: Redis | null = null;

/**
 * Initialize real Redis connection for tests.
 * Call in beforeAll() of your test file.
 */
export async function initializeTestRedis(): Promise<Redis> {
  if (redis) {
    return redis;
  }

  const url = process.env.REDIS_URL || "redis://localhost:6380/1";
  redis = new Redis(url, {
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  try {
    await redis.connect();
    await redis.ping();
    logger.log("Connected to test Redis");
    return redis;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to connect to test Redis: ${message}`);
    throw error;
  }
}

/**
 * Close Redis connection.
 * Call in afterAll() of your test file.
 */
export async function closeTestRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    logger.log("Test Redis connection closed");
  }
}

/**
 * Get active Redis connection.
 * Throws if not initialized.
 */
export function getTestRedis(): Redis {
  if (!redis) {
    throw new TestNotInitializedException(
      "Test Redis",
      "initializeTestRedis()",
    );
  }
  return redis;
}

/**
 * Clear all keys in test Redis database.
 * Use between test suites for clean state.
 */
export async function flushTestRedis(): Promise<void> {
  const r = getTestRedis();
  await r.flushdb();
  logger.log("Flushed test Redis database");
}
