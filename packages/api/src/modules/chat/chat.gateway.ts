import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  WsException,
} from "@nestjs/websockets";
import { Server, Socket, Namespace } from "socket.io";
import { Logger, UseGuards, UsePipes, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { OnEvent } from "@nestjs/event-emitter";
import { createAdapter } from "@socket.io/redis-adapter";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as jwt from "jsonwebtoken";
import { ConversationMemberEntity } from "../../database/entities/conversation-member.entity";
import { ChatRedisService } from "./chat-redis.service";
import type { JwtPayload } from "../../common/guards/jwt-auth.guard";
import { WsJwtGuard, type AuthenticatedSocket } from "./guards/ws-jwt.guard";
import {
  JoinConversationDto,
  LeaveConversationDto,
  TypingDto,
  ReadReceiptDto,
} from "./dto/ws-events.dto";
import type {
  ServerNewMessagePayload,
  ServerTypingPayload,
  ServerReadReceiptPayload,
  ServerPresencePayload,
  JoinedConversationPayload,
  ReadReceiptSyncPayload,
  WsErrorPayload,
  MessagesSyncedEvent,
  ConversationStateResponse,
} from "./dto/ws-events.dto";
import type { NotificationCreatedPayload } from "../notifications/notifications.service";

/**
 * Module-level JWT secret used by `allowRequest` for HTTP-transport-level
 * token verification. Set during `afterInit()` from ConfigService so it
 * works in both production and test environments.
 */
let _chatGatewayJwtSecret: string | undefined;

/**
 * ChatGateway handles real-time communication for the messaging system.
 *
 * Uses Socket.io with Redis adapter for horizontal scaling. Clients connect
 * to the `/chat` namespace and authenticate via JWT on the handshake.
 *
 * Room naming convention: `conv:{topicId}` (using HCS topic IDs).
 *
 * Client -> Server events:
 *   - join_conversation: Join a conversation room
 *   - leave_conversation: Leave a conversation room
 *   - typing: Broadcast typing indicator
 *   - read_receipt: Acknowledge reading messages up to a sequence number
 *
 * Server -> Client events:
 *   - server_new_message: New message synced from Mirror Node
 *   - server_typing: Another user is typing
 *   - server_read_receipt: Another user's read receipt
 *   - server_user_online: User joined conversation
 *   - server_user_offline: User left conversation
 *   - joined_conversation: Confirmation after joining
 *   - read_receipt_sync: Initial read receipt data after joining
 *   - ws_error: Error notification
 */
@WebSocketGateway({
  namespace: "/chat",
  // Auth is enforced at FOUR levels:
  // 1. allowRequest — verifies JWT at HTTP transport level (prevents unauthenticated polling)
  // 2. Namespace middleware (afterInit) — validates JWT from auth.token or Authorization header
  // 3. handleConnection — defense-in-depth disconnect for invalid tokens
  // 4. connectTimeout — auto-disconnect clients that don't complete handshake in time
  //
  // allowRequest verifies JWT from HTTP headers and query params (available at Engine.io level).
  // Socket.io clients must set extraHeaders: { Authorization: 'Bearer <token>' } or
  // pass ?token=<jwt> in the query string so Engine.io can verify auth at HTTP level.
  // The namespace middleware then validates the full JWT from auth.token, headers, or query.
  allowRequest: (req, callback) => {
    let token: string | undefined;

    // Extract token from Authorization header
    const authHeader = req.headers?.authorization;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }

    // Fallback: extract token from URL query parameter
    if (!token) {
      const url = req.url ?? "";
      const match = url.match(/[?&]token=([^&]+)/);
      if (match?.[1]) {
        token = decodeURIComponent(match[1]);
      }
    }

    if (!token) {
      callback("Authentication required", false);
      return;
    }

    // Verify the JWT at the HTTP transport level to prevent
    // unauthenticated polling sessions (fixes BUG-013).
    // Uses the secret set by afterInit() from ConfigService.
    if (!_chatGatewayJwtSecret) {
      // Secret not yet loaded (server still initializing) — let namespace
      // middleware handle full auth instead of rejecting during startup.
      callback(null, true);
      return;
    }

    try {
      jwt.verify(token, _chatGatewayJwtSecret);
      callback(null, true);
    } catch {
      callback("Invalid authentication token", false);
    }
  },
  connectTimeout: 5000,
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  /**
   * In-memory tracking of which conversation rooms each socket is in.
   * Map: socketId -> Set of topicIds
   *
   * Used for efficient cleanup on disconnect.
   */
  private readonly socketRooms = new Map<string, Set<string>>();

  /**
   * Map: socketId -> accountId for quick lookup on disconnect.
   */
  private readonly socketAccountMap = new Map<string, string>();

  constructor(
    private readonly chatRedisService: ChatRedisService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    @InjectRepository(ConversationMemberEntity)
    private readonly memberRepository: Repository<ConversationMemberEntity>,
  ) {}

  // ---------------------------------------------------------------------------
  // Lifecycle: afterInit
  // ---------------------------------------------------------------------------

  /**
   * Initialize the Redis adapter for horizontal scaling and
   * Socket.io namespace-level authentication middleware.
   *
   * The auth middleware runs BEFORE the transport handshake completes,
   * preventing unauthenticated clients from establishing polling sessions
   * or allocating server resources (fixes BUG-013).
   */
  async afterInit(server: Server): Promise<void> {
    this.logger.log("Initializing ChatGateway");

    // Store JWT secret in module-level variable for allowRequest to use.
    // This must happen before any client connections are accepted.
    _chatGatewayJwtSecret = this.configService.get<string>("jwt.secret");

    // With namespace gateways, NestJS passes a Namespace (not root Server).
    const ns = server as unknown as Namespace;
    const ioServer: Server = ns.server ?? server;

    // ── Socket.io authentication middleware ──
    // This runs at the namespace level BEFORE handleConnection,
    // rejecting unauthenticated clients during the handshake phase.
    ns.use((socket, next) => {
      let token: string | undefined;

      // Extract token from handshake auth object
      if (
        socket.handshake.auth &&
        typeof socket.handshake.auth.token === "string"
      ) {
        token = socket.handshake.auth.token;
      }

      // Fallback: Authorization header
      if (!token && socket.handshake.headers.authorization) {
        const authHeader = socket.handshake.headers.authorization;
        const parts = authHeader.split(" ");
        if (parts[0] === "Bearer" && parts[1]) {
          token = parts[1];
        }
      }

      // Fallback: query parameter (some clients send token via ?token=...)
      if (
        !token &&
        socket.handshake.query &&
        typeof socket.handshake.query.token === "string"
      ) {
        token = socket.handshake.query.token;
      }

      if (!token) {
        this.logger.warn(
          `Socket ${socket.id} rejected at middleware: no token provided`,
        );
        return next(new WsException("Authentication token is required"));
      }

      try {
        const secret = this.configService.get<string>("jwt.secret");
        this.jwtService.verify(token, { secret });
        next();
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Socket ${socket.id} rejected at middleware: invalid token — ${reason}`,
        );
        next(new WsException("Invalid or expired authentication token"));
      }
    });

    this.logger.log("Socket.io namespace authentication middleware installed");

    // ── Redis adapter for horizontal scaling ──
    try {
      const pubClient = this.chatRedisService.createAdapterClient();
      const subClient = this.chatRedisService.createAdapterClient();
      ioServer.adapter(createAdapter(pubClient, subClient));

      this.logger.log(
        "Redis adapter configured for Socket.io horizontal scaling",
      );
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to initialize Redis adapter: ${reason}`);
      // Gateway will still work for single-instance, but not for multi-instance
    }

    // Override CORS origin from ConfigService
    const corsOrigin = this.configService.getOrThrow<string>("cors.origin");
    this.logger.log(`ChatGateway CORS origin: ${corsOrigin}`);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle: handleConnection
  // ---------------------------------------------------------------------------

  /**
   * Handle a new client connection.
   *
   * Enforces JWT authentication at the handshake level. Clients that
   * do not provide a valid JWT token are immediately disconnected.
   * This prevents unauthenticated sockets from occupying server resources.
   */
  async handleConnection(client: Socket): Promise<void> {
    // Extract token from handshake auth or Authorization header
    let token: string | undefined;

    if (
      client.handshake.auth &&
      typeof client.handshake.auth.token === "string"
    ) {
      token = client.handshake.auth.token;
    }

    if (!token && client.handshake.headers.authorization) {
      const authHeader = client.handshake.headers.authorization;
      const parts = authHeader.split(" ");
      if (parts[0] === "Bearer" && parts[1]) {
        token = parts[1];
      }
    }

    // Fallback: query parameter
    if (
      !token &&
      client.handshake.query &&
      typeof client.handshake.query.token === "string"
    ) {
      token = client.handshake.query.token;
    }

    if (!token) {
      this.logger.warn(
        `Client ${client.id} rejected at handshake: no token provided`,
      );
      client.emit("ws_error", {
        code: "WS_TOKEN_MISSING",
        message: "Authentication token is required",
      });
      client.disconnect(true);
      return;
    }

    try {
      const secret = this.configService.get<string>("jwt.secret");
      const payload = this.jwtService.verify<JwtPayload>(token, { secret });

      // Attach user to socket for downstream handlers
      (client as AuthenticatedSocket).user = payload;

      const accountId = payload.hederaAccountId;
      this.socketAccountMap.set(client.id, accountId);
      this.socketRooms.set(client.id, new Set());

      // Auto-join per-user room for notification delivery
      void client.join(`user:${accountId}`);

      this.logger.log(`Client connected: ${client.id} (account: ${accountId})`);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Client ${client.id} rejected at handshake: invalid token — ${reason}`,
      );
      client.emit("ws_error", {
        code: "WS_AUTHENTICATION_FAILED",
        message: "Invalid or expired token",
      });
      client.disconnect(true);
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle: handleDisconnect
  // ---------------------------------------------------------------------------

  /**
   * Handle client disconnection.
   *
   * Cleans up presence from Redis and notifies all rooms the user was in.
   */
  async handleDisconnect(client: Socket): Promise<void> {
    const accountId = this.socketAccountMap.get(client.id);
    const topics = this.socketRooms.get(client.id);

    this.logger.log(
      `Client disconnected: ${client.id} (account: ${accountId ?? "unknown"})`,
    );

    if (accountId && topics && topics.size > 0) {
      // Remove presence from Redis for all rooms this socket was in
      const removedTopics =
        await this.chatRedisService.removePresenceBySocketId(
          client.id,
          accountId,
          [...topics],
        );

      // Broadcast offline events to each room
      for (const topicId of removedTopics) {
        const roomName = this.toRoomName(topicId);
        const payload: ServerPresencePayload = {
          accountId,
          topicId,
          timestamp: Date.now(),
        };
        this.server.to(roomName).emit("server_user_offline", payload);
      }
    }

    // Clean up in-memory maps
    this.socketRooms.delete(client.id);
    this.socketAccountMap.delete(client.id);
  }

  // ---------------------------------------------------------------------------
  // Event: join_conversation
  // ---------------------------------------------------------------------------

  /**
   * Handle a client joining a conversation room.
   *
   * Validates that the user is a participant in the conversation,
   * joins the Socket.io room, stores presence in Redis, and
   * broadcasts the online event to other room members.
   *
   * Also sends an initial sync of read receipts to the joining client.
   */
  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @SubscribeMessage("join_conversation")
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinConversationDto,
  ): Promise<void> {
    const authenticatedClient = client as AuthenticatedSocket;
    const accountId = authenticatedClient.user.hederaAccountId;
    const { topicId } = data;

    try {
      // Ensure socket is tracked in our maps
      this.ensureSocketTracked(client.id, accountId);

      // Validate that the user is a conversation participant
      const isMember = await this.isConversationMember(topicId, accountId);
      if (!isMember) {
        const errorPayload: WsErrorPayload = {
          code: "NOT_CONVERSATION_MEMBER",
          message: `Not a member of conversation topic ${topicId}`,
        };
        client.emit("ws_error", errorPayload);
        return;
      }

      // Join the Socket.io room
      const roomName = this.toRoomName(topicId);
      await client.join(roomName);

      // Track the room locally
      const rooms = this.socketRooms.get(client.id);
      if (rooms) {
        rooms.add(topicId);
      }

      // Store presence in Redis
      await this.chatRedisService.setPresence(topicId, accountId, client.id);

      // Broadcast user online to the room (including the joining client)
      const presencePayload: ServerPresencePayload = {
        accountId,
        topicId,
        timestamp: Date.now(),
      };
      this.server.to(roomName).emit("server_user_online", presencePayload);

      // Get online users for the confirmation
      const onlineAccountIds =
        await this.chatRedisService.getOnlineAccountIds(topicId);

      // Send confirmation to the joining client
      const confirmPayload: JoinedConversationPayload = {
        topicId,
        onlineUsers: onlineAccountIds,
        timestamp: Date.now(),
      };
      client.emit("joined_conversation", confirmPayload);

      // Send read receipt sync to the joining client
      await this.sendReadReceiptSync(client, topicId);

      this.logger.log(`User ${accountId} joined conversation ${topicId}`);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error in join_conversation for ${accountId} in ${topicId}: ${reason}`,
      );
      const errorPayload: WsErrorPayload = {
        code: "JOIN_CONVERSATION_FAILED",
        message: "Failed to join conversation",
      };
      client.emit("ws_error", errorPayload);
    }
  }

  // ---------------------------------------------------------------------------
  // Event: leave_conversation
  // ---------------------------------------------------------------------------

  /**
   * Handle a client leaving a conversation room.
   *
   * Removes the client from the Socket.io room, clears presence in Redis,
   * and broadcasts the offline event to remaining room members.
   */
  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @SubscribeMessage("leave_conversation")
  async handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: LeaveConversationDto,
  ): Promise<void> {
    const authenticatedClient = client as AuthenticatedSocket;
    const accountId = authenticatedClient.user.hederaAccountId;
    const { topicId } = data;

    try {
      const roomName = this.toRoomName(topicId);

      // Leave the Socket.io room
      await client.leave(roomName);

      // Remove from local tracking
      const rooms = this.socketRooms.get(client.id);
      if (rooms) {
        rooms.delete(topicId);
      }

      // Remove presence from Redis
      await this.chatRedisService.removePresence(topicId, accountId);

      // Clear typing indicator if active
      await this.chatRedisService.clearTyping(topicId, accountId);

      // Broadcast user offline to the room
      const presencePayload: ServerPresencePayload = {
        accountId,
        topicId,
        timestamp: Date.now(),
      };
      this.server.to(roomName).emit("server_user_offline", presencePayload);

      this.logger.log(`User ${accountId} left conversation ${topicId}`);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error in leave_conversation for ${accountId} in ${topicId}: ${reason}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Event: typing
  // ---------------------------------------------------------------------------

  /**
   * Handle typing indicator events.
   *
   * When isTyping=true, stores the typing state in Redis with a 5-second TTL
   * and broadcasts to the room. When isTyping=false, clears the state.
   *
   * Typing indicators are NOT persisted to HCS — they are ephemeral
   * WebSocket-only events backed by Redis TTL for automatic cleanup.
   */
  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @SubscribeMessage("typing")
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: TypingDto,
  ): Promise<void> {
    const authenticatedClient = client as AuthenticatedSocket;
    const accountId = authenticatedClient.user.hederaAccountId;
    const { topicId, isTyping } = data;

    try {
      const roomName = this.toRoomName(topicId);

      if (isTyping) {
        await this.chatRedisService.setTyping(topicId, accountId);
      } else {
        await this.chatRedisService.clearTyping(topicId, accountId);
      }

      // Broadcast typing event to the room (excluding sender)
      const payload: ServerTypingPayload = {
        accountId,
        topicId,
        isTyping,
        timestamp: Date.now(),
      };
      client.to(roomName).emit("server_typing", payload);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error in typing for ${accountId} in ${topicId}: ${reason}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Event: read_receipt
  // ---------------------------------------------------------------------------

  /**
   * Handle read receipt events.
   *
   * Stores the read receipt in Redis (keyed by topicId and accountId)
   * and broadcasts to the room so other clients can update their UI.
   *
   * Read receipts are NOT persisted to HCS — they live in Redis
   * with a 7-day TTL for automatic cleanup.
   */
  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @SubscribeMessage("read_receipt")
  async handleReadReceipt(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: ReadReceiptDto,
  ): Promise<void> {
    const authenticatedClient = client as AuthenticatedSocket;
    const accountId = authenticatedClient.user.hederaAccountId;
    const { topicId, lastReadSequence } = data;

    try {
      // Store read receipt in Redis
      await this.chatRedisService.setReadReceipt(
        topicId,
        accountId,
        lastReadSequence,
      );

      // Broadcast read receipt to the room (excluding sender)
      const roomName = this.toRoomName(topicId);
      const payload: ServerReadReceiptPayload = {
        accountId,
        topicId,
        lastReadSequence,
        timestamp: Date.now(),
      };
      client.to(roomName).emit("server_read_receipt", payload);

      this.logger.debug(
        `Read receipt: ${accountId} read up to seq ${lastReadSequence} in ${topicId}`,
      );
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error in read_receipt for ${accountId} in ${topicId}: ${reason}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // EventEmitter: messages.synced
  // ---------------------------------------------------------------------------

  /**
   * Listen for the 'messages.synced' event emitted by MessageSyncService
   * when new messages are polled from the Hedera Mirror Node.
   *
   * Broadcasts a server_new_message event to all clients in the conversation room.
   */
  @OnEvent("messages.synced")
  async handleMessagesSynced(payload: MessagesSyncedEvent): Promise<void> {
    try {
      const roomName = this.toRoomName(payload.topicId);

      const eventPayload: ServerNewMessagePayload = {
        topicId: payload.topicId,
        lastSequence: payload.lastSequence,
        timestamp: Date.now(),
      };

      this.server.to(roomName).emit("server_new_message", eventPayload);

      this.logger.debug(
        `Broadcast new message to ${roomName} (sequence: ${payload.lastSequence})`,
      );
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error broadcasting messages.synced: ${reason}`);
    }
  }

  // ---------------------------------------------------------------------------
  // EventEmitter: notification.created
  // ---------------------------------------------------------------------------

  /**
   * Listen for the 'notification.created' event emitted by NotificationsService
   * when a new notification is created.
   *
   * Delivers the notification via WebSocket to the recipient's per-user room
   * (joined automatically on connection).
   */
  @OnEvent("notification.created")
  async handleNotificationCreated(
    payload: NotificationCreatedPayload,
  ): Promise<void> {
    try {
      const userRoom = `user:${payload.recipientAccountId}`;
      this.server
        .to(userRoom)
        .emit("server_notification", payload.notification);

      this.logger.debug(
        `Emitted notification to ${userRoom}: ${payload.notification.event}`,
      );
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error emitting notification to ${payload.recipientAccountId}: ${reason}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Public methods (used by ChatController)
  // ---------------------------------------------------------------------------

  /**
   * Get the current real-time state of a conversation.
   * Returns online users, read receipts, and typing indicators.
   */
  async getConversationState(
    topicId: string,
  ): Promise<ConversationStateResponse> {
    const [onlineUsers, readReceipts, typingUsers] = await Promise.all([
      this.chatRedisService.getPresenceUsers(topicId),
      this.chatRedisService.getAllReadReceipts(topicId),
      this.chatRedisService.getTypingUsers(topicId),
    ]);

    return {
      topicId,
      onlineUsers,
      readReceipts,
      typingUsers,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Convert a topic ID to a Socket.io room name.
   */
  private toRoomName(topicId: string): string {
    return `conv:${topicId}`;
  }

  /**
   * Ensure a socket is tracked in our in-memory maps.
   * Called on first authenticated message if connection didn't have user context.
   */
  private ensureSocketTracked(socketId: string, accountId: string): void {
    if (!this.socketAccountMap.has(socketId)) {
      this.socketAccountMap.set(socketId, accountId);
    }
    if (!this.socketRooms.has(socketId)) {
      this.socketRooms.set(socketId, new Set());
    }
  }

  /**
   * Check if a Hedera account is a member of a conversation identified by its HCS topic ID.
   *
   * Looks up the conversation_member table via the conversation entity's topic ID.
   */
  private async isConversationMember(
    topicId: string,
    accountId: string,
  ): Promise<boolean> {
    const member = await this.memberRepository
      .createQueryBuilder("member")
      .innerJoin("conversations", "conv", "conv.id = member.conversationId")
      .where("conv.hcsTopicId = :topicId", { topicId })
      .andWhere("member.hederaAccountId = :accountId", { accountId })
      .andWhere("member.leftAt IS NULL")
      .getOne();

    return member !== null;
  }

  /**
   * Send an initial sync of read receipts to a client after they join a conversation.
   */
  private async sendReadReceiptSync(
    client: Socket,
    topicId: string,
  ): Promise<void> {
    try {
      const receipts = await this.chatRedisService.getAllReadReceipts(topicId);
      const payload: ReadReceiptSyncPayload = {
        topicId,
        receipts,
      };
      client.emit("read_receipt_sync", payload);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to send read receipt sync for ${topicId}: ${reason}`,
      );
    }
  }
}
