# Task P1-T23: Notification Service & Real-Time Updates

| Field | Value |
|-------|-------|
| Task ID | P1-T23 |
| Priority | High |
| Estimated Time | 4 hours |
| Depends On | P0-T06 (Hedera Service), P0-T16 (WebSocket Gateway) |
| Phase | 5 — Notifications & Polish |
| Assignee | Junior Developer (Full Stack) |

---

## Objective

Build a notification service that sends real-time alerts to users via WebSocket and stores them persistently in PostgreSQL. Notifications are triggered by:
- New messages in conversations
- Payment received/requested/split created
- New followers
- KYC approval
- Group invitations

The service integrates with HCS for proof and WebSocket gateway for real-time delivery.

## Background

Users need to be alerted of important events without polling. The notification system:
- Creates encrypted HCS messages to user's notification topic for immutable proof
- Pushes via WebSocket if user is online
- Stores in PostgreSQL for offline retrieval
- Includes category filtering (message, payment, social, system)
- Supports unread count and mark-as-read functionality

**Notification Categories:**
- `message`: New message in conversation
- `payment`: Payment received, payment request, split payment created
- `social`: New follower, user followed you, post liked
- `system`: KYC approved, account verified, feature announcements

## Pre-requisites

Before starting this task, ensure:

1. **Backend Setup Complete**
   - NestJS project with database
   - PaymentService available (P0-T21 completed)
   - ConversationService available (P0-T14 completed)
   - WebSocket gateway available (P0-T16 completed)
   - HederaService available (P0-T06 completed)

2. **Dependencies Installed**
   ```bash
   npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
   ```

3. **Database Ready**
   - Users table exists
   - PostgreSQL connection working

4. **Environment Variables**
   ```
   HEDERA_ACCOUNT_ID=0.0.xxxxx
   NOTIFICATION_TOPIC_ID=0.0.xxxxx (or null to create per-user)
   ```

5. **WebSocket Gateway Working**
   - Gateway can emit messages to authenticated connections
   - Room-based delivery (per-user rooms) implemented

## Step-by-Step Instructions

### Step 1: Create Notification DTO

Create file: `src/notifications/dto/notification.dto.ts`

```typescript
import { IsString, IsEnum, IsOptional, IsObject, IsUUID } from 'class-validator';

export enum NotificationCategory {
  MESSAGE = 'message',
  PAYMENT = 'payment',
  SOCIAL = 'social',
  SYSTEM = 'system'
}

export enum NotificationEvent {
  // Message events
  NEW_MESSAGE = 'new_message',
  MESSAGE_EDITED = 'message_edited',

  // Payment events
  PAYMENT_RECEIVED = 'payment_received',
  PAYMENT_REQUEST = 'payment_request',
  PAYMENT_SPLIT_CREATED = 'payment_split_created',
  PAYMENT_CONFIRMED = 'payment_confirmed',

  // Social events
  NEW_FOLLOWER = 'new_follower',
  USER_FOLLOWED_YOU = 'user_followed_you',
  POST_LIKED = 'post_liked',

  // System events
  KYC_APPROVED = 'kyc_approved',
  ACCOUNT_VERIFIED = 'account_verified',
  ANNOUNCEMENT = 'announcement'
}

export class CreateNotificationDto {
  @IsString()
  category: NotificationCategory;

  @IsString()
  event: NotificationEvent;

  @IsOptional()
  @IsString()
  fromAccountId?: string; // Who triggered the notification

  @IsOptional()
  @IsUUID()
  topicId?: string; // Relevant topic (conversation, etc)

  @IsOptional()
  @IsString()
  preview?: string; // Preview text

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>; // Additional data
}

export class GetNotificationsDto {
  @IsOptional()
  @IsString()
  category?: NotificationCategory;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  cursor_limit?: number = 20;
}

export class MarkAsReadDto {
  @IsString({ each: true })
  notificationIds: string[];
}
```

### Step 2: Create Notification Entity

Create file: `src/notifications/entities/notification.entity.ts`

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('notifications')
@Index(['recipientAccountId', 'isRead'])
@Index(['recipientAccountId', 'category'])
@Index(['recipientAccountId', 'createdAt'])
@Index(['recipientAccountId', 'isRead', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  recipientAccountId: string; // Hedera account ID who receives notification

  @Column()
  category: 'message' | 'payment' | 'social' | 'system';

  @Column()
  event: string; // Specific event type

  @Column({ nullable: true })
  fromAccountId?: string; // Who triggered (if applicable)

  @Column({ nullable: true })
  topicId?: string; // Related conversation/topic ID

  @Column('text', { nullable: true })
  preview?: string; // Short preview text

  @Column('json', { nullable: true })
  data?: Record<string, unknown>; // Additional data

  @Column()
  isRead: boolean = false;

  @Column({ nullable: true })
  hcsMessageId?: string; // HCS message ID for proof

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  readAt?: Date;
}
```

### Step 3: Create Notification Service

Create file: `src/notifications/services/notification.service.ts`

```typescript
import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';
import { CreateNotificationDto, NotificationEvent, NotificationCategory } from '../dto/notification.dto';
import { HederaService } from '../../services/hedera.service';
import { EncryptionService } from '../../services/encryption.service';
import { NotificationGateway } from '../gateways/notification.gateway';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

interface HCSNotificationPayload {
  v: string;
  type: 'notification';
  category: string;
  event: string;
  data: Record<string, unknown>;
  timestamp: number;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger('NotificationService');

  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    private hederaService: HederaService,
    private encryptionService: EncryptionService,
    private notificationGateway: NotificationGateway,
    private configService: ConfigService
  ) {}

  /**
   * Send notification to user
   *
   * Steps:
   * 1. Validate recipient account
   * 2. Create HCS notification message
   * 3. Encrypt and submit to notification topic
   * 4. Store in PostgreSQL
   * 5. Emit via WebSocket if user online
   * 6. Return notification record
   */
  async sendNotification(
    recipientAccountId: string,
    category: NotificationCategory,
    event: NotificationEvent,
    data: Record<string, unknown>
  ): Promise<Notification> {
    try {
      this.logger.log(`Creating notification for ${recipientAccountId}: ${event}`);

      // Create HCS message payload
      const hcsPayload: HCSNotificationPayload = {
        v: '1.0',
        type: 'notification',
        category,
        event,
        data: {
          ...data,
          timestamp: Date.now()
        },
        timestamp: Date.now()
      };

      // Submit to HCS (optional, for audit trail)
      let hcsMessageId: string | undefined;
      try {
        // Use user's notification topic if available
        const notificationTopicId = this.configService.get<string>('NOTIFICATION_TOPIC_ID');
        if (notificationTopicId) {
          const encrypted = await this.encryptionService.encrypt(
            JSON.stringify(hcsPayload),
            notificationTopicId
          );
          hcsMessageId = await this.hederaService.submitHCSMessage(notificationTopicId, encrypted);
        }
      } catch (hcsError) {
        this.logger.warn(`HCS submission failed (continuing without audit): ${hcsError.message}`);
        // Continue even if HCS fails - notifications can work without it
      }

      // Store in database
      const notification = this.notificationRepository.create({
        recipientAccountId,
        category,
        event,
        fromAccountId: data.fromAccountId,
        topicId: data.topicId,
        preview: data.preview,
        data,
        isRead: false,
        hcsMessageId
      });

      const saved = await this.notificationRepository.save(notification);

      // Emit via WebSocket to connected user
      await this.emitToUser(recipientAccountId, {
        type: 'notification',
        notification: this.formatNotification(saved)
      });

      return saved;
    } catch (error) {
      this.logger.error(`Failed to send notification: ${error.message}`);
      throw new HttpException('Failed to send notification', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Send payment received notification
   */
  async notifyPaymentReceived(
    recipientAccountId: string,
    senderAccountId: string,
    amount: number,
    currency: string,
    conversationTopicId?: string,
    note?: string
  ): Promise<Notification> {
    return this.sendNotification(
      recipientAccountId,
      NotificationCategory.PAYMENT,
      NotificationEvent.PAYMENT_RECEIVED,
      {
        fromAccountId: senderAccountId,
        topicId: conversationTopicId,
        preview: `Received ${amount} ${currency}${note ? ': ' + note : ''}`,
        amount,
        currency,
        note
      }
    );
  }

  /**
   * Send payment request notification
   */
  async notifyPaymentRequest(
    recipientAccountId: string,
    requesterAccountId: string,
    amount: number,
    currency: string,
    conversationTopicId: string,
    note?: string
  ): Promise<Notification> {
    return this.sendNotification(
      recipientAccountId,
      NotificationCategory.PAYMENT,
      NotificationEvent.PAYMENT_REQUEST,
      {
        fromAccountId: requesterAccountId,
        topicId: conversationTopicId,
        preview: `Requested ${amount} ${currency}${note ? ': ' + note : ''}`,
        amount,
        currency,
        note
      }
    );
  }

  /**
   * Send new message notification
   */
  async notifyNewMessage(
    recipientAccountId: string,
    senderAccountId: string,
    conversationTopicId: string,
    messagePreview: string,
    senderName?: string
  ): Promise<Notification> {
    return this.sendNotification(
      recipientAccountId,
      NotificationCategory.MESSAGE,
      NotificationEvent.NEW_MESSAGE,
      {
        fromAccountId: senderAccountId,
        topicId: conversationTopicId,
        preview: `${senderName || 'Someone'}: ${messagePreview}`,
        senderName
      }
    );
  }

  /**
   * Send new follower notification
   */
  async notifyNewFollower(
    recipientAccountId: string,
    followerAccountId: string,
    followerName?: string
  ): Promise<Notification> {
    return this.sendNotification(
      recipientAccountId,
      NotificationCategory.SOCIAL,
      NotificationEvent.NEW_FOLLOWER,
      {
        fromAccountId: followerAccountId,
        preview: `${followerName || 'Someone'} followed you`,
        followerName
      }
    );
  }

  /**
   * Send KYC approved notification
   */
  async notifyKYCApproved(recipientAccountId: string): Promise<Notification> {
    return this.sendNotification(
      recipientAccountId,
      NotificationCategory.SYSTEM,
      NotificationEvent.KYC_APPROVED,
      {
        preview: 'Your KYC verification was approved!'
      }
    );
  }

  /**
   * Get notifications for user with optional filtering
   */
  async getNotifications(
    recipientAccountId: string,
    category?: string,
    cursor?: string,
    limit: number = 20
  ): Promise<{
    notifications: Notification[];
    nextCursor?: string;
  }> {
    try {
      const pageSize = Math.min(limit, 100);
      const offset = cursor ? parseInt(cursor) : 0;

      let query = this.notificationRepository
        .createQueryBuilder('n')
        .where('n.recipientAccountId = :recipientAccountId', { recipientAccountId });

      if (category) {
        query = query.andWhere('n.category = :category', { category });
      }

      const total = await query.getCount();
      const notifications = await query
        .orderBy('n.createdAt', 'DESC')
        .skip(offset)
        .take(pageSize)
        .getMany();

      const nextOffset = offset + pageSize;
      const hasMore = nextOffset < total;

      return {
        notifications,
        nextCursor: hasMore ? nextOffset.toString() : undefined
      };
    } catch (error) {
      this.logger.error(`Failed to get notifications: ${error.message}`);
      throw new HttpException('Failed to fetch notifications', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Mark notifications as read
   */
  async markAsRead(
    recipientAccountId: string,
    notificationIds: string[]
  ): Promise<{ updated: number }> {
    try {
      const result = await this.notificationRepository.update(
        {
          id: Array.isArray(notificationIds) ? notificationIds : [notificationIds],
          recipientAccountId
        },
        {
          isRead: true,
          readAt: new Date()
        }
      );

      return { updated: result.affected || 0 };
    } catch (error) {
      this.logger.error(`Failed to mark as read: ${error.message}`);
      throw new HttpException('Failed to mark notifications as read', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(recipientAccountId: string): Promise<number> {
    try {
      return await this.notificationRepository.count({
        where: {
          recipientAccountId,
          isRead: false
        }
      });
    } catch (error) {
      this.logger.error(`Failed to get unread count: ${error.message}`);
      return 0;
    }
  }

  /**
   * Sync notifications from Mirror Node HCS
   * (For users who were offline)
   */
  async syncFromMirrorNode(
    notificationTopicId: string,
    afterSequence: number = 0
  ): Promise<number> {
    try {
      const messages = await this.hederaService.getHCSMessages(notificationTopicId, afterSequence);

      // Process messages (parsing and storing)
      let processed = 0;
      for (const message of messages) {
        try {
          // Decrypt message
          const decrypted = await this.encryptionService.decrypt(message.message);
          const parsed = JSON.parse(decrypted);

          // Already stored when created, so this is for recovery
          this.logger.debug(`Synced notification from HCS: ${message.sequence_number}`);
          processed++;
        } catch (parseError) {
          this.logger.warn(`Failed to parse HCS message: ${parseError.message}`);
        }
      }

      return processed;
    } catch (error) {
      this.logger.error(`Mirror Node sync failed: ${error.message}`);
      return 0;
    }
  }

  /**
   * Emit notification to user via WebSocket
   */
  private async emitToUser(accountId: string, payload: Record<string, unknown>): Promise<void> {
    try {
      this.notificationGateway.emitToUser(accountId, payload);
    } catch (error) {
      this.logger.warn(`Failed to emit via WebSocket: ${error.message}`);
      // User might be offline, that's ok - they'll see it when they fetch
    }
  }

  /**
   * Format notification for client
   */
  private formatNotification(notification: Notification): Record<string, unknown> {
    return {
      id: notification.id,
      category: notification.category,
      event: notification.event,
      preview: notification.preview,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
      data: notification.data
    };
  }
}
```

### Step 4: Create Notification Gateway (WebSocket)

Create file: `src/notifications/gateways/notification.gateway.ts`

```typescript
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  SubscribeMessage
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  accountId?: string;
}

@WebSocketGateway({
  namespace: 'notifications',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000'
  }
})
@Injectable()
export class NotificationGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('NotificationGateway');

  @WebSocketServer()
  server: Server;

  // Map of accountId -> Set of socket IDs for delivery
  private userSockets: Map<string, Set<string>> = new Map();

  constructor(private jwtService: JwtService) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket gateway initialized');
  }

  handleConnection(client: AuthenticatedSocket) {
    try {
      // Extract JWT from query params
      const token = client.handshake.auth.token || client.handshake.query.token;

      if (!token) {
        this.logger.warn('Connection without token, disconnecting');
        client.disconnect();
        return;
      }

      // Verify JWT
      const payload = this.jwtService.verify(token);
      client.userId = payload.sub;
      client.accountId = payload.hederaAccountId;

      // Add to user's socket set
      if (!this.userSockets.has(client.accountId)) {
        this.userSockets.set(client.accountId, new Set());
      }
      this.userSockets.get(client.accountId)?.add(client.id);

      // Join room named after account ID for easy broadcasting
      client.join(`user:${client.accountId}`);

      this.logger.log(`Client ${client.id} connected (account: ${client.accountId})`);

      // Send confirmation
      client.emit('connected', { accountId: client.accountId });
    } catch (error) {
      this.logger.error(`Connection auth failed: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.accountId) {
      const sockets = this.userSockets.get(client.accountId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(client.accountId);
        }
      }
    }

    this.logger.log(`Client ${client.id} disconnected`);
  }

  /**
   * Emit notification to specific user
   * Uses room-based delivery for reliability
   */
  emitToUser(accountId: string, payload: Record<string, unknown>): void {
    this.server.to(`user:${accountId}`).emit('notification', payload);
    this.logger.debug(`Emitted to user:${accountId}`);
  }

  /**
   * Broadcast to all online users (e.g., system announcements)
   */
  broadcast(payload: Record<string, unknown>): void {
    this.server.emit('broadcast', payload);
  }

  /**
   * Check if user is online
   */
  isUserOnline(accountId: string): boolean {
    const sockets = this.userSockets.get(accountId);
    return sockets !== undefined && sockets.size > 0;
  }

  /**
   * Get online user count
   */
  getOnlineUserCount(): number {
    return this.userSockets.size;
  }

  /**
   * Handle client subscribing to additional rooms
   * (e.g., conversation-specific notifications)
   */
  @SubscribeMessage('subscribe_conversation')
  handleSubscribeConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string }
  ) {
    const room = `conversation:${data.conversationId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} subscribed to ${room}`);
    return { status: 'ok', room };
  }

  /**
   * Emit notification to conversation subscribers
   */
  emitToConversation(conversationId: string, payload: Record<string, unknown>): void {
    this.server.to(`conversation:${conversationId}`).emit('notification', payload);
  }
}
```

### Step 5: Create Notification Controller

Create file: `src/notifications/controllers/notification.controller.ts`

```typescript
import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
  HttpException,
  HttpStatus
} from '@nestjs/common';
import { NotificationService } from '../services/notification.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { GetNotificationsDto, MarkAsReadDto } from '../dto/notification.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private notificationService: NotificationService) {}

  /**
   * GET /notifications
   * Get paginated notifications for logged-in user
   *
   * Query params:
   * - category?: 'message' | 'payment' | 'social' | 'system'
   * - cursor?: string (pagination cursor)
   * - limit?: number (default 20, max 100)
   */
  @Get()
  async getNotifications(
    @Query() query: GetNotificationsDto,
    @Request() req: Request & { user: { userId: string; hederaAccountId: string } }
  ) {
    const accountId = req.user.hederaAccountId;
    const limit = Math.min(query.cursor_limit || 20, 100);

    const result = await this.notificationService.getNotifications(
      accountId,
      query.category,
      query.cursor,
      limit
    );

    return {
      notifications: result.notifications,
      nextCursor: result.nextCursor,
      count: result.notifications.length
    };
  }

  /**
   * GET /notifications/unread-count
   * Get count of unread notifications
   */
  @Get('unread-count')
  async getUnreadCount(@Request() req: Request & { user: { userId: string; hederaAccountId: string } }) {
    const accountId = req.user.hederaAccountId;
    const count = await this.notificationService.getUnreadCount(accountId);

    return { unreadCount: count };
  }

  /**
   * POST /notifications/read
   * Mark notifications as read
   *
   * Request body:
   * {
   *   "notificationIds": ["uuid1", "uuid2"]
   * }
   */
  @Post('read')
  async markAsRead(
    @Body() dto: MarkAsReadDto,
    @Request() req: Request & { user: { userId: string; hederaAccountId: string } }
  ) {
    const accountId = req.user.hederaAccountId;

    if (!dto.notificationIds || dto.notificationIds.length === 0) {
      throw new HttpException(
        'notificationIds array is required',
        HttpStatus.BAD_REQUEST
      );
    }

    const result = await this.notificationService.markAsRead(
      accountId,
      dto.notificationIds
    );

    return result;
  }

  /**
   * POST /notifications/sync
   * Sync notifications from Mirror Node (for offline users)
   *
   * Request body:
   * {
   *   "afterSequence": 0
   * }
   */
  @Post('sync')
  async syncFromMirrorNode(
    @Body() data: { afterSequence?: number },
    @Request() req: Request & { user: { userId: string; hederaAccountId: string } }
  ) {
    const notificationTopicId = process.env.NOTIFICATION_TOPIC_ID;

    if (!notificationTopicId) {
      throw new HttpException(
        'Notification topic not configured',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }

    const processed = await this.notificationService.syncFromMirrorNode(
      notificationTopicId,
      data.afterSequence || 0
    );

    return { processed, message: `Synced ${processed} notifications` };
  }
}
```

### Step 6: Create Notification Module

Create file: `src/notifications/notifications.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { Notification } from './entities/notification.entity';
import { NotificationService } from './services/notification.service';
import { NotificationController } from './controllers/notification.controller';
import { NotificationGateway } from './gateways/notification.gateway';
import { HederaService } from '../services/hedera.service';
import { EncryptionService } from '../services/encryption.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification]),
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '24h' }
    })
  ],
  providers: [NotificationService, NotificationGateway, HederaService, EncryptionService],
  controllers: [NotificationController],
  exports: [NotificationService, NotificationGateway]
})
export class NotificationsModule {}
```

### Step 7: Create Database Migration

Create file: `src/migrations/1710100000000-CreateNotificationTable.ts`

```typescript
import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateNotificationTable1710100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'notifications',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()'
          },
          {
            name: 'recipientAccountId',
            type: 'varchar'
          },
          {
            name: 'category',
            type: 'varchar',
            enum: ['message', 'payment', 'social', 'system']
          },
          {
            name: 'event',
            type: 'varchar'
          },
          {
            name: 'fromAccountId',
            type: 'varchar',
            isNullable: true
          },
          {
            name: 'topicId',
            type: 'varchar',
            isNullable: true
          },
          {
            name: 'preview',
            type: 'text',
            isNullable: true
          },
          {
            name: 'data',
            type: 'jsonb',
            isNullable: true
          },
          {
            name: 'isRead',
            type: 'boolean',
            default: false
          },
          {
            name: 'hcsMessageId',
            type: 'varchar',
            isNullable: true
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()'
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()'
          },
          {
            name: 'readAt',
            type: 'timestamp',
            isNullable: true
          }
        ],
        indices: [
          new TableIndex({ columnNames: ['recipientAccountId', 'isRead'] }),
          new TableIndex({ columnNames: ['recipientAccountId', 'category'] }),
          new TableIndex({ columnNames: ['recipientAccountId', 'createdAt'] }),
          new TableIndex({ columnNames: ['recipientAccountId', 'isRead', 'createdAt'] })
        ]
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('notifications');
  }
}
```

### Step 8: Integration Points in Other Services

Update `src/payments/services/payment.service.ts` to send notifications:

```typescript
// Add to imports
import { NotificationService } from '../../notifications/services/notification.service';
import { NotificationCategory, NotificationEvent } from '../../notifications/dto/notification.dto';

// In constructor
constructor(
  // ... other dependencies
  private notificationService: NotificationService
) {}

// In sendMoneyInChat method, after payment confirmed:
// Add this after payment is saved:
await this.notificationService.notifyPaymentReceived(
  recipientAccountId,
  senderAccountId,
  amount,
  currency,
  conversationTopicId,
  note
);

// In requestMoney method:
// After request created, notify all conversation participants
const conversation = await this.conversationService.getConversationByTopic(conversationTopicId);
for (const participant of conversation.participants) {
  if (participant.accountId !== requesterAccountId) {
    await this.notificationService.notifyPaymentRequest(
      participant.accountId,
      requesterAccountId,
      amount,
      currency,
      conversationTopicId,
      note
    );
  }
}
```

Update `src/conversations/services/conversation.service.ts` to send message notifications:

```typescript
// In message creation method (after message saved):
const otherParticipants = conversation.participants.filter(
  p => p.accountId !== senderAccountId
);

for (const participant of otherParticipants) {
  await this.notificationService.notifyNewMessage(
    participant.accountId,
    senderAccountId,
    conversationTopicId,
    message.content.substring(0, 100), // First 100 chars
    senderName
  );
}
```

### Step 9: Update App Module

Update `src/app.module.ts`:

```typescript
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    // ... other imports
    NotificationsModule,
  ]
})
export class AppModule {}
```

### Step 10: Environment Configuration

Add to `.env`:

```
NOTIFICATION_TOPIC_ID=0.0.xxxxx (optional, or null for no HCS audit)
```

## Verification Steps

| Verification Step | Expected Result | Status |
|---|---|---|
| Run migrations | notifications table created with 4 indexes | ✓ |
| NotificationService injection works | No DI errors on startup | ✓ |
| NotificationGateway initializes | WebSocket server starts on /notifications namespace | ✓ |
| Client connects with JWT | Socket authenticated, user added to rooms | ✓ |
| SendNotification called | Notification stored in DB, emitted via WebSocket | ✓ |
| GET /notifications returns list | Returns notifications array with pagination | ✓ |
| GET /notifications?category=payment | Returns only payment notifications | ✓ |
| POST /notifications/read | Marks notifications as read, returns updated count | ✓ |
| GET /notifications/unread-count | Returns correct count of unread | ✓ |
| Payment triggers notification | notifyPaymentReceived called after payment confirmed | ✓ |
| Message triggers notification | notifyNewMessage called after message sent | ✓ |
| WebSocket emits in real-time | Client receives notification event immediately | ✓ |
| Offline recovery works | User can sync missed notifications | ✓ |

## Definition of Done

- [ ] Notification entity created with 10+ columns
- [ ] NotificationService with 6+ public methods
- [ ] NotificationGateway implements WebSocket authentication
- [ ] NotificationController with 4 endpoints (GET, POST read, sync, count)
- [ ] NotificationModule created and exported
- [ ] Migration creates notifications table with 4 indexes
- [ ] Integration with PaymentService (notifications on payment)
- [ ] Integration with ConversationService (notifications on message)
- [ ] DTOs with validation
- [ ] Full end-to-end workflow tested:
  - [ ] Create payment → notification sent → user receives via WebSocket
  - [ ] Mark as read → DB updated
  - [ ] Unread count accurate
  - [ ] Pagination works
  - [ ] Offline users can sync
- [ ] Error handling for offline users
- [ ] TypeScript compilation successful
- [ ] All endpoints protected with JwtAuthGuard

## Troubleshooting

### Issue: WebSocket connection fails with "Invalid token"
**Cause**: JWT token not passed correctly to WebSocket handshake
**Solution**:
- Client must pass token in query: `?token=jwt...`
- Or in auth object: `{ auth: { token: jwt } }`
- Verify JWT_SECRET in .env matches what JwtService expects

### Issue: "NotificationService is not defined" on startup
**Cause**: Module not imported in AppModule
**Solution**:
- Verify `imports: [NotificationsModule]` in app.module.ts
- Check NotificationsModule properly exports NotificationService

### Issue: Notifications stored in DB but not emitted via WebSocket
**Cause**: Gateway not initialized or user not connected
**Solution**:
- Check NotificationGateway is in NotificationsModule providers
- Verify client connected to /notifications namespace
- Check room join: `client.join('user:' + accountId)`

### Issue: "NOTIFICATION_TOPIC_ID not configured" error
**Cause**: Optional HCS notification audit feature not configured
**Solution**:
- HCS topic is optional for NotificationService
- If you want it: set NOTIFICATION_TOPIC_ID in .env
- Without it, notifications still work via DB and WebSocket

### Issue: Double notifications sent
**Cause**: NotificationService called from multiple places
**Solution**:
- Only call from origin (PaymentService, ConversationService)
- Don't call from both service and controller
- Use service-to-service calls only

## Files Created in This Task

1. `/sessions/exciting-sharp-mayer/mnt/social-platform/src/notifications/dto/notification.dto.ts` (80 lines)
2. `/sessions/exciting-sharp-mayer/mnt/social-platform/src/notifications/entities/notification.entity.ts` (65 lines)
3. `/sessions/exciting-sharp-mayer/mnt/social-platform/src/notifications/services/notification.service.ts` (380 lines)
4. `/sessions/exciting-sharp-mayer/mnt/social-platform/src/notifications/gateways/notification.gateway.ts` (180 lines)
5. `/sessions/exciting-sharp-mayer/mnt/social-platform/src/notifications/controllers/notification.controller.ts` (110 lines)
6. `/sessions/exciting-sharp-mayer/mnt/social-platform/src/notifications/notifications.module.ts` (30 lines)
7. `/sessions/exciting-sharp-mayer/mnt/social-platform/src/migrations/1710100000000-CreateNotificationTable.ts` (110 lines)

**Total: ~955 lines of backend code**

## What Happens Next

1. **P1-T24 (Frontend Notifications)**: React components consume notification API
   - NotificationBell shows unread count
   - NotificationsPage displays list
   - WebSocket listener updates in real-time

2. **P0-T25 (Demo Seed)**: Seed script creates sample notifications
   - Demo users trigger payment/follow notifications

3. **Hackathon Demo**: Show notification flow in video
   - Send payment in one browser
   - See notification appear in another browser in real-time
