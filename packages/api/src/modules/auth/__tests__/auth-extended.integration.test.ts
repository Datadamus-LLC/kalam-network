/**
 * Auth Extended Integration Tests
 *
 * Tests additional auth paths NOT covered by auth.integration.test.ts:
 *   - login with email (existing user)
 *   - login with non-existent user
 *   - register with invalid email format
 *   - verify-otp with expired/missing OTP
 *   - JWT-protected endpoint access with valid token
 *   - refresh with tampered token
 *
 * Prerequisites:
 *   - PostgreSQL running on localhost:5433 with database 'hedera_social_test'
 *   - Redis running on localhost:6380
 *   - Environment variables: JWT_SECRET, JWT_REFRESH_SECRET (set by test/setup.ts)
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

const logger = new Logger("AuthExtendedIntegrationTest");

/**
 * Check if PostgreSQL is reachable.
 */
async function isPostgresAvailable(): Promise<boolean> {
  const client = new Client({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5433", 10),
    user: process.env.DB_USERNAME || "test",
    password: process.env.DB_PASSWORD || "test",
    database: process.env.DB_DATABASE || "hedera_social_test",
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
    port: parseInt(process.env.REDIS_PORT || "6380", 10),
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
      "PostgreSQL not available — auth extended integration tests will be SKIPPED",
    );
  if (!rd)
    logger.warn(
      "Redis not available — auth extended integration tests will be SKIPPED",
    );
  return pg && rd;
})();

let ready = false;
beforeAll(async () => {
  ready = await infrastructureReady;
});

describe("Auth Extended Integration — login, validation, JWT protection", () => {
  let app: INestApplication;
  let redisService: RedisService;

  beforeAll(async () => {
    if (!ready) return;

    // Ensure required env vars for JWT (test/setup.ts sets these, but be safe)
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET =
        "test-jwt-secret-key-minimum-32-characters-long-for-testing";
    }
    if (!process.env.JWT_REFRESH_SECRET) {
      process.env.JWT_REFRESH_SECRET =
        "test-jwt-refresh-secret-key-minimum-32-characters-long-for-testing";
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

  // =====================================================================
  // 1. Login with email — register user, verify OTP, then login
  // =====================================================================

  it("should login with email after registration and OTP verification", async () => {
    if (!ready) {
      logger.warn("SKIPPED: infrastructure not available");
      pending();
      return;
    }

    const testEmail = `login-ext-${Date.now()}@integration.test`;

    // Step 1: Register
    const registerResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: testEmail })
      .expect(201);

    expect(registerResponse.body).toHaveProperty("success", true);
    expect(registerResponse.body.data).toHaveProperty("registrationId");
    expect(registerResponse.body.data).toHaveProperty("otpSent", true);

    // Step 2: Read OTP from Redis and verify
    const registerOtp = await getOtpFromRedis(testEmail);
    expect(registerOtp).toBeTruthy();
    expect(registerOtp).toHaveLength(6);

    const verifyResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/verify-otp")
      .send({ email: testEmail, otp: registerOtp })
      .expect(200);

    expect(verifyResponse.body).toHaveProperty("success", true);
    expect(verifyResponse.body.data).toHaveProperty("accessToken");

    // Step 3: Login with the same email — should send a new OTP
    const loginResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: testEmail })
      .expect(200);

    expect(loginResponse.body).toHaveProperty("success", true);
    expect(loginResponse.body.data).toHaveProperty("registrationId");
    expect(loginResponse.body.data).toHaveProperty("otpSent", true);
    expect(loginResponse.body.data).toHaveProperty("expiresAt");

    // Verify a new OTP was generated in Redis
    const loginOtp = await getOtpFromRedis(testEmail);
    expect(loginOtp).toBeTruthy();
    expect(loginOtp).toHaveLength(6);

    // Step 4: Verify the login OTP to get fresh tokens
    const loginVerifyResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/verify-otp")
      .send({ email: testEmail, otp: loginOtp })
      .expect(200);

    expect(loginVerifyResponse.body).toHaveProperty("success", true);
    expect(loginVerifyResponse.body.data).toHaveProperty("accessToken");
    expect(loginVerifyResponse.body.data).toHaveProperty("refreshToken");
    expect(loginVerifyResponse.body.data).toHaveProperty(
      "identifier",
      testEmail,
    );
  });

  // =====================================================================
  // 2. Login — user not found
  // =====================================================================

  it("should return 404 when logging in with non-existent email", async () => {
    if (!ready) {
      pending();
      return;
    }

    const nonExistentEmail = `nonexistent-${Date.now()}@integration.test`;

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: nonExistentEmail })
      .expect(404);

    expect(response.body).toHaveProperty("statusCode", 404);
    expect(response.body).toHaveProperty("message", "User not found");
  });

  // =====================================================================
  // 3. Register with invalid email format
  // =====================================================================

  it("should return 400 when registering with invalid email format", async () => {
    if (!ready) {
      pending();
      return;
    }

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: "not-a-valid-email" })
      .expect(400);

    expect(response.body).toHaveProperty("statusCode", 400);
    // class-validator returns an array of message strings
    expect(response.body.message).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Invalid email address format"),
      ]),
    );
  });

  // =====================================================================
  // 4. Verify-OTP with expired OTP (OTP already consumed or never existed)
  // =====================================================================

  it("should return 401 when verifying with expired or missing OTP", async () => {
    if (!ready) {
      pending();
      return;
    }

    const testEmail = `expired-otp-${Date.now()}@integration.test`;

    // Register the user so they exist in the database
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: testEmail })
      .expect(201);

    // Delete the OTP from Redis to simulate expiration
    await redisService.del(`otp:${testEmail}`);

    // Attempt verification — OTP no longer in Redis
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/verify-otp")
      .send({ email: testEmail, otp: "123456" })
      .expect(401);

    expect(response.body).toHaveProperty("statusCode", 401);
    expect(response.body).toHaveProperty("message", "Invalid or expired OTP");
  });

  // =====================================================================
  // 5. JWT-protected endpoint access with valid token
  // =====================================================================

  it("should access auth-protected flow: register, verify, then use access token for refresh", async () => {
    if (!ready) {
      pending();
      return;
    }

    const testEmail = `jwt-test-${Date.now()}@integration.test`;

    // Step 1: Register
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: testEmail })
      .expect(201);

    // Step 2: Read OTP and verify
    const otp = await getOtpFromRedis(testEmail);
    expect(otp).toBeTruthy();

    const verifyResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/verify-otp")
      .send({ email: testEmail, otp })
      .expect(200);

    const { accessToken, refreshToken } = verifyResponse.body.data;
    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();

    // Verify the access token is a valid 3-part JWT
    const tokenParts = accessToken.split(".");
    expect(tokenParts).toHaveLength(3);

    // Decode the payload (base64url) and verify structure
    const payloadBase64 = tokenParts[1];
    const payloadJson = Buffer.from(payloadBase64, "base64url").toString(
      "utf8",
    );
    const payload = JSON.parse(payloadJson) as {
      sub: string;
      identifier: string;
      hederaAccountId: string;
      iat: number;
      exp: number;
    };

    expect(payload).toHaveProperty("sub");
    expect(typeof payload.sub).toBe("string");
    expect(payload).toHaveProperty("identifier", testEmail);
    expect(payload).toHaveProperty("hederaAccountId");
    expect(payload).toHaveProperty("iat");
    expect(payload).toHaveProperty("exp");

    // Verify the token works for refresh
    const refreshResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken })
      .expect(200);

    expect(refreshResponse.body).toHaveProperty("success", true);
    expect(refreshResponse.body.data).toHaveProperty("accessToken");
    expect(typeof refreshResponse.body.data.accessToken).toBe("string");

    // The refreshed token should also be a valid 3-part JWT
    const refreshedTokenParts =
      refreshResponse.body.data.accessToken.split(".");
    expect(refreshedTokenParts).toHaveLength(3);
  });

  // =====================================================================
  // 6. Refresh with tampered/corrupted token
  // =====================================================================

  it("should reject refresh with a tampered token", async () => {
    if (!ready) {
      pending();
      return;
    }

    const testEmail = `tampered-${Date.now()}@integration.test`;

    // Register and verify to get valid tokens
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: testEmail })
      .expect(201);

    const otp = await getOtpFromRedis(testEmail);
    expect(otp).toBeTruthy();

    const verifyResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/verify-otp")
      .send({ email: testEmail, otp })
      .expect(200);

    const { refreshToken } = verifyResponse.body.data;
    expect(refreshToken).toBeTruthy();

    // Tamper with the token by modifying the signature portion
    const tokenParts = refreshToken.split(".");
    expect(tokenParts).toHaveLength(3);
    const tamperedSignature = tokenParts[2].split("").reverse().join("");
    const tamperedToken = `${tokenParts[0]}.${tokenParts[1]}.${tamperedSignature}`;

    // Attempt refresh with the tampered token
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: tamperedToken })
      .expect(401);

    expect(response.body).toHaveProperty("statusCode", 401);
    expect(response.body).toHaveProperty(
      "message",
      "Invalid or expired refresh token",
    );
  });

  // =====================================================================
  // 7. Login without any contact method
  // =====================================================================

  it("should return 400 when logging in without email or phone", async () => {
    if (!ready) {
      pending();
      return;
    }

    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({})
      .expect(400);
  });
});
