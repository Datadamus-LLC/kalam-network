import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1773351518729 implements MigrationInterface {
  name = "InitialSchema1773351518729";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(255), "phone" character varying(20), "displayName" character varying(100), "bio" text, "avatarUrl" character varying(500), "hederaAccountId" character varying(20), "publicKey" text, "encryptedPrivateKey" text, "keyId" character varying(100), "status" character varying(20) NOT NULL DEFAULT 'registered', "encryptionPublicKey" text, "publicFeedTopic" character varying(20), "avatarIpfsCid" character varying(100), "accountType" character varying(20) NOT NULL DEFAULT 'individual', "didNftSerial" bigint, "didNftMetadataCid" character varying(100), "kycLevel" character varying(20), "kycRequestId" character varying(255), "kycSubmittedAt" TIMESTAMP WITH TIME ZONE, "kycCompletedAt" TIMESTAMP WITH TIME ZONE, "notificationTopic" character varying(20), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_14f27fdda93f462f64ffcbf9f1c" UNIQUE ("hederaAccountId"), CONSTRAINT "UQ_d7fc9ebb7ad9b093f658af8c545" UNIQUE ("kycRequestId"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_31daa51074a24fcfcee3c4f08b" ON "users" ("displayName") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_14f27fdda93f462f64ffcbf9f1" ON "users" ("hederaAccountId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3676155292d72c67cd4e090514" ON "users" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d7fc9ebb7ad9b093f658af8c54" ON "users" ("kycRequestId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "business_profiles" ("userId" uuid NOT NULL, "companyName" character varying(128), "registrationNumber" character varying(64), "businessCategory" character varying(64), "kybLevel" character varying(20), "website" character varying(255), "businessHours" jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid, CONSTRAINT "PK_393d386c30e0691410b9b5f54b9" PRIMARY KEY ("userId"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "conversations" ("id" uuid NOT NULL, "hcsTopicId" character varying(20) NOT NULL, "conversationType" character varying(10) NOT NULL, "groupName" character varying(128), "groupAvatarCid" character varying(100), "adminAccountId" character varying(20), "createdBy" character varying(20) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "lastMessageAt" TIMESTAMP WITH TIME ZONE, "lastMessageSeq" bigint NOT NULL DEFAULT '0', "encryptedKeysJson" text, "currentKeyId" uuid, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_9fdd863967550f319634705f685" UNIQUE ("hcsTopicId"), CONSTRAINT "PK_ee34f4f7ced4ec8681f26bf04ef" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_conversations_last_msg" ON "conversations" ("lastMessageAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_conversations_topic" ON "conversations" ("hcsTopicId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "conversation_members" ("conversationId" uuid NOT NULL, "hederaAccountId" character varying(20) NOT NULL, "role" character varying(10) NOT NULL DEFAULT 'member', "joinedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "leftAt" TIMESTAMP WITH TIME ZONE, "lastReadSeq" bigint NOT NULL DEFAULT '0', "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f9350df7b861e424187d5565e6d" PRIMARY KEY ("conversationId", "hederaAccountId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_conv_members_account" ON "conversation_members" ("hederaAccountId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "messages_index" ("id" uuid NOT NULL, "hcsTopicId" character varying(20) NOT NULL, "sequenceNumber" bigint NOT NULL, "consensusTimestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "senderAccountId" character varying(20) NOT NULL, "messageType" character varying(20) NOT NULL, "encryptedPreview" bytea, "hasMedia" boolean NOT NULL DEFAULT false, CONSTRAINT "uq_messages_topic_seq" UNIQUE ("hcsTopicId", "sequenceNumber"), CONSTRAINT "PK_294048fd5edcd3c611e8bc663c5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_messages_timestamp" ON "messages_index" ("consensusTimestamp") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_messages_sender" ON "messages_index" ("senderAccountId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_messages_topic_seq" ON "messages_index" ("hcsTopicId", "sequenceNumber") `,
    );
    await queryRunner.query(
      `CREATE TABLE "social_follows" ("followerAccountId" character varying(20) NOT NULL, "followingAccountId" character varying(20) NOT NULL, "hcsSequenceNumber" bigint, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f1836acd3fc0e70f6c903b93cf0" PRIMARY KEY ("followerAccountId", "followingAccountId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_follows_following" ON "social_follows" ("followingAccountId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "posts_index" ("id" uuid NOT NULL, "authorAccountId" character varying(20) NOT NULL, "hcsTopicId" character varying(20) NOT NULL, "sequenceNumber" bigint NOT NULL, "consensusTimestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "contentText" text, "hasMedia" boolean NOT NULL DEFAULT false, "mediaRefs" jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_be885d1e18953b94c0ec7510ab8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_posts_timestamp" ON "posts_index" ("consensusTimestamp") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_posts_author" ON "posts_index" ("authorAccountId", "consensusTimestamp") `,
    );
    await queryRunner.query(
      `CREATE TABLE "payments_index" ("id" uuid NOT NULL, "senderAccountId" character varying(20) NOT NULL, "recipientAccountId" character varying(20) NOT NULL, "amount" numeric(18,8) NOT NULL, "currency" character varying(10) NOT NULL, "htsTransactionId" character varying(50), "hcsTopicId" character varying(20), "hcsSequenceNumber" bigint, "paymentType" character varying(20) NOT NULL, "tamamReference" character varying(100), "status" character varying(20) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6c81c09c91507f35cf7d70f1db2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_payments_recipient" ON "payments_index" ("recipientAccountId", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_payments_sender" ON "payments_index" ("senderAccountId", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "platform_topics" ("topicName" character varying(50) NOT NULL, "hcsTopicId" character varying(20) NOT NULL, "lastSequence" bigint NOT NULL DEFAULT '0', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_7b4b0d180e0494a5cb1c436fae7" UNIQUE ("hcsTopicId"), CONSTRAINT "PK_2a7c820ab06f871adfe61f0347e" PRIMARY KEY ("topicName"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "organizations" ("id" uuid NOT NULL, "ownerUserId" uuid NOT NULL, "name" character varying(128) NOT NULL, "hederaAccountId" character varying(20) NOT NULL, "didNftSerial" bigint, "broadcastTopicId" character varying(20), "logoCid" character varying(128), "bio" character varying(256), "category" character varying(64), "website" character varying(256), "businessHours" jsonb, "kybStatus" character varying(20) NOT NULL, "kybVerifiedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "owner_user_id" uuid, CONSTRAINT "PK_6b031fcd0863e3f6b44230163f9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_organizations_hedera" ON "organizations" ("hederaAccountId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_organizations_owner" ON "organizations" ("ownerUserId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "organization_members" ("id" uuid NOT NULL, "organizationId" uuid NOT NULL, "userId" uuid NOT NULL, "role" character varying(20) NOT NULL, "invitedBy" uuid, "joinedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid, "user_id" uuid, "invited_by" uuid, CONSTRAINT "uq_org_members_org_user" UNIQUE ("organizationId", "userId"), CONSTRAINT "PK_c2b39d5d072886a4d9c8105eb9a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_org_members_org" ON "organization_members" ("organizationId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_org_members_user" ON "organization_members" ("userId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "organization_invitations" ("id" uuid NOT NULL, "organizationId" uuid NOT NULL, "email" character varying(256) NOT NULL, "role" character varying(20) NOT NULL DEFAULT 'member', "invitedBy" uuid NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'pending', "token" character varying(128) NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid, "invited_by" uuid, CONSTRAINT "UQ_7dfa5b36a9305efc5b7e9f369a3" UNIQUE ("token"), CONSTRAINT "PK_f172f12b8a9ee6584b661f57e24" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_org_invitations_email" ON "organization_invitations" ("email") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_org_invitations_token" ON "organization_invitations" ("token") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_org_invitations_org" ON "organization_invitations" ("organizationId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "payment_requests" ("id" uuid NOT NULL, "requesterUserId" uuid NOT NULL, "organizationId" uuid, "conversationId" uuid, "hcsTopicId" character varying(20) NOT NULL, "hcsSequenceNumber" bigint, "amount" numeric(18,8) NOT NULL, "currency" character varying(10) NOT NULL DEFAULT 'HBAR', "description" text, "status" character varying(20) NOT NULL DEFAULT 'pending', "paidTxId" character varying(64), "paidAt" TIMESTAMP WITH TIME ZONE, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "requester_user_id" uuid, "organization_id" uuid, "conversation_id" uuid, CONSTRAINT "PK_9299e570c6d9babbe54752e16ec" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_payment_requests_conversation" ON "payment_requests" ("conversationId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_payment_requests_status" ON "payment_requests" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_payment_requests_requester" ON "payment_requests" ("requesterUserId", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "transactions" ("id" uuid NOT NULL, "userId" uuid NOT NULL, "organizationId" uuid, "counterpartyId" uuid NOT NULL, "conversationId" uuid, "direction" character varying(10) NOT NULL, "amount" numeric(18,8) NOT NULL, "currency" character varying(10) NOT NULL DEFAULT 'HBAR', "status" character varying(20) NOT NULL, "description" text, "hederaTxId" character varying(64), "hcsMessageSeq" bigint, "tamamTxRef" character varying(128), "paymentRequestId" uuid, "paymentType" character varying(20) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "completedAt" TIMESTAMP WITH TIME ZONE, "user_id" uuid, "organization_id" uuid, "counterparty_id" uuid, "conversation_id" uuid, "payment_request_id" uuid, CONSTRAINT "PK_a219afd8dd77ed80f5a862f1db9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_transactions_counterparty" ON "transactions" ("counterpartyId", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_transactions_status" ON "transactions" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_transactions_hedera" ON "transactions" ("hederaTxId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_transactions_org" ON "transactions" ("organizationId", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_transactions_user" ON "transactions" ("userId", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "feed_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ownerAccountId" character varying(20) NOT NULL, "postId" uuid NOT NULL, "authorAccountId" character varying(20) NOT NULL, "consensusTimestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_9a33f003d604fbe4060d75c7be2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_feed_items_post" ON "feed_items" ("postId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_feed_items_owner_timestamp" ON "feed_items" ("ownerAccountId", "consensusTimestamp") `,
    );
    await queryRunner.query(
      `CREATE TABLE "follower_counts" ("accountId" character varying(20) NOT NULL, "followerCount" integer NOT NULL DEFAULT '0', "followingCount" integer NOT NULL DEFAULT '0', "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_90fd3aa8a37904e961a52400c9e" PRIMARY KEY ("accountId"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "recipientAccountId" character varying(20) NOT NULL, "category" character varying(20) NOT NULL, "event" character varying(50) NOT NULL, "fromAccountId" character varying(20), "topicId" character varying(20), "preview" text, "data" jsonb, "isRead" boolean NOT NULL DEFAULT false, "hcsSequenceNumber" character varying(50), "readAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_412f08e2b5a77b2201da56dc94" ON "notifications" ("recipientAccountId", "isRead", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b5453bd66b227b88092f0ab961" ON "notifications" ("recipientAccountId", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a0ba663aa6d1a8254ab003d2a6" ON "notifications" ("recipientAccountId", "category") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_28f3f61c5d0831eb90d30e5b0b" ON "notifications" ("recipientAccountId", "isRead") `,
    );
    await queryRunner.query(
      `ALTER TABLE "business_profiles" ADD CONSTRAINT "FK_1ceee77c549695cfc7c246224ef" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversation_members" ADD CONSTRAINT "FK_9a23e356db3cedb8d9725d01d1a" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD CONSTRAINT "FK_a8afaf18799fd187cbe8e998dcd" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_members" ADD CONSTRAINT "FK_7062a4fbd9bab22ffd918e5d3d9" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_members" ADD CONSTRAINT "FK_89bde91f78d36ca41e9515d91c6" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_members" ADD CONSTRAINT "FK_78252b40612aaddc2138eadc810" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_invitations" ADD CONSTRAINT "FK_7f88954e8d667a76ae3ced6f446" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_invitations" ADD CONSTRAINT "FK_8ab435d962010401bc62c8d9e38" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_requests" ADD CONSTRAINT "FK_a9daf7b32d8369d95825dcdbcb3" FOREIGN KEY ("requester_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_requests" ADD CONSTRAINT "FK_f330e18c337a9719837c1ab67c1" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_requests" ADD CONSTRAINT "FK_7f21d0032d382e9f9d858dca1fc" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_e9acc6efa76de013e8c1553ed2b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_245f73843f5949d161ea0c3ca13" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_2f0edec92769f8a3dd09274af86" FOREIGN KEY ("counterparty_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_ac234753e8725368e64387d0516" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_0da74fd072f27a5ef464f79977a" FOREIGN KEY ("payment_request_id") REFERENCES "payment_requests"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_0da74fd072f27a5ef464f79977a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_ac234753e8725368e64387d0516"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_2f0edec92769f8a3dd09274af86"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_245f73843f5949d161ea0c3ca13"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_e9acc6efa76de013e8c1553ed2b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_requests" DROP CONSTRAINT "FK_7f21d0032d382e9f9d858dca1fc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_requests" DROP CONSTRAINT "FK_f330e18c337a9719837c1ab67c1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_requests" DROP CONSTRAINT "FK_a9daf7b32d8369d95825dcdbcb3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_invitations" DROP CONSTRAINT "FK_8ab435d962010401bc62c8d9e38"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_invitations" DROP CONSTRAINT "FK_7f88954e8d667a76ae3ced6f446"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_members" DROP CONSTRAINT "FK_78252b40612aaddc2138eadc810"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_members" DROP CONSTRAINT "FK_89bde91f78d36ca41e9515d91c6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_members" DROP CONSTRAINT "FK_7062a4fbd9bab22ffd918e5d3d9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP CONSTRAINT "FK_a8afaf18799fd187cbe8e998dcd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversation_members" DROP CONSTRAINT "FK_9a23e356db3cedb8d9725d01d1a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "business_profiles" DROP CONSTRAINT "FK_1ceee77c549695cfc7c246224ef"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_28f3f61c5d0831eb90d30e5b0b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a0ba663aa6d1a8254ab003d2a6"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b5453bd66b227b88092f0ab961"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_412f08e2b5a77b2201da56dc94"`,
    );
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP TABLE "follower_counts"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_feed_items_owner_timestamp"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_feed_items_post"`);
    await queryRunner.query(`DROP TABLE "feed_items"`);
    await queryRunner.query(`DROP INDEX "public"."idx_transactions_user"`);
    await queryRunner.query(`DROP INDEX "public"."idx_transactions_org"`);
    await queryRunner.query(`DROP INDEX "public"."idx_transactions_hedera"`);
    await queryRunner.query(`DROP INDEX "public"."idx_transactions_status"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_transactions_counterparty"`,
    );
    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_payment_requests_requester"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_payment_requests_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_payment_requests_conversation"`,
    );
    await queryRunner.query(`DROP TABLE "payment_requests"`);
    await queryRunner.query(`DROP INDEX "public"."idx_org_invitations_org"`);
    await queryRunner.query(`DROP INDEX "public"."idx_org_invitations_token"`);
    await queryRunner.query(`DROP INDEX "public"."idx_org_invitations_email"`);
    await queryRunner.query(`DROP TABLE "organization_invitations"`);
    await queryRunner.query(`DROP INDEX "public"."idx_org_members_user"`);
    await queryRunner.query(`DROP INDEX "public"."idx_org_members_org"`);
    await queryRunner.query(`DROP TABLE "organization_members"`);
    await queryRunner.query(`DROP INDEX "public"."idx_organizations_owner"`);
    await queryRunner.query(`DROP INDEX "public"."idx_organizations_hedera"`);
    await queryRunner.query(`DROP TABLE "organizations"`);
    await queryRunner.query(`DROP TABLE "platform_topics"`);
    await queryRunner.query(`DROP INDEX "public"."idx_payments_sender"`);
    await queryRunner.query(`DROP INDEX "public"."idx_payments_recipient"`);
    await queryRunner.query(`DROP TABLE "payments_index"`);
    await queryRunner.query(`DROP INDEX "public"."idx_posts_author"`);
    await queryRunner.query(`DROP INDEX "public"."idx_posts_timestamp"`);
    await queryRunner.query(`DROP TABLE "posts_index"`);
    await queryRunner.query(`DROP INDEX "public"."idx_follows_following"`);
    await queryRunner.query(`DROP TABLE "social_follows"`);
    await queryRunner.query(`DROP INDEX "public"."idx_messages_topic_seq"`);
    await queryRunner.query(`DROP INDEX "public"."idx_messages_sender"`);
    await queryRunner.query(`DROP INDEX "public"."idx_messages_timestamp"`);
    await queryRunner.query(`DROP TABLE "messages_index"`);
    await queryRunner.query(`DROP INDEX "public"."idx_conv_members_account"`);
    await queryRunner.query(`DROP TABLE "conversation_members"`);
    await queryRunner.query(`DROP INDEX "public"."idx_conversations_topic"`);
    await queryRunner.query(`DROP INDEX "public"."idx_conversations_last_msg"`);
    await queryRunner.query(`DROP TABLE "conversations"`);
    await queryRunner.query(`DROP TABLE "business_profiles"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d7fc9ebb7ad9b093f658af8c54"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3676155292d72c67cd4e090514"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_14f27fdda93f462f64ffcbf9f1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_31daa51074a24fcfcee3c4f08b"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
