import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsername1773900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(30) UNIQUE;
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_users_username;
      ALTER TABLE users DROP COLUMN IF EXISTS username;
    `);
  }
}
