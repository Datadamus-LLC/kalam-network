import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { ConversationEntity } from "./conversation.entity";

@Entity("conversation_members")
@Index("idx_conv_members_account", ["hederaAccountId"])
export class ConversationMemberEntity {
  @PrimaryColumn("uuid")
  conversationId!: string;

  @PrimaryColumn("varchar", { length: 20 })
  hederaAccountId!: string;

  @ManyToOne(() => ConversationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "conversationId" })
  conversation!: ConversationEntity;

  @Column({ type: "varchar", length: 10, default: "member" })
  role!: "admin" | "member";

  @CreateDateColumn({ type: "timestamp with time zone" })
  joinedAt!: Date;

  @Column({ type: "timestamp with time zone", nullable: true })
  leftAt!: Date | null;

  @Column({ type: "bigint", default: 0 })
  lastReadSeq!: number; // Last read message sequence

  @UpdateDateColumn({ type: "timestamp with time zone" })
  updatedAt!: Date;
}
