/**
 * Database Connection — Integration Tests
 *
 * Verifies that the test database helpers connect to a REAL PostgreSQL instance.
 * Requires docker-compose.test.yml to be running.
 *
 * Run: docker compose -f docker-compose.test.yml up -d
 * Then: pnpm --filter @hedera-social/api test -- --testPathPattern=database.integration
 */
import {
  initializeTestDatabase,
  closeTestDatabase,
  getTestDataSource,
  startTestTransaction,
  rollbackTestTransaction,
} from "./database";

describe("Test Database Helpers (Integration)", () => {
  beforeAll(async () => {
    await initializeTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("should connect to real PostgreSQL", () => {
    const dataSource = getTestDataSource();
    expect(dataSource.isInitialized).toBe(true);
    expect(dataSource.driver.isReplicated).toBe(false);
  });

  it("should execute a real query", async () => {
    const dataSource = getTestDataSource();
    const result = await dataSource.query("SELECT 1 as value");
    expect(result).toEqual([{ value: 1 }]);
  });

  it("should provide transaction isolation", async () => {
    const queryRunner = await startTestTransaction();

    try {
      // Execute a query within the transaction
      const result = await queryRunner.query("SELECT current_database() as db");
      expect(result[0].db).toBe("hedera_social_test");
    } finally {
      await rollbackTestTransaction(queryRunner);
    }
  });

  it("should have the test database name", async () => {
    const dataSource = getTestDataSource();
    const result = await dataSource.query("SELECT current_database() as db");
    expect(result[0].db).toBe("hedera_social_test");
  });
});
