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
import { PaymentRequestEntity } from "./payment-request.entity";

@Entity("transactions")
@Index("idx_transactions_user", ["userId", "createdAt"])
@Index("idx_transactions_org", ["organizationId", "createdAt"])
@Index("idx_transactions_hedera", ["hederaTxId"])
@Index("idx_transactions_status", ["status"])
@Index("idx_transactions_counterparty", ["counterpartyId", "createdAt"])
export class TransactionEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Column({ type: "uuid", nullable: true })
  organizationId!: string; // NULL if personal context

  @ManyToOne(() => OrganizationEntity, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "organization_id" })
  organization!: OrganizationEntity;

  @Column({ type: "uuid" })
  counterpartyId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "counterparty_id" })
  counterparty!: UserEntity;

  @Column({ type: "uuid", nullable: true })
  conversationId!: string;

  @ManyToOne(() => ConversationEntity, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "conversation_id" })
  conversation!: ConversationEntity;

  @Column({ type: "varchar", length: 10 })
  direction!: "sent" | "received";

  @Column({ type: "decimal", precision: 18, scale: 8 })
  amount!: number;

  @Column({ type: "varchar", length: 10, default: "HBAR" })
  currency!: string;

  @Column({ type: "varchar", length: 20 })
  status!: "pending" | "completed" | "failed";

  @Column({ type: "text", nullable: true })
  description!: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  hederaTxId!: string; // Hedera transaction ID

  @Column({ type: "bigint", nullable: true })
  hcsMessageSeq!: number; // HCS sequence number (on-chain proof)

  @Column({ type: "varchar", length: 128, nullable: true })
  tamamTxRef!: string; // Tamam Custody reference

  @Column({ type: "uuid", nullable: true })
  paymentRequestId!: string; // links to payment request if applicable

  @ManyToOne(() => PaymentRequestEntity, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "payment_request_id" })
  paymentRequest!: PaymentRequestEntity;

  @Column({ type: "varchar", length: 20 })
  paymentType!: "send" | "request_fulfillment" | "split_payment";

  @CreateDateColumn({ type: "timestamp with time zone" })
  createdAt!: Date;

  @Column({ type: "timestamp with time zone", nullable: true })
  completedAt!: Date;
}
