/**
 * Integration tests for JwtAuthGuard (common/guards/jwt-auth.guard.ts).
 *
 * These tests spin up a real NestJS application with a test controller
 * protected by JwtAuthGuard, then make real HTTP requests with supertest.
 *
 * NO MOCKS. NO FAKES. NO STUBS.
 *
 * Requirements:
 *   - No external infrastructure (pure in-process NestJS + JWT)
 */

import { Test, TestingModule } from "@nestjs/testing";
import {
  Controller,
  Get,
  INestApplication,
  UseGuards,
  Logger,
  createParamDecorator,
  ExecutionContext,
} from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Request } from "express";
import request from "supertest";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import type { JwtPayload } from "../../../common/guards/jwt-auth.guard";

const logger = new Logger("JwtAuthGuardIntegrationTest");

/**
 * Test-only secret. Safe: never leaves this test file.
 * Must be at least 32 characters to match env.validation.ts schema.
 */
const TEST_JWT_SECRET =
  "integration-test-jwt-secret-key-that-is-at-least-32-chars";

/**
 * A different secret used to sign tokens that should NOT be accepted.
 */
const WRONG_JWT_SECRET =
  "wrong-secret-key-that-is-totally-different-and-at-least-32-chars";

/**
 * Inline param decorator to extract user from request.
 * Avoids importing the full CurrentUser decorator and its dependencies.
 * MUST be defined before any class that references it via decorators.
 */
const GetUserFromRequest = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<Request & { user: JwtPayload }>();
    return req.user;
  },
);

/**
 * A minimal controller used only in these tests.
 * Protected by JwtAuthGuard. Returns the decoded user from the request.
 */
@Controller("test")
class TestProtectedController {
  @Get("protected")
  @UseGuards(JwtAuthGuard)
  getProtected(@GetUserFromRequest() user: JwtPayload): {
    success: boolean;
    data: JwtPayload;
  } {
    return { success: true, data: user };
  }

  @Get("open")
  getOpen(): { success: boolean; message: string } {
    return { success: true, message: "open endpoint" };
  }
}

describe("JwtAuthGuard Integration Tests", () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    try {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            // Provide config values directly (no .env file needed for these tests)
            load: [
              () => ({
                jwt: {
                  secret: TEST_JWT_SECRET,
                  expiresIn: "24h",
                },
              }),
            ],
          }),
          JwtModule.registerAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
              secret: configService.get<string>("jwt.secret"),
              signOptions: {
                expiresIn: configService.get<string>("jwt.expiresIn", "24h"),
              },
            }),
          }),
        ],
        controllers: [TestProtectedController],
        providers: [JwtAuthGuard],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      jwtService = moduleRef.get<JwtService>(JwtService);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize test app: ${message}`);
      throw error;
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // -------------------------------------------------------------------------
  // Helper: sign a real JWT with the test secret
  // -------------------------------------------------------------------------

  function signToken(
    payload: Partial<JwtPayload>,
    options?: { expiresIn?: string; secret?: string },
  ): string {
    const fullPayload: Omit<JwtPayload, "iat" | "exp"> = {
      sub: payload.sub ?? "test-user-uuid",
      hederaAccountId: payload.hederaAccountId ?? "0.0.12345",
      identifier: payload.identifier ?? "test@example.com",
    };

    return jwtService.sign(fullPayload, {
      secret: options?.secret ?? TEST_JWT_SECRET,
      expiresIn: options?.expiresIn ?? "1h",
    });
  }

  // -------------------------------------------------------------------------
  // Tests
  // -------------------------------------------------------------------------

  it("should allow access with a valid JWT token", async () => {
    const token = signToken({
      sub: "user-uuid-001",
      hederaAccountId: "0.0.54321",
      identifier: "alice@example.com",
    });

    const response = await request(app.getHttpServer())
      .get("/test/protected")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.sub).toBe("user-uuid-001");
    expect(response.body.data.hederaAccountId).toBe("0.0.54321");
    expect(response.body.data.identifier).toBe("alice@example.com");
    // iat and exp should be present in the decoded payload
    expect(typeof response.body.data.iat).toBe("number");
    expect(typeof response.body.data.exp).toBe("number");
  });

  it("should return 401 when Authorization header is missing", async () => {
    const response = await request(app.getHttpServer())
      .get("/test/protected")
      .expect(401);

    expect(response.body.message).toBeDefined();
    // Check the error structure from the guard
    const errorBody = response.body.message ?? response.body;
    expect(errorBody).toBeDefined();
  });

  it("should return 401 for a malformed token", async () => {
    const response = await request(app.getHttpServer())
      .get("/test/protected")
      .set("Authorization", "Bearer not-a-valid-jwt-token")
      .expect(401);

    expect(response.body).toBeDefined();
  });

  it("should return 401 for an expired token", async () => {
    // Sign a token that expires immediately (0 seconds)
    const token = signToken({ sub: "expired-user" }, { expiresIn: "0s" });

    // Small wait to ensure the token is actually expired
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        resolve();
      }, 100);
      // Prevent timer from keeping the process alive
      if (typeof timer === "object" && "unref" in timer) {
        timer.unref();
      }
    });

    const response = await request(app.getHttpServer())
      .get("/test/protected")
      .set("Authorization", `Bearer ${token}`)
      .expect(401);

    expect(response.body).toBeDefined();
  });

  it("should return 401 for a token signed with a wrong secret", async () => {
    // Create a separate JwtService with the wrong secret to sign the token
    const wrongJwt = new JwtService({ secret: WRONG_JWT_SECRET });
    const token = wrongJwt.sign(
      {
        sub: "attacker-uuid",
        hederaAccountId: "0.0.99999",
        identifier: "attacker@evil.com",
      },
      { expiresIn: "1h" },
    );

    const response = await request(app.getHttpServer())
      .get("/test/protected")
      .set("Authorization", `Bearer ${token}`)
      .expect(401);

    expect(response.body).toBeDefined();
  });

  it("should return 401 when Authorization header uses non-Bearer scheme", async () => {
    const token = signToken({ sub: "basic-user" });

    const response = await request(app.getHttpServer())
      .get("/test/protected")
      .set("Authorization", `Basic ${token}`)
      .expect(401);

    expect(response.body).toBeDefined();
  });

  it("should return 401 when Authorization header has Bearer but no token", async () => {
    const response = await request(app.getHttpServer())
      .get("/test/protected")
      .set("Authorization", "Bearer ")
      .expect(401);

    expect(response.body).toBeDefined();
  });

  it("should attach the full JWT payload to request.user", async () => {
    const token = signToken({
      sub: "full-payload-user",
      hederaAccountId: "0.0.77777",
      identifier: "full@test.com",
    });

    const response = await request(app.getHttpServer())
      .get("/test/protected")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const userData = response.body.data;
    expect(userData.sub).toBe("full-payload-user");
    expect(userData.hederaAccountId).toBe("0.0.77777");
    expect(userData.identifier).toBe("full@test.com");
    expect(userData.iat).toBeDefined();
    expect(userData.exp).toBeDefined();
    // exp should be in the future
    expect(userData.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("should allow access to unprotected endpoints without a token", async () => {
    const response = await request(app.getHttpServer())
      .get("/test/open")
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe("open endpoint");
  });

  it("should return 401 for a token with empty string", async () => {
    const response = await request(app.getHttpServer())
      .get("/test/protected")
      .set("Authorization", "Bearer")
      .expect(401);

    expect(response.body).toBeDefined();
  });
});
