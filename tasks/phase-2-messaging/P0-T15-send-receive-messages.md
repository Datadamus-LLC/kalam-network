# Task P0-T15: Send & Receive Messages

| Field | Value |
|-------|-------|
| Task ID | P0-T15 |
| Priority | Critical |
| Estimated Time | 6 hours |
| Depends On | P0-T14 (Create Conversation) |
| Phase | 2 — Messaging |
| Assignee | Junior Backend Developer |

---

## Objective

Implement complete message sending, retrieval, and synchronization functionality. Messages are encrypted with AES-256-GCM and submitted to HCS topics. A Mirror Node polling service keeps the database in sync with the immutable ledger. Pinata IPFS integration enables encrypted media storage.

## Background

### Message Flow Architecture

```
Client (Plaintext Message)
    ↓
Encrypt with conversation's AES-256-GCM symmetric key
    ↓
Submit encrypted payload to HCS topic
    ↓
Message indexed by HCS and Mirror Node
    ↓
Mirror Node polling service detects new message
    ↓
Fetch full message from Mirror Node
    ↓
Store in PostgreSQL cache for fast queries
    ↓
Emit WebSocket event to online subscribers
    ↓
Clients request message history via REST (cached)
```

### Message Structure (Encrypted)

Before encryption, message payload is JSON:
```json
{
  "v": "1.0",
  "type": "message",
  "sender": "0.0.ACCOUNT_ID",
  "ts": 1700000000000,
  "content": {
    "type": "text|image|file|voice",
    "text": "Hello world",
    "mediaRef": "ipfs://QmXxxx",
    "mediaMeta": {
      "filename": "photo.jpg",
      "mimeType": "image/jpeg",
      "size": 102400,
      "dimensions": "1920x1080"
    }
  },
  "replyTo": null,
  "nonce": "base64(random_96_bytes)"
}
```

Then encrypted with AES-256-GCM:
- Key: Symmetric key from conversation (32 bytes)
- IV: Random 12 bytes (included in ciphertext)
- Auth tag: 16 bytes (included in ciphertext)
- Result: base64(iv + ciphertext + authTag)

### Mirror Node REST API

```
GET https://testnet.mirrornode.hedera.com/api/v1/topics/{topicId}/messages
Query Parameters:
  - limit: 100 (max results per page)
  - sequencenumber=gt:{lastSeq} (get messages after sequence)
  - order=asc
  - timestamp=gt:{ISO8601_timestamp}
```

## Pre-requisites

- Hedera Service fully implemented (P0-T06)
- Crypto Service with encryption/decryption (P0-T03)
- Conversation Service created (P0-T14)
- PostgreSQL with messages table
- Redis connection
- Pinata API credentials
- Mirror Node testnet access

## Step-by-Step Instructions

### Step 1: Configure Pinata IPFS

Update `.env`:

```env
# Pinata IPFS Configuration
PINATA_API_KEY=your_api_key_here
PINATA_API_SECRET=your_api_secret_here
PINATA_GATEWAY_URL=https://gateway.pinata.cloud

# Mirror Node Configuration
MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com
```

### Step 2: Create Message Service (Core)

Create `/src/modules/messages/message.service.ts`:

```typescript
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { Message } from './entities/message.entity';
import { Conversation } from '../conversations/entities/conversation.entity';
import { HederaService } from '../hedera/hedera.service';
import { CryptoService } from '../crypto/crypto.service';
import { MirrorNodeService } from '../hedera/mirror-node.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface MessagePayload {
  v: string;
  type: 'message' | 'system' | 'key_exchange' | 'group_meta';
  sender: string;
  ts: number;
  content: {
    type: 'text' | 'image' | 'file' | 'voice';
    text?: string;
    mediaRef?: string;
    mediaMeta?: {
      filename: string;
      mimeType: string;
      size: number;
      dimensions?: string;
    };
  };
  replyTo?: number;
  nonce: string;
}

export interface PaginatedMessages {
  messages: Message[];
  cursor: string; // sequence number for next page
  hasMore: boolean;
}

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);
  private pinataApiKey: string;
  private pinataApiSecret: string;
  private pinataGateway: string;

  constructor(
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    private hederaService: HederaService,
    private cryptoService: CryptoService,
    private mirrorNodeService: MirrorNodeService,
    private configService: ConfigService,
  ) {
    this.pinataApiKey = this.configService.get<string>('PINATA_API_KEY');
    this.pinataApiSecret = this.configService.get<string>('PINATA_API_SECRET');
    this.pinataGateway = this.configService.get<string>(
      'PINATA_GATEWAY_URL',
      'https://gateway.pinata.cloud',
    );
  }

  /**
   * Send a message to a conversation
   * Flow:
   * 1. Validate sender is conversation participant
   * 2. Create message payload with nonce
   * 3. Encrypt payload with conversation's symmetric key
   * 4. Submit encrypted payload to HCS topic
   * 5. Store in PostgreSQL cache
   * 6. Return message record
   */
  async sendMessage(
    senderAccountId: string,
    topicId: string,
    textContent: string,
    mediaRef?: string,
    mediaMeta?: { filename: string; mimeType: string; size: number; dimensions?: string },
    replyToSequence?: number,
  ): Promise<Message> {
    this.logger.debug(
      `Sending message to topic ${topicId} from ${senderAccountId}`,
    );

    // Get conversation
    const conversation = await this.conversationRepository.findOne({
      where: { hcsTopicId: topicId },
      relations: ['participants'],
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation with topic ${topicId} not found`);
    }

    // Validate sender is participant
    const sender = conversation.participants.find(
      (p) => p.accountId === senderAccountId,
    );
    if (!sender) {
      throw new ForbiddenException('You are not a member of this conversation');
    }

    // Decrypt conversation's symmetric key (encrypted for sender)
    const encryptedKeys = JSON.parse(conversation.encryptedKeysJson);
    const encryptedKeyForSender = encryptedKeys[senderAccountId];

    if (!encryptedKeyForSender) {
      throw new BadRequestException(
        'No encryption key found for your account in this conversation',
      );
    }

    let symmetricKey: Buffer;
    try {
      symmetricKey = await this.cryptoService.decryptFromPrivateKey(
        encryptedKeyForSender,
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Failed to decrypt symmetric key: ${errorMessage}`);
      throw new BadRequestException('Failed to decrypt message key');
    }

    // Create message payload
    const nonce = crypto.randomBytes(12).toString('base64'); // AES-GCM uses 12-byte IV
    const messagePayload: MessagePayload = {
      v: '1.0',
      type: 'message',
      sender: senderAccountId,
      ts: Date.now(),
      content: {
        type: mediaRef ? 'image' : 'text',
        text: textContent,
        ...(mediaRef && {
          mediaRef,
          mediaMeta: mediaMeta || {},
        }),
      },
      replyTo: replyToSequence || null,
      nonce,
    };

    // Encrypt payload
    const encryptedPayload = this.encryptMessagePayload(
      JSON.stringify(messagePayload),
      symmetricKey,
    );

    // Submit to HCS
    let hcsSequenceNumber: number;
    try {
      const result = await this.hederaService.submitMessage(
        topicId,
        encryptedPayload,
        'message',
      );
      hcsSequenceNumber = result.sequenceNumber;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Failed to submit message to HCS: ${errorMessage}`);
      throw new BadRequestException('Failed to submit message to HCS');
    }

    // Store in PostgreSQL cache
    const message = this.messageRepository.create({
      conversationId: conversation.id,
      hcsTopicId: topicId,
      hcsSequenceNumber,
      senderAccountId,
      encryptedPayload,
      hcsMemo: 'message',
    });

    await this.messageRepository.save(message);

    this.logger.log(
      `Message sent: ${message.id} to ${topicId} (sequence: ${hcsSequenceNumber})`,
    );

    return message;
  }

  /**
   * Get paginated messages for a conversation
   * Returns cached messages from PostgreSQL with pagination
   */
  async getMessages(
    topicId: string,
    limit: number = 50,
    cursor?: string, // sequence number to start from
  ): Promise<PaginatedMessages> {
    const conversation = await this.conversationRepository.findOne({
      where: { hcsTopicId: topicId },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation with topic ${topicId} not found`);
    }

    let query = this.messageRepository
      .createQueryBuilder('m')
      .where('m.conversationId = :conversationId', {
        conversationId: conversation.id,
      })
      .where('m.hcsMemo = :memo', { memo: 'message' }) // Only actual messages, not system
      .orderBy('m.hcsSequenceNumber', 'DESC');

    // Cursor-based pagination (get messages after cursor)
    if (cursor) {
      const cursorSeq = parseInt(cursor, 10);
      query = query.where('m.hcsSequenceNumber < :cursor', { cursor: cursorSeq });
    }

    query = query.take(limit + 1); // +1 to detect if more exist

    const results = await query.getMany();

    const hasMore = results.length > limit;
    const messages = results.slice(0, limit).reverse(); // Reverse for chronological order

    const nextCursor =
      messages.length > 0
        ? messages[messages.length - 1].hcsSequenceNumber.toString()
        : null;

    return {
      messages,
      cursor: nextCursor,
      hasMore,
    };
  }

  /**
   * Synchronize messages from Mirror Node
   * Polls Mirror Node REST API for new messages and stores in DB
   * Called periodically by MessageSyncService
   */
  async syncFromMirrorNode(topicId: string, afterSequence: number = 0): Promise<number> {
    this.logger.debug(
      `Syncing messages from Mirror Node for topic ${topicId} after sequence ${afterSequence}`,
    );

    const conversation = await this.conversationRepository.findOne({
      where: { hcsTopicId: topicId },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation with topic ${topicId} not found`);
    }

    try {
      const mirrorNodeUrl = this.configService.get<string>(
        'MIRROR_NODE_URL',
        'https://testnet.mirrornode.hedera.com',
      );

      const url = `${mirrorNodeUrl}/api/v1/topics/${topicId}/messages`;
      const params: Record<string, string | number> = {
        limit: 100,
        order: 'asc',
      };

      if (afterSequence > 0) {
        params.sequencenumber = `gt:${afterSequence}`;
      }

      const response = await axios.get(url, { params });

      const messages = response.data.messages || [];
      let maxSequence = afterSequence;

      for (const hcsMessage of messages) {
        const sequenceNumber = parseInt(hcsMessage.sequence_number, 10);
        maxSequence = Math.max(maxSequence, sequenceNumber);

        // Check if already in DB
        const exists = await this.messageRepository.findOne({
          where: {
            conversationId: conversation.id,
            hcsSequenceNumber: sequenceNumber,
          },
        });

        if (!exists) {
          const message = this.messageRepository.create({
            conversationId: conversation.id,
            hcsTopicId: topicId,
            hcsSequenceNumber: sequenceNumber,
            senderAccountId: 'MIRROR_NODE', // Will be parsed from payload
            encryptedPayload: hcsMessage.message,
            hcsMemo: hcsMessage.payer_account_id || 'message',
            createdAt: new Date(hcsMessage.consensus_timestamp),
          });

          await this.messageRepository.save(message);
        }
      }

      this.logger.log(
        `Synced ${messages.length} messages from Mirror Node for topic ${topicId}`,
      );

      return maxSequence;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `Failed to sync messages from Mirror Node: ${errorMessage}`,
      );
      throw err;
    }
  }

  /**
   * Get last synced sequence number for a conversation
   * Used by sync service to know where to start polling
   */
  async getLastSyncedSequence(topicId: string): Promise<number> {
    const lastMessage = await this.messageRepository.findOne({
      where: { hcsTopicId: topicId },
      order: { hcsSequenceNumber: 'DESC' },
    });

    return lastMessage ? lastMessage.hcsSequenceNumber : 0;
  }

  /**
   * Upload encrypted media to IPFS
   * File is encrypted client-side before upload
   */
  async uploadEncryptedMedia(file: Express.Multer.File): Promise<{
    cid: string;
    size: number;
    mimeType: string;
  }> {
    this.logger.debug(
      `Uploading encrypted media: ${file.originalname} (${file.size} bytes)`,
    );

    try {
      const formData = new FormData();
      const blob = new Blob([file.buffer], { type: file.mimetype });
      formData.append('file', blob, file.originalname);

      // Pinata API
      const response = await axios.post(
        'https://api.pinata.cloud/pinning/pinFileToIPFS',
        formData,
        {
          headers: {
            pinata_api_key: this.pinataApiKey,
            pinata_secret_api_key: this.pinataApiSecret,
            'Content-Type': 'multipart/form-data',
          },
        },
      );

      const cid = response.data.IpfsHash;

      this.logger.log(
        `Uploaded encrypted media to IPFS: ${cid}`,
      );

      return {
        cid,
        size: file.size,
        mimeType: file.mimetype,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Failed to upload to IPFS: ${errorMessage}`);
      throw new BadRequestException('Failed to upload media');
    }
  }

  /**
   * Download encrypted media from IPFS
   */
  async getEncryptedMediaUrl(cid: string): Promise<string> {
    return `${this.pinataGateway}/ipfs/${cid}`;
  }

  /**
   * Encrypt message payload using AES-256-GCM
   * Returns base64(iv + ciphertext + authTag)
   */
  private encryptMessagePayload(plaintext: string, key: Buffer): string {
    const iv = crypto.randomBytes(12); // 12 bytes for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Combine: iv + ciphertext + authTag
    const combined = Buffer.concat([
      iv,
      Buffer.from(encrypted, 'hex'),
      authTag,
    ]);

    return combined.toString('base64');
  }

  /**
   * Decrypt message payload using AES-256-GCM
   * Expects base64(iv + ciphertext + authTag)
   */
  decryptMessagePayload(encryptedPayload: string, key: Buffer): MessagePayload {
    const combined = Buffer.from(encryptedPayload, 'base64');

    const iv = combined.slice(0, 12);
    const authTag = combined.slice(combined.length - 16);
    const ciphertext = combined.slice(12, combined.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted) as MessagePayload;
  }

  /**
   * Bulk decrypt messages for a user
   * Decrypts cached messages for display
   */
  async decryptMessages(
    messages: Message[],
    symmetricKey: Buffer,
  ): Promise<Array<Message & { decrypted: MessagePayload }>> {
    return messages.map((msg) => ({
      ...msg,
      decrypted: this.decryptMessagePayload(msg.encryptedPayload, symmetricKey),
    }));
  }
}
```

### Step 3: Create Message Sync Service

Create `/src/modules/messages/message-sync.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Conversation } from '../conversations/entities/conversation.entity';
import { MessageService } from './message.service';

/**
 * MessageSyncService polls Mirror Node for new messages every 30 seconds
 * and keeps the PostgreSQL cache in sync
 */
@Injectable()
export class MessageSyncService {
  private readonly logger = new Logger(MessageSyncService.name);
  private lastSyncedSequences: Map<string, number> = new Map();

  constructor(
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    private messageService: MessageService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Run sync job every 30 seconds for all active conversations
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async syncAllConversations() {
    this.logger.debug('Starting Mirror Node sync job');

    try {
      const conversations = await this.conversationRepository.find({
        where: { isActive: true },
      });

      for (const conversation of conversations) {
        await this.syncConversation(conversation.hcsTopicId);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Sync job failed: ${errorMessage}`);
    }
  }

  /**
   * Sync a specific conversation
   */
  private async syncConversation(topicId: string) {
    try {
      const lastSequence = this.lastSyncedSequences.get(topicId) || 0;
      const newLastSequence = await this.messageService.syncFromMirrorNode(
        topicId,
        lastSequence,
      );

      if (newLastSequence > lastSequence) {
        this.lastSyncedSequences.set(topicId, newLastSequence);

        // Emit event for WebSocket distribution
        this.eventEmitter.emit('messages.synced', {
          topicId,
          lastSequence: newLastSequence,
        });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(
        `Failed to sync conversation ${topicId}: ${errorMessage}`,
      );
    }
  }

  /**
   * Manually trigger sync for a conversation (for testing)
   */
  async manualSync(topicId: string): Promise<void> {
    await this.syncConversation(topicId);
  }
}
```

### Step 4: Create Message Controller

Create `/src/modules/messages/message.controller.ts`:

```typescript
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MessageService } from './message.service';
import { SendMessageDto } from './dto/send-message.dto';
import { MessageResponseDto } from './dto/message-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { plainToInstance } from 'class-transformer';

@Controller('conversations/:topicId/messages')
@UseGuards(JwtAuthGuard)
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  /**
   * POST /conversations/:topicId/messages
   * Send a message to a conversation
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(
    @Param('topicId') topicId: string,
    @Body() dto: SendMessageDto,
    @Req() req: Request & { user: { accountId: string } },
  ): Promise<MessageResponseDto> {
    const senderAccountId = req.user.accountId;

    const message = await this.messageService.sendMessage(
      senderAccountId,
      topicId,
      dto.text,
      dto.mediaRef,
      dto.mediaMeta,
      dto.replyToSequence,
    );

    return plainToInstance(MessageResponseDto, message);
  }

  /**
   * GET /conversations/:topicId/messages
   * Get paginated messages for a conversation
   */
  @Get()
  async getMessages(
    @Param('topicId') topicId: string,
    @Query('limit') limit: string = '50',
    @Query('cursor') cursor?: string,
  ) {
    const limitNum = Math.min(parseInt(limit, 10), 100); // Max 100

    if (isNaN(limitNum) || limitNum < 1) {
      throw new BadRequestException('Invalid limit parameter');
    }

    const result = await this.messageService.getMessages(topicId, limitNum, cursor);

    return {
      data: result.messages.map((m) =>
        plainToInstance(MessageResponseDto, m),
      ),
      pagination: {
        cursor: result.cursor,
        hasMore: result.hasMore,
      },
    };
  }

  /**
   * POST /conversations/:topicId/messages/media
   * Upload encrypted media file
   */
  @Post('media')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  async uploadMedia(
    @Param('topicId') topicId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File exceeds maximum size of 50MB');
    }

    const result = await this.messageService.uploadEncryptedMedia(file);

    return {
      cid: result.cid,
      url: await this.messageService.getEncryptedMediaUrl(result.cid),
      size: result.size,
      mimeType: result.mimeType,
    };
  }
}
```

### Step 5: Create DTOs

Create `/src/modules/messages/dto/send-message.dto.ts`:

```typescript
import {
  IsString,
  IsOptional,
  IsNumber,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MediaMetaDto {
  @IsString()
  filename: string;

  @IsString()
  mimeType: string;

  @IsNumber()
  size: number;

  @IsOptional()
  @IsString()
  dimensions?: string;
}

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  text: string;

  @IsOptional()
  @IsString()
  mediaRef?: string; // IPFS CID

  @IsOptional()
  @ValidateNested()
  @Type(() => MediaMetaDto)
  mediaMeta?: MediaMetaDto;

  @IsOptional()
  @IsNumber()
  replyToSequence?: number;
}
```

Create `/src/modules/messages/dto/message-response.dto.ts`:

```typescript
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class MessageResponseDto {
  @Expose()
  id: string;

  @Expose()
  conversationId: string;

  @Expose()
  hcsTopicId: string;

  @Expose()
  hcsSequenceNumber: number;

  @Expose()
  senderAccountId: string;

  @Expose()
  hcsMemo: string;

  @Expose()
  createdAt: Date;
}
```

### Step 6: Create Message Module

Create `/src/modules/messages/message.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Message } from './entities/message.entity';
import { Conversation } from '../conversations/entities/conversation.entity';
import { MessageService } from './message.service';
import { MessageController } from './message.controller';
import { MessageSyncService } from './message-sync.service';
import { HederaModule } from '../hedera/hedera.module';
import { CryptoModule } from '../crypto/crypto.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Message, Conversation]),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    HederaModule,
    CryptoModule,
  ],
  providers: [MessageService, MessageSyncService],
  controllers: [MessageController],
  exports: [MessageService, MessageSyncService],
})
export class MessageModule {}
```

### Step 7: Register in App Module

Update `/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MessageModule } from './modules/messages/message.module';
import { Message } from './modules/messages/entities/message.entity';

@Module({
  imports: [
    // ... existing modules
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    TypeOrmModule.forFeature([Message]),
    MessageModule,
  ],
})
export class AppModule {}
```

### Step 8: Database Migration

Create `/src/database/migrations/1700000002-create-messages.ts`:

```typescript
import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateMessages1700000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'messages',
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
            name: 'hcsTopicId',
            type: 'varchar',
          },
          {
            name: 'hcsSequenceNumber',
            type: 'int',
          },
          {
            name: 'senderAccountId',
            type: 'varchar',
          },
          {
            name: 'encryptedPayload',
            type: 'text',
          },
          {
            name: 'hcsMemo',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'decryptedCache',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
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
      'messages',
      new TableIndex({
        name: 'IDX_messages_unique',
        columnNames: ['conversationId', 'hcsSequenceNumber'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'messages',
      new TableIndex({
        name: 'IDX_messages_conversation_time',
        columnNames: ['conversationId', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'messages',
      new TableIndex({
        name: 'IDX_messages_memo',
        columnNames: ['hcsMemo'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('messages');
  }
}
```

### Step 9: Environment Configuration

Create `/src/modules/messages/message.constants.ts`:

```typescript
export const MESSAGE_CONSTANTS = {
  MAX_TEXT_LENGTH: 5000,
  MAX_FILE_SIZE_MB: 50,
  MIRROR_NODE_POLL_INTERVAL_MS: 30000, // 30 seconds
  MIRROR_NODE_BATCH_SIZE: 100,
  MESSAGE_CACHE_TTL_HOURS: 24,
  AES_256_GCM_KEY_LENGTH: 32, // bytes
  AES_256_GCM_IV_LENGTH: 12, // bytes
  AES_256_GCM_AUTH_TAG_LENGTH: 16, // bytes
};
```

## Verification Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send message via POST /conversations/{topicId}/messages | Returns message with hcsSequenceNumber, createdAt |
| 2 | Verify HCS submission | Message appears in Mirror Node within 5-10 seconds |
| 3 | Query DB messages table | Message cached with encryptedPayload, correct sequence |
| 4 | Wait 30 seconds | MessageSyncService polls Mirror Node |
| 5 | Query messages from DB again | Message visible via getMessages() endpoint |
| 6 | Get paginated messages | Returns array in reverse chronological order with cursor |
| 7 | Test pagination with cursor | Next page returns older messages correctly |
| 8 | Upload encrypted media | Returns IPFS CID and URL |
| 9 | Verify IPFS | File accessible via gateway URL |
| 10 | Send message with mediaRef | Message includes media reference and metadata |
| 11 | Test decryption | Message payload decrypts correctly with symmetric key |
| 12 | Send with replyToSequence | Message includes replyTo field |
| 13 | Non-participant sends | Receives 403 ForbiddenException |
| 14 | Unauthorized request | Fails JwtAuthGuard |
| 15 | Large file upload | Rejected (>50MB) |

## Definition of Done

- [ ] Message service fully implemented with 6 methods
- [ ] Message controller with 3 REST endpoints
- [ ] Message sync service running on schedule
- [ ] DTOs with proper validation
- [ ] AES-256-GCM encryption/decryption working
- [ ] Send message works end-to-end (to HCS, cached in DB)
- [ ] Mirror Node polling updates database
- [ ] Messages return in correct chronological order
- [ ] Cursor-based pagination works
- [ ] Pinata IPFS upload/download working
- [ ] Media metadata stored and retrievable
- [ ] File size validation (max 50MB)
- [ ] Sender validation (must be participant)
- [ ] Message decryption on retrieval (tested)
- [ ] All database migrations run successfully
- [ ] All verification steps pass
- [ ] Error handling complete (404, 403, 400)
- [ ] Logging comprehensive

## Troubleshooting

### Problem: "No encryption key found for your account"
**Cause**: Symmetric key not encrypted for sender's account
**Solution**:
1. Verify sender is in conversation.participants
2. Check encryptedKeysJson has entry for sender's accountId
3. Manually reload conversation from DB

### Problem: "Failed to decrypt symmetric key"
**Cause**: Sender's private key not available or wrong key used
**Solution**:
1. Verify Crypto Service (P0-T03) fully implemented
2. Check private key file permissions
3. Ensure Key Storage initialized

### Problem: HCS message appears but not in database after 30 seconds
**Cause**: Mirror Node sync service not running or failed
**Solution**:
1. Check NestJS schedule is enabled (ScheduleModule)
2. Check logs for sync errors
3. Verify Mirror Node URL is correct
4. Manually call `messageService.syncFromMirrorNode(topicId)`

### Problem: Pinata upload fails
**Cause**: API credentials missing or invalid
**Solution**:
1. Verify PINATA_API_KEY and PINATA_API_SECRET in .env
2. Check credentials haven't expired on pinata.cloud
3. Verify file is not empty
4. Check file size < 50MB

### Problem: AES-256-GCM decryption fails with "Bad auth tag"
**Cause**: Wrong key used or encrypted payload corrupted
**Solution**:
1. Verify correct symmetric key retrieved
2. Check encryptedPayload is valid base64
3. Ensure IV and authTag not modified
4. Log encrypted payload length (should be plaintext + 12 + 16 bytes)

### Problem: Cursor pagination returns empty results
**Cause**: Cursor sequence number out of range
**Solution**:
1. Verify cursor is valid sequence number
2. Check query with cursor < conversationId messages
3. Test without cursor first (should return latest)

## Files Created in This Task

```
src/modules/messages/
├── entities/
│   └── message.entity.ts (52 lines)
├── dto/
│   ├── send-message.dto.ts (28 lines)
│   └── message-response.dto.ts (18 lines)
├── message.service.ts (425 lines)
├── message.controller.ts (115 lines)
├── message-sync.service.ts (75 lines)
├── message.module.ts (28 lines)
├── message.constants.ts (16 lines)
src/database/migrations/
└── 1700000002-create-messages.ts (110 lines)
```

**Total: 867 lines of code**

## What Happens Next

Task P0-T16 (WebSocket Gateway) consumes messages from MessageSyncService:
1. Subscribes to 'messages.synced' event
2. Broadcasts new message payload to connected WebSocket clients
3. Maintains real-time conversation view
4. Handles typing indicators and read receipts (WebSocket only)

The frontend (P0-T17) then:
1. Connects to WebSocket gateway
2. Subscribes to conversation rooms
3. Decrypts received messages with cached symmetric key
4. Displays messages in chronological order
5. Handles optimistic UI updates

---

**Created**: 2026-03-11
**Last Updated**: 2026-03-11
**Status**: Ready for Implementation
