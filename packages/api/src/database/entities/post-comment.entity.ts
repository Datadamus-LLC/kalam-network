import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Index,
} from "typeorm";

/**
 * PostCommentEntity — stores comments on posts.
 *
 * Comments are indexed locally; the source of truth is the
 * HCS post feed topic where the comment event is recorded.
 */
@Entity("post_comments")
@Index("idx_comments_post", ["postId", "createdAt"])
@Index("idx_comments_author", ["authorAccountId"])
export class PostCommentEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** UUID of the post being commented on (references posts_index.id). */
  @Column({ type: "uuid" })
  postId!: string;

  /** Hedera account ID of the commenter. */
  @Column({ type: "varchar", length: 20 })
  authorAccountId!: string;

  /** Comment text content. */
  @Column({ type: "text" })
  contentText!: string;

  /** HCS topic ID where the comment event was submitted. */
  @Column({ type: "varchar", length: 20, nullable: true })
  hcsTopicId!: string | null;

  /** HCS sequence number for the comment event. */
  @Column({ type: "bigint", nullable: true })
  hcsSequenceNumber!: number | null;

  @CreateDateColumn({ type: "timestamp with time zone" })
  createdAt!: Date;

  @DeleteDateColumn({ type: "timestamp with time zone", nullable: true })
  deletedAt!: Date | null;
}
