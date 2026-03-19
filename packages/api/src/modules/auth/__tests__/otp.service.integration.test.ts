/**
 * OtpService Integration Tests
 *
 * Tests OtpService against REAL Redis on localhost:6380.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 *
 * NO mocks. NO jest.fn(). NO jest.mock(). NO jest.spyOn().
 * All operations run against a real Redis instance.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { Logger, BadRequestException } from "@nestjs/common";
import net from "net";
import { OtpService } from "../services/otp.service";
import { RedisService } from "../../redis/redis.service";

const logger = new Logger("OtpServiceIntegrationTest");

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

describe("OtpService Integration", () => {
  let module: TestingModule;
  let otpService: OtpService;
  let redisService: RedisService;
  let redisAvailable: boolean;

  // Track Redis keys for cleanup
  const keysToClean: string[] = [];

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
          // Provide OTP config with short TTL for testing
          load: [
            () => ({
              redis: { host: "localhost", port: 6380 },
              otp: {
                ttlSeconds: 10,
                maxAttempts: 3,
                cooldownSeconds: 5,
              },
            }),
          ],
        }),
      ],
      providers: [RedisService, OtpService],
    }).compile();

    otpService = module.get(OtpService);
    redisService = module.get(RedisService);

    // Wait briefly for Redis connection to establish
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  afterEach(async () => {
    if (!redisAvailable) return;
    // Clean up all tracked keys
    for (const key of keysToClean) {
      try {
        await redisService.del(key);
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

  /**
   * Helper to register keys for cleanup.
   */
  function trackKeys(identifier: string): void {
    keysToClean.push(`otp:${identifier}`);
    keysToClean.push(`otp_attempts:${identifier}`);
    keysToClean.push(`otp_cooldown:${identifier}`);
  }

  it("should generate a 6-digit OTP string", async () => {
    if (!redisAvailable) {
      logger.warn("SKIPPED: Redis not available");
      pending();
      return;
    }

    const identifier = `gen-test-${Date.now()}@integration.test`;
    trackKeys(identifier);

    const result = await otpService.generateOtp(identifier);

    expect(result.otp).toBeDefined();
    expect(typeof result.otp).toBe("string");
    expect(result.otp).toHaveLength(6);
    expect(Number(result.otp)).toBeGreaterThanOrEqual(100000);
    expect(Number(result.otp)).toBeLessThanOrEqual(999999);
    expect(result.expiresAt).toBeDefined();
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("should store OTP in Redis with TTL", async () => {
    if (!redisAvailable) {
      logger.warn("SKIPPED: Redis not available");
      pending();
      return;
    }

    const identifier = `store-test-${Date.now()}@integration.test`;
    trackKeys(identifier);

    const result = await otpService.generateOtp(identifier);

    // Verify OTP is stored in Redis
    const storedOtp = await redisService.get(`otp:${identifier}`);
    expect(storedOtp).toBe(result.otp);

    // Verify TTL is set (should be > 0 and <= configured TTL)
    const ttl = await redisService.ttl(`otp:${identifier}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(10);
  });

  it("should verify OTP successfully with correct code", async () => {
    if (!redisAvailable) {
      logger.warn("SKIPPED: Redis not available");
      pending();
      return;
    }

    const identifier = `verify-ok-${Date.now()}@integration.test`;
    trackKeys(identifier);

    const { otp } = await otpService.generateOtp(identifier);
    const isValid = await otpService.verifyOtp(identifier, otp);

    expect(isValid).toBe(true);
  });

  it("should fail verification with wrong OTP", async () => {
    if (!redisAvailable) {
      logger.warn("SKIPPED: Redis not available");
      pending();
      return;
    }

    const identifier = `verify-fail-${Date.now()}@integration.test`;
    trackKeys(identifier);

    await otpService.generateOtp(identifier);
    const isValid = await otpService.verifyOtp(identifier, "000000");

    expect(isValid).toBe(false);
  });

  it("should fail verification when OTP has expired", async () => {
    if (!redisAvailable) {
      logger.warn("SKIPPED: Redis not available");
      pending();
      return;
    }

    const identifier = `verify-expired-${Date.now()}@integration.test`;
    trackKeys(identifier);

    // Generate OTP then immediately delete it from Redis to simulate expiration
    const { otp } = await otpService.generateOtp(identifier);
    await redisService.del(`otp:${identifier}`);

    const isValid = await otpService.verifyOtp(identifier, otp);
    expect(isValid).toBe(false);
  });

  it("should remove OTP from Redis after successful verification", async () => {
    if (!redisAvailable) {
      logger.warn("SKIPPED: Redis not available");
      pending();
      return;
    }

    const identifier = `cleanup-${Date.now()}@integration.test`;
    trackKeys(identifier);

    const { otp } = await otpService.generateOtp(identifier);

    // Verify the OTP exists before verification
    const beforeVerify = await redisService.get(`otp:${identifier}`);
    expect(beforeVerify).toBe(otp);

    // Verify successfully
    const isValid = await otpService.verifyOtp(identifier, otp);
    expect(isValid).toBe(true);

    // OTP should be deleted from Redis after successful verification
    const afterVerify = await redisService.get(`otp:${identifier}`);
    expect(afterVerify).toBeNull();
  });

  it("should enforce rate limiting after max failed attempts", async () => {
    if (!redisAvailable) {
      logger.warn("SKIPPED: Redis not available");
      pending();
      return;
    }

    const identifier = `rate-limit-${Date.now()}@integration.test`;
    trackKeys(identifier);

    await otpService.generateOtp(identifier);

    // Make maxAttempts (3) wrong attempts
    const attempt1 = await otpService.verifyOtp(identifier, "111111");
    expect(attempt1).toBe(false);

    const attempt2 = await otpService.verifyOtp(identifier, "222222");
    expect(attempt2).toBe(false);

    const attempt3 = await otpService.verifyOtp(identifier, "333333");
    expect(attempt3).toBe(false);

    // 4th attempt should trigger cooldown and throw BadRequestException
    await expect(otpService.verifyOtp(identifier, "444444")).rejects.toThrow(
      BadRequestException,
    );
  });

  it("should throw BadRequestException when generating OTP during cooldown", async () => {
    if (!redisAvailable) {
      logger.warn("SKIPPED: Redis not available");
      pending();
      return;
    }

    const identifier = `cooldown-gen-${Date.now()}@integration.test`;
    trackKeys(identifier);

    // Manually set a cooldown in Redis
    await redisService.setex(`otp_cooldown:${identifier}`, 5, "1");

    await expect(otpService.generateOtp(identifier)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("should reset attempt counter when a new OTP is generated", async () => {
    if (!redisAvailable) {
      logger.warn("SKIPPED: Redis not available");
      pending();
      return;
    }

    const identifier = `reset-attempts-${Date.now()}@integration.test`;
    trackKeys(identifier);

    // Generate first OTP
    await otpService.generateOtp(identifier);

    // Make 2 wrong attempts (less than max)
    await otpService.verifyOtp(identifier, "111111");
    await otpService.verifyOtp(identifier, "222222");

    // Verify attempts key exists
    const attemptsBeforeReset = await redisService.get(
      `otp_attempts:${identifier}`,
    );
    expect(attemptsBeforeReset).not.toBeNull();

    // Generate new OTP — should reset attempts
    const { otp: newOtp } = await otpService.generateOtp(identifier);

    // Attempts key should have been deleted
    const attemptsAfterReset = await redisService.get(
      `otp_attempts:${identifier}`,
    );
    expect(attemptsAfterReset).toBeNull();

    // Should be able to verify the new OTP successfully
    const isValid = await otpService.verifyOtp(identifier, newOtp);
    expect(isValid).toBe(true);
  });
});
