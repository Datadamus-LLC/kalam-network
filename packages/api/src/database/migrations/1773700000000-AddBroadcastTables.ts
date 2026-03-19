import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBroadcastTables1773700000000 implements MigrationInterface {
  name = "AddBroadcastTables1773700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "broadcast_messages" (
        "id" uuid NOT NULL,
        "organizationId" uuid NOT NULL,
        "authorAccountId" varchar(20) NOT NULL,
        "hcsTopicId" varchar(20) NOT NULL,
        "sequenceNumber" bigint NOT NULL,
        "consensusTimestamp" TIMESTAMP WITH TIME ZONE NOT NULL,
        "contentText" text NOT NULL,
        "hasMedia" boolean NOT NULL DEFAULT false,
        "mediaRefs" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_broadcast_messages" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_broadcast_org"
        ON "broadcast_messages" ("organizationId", "consensusTimestamp")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_broadcast_topic"
        ON "broadcast_messages" ("hcsTopicId", "sequenceNumber")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "broadcast_subscriptions" (
        "subscriberAccountId" varchar(20) NOT NULL,
        "organizationId" uuid NOT NULL,
        "broadcastTopicId" varchar(20),
        "subscribedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_broadcast_subscriptions"
          PRIMARY KEY ("subscriberAccountId", "organizationId")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_broadcast_sub_org"
        ON "broadcast_subscriptions" ("organizationId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "broadcast_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "broadcast_subscriptions"`);
  }
}
