import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from "typeorm";

/**
 * FeedItemEntity represents a fan-out entry in a user's home feed.
 *
 * When a post is created, a FeedItemEntity is inserted for each follower
 * of the author, enabling efficient home feed queries without needing
 * to join through the social graph at read time.
 */
@Entity("feed_items")
@Index("idx_feed_items_owner_timestamp", [
  "ownerAccountId",
  "consensusTimestamp",
])
@Index("idx_feed_items_post", ["postId"])
export class FeedItemEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** The account that should see this post in their feed */
  @Column({ type: "varchar", length: 20 })
  ownerAccountId!: string;

  /** Reference to the PostIndexEntity.id */
  @Column({ type: "uuid" })
  postId!: string;

  /** Author of the post (denormalized for efficient querying) */
  @Column({ type: "varchar", length: 20 })
  authorAccountId!: string;

  /** Consensus timestamp from HCS (denormalized for sorting) */
  @Column({ type: "timestamp with time zone" })
  consensusTimestamp!: Date;

  @CreateDateColumn({ type: "timestamp with time zone" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamp with time zone" })
  updatedAt!: Date;

  @DeleteDateColumn({ type: "timestamp with time zone", nullable: true })
  deletedAt!: Date | null;
}
