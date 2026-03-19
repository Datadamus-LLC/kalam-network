/**
 * Real PostgreSQL connection helper for integration tests.
 *
 * Provides test isolation via transactions: each test starts a transaction
 * in beforeEach() and rolls it back in afterEach(), so tests never leave
 * stale data behind.
 *
 * IMPORTANT: This connects to a REAL PostgreSQL database. No mocking.
 * Start the test database before running: `docker compose -f docker-compose.test.yml up -d`
 */
import { DataSource, QueryRunner, EntityTarget, ObjectLiteral } from "typeorm";
import { Logger } from "@nestjs/common";
import { TestNotInitializedException } from "./exceptions";

const logger = new Logger("TestDatabase");

let dataSource: DataSource | null = null;

/**
 * Build a TypeORM DataSource config for the test database.
 * Reads from environment variables set in test/setup.ts.
 */
function getTestDataSourceConfig() {
  return {
    type: "postgres" as const,
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5433", 10),
    username: process.env.DB_USERNAME || "test",
    password: process.env.DB_PASSWORD || "test",
    database: process.env.DB_DATABASE || "hedera_social_test",
    entities: ["src/database/entities/**/*.ts"],
    migrations: ["src/database/migrations/**/*.ts"],
    synchronize: true, // Auto-sync schema in test environment
    logging: false,
  };
}

/**
 * Initialize real PostgreSQL connection for test suite.
 * Call in beforeAll() of your test file.
 */
export async function initializeTestDatabase(): Promise<DataSource> {
  if (dataSource?.isInitialized) {
    return dataSource;
  }

  const config = getTestDataSourceConfig();
  dataSource = new DataSource(config);

  try {
    await dataSource.initialize();
    logger.log("Connected to test database");

    return dataSource;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to initialize test database: ${message}`);
    throw error;
  }
}

/**
 * Close database connection and cleanup.
 * Call in afterAll() of your test file.
 */
export async function closeTestDatabase(): Promise<void> {
  if (dataSource?.isInitialized) {
    await dataSource.destroy();
    dataSource = null;
    logger.log("Test database connection closed");
  }
}

/**
 * Get active test database connection.
 * Throws if not initialized — call initializeTestDatabase() first.
 */
export function getTestDataSource(): DataSource {
  if (!dataSource?.isInitialized) {
    throw new TestNotInitializedException(
      "Test database",
      "initializeTestDatabase()",
    );
  }
  return dataSource;
}

/**
 * Start a transaction for test isolation.
 * Call in beforeEach(), then rollbackTestTransaction() in afterEach().
 */
export async function startTestTransaction(): Promise<QueryRunner> {
  const db = getTestDataSource();
  const queryRunner = db.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  return queryRunner;
}

/**
 * Rollback test transaction to restore database to pre-test state.
 * Call in afterEach().
 */
export async function rollbackTestTransaction(
  queryRunner: QueryRunner,
): Promise<void> {
  try {
    if (queryRunner.isTransactionActive) {
      await queryRunner.rollbackTransaction();
    }
  } finally {
    await queryRunner.release();
  }
}

/**
 * Get a repository scoped to a test transaction.
 * Use this instead of dataSource.getRepository() in tests to ensure
 * all operations are within the test transaction.
 */
export function getTestRepository<T extends ObjectLiteral>(
  entity: EntityTarget<T>,
  queryRunner: QueryRunner,
) {
  return queryRunner.manager.getRepository(entity);
}

/**
 * Truncate all tables in the test database.
 * Use this for full cleanup between test suites if transaction rollback
 * is not sufficient (e.g., for tests that commit transactions).
 */
export async function truncateAllTables(): Promise<void> {
  const db = getTestDataSource();
  const entities = db.entityMetadatas;

  for (const entity of entities) {
    const repository = db.getRepository(entity.name);
    await repository.query(`TRUNCATE TABLE "${entity.tableName}" CASCADE`);
  }

  logger.log(`Truncated ${entities.length} tables`);
}
