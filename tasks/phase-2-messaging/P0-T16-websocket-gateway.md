# Task P0-T16: WebSocket Gateway — Real-Time

| Field | Value |
|-------|-------|
| Task ID | P0-T16 |
| Priority | Critical |
| Estimated Time | 4 hours |
| Depends On | P0-T15 (Send & Receive Messages) |
| Phase | 2 — Messaging |
| Assignee | Junior Backend Developer |

---

## Objective

Implement a Socket.io WebSocket gateway for real-time message distribution, typing indicators, and read receipts. The gateway uses Redis for horizontal scaling and maintains connection state for presence tracking.

## Background

### WebSocket Architecture

```
Client 1                    Client 2
    ↓                           ↓
  Socket.io Client         Socket.io Client
    ↓                           ↓
[JWT Auth] ←──────────────────────→ [JWT Auth]
    ↓                           ↓
ChatGateway (Socket.io Server with Redis Adapter)
    ↓
Message Storage (PostgreSQL, HCS)
    ↓
Mirror Node Polling ← MessageSyncService
    ↓
Event Emitter ('messages.synced')
    ↓
broadcast() to connected clients
```

### Event Flow

**Client → Server:**
- `join_conversation`: Client joins a conversation room
- `leave_conversation`: Client leaves a room
- `typing`: Broadcast "user is typing"
- `read_receipt`: User read message up to sequence N

**Server → Client:**
- `server_new_message`: New message in conversation
- `server_typing`: Other user typing
- `server_read_receipt`: Other user read receipt
- `server_user_online`: User joined conversation
- `server_user_offline`: User left conversation

### Redis for Scalability

With Redis adapter:
- Multiple server instances share socket state
- Rooms synchronized across instances
- Broadcast reaches all servers
- Presence tracked in Redis

## Pre-requisites

- Message service fully implemented (P0-T15)
- Redis running and accessible
- Socket.io v4 installed
- JWT authentication configured
- Event Emitter module available

## Step-by-Step Instructions

### Step 1: Install Dependencies

Add to `package.json`:

```bash
npm install socket.io @nestjs/websockets @nestjs/platform-socket.io ioredis redis
npm install -D @types/node
```

### Step 2: Create WebSocket Authentication Middleware

Create `/src/modules/chat/guards/ws-jwt.guard.ts`:

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    try {
      const client = context.switchToWs().getClient();
      const handshake = client.handshake;

      // Get token from auth header or query
      let token = handshake.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        token = handshake.auth?.token;
      }

      if (!token) {
        client.disconnect();
        return false;
      }

      // Verify JWT
      const secret = this.configService.get<string>('JWT_SECRET');
      const payload = this.jwtService.verify(token, { secret });

      // Attach user to client
      client.user = payload;
      client.accountId = payload.accountId;

      return true;
    } catch (err: unknown) {
      const client = context.switchToWs().getClient();
      client.disconnect();
      return false;
    }
  }
}
```

### Step 3: Create Redis Service for Presence & Read Receipts

Create `/src/modules/chat/redis.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as redis from 'redis';

export interface ReadReceipt {
  accountId: string;
  topicId: string;
  lastReadSequence: number;
  timestamp: number;
}

export interface PresenceUser {
  accountId: string;
  topicId: string;
  joinedAt: number;
  socketId: string;
}

@Injectable()
export class RedisService {
  private client: redis.RedisClient;
  private readonly logger = new Logger(RedisService.name);
  private readonly READ_RECEIPT_PREFIX = 'read_receipt:';
  private readonly TYPING_PREFIX = 'typing:';
  private readonly PRESENCE_PREFIX = 'presence:';
  private readonly TYPING_TTL = 5; // 5 seconds

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>(
      'REDIS_URL',
      'redis://localhost:6379',
    );
    this.client = redis.createClient({ url: redisUrl });
    await this.client.connect();
    this.logger.log('Redis client connected');
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  /**
   * Store read receipt for a user in a conversation
   * Key: read_receipt:{topicId}
   * Field: {accountId}
   * Value: {lastReadSequence}:{timestamp}
   */
  async setReadReceipt(
    topicId: string,
    accountId: string,
    lastReadSequence: number,
  ): Promise<void> {
    const key = `${this.READ_RECEIPT_PREFIX}${topicId}`;
    const value = `${lastReadSequence}:${Date.now()}`;
    await this.client.hSet(key, accountId, value);
    // Expire after 24 hours
    await this.client.expire(key, 86400);
  }

  /**
   * Get read receipt for a user
   */
  async getReadReceipt(
    topicId: string,
    accountId: string,
  ): Promise<ReadReceipt | null> {
    const key = `${this.READ_RECEIPT_PREFIX}${topicId}`;
    const value = await this.client.hGet(key, accountId);

    if (!value) return null;

    const [sequence, timestamp] = value.split(':');
    return {
      accountId,
      topicId,
      lastReadSequence: parseInt(sequence, 10),
      timestamp: parseInt(timestamp, 10),
    };
  }

  /**
   * Get all read receipts for a conversation
   */
  async getAllReadReceipts(
    topicId: string,
  ): Promise<Map<string, ReadReceipt>> {
    const key = `${this.READ_RECEIPT_PREFIX}${topicId}`;
    const allValues = await this.client.hGetAll(key);

    const receipts = new Map<string, ReadReceipt>();
    for (const [accountId, value] of Object.entries(allValues)) {
      const [sequence, timestamp] = value.split(':');
      receipts.set(accountId, {
        accountId,
        topicId,
        lastReadSequence: parseInt(sequence, 10),
        timestamp: parseInt(timestamp, 10),
      });
    }

    return receipts;
  }

  /**
   * Store typing state for a user
   * Auto-expires after 5 seconds (TTL)
   */
  async setTyping(topicId: string, accountId: string): Promise<void> {
    const key = `${this.TYPING_PREFIX}${topicId}`;
    await this.client.hSet(key, accountId, Date.now().toString());
    await this.client.expire(key, this.TYPING_TTL);
  }

  /**
   * Clear typing state
   */
  async clearTyping(topicId: string, accountId: string): Promise<void> {
    const key = `${this.TYPING_PREFIX}${topicId}`;
    await this.client.hDel(key, accountId);
  }

  /**
   * Get all users typing in a conversation
   */
  async getTypingUsers(topicId: string): Promise<string[]> {
    const key = `${this.TYPING_PREFIX}${topicId}`;
    const allTyping = await this.client.hKeys(key);
    return allTyping;
  }

  /**
   * Track user presence in conversation
   */
  async setPresence(
    topicId: string,
    accountId: string,
    socketId: string,
  ): Promise<void> {
    const key = `${this.PRESENCE_PREFIX}${topicId}`;
    const value = JSON.stringify({
      accountId,
      socketId,
      joinedAt: Date.now(),
    });
    await this.client.hSet(key, accountId, value);
    // Expire after 24 hours
    await this.client.expire(key, 86400);
  }

  /**
   * Remove user presence
   */
  async removePresence(topicId: string, accountId: string): Promise<void> {
    const key = `${this.PRESENCE_PREFIX}${topicId}`;
    await this.client.hDel(key, accountId);
  }

  /**
   * Get all online users in conversation
   */
  async getPresenceUsers(topicId: string): Promise<PresenceUser[]> {
    const key = `${this.PRESENCE_PREFIX}${topicId}`;
    const allPresence = await this.client.hGetAll(key);

    const users: PresenceUser[] = [];
    for (const value of Object.values(allPresence)) {
      const parsed = JSON.parse(value);
      users.push({
        accountId: parsed.accountId,
        topicId,
        joinedAt: parsed.joinedAt,
        socketId: parsed.socketId,
      });
    }

    return users;
  }
}
```

### Step 4: Create Chat Gateway

Create `/src/modules/chat/chat.gateway.ts`:

```typescript
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards, Req } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { createAdapter } from '@socket.io/redis-adapter';
import * as redis from 'redis';
import { ConfigService } from '@nestjs/config';
import { ConversationService } from '../conversations/conversation.service';
import { RedisService } from './redis.service';
import { WsJwtGuard } from './guards/ws-jwt.guard';

/**
 * ChatGateway handles real-time communication
 * Uses Socket.io with Redis adapter for horizontal scaling
 */
@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private pubClient: redis.RedisClient;
  private subClient: redis.RedisClient;
  private conversationRooms: Map<string, Set<string>> = new Map(); // topicId -> socketIds

  constructor(
    private conversationService: ConversationService,
    private redisService: RedisService,
    private configService: ConfigService,
  ) {}

  /**
   * Initialize gateway: setup Redis adapter for horizontal scaling
   */
  async afterInit(server: Server) {
    this.logger.log('Initializing ChatGateway');

    const redisUrl = this.configService.get<string>(
      'REDIS_URL',
      'redis://localhost:6379',
    );

    // Create pub/sub clients for Redis adapter
    this.pubClient = redis.createClient({ url: redisUrl });
    this.subClient = redis.createClient({ url: redisUrl });

    await this.pubClient.connect();
    await this.subClient.connect();

    // Setup Redis adapter for horizontal scaling
    const adapter = createAdapter(this.pubClient, this.subClient);
    server.adapter(adapter);

    this.logger.log('Redis adapter configured for Socket.io');
  }

  /**
   * Handle client connection
   * Authenticate with JWT and attach user info
   */
  async handleConnection(@ConnectedSocket() client: Socket) {
    try {
      const accountId = client.user?.accountId || client.accountId;

      if (!accountId) {
        this.logger.warn(`Connection rejected: No accountId`);
        client.disconnect();
        return;
      }

      this.logger.log(
        `Client connected: ${client.id} (${accountId})`,
      );

      // Emit online status to all subscribed rooms
      // (Will happen when client joins rooms)
    } catch (err) {
      this.logger.error(`Connection error: ${err.message}`);
      client.disconnect();
    }
  }

  /**
   * Handle client disconnection
   */
  async handleDisconnect(@ConnectedSocket() client: Socket) {
    const accountId = client.user?.accountId || client.accountId;
    this.logger.log(`Client disconnected: ${client.id} (${accountId})`);

    // Remove from all conversation rooms
    for (const [topicId, socketIds] of this.conversationRooms) {
      if (socketIds.has(client.id)) {
        socketIds.delete(client.id);
        await this.redisService.removePresence(topicId, accountId);

        // Broadcast user offline
        this.server.to(`conv:${topicId}`).emit('server_user_offline', {
          accountId,
          topicId,
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Subscribe to a conversation room
   * Client must be a participant
   */
  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { topicId: string },
  ): Promise<void> {
    try {
      const { topicId } = data;
      const accountId = client.user?.accountId || client.accountId;

      // Validate user is participant
      const conversation = await this.conversationService.getConversation(topicId);
      const isParticipant = conversation.participants.some(
        (p) => p.accountId === accountId,
      );

      if (!isParticipant) {
        client.emit('error', {
          message: 'Not a member of this conversation',
        });
        return;
      }

      // Join Socket.io room
      const roomName = `conv:${topicId}`;
      client.join(roomName);

      // Track in local map
      if (!this.conversationRooms.has(topicId)) {
        this.conversationRooms.set(topicId, new Set());
      }
      this.conversationRooms.get(topicId).add(client.id);

      // Store presence in Redis
      await this.redisService.setPresence(topicId, accountId, client.id);

      // Broadcast user online
      this.server.to(roomName).emit('server_user_online', {
        accountId,
        topicId,
        timestamp: Date.now(),
      });

      this.logger.log(`User ${accountId} joined conversation ${topicId}`);

      // Send confirmation
      client.emit('joined_conversation', {
        topicId,
        timestamp: Date.now(),
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `Error joining conversation: ${errorMessage}`,
      );
      client.emit('error', { message: 'Failed to join conversation' });
    }
  }

  /**
   * Leave a conversation room
   */
  @SubscribeMessage('leave_conversation')
  async handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { topicId: string },
  ): Promise<void> {
    try {
      const { topicId } = data;
      const accountId = client.user?.accountId || client.accountId;

      const roomName = `conv:${topicId}`;
      client.leave(roomName);

      // Remove from local tracking
      const socketIds = this.conversationRooms.get(topicId);
      if (socketIds) {
        socketIds.delete(client.id);
      }

      // Remove presence
      await this.redisService.removePresence(topicId, accountId);

      // Broadcast user offline
      this.server.to(roomName).emit('server_user_offline', {
        accountId,
        topicId,
        timestamp: Date.now(),
      });

      this.logger.log(`User ${accountId} left conversation ${topicId}`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error leaving conversation: ${errorMessage}`);
    }
  }

  /**
   * Broadcast typing indicator
   * NOT stored on HCS, WebSocket only
   * Auto-expires after 5 seconds
   */
  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { topicId: string; isTyping: boolean },
  ): Promise<void> {
    try {
      const { topicId, isTyping } = data;
      const accountId = client.user?.accountId || client.accountId;

      const roomName = `conv:${topicId}`;

      if (isTyping) {
        // Store typing state in Redis with TTL
        await this.redisService.setTyping(topicId, accountId);

        // Broadcast to room
        this.server.to(roomName).emit('server_typing', {
          accountId,
          topicId,
          timestamp: Date.now(),
        });
      } else {
        // Clear typing state
        await this.redisService.clearTyping(topicId, accountId);

        // Optionally broadcast typing stopped
        this.server.to(roomName).emit('server_typing_stopped', {
          accountId,
          topicId,
          timestamp: Date.now(),
        });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error handling typing: ${errorMessage}`);
    }
  }

  /**
   * Handle read receipt
   * Stores in Redis, broadcasts to room
   * NOT submitted to HCS
   */
  @SubscribeMessage('read_receipt')
  async handleReadReceipt(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { topicId: string; lastReadSequence: number },
  ): Promise<void> {
    try {
      const { topicId, lastReadSequence } = data;
      const accountId = client.user?.accountId || client.accountId;

      // Store read receipt in Redis
      await this.redisService.setReadReceipt(
        topicId,
        accountId,
        lastReadSequence,
      );

      const roomName = `conv:${topicId}`;

      // Broadcast read receipt to room
      this.server.to(roomName).emit('server_read_receipt', {
        accountId,
        topicId,
        lastReadSequence,
        timestamp: Date.now(),
      });

      this.logger.debug(
        `Read receipt: ${accountId} read up to ${lastReadSequence} in ${topicId}`,
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error handling read receipt: ${errorMessage}`);
    }
  }

  /**
   * Broadcast new message to conversation room
   * Called by message service when new message is synced from Mirror Node
   */
  @OnEvent('messages.synced')
  async handleMessagesSynced(payload: {
    topicId: string;
    lastSequence: number;
  }) {
    try {
      const roomName = `conv:${payload.topicId}`;

      // Broadcast event to all connected clients in room
      this.server.to(roomName).emit('server_new_message', {
        topicId: payload.topicId,
        lastSequence: payload.lastSequence,
        timestamp: Date.now(),
      });

      this.logger.debug(
        `Broadcast new message to ${roomName} (sequence: ${payload.lastSequence})`,
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error broadcasting message: ${errorMessage}`);
    }
  }

  /**
   * Get online users and their read receipts
   * Useful for UI to show who's online and read status
   */
  async getConversationState(topicId: string): Promise<{
    topicId: string;
    onlineUsers: PresenceUser[];
    readReceipts: ReadReceipt[];
    typingUsers: string[];
  }> {
    const onlineUsers = await this.redisService.getPresenceUsers(topicId);
    const readReceipts = await this.redisService.getAllReadReceipts(topicId);
    const typingUsers = await this.redisService.getTypingUsers(topicId);

    return {
      topicId,
      onlineUsers,
      readReceipts: Array.from(readReceipts.values()),
      typingUsers,
    };
  }

  /**
   * Broadcast read receipts to a client (for initial sync)
   */
  async sendReadReceiptSync(client: Socket, topicId: string): Promise<void> {
    const receipts = await this.redisService.getAllReadReceipts(topicId);
    client.emit('read_receipt_sync', {
      topicId,
      receipts: Array.from(receipts.values()),
    });
  }
}
```

### Step 5: Create Chat Controller for Initial State

Create `/src/modules/chat/chat.controller.ts`:

```typescript
import {
  Controller,
  Get,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ConversationService } from '../conversations/conversation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private chatGateway: ChatGateway,
    private conversationService: ConversationService,
  ) {}

  /**
   * GET /chat/conversations/:topicId/state
   * Get initial state: online users, read receipts, typing indicators
   * Called by frontend when joining a conversation
   */
  @Get('conversations/:topicId/state')
  async getConversationState(
    @Param('topicId') topicId: string,
    @Req() req: Request & { user: { accountId: string } },
  ): Promise<{
    topicId: string;
    onlineUsers: Array<{ accountId: string; topicId: string; joinedAt: number; socketId: string }>;
    readReceipts: Array<{ accountId: string; topicId: string; lastReadSequence: number; timestamp: number }>;
    typingUsers: string[];
  }> {
    const userAccountId = req.user.accountId;

    // Verify user is participant
    const conversation = await this.conversationService.getConversation(topicId);
    const isParticipant = conversation.participants.some(
      (p) => p.accountId === userAccountId,
    );

    if (!isParticipant) {
      throw new Error('Not a member of this conversation');
    }

    return this.chatGateway.getConversationState(topicId);
  }
}
```

### Step 6: Create Chat Module

Create `/src/modules/chat/chat.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtModule } from '@nestjs/jwt';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { RedisService } from './redis.service';
import { ConversationModule } from '../conversations/conversation.module';

@Module({
  imports: [
    ConfigModule,
    EventEmitterModule.forRoot(),
    JwtModule.register({
      secret: process.env.JWT_SECRET,
    }),
    ConversationModule,
  ],
  providers: [ChatGateway, RedisService],
  controllers: [ChatController],
  exports: [RedisService],
})
export class ChatModule {}
```

### Step 7: Register in App Module

Update `/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ChatModule } from './modules/chat/chat.module';
import { MessageModule } from './modules/messages/message.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    // ... other modules
    ChatModule,
    MessageModule,
  ],
})
export class AppModule {}
```

### Step 8: Environment Configuration

Update `.env`:

```env
# WebSocket Configuration
FRONTEND_URL=http://localhost:3000
REDIS_URL=redis://localhost:6379

# Socket.io Configuration
SOCKET_IO_CORS=http://localhost:3000

# Server Port
PORT=3001
```

### Step 9: Client-Side WebSocket Integration Example

Create `/frontend/lib/socket-client.ts` (Reference for frontend task):

```typescript
import { io, Socket } from 'socket.io-client';

export class ChatSocketClient {
  private socket: Socket | null = null;
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  /**
   * Initialize socket connection
   */
  connect(serverUrl: string = 'http://localhost:3001') {
    this.socket = io(`${serverUrl}/chat`, {
      auth: { token: this.token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      this.connected = true;
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
    });

    this.socket.on('connect_error', (err: Error) => {
      this.lastError = err.message;
    });
  }

  /**
   * Join a conversation
   */
  joinConversation(topicId: string) {
    if (this.socket) {
      this.socket.emit('join_conversation', { topicId });
    }
  }

  /**
   * Leave a conversation
   */
  leaveConversation(topicId: string) {
    if (this.socket) {
      this.socket.emit('leave_conversation', { topicId });
    }
  }

  /**
   * Broadcast typing indicator
   */
  sendTyping(topicId: string, isTyping: boolean) {
    if (this.socket) {
      this.socket.emit('typing', { topicId, isTyping });
    }
  }

  /**
   * Send read receipt
   */
  sendReadReceipt(topicId: string, lastReadSequence: number) {
    if (this.socket) {
      this.socket.emit('read_receipt', { topicId, lastReadSequence });
    }
  }

  /**
   * Subscribe to new messages
   */
  onNewMessage(callback: (data: { topicId: string; lastSequence: number; timestamp: number }) => void): void {
    if (this.socket) {
      this.socket.on('server_new_message', callback);
    }
  }

  /**
   * Subscribe to typing indicators
   */
  onUserTyping(callback: (data: { accountId: string; topicId: string; timestamp: number }) => void): void {
    if (this.socket) {
      this.socket.on('server_typing', callback);
    }
  }

  /**
   * Subscribe to read receipts
   */
  onReadReceipt(callback: (data: { accountId: string; topicId: string; lastReadSequence: number; timestamp: number }) => void): void {
    if (this.socket) {
      this.socket.on('server_read_receipt', callback);
    }
  }

  /**
   * Subscribe to user online/offline
   */
  onUserPresence(callback: (data: { accountId: string; topicId: string; timestamp: number }) => void): void {
    if (this.socket) {
      this.socket.on('server_user_online', callback);
      this.socket.on('server_user_offline', callback);
    }
  }

  /**
   * Disconnect socket
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}
```

## Verification Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Redis running | Can connect to redis://localhost:6379 |
| 2 | Start backend | ChatGateway initializes, Redis adapter configured |
| 3 | Client connects with JWT | handleConnection accepts, emits 'connect' |
| 4 | Client without JWT | Connection rejected, client.disconnect() called |
| 5 | Client joins conversation | Socket added to room `conv:{topicId}` |
| 6 | Check other clients | Receive 'server_user_online' event |
| 7 | Client sends typing | Other clients receive 'server_typing' |
| 8 | Wait 5+ seconds | Typing indicator auto-expires |
| 9 | Client sends read receipt | Others receive 'server_read_receipt' |
| 10 | Check Redis keys | read_receipt:{topicId} hash exists |
| 11 | New message synced | 'messages.synced' event emitted |
| 12 | Check room broadcast | All clients in room receive 'server_new_message' |
| 13 | Multiple clients in room | Messages broadcast to all |
| 14 | Client in multiple rooms | Events only in subscribed rooms |
| 15 | Client disconnects | 'server_user_offline' broadcast |
| 16 | GET /chat/conversations/{id}/state | Returns online users, read receipts, typing |

## Definition of Done

- [ ] Socket.io gateway with proper namespace `/chat`
- [ ] JWT authentication via handshake
- [ ] Redis adapter configured for horizontal scaling
- [ ] Room-based event distribution (conv:{topicId})
- [ ] join_conversation handler working
- [ ] leave_conversation handler working
- [ ] typing indicator with 5s TTL
- [ ] read_receipt storage and broadcast
- [ ] Presence tracking (online/offline)
- [ ] messages.synced event handler
- [ ] Broadcast to room on new message
- [ ] Redis connection persistent
- [ ] Error handling for disconnections
- [ ] CORS configured for frontend URL
- [ ] Chat controller returns conversation state
- [ ] All verification steps pass
- [ ] Logging comprehensive
- [ ] No memory leaks on disconnect

## Troubleshooting

### Problem: "connect_error: No token provided"
**Cause**: JWT token not passed in auth headers or query
**Solution**:
1. Frontend must include JWT in auth header
2. WsJwtGuard looks for `handshake.auth.token` or `headers.authorization`
3. Verify token is valid and not expired

### Problem: Redis adapter not initializing
**Cause**: Redis not running or URL incorrect
**Solution**:
1. Start Redis: `redis-server`
2. Verify REDIS_URL in .env
3. Check port 6379 is accessible
4. Log errors in afterInit

### Problem: Events not broadcast to other clients
**Cause**: Clients in different rooms or Socket.io not setup
**Solution**:
1. Verify both clients joined same `conv:{topicId}` room
2. Check Redis adapter is configured
3. Emit to correct room: `server.to(roomName).emit()`
4. Log emit calls with room name

### Problem: Typing indicator doesn't expire
**Cause**: TTL not set or Redis expire failed
**Solution**:
1. Verify RedisService.setTyping() calls expire()
2. Check Redis connection
3. Manually test: `hset typing:{topicId} user1 time; expire typing:{topicId} 5`

### Problem: Read receipts lost after server restart
**Cause**: Data stored in Redis, not persistent
**Solution**:
1. This is expected behavior (ephemeral state)
2. For persistence, also save to PostgreSQL
3. Or configure Redis persistence (RDB/AOF)

### Problem: Multiple server instances not sharing state
**Cause**: Redis adapter not properly initialized
**Solution**:
1. Verify pub/sub clients connect to same Redis
2. Check createAdapter() uses both pubClient and subClient
3. Verify `server.adapter(adapter)` called
4. Test with multiple backend instances

## Files Created in This Task

```
src/modules/chat/
├── guards/
│   └── ws-jwt.guard.ts (45 lines)
├── redis.service.ts (180 lines)
├── chat.gateway.ts (385 lines)
├── chat.controller.ts (40 lines)
└── chat.module.ts (30 lines)
```

**Total: 680 lines of code**

## What Happens Next

Task P0-T17 (Frontend Chat UI) consumes this WebSocket layer:
1. Connects Socket.io client to `/chat` namespace
2. Joins conversation rooms on navigation
3. Subscribes to real-time events
4. Updates UI on new messages, typing, read receipts
5. Sends own events (typing, read_receipt)
6. Handles presence UI (online indicators)

---

**Created**: 2026-03-11
**Last Updated**: 2026-03-11
**Status**: Ready for Implementation
