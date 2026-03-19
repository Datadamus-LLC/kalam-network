import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import type {
  ReadReceiptEntry,
  PresenceUserResponse,
} from "./dto/ws-events.dto";
import { WsRedisConnectionException } from "./exceptions/chat.exceptions";

/**
 * Redis-backed service for chat presence, typing indicators, and read receipts.
 *
 * Key schema:
 *   chat:presence:{topicId}   — Hash: accountId -> JSON({socketId, joinedAt})
 *   chat:typing:{topicId}     — Hash: accountId -> timestamp (auto-expires 5s)
 *   chat:read:{topicId}       — Hash: accountId -> "{sequence}:{timestamp}"
 *
 * Separate from the global RedisService to manage its own pub/sub connections
 * needed by the Socket.io Redis adapter.
 */

/** Internal shape stored in presence Redis hashes. */
interface PresenceEntry {
  socketId: string;
  joinedAt: number;
}

/** TTL for typing indicators in seconds. */
const TYPING_TTL_SECONDS = 5;

/** TTL for presence keys (24 hours) — auto-cleanup for stale entries. */
const PRESENCE_TTL_SECONDS = 86400;

/** TTL for read receipt keys (7 days). */
const READ_RECEIPT_TTL_SECONDS = 604800;

@Injectable()
export class ChatRedisService implements OnModuleDestroy {
  private readonly logger = new Logger(ChatRedisService.name);
  private readonly client: Redis;

  /** Redis key prefixes. */
  private static readonly PREFIX_PRESENCE = "chat:presence:";
  private static readonly PREFIX_TYPING = "chat:typing:";
  private static readonly PREFIX_READ = "chat:read:";

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>("redis.host", "localhost");
    const port = this.configService.get<number>("redis.port", 6379);
    const password = this.configService.get<string>("redis.password");

    this.client = new Redis({
      host,
      port,
      ...(password ? { password } : {}),
      retryStrategy: (times: number): number | null => {
        if (times > 5) {
          this.logger.error(
            `ChatRedis connection failed after ${times} attempts`,
          );
          return null;
        }
        return Math.min(times * 200, 2000);
      },
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.client.on("connect", () => {
      this.logger.log("ChatRedis connected");
    });

    this.client.on("error", (error: Error) => {
      this.logger.error(`ChatRedis error: ${error.message}`);
    });

    this.client.connect().catch((error: Error) => {
      this.logger.warn(
        `ChatRedis initial connection failed: ${error.message} — will retry on first use`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
    this.logger.log("ChatRedis disconnected");
  }

  // ---------------------------------------------------------------------------
  // Presence tracking
  // ---------------------------------------------------------------------------

  /**
   * Record that a user is present (online) in a conversation.
   */
  async setPresence(
    topicId: string,
    accountId: string,
    socketId: string,
  ): Promise<void> {
    const key = `${ChatRedisService.PREFIX_PRESENCE}${topicId}`;
    const entry: PresenceEntry = { socketId, joinedAt: Date.now() };

    try {
      await this.client.hset(key, accountId, JSON.stringify(entry));
      await this.client.expire(key, PRESENCE_TTL_SECONDS);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to set presence for ${accountId} in ${topicId}: ${reason}`,
      );
      throw new WsRedisConnectionException(reason);
    }
  }

  /**
   * Remove a user's presence from a conversation.
   */
  async removePresence(topicId: string, accountId: string): Promise<void> {
    const key = `${ChatRedisService.PREFIX_PRESENCE}${topicId}`;

    try {
      await this.client.hdel(key, accountId);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to remove presence for ${accountId} in ${topicId}: ${reason}`,
      );
      throw new WsRedisConnectionException(reason);
    }
  }

  /**
   * Get all online users in a conversation.
   */
  async getPresenceUsers(topicId: string): Promise<PresenceUserResponse[]> {
    const key = `${ChatRedisService.PREFIX_PRESENCE}${topicId}`;

    try {
      const allEntries = await this.client.hgetall(key);
      const users: PresenceUserResponse[] = [];

      for (const [accountId, value] of Object.entries(allEntries)) {
        const parsed = JSON.parse(value) as PresenceEntry;
        users.push({
          accountId,
          joinedAt: parsed.joinedAt,
        });
      }

      return users;
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to get presence users for ${topicId}: ${reason}`,
      );
      throw new WsRedisConnectionException(reason);
    }
  }

  /**
   * Get the list of online account IDs in a conversation.
   */
  async getOnlineAccountIds(topicId: string): Promise<string[]> {
    const key = `${ChatRedisService.PREFIX_PRESENCE}${topicId}`;

    try {
      return await this.client.hkeys(key);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to get online account IDs for ${topicId}: ${reason}`,
      );
      throw new WsRedisConnectionException(reason);
    }
  }

  /**
   * Remove all presence entries for a given socket ID across all topics.
   * Called on disconnect to clean up presence for all conversations.
   *
   * Returns the list of topicIds from which the user was removed.
   */
  async removePresenceBySocketId(
    socketId: string,
    accountId: string,
    trackedTopicIds: string[],
  ): Promise<string[]> {
    const removedFromTopics: string[] = [];

    for (const topicId of trackedTopicIds) {
      const key = `${ChatRedisService.PREFIX_PRESENCE}${topicId}`;

      try {
        const raw = await this.client.hget(key, accountId);
        if (raw) {
          const parsed = JSON.parse(raw) as PresenceEntry;
          if (parsed.socketId === socketId) {
            await this.client.hdel(key, accountId);
            removedFromTopics.push(topicId);
          }
        }
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to clean presence for socket ${socketId} in ${topicId}: ${reason}`,
        );
      }
    }

    return removedFromTopics;
  }

  // ---------------------------------------------------------------------------
  // Typing indicators
  // ---------------------------------------------------------------------------

  /**
   * Mark a user as typing in a conversation.
   * The key auto-expires after TYPING_TTL_SECONDS.
   */
  async setTyping(topicId: string, accountId: string): Promise<void> {
    const key = `${ChatRedisService.PREFIX_TYPING}${topicId}`;

    try {
      await this.client.hset(key, accountId, Date.now().toString());
      await this.client.expire(key, TYPING_TTL_SECONDS);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to set typing for ${accountId} in ${topicId}: ${reason}`,
      );
      throw new WsRedisConnectionException(reason);
    }
  }

  /**
   * Clear a user's typing state in a conversation.
   */
  async clearTyping(topicId: string, accountId: string): Promise<void> {
    const key = `${ChatRedisService.PREFIX_TYPING}${topicId}`;

    try {
      await this.client.hdel(key, accountId);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to clear typing for ${accountId} in ${topicId}: ${reason}`,
      );
      throw new WsRedisConnectionException(reason);
    }
  }

  /**
   * Get all account IDs currently typing in a conversation.
   */
  async getTypingUsers(topicId: string): Promise<string[]> {
    const key = `${ChatRedisService.PREFIX_TYPING}${topicId}`;

    try {
      return await this.client.hkeys(key);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get typing users for ${topicId}: ${reason}`);
      throw new WsRedisConnectionException(reason);
    }
  }

  // ---------------------------------------------------------------------------
  // Read receipts
  // ---------------------------------------------------------------------------

  /**
   * Store a read receipt for a user in a conversation.
   * Value format: "{lastReadSequence}:{timestamp}"
   */
  async setReadReceipt(
    topicId: string,
    accountId: string,
    lastReadSequence: number,
  ): Promise<void> {
    const key = `${ChatRedisService.PREFIX_READ}${topicId}`;
    const value = `${lastReadSequence}:${Date.now()}`;

    try {
      await this.client.hset(key, accountId, value);
      await this.client.expire(key, READ_RECEIPT_TTL_SECONDS);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to set read receipt for ${accountId} in ${topicId}: ${reason}`,
      );
      throw new WsRedisConnectionException(reason);
    }
  }

  /**
   * Get a single read receipt for a user in a conversation.
   */
  async getReadReceipt(
    topicId: string,
    accountId: string,
  ): Promise<ReadReceiptEntry | null> {
    const key = `${ChatRedisService.PREFIX_READ}${topicId}`;

    try {
      const value = await this.client.hget(key, accountId);
      if (!value) return null;

      return this.parseReadReceiptValue(topicId, accountId, value);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to get read receipt for ${accountId} in ${topicId}: ${reason}`,
      );
      throw new WsRedisConnectionException(reason);
    }
  }

  /**
   * Get all read receipts for a conversation.
   */
  async getAllReadReceipts(topicId: string): Promise<ReadReceiptEntry[]> {
    const key = `${ChatRedisService.PREFIX_READ}${topicId}`;

    try {
      const allEntries = await this.client.hgetall(key);
      const receipts: ReadReceiptEntry[] = [];

      for (const [accountId, value] of Object.entries(allEntries)) {
        const receipt = this.parseReadReceiptValue(topicId, accountId, value);
        if (receipt) {
          receipts.push(receipt);
        }
      }

      return receipts;
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to get all read receipts for ${topicId}: ${reason}`,
      );
      throw new WsRedisConnectionException(reason);
    }
  }

  // ---------------------------------------------------------------------------
  // Pub/Sub clients for Socket.io Redis adapter
  // ---------------------------------------------------------------------------

  /**
   * Create a dedicated Redis client for Socket.io adapter (pub or sub).
   * The adapter requires two separate ioredis instances.
   */
  createAdapterClient(): Redis {
    const host = this.configService.get<string>("redis.host", "localhost");
    const port = this.configService.get<number>("redis.port", 6379);
    const password = this.configService.get<string>("redis.password");

    return new Redis({
      host,
      port,
      ...(password ? { password } : {}),
      retryStrategy: (times: number): number | null => {
        if (times > 5) {
          this.logger.error(
            `ChatRedis adapter client failed after ${times} attempts`,
          );
          return null;
        }
        return Math.min(times * 200, 2000);
      },
      maxRetriesPerRequest: 3,
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Parse a read receipt value string "{sequence}:{timestamp}" into a ReadReceiptEntry.
   */
  private parseReadReceiptValue(
    topicId: string,
    accountId: string,
    value: string,
  ): ReadReceiptEntry | null {
    const colonIndex = value.indexOf(":");
    if (colonIndex === -1) return null;

    const sequenceStr = value.substring(0, colonIndex);
    const timestampStr = value.substring(colonIndex + 1);

    const lastReadSequence = parseInt(sequenceStr, 10);
    const timestamp = parseInt(timestampStr, 10);

    if (Number.isNaN(lastReadSequence) || Number.isNaN(timestamp)) {
      return null;
    }

    return { accountId, topicId, lastReadSequence, timestamp };
  }
}
