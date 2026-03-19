/**
 * Auth Integration Tests
 *
 * Tests the complete register -> verify-otp -> refresh flow
 * against REAL PostgreSQL and Redis instances.
 *
 * Prerequisites:
 *   - PostgreSQL running on localhost:5432 with database 'hedera_social'
 *   - Redis running on localhost:6379
 *   - Environment variables: JWT_SECRET, JWT_REFRESH_SECRET
 *
 * Run: pnpm test:docker:up && pnpm test:integration
 *
 * NO mocks, NO jest.fn(), NO jest.mock() — per project rules.
 * NO silent skipping — if services are down, the suite is skipped explicitly.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe, Logger } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import request from "supertest";
import Redis from "ioredis";
import { Client } from "pg";
import { AuthModule } from "../auth.module";
import { RedisModule } from "../../redis/redis.module";
import { RedisService } from "../../redis/redis.service";
import { UserEntity } from "../../../database/entities/user.entity";
import configuration from "../../../config/configuration";

const logger = new Logger("AuthIntegrationTest");

/**
 * Check if PostgreSQL is reachable.
 */
async function isPostgresAvailable(): Promise<boolean> {
  const client = new Client({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    user: process.env.DB_USERNAME || "hedera_social",
    password: process.env.DB_PASSWORD || "devpassword",
    database: process.env.DB_DATABASE || "hedera_social",
    connectionTimeoutMillis: 3000,
  });

  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Redis is reachable.
 */
async function isRedisAvailable(): Promise<boolean> {
  const redis = new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    connectTimeout: 3000,
    lazyConnect: true,
  });

  try {
    await redis.connect();
    await redis.ping();
    await redis.quit();
    return true;
  } catch {
    try {
      await redis.quit();
    } catch (quitErr: unknown) {
      // Redis quit can fail if connection already dropped — log for visibility
      const msg = quitErr instanceof Error ? quitErr.message : String(quitErr);
      logger.warn(`Redis quit failed during cleanup: ${msg}`);
    }
    return false;
  }
}

// Pre-flight: check infrastructure BEFORE defining tests.
// If services aren't running, the entire suite is marked as skipped — not fake-passed.
const infrastructureReady = (async () => {
  const pg = await isPostgresAvailable();
  const rd = await isRedisAvailable();
  if (!pg)
    logger.warn(
      "PostgreSQL not available — auth integration tests will be SKIPPED",
    );
  if (!rd)
    logger.warn("Redis not available — auth integration tests will be SKIPPED");
  return pg && rd;
})();

let ready = false;
beforeAll(async () => {
  ready = await infrastructureReady;
});

describe("Auth Integration — register -> verify-otp -> refresh", () => {
  let app: INestApplication;
  let redisService: RedisService;

  beforeAll(async () => {
    if (!ready) return;

    // Ensure required env vars for JWT
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET =
        "test-jwt-secret-minimum-256-bits-long-for-security";
    }
    if (!process.env.JWT_REFRESH_SECRET) {
      process.env.JWT_REFRESH_SECRET =
        "test-jwt-refresh-secret-minimum-256-bits-long-for-security";
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [configuration],
        }),
        TypeOrmModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => ({
            type: "postgres" as const,
            host: configService.get<string>("database.host"),
            port: configService.get<number>("database.port"),
            username: configService.get<string>("database.username"),
            password: configService.get<string>("database.password"),
            database: configService.get<string>("database.database"),
            entities: [UserEntity],
            synchronize: true, // auto-create tables for test
            logging: false,
          }),
        }),
        RedisModule,
        AuthModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    redisService = moduleFixture.get<RedisService>(RedisService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  /**
   * Helper to get the OTP from Redis for a given identifier.
   * In production this would be sent via SMS/email; in tests we read Redis directly.
   */
  async function getOtpFromRedis(identifier: string): Promise<string | null> {
    return redisService.get(`otp:${identifier}`);
  }

  it("should complete the full register -> verify-otp -> refresh flow with email", async () => {
    if (!ready) {
      logger.warn("SKIPPED: infrastructure not available");
      pending();
      return;
    }

    const testEmail = `test-${Date.now()}@integration.test`;

    // Step 1: Register
    const registerResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: testEmail })
      .expect(201);

    expect(registerResponse.body).toHaveProperty("success", true);
    expect(registerResponse.body.data).toHaveProperty("registrationId");
    expect(registerResponse.body.data).toHaveProperty("otpSent", true);
    expect(registerResponse.body.data).toHaveProperty("expiresAt");

    const { registrationId } = registerResponse.body.data;
    expect(typeof registrationId).toBe("string");

    // Step 2: Read OTP from Redis (real Redis, not mocked)
    const otp = await getOtpFromRedis(testEmail);
    expect(otp).toBeTruthy();
    expect(otp).toHaveLength(6);

    // Step 3: Verify OTP
    const verifyResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/verify-otp")
      .send({ email: testEmail, otp })
      .expect(200);

    expect(verifyResponse.body).toHaveProperty("success", true);
    expect(verifyResponse.body.data).toHaveProperty("accessToken");
    expect(verifyResponse.body.data).toHaveProperty("refreshToken");
    expect(verifyResponse.body.data).toHaveProperty("status", "pending_wallet");
    expect(verifyResponse.body.data).toHaveProperty("identifier", testEmail);

    const { accessToken, refreshToken } = verifyResponse.body.data;
    expect(typeof accessToken).toBe("string");
    expect(typeof refreshToken).toBe("string");

    // Step 4: Refresh token
    const refreshResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken })
      .expect(200);

    expect(refreshResponse.body).toHaveProperty("success", true);
    expect(refreshResponse.body.data).toHaveProperty("accessToken");
    expect(typeof refreshResponse.body.data.accessToken).toBe("string");
    // Verify the refreshed token is a valid JWT (3-part base64 structure)
    expect(refreshResponse.body.data.accessToken.split(".")).toHaveLength(3);
  });

  it("should complete the full register -> verify-otp flow with phone", async () => {
    if (!ready) {
      pending();
      return;
    }

    const testPhone = `+97150${Date.now().toString().slice(-7)}`;

    // Step 1: Register with phone
    const registerResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ phone: testPhone })
      .expect(201);

    expect(registerResponse.body).toHaveProperty("success", true);
    expect(registerResponse.body.data).toHaveProperty("registrationId");
    expect(registerResponse.body.data.otpSent).toBe(true);

    // Step 2: Read OTP from Redis
    const otp = await getOtpFromRedis(testPhone);
    expect(otp).toBeTruthy();

    // Step 3: Verify OTP
    const verifyResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/verify-otp")
      .send({ phone: testPhone, otp })
      .expect(200);

    expect(verifyResponse.body).toHaveProperty("success", true);
    expect(verifyResponse.body.data).toHaveProperty("accessToken");
    expect(verifyResponse.body.data).toHaveProperty("refreshToken");
    expect(verifyResponse.body.data.identifier).toBe(testPhone);
  });

  it("should reject registration without email or phone", async () => {
    if (!ready) {
      pending();
      return;
    }

    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({})
      .expect(400);
  });

  it("should reject duplicate registration", async () => {
    if (!ready) {
      pending();
      return;
    }

    const testEmail = `dup-${Date.now()}@integration.test`;

    // First registration succeeds
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: testEmail })
      .expect(201);

    // Second registration with same email fails
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: testEmail })
      .expect(409);
  });

  it("should reject invalid OTP", async () => {
    if (!ready) {
      pending();
      return;
    }

    const testEmail = `invalid-otp-${Date.now()}@integration.test`;

    // Register
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: testEmail })
      .expect(201);

    // Verify with wrong OTP
    await request(app.getHttpServer())
      .post("/api/v1/auth/verify-otp")
      .send({ email: testEmail, otp: "000000" })
      .expect(401);
  });

  it("should reject refresh with invalid token", async () => {
    if (!ready) {
      pending();
      return;
    }

    await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: "invalid.token.here" })
      .expect(401);
  });
});
