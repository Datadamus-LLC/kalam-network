import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from "typeorm";

@Entity("conversations")
@Index("idx_conversations_topic", ["hcsTopicId"])
@Index("idx_conversations_last_msg", ["lastMessageAt"])
export class ConversationEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 20, unique: true })
  hcsTopicId!: string; // HCS Topic ID

  @Column({ type: "varchar", length: 10 })
  conversationType!: "direct" | "group";

  @Column({ type: "varchar", length: 128, nullable: true })
  groupName!: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  groupAvatarCid!: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  adminAccountId!: string | null; // Group admin (for groups)

  @Column({ type: "varchar", length: 20 })
  createdBy!: string; // Hedera Account ID

  @CreateDateColumn({ type: "timestamp with time zone" })
  createdAt!: Date;

  @Column({ type: "timestamp with time zone", nullable: true })
  lastMessageAt!: Date | null;

  @Column({ type: "bigint", default: 0 })
  lastMessageSeq!: number;

  // --- Encryption fields (T14) ---

  @Column({ type: "text", nullable: true })
  encryptedKeysJson!: string | null; // JSON: { "0.0.ACCOUNT": "base64(encrypted_key)" }

  @Column({ type: "uuid", nullable: true })
  currentKeyId!: string | null; // UUID of the current symmetric key version

  @UpdateDateColumn({ type: "timestamp with time zone" })
  updatedAt!: Date;

  @DeleteDateColumn({ type: "timestamp with time zone", nullable: true })
  deletedAt!: Date | null;
}
