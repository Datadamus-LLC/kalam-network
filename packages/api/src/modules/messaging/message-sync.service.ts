import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { ConversationEntity } from "../../database/entities/conversation.entity";
import { MessagingService } from "./messaging.service";

/**
 * MessageSyncService polls the Hedera Mirror Node every 30 seconds
 * for new messages across all active conversations and keeps the
 * PostgreSQL cache in sync.
 *
 * When new messages are detected, it emits a 'messages.synced' event
 * that can be consumed by the future WebSocket gateway (P0-T16) to
 * push real-time updates to connected clients.
 */
@Injectable()
export class MessageSyncService {
  private readonly logger = new Logger(MessageSyncService.name);

  /**
   * In-memory cache of the last synced sequence number per topic.
   * Avoids querying the DB on every sync cycle.
   */
  private readonly lastSyncedSequences = new Map<string, number>();

  constructor(
    @InjectRepository(ConversationEntity)
    private readonly conversationRepository: Repository<ConversationEntity>,
    private readonly messagingService: MessagingService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ---------------------------------------------------------------------------
  // Scheduled sync job
  // ---------------------------------------------------------------------------

  /**
   * Runs every 30 seconds. Iterates over all active (non-deleted)
   * conversations and syncs new messages from the Mirror Node.
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async syncAllConversations(): Promise<void> {
    this.logger.debug("Starting Mirror Node sync job");

    try {
      const conversations = await this.conversationRepository.find({
        where: { deletedAt: IsNull() },
      });

      for (const conversation of conversations) {
        await this.syncConversation(conversation.hcsTopicId);
      }
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Sync job failed: ${reason}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Single conversation sync
  // ---------------------------------------------------------------------------

  /**
   * Sync a single conversation's messages from the Mirror Node.
   *
   * Uses the in-memory lastSyncedSequences map to avoid redundant
   * queries. On first sync for a topic, falls back to the DB.
   */
  private async syncConversation(topicId: string): Promise<void> {
    try {
      let lastSequence = this.lastSyncedSequences.get(topicId);

      // If we don't have a cached value, look it up from DB
      if (lastSequence === undefined) {
        lastSequence =
          await this.messagingService.getLastSyncedSequence(topicId);
        this.lastSyncedSequences.set(topicId, lastSequence);
      }

      const newLastSequence = await this.messagingService.syncFromMirrorNode(
        topicId,
        lastSequence,
      );

      if (newLastSequence > lastSequence) {
        this.lastSyncedSequences.set(topicId, newLastSequence);

        // Emit event for future WebSocket distribution (P0-T16)
        this.eventEmitter.emit("messages.synced", {
          topicId,
          previousSequence: lastSequence,
          lastSequence: newLastSequence,
        });

        this.logger.debug(
          `Topic ${topicId}: synced up to sequence ${newLastSequence}`,
        );
      }
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to sync topic ${topicId}: ${reason}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Manual trigger (for testing / debugging)
  // ---------------------------------------------------------------------------

  /**
   * Manually trigger a sync for a specific conversation.
   * Useful for testing or on-demand refresh.
   */
  async manualSync(topicId: string): Promise<void> {
    await this.syncConversation(topicId);
  }
}
