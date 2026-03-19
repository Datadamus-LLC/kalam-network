import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from "typeorm";

@Entity("posts_index")
@Index("idx_posts_author", ["authorAccountId", "consensusTimestamp"])
@Index("idx_posts_timestamp", ["consensusTimestamp"])
export class PostIndexEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 20 })
  authorAccountId!: string;

  @Column({ type: "varchar", length: 20 })
  hcsTopicId!: string;

  @Column({ type: "bigint" })
  sequenceNumber!: number;

  @Column({ type: "timestamp with time zone" })
  consensusTimestamp!: Date;

  @Column({ type: "text", nullable: true })
  contentText!: string;

  @Column({ type: "boolean", default: false })
  hasMedia!: boolean;

  @Column({ type: "jsonb", nullable: true })
  mediaRefs!: string[]; // Array of IPFS CIDs

  @CreateDateColumn({ type: "timestamp with time zone" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamp with time zone" })
  updatedAt!: Date;

  @DeleteDateColumn({ type: "timestamp with time zone", nullable: true })
  deletedAt!: Date | null;
}
