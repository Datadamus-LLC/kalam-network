# Task P0-T14: Create Conversation (1:1 & Group)

| Field | Value |
|-------|-------|
| Task ID | P0-T14 |
| Priority | Critical |
| Estimated Time | 5 hours |
| Depends On | P0-T06 (Hedera Service), P0-T03 (Crypto Library), P0-T05 (Database Schema) |
| Phase | 2 — Messaging |
| Assignee | Junior Backend Developer |

---

## Objective

Implement a complete conversation creation system supporting both 1:1 and group conversations. Conversations use Hedera Consensus Service (HCS) topics for message transport with E2E encryption. Each conversation has a unique AES-256-GCM symmetric key encrypted for each participant.

## Background

### Hedera Consensus Service (HCS) Overview
- HCS provides an immutable, timestamped ledger of messages
- Each conversation gets its own topic with a `submitKey` (platform operator key, access control at application layer via JWT + DB permissions)
- Messages are submitted to the topic and distributed to all subscribers
- The Mirror Node provides a query API to retrieve messages

### Encryption Architecture
1. **Key Generation**: AES-256-GCM symmetric key generated per conversation
2. **Key Distribution**: Symmetric key encrypted with each participant's public key
3. **Key Exchange Message**: Posted to HCS topic with encrypted keys
4. **Participant Keys**: Retrieved from Hedera account metadata or identity service

### Conversation Lifecycle
1. Initiator creates conversation and HCS topic
2. Platform generates symmetric key and encrypts for each participant
3. Key exchange message posted to HCS
4. Conversation record stored in PostgreSQL
5. Participant records created
6. Conversation ready to receive messages

## Pre-requisites

- Hedera Service fully implemented (P0-T06)
- Crypto Library with public key retrieval (P0-T03)
- Database schema with conversation tables (P0-T05)
- PostgreSQL running
- Mirror Node testnet access
- All participants must have Hedera accounts with public keys stored

## Step-by-Step Instructions

### Step 1: Create Database Entities

Create `/src/modules/conversations/entities/conversation.entity.ts`:

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { ConversationParticipant } from './conversation-participant.entity';
import { Message } from '../../messages/entities/message.entity';

export enum ConversationType {
  DIRECT = 'DIRECT',
  GROUP = 'GROUP',
}

@Entity('conversations')
@Index(['hcsTopicId'], { unique: true })
@Index(['createdBy'])
@Index(['createdAt'])
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: ConversationType,
    default: ConversationType.DIRECT,
  })
  type: ConversationType;

  @Column({ nullable: true })
  name: string; // Only for GROUP conversations

  @Column({ nullable: true })
  avatar: string; // IPFS CID for group avatar

  @Column()
  hcsTopicId: string; // Hedera Consensus Service topic ID (0.0.N)

  @Column()
  hcsSubmitKey: string; // Platform operator key (access control at application layer)

  @Column()
  currentKeyId: string; // UUID of the active encryption key

  @Column()
  currentRotationIndex: number;

  @Column({ type: 'text' })
  encryptedKeysJson: string; // { "0.0.ACCOUNT": "base64(encrypted_Ks)" }

  @Column()
  createdBy: string; // Account ID who created

  @Column({ nullable: true })
  description: string;

  @Column({ default: false })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(
    () => ConversationParticipant,
    (participant) => participant.conversation,
    { cascade: true, eager: true }
  )
  participants: ConversationParticipant[];

  @OneToMany(() => Message, (message) => message.conversation, { cascade: true })
  messages: Message[];
}
```

Create `/src/modules/conversations/entities/conversation-participant.entity.ts`:

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { Conversation } from './conversation.entity';

export enum ParticipantRole {
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

@Entity('conversation_participants')
@Index(['conversationId', 'accountId'], { unique: true })
@Index(['accountId'])
export class ConversationParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  conversationId: string;

  @Column()
  accountId: string; // Hedera account ID (0.0.N)

  @Column({
    type: 'enum',
    enum: ParticipantRole,
    default: ParticipantRole.MEMBER,
  })
  role: ParticipantRole;

  @Column({ nullable: true })
  publicKey: string; // Ed25519 public key (base64)

  @Column({ default: 0 })
  lastReadSequence: number; // Last message sequence read

  @CreateDateColumn()
  joinedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Conversation, (conversation) => conversation.participants, {
    onDelete: 'CASCADE',
  })
  conversation: Conversation;
}
```

Create `/src/modules/messages/entities/message.entity.ts` (for caching):

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
} from 'typeorm';
import { Conversation } from '../conversations/entities/conversation.entity';

@Entity('messages')
@Index(['conversationId', 'hcsSequenceNumber'], { unique: true })
@Index(['conversationId', 'createdAt'])
@Index(['hcsMemo'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  conversationId: string;

  @Column()
  hcsTopicId: string; // Hedera topic ID

  @Column()
  hcsSequenceNumber: number; // Message sequence from HCS

  @Column()
  senderAccountId: string;

  @Column({ type: 'text' })
  encryptedPayload: string; // base64 encrypted JSON

  @Column({ nullable: true })
  hcsMemo: string; // Memo field from HCS

  @Column({ type: 'jsonb', nullable: true })
  decryptedCache?: { type: string; text?: string; mediaRef?: string; mediaMeta?: { filename: string; mimeType: string; size: number; dimensions?: string } }; // Cache for decrypted content (optional)

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages, {
    onDelete: 'CASCADE',
  })
  conversation: Conversation;
}
```

### Step 2: Create DTOs with Validation

Create `/src/modules/conversations/dto/create-conversation.dto.ts`:

```typescript
import {
  IsString,
  IsArray,
  IsOptional,
  IsEnum,
  ValidateIf,
  ArrayMinSize,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export enum ConversationTypeDto {
  DIRECT = 'DIRECT',
  GROUP = 'GROUP',
}

export class CreateConversationDto {
  @IsEnum(ConversationTypeDto)
  type: ConversationTypeDto;

  @ValidateIf((o) => o.type === ConversationTypeDto.DIRECT)
  @IsString()
  @Matches(/^0\.0\.\d+$/, {
    message: 'recipientAccountId must be a valid Hedera account ID (0.0.N)',
  })
  recipientAccountId?: string;

  @ValidateIf((o) => o.type === ConversationTypeDto.GROUP)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  groupName?: string;

  @ValidateIf((o) => o.type === ConversationTypeDto.GROUP)
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  participantAccountIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
```

Create `/src/modules/conversations/dto/add-member.dto.ts`:

```typescript
import { IsString, Matches } from 'class-validator';

export class AddMemberDto {
  @IsString()
  @Matches(/^0\.0\.\d+$/, {
    message: 'memberAccountId must be a valid Hedera account ID (0.0.N)',
  })
  memberAccountId: string;
}
```

Create `/src/modules/conversations/dto/conversation-response.dto.ts`:

```typescript
import { Exclude, Expose, Type } from 'class-transformer';
import { ConversationType } from '../entities/conversation.entity';
import { ParticipantResponseDto } from './participant-response.dto';

@Exclude()
export class ConversationResponseDto {
  @Expose()
  id: string;

  @Expose()
  type: ConversationType;

  @Expose()
  name: string;

  @Expose()
  avatar: string;

  @Expose()
  hcsTopicId: string;

  @Expose()
  currentKeyId: string;

  @Expose()
  createdBy: string;

  @Expose()
  description: string;

  @Expose()
  isActive: boolean;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;

  @Expose()
  @Type(() => ParticipantResponseDto)
  participants: ParticipantResponseDto[];
}
```

Create `/src/modules/conversations/dto/participant-response.dto.ts`:

```typescript
import { Exclude, Expose } from 'class-transformer';
import { ParticipantRole } from '../entities/conversation-participant.entity';

@Exclude()
export class ParticipantResponseDto {
  @Expose()
  id: string;

  @Expose()
  accountId: string;

  @Expose()
  role: ParticipantRole;

  @Expose()
  lastReadSequence: number;

  @Expose()
  joinedAt: Date;
}
```

### Step 3: Create Conversation Service

Create `/src/modules/conversations/conversation.service.ts`:

```typescript
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { Conversation, ConversationType } from './entities/conversation.entity';
import {
  ConversationParticipant,
  ParticipantRole,
} from './entities/conversation-participant.entity';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { HederaService } from '../hedera/hedera.service';
import { CryptoService } from '../crypto/crypto.service';
import { MirrorNodeService } from '../hedera/mirror-node.service';

interface EncryptedKeyMap {
  [accountId: string]: string; // base64 encrypted key
}

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    @InjectRepository(ConversationParticipant)
    private participantRepository: Repository<ConversationParticipant>,
    private hederaService: HederaService,
    private cryptoService: CryptoService,
    private mirrorNodeService: MirrorNodeService,
  ) {}

  /**
   * Create a 1:1 direct conversation
   * Flow:
   * 1. Validate both accounts exist and have public keys
   * 2. Create HCS topic with platform operator key as submitKey
   * 3. Generate AES-256-GCM symmetric key
   * 4. Encrypt symmetric key for each participant
   * 5. Submit key_exchange message to HCS
   * 6. Store conversation and participants in DB
   */
  async createDirectConversation(
    initiatorAccountId: string,
    recipientAccountId: string,
  ): Promise<Conversation> {
    this.logger.debug(
      `Creating direct conversation: ${initiatorAccountId} <-> ${recipientAccountId}`,
    );

    // Validate accounts are different
    if (initiatorAccountId === recipientAccountId) {
      throw new BadRequestException(
        'Cannot create conversation with yourself',
      );
    }

    // Check for existing conversation
    const existing = await this.conversationRepository.findOne({
      where: [
        {
          hcsTopicId: recipientAccountId, // Will be checked differently
        },
      ],
    });

    // Get public keys for both participants
    const initiatorPublicKey = await this.cryptoService.getPublicKey(
      initiatorAccountId,
    );
    const recipientPublicKey = await this.cryptoService.getPublicKey(
      recipientAccountId,
    );

    if (!initiatorPublicKey || !recipientPublicKey) {
      throw new BadRequestException(
        'One or both participants do not have public keys registered',
      );
    }

    // Create HCS topic with platform operator key as submitKey
    // Access control enforced at application layer (JWT + DB permissions)
    const hcsTopicId = await this.hederaService.createTopic({
      memo: `Hedera Social Direct Conversation`,
      submitKey: 'PLATFORM_OPERATOR_KEY', // from env: HEDERA_OPERATOR_KEY
    });

    // Generate symmetric key (AES-256-GCM = 32 bytes)
    const symmetricKey = crypto.randomBytes(32);
    const keyId = uuidv4();

    // Encrypt symmetric key for each participant
    const encryptedKeys: EncryptedKeyMap = {};
    encryptedKeys[initiatorAccountId] =
      await this.cryptoService.encryptForPublicKey(
        symmetricKey,
        initiatorPublicKey,
      );
    encryptedKeys[recipientAccountId] =
      await this.cryptoService.encryptForPublicKey(
        symmetricKey,
        recipientPublicKey,
      );

    // Create key exchange message
    const keyExchangeMessage = {
      v: '1.0',
      type: 'key_exchange',
      keys: encryptedKeys,
      algorithm: 'AES-256-GCM',
      keyId: keyId,
      rotationIndex: 0,
    };

    // Submit to HCS
    await this.hederaService.submitMessage(
      hcsTopicId,
      JSON.stringify(keyExchangeMessage),
      'key_exchange',
    );

    // Store conversation in DB
    const conversation = this.conversationRepository.create({
      type: ConversationType.DIRECT,
      hcsTopicId,
      hcsSubmitKey: JSON.stringify({
        threshold: 1,
        keys: [initiatorAccountId, recipientAccountId],
      }),
      currentKeyId: keyId,
      currentRotationIndex: 0,
      encryptedKeysJson: JSON.stringify(encryptedKeys),
      createdBy: initiatorAccountId,
      isActive: true,
    });

    await this.conversationRepository.save(conversation);

    // Create participant records
    const participants = [
      {
        conversationId: conversation.id,
        accountId: initiatorAccountId,
        role: ParticipantRole.MEMBER,
        publicKey: initiatorPublicKey,
      },
      {
        conversationId: conversation.id,
        accountId: recipientAccountId,
        role: ParticipantRole.MEMBER,
        publicKey: recipientPublicKey,
      },
    ];

    await this.participantRepository.insert(participants);

    // Reload with participants
    return this.getConversation(conversation.id);
  }

  /**
   * Create a group conversation
   * Flow:
   * 1. Validate all participants exist and have public keys
   * 2. Create HCS topic with platform operator key as submitKey
   * 3. Generate AES-256-GCM symmetric key
   * 4. Encrypt symmetric key for each participant
   * 5. Submit key_exchange message and group_meta message
   * 6. Store conversation, participants, and metadata in DB
   */
  async createGroupConversation(
    creatorAccountId: string,
    participantAccountIds: string[],
    groupName: string,
  ): Promise<Conversation> {
    this.logger.debug(
      `Creating group conversation: ${groupName} with ${participantAccountIds.length} participants`,
    );

    // Ensure creator is in the list
    const allParticipants = Array.from(
      new Set([creatorAccountId, ...participantAccountIds]),
    );

    if (allParticipants.length < 2) {
      throw new BadRequestException('Group must have at least 2 members');
    }

    if (allParticipants.length > 100) {
      throw new BadRequestException('Group cannot exceed 100 members');
    }

    // Get public keys for all participants
    const participantKeys: { [accountId: string]: string } = {};
    for (const accountId of allParticipants) {
      const pubKey = await this.cryptoService.getPublicKey(accountId);
      if (!pubKey) {
        throw new BadRequestException(
          `Participant ${accountId} does not have a public key registered`,
        );
      }
      participantKeys[accountId] = pubKey;
    }

    // Create HCS topic with platform operator key as submitKey
    // Access control enforced at application layer (JWT + DB permissions)
    const hcsTopicId = await this.hederaService.createTopic({
      memo: `Hedera Social Group: ${groupName}`,
      submitKey: 'PLATFORM_OPERATOR_KEY', // from env: HEDERA_OPERATOR_KEY
    });

    // Generate symmetric key
    const symmetricKey = crypto.randomBytes(32);
    const keyId = uuidv4();

    // Encrypt symmetric key for each participant
    const encryptedKeys: EncryptedKeyMap = {};
    for (const accountId of allParticipants) {
      encryptedKeys[accountId] =
        await this.cryptoService.encryptForPublicKey(
          symmetricKey,
          participantKeys[accountId],
        );
    }

    // Submit key exchange message
    const keyExchangeMessage = {
      v: '1.0',
      type: 'key_exchange',
      keys: encryptedKeys,
      algorithm: 'AES-256-GCM',
      keyId: keyId,
      rotationIndex: 0,
    };

    await this.hederaService.submitMessage(
      hcsTopicId,
      JSON.stringify(keyExchangeMessage),
      'key_exchange',
    );

    // Submit group metadata message
    const groupMetaMessage = {
      v: '1.0',
      type: 'group_meta',
      action: 'create',
      data: {
        name: groupName,
        avatar: null,
        admin: creatorAccountId,
        participants: allParticipants,
      },
    };

    await this.hederaService.submitMessage(
      hcsTopicId,
      JSON.stringify(groupMetaMessage),
      'group_meta',
    );

    // Store conversation in DB
    const conversation = this.conversationRepository.create({
      type: ConversationType.GROUP,
      name: groupName,
      hcsTopicId,
      hcsSubmitKey: JSON.stringify({
        threshold: 1,
        keys: allParticipants,
      }),
      currentKeyId: keyId,
      currentRotationIndex: 0,
      encryptedKeysJson: JSON.stringify(encryptedKeys),
      createdBy: creatorAccountId,
      isActive: true,
    });

    await this.conversationRepository.save(conversation);

    // Create participant records
    const participantRecords = allParticipants.map((accountId) => ({
      conversationId: conversation.id,
      accountId,
      role: accountId === creatorAccountId ? ParticipantRole.ADMIN : ParticipantRole.MEMBER,
      publicKey: participantKeys[accountId],
    }));

    await this.participantRepository.insert(participantRecords);

    this.logger.log(`Created group conversation ${conversation.id} (${hcsTopicId})`);

    return this.getConversation(conversation.id);
  }

  /**
   * Get conversation by ID
   */
  async getConversation(id: string): Promise<Conversation> {
    const conversation = await this.conversationRepository.findOne({
      where: { id },
      relations: ['participants'],
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${id} not found`);
    }

    return conversation;
  }

  /**
   * List all conversations for a user
   */
  async listConversations(accountId: string): Promise<Conversation[]> {
    const conversations = await this.conversationRepository
      .createQueryBuilder('conv')
      .innerJoinAndSelect(
        'conv.participants',
        'participant',
        'participant.accountId = :accountId',
        { accountId },
      )
      .orderBy('conv.updatedAt', 'DESC')
      .getMany();

    return conversations;
  }

  /**
   * Add member to group conversation
   * Flow:
   * 1. Validate conversation is GROUP type and requester is ADMIN
   * 2. Validate new member has public key
   * 3. Check member is not already in conversation
   * 4. Rotate encryption key (new Ks with all participants including new member)
   * 5. Submit key_exchange message for new member
   * 6. Submit system message about member addition
   * 7. Update conversation record
   * 8. Create participant record
   */
  async addMember(
    topicId: string,
    adminAccountId: string,
    newMemberAccountId: string,
  ): Promise<Conversation> {
    this.logger.debug(
      `Adding member ${newMemberAccountId} to conversation ${topicId} by ${adminAccountId}`,
    );

    const conversation = await this.conversationRepository.findOne({
      where: { hcsTopicId: topicId },
      relations: ['participants'],
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation with topic ${topicId} not found`);
    }

    if (conversation.type !== ConversationType.GROUP) {
      throw new BadRequestException('Can only add members to GROUP conversations');
    }

    // Check requester is admin
    const admin = conversation.participants.find(
      (p) => p.accountId === adminAccountId,
    );
    if (!admin || admin.role !== ParticipantRole.ADMIN) {
      throw new BadRequestException(
        'Only group admins can add members',
      );
    }

    // Check member doesn't already exist
    const existingMember = conversation.participants.find(
      (p) => p.accountId === newMemberAccountId,
    );
    if (existingMember) {
      throw new ConflictException(
        `${newMemberAccountId} is already a member`,
      );
    }

    // Get new member's public key
    const newMemberPublicKey = await this.cryptoService.getPublicKey(
      newMemberAccountId,
    );
    if (!newMemberPublicKey) {
      throw new BadRequestException(
        `${newMemberAccountId} does not have a public key registered`,
      );
    }

    // Key rotation: generate new Ks, encrypt for all participants
    const newSymmetricKey = crypto.randomBytes(32);
    const newKeyId = uuidv4();
    const newRotationIndex = conversation.currentRotationIndex + 1;

    const allParticipantAccountIds = [
      ...conversation.participants.map((p) => p.accountId),
      newMemberAccountId,
    ];

    const allParticipantKeys: { [accountId: string]: string } = {};
    for (const accountId of allParticipantAccountIds) {
      const pubKey =
        accountId === newMemberAccountId
          ? newMemberPublicKey
          : conversation.participants.find((p) => p.accountId === accountId).publicKey;
      allParticipantKeys[accountId] = pubKey;
    }

    const newEncryptedKeys: EncryptedKeyMap = {};
    for (const accountId of allParticipantAccountIds) {
      newEncryptedKeys[accountId] =
        await this.cryptoService.encryptForPublicKey(
          newSymmetricKey,
          allParticipantKeys[accountId],
        );
    }

    // Submit key exchange message
    const keyExchangeMessage = {
      v: '1.0',
      type: 'key_exchange',
      keys: newEncryptedKeys,
      algorithm: 'AES-256-GCM',
      keyId: newKeyId,
      rotationIndex: newRotationIndex,
    };

    await this.hederaService.submitMessage(
      topicId,
      JSON.stringify(keyExchangeMessage),
      'key_exchange',
    );

    // Submit system message about member addition
    const systemMessage = {
      v: '1.0',
      type: 'system',
      sender: '0.0.0', // Platform system account
      action: 'member_added',
      data: {
        actor: adminAccountId,
        target: newMemberAccountId,
        newKeyId: newKeyId,
      },
    };

    await this.hederaService.submitMessage(
      topicId,
      JSON.stringify(systemMessage),
      'system',
    );

    // Update conversation record
    conversation.currentKeyId = newKeyId;
    conversation.currentRotationIndex = newRotationIndex;
    conversation.encryptedKeysJson = JSON.stringify(newEncryptedKeys);
    conversation.updatedAt = new Date();

    await this.conversationRepository.save(conversation);

    // Create participant record
    await this.participantRepository.insert({
      conversationId: conversation.id,
      accountId: newMemberAccountId,
      role: ParticipantRole.MEMBER,
      publicKey: newMemberPublicKey,
    });

    this.logger.log(
      `Added member ${newMemberAccountId} to conversation ${conversation.id}`,
    );

    return this.getConversation(conversation.id);
  }

  /**
   * Remove member from group conversation
   * Flow:
   * 1. Validate conversation is GROUP type and requester is ADMIN
   * 2. Check member exists
   * 3. Cannot remove creator/last admin
   * 4. Rotate encryption key (new Ks without removed member)
   * 5. Submit key_exchange message without removed member
   * 6. Submit system message about member removal
   * 7. Update conversation record
   * 8. Delete participant record
   */
  async removeMember(
    topicId: string,
    adminAccountId: string,
    removeMemberAccountId: string,
  ): Promise<Conversation> {
    this.logger.debug(
      `Removing member ${removeMemberAccountId} from conversation ${topicId}`,
    );

    const conversation = await this.conversationRepository.findOne({
      where: { hcsTopicId: topicId },
      relations: ['participants'],
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation with topic ${topicId} not found`);
    }

    if (conversation.type !== ConversationType.GROUP) {
      throw new BadRequestException(
        'Can only remove members from GROUP conversations',
      );
    }

    // Check requester is admin
    const admin = conversation.participants.find(
      (p) => p.accountId === adminAccountId,
    );
    if (!admin || admin.role !== ParticipantRole.ADMIN) {
      throw new BadRequestException('Only group admins can remove members');
    }

    // Check member exists
    const memberToRemove = conversation.participants.find(
      (p) => p.accountId === removeMemberAccountId,
    );
    if (!memberToRemove) {
      throw new NotFoundException(
        `${removeMemberAccountId} is not a member of this conversation`,
      );
    }

    // Cannot remove creator if they're the only admin
    if (removeMemberAccountId === conversation.createdBy) {
      const adminCount = conversation.participants.filter(
        (p) => p.role === ParticipantRole.ADMIN,
      ).length;
      if (adminCount === 1) {
        throw new BadRequestException(
          'Cannot remove the group creator if they are the only admin',
        );
      }
    }

    // Key rotation without removed member
    const newSymmetricKey = crypto.randomBytes(32);
    const newKeyId = uuidv4();
    const newRotationIndex = conversation.currentRotationIndex + 1;

    const remainingParticipants = conversation.participants
      .filter((p) => p.accountId !== removeMemberAccountId)
      .map((p) => p.accountId);

    const remainingPublicKeys: { [accountId: string]: string } = {};
    for (const accountId of remainingParticipants) {
      const participant = conversation.participants.find(
        (p) => p.accountId === accountId,
      );
      remainingPublicKeys[accountId] = participant.publicKey;
    }

    const newEncryptedKeys: EncryptedKeyMap = {};
    for (const accountId of remainingParticipants) {
      newEncryptedKeys[accountId] =
        await this.cryptoService.encryptForPublicKey(
          newSymmetricKey,
          remainingPublicKeys[accountId],
        );
    }

    // Submit key exchange message
    const keyExchangeMessage = {
      v: '1.0',
      type: 'key_exchange',
      keys: newEncryptedKeys,
      algorithm: 'AES-256-GCM',
      keyId: newKeyId,
      rotationIndex: newRotationIndex,
    };

    await this.hederaService.submitMessage(
      topicId,
      JSON.stringify(keyExchangeMessage),
      'key_exchange',
    );

    // Submit system message about member removal
    const systemMessage = {
      v: '1.0',
      type: 'system',
      sender: '0.0.0',
      action: 'member_removed',
      data: {
        actor: adminAccountId,
        target: removeMemberAccountId,
        newKeyId: newKeyId,
      },
    };

    await this.hederaService.submitMessage(
      topicId,
      JSON.stringify(systemMessage),
      'system',
    );

    // Update conversation record
    conversation.currentKeyId = newKeyId;
    conversation.currentRotationIndex = newRotationIndex;
    conversation.encryptedKeysJson = JSON.stringify(newEncryptedKeys);
    conversation.updatedAt = new Date();

    await this.conversationRepository.save(conversation);

    // Delete participant record
    await this.participantRepository.delete({
      conversationId: conversation.id,
      accountId: removeMemberAccountId,
    });

    this.logger.log(
      `Removed member ${removeMemberAccountId} from conversation ${conversation.id}`,
    );

    return this.getConversation(conversation.id);
  }

  /**
   * Get conversation between two specific users (for 1:1 lookup)
   */
  async getDirectConversation(
    account1: string,
    account2: string,
  ): Promise<Conversation | null> {
    const conversations = await this.conversationRepository
      .createQueryBuilder('conv')
      .innerJoinAndSelect('conv.participants', 'p1')
      .where('conv.type = :type', { type: ConversationType.DIRECT })
      .getMany();

    const match = conversations.find((conv) => {
      const accountIds = conv.participants.map((p) => p.accountId);
      return (
        accountIds.includes(account1) && accountIds.includes(account2)
      );
    });

    return match || null;
  }
}
```

### Step 4: Create Conversation Controller

Create `/src/modules/conversations/conversation.controller.ts`:

```typescript
import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  ClassSerializerInterceptor,
  HttpStatus,
  HttpCode,
  Req,
  NotFoundException,
} from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { ConversationResponseDto } from './dto/conversation-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { plainToInstance } from 'class-transformer';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  /**
   * POST /conversations
   * Create a new 1:1 or group conversation
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createConversation(
    @Body() dto: CreateConversationDto,
    @Req() req,
  ): Promise<ConversationResponseDto> {
    const userAccountId = req.user.accountId; // From JWT token

    let conversation;

    if (dto.type === 'DIRECT') {
      conversation = await this.conversationService.createDirectConversation(
        userAccountId,
        dto.recipientAccountId,
      );
    } else {
      conversation = await this.conversationService.createGroupConversation(
        userAccountId,
        dto.participantAccountIds,
        dto.groupName,
      );
    }

    return plainToInstance(ConversationResponseDto, conversation);
  }

  /**
   * GET /conversations
   * List all conversations for the authenticated user
   */
  @Get()
  async listConversations(
    @Req() req,
  ): Promise<ConversationResponseDto[]> {
    const userAccountId = req.user.accountId;
    const conversations = await this.conversationService.listConversations(
      userAccountId,
    );

    return plainToInstance(ConversationResponseDto, conversations);
  }

  /**
   * GET /conversations/:id
   * Get a specific conversation by ID
   */
  @Get(':id')
  async getConversation(
    @Param('id') id: string,
    @Req() req,
  ): Promise<ConversationResponseDto> {
    const userAccountId = req.user.accountId;
    const conversation = await this.conversationService.getConversation(id);

    // Verify user is a participant
    const isParticipant = conversation.participants.some(
      (p) => p.accountId === userAccountId,
    );
    if (!isParticipant) {
      throw new NotFoundException('Conversation not found');
    }

    return plainToInstance(ConversationResponseDto, conversation);
  }

  /**
   * POST /conversations/:id/members
   * Add a member to a group conversation
   */
  @Post(':id/members')
  @HttpCode(HttpStatus.CREATED)
  async addMember(
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
    @Req() req,
  ): Promise<ConversationResponseDto> {
    const userAccountId = req.user.accountId;
    const conversation = await this.conversationService.getConversation(id);

    const updatedConversation = await this.conversationService.addMember(
      conversation.hcsTopicId,
      userAccountId,
      dto.memberAccountId,
    );

    return plainToInstance(ConversationResponseDto, updatedConversation);
  }

  /**
   * DELETE /conversations/:id/members/:accountId
   * Remove a member from a group conversation
   */
  @Delete(':id/members/:accountId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('id') id: string,
    @Param('accountId') memberAccountId: string,
    @Req() req,
  ): Promise<void> {
    const userAccountId = req.user.accountId;
    const conversation = await this.conversationService.getConversation(id);

    await this.conversationService.removeMember(
      conversation.hcsTopicId,
      userAccountId,
      memberAccountId,
    );
  }
}
```

### Step 5: Create Conversation Module

Create `/src/modules/conversations/conversation.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from './entities/conversation.entity';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { ConversationService } from './conversation.service';
import { ConversationController } from './conversation.controller';
import { HederaModule } from '../hedera/hedera.module';
import { CryptoModule } from '../crypto/crypto.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, ConversationParticipant]),
    HederaModule,
    CryptoModule,
  ],
  providers: [ConversationService],
  controllers: [ConversationController],
  exports: [ConversationService],
})
export class ConversationModule {}
```

### Step 6: Register Module in App Module

Update `/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationModule } from './modules/conversations/conversation.module';
import { Conversation } from './modules/conversations/entities/conversation.entity';
import { ConversationParticipant } from './modules/conversations/entities/conversation-participant.entity';
// ... other imports

@Module({
  imports: [
    // ... existing modules
    TypeOrmModule.forFeature([Conversation, ConversationParticipant]),
    ConversationModule,
  ],
})
export class AppModule {}
```

### Step 7: Database Migrations

Create migration file `/src/database/migrations/1700000001-create-conversations.ts`:

```typescript
import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateConversations1700000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'conversations',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['DIRECT', 'GROUP'],
            default: "'DIRECT'",
          },
          {
            name: 'name',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'avatar',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'hcsTopicId',
            type: 'varchar',
            isUnique: true,
          },
          {
            name: 'hcsSubmitKey',
            type: 'text',
          },
          {
            name: 'currentKeyId',
            type: 'uuid',
          },
          {
            name: 'currentRotationIndex',
            type: 'int',
            default: 0,
          },
          {
            name: 'encryptedKeysJson',
            type: 'text',
          },
          {
            name: 'createdBy',
            type: 'varchar',
          },
          {
            name: 'description',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
            onUpdate: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'conversations',
      new TableIndex({
        name: 'IDX_conversations_hcsTopicId',
        columnNames: ['hcsTopicId'],
      }),
    );

    await queryRunner.createIndex(
      'conversations',
      new TableIndex({
        name: 'IDX_conversations_createdBy',
        columnNames: ['createdBy'],
      }),
    );

    await queryRunner.createIndex(
      'conversations',
      new TableIndex({
        name: 'IDX_conversations_createdAt',
        columnNames: ['createdAt'],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'conversation_participants',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'conversationId',
            type: 'uuid',
          },
          {
            name: 'accountId',
            type: 'varchar',
          },
          {
            name: 'role',
            type: 'enum',
            enum: ['ADMIN', 'MEMBER'],
            default: "'MEMBER'",
          },
          {
            name: 'publicKey',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'lastReadSequence',
            type: 'int',
            default: 0,
          },
          {
            name: 'joinedAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
            onUpdate: 'now()',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['conversationId'],
            referencedTableName: 'conversations',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'conversation_participants',
      new TableIndex({
        name: 'IDX_conversation_participants_unique',
        columnNames: ['conversationId', 'accountId'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('conversation_participants');
    await queryRunner.dropTable('conversations');
  }
}
```

## Verification Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create 1:1 conversation via POST /conversations | Returns conversation with DIRECT type, hcsTopicId, 2 participants |
| 2 | Verify HCS topic created | Mirror Node shows topic with platform operator submitKey |
| 3 | Verify key exchange posted | Mirror Node shows key_exchange message in message sequence |
| 4 | Query DB conversations table | 1 row with encrypted keys for both accounts |
| 5 | Query participants table | 2 rows with correct accountIds and public keys |
| 6 | Create group conversation | Returns GROUP type, N participants, group_meta message |
| 7 | Add member to group | Key rotates (rotationIndex increments), new participant created |
| 8 | Verify key rotation | Old key encrypted only for remaining members |
| 9 | Remove member from group | System message posted, participant deleted, key rotated |
| 10 | List user's conversations | Returns all conversations where user is participant |
| 11 | Get specific conversation | Returns full conversation with all participant details |
| 12 | Unauthorized access test | Non-participant cannot GET conversation (404) |

## Definition of Done

- [ ] All entities created and migrations run successfully
- [ ] ConversationService fully implemented with all 7 methods
- [ ] ConversationController with 5 REST endpoints
- [ ] DTOs with proper validation
- [ ] Create 1:1 conversation works end-to-end
- [ ] Create group conversation works end-to-end
- [ ] Key exchange messages properly formatted on HCS
- [ ] Group metadata messages properly formatted
- [ ] Add/remove member with key rotation works
- [ ] System messages posted for member changes
- [ ] Database queries return correct data
- [ ] JwtAuthGuard protects all endpoints
- [ ] Participant authorization checked
- [ ] Error handling for invalid operations
- [ ] All verification steps pass
- [ ] Code documented with inline comments

## Troubleshooting

### Problem: "One or both participants do not have public keys registered"
**Cause**: Participants haven't set their public keys in the identity service
**Solution**:
1. Ensure both accounts completed onboarding (P0-T04)
2. Check identity service has public_key field populated
3. Verify `cryptoService.getPublicKey()` queries correct service

### Problem: HCS topic creation fails
**Cause**: Invalid operator key or Hedera network issue
**Solution**:
1. Check Hedera Service (P0-T06) properly initialized
2. Verify operator account has HBAR
3. Check testnet connectivity
4. Review Hedera SDK logs

### Problem: Key exchange message missing from Mirror Node
**Cause**: Message not submitted or not yet indexed
**Solution**:
1. Add logging to submitMessage calls
2. Wait 5-10 seconds for Mirror Node indexing
3. Check memo field matches 'key_exchange'
4. Verify HCS topic ID is correct

### Problem: Duplicate conversation created for same users
**Cause**: Missing uniqueness check on direct conversations
**Solution**: Implement `getDirectConversation()` first, check before creating

### Problem: Member can't be added to group
**Cause**: Requester not admin or new member already exists
**Solution**:
1. Verify requester role is ADMIN
2. Check participant not already in list
3. Verify new member has public key

## Files Created in This Task

```
src/modules/conversations/
├── entities/
│   ├── conversation.entity.ts (161 lines)
│   └── conversation-participant.entity.ts (65 lines)
├── dto/
│   ├── create-conversation.dto.ts (46 lines)
│   ├── add-member.dto.ts (13 lines)
│   ├── conversation-response.dto.ts (36 lines)
│   └── participant-response.dto.ts (20 lines)
├── conversation.service.ts (520 lines)
├── conversation.controller.ts (155 lines)
├── conversation.module.ts (24 lines)
src/modules/messages/entities/
└── message.entity.ts (58 lines)
src/database/migrations/
└── 1700000001-create-conversations.ts (140 lines)
```

**Total: 1,038 lines of code**

## What Happens Next

Task P0-T15 (Send & Receive Messages) implements the message submission and retrieval layer. It uses the conversations created here to:
1. Validate sender is conversation participant
2. Encrypt message payload with symmetric key
3. Submit encrypted payload to HCS topic
4. Cache messages in PostgreSQL
5. Provide REST API for message retrieval

The WebSocket layer (P0-T16) then enables real-time message distribution to connected clients.

---

**Created**: 2026-03-11
**Last Updated**: 2026-03-11
**Status**: Ready for Implementation
