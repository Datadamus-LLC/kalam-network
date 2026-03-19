import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from "typeorm";

/**
 * Indexes broadcast messages posted to organization HCS broadcast topics.
 * Each row corresponds to one HCS message on the org's broadcastTopicId.
 */
@Entity("broadcast_messages")
@Index("idx_broadcast_org", ["organizationId", "consensusTimestamp"])
@Index("idx_broadcast_topic", ["hcsTopicId", "sequenceNumber"])
export class BroadcastMessageEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  organizationId!: string;

  @Column({ type: "varchar", length: 20 })
  authorAccountId!: string;

  @Column({ type: "varchar", length: 20 })
  hcsTopicId!: string;

  @Column({ type: "bigint" })
  sequenceNumber!: number;

  @Column({ type: "timestamp with time zone" })
  consensusTimestamp!: Date;

  @Column({ type: "text" })
  contentText!: string;

  @Column({ type: "boolean", default: false })
  hasMedia!: boolean;

  @Column({ type: "jsonb", nullable: true })
  mediaRefs!: string[] | null;

  @CreateDateColumn({ type: "timestamp with time zone" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamp with time zone" })
  updatedAt!: Date;

  @DeleteDateColumn({ type: "timestamp with time zone", nullable: true })
  deletedAt!: Date | null;
}
