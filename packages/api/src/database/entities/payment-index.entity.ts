import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

@Entity("payments_index")
@Index("idx_payments_sender", ["senderAccountId", "createdAt"])
@Index("idx_payments_recipient", ["recipientAccountId", "createdAt"])
export class PaymentIndexEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 20 })
  senderAccountId!: string;

  @Column({ type: "varchar", length: 20 })
  recipientAccountId!: string;

  @Column({ type: "decimal", precision: 18, scale: 8 })
  amount!: number;

  @Column({ type: "varchar", length: 10 })
  currency!: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  htsTransactionId!: string; // Hedera transaction ID

  @Column({ type: "varchar", length: 20, nullable: true })
  hcsTopicId!: string; // Conversation where payment was made

  @Column({ type: "bigint", nullable: true })
  hcsSequenceNumber!: number;

  @Column({ type: "varchar", length: 20 })
  paymentType!: "send" | "request_fulfillment" | "split_payment";

  @Column({ type: "varchar", length: 100, nullable: true })
  tamamReference!: string;

  @Column({ type: "varchar", length: 20 })
  status!: "confirmed" | "failed";

  @CreateDateColumn({ type: "timestamp with time zone" })
  createdAt!: Date;
}
