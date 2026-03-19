import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
  Index,
} from "typeorm";

@Entity("post_likes")
@Unique("uq_post_likes_user_post", ["userId", "postId"])
@Index("idx_post_likes_post", ["postId"])
export class PostLikeEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  userId!: string;

  @Column({ type: "uuid" })
  postId!: string;

  @CreateDateColumn({ type: "timestamp with time zone" })
  createdAt!: Date;
}
