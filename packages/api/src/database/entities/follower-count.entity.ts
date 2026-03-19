import { Entity, PrimaryColumn, Column, UpdateDateColumn } from "typeorm";

/**
 * FollowerCountEntity stores denormalized follower/following counts per account.
 *
 * Updated via application logic whenever the social graph changes (follow/unfollow).
 * Provides O(1) count lookups instead of scanning the follows table.
 */
@Entity("follower_counts")
export class FollowerCountEntity {
  @PrimaryColumn("varchar", { length: 20 })
  accountId!: string;

  @Column({ type: "int", default: 0 })
  followerCount!: number;

  @Column({ type: "int", default: 0 })
  followingCount!: number;

  @UpdateDateColumn({ type: "timestamp with time zone" })
  updatedAt!: Date;
}
