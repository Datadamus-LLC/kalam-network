import { Entity, PrimaryColumn, Column, Index, Unique } from "typeorm";

@Entity("messages_index")
@Unique("uq_messages_topic_seq", ["hcsTopicId", "sequenceNumber"])
@Index("idx_messages_topic_seq", ["hcsTopicId", "sequenceNumber"])
@Index("idx_messages_sender", ["senderAccountId"])
@Index("idx_messages_timestamp", ["consensusTimestamp"])
export class MessageIndexEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 20 })
  hcsTopicId!: string;

  @Column({ type: "bigint" })
  sequenceNumber!: number;

  @Column({ type: "timestamp with time zone" })
  consensusTimestamp!: Date;

  @Column({ type: "varchar", length: 20 })
  senderAccountId!: string;

  @Column({ type: "varchar", length: 20 })
  messageType!:
    | "message"
    | "payment"
    | "payment_request"
    | "payment_split"
    | "system";

  @Column({ type: "bytea", nullable: true })
  encryptedPreview!: Buffer | null; // Client-encrypted preview (optional, set by sender for push notifications)

  @Column({ type: "text", nullable: true })
  plaintextContent!: string | null; // Stored plaintext for search indexing and conversation sync

  @Column({ type: "boolean", default: false })
  hasMedia!: boolean;
}
