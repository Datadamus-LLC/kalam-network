import { Entity, PrimaryColumn, Column, CreateDateColumn } from "typeorm";

@Entity("platform_topics")
export class PlatformTopicEntity {
  @PrimaryColumn("varchar", { length: 50 })
  topicName!: string; // "social_graph" | "kyc_attestations" | "platform_announcements"

  @Column({ type: "varchar", length: 20, unique: true })
  hcsTopicId!: string;

  @Column({ type: "bigint", default: 0 })
  lastSequence!: number;

  @CreateDateColumn({ type: "timestamp with time zone" })
  createdAt!: Date;
}
