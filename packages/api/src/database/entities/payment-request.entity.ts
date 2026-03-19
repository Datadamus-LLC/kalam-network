import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { UserEntity } from "./user.entity";
import { OrganizationEntity } from "./organization.entity";
import { ConversationEntity } from "./conversation.entity";

@Entity("payment_requests")
@Index("idx_payment_requests_requester", ["requesterUserId", "createdAt"])
@Index("idx_payment_requests_status", ["status"])
@Index("idx_payment_requests_conversation", ["conversationId"])
export class PaymentRequestEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  requesterUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "requester_user_id" })
  requester!: UserEntity;

  @Column({ type: "uuid", nullable: true })
  organizationId!: string; // NULL if personal context

  @ManyToOne(() => OrganizationEntity, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "organization_id" })
  organization!: OrganizationEntity;

  @Column({ type: "uuid", nullable: true })
  conversationId!: string;

  @ManyToOne(() => ConversationEntity, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "conversation_id" })
  conversation!: ConversationEntity;

  @Column({ type: "varchar", length: 20 })
  hcsTopicId!: string;

  @Column({ type: "bigint", nullable: true })
  hcsSequenceNumber!: number;

  @Column({ type: "decimal", precision: 18, scale: 8 })
  amount!: number;

  @Column({ type: "varchar", length: 10, default: "HBAR" })
  currency!: string;

  @Column({ type: "text", nullable: true })
  description!: string;

  @Column({ type: "varchar", length: 20, default: "pending" })
  status!: "pending" | "paid" | "expired" | "declined" | "cancelled";

  @Column({ type: "varchar", length: 64, nullable: true })
  paidTxId!: string; // Hedera tx ID when paid

  @Column({ type: "timestamp with time zone", nullable: true })
  paidAt!: Date;

  @Column({ type: "timestamp with time zone" })
  expiresAt!: Date;

  @CreateDateColumn({ type: "timestamp with time zone" })
  createdAt!: Date;
}
