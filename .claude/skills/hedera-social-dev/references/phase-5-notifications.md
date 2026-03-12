# Phase 5: Notifications

**Status**: FULLY IMPLEMENTABLE. No blockers.

**Scope**: Tasks T23–T24

---

## Overview: Notification System

The notification system uses:

1. **HCS Topics** — One per user for persistent notification records
2. **PostgreSQL** — Local index for quick queries
3. **WebSocket (Socket.io)** — Real-time delivery to online users
4. **Email/SMS** (optional) — For offline notifications

Flow:
```
Event triggered (new message, payment, follow, KYC approval)
                  ↓
        Notification service creates record
                  ↓
    Posts to user's notification HCS topic
                  ↓
    Stores in PostgreSQL, updates unread count
                  ↓
    If user is online: WebSocket delivery
    If offline: Mark for email/SMS
```

---

## HCS Notification Schema

All notifications are posted to a user's private notification HCS topic.

```json
{
  "v": "1.0",
  "type": "notification",
  "recipientAccountId": "0.0.12345",
  "ts": 1700000000000,
  "category": "message",
  "data": {
    "event": "new_message",
    "from": "0.0.67890",
    "conversationId": "550e8400-e29b-41d4-a716-446655440000",
    "preview": "Hey, how are you?",
    "topicId": "0.0.54321"
  }
}
```

**Notification Categories**:
- `message`: New direct message
- `payment`: Payment sent/requested/received
- `social`: Follow, post like, mention
- `system`: KYC approved, account verified, feature updates

---

## Backend: Notifications Module

### Notification Entity

**File**: `apps/backend/src/notifications/entities/notification.entity.ts`

```typescript
import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('notifications')
@Index(['recipientAccountId', 'read'], { unique: false })
@Index(['createdAt'], { unique: false })
export class Notification {
  @PrimaryColumn('varchar', { length: 64 })
  id: string; // UUID

  @Column('varchar', { length: 30 })
  recipientAccountId: string; // Hedera account ID

  @Column('varchar', { length: 20 })
  category: 'message' | 'payment' | 'social' | 'system';

  @Column('varchar', { length: 50 })
  event: string; // new_message, payment_received, new_follower, kyc_approved, etc.

  @Column('jsonb')
  data: Record<string, any>; // Event-specific data

  @Column('varchar', { length: 500, nullable: true })
  hcsMessageId?: string; // Reference to HCS message

  @Column('boolean', { default: false })
  read: boolean;

  @Column('boolean', { default: false })
  emailSent: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
```

### Notification Service

**File**: `apps/backend/src/notifications/notifications.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { HederaClient } from '@hedera-social/hedera-config';
import { TopicMessageSubmitTransaction, Client } from '@hashgraph/sdk';
import { v4 as uuid } from 'uuid';

interface NotificationData {
  category: 'message' | 'payment' | 'social' | 'system';
  event: string;
  data: Record<string, any>;
}

@Injectable()
export class NotificationsService {
  private client: Client;

  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
  ) {
    this.client = HederaClient.getInstance(
      process.env.HEDERA_NETWORK as 'testnet' | 'mainnet' | 'previewnet',
      process.env.HEDERA_ACCOUNT_ID!,
      process.env.HEDERA_PRIVATE_KEY!,
    );
  }

  /**
   * Create and dispatch a notification.
   * - Stores in PostgreSQL
   * - Posts to user's HCS notification topic
   * - Broadcasts via WebSocket if user is online
   */
  async notify(
    recipientAccountId: string,
    notificationTopicId: string,
    payload: NotificationData,
  ): Promise<Notification> {
    // Create notification record
    const notification = this.notificationRepository.create({
      id: uuid(),
      recipientAccountId,
      category: payload.category,
      event: payload.event,
      data: payload.data,
    });

    // Save to PostgreSQL
    await this.notificationRepository.save(notification);

    // Post to HCS notification topic
    const hcsPayload = {
      v: '1.0',
      type: 'notification',
      recipientAccountId,
      ts: Date.now(),
      category: payload.category,
      data: payload.data,
    };

    try {
      const transaction = new TopicMessageSubmitTransaction()
        .setTopicId(notificationTopicId)
        .setMessage(JSON.stringify(hcsPayload));

      const submitted = await transaction.execute(this.client);
      const receipt = await submitted.getReceipt(this.client);

      notification.hcsMessageId = `${receipt.topicSequenceNumber}-${receipt.consensusTimestamp}`;
      await this.notificationRepository.save(notification);
    } catch (error) {
      console.error('Failed to post notification to HCS', error);
      // Continue even if HCS fails — notification is stored in PostgreSQL
    }

    return notification;
  }

  /**
   * Get unread notifications for a user.
   */
  async getUnread(
    accountId: string,
    limit: number = 50,
  ): Promise<Notification[]> {
    return this.notificationRepository
      .createQueryBuilder('n')
      .where('n.recipientAccountId = :accountId', { accountId })
      .andWhere('n.read = false')
      .orderBy('n.createdAt', 'DESC')
      .limit(limit)
      .getMany();
  }

  /**
   * Get all notifications for a user.
   */
  async getAll(
    accountId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<Notification[]> {
    return this.notificationRepository
      .createQueryBuilder('n')
      .where('n.recipientAccountId = :accountId', { accountId })
      .orderBy('n.createdAt', 'DESC')
      .limit(limit)
      .offset(offset)
      .getMany();
  }

  /**
   * Get unread count.
   */
  async getUnreadCount(accountId: string): Promise<number> {
    return this.notificationRepository.count({
      where: { recipientAccountId: accountId, read: false },
    });
  }

  /**
   * Mark notification as read.
   */
  async markAsRead(notificationId: string): Promise<void> {
    await this.notificationRepository.update(
      { id: notificationId },
      { read: true }
    );
  }

  /**
   * Mark all notifications as read.
   */
  async markAllAsRead(accountId: string): Promise<void> {
    await this.notificationRepository.update(
      { recipientAccountId: accountId, read: false },
      { read: true }
    );
  }

  /**
   * Delete a notification.
   */
  async delete(notificationId: string): Promise<void> {
    await this.notificationRepository.delete({ id: notificationId });
  }
}
```

### Notifications Controller

**File**: `apps/backend/src/notifications/notifications.controller.ts`

```typescript
import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get('unread')
  async getUnread(
    @Request() req: any,
    @Query('limit') limit: number = 50,
  ) {
    return this.notificationsService.getUnread(req.user.accountId, limit);
  }

  @Get('unread/count')
  async getUnreadCount(@Request() req: any) {
    const count = await this.notificationsService.getUnreadCount(req.user.accountId);
    return { count };
  }

  @Get()
  async getAll(
    @Request() req: any,
    @Query('limit') limit: number = 50,
    @Query('offset') offset: number = 0,
  ) {
    return this.notificationsService.getAll(req.user.accountId, limit, offset);
  }

  @Post(':notificationId/read')
  async markAsRead(@Param('notificationId') notificationId: string) {
    await this.notificationsService.markAsRead(notificationId);
    return { message: 'Marked as read' };
  }

  @Post('read/all')
  async markAllAsRead(@Request() req: any) {
    await this.notificationsService.markAllAsRead(req.user.accountId);
    return { message: 'All marked as read' };
  }

  @Post(':notificationId/delete')
  async deleteNotification(@Param('notificationId') notificationId: string) {
    await this.notificationsService.delete(notificationId);
    return { message: 'Deleted' };
  }
}
```

### Notifications Module

**File**: `apps/backend/src/notifications/notifications.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { Notification } from './entities/notification.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway],
  exports: [NotificationsService],
})
export class NotificationsModule {}
```

---

## WebSocket Gateway for Real-Time Notifications

**File**: `apps/backend/src/notifications/notifications.gateway.ts`

```typescript
import {
  WebSocketGateway,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  Namespace,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';

interface SocketUser {
  userId: string;
  accountId: string;
}

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private server: Server;
  private users = new Map<string, SocketUser>(); // socketId -> user
  private accountSockets = new Map<string, Set<string>>(); // accountId -> set of socketIds
  private logger = new Logger('NotificationsGateway');

  constructor(private jwtService: JwtService) {}

  afterInit(server: Server) {
    this.server = server;
    this.logger.log('Notifications WebSocket initialized');
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth.token ||
        client.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const user: SocketUser = {
        userId: payload.sub,
        accountId: payload.accountId,
      };

      this.users.set(client.id, user);

      // Track sockets per account
      if (!this.accountSockets.has(user.accountId)) {
        this.accountSockets.set(user.accountId, new Set());
      }
      this.accountSockets.get(user.accountId)!.add(client.id);

      this.logger.log(
        `Client connected: ${client.id} (${user.accountId})`
      );

      client.emit('connection:success', { userId: user.userId });
    } catch (error) {
      this.logger.error('Connection error', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const user = this.users.get(client.id);
    if (user) {
      this.logger.log(`Client disconnected: ${client.id} (${user.accountId})`);

      const sockets = this.accountSockets.get(user.accountId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.accountSockets.delete(user.accountId);
        }
      }

      this.users.delete(client.id);
    }
  }

  /**
   * Broadcast a notification to a user (if online).
   * Called by NotificationsService.
   */
  broadcastNotification(accountId: string, notification: any) {
    const sockets = this.accountSockets.get(accountId);
    if (sockets) {
      sockets.forEach(socketId => {
        this.server.to(socketId).emit('notification:new', notification);
      });
      this.logger.debug(`Broadcast notification to ${accountId}`);
    }
  }

  /**
   * Update unread count for a user.
   */
  updateUnreadCount(accountId: string, count: number) {
    const sockets = this.accountSockets.get(accountId);
    if (sockets) {
      sockets.forEach(socketId => {
        this.server.to(socketId).emit('notifications:unread-count', { count });
      });
    }
  }

  /**
   * Client marks a notification as read.
   */
  @SubscribeMessage('notification:read')
  handleNotificationRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { notificationId: string },
  ) {
    const user = this.users.get(client.id);
    if (user) {
      client.emit('notification:read-ack', { notificationId: data.notificationId });
    }
  }
}
```

---

## Event Emission Pattern

When other services trigger notifications, they call `NotificationsService.notify()`.

### Example: New Message Notification

In `MessagingService.sendMessage()`:

```typescript
async sendMessage(
  conversationId: string,
  senderAccountId: string,
  encryptedPayload: string,
): Promise<Message> {
  // ... existing code ...

  // Notify recipient(s)
  const conversation = await this.conversationRepository.findOne({
    where: { id: conversationId },
  });

  for (const participantAccountId of conversation.participants) {
    if (participantAccountId !== senderAccountId) {
      await this.notificationsService.notify(
        participantAccountId,
        conversation.notificationTopicId, // User's notification topic
        {
          category: 'message',
          event: 'new_message',
          data: {
            from: senderAccountId,
            conversationId,
            preview: '[encrypted message]',
            topicId: conversation.topicId,
          },
        },
      );

      // Also broadcast via WebSocket
      this.notificationsGateway.broadcastNotification(
        participantAccountId,
        { ... }
      );
    }
  }

  return message;
}
```

### Example: Follow Notification

In `SocialService.follow()`:

```typescript
async follow(followerAccountId: string, targetAccountId: string): Promise<Follow> {
  // ... existing code ...

  // Notify target user
  await this.notificationsService.notify(
    targetAccountId,
    userNotificationTopicId, // Fetch this from DB
    {
      category: 'social',
      event: 'new_follower',
      data: {
        followerAccountId,
        followerUsername: 'username_here',
      },
    },
  );

  return follow;
}
```

---

## Frontend: Notification UI

### Notification Bell

**File**: `apps/frontend/components/NotificationBell.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export function NotificationBell({ token }: { token: string }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    // Fetch initial unread count
    const fetchUnread = async () => {
      const res = await fetch('/api/notifications/unread/count', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { count } = await res.json();
      setUnreadCount(count);
    };

    fetchUnread();

    // Connect WebSocket
    const ws = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000', {
      namespace: '/notifications',
      auth: { token },
    });

    ws.on('notification:new', (notification: any) => {
      setUnreadCount(prev => prev + 1);
    });

    ws.on('notifications:unread-count', (data: { count: number }) => {
      setUnreadCount(data.count);
    });

    setSocket(ws);

    return () => {
      ws.disconnect();
    };
  }, [token]);

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative p-2 text-2xl"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {showDropdown && <NotificationDropdown token={token} />}
    </div>
  );
}

function NotificationDropdown({ token }: { token: string }) {
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const res = await fetch('/api/notifications?limit=10', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(await res.json());
    };
    fetch();
  }, [token]);

  return (
    <div className="absolute right-0 mt-2 w-80 bg-white shadow-lg rounded-lg p-4 z-50">
      <h3 className="font-bold mb-3">Notifications</h3>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {notifications.map(notif => (
          <div key={notif.id} className={`p-2 rounded ${notif.read ? 'bg-gray-50' : 'bg-blue-50'}`}>
            <p className="text-sm">{notif.event}</p>
            <p className="text-xs text-gray-500">{new Date(notif.createdAt).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Notification List Page

**File**: `apps/frontend/app/(main)/notifications/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await fetch('/api/notifications?limit=50');
        setNotifications(await res.json());
      } catch (error) {
        console.error('Failed to fetch notifications', error);
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, []);

  const handleMarkAsRead = async (notificationId: string) => {
    await fetch(`/api/notifications/${notificationId}/read`, { method: 'POST' });
    setNotifications(prev =>
      prev.map(n => (n.id === notificationId ? { ...n, read: true } : n))
    );
  };

  const handleMarkAllAsRead = async () => {
    await fetch('/api/notifications/read/all', { method: 'POST' });
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  if (loading) return <div>Loading notifications...</div>;

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <button
          onClick={handleMarkAllAsRead}
          className="text-blue-500 hover:underline text-sm"
        >
          Mark all as read
        </button>
      </div>

      <div className="space-y-2">
        {notifications.map(notif => (
          <div
            key={notif.id}
            className={`p-4 rounded border ${
              notif.read ? 'bg-gray-50 border-gray-200' : 'bg-blue-50 border-blue-200'
            }`}
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="font-bold">{notif.event}</p>
                <p className="text-sm text-gray-600">{JSON.stringify(notif.data)}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(notif.createdAt).toLocaleString()}
                </p>
              </div>
              {!notif.read && (
                <button
                  onClick={() => handleMarkAsRead(notif.id)}
                  className="text-blue-500 text-sm hover:underline"
                >
                  Mark read
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Notification Types Reference

### Message Notification

```typescript
{
  category: 'message',
  event: 'new_message',
  data: {
    from: '0.0.12345',
    conversationId: 'uuid',
    preview: 'Hey, how are you?',
    topicId: '0.0.11111',
  }
}
```

### Payment Notification

```typescript
{
  category: 'payment',
  event: 'payment_received',
  data: {
    from: '0.0.12345',
    amount: 50.00,
    currency: 'USD',
    conversationId: 'uuid',
  }
}
```

### Social Notification

```typescript
{
  category: 'social',
  event: 'new_follower',
  data: {
    followerAccountId: '0.0.12345',
    followerUsername: 'john_doe',
  }
}
```

### System Notification

```typescript
{
  category: 'system',
  event: 'kyc_approved',
  data: {
    message: 'Your KYC verification has been approved!',
  }
}
```

---

## Key Takeaways for Phase 5

- **Fully implementable** — all HCS, database, and WebSocket operations are documented
- **Real-time delivery** — WebSocket broadcasts to online users
- **Persistent storage** — HCS + PostgreSQL for offline users
- **Unread count tracking** — Fast SQL query on read flag
- **Flexible payload** — Notification data is event-specific JSON
- **Email integration** — Optional for offline users (mark `emailSent` flag)
- **No blockers** — Everything needed is documented

Next: Phase 6 (Hackathon Submission) — honest demo and documentation.
