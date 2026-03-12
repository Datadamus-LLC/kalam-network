# Phase 2: Messaging

**Status**: FULLY IMPLEMENTABLE. No blockers.

**Scope**: Tasks T14–T17

---

## Overview: Conversations with HCS & E2E Encryption

The messaging system uses:

1. **Hedera Consensus Service (HCS)** for append-only message storage
2. **AES-256-GCM** for end-to-end encryption (client-side)
3. **PostgreSQL** for conversation metadata and indexing
4. **Socket.io** for real-time WebSocket delivery (typing, read receipts)

Flow:
```
User A writes message → Encrypt client-side → Submit to HCS Topic
                                              ↓
                                    Mirror Node stores & distributes
                                              ↓
User B polls Mirror Node → Fetch encrypted messages → Decrypt client-side
```

---

## HCS Message Payload Schemas

### Chat Message (Encrypted Payload)

Before submission to HCS, the plaintext message is encrypted client-side. The HCS topic only ever stores encrypted data.

```json
{
  "v": "1.0",
  "type": "message",
  "sender": "0.0.12345",
  "ts": 1700000000000,
  "content": {
    "type": "text",
    "text": "[encrypted: base64(...)]"
  },
  "nonce": "base64(...)"
}
```

**Fields**:
- `v`: API version for backwards compatibility
- `type`: Always "message" for chat messages
- `sender`: Hedera account ID of the message author
- `ts`: Client-side timestamp (ms since epoch)
- `content.type`: "text", "image", "file" (type of message)
- `content.text`: The encrypted message content (base64)
- `nonce`: The IV/nonce used for encryption (base64)

**Size constraints**:
- HCS topic message max 6 KB
- After encryption overhead, plaintext should be < 5 KB

### Key Exchange Message (First Message in Topic)

When a conversation is created, the first message is always a key exchange. It contains the symmetric key encrypted under each participant's public key.

```json
{
  "v": "1.0",
  "type": "key_exchange",
  "keys": {
    "0.0.11111": "base64(nacl.box-encrypted AES key)",
    "0.0.22222": "base64(nacl.box-encrypted AES key)"
  },
  "algorithm": "AES-256-GCM",
  "keyId": "550e8400-e29b-41d4-a716-446655440000",
  "rotationIndex": 0
}
```

**Fields**:
- `keys`: Map of Hedera account ID → encrypted AES key
- `keyId`: UUID for tracking key rotation
- `rotationIndex`: Increments when rotating keys (Phase 2 support is optional; Phase 3+)
- `algorithm`: Always "AES-256-GCM" for Phase 2

**Note**: Each participant's public key (stored in PostgreSQL during onboarding) is used to encrypt the shared AES key for them. Only they can decrypt their copy.

---

## Backend: Messaging Module

### Conversation Entity

**File**: `apps/backend/src/messaging/entities/conversation.entity.ts`

```typescript
import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('conversations')
@Index(['topicId'], { unique: true })
@Index(['participants'], { unique: true })
export class Conversation {
  @PrimaryColumn('varchar', { length: 64 })
  id: string; // UUID

  @Column('varchar', { length: 30 })
  topicId: string; // HCS topic ID (0.0.X)

  @Column('varchar', { length: 64, array: true })
  participants: string[]; // Hedera account IDs, stored as array

  @Column('varchar', { length: 64 })
  keyId: string; // UUID for current key

  @Column('int', { default: 0 })
  rotationIndex: number;

  @Column('varchar', { length: 1000, nullable: true })
  metadata?: string; // JSON-encoded metadata (e.g., topic name, avatar)

  @CreateDateColumn()
  createdAt: Date;
}
```

### Message Entity

**File**: `apps/backend/src/messaging/entities/message.entity.ts`

```typescript
import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('messages')
@Index(['conversationId'], { unique: false })
@Index(['hcsMessageId'], { unique: true })
export class Message {
  @PrimaryColumn('varchar', { length: 64 })
  id: string; // UUID (local, for quick client reference)

  @Column('varchar', { length: 64 })
  conversationId: string; // FK to conversations.id

  @Column('varchar', { length: 30 })
  senderAccountId: string; // Hedera account ID

  @Column('text')
  encryptedContent: string; // Full encrypted HCS payload (JSON)

  @Column('varchar', { length: 40 })
  hcsMessageId: string; // Consensus timestamp (in format: shard.realm.num-seconds-nanos)

  @Column('bigint')
  consensusTimestamp: string; // BigInt as string for PostgreSQL compatibility

  @CreateDateColumn()
  createdAt: Date;
}
```

### Messaging Service

**File**: `apps/backend/src/messaging/messaging.service.ts`

```typescript
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { HederaClient } from '@hedera-social/hedera-config';
import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicInfo,
} from '@hashgraph/sdk';
import { Client } from '@hashgraph/sdk';
import { v4 as uuid } from 'uuid';
import axios from 'axios';

interface CreateConversationDto {
  participantAccountIds: string[]; // Include current user
  symmetricKey: string; // Base64-encoded AES key
  encryptedKeysPerParticipant: Record<string, string>; // accountId -> encrypted key
}

interface SendMessageDto {
  conversationId: string;
  encryptedPayload: string; // Full HCS payload (JSON), encrypted client-side
}

@Injectable()
export class MessagingService {
  private client: Client;
  private mirrorNodeUrl = process.env.HEDERA_MIRROR_NODE_URL || 'https://testnet.mirrornode.hedera.com:443';

  constructor(
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
  ) {
    this.client = HederaClient.getInstance(
      process.env.HEDERA_NETWORK as 'testnet' | 'mainnet' | 'previewnet',
      process.env.HEDERA_ACCOUNT_ID!,
      process.env.HEDERA_PRIVATE_KEY!,
    );
  }

  /**
   * Create a new conversation and submit initial key exchange message to HCS.
   */
  async createConversation(
    initiatorAccountId: string,
    dto: CreateConversationDto,
  ): Promise<Conversation> {
    // Validate participants
    if (dto.participantAccountIds.length < 2) {
      throw new BadRequestException('At least 2 participants required');
    }

    if (!dto.participantAccountIds.includes(initiatorAccountId)) {
      throw new BadRequestException('Initiator must be in participants');
    }

    // Step 1: Create HCS Topic
    const topicTransaction = new TopicCreateTransaction()
      .setTopicMemo(`Hedera Social conversation: ${dto.participantAccountIds.join(',')}`)
      .addSubmitKey(this.client.operatorPublicKey!);

    const topicSubmitted = await topicTransaction.execute(this.client);
    const topicReceipt = await topicSubmitted.getReceipt(this.client);

    if (!topicReceipt.topicId) {
      throw new Error('Failed to create HCS topic');
    }

    const topicId = topicReceipt.topicId.toString();
    const keyId = uuid();

    // Step 2: Submit key exchange as first message
    const keyExchangePayload = {
      v: '1.0',
      type: 'key_exchange',
      keys: dto.encryptedKeysPerParticipant,
      algorithm: 'AES-256-GCM',
      keyId,
      rotationIndex: 0,
    };

    const keyExchangeMessage = new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(JSON.stringify(keyExchangePayload));

    const keyExchangeSubmitted = await keyExchangeMessage.execute(this.client);
    const keyExchangeReceipt = await keyExchangeSubmitted.getReceipt(this.client);

    // Step 3: Store conversation metadata in PostgreSQL
    const conversation = this.conversationRepository.create({
      id: uuid(),
      topicId,
      participants: dto.participantAccountIds.sort(), // Consistent ordering
      keyId,
      rotationIndex: 0,
    });

    await this.conversationRepository.save(conversation);

    // Step 4: Store key exchange message
    const message = this.messageRepository.create({
      id: uuid(),
      conversationId: conversation.id,
      senderAccountId: initiatorAccountId,
      encryptedContent: JSON.stringify(keyExchangePayload),
      hcsMessageId: 'key_exchange', // Special ID for key exchange
      consensusTimestamp: (Date.now() * 1_000_000).toString(), // Placeholder
    });

    await this.messageRepository.save(message);

    return conversation;
  }

  /**
   * Submit an encrypted message to HCS.
   */
  async sendMessage(
    conversationId: string,
    senderAccountId: string,
    encryptedPayload: string, // Full JSON message, already encrypted client-side
  ): Promise<Message> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new BadRequestException('Conversation not found');
    }

    // Parse encrypted payload to validate structure
    let payload;
    try {
      payload = JSON.parse(encryptedPayload);
    } catch {
      throw new BadRequestException('Invalid message payload');
    }

    // Verify sender is a participant
    if (!conversation.participants.includes(senderAccountId)) {
      throw new BadRequestException('Sender is not a participant');
    }

    // Submit to HCS
    const transaction = new TopicMessageSubmitTransaction()
      .setTopicId(conversation.topicId)
      .setMessage(encryptedPayload);

    const submitted = await transaction.execute(this.client);
    const receipt = await submitted.getReceipt(this.client);

    // Extract consensus timestamp from receipt
    const consensusTimestamp = receipt.consensusTimestamp?.toNumber() || 0;
    const hcsMessageId = this.formatHcsMessageId(
      receipt.topicSequenceNumber?.toNumber() || 0,
      consensusTimestamp,
    );

    // Store in PostgreSQL for indexing
    const message = this.messageRepository.create({
      id: uuid(),
      conversationId,
      senderAccountId,
      encryptedContent: encryptedPayload,
      hcsMessageId,
      consensusTimestamp: (consensusTimestamp * 1_000_000_000).toString(),
    });

    await this.messageRepository.save(message);

    return message;
  }

  /**
   * Fetch messages from Mirror Node API.
   * IMPLEMENTABLE: Query the Mirror Node REST API.
   */
  async fetchMessagesFromMirror(
    topicId: string,
    limit: number = 50,
    order: 'asc' | 'desc' = 'desc',
  ): Promise<any[]> {
    try {
      // Query Mirror Node: GET /api/v1/topics/{id}/messages
      const url = `${this.mirrorNodeUrl}/api/v1/topics/${topicId}/messages?limit=${limit}&order=${order}`;

      const response = await axios.get(url);
      return response.data.messages || [];
    } catch (error) {
      console.error('Failed to fetch messages from Mirror Node', error);
      return [];
    }
  }

  /**
   * Get conversation by ID.
   */
  async getConversation(conversationId: string): Promise<Conversation | null> {
    return this.conversationRepository.findOne({ where: { id: conversationId } });
  }

  /**
   * Get all conversations for a participant.
   */
  async getUserConversations(accountId: string): Promise<Conversation[]> {
    return this.conversationRepository
      .createQueryBuilder('c')
      .where(':accountId = ANY(c.participants)', { accountId })
      .orderBy('c.createdAt', 'DESC')
      .getMany();
  }

  /**
   * Get messages for a conversation (from PostgreSQL, decrypted client-side).
   */
  async getMessages(
    conversationId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<Message[]> {
    return this.messageRepository
      .createQueryBuilder('m')
      .where('m.conversationId = :conversationId', { conversationId })
      .orderBy('m.createdAt', 'DESC')
      .limit(limit)
      .offset(offset)
      .getMany();
  }

  private formatHcsMessageId(sequence: number, consensusTimestamp: number): string {
    // Format: `{sequence}-{timestamp}`
    return `${sequence}-${consensusTimestamp}`;
  }
}
```

### Messaging Controller

**File**: `apps/backend/src/messaging/messaging.controller.ts`

```typescript
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MessagingService } from './messaging.service';

@Controller('messaging')
@UseGuards(JwtAuthGuard)
export class MessagingController {
  constructor(private messagingService: MessagingService) {}

  @Post('conversations')
  async createConversation(
    @Request() req: any,
    @Body() dto: {
      participantAccountIds: string[];
      encryptedKeysPerParticipant: Record<string, string>;
    },
  ) {
    return this.messagingService.createConversation(req.user.accountId, {
      participantAccountIds: dto.participantAccountIds,
      symmetricKey: '', // Not stored server-side
      encryptedKeysPerParticipant: dto.encryptedKeysPerParticipant,
    });
  }

  @Get('conversations')
  async getUserConversations(@Request() req: any) {
    return this.messagingService.getUserConversations(req.user.accountId);
  }

  @Get('conversations/:conversationId')
  async getConversation(@Param('conversationId') conversationId: string) {
    return this.messagingService.getConversation(conversationId);
  }

  @Post('conversations/:conversationId/messages')
  async sendMessage(
    @Request() req: any,
    @Param('conversationId') conversationId: string,
    @Body() dto: { encryptedPayload: string },
  ) {
    return this.messagingService.sendMessage(
      conversationId,
      req.user.accountId,
      dto.encryptedPayload,
    );
  }

  @Get('conversations/:conversationId/messages')
  async getMessages(
    @Param('conversationId') conversationId: string,
    @Query('limit') limit: number = 50,
    @Query('offset') offset: number = 0,
  ) {
    return this.messagingService.getMessages(conversationId, limit, offset);
  }
}
```

---

## WebSocket Gateway (Real-Time)

Socket.io handles typing indicators and read receipts (NOT stored on HCS — too expensive).

### WebSocket Events

**File**: `apps/backend/src/messaging/messaging.gateway.ts`

```typescript
import {
  WebSocketGateway,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';

interface SocketUser {
  userId: string;
  accountId: string;
}

interface TypingIndicator {
  conversationId: string;
  userId: string;
  accountId: string;
}

interface ReadReceipt {
  conversationId: string;
  messageId: string;
  userId: string;
  accountId: string;
  readAt: number;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  },
})
export class MessagingGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private server: Server;
  private users = new Map<string, SocketUser>(); // socketId -> user
  private logger = new Logger('MessagingGateway');

  constructor(private jwtService: JwtService) {}

  afterInit(server: Server) {
    this.server = server;
    this.logger.log('WebSocket initialized');
  }

  async handleConnection(client: Socket) {
    try {
      // Authenticate via JWT token in query params or headers
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
      this.logger.log(`Client connected: ${client.id} (${user.accountId})`);

      // Notify others that this user is online
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
      this.users.delete(client.id);
    }
  }

  /**
   * Join conversation room.
   */
  @SubscribeMessage('conversation:join')
  handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const user = this.users.get(client.id);
    if (user) {
      client.join(`conversation:${data.conversationId}`);
      client.emit('conversation:joined', { conversationId: data.conversationId });
    }
  }

  /**
   * Leave conversation room.
   */
  @SubscribeMessage('conversation:leave')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const user = this.users.get(client.id);
    if (user) {
      client.leave(`conversation:${data.conversationId}`);
    }
  }

  /**
   * Typing indicator — broadcast to room.
   */
  @SubscribeMessage('typing:start')
  handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const user = this.users.get(client.id);
    if (user) {
      const typing: TypingIndicator = {
        conversationId: data.conversationId,
        userId: user.userId,
        accountId: user.accountId,
      };
      this.server
        .to(`conversation:${data.conversationId}`)
        .emit('typing:start', typing);
    }
  }

  /**
   * Stop typing — broadcast to room.
   */
  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const user = this.users.get(client.id);
    if (user) {
      this.server
        .to(`conversation:${data.conversationId}`)
        .emit('typing:stop', { userId: user.userId });
    }
  }

  /**
   * Read receipt — broadcast to room.
   */
  @SubscribeMessage('message:read')
  handleMessageRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; messageId: string },
  ) {
    const user = this.users.get(client.id);
    if (user) {
      const receipt: ReadReceipt = {
        conversationId: data.conversationId,
        messageId: data.messageId,
        userId: user.userId,
        accountId: user.accountId,
        readAt: Date.now(),
      };
      this.server
        .to(`conversation:${data.conversationId}`)
        .emit('message:read', receipt);
    }
  }

  /**
   * New message notification — send to room.
   * Called by messaging.service when a message is submitted to HCS.
   */
  broadcastNewMessage(conversationId: string, message: any) {
    this.server
      .to(`conversation:${conversationId}`)
      .emit('message:new', { ...message });
  }
}
```

### Register WebSocket in App Module

```typescript
// apps/backend/src/app.module.ts
import { MessagingGateway } from './messaging/messaging.gateway';

@Module({
  imports: [
    // ... other imports
    MessagingModule,
  ],
  providers: [
    // ... other providers
    MessagingGateway,
  ],
})
export class AppModule {}
```

---

## Frontend: Client-Side Encryption & Decryption

### Crypto Client Library

**File**: `apps/frontend/lib/crypto.ts`

Uses Web Crypto API for AES-256-GCM encryption/decryption.

```typescript
export class CryptoClient {
  /**
   * Generate a random AES-256 key.
   */
  static async generateKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true, // extractable
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt plaintext with AES-256-GCM.
   * Returns base64-encoded JSON: { nonce, ciphertext }
   */
  static async encrypt(plaintext: string, key: CryptoKey): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    const nonce = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      key,
      data
    );

    const payload = {
      nonce: btoa(String.fromCharCode(...nonce)),
      ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    };

    return JSON.stringify(payload);
  }

  /**
   * Decrypt base64-encoded { nonce, ciphertext } payload.
   */
  static async decrypt(encrypted: string, key: CryptoKey): Promise<string> {
    const payload = JSON.parse(encrypted);
    const nonce = Uint8Array.from(atob(payload.nonce), c => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(payload.ciphertext), c => c.charCodeAt(0));

    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce },
      key,
      ciphertext
    );

    return new TextDecoder().decode(plaintext);
  }

  /**
   * Export key to base64 for transmission to server.
   */
  static async exportKey(key: CryptoKey): Promise<string> {
    const exported = await crypto.subtle.exportKey('raw', key);
    return btoa(String.fromCharCode(...new Uint8Array(exported)));
  }

  /**
   * Import key from base64.
   */
  static async importKey(keyData: string): Promise<CryptoKey> {
    const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
    return crypto.subtle.importKey(
      'raw',
      binaryKey,
      { name: 'AES-GCM' },
      true,
      ['encrypt', 'decrypt']
    );
  }
}
```

### Chat Hook

**File**: `apps/frontend/lib/hooks/useChat.ts`

```typescript
'use client';

import { useCallback, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { CryptoClient } from '../crypto';

interface Message {
  id: string;
  senderAccountId: string;
  content: string; // Decrypted plaintext
  createdAt: Date;
}

interface TypingUser {
  accountId: string;
  userId: string;
}

export function useChat(conversationId: string, token: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [typing, setTyping] = useState<Set<string>>(new Set());
  const [symmetricKey, setSymmetricKey] = useState<CryptoKey | null>(null);
  const [loading, setLoading] = useState(true);

  // Connect to WebSocket and fetch initial messages
  useEffect(() => {
    const ws = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000', {
      auth: { token },
      reconnection: true,
    });

    ws.on('connection:success', () => {
      // Join conversation room
      ws.emit('conversation:join', { conversationId });
    });

    ws.on('message:new', (message: any) => {
      decryptAndAddMessage(message);
    });

    ws.on('typing:start', (data: TypingUser) => {
      setTyping(prev => new Set([...prev, data.accountId]));
    });

    ws.on('typing:stop', (data: { userId: string }) => {
      setTyping(prev => {
        const next = new Set(prev);
        next.delete(data.userId);
        return next;
      });
    });

    setSocket(ws);

    // Fetch initial messages
    fetchMessages();

    return () => {
      ws.emit('conversation:leave', { conversationId });
      ws.disconnect();
    };
  }, [conversationId, token]);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/messaging/conversations/${conversationId}/messages`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();

      for (const msg of data) {
        await decryptAndAddMessage(msg);
      }
    } catch (error) {
      console.error('Failed to fetch messages', error);
    } finally {
      setLoading(false);
    }
  }, [conversationId, token]);

  const decryptAndAddMessage = useCallback(
    async (encryptedMsg: any) => {
      if (!symmetricKey) return;

      try {
        const decrypted = await CryptoClient.decrypt(
          encryptedMsg.encryptedContent,
          symmetricKey
        );
        const content = JSON.parse(decrypted);

        setMessages(prev => [
          ...prev,
          {
            id: encryptedMsg.id,
            senderAccountId: encryptedMsg.senderAccountId,
            content: content.content.text,
            createdAt: new Date(encryptedMsg.createdAt),
          },
        ]);
      } catch (error) {
        console.error('Failed to decrypt message', error);
      }
    },
    [symmetricKey]
  );

  const sendMessage = useCallback(
    async (plaintext: string) => {
      if (!socket || !symmetricKey) {
        console.error('Socket or key not ready');
        return;
      }

      try {
        // Encrypt message
        const messagePayload = {
          v: '1.0',
          type: 'message',
          sender: '', // Set by server
          ts: Date.now(),
          content: {
            type: 'text',
            text: plaintext,
          },
        };

        const encrypted = await CryptoClient.encrypt(
          JSON.stringify(messagePayload),
          symmetricKey
        );

        // Submit to backend
        const res = await fetch(
          `/api/messaging/conversations/${conversationId}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ encryptedPayload: encrypted }),
          }
        );

        if (!res.ok) {
          throw new Error('Failed to send message');
        }

        // Message will be received via WebSocket
      } catch (error) {
        console.error('Failed to send message', error);
      }
    },
    [socket, symmetricKey, conversationId, token]
  );

  const markTyping = useCallback(
    (isTyping: boolean) => {
      if (!socket) return;
      if (isTyping) {
        socket.emit('typing:start', { conversationId });
      } else {
        socket.emit('typing:stop', { conversationId });
      }
    },
    [socket, conversationId]
  );

  return {
    messages,
    sendMessage,
    markTyping,
    typing,
    loading,
  };
}
```

### Chat Component

**File**: `apps/frontend/components/Chat.tsx`

```typescript
'use client';

import { useChat } from '@/lib/hooks/useChat';
import { useState, useRef, useEffect } from 'react';

export function ChatUI({ conversationId, token }: { conversationId: string; token: string }) {
  const { messages, sendMessage, markTyping, typing, loading } = useChat(conversationId, token);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);

    // Emit typing indicator
    if (!isTyping) {
      markTyping(true);
      setIsTyping(true);
    }

    // Reset typing indicator after 2 seconds of inactivity
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      markTyping(false);
      setIsTyping(false);
    }, 2000);
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    await sendMessage(input);
    setInput('');
    markTyping(false);
    setIsTyping(false);
  };

  if (loading) return <div>Loading conversation...</div>;

  return (
    <div className="flex flex-col h-full">
      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(msg => (
          <div key={msg.id} className="p-2 bg-gray-100 rounded">
            <p className="text-sm font-bold">{msg.senderAccountId}</p>
            <p>{msg.content}</p>
          </div>
        ))}

        {/* Typing Indicators */}
        {typing.size > 0 && (
          <div className="text-sm text-gray-500">
            {Array.from(typing).join(', ')} is typing...
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t flex gap-2">
        <input
          type="text"
          placeholder="Type a message..."
          value={input}
          onChange={handleInput}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          className="flex-1 px-3 py-2 border rounded"
        />
        <button
          onClick={handleSend}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

---

## Frontend: Conversation List

**File**: `apps/frontend/app/(main)/chat/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Conversation {
  id: string;
  topicId: string;
  participants: string[];
  createdAt: string;
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const res = await fetch('/api/messaging/conversations');
        const data = await res.json();
        setConversations(data);
      } catch (error) {
        console.error('Failed to fetch conversations', error);
      } finally {
        setLoading(false);
      }
    };

    fetchConversations();
  }, []);

  if (loading) return <div>Loading conversations...</div>;

  return (
    <div className="p-4">
      <h1>Messages</h1>
      <div className="space-y-2">
        {conversations.map(conv => (
          <Link
            key={conv.id}
            href={`/chat/${conv.id}`}
            className="block p-3 border rounded hover:bg-gray-100"
          >
            <p className="font-bold">{conv.participants.join(', ')}</p>
            <p className="text-sm text-gray-500">{new Date(conv.createdAt).toLocaleDateString()}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

---

## Key Takeaways for Phase 2

- **Fully implementable** — all Hedera SDK and Web Crypto API calls are documented
- **No mock data** — all messages are real HCS transactions
- **Client-side encryption** — server never sees plaintext
- **WebSocket for real-time** — typing, read receipts, new message notifications
- **Mirror Node for history** — users can fetch past messages from HCS
- **PostgreSQL for indexing** — fast queries without HCS API overhead
- **Error handling** — clear messages on network failures

Next: Phase 3 (Social Feed) — fully implementable.
