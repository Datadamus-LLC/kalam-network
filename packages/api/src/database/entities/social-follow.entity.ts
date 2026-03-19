import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

@Entity("social_follows")
@Index("idx_follows_following", ["followingAccountId"])
export class SocialFollowEntity {
  @PrimaryColumn("varchar", { length: 20 })
  followerAccountId!: string;

  @PrimaryColumn("varchar", { length: 20 })
  followingAccountId!: string;

  @Column({ type: "bigint", nullable: true })
  hcsSequenceNumber!: number; // HCS sequence number of follow event

  @CreateDateColumn({ type: "timestamp with time zone" })
  createdAt!: Date;
}
