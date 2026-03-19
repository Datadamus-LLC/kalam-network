import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPostLikes1773500000000 implements MigrationInterface {
  name = "AddPostLikes1773500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "post_likes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "postId" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_post_likes" PRIMARY KEY ("id"),
        CONSTRAINT "uq_post_likes_user_post" UNIQUE ("userId", "postId")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_post_likes_post" ON "post_likes" ("postId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "post_likes"`);
  }
}
