import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPostComments1773600000000 implements MigrationInterface {
  name = "AddPostComments1773600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "post_comments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "postId" uuid NOT NULL,
        "authorAccountId" varchar(20) NOT NULL,
        "contentText" text NOT NULL,
        "hcsTopicId" varchar(20),
        "hcsSequenceNumber" bigint,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_post_comments" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_comments_post" ON "post_comments" ("postId", "createdAt")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_comments_author" ON "post_comments" ("authorAccountId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "post_comments"`);
  }
}
