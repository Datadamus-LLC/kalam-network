/**
 * Factory for creating REAL user records in the test database.
 *
 * Creates actual database rows in PostgreSQL — not mocked data.
 * Use these factories in integration tests to set up test state.
 *
 * NOTE: The UserEntity must be defined in src/database/entities/user.entity.ts
 * before this factory can be used. If the entity does not exist yet,
 * tests importing this factory will fail at compile time (not silently).
 */
import { Repository } from "typeorm";
import { v4 as uuidv4 } from "uuid";

/**
 * Options for creating a test user.
 * All fields are optional — sensible defaults are generated.
 */
export interface CreateTestUserOptions {
  id?: string;
  email?: string | null;
  phone?: string | null;
  displayName?: string | null;
  hederaAccountId?: string | null;
  status?: string;
  accountType?: string;
}

/**
 * Minimal user shape for factory output.
 * Matches the core fields of UserEntity without importing it directly,
 * so the factory compiles even before the entity is scaffolded.
 */
export interface TestUser {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  hederaAccountId: string | null;
  status: string;
  accountType: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Generate a unique test email address.
 * Uses UUID prefix to guarantee uniqueness across test runs.
 */
function generateTestEmail(): string {
  const uniqueId = uuidv4().slice(0, 8);
  return `test-${uniqueId}@hedera-social-test.local`;
}

/**
 * Create a REAL user record in the test database.
 *
 * @param repository - TypeORM repository (scoped to test transaction if using isolation)
 * @param options - Override default field values
 * @returns The saved user entity from PostgreSQL
 */
export async function createTestUser<T extends TestUser>(
  repository: Repository<T>,
  options: CreateTestUserOptions = {},
): Promise<T> {
  const uniqueId = uuidv4().slice(0, 8);

  const userData: Record<string, unknown> = {
    id: options.id || uuidv4(),
    email: options.email !== undefined ? options.email : generateTestEmail(),
    phone: options.phone !== undefined ? options.phone : null,
    displayName:
      options.displayName !== undefined
        ? options.displayName
        : `Test User ${uniqueId}`,
    hederaAccountId:
      options.hederaAccountId !== undefined ? options.hederaAccountId : null,
    status: options.status || "registered",
    accountType: options.accountType || "individual",
  };

  const user = repository.create(userData as Partial<T>);
  return repository.save(user);
}

/**
 * Create multiple test users efficiently.
 *
 * @param repository - TypeORM repository
 * @param count - Number of users to create
 * @param baseOptions - Options applied to all users (email/phone auto-varied)
 * @returns Array of saved user entities
 */
export async function createTestUsers<T extends TestUser>(
  repository: Repository<T>,
  count: number,
  baseOptions: CreateTestUserOptions = {},
): Promise<T[]> {
  const users: T[] = [];
  for (let i = 0; i < count; i++) {
    const options: CreateTestUserOptions = {
      ...baseOptions,
      // Ensure unique emails for each user
      email: baseOptions.email ? `${baseOptions.email}-${i}` : undefined,
    };
    users.push(await createTestUser(repository, options));
  }
  return users;
}
