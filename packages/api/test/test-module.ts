/**
 * NestJS TestingModule factory for integration tests.
 *
 * Creates REAL NestJS modules with REAL database and Redis connections.
 * Nothing is mocked — this is a full integration test environment.
 *
 * Usage:
 *   const moduleFixture = await createIntegrationTestingModule([AuthModule]);
 *   const [app, dataSource] = await createTestApp(moduleFixture);
 */
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, Type, DynamicModule } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { DataSource } from "typeorm";

/**
 * Create a real NestJS TestingModule for integration tests.
 * Modules will connect to real PostgreSQL, not mocked services.
 *
 * @param imports - Array of NestJS modules to include in the test module
 * @returns Compiled TestingModule ready for use
 */
export async function createIntegrationTestingModule(
  imports: Array<Type<unknown> | DynamicModule> = [],
): Promise<TestingModule> {
  const testModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        // In tests, env vars are set by test/setup.ts
        // No envFilePath needed — process.env is already configured
      }),
      TypeOrmModule.forRoot({
        type: "postgres",
        host: process.env.DB_HOST || "localhost",
        port: parseInt(process.env.DB_PORT || "5433", 10),
        username: process.env.DB_USERNAME || "test",
        password: process.env.DB_PASSWORD || "test",
        database: process.env.DB_DATABASE || "hedera_social_test",
        entities: ["src/database/entities/**/*.ts"],
        synchronize: true, // Auto-sync schema in test environment
        logging: false,
        autoLoadEntities: true,
      }),
      ...imports,
    ],
  }).compile();

  return testModule;
}

/**
 * Create and launch a test NestJS application.
 * Returns the app instance and the TypeORM DataSource for test cleanup.
 *
 * @param testingModule - Compiled TestingModule from createIntegrationTestingModule
 * @returns Tuple of [app, dataSource]
 */
export async function createTestApp(
  testingModule: TestingModule,
): Promise<[INestApplication, DataSource]> {
  const app = testingModule.createNestApplication();
  await app.init();

  const dataSource = testingModule.get(DataSource);
  return [app, dataSource];
}
