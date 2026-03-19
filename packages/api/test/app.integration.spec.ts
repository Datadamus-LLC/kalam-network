/**
 * App Controller — Integration Tests
 *
 * Tests the health check and root endpoints against a REAL NestJS application.
 * No mocking — this boots a real NestJS app and makes real HTTP requests.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppController } from "../src/app.controller";
import { AppService } from "../src/app.service";

describe("AppController (Integration)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /", () => {
    it("should return welcome message in standard envelope", async () => {
      const response = await request(app.getHttpServer()).get("/");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.name).toBe("Hedera Social API");
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe("GET /health", () => {
    it("should return health status in standard envelope with real timestamp", async () => {
      const before = new Date().toISOString();
      const response = await request(app.getHttpServer()).get("/health");
      const after = new Date().toISOString();

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe("ok");

      // Verify timestamp is a real ISO string within the test window
      expect(response.body.timestamp).toBeDefined();
      const timestamp = response.body.timestamp as string;
      expect(timestamp >= before).toBe(true);
      expect(timestamp <= after).toBe(true);
    });
  });
});
