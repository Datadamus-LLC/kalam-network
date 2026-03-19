/**
 * Factory for creating REAL notification records in the test database.
 *
 * Creates actual database rows in PostgreSQL — not mocked data.
 *
 * NOTE: The NotificationEntity must be defined in
 * src/database/entities/notification.entity.ts before this factory can be used.
 */
import { Repository } from "typeorm";
import { v4 as uuidv4 } from "uuid";

/**
 * Options for creating a test notification.
 */
export interface CreateTestNotificationOptions {
  id?: string;
  recipientAccountId: string;
  category?: string;
  event?: string;
  fromAccountId?: string | null;
  topicId?: string | null;
  preview?: string | null;
  data?: Record<string, unknown> | null;
  isRead?: boolean;
}

/**
 * Minimal notification shape for factory output.
 */
export interface TestNotification {
  id: string;
  recipientAccountId: string;
  category: string;
  event: string;
  fromAccountId: string | null;
  topicId: string | null;
  preview: string | null;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a REAL notification record in the test database.
 *
 * @param repository - TypeORM repository
 * @param options - Notification options (recipientAccountId is required)
 * @returns The saved notification entity from PostgreSQL
 */
export async function createTestNotification<T extends TestNotification>(
  repository: Repository<T>,
  options: CreateTestNotificationOptions,
): Promise<T> {
  const notificationData: Record<string, unknown> = {
    id: options.id || uuidv4(),
    recipientAccountId: options.recipientAccountId,
    category: options.category || "system",
    event: options.event || "test_event",
    fromAccountId: options.fromAccountId ?? null,
    topicId: options.topicId ?? null,
    preview: options.preview ?? "Test notification preview",
    data: options.data ?? null,
    isRead: options.isRead ?? false,
  };

  const notification = repository.create(notificationData as Partial<T>);
  return repository.save(notification);
}
