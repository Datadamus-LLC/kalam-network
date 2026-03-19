import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

/**
 * Tracks user subscriptions to organization broadcast channels.
 * Composite PK on (subscriberAccountId, organizationId) prevents duplicates.
 */
@Entity("broadcast_subscriptions")
@Index("idx_broadcast_sub_org", ["organizationId"])
export class BroadcastSubscriptionEntity {
  @PrimaryColumn("varchar", { length: 20 })
  subscriberAccountId!: string;

  @PrimaryColumn("uuid")
  organizationId!: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  broadcastTopicId!: string | null;

  @CreateDateColumn({ type: "timestamp with time zone" })
  subscribedAt!: Date;
}
