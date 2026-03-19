import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

/**
 * Notification entity — stores persistent notifications for users.
 *
 * Notifications are created by system events (new messages, payments, follows,
 * KYC approvals) and delivered in real-time via WebSocket. They are stored in
 * PostgreSQL for offline retrieval and read tracking.
 *
 * Indexes are designed for the most common queries:
 * - Get unread notifications for a user (recipientAccountId + isRead)
 * - Get notifications by category (recipientAccountId + category)
 * - Get recent notifications (recipientAccountId + createdAt)
 * - Get unread notifications sorted by time (recipientAccountId + isRead + createdAt)
 */
@Entity("notifications")
@Index(["recipientAccountId", "isRead"])
@Index(["recipientAccountId", "category"])
@Index(["recipientAccountId", "createdAt"])
@Index(["recipientAccountId", "isRead", "createdAt"])
export class NotificationEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /**
   * Hedera account ID of the notification recipient (e.g., "0.0.12345").
   */
  @Column({ type: "varchar", length: 20 })
  recipientAccountId!: string;

  /**
   * Notification category: message, payment, social, system.
   */
  @Column({ type: "varchar", length: 20 })
  category!: string;

  /**
   * Specific event type within the category (e.g., "new_message", "payment_received").
   */
  @Column({ type: "varchar", length: 50 })
  event!: string;

  /**
   * Hedera account ID of who triggered the notification (nullable for system events).
   */
  @Column({ type: "varchar", length: 20, nullable: true })
  fromAccountId!: string | null;

  /**
   * Related HCS topic ID (e.g., conversation topic for message notifications).
   */
  @Column({ type: "varchar", length: 20, nullable: true })
  topicId!: string | null;

  /**
   * Short preview text shown in the notification list.
   */
  @Column({ type: "text", nullable: true })
  preview!: string | null;

  /**
   * Additional structured data for the notification (JSON).
   * Contains event-specific metadata (amount, currency, sender name, etc.).
   */
  @Column({ type: "jsonb", nullable: true })
  data!: Record<string, unknown> | null;

  /**
   * Whether the notification has been read by the recipient.
   */
  @Column({ type: "boolean", default: false })
  isRead!: boolean;

  /**
   * HCS message sequence number for audit trail (optional).
   * Set when the notification is also submitted to an HCS topic for immutable proof.
   */
  @Column({ type: "varchar", length: 50, nullable: true })
  hcsSequenceNumber!: string | null;

  /**
   * Timestamp when the notification was marked as read.
   */
  @Column({ type: "timestamptz", nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
