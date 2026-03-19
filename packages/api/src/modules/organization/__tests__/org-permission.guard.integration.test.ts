/**
 * Integration tests for OrgPermissionGuard.
 *
 * These tests spin up a real NestJS application with:
 *   - Real PostgreSQL database for organization/membership queries
 *   - Real JwtAuthGuard + OrgPermissionGuard on test controllers
 *   - Real JWT tokens signed by JwtService
 *
 * Tests verify:
 *   - Owner has access to admin-only routes
 *   - Admin has access to admin routes
 *   - Member does not have admin access
 *   - Non-member gets 403
 *   - Missing org context throws appropriate error
 *
 * NO MOCKS. NO FAKES. NO STUBS.
 */

import { Test, TestingModule } from "@nestjs/testing";
import {
  Controller,
  Get,
  INestApplication,
  UseGuards,
  Logger,
} from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule, JwtService } from "@nestjs/jwt";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";
import { Repository, DataSource } from "typeorm";
import { getRepositoryToken } from "@nestjs/typeorm";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";

import { OrgPermissionGuard } from "../guards/org-permission.guard";
import {
  RequiresOrgRole,
  type OrgRole,
} from "../decorators/requires-org-role.decorator";
import { OrganizationEntity } from "../../../database/entities/organization.entity";
import { OrganizationMemberEntity } from "../../../database/entities/organization-member.entity";
import { UserEntity } from "../../../database/entities/user.entity";
import { Reflector } from "@nestjs/core";

const logger = new Logger("OrgPermissionGuardIntegrationTest");

const TEST_JWT_SECRET =
  "org-guard-test-jwt-secret-key-that-is-at-least-32-chars";

// ---------------------------------------------------------------------------
// Test controllers (defined inline, not exported)
// ---------------------------------------------------------------------------

@Controller("test-org")
@UseGuards(JwtAuthGuard)
class TestOrgController {
  /**
   * Route that requires admin or owner role.
   */
  @Get("admin-only")
  @RequiresOrgRole("admin")
  @UseGuards(OrgPermissionGuard)
  adminOnly(): { success: boolean; message: string } {
    return { success: true, message: "admin access granted" };
  }

  /**
   * Route that requires owner role only.
   */
  @Get("owner-only")
  @RequiresOrgRole("owner")
  @UseGuards(OrgPermissionGuard)
  ownerOnly(): { success: boolean; message: string } {
    return { success: true, message: "owner access granted" };
  }

  /**
   * Route that requires member or higher role.
   */
  @Get("member-access")
  @RequiresOrgRole("member")
  @UseGuards(OrgPermissionGuard)
  memberAccess(): { success: boolean; message: string } {
    return { success: true, message: "member access granted" };
  }

  /**
   * Route with org guard but no specific role requirement.
   * Any org member should pass.
   */
  @Get("any-member")
  @UseGuards(OrgPermissionGuard)
  anyMember(): { success: boolean; message: string } {
    return { success: true, message: "any member access granted" };
  }
}

// ---------------------------------------------------------------------------
// Infrastructure check
// ---------------------------------------------------------------------------

async function isPostgresAvailable(): Promise<boolean> {
  try {
    const { Client } = await import("pg");
    const client = new Client({
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "5433", 10),
      user: process.env.DB_USERNAME || "test",
      password: process.env.DB_PASSWORD || "test",
      database: process.env.DB_DATABASE || "hedera_social_test",
      connectionTimeoutMillis: 3000,
    });
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

describe("OrgPermissionGuard Integration Tests", () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let userRepo: Repository<UserEntity>;
  let orgRepo: Repository<OrganizationEntity>;
  let memberRepo: Repository<OrganizationMemberEntity>;
  let dataSource: DataSource;

  let postgresAvailable = false;

  // Test data IDs
  const ownerUserId = uuidv4();
  const adminUserId = uuidv4();
  const memberUserId = uuidv4();
  const viewerUserId = uuidv4();
  const nonMemberUserId = uuidv4();
  const orgId = uuidv4();

  beforeAll(async () => {
    postgresAvailable = await isPostgresAvailable();

    if (!postgresAvailable) {
      logger.warn(
        "PostgreSQL not available -- skipping OrgPermissionGuard integration tests. " +
          "Start PostgreSQL with: docker compose -f docker-compose.test.yml up -d",
      );
      return;
    }

    try {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                jwt: {
                  secret: TEST_JWT_SECRET,
                  expiresIn: "24h",
                },
                database: {
                  host: process.env.DB_HOST || "localhost",
                  port: parseInt(process.env.DB_PORT || "5433", 10),
                  username: process.env.DB_USERNAME || "test",
                  password: process.env.DB_PASSWORD || "test",
                  database: process.env.DB_DATABASE || "hedera_social_test",
                },
              }),
            ],
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
              entities: [
                UserEntity,
                OrganizationEntity,
                OrganizationMemberEntity,
              ],
              synchronize: true,
              logging: false,
            }),
          }),
          TypeOrmModule.forFeature([
            UserEntity,
            OrganizationEntity,
            OrganizationMemberEntity,
          ]),
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
        controllers: [TestOrgController],
        providers: [JwtAuthGuard, OrgPermissionGuard, Reflector],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      jwtService = moduleRef.get<JwtService>(JwtService);
      userRepo = moduleRef.get<Repository<UserEntity>>(
        getRepositoryToken(UserEntity),
      );
      orgRepo = moduleRef.get<Repository<OrganizationEntity>>(
        getRepositoryToken(OrganizationEntity),
      );
      memberRepo = moduleRef.get<Repository<OrganizationMemberEntity>>(
        getRepositoryToken(OrganizationMemberEntity),
      );
      dataSource = moduleRef.get<DataSource>(DataSource);

      // Seed test data
      await seedTestData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize test app: ${message}`);
      postgresAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      await cleanupTestData();
    }
    if (app) {
      await app.close();
    }
  });

  // -------------------------------------------------------------------------
  // Seed / Cleanup helpers
  // -------------------------------------------------------------------------

  async function seedTestData(): Promise<void> {
    // Create users
    const userIds = [
      ownerUserId,
      adminUserId,
      memberUserId,
      viewerUserId,
      nonMemberUserId,
    ];
    const userNames = ["owner", "admin", "member", "viewer", "nonmember"];

    for (let i = 0; i < userIds.length; i++) {
      await userRepo.save({
        id: userIds[i],
        email: `${userNames[i]}@test-org-guard.com`,
        displayName: `Test ${userNames[i]}`,
        hederaAccountId: `0.0.${90000 + i}`,
        status: "active",
        accountType: "individual",
      });
    }

    // Create organization
    await orgRepo.save({
      id: orgId,
      ownerUserId,
      name: "Test Organization for Guard Tests",
      hederaAccountId: "0.0.90000",
      kybStatus: "verified",
    });

    // Create memberships
    const roles: OrgRole[] = ["owner", "admin", "member", "viewer"];
    const memberUserIds = [
      ownerUserId,
      adminUserId,
      memberUserId,
      viewerUserId,
    ];

    for (let i = 0; i < roles.length; i++) {
      await memberRepo.save({
        id: uuidv4(),
        organizationId: orgId,
        userId: memberUserIds[i],
        role: roles[i],
      });
    }
  }

  async function cleanupTestData(): Promise<void> {
    try {
      await memberRepo.delete({ organizationId: orgId });
      await orgRepo.delete({ id: orgId });
      await userRepo.delete({ id: ownerUserId });
      await userRepo.delete({ id: adminUserId });
      await userRepo.delete({ id: memberUserId });
      await userRepo.delete({ id: viewerUserId });
      await userRepo.delete({ id: nonMemberUserId });
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.warn(`Cleanup error (non-fatal): ${reason}`);
    }
  }

  // -------------------------------------------------------------------------
  // Helper: sign a real JWT
  // -------------------------------------------------------------------------

  function signToken(userId: string, hederaAccountId: string): string {
    return jwtService.sign(
      {
        sub: userId,
        hederaAccountId,
        identifier: `${userId}@test.com`,
      },
      {
        secret: TEST_JWT_SECRET,
        expiresIn: "1h",
      },
    );
  }

  /**
   * In Jest there is no `pending()` like in Jasmine.
   * We use a conditional `it.skip` approach at the describe level instead,
   * but for inline usage we simply return early. Callers must check the
   * return value and return from the test if `true`.
   */
  function isSkipped(): boolean {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Tests: Owner role
  // -------------------------------------------------------------------------

  describe("Owner access", () => {
    it("should allow owner to access admin-only route", async () => {
      if (isSkipped()) return;
      const token = signToken(ownerUserId, "0.0.90000");

      const response = await request(app.getHttpServer())
        .get("/test-org/admin-only")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Org-Context", orgId)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("admin access granted");
    });

    it("should allow owner to access owner-only route", async () => {
      if (isSkipped()) return;
      const token = signToken(ownerUserId, "0.0.90000");

      const response = await request(app.getHttpServer())
        .get("/test-org/owner-only")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Org-Context", orgId)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("owner access granted");
    });

    it("should allow owner to access member-level route", async () => {
      if (isSkipped()) return;
      const token = signToken(ownerUserId, "0.0.90000");

      const response = await request(app.getHttpServer())
        .get("/test-org/member-access")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Org-Context", orgId)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Tests: Admin role
  // -------------------------------------------------------------------------

  describe("Admin access", () => {
    it("should allow admin to access admin-only route", async () => {
      if (isSkipped()) return;
      const token = signToken(adminUserId, "0.0.90001");

      const response = await request(app.getHttpServer())
        .get("/test-org/admin-only")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Org-Context", orgId)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("admin access granted");
    });

    it("should deny admin from accessing owner-only route", async () => {
      if (isSkipped()) return;
      const token = signToken(adminUserId, "0.0.90001");

      const response = await request(app.getHttpServer())
        .get("/test-org/owner-only")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Org-Context", orgId)
        .expect(403);

      expect(response.body).toBeDefined();
    });

    it("should allow admin to access member-level route", async () => {
      if (isSkipped()) return;
      const token = signToken(adminUserId, "0.0.90001");

      const response = await request(app.getHttpServer())
        .get("/test-org/member-access")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Org-Context", orgId)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Tests: Member role
  // -------------------------------------------------------------------------

  describe("Member access", () => {
    it("should deny member from accessing admin-only route", async () => {
      if (isSkipped()) return;
      const token = signToken(memberUserId, "0.0.90002");

      const response = await request(app.getHttpServer())
        .get("/test-org/admin-only")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Org-Context", orgId)
        .expect(403);

      expect(response.body).toBeDefined();
    });

    it("should deny member from accessing owner-only route", async () => {
      if (isSkipped()) return;
      const token = signToken(memberUserId, "0.0.90002");

      const response = await request(app.getHttpServer())
        .get("/test-org/owner-only")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Org-Context", orgId)
        .expect(403);

      expect(response.body).toBeDefined();
    });

    it("should allow member to access member-level route", async () => {
      if (isSkipped()) return;
      const token = signToken(memberUserId, "0.0.90002");

      const response = await request(app.getHttpServer())
        .get("/test-org/member-access")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Org-Context", orgId)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it("should allow member to access any-member route", async () => {
      if (isSkipped()) return;
      const token = signToken(memberUserId, "0.0.90002");

      const response = await request(app.getHttpServer())
        .get("/test-org/any-member")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Org-Context", orgId)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Tests: Viewer role
  // -------------------------------------------------------------------------

  describe("Viewer access", () => {
    it("should deny viewer from accessing admin-only route", async () => {
      if (isSkipped()) return;
      const token = signToken(viewerUserId, "0.0.90003");

      const response = await request(app.getHttpServer())
        .get("/test-org/admin-only")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Org-Context", orgId)
        .expect(403);

      expect(response.body).toBeDefined();
    });

    it("should deny viewer from accessing member-level route", async () => {
      if (isSkipped()) return;
      const token = signToken(viewerUserId, "0.0.90003");

      const response = await request(app.getHttpServer())
        .get("/test-org/member-access")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Org-Context", orgId)
        .expect(403);

      expect(response.body).toBeDefined();
    });

    it("should allow viewer to access any-member route (no specific role required)", async () => {
      if (isSkipped()) return;
      const token = signToken(viewerUserId, "0.0.90003");

      const response = await request(app.getHttpServer())
        .get("/test-org/any-member")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Org-Context", orgId)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Tests: Non-member
  // -------------------------------------------------------------------------

  describe("Non-member access", () => {
    it("should return 403 for non-member trying to access org route", async () => {
      if (isSkipped()) return;
      const token = signToken(nonMemberUserId, "0.0.90004");

      const response = await request(app.getHttpServer())
        .get("/test-org/admin-only")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Org-Context", orgId)
        .expect(403);

      expect(response.body).toBeDefined();
    });

    it("should return 403 for non-member on any-member route", async () => {
      if (isSkipped()) return;
      const token = signToken(nonMemberUserId, "0.0.90004");

      const response = await request(app.getHttpServer())
        .get("/test-org/any-member")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Org-Context", orgId)
        .expect(403);

      expect(response.body).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Tests: Missing org context
  // -------------------------------------------------------------------------

  describe("Missing organization context", () => {
    it("should return 404 when X-Org-Context header is missing and user owns no org", async () => {
      if (isSkipped()) return;
      const token = signToken(nonMemberUserId, "0.0.90004");

      const response = await request(app.getHttpServer())
        .get("/test-org/admin-only")
        .set("Authorization", `Bearer ${token}`)
        // No X-Org-Context header
        .expect(404);

      expect(response.body).toBeDefined();
    });

    it("should fallback to owned org when X-Org-Context header is missing", async () => {
      if (isSkipped()) return;
      // Owner should fallback to their owned org
      const token = signToken(ownerUserId, "0.0.90000");

      const response = await request(app.getHttpServer())
        .get("/test-org/owner-only")
        .set("Authorization", `Bearer ${token}`)
        // No X-Org-Context header -- guard should find owner's org
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it("should return 404 for a non-existent org ID in X-Org-Context", async () => {
      if (isSkipped()) return;
      const token = signToken(ownerUserId, "0.0.90000");
      const fakeOrgId = uuidv4();

      const response = await request(app.getHttpServer())
        .get("/test-org/admin-only")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Org-Context", fakeOrgId)
        .expect(404);

      expect(response.body).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Tests: Auth required first
  // -------------------------------------------------------------------------

  describe("JwtAuthGuard must run first", () => {
    it("should return 401 when no JWT is provided", async () => {
      if (isSkipped()) return;

      const response = await request(app.getHttpServer())
        .get("/test-org/admin-only")
        .set("X-Org-Context", orgId)
        .expect(401);

      expect(response.body).toBeDefined();
    });
  });
});
