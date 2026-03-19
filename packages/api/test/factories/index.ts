/**
 * Test data factories.
 *
 * All factories create REAL database records in PostgreSQL.
 * No mocking, no faking — actual rows in a real database.
 *
 * Add new factory exports here as entities are implemented.
 */
export {
  createTestUser,
  createTestUsers,
  type CreateTestUserOptions,
  type TestUser,
} from "./user.factory";

export {
  createTestNotification,
  type CreateTestNotificationOptions,
  type TestNotification,
} from "./notification.factory";
