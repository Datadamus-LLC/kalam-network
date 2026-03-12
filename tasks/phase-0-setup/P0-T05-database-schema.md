# P0-T05: Database Schema — TypeORM Entities & Migrations

| Field | Value |
|-------|-------|
| Task ID | P0-T05 |
| Priority | 🔴 P0 — Critical Path |
| Estimated Time | 4 hours |
| Depends On | P0-T04 (NestJS Backend), P0-T02 (Shared Types) |
| Phase | 0 — Project Setup |
| Assignee | Backend developer |

---

## Objective

Create all 9 TypeORM entity classes that map to the PostgreSQL schema defined in docs/SPECIFICATION.md Section 4.2. After this task, the database schema is fully defined and ready to be migrated to Postgres.

---

## Background

**TypeORM** is an ORM (Object-Relational Mapper) that converts database tables into TypeScript classes. Each entity class:
- Corresponds to one database table
- Uses decorators (`@Entity`, `@Column`, `@Index`) to define structure
- Can be queried with type-safe syntax

The 14 entities are:
1. **UserEntity** — User profiles and accounts
2. **BusinessProfileEntity** — Extended data for business accounts
3. **ConversationEntity** — Messaging conversations
4. **ConversationMemberEntity** — Participant list
5. **MessageIndexEntity** — Cached message metadata
6. **SocialFollowEntity** — Follow relationships
7. **PostIndexEntity** — Public post metadata
8. **PaymentIndexEntity** — Payment transaction records
9. **PlatformTopicEntity** — Platform-level HCS topics
10. **OrganizationEntity** — Business organizations (auto-created on KYB approval)
11. **OrganizationMemberEntity** — Org member roster with RBAC roles
12. **OrganizationInvitationEntity** — Email-based org invitations
13. **PaymentRequestEntity** — Structured payment requests with expiry
14. **TransactionEntity** — Platform-side transaction index

---

## Pre-requisites

- P0-T04 complete (NestJS structure exists)
- P0-T02 complete (shared types exist)
- Postgres running (`docker compose up -d`)
- Read docs/SPECIFICATION.md Section 4.2 (data model reference)

---

## Step-by-Step Instructions

### Step 1: Create the UserEntity

Create `packages/api/src/database/entities/user.entity.ts`:

```typescript
import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('users')
@Index('idx_users_hedera_account', ['hederaAccountId'])
@Index('idx_users_status', ['status'])
@Index('idx_users_display_name', ['displayName'])
export class UserEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  hederaAccountId: string; // e.g., "0.0.12345"

  @Column({ type: 'varchar', length: 10 })
  accountType: 'individual' | 'business';

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  displayName: string;

  @Column({ type: 'varchar', length: 256, nullable: true })
  bio: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  avatarIpfsCid: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'pending_wallet',
  })
  status: string;
  // Status: pending_wallet → pending_kyc → kyc_submitted → active | kyc_rejected

  @Column({ type: 'varchar', length: 20, nullable: true })
  kycLevel: string; // "basic" | "enhanced" | "institutional"

  @Column({ type: 'bigint', nullable: true })
  didNftSerial: number; // HTS NFT serial number

  @Column({ type: 'varchar', length: 100, nullable: true })
  didNftMetadataCid: string; // IPFS CID of current DID metadata

  @Column({ type: 'varchar', length: 20, nullable: true })
  publicFeedTopic: string; // HCS Topic ID for public posts

  @Column({ type: 'varchar', length: 20, nullable: true })
  notificationTopic: string; // HCS Topic ID for notifications

  @Column({ type: 'varchar', length: 20, nullable: true })
  broadcastTopic: string; // HCS Topic ID (business only)

  @Column({ type: 'text', nullable: true })
  publicKey: string; // ECDSA public key (from Tamam Custody)

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
```

### Step 2: Create the BusinessProfileEntity

Create `packages/api/src/database/entities/business-profile.entity.ts`:

```typescript
import { Entity, PrimaryColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('business_profiles')
export class BusinessProfileEntity {
  @PrimaryColumn('uuid')
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ type: 'varchar', length: 128, nullable: true })
  companyName: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  registrationNumber: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  businessCategory: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  kybLevel: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website: string;

  @Column({ type: 'jsonb', nullable: true })
  businessHours: Record<string, string>; // { "mon": "9:00-17:00", ... }

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
```

### Step 3: Create the ConversationEntity

Create `packages/api/src/database/entities/conversation.entity.ts`:

```typescript
import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('conversations')
@Index('idx_conversations_topic', ['hcsTopicId'])
@Index('idx_conversations_last_msg', ['lastMessageAt'], { synchronize: false })
export class ConversationEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  hcsTopicId: string; // HCS Topic ID

  @Column({ type: 'varchar', length: 10 })
  conversationType: 'direct' | 'group';

  @Column({ type: 'varchar', length: 128, nullable: true })
  groupName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  groupAvatarCid: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  adminAccountId: string; // Group admin (for groups)

  @Column({ type: 'varchar', length: 20 })
  createdBy: string; // Hedera Account ID

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastMessageAt: Date;

  @Column({ type: 'bigint', default: 0 })
  lastMessageSeq: number;
}
```

### Step 4: Create the ConversationMemberEntity

Create `packages/api/src/database/entities/conversation-member.entity.ts`:

```typescript
import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ConversationEntity } from './conversation.entity';

@Entity('conversation_members')
@Index('idx_conv_members_account', ['hederaAccountId'])
export class ConversationMemberEntity {
  @PrimaryColumn('uuid')
  conversationId: string;

  @PrimaryColumn('varchar', { length: 20 })
  hederaAccountId: string;

  @ManyToOne(() => ConversationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: ConversationEntity;

  @Column({ type: 'varchar', length: 10, default: 'member' })
  role: 'admin' | 'member';

  @CreateDateColumn({ type: 'timestamp with time zone' })
  joinedAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  leftAt: Date;

  @Column({ type: 'bigint', default: 0 })
  lastReadSeq: number; // Last read message sequence
}
```

### Step 5: Create the MessageIndexEntity

Create `packages/api/src/database/entities/message-index.entity.ts`:

```typescript
import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('messages_index')
@Index('idx_messages_topic_seq', ['hcsTopicId', 'sequenceNumber'], {
  synchronize: false,
})
@Index('idx_messages_sender', ['senderAccountId'])
@Index('idx_messages_timestamp', ['consensusTimestamp'], { synchronize: false })
export class MessageIndexEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  hcsTopicId: string;

  @Column({ type: 'bigint' })
  sequenceNumber: number;

  @Column({ type: 'timestamp with time zone' })
  consensusTimestamp: Date;

  @Column({ type: 'varchar', length: 20 })
  senderAccountId: string;

  @Column({ type: 'varchar', length: 20 })
  messageType: 'message' | 'payment' | 'payment_request' | 'payment_split' | 'system';

  @Column({ type: 'bytea', nullable: true })
  encryptedPreview: Buffer; // Client-encrypted preview (optional, set by sender for push notifications)

  @Column({ type: 'boolean', default: false })
  hasMedia: boolean;

  // Add unique constraint on (hcsTopicId, sequenceNumber)
}
```

### Step 6: Create the SocialFollowEntity

Create `packages/api/src/database/entities/social-follow.entity.ts`:

```typescript
import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('social_follows')
@Index('idx_follows_following', ['followingAccountId'])
export class SocialFollowEntity {
  @PrimaryColumn('varchar', { length: 20 })
  followerAccountId: string;

  @PrimaryColumn('varchar', { length: 20 })
  followingAccountId: string;

  @Column({ type: 'bigint', nullable: true })
  hcsSequenceNumber: number; // HCS sequence number of follow event

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
```

### Step 7: Create the PostIndexEntity

Create `packages/api/src/database/entities/post-index.entity.ts`:

```typescript
import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('posts_index')
@Index('idx_posts_author', ['authorAccountId', 'consensusTimestamp'], {
  synchronize: false,
})
@Index('idx_posts_timestamp', ['consensusTimestamp'], { synchronize: false })
export class PostIndexEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  authorAccountId: string;

  @Column({ type: 'varchar', length: 20 })
  hcsTopicId: string;

  @Column({ type: 'bigint' })
  sequenceNumber: number;

  @Column({ type: 'timestamp with time zone' })
  consensusTimestamp: Date;

  @Column({ type: 'text', nullable: true })
  contentText: string;

  @Column({ type: 'boolean', default: false })
  hasMedia: boolean;

  @Column({ type: 'jsonb', nullable: true })
  mediaRefs: string[]; // Array of IPFS CIDs
}
```

### Step 8: Create the PaymentIndexEntity

Create `packages/api/src/database/entities/payment-index.entity.ts`:

```typescript
import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('payments_index')
@Index('idx_payments_sender', ['senderAccountId', 'createdAt'], {
  synchronize: false,
})
@Index('idx_payments_recipient', ['recipientAccountId', 'createdAt'], {
  synchronize: false,
})
export class PaymentIndexEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  senderAccountId: string;

  @Column({ type: 'varchar', length: 20 })
  recipientAccountId: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  amount: number;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  htsTransactionId: string; // Hedera transaction ID

  @Column({ type: 'varchar', length: 20, nullable: true })
  hcsTopicId: string; // Conversation where payment was made

  @Column({ type: 'bigint', nullable: true })
  hcsSequenceNumber: number;

  @Column({ type: 'varchar', length: 20 })
  paymentType: 'send' | 'request_fulfillment' | 'split_payment';

  @Column({ type: 'varchar', length: 100, nullable: true })
  tamamReference: string;

  @Column({ type: 'varchar', length: 20 })
  status: 'confirmed' | 'failed';

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
```

### Step 9: Create the PlatformTopicEntity

Create `packages/api/src/database/entities/platform-topic.entity.ts`:

```typescript
import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('platform_topics')
export class PlatformTopicEntity {
  @PrimaryColumn('varchar', { length: 50 })
  topicName: string; // "social_graph" | "kyc_attestations" | "platform_announcements"

  @Column({ type: 'varchar', length: 20, unique: true })
  hcsTopicId: string;

  @Column({ type: 'bigint', default: 0 })
  lastSequence: number;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
```

### Step 10: Create an entities barrel export

Create `packages/api/src/database/entities/index.ts`:

```typescript
export { UserEntity } from './user.entity';
export { BusinessProfileEntity } from './business-profile.entity';
export { ConversationEntity } from './conversation.entity';
export { ConversationMemberEntity } from './conversation-member.entity';
export { MessageIndexEntity } from './message-index.entity';
export { SocialFollowEntity } from './social-follow.entity';
export { PostIndexEntity } from './post-index.entity';
export { PaymentIndexEntity } from './payment-index.entity';
export { PlatformTopicEntity } from './platform-topic.entity';
```

### Step 11: Update TypeORM config to recognize entities

Update `packages/api/src/database/data-source.ts` to use the entities:

```typescript
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import {
  UserEntity,
  BusinessProfileEntity,
  ConversationEntity,
  ConversationMemberEntity,
  MessageIndexEntity,
  SocialFollowEntity,
  PostIndexEntity,
  PaymentIndexEntity,
  PlatformTopicEntity,
} from './entities';

dotenv.config({ path: '../../.env' });

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'hedera_social',
  password: process.env.DB_PASSWORD || 'devpassword',
  database: process.env.DB_DATABASE || 'hedera_social',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  entities: [
    UserEntity,
    BusinessProfileEntity,
    ConversationEntity,
    ConversationMemberEntity,
    MessageIndexEntity,
    SocialFollowEntity,
    PostIndexEntity,
    PaymentIndexEntity,
    PlatformTopicEntity,
  ],
  migrations: ['src/database/migrations/**/*.ts'],
  subscribers: [],
});

export default AppDataSource;
```

### Step 12: Generate the initial migration

From the repo root:

```bash
cd packages/api
pnpm typeorm migration:generate src/database/migrations/1710000000000-initial-schema
```

This generates a migration file in `src/database/migrations/` containing all CREATE TABLE statements for the 14 entities. The migration file is auto-generated from the entity definitions — you don't need to write raw SQL.

You should see output like:

```
Migration /sessions/exciting-sharp-mayer/mnt/social-platform/packages/api/src/database/migrations/1710000000000-initial-schema.ts has been generated successfully.
```

### Step 13: Run the migration against Postgres

Make sure Postgres is running, then:

```bash
cd packages/api
pnpm db:migrate
```

Expected output:

```
query: SELECT NOW()
migration InitialSchema1710000000000 has been executed successfully
```

### Step 14: Verify all tables exist

Connect to Postgres and check:

```bash
psql -h localhost -U hedera_social -d hedera_social -c "\dt"
```

Expected output (showing all 14 tables):

```
                   List of relations
 Schema |          Name              | Type  |     Owner
--------+----------------------------+-------+-----------
 public | business_profiles          | table | hedera_social
 public | conversation_members       | table | hedera_social
 public | conversations              | table | hedera_social
 public | messages_index             | table | hedera_social
 public | organization_invitations   | table | hedera_social
 public | organization_members       | table | hedera_social
 public | organizations              | table | hedera_social
 public | payment_requests           | table | hedera_social
 public | payments_index             | table | hedera_social
 public | platform_topics            | table | hedera_social
 public | posts_index                | table | hedera_social
 public | social_follows             | table | hedera_social
 public | transactions               | table | hedera_social
 public | typeorm_metadata           | table | hedera_social
 public | users                      | table | hedera_social
```

**Note:** The 5 new tables (`organizations`, `organization_members`, `organization_invitations`, `payment_requests`, `transactions`) are defined in docs/SPECIFICATION.md Section 4.2. See also docs/PRD-BUSINESS-FEATURES.md for business context. These support Phase 7: Business Features (T29-T32).

Check the schema of the users table:

```bash
psql -h localhost -U hedera_social -d hedera_social -c "\d users"
```

Expected output:

```
                                  Table "public.users"
      Column          |           Type           | Collation | Nullable |          Default
----------------------+--------------------------+-----------+----------+---------------------------
 id                   | uuid                     |           | not null |
 hedera_account_id    | character varying(20)    |           | not null |
 account_type         | character varying(10)    |           | not null |
 email                | character varying(255)   |           |          |
 phone                | character varying(20)    |           |          |
 display_name         | character varying(64)    |           |          |
 bio                  | character varying(256)   |           |          |
 avatar_ipfs_cid      | character varying(100)   |           |          |
 status               | character varying(20)    |           | not null | 'pending_wallet'::character varying
 kyc_level            | character varying(20)    |           |          |
 did_nft_serial       | bigint                   |           |          |
 did_nft_metadata_cid | character varying(100)   |           |          |
 public_feed_topic    | character varying(20)    |           |          |
 notification_topic   | character varying(20)    |           |          |
 broadcast_topic      | character varying(20)    |           |          |
 public_key           | text                     |           |          |
 created_at           | timestamp with time zone |           | not null | now()
 updated_at           | timestamp with time zone |           | not null | now()
Indexes:
    "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY, btree (id)
    "UQ_a3ffb1c0c8416b9fc6f907b7433_hedera" UNIQUE, btree (hedera_account_id)
    "idx_users_display_name" btree (display_name)
    "idx_users_hedera_account" btree (hedera_account_id)
    "idx_users_status" btree (status)
```

---

## Verification Steps

Run each of these and confirm the expected output:

| # | Command | Expected |
|---|---------|----------|
| 1 | `ls packages/api/src/database/entities/*.entity.ts \| wc -l` | 14 (all entity files exist) |
| 2 | `grep -c "@Entity" packages/api/src/database/entities/*.entity.ts` | 14 (all decorated as entities) |
| 3 | `cd packages/api && pnpm typeorm query "SELECT 1"` | Connection succeeds without error |
| 4 | `psql -h localhost -U hedera_social -d hedera_social -c "\dt" \| wc -l` | 16 (14 tables + 2 metadata) |
| 5 | `psql -h localhost -U hedera_social -d hedera_social -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';"` | 16 |
| 6 | `psql -h localhost -U hedera_social -d hedera_social -c "\d users \| grep hedera_account_id"` | Shows hedera_account_id column with unique constraint |
| 7 | `psql -h localhost -U hedera_social -d hedera_social -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"` | Lists all 14 tables |
| 8 | `ls packages/api/src/database/migrations/*.ts` | At least 1 migration file exists |
| 9 | `pnpm db:migrate` | Shows "has been executed successfully" with no errors |
| 10 | `grep -c "class.*Entity" packages/api/src/database/entities/*.entity.ts` | 14 (all entity classes) |

---

## Definition of Done

- [ ] All 14 entities created in `packages/api/src/database/entities/`
- [ ] UserEntity has hedera_account_id (unique), status, kyc_level, did_nft_serial, public_key fields
- [ ] BusinessProfileEntity has companyName, registrationNumber, businessCategory, website, businessHours
- [ ] ConversationEntity has hcsTopicId (unique), conversationType, groupName, adminAccountId, lastMessageAt
- [ ] ConversationMemberEntity composite PK on (conversationId, hederaAccountId)
- [ ] MessageIndexEntity has unique constraint on (hcsTopicId, sequenceNumber)
- [ ] SocialFollowEntity composite PK on (followerAccountId, followingAccountId)
- [ ] PostIndexEntity has authorAccountId, hcsTopicId, sequenceNumber, contentText, mediaRefs
- [ ] PaymentIndexEntity has senderAccountId, recipientAccountId, amount (decimal), currency, status
- [ ] PlatformTopicEntity has topicName as PK (string), hcsTopicId (unique)
- [ ] All indexes created (@Index decorators on entities)
- [ ] Migration file generated in `src/database/migrations/`
- [ ] Migration runs successfully: `pnpm db:migrate` returns no errors
- [ ] All 14 tables exist in Postgres: `\dt` shows all tables
- [ ] Each table has correct columns with correct types
- [ ] Foreign key constraints exist where needed (BusinessProfileEntity → UserEntity, etc.)
- [ ] Unique constraints exist on hedera_account_id and hcsTopicId

---

## Troubleshooting

**Problem:** "no such table: users"
**Fix:** Run the migration: `pnpm db:migrate`. If still failing, check Postgres is running: `docker compose ps`.

**Problem:** "Migration not found"
**Fix:** Make sure the migration file was generated in `src/database/migrations/`. Check the timestamp in the filename matches.

**Problem:** "Column 'hedera_account_id' must be a string"
**Fix:** TypeORM entity properties are TypeScript types, but they map to SQL types via decorators. The `@Column({ type: 'varchar', length: 20 })` decorator defines the SQL type.

**Problem:** "Unique constraint violation"
**Fix:** If you're running the migration a second time, it will fail because the tables already exist. To reset: `docker compose down -v` (WARNING: deletes all data), then `docker compose up -d && pnpm db:migrate`.

**Problem:** "Cannot find module '@nestjs/typeorm'"
**Fix:** Ensure typeorm and @nestjs/typeorm are installed: `pnpm install`. If still missing: `pnpm add @nestjs/typeorm typeorm`.

**Problem:** "TimeZone type not recognized"
**Fix:** Use `{ type: 'timestamp with time zone' }` instead of just `timestamp`. PostgreSQL requires the `with time zone` syntax.

---

## Files Created in This Task

```
packages/api/src/database/
├── entities/
│   ├── index.ts                           (barrel export)
│   ├── user.entity.ts                     (9 fields + 2 timestamps)
│   ├── business-profile.entity.ts         (7 fields)
│   ├── conversation.entity.ts             (8 fields)
│   ├── conversation-member.entity.ts      (5 fields + composite PK)
│   ├── message-index.entity.ts            (8 fields)
│   ├── social-follow.entity.ts            (3 fields + composite PK)
│   ├── post-index.entity.ts               (7 fields)
│   ├── payment-index.entity.ts            (10 fields)
│   └── platform-topic.entity.ts           (4 fields)
├── migrations/
│   └── 1710000000000-initial-schema.ts    (auto-generated CREATE TABLE statements)
└── data-source.ts                          (updated with all 14 entities)
```

---

## What Happens Next

After this task is complete:
- **P0-T06** (Hedera Service) — will use these entities to index on-chain data
- **P1-T01 through P1-T06** (Phase 1 features) — will inject these entities via TypeORM into services
- All database operations are now type-safe and auto-validated

---

## Additional Notes on Migration

### Reverting a Migration

If you need to undo the migration:

```bash
cd packages/api
pnpm db:revert
```

This drops all tables. Use only in development.

### Generating New Migrations

After modifying an entity in the future, generate a new migration:

```bash
cd packages/api
pnpm db:generate src/database/migrations/1710000001000-add-new-field
```

This compares current entities with the database schema and generates only the changed statements (ALTER TABLE, etc.).

### Viewing Migration Status

To see which migrations have been run:

```bash
psql -h localhost -U hedera_social -d hedera_social -c "SELECT * FROM typeorm_metadata;"
```
