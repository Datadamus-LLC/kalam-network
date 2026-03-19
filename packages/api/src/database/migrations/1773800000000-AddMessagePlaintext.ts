import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMessagePlaintext1773800000000 implements MigrationInterface {
  name = "AddMessagePlaintext1773800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "messages_index"
      ADD COLUMN IF NOT EXISTS "plaintextContent" text NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "messages_index"
      DROP COLUMN IF EXISTS "plaintextContent"
    `);
  }
}
