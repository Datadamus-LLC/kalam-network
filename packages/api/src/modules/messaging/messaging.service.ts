import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import * as crypto from "crypto";
import { ConversationEntity } from "../../database/entities/conversation.entity";
import { ConversationMemberEntity } from "../../database/entities/conversation-member.entity";
import { MessageIndexEntity } from "../../database/entities/message-index.entity";
import { UserEntity } from "../../database/entities/user.entity";
import { HederaService } from "../hedera/hedera.service";
import { MirrorNodeService } from "../hedera/mirror-node.service";
import { MESSAGE_CONSTANTS } from "./constants/message.constants";
import {
  ConversationTopicNotFoundException,
  NotConversationParticipantException,
  EncryptionKeyNotFoundException,
  MessageEncryptionException,
  MessageSyncException,
  MediaUploadNotImplementedException,
} from "./exceptions/message.exceptions";
import type {
  PaginatedMessagesResponse,
  MessageResponse,
} from "./dto/message-response.dto";
import { toMessageResponse } from "./dto/message-response.dto";
import { NotificationsService } from "../notifications/notifications.service";

/**
 * Shape of a decrypted message payload (before encryption / after decryption).
 * The server only creates this payload during sendMessage; actual decryption
 * happens client-side (E2E encryption).
 */
interface MessagePayload {
  v: string;
  type: "message" | "system" | "key_exchange" | "group_meta";
  sender: string;
  ts: number;
  content: {
    type: "text" | "image" | "file" | "voice";
    text?: string;
    mediaRef?: string;
  };
  replyTo: number | null;
  nonce: string;
}

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    @InjectRepository(ConversationEntity)
    private readonly conversationRepository: Repository<ConversationEntity>,
    @InjectRepository(ConversationMemberEntity)
    private readonly memberRepository: Repository<ConversationMemberEntity>,
    @InjectRepository(MessageIndexEntity)
    private readonly messageRepository: Repository<MessageIndexEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly hederaService: HederaService,
    private readonly mirrorNodeService: MirrorNodeService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Send Message
  // ---------------------------------------------------------------------------

  /**
   * Send a message to a conversation.
   *
   * Flow:
   * 1. Validate sender is conversation participant
   * 2. Look up conversation's encrypted keys JSON
   * 3. Create message payload with nonce
   * 4. Encrypt with AES-256-GCM (server-side for hackathon prototype)
   * 5. Submit encrypted payload to HCS topic via HederaService
   * 6. Store in PostgreSQL message index
   * 7. Return message record
   *
   * Architecture note: In production, encryption would happen client-side.
   * For the hackathon, the server acts as a trusted encryption facilitator.
   */
  async sendMessage(
    senderAccountId: string,
    topicId: string,
    text: string,
    replyToSequence?: number,
    encryptedContent?: string,
  ): Promise<MessageResponse> {
    this.logger.debug(
      `Sending message to topic ${topicId} from ${senderAccountId}`,
    );

    // Step 1: Get conversation by topic ID
    const conversation = await this.conversationRepository.findOne({
      where: { hcsTopicId: topicId },
    });

    if (!conversation) {
      throw new ConversationTopicNotFoundException(topicId);
    }

    // Step 2: Validate sender is a participant
    const member = await this.memberRepository.findOne({
      where: {
        conversationId: conversation.id,
        hederaAccountId: senderAccountId,
      },
    });

    if (!member || member.leftAt !== null) {
      throw new NotConversationParticipantException(senderAccountId, topicId);
    }

    // Step 3: Verify the sender has an encryption key in the conversation
    if (!conversation.encryptedKeysJson) {
      throw new EncryptionKeyNotFoundException(senderAccountId, topicId);
    }

    const encryptedKeys: Record<string, string> = JSON.parse(
      conversation.encryptedKeysJson,
    ) as Record<string, string>;

    if (!encryptedKeys[senderAccountId]) {
      throw new EncryptionKeyNotFoundException(senderAccountId, topicId);
    }

    // Step 4: Create message payload
    const nonce = crypto
      .randomBytes(MESSAGE_CONSTANTS.PAYLOAD_NONCE_LENGTH)
      .toString("base64");

    const messagePayload: MessagePayload = {
      v: "1.0",
      type: "message",
      sender: senderAccountId,
      ts: Date.now(),
      content: {
        type: "text",
        text,
      },
      replyTo: replyToSequence ?? null,
      nonce,
    };

    // Step 5: Encrypt the payload with AES-256-GCM using a derived key
    // For the hackathon prototype, we derive a deterministic encryption key
    // from the conversation's currentKeyId. In production, the client would
    // handle encryption using the actual symmetric key.
    let encryptedPayload: Buffer;
    try {
      encryptedPayload = this.encryptPayload(
        JSON.stringify(messagePayload),
        conversation.currentKeyId ?? conversation.id,
      );
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Encryption failed for topic ${topicId}: ${reason}`);
      throw new MessageEncryptionException(reason);
    }

    // Step 6: Store in PostgreSQL immediately (non-blocking message send)
    // HCS submission for consensus/audit happens asynchronously in background
    const messageId = uuidv4();
    const messageEntity = this.messageRepository.create({
      id: messageId,
      hcsTopicId: topicId,
      sequenceNumber: 0, // Placeholder; updated after async HCS submission
      consensusTimestamp: new Date(),
      senderAccountId,
      messageType: "message",
      // Store client-side encrypted content — server NEVER stores plaintext
      encryptedPreview: encryptedContent ? Buffer.from(encryptedContent, "utf8") : null,
      plaintextContent: null,
      hasMedia: false,
    });

    await this.messageRepository.save(messageEntity);

    // Step 7: Submit to HCS in background (fire-and-forget)
    this.hederaService
      .submitMessage(topicId, encryptedPayload)
      .then((seqStr) => {
        const seq = parseInt(seqStr, 10);
        void this.messageRepository.update(
          { id: messageId },
          { sequenceNumber: seq },
        );
        this.logger.log(
          `HCS message confirmed for topic ${topicId}: seq=${seq}`,
        );
      })
      .catch((err: unknown) => {
        const reason = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Background HCS message submission failed for topic ${topicId}: ${reason}`,
        );
      });

    // Update conversation's lastMessageAt (sequence updated async after HCS confirms)
    conversation.lastMessageAt = new Date();
    await this.conversationRepository.save(conversation);

    this.logger.log(
      `Message sent: ${messageId} to topic ${topicId} (HCS submission async)`,
    );

    // Notify all other participants of the new message (non-blocking)
    const senderUser = await this.userRepository.findOne({
      where: { hederaAccountId: senderAccountId },
    }).catch(() => null);
    const senderName = senderUser?.displayName ?? senderAccountId;
    const allMembers = await this.memberRepository.find({
      where: { conversationId: conversation.id },
    }).catch(() => []);
    for (const member of allMembers) {
      if (member.hederaAccountId !== senderAccountId && member.leftAt === null) {
        this.notificationsService.notifyNewMessage(
          member.hederaAccountId,
          senderAccountId,
          topicId,
          null, // Never expose plaintext in notifications — E2E encrypted
          senderName,
        ).catch(() => { /* non-critical */ });
      }
    }

    return toMessageResponse(messageEntity);
  }

  // ---------------------------------------------------------------------------
  // Get Messages (paginated)
  // ---------------------------------------------------------------------------

  /**
   * Get paginated messages for a conversation, retrieved from the local
   * PostgreSQL cache.
   *
   * Messages are ordered by sequence number descending (newest first)
   * and returned in chronological order after slicing.
   *
   * Cursor-based pagination: pass the sequence number of the last message
   * from the previous page as `cursor` to get older messages.
   */
  async getMessages(
    topicId: string,
    limit: number = MESSAGE_CONSTANTS.DEFAULT_PAGE_SIZE,
    cursor?: string,
  ): Promise<PaginatedMessagesResponse> {
    // Validate conversation exists
    const conversation = await this.conversationRepository.findOne({
      where: { hcsTopicId: topicId },
    });

    if (!conversation) {
      throw new ConversationTopicNotFoundException(topicId);
    }

    const effectiveLimit = Math.min(
      Math.max(limit, 1),
      MESSAGE_CONSTANTS.MAX_PAGE_SIZE,
    );

    let query = this.messageRepository
      .createQueryBuilder("msg")
      .where("msg.hcsTopicId = :topicId", { topicId })
      .orderBy("msg.sequenceNumber", "DESC");

    // Cursor-based pagination: get messages with sequence < cursor
    if (cursor) {
      const cursorSeq = parseInt(cursor, 10);
      if (!Number.isNaN(cursorSeq) && cursorSeq > 0) {
        query = query.andWhere("msg.sequenceNumber < :cursor", {
          cursor: cursorSeq,
        });
      }
    }

    // Fetch one extra to detect if more pages exist
    query = query.take(effectiveLimit + 1);

    const results = await query.getMany();

    const hasMore = results.length > effectiveLimit;
    const pageMessages = results.slice(0, effectiveLimit);

    // Reverse to chronological order (oldest first) — spread to avoid mutating pageMessages
    const chronological = [...pageMessages].reverse();

    // Next cursor is the lowest sequence number on this page
    const nextCursor =
      pageMessages.length > 0
        ? pageMessages[pageMessages.length - 1].sequenceNumber.toString()
        : null;

    return {
      messages: chronological.map(toMessageResponse),
      cursor: nextCursor,
      hasMore,
    };
  }

  // ---------------------------------------------------------------------------
  // Sync from Mirror Node
  // ---------------------------------------------------------------------------

  /**
   * Synchronize messages from Hedera Mirror Node for a given topic.
   *
   * Fetches new messages (after `afterSequence`) from the Mirror Node REST API
   * and stores them in the PostgreSQL cache.
   *
   * Called periodically by MessageSyncService and can also be triggered manually.
   *
   * @returns The highest sequence number found during this sync
   */
  async syncFromMirrorNode(
    topicId: string,
    afterSequence: number = 0,
  ): Promise<number> {
    this.logger.debug(
      `Syncing messages for topic ${topicId} after sequence ${afterSequence}`,
    );

    // Validate conversation exists
    const conversation = await this.conversationRepository.findOne({
      where: { hcsTopicId: topicId },
    });

    if (!conversation) {
      throw new ConversationTopicNotFoundException(topicId);
    }

    try {
      const mirrorMessages = await this.mirrorNodeService.getTopicMessages(
        topicId,
        {
          limit: MESSAGE_CONSTANTS.MIRROR_NODE_BATCH_SIZE,
          sequenceNumberGt: afterSequence > 0 ? afterSequence : undefined,
        },
      );

      let maxSequence = afterSequence;
      let newCount = 0;

      for (const hcsMsg of mirrorMessages) {
        const seq = hcsMsg.sequence_number;
        maxSequence = Math.max(maxSequence, seq);

        // Check if already in DB (upsert protection)
        const exists = await this.messageRepository.findOne({
          where: {
            hcsTopicId: topicId,
            sequenceNumber: seq,
          },
        });

        if (!exists) {
          // Extract actual sender from message payload (HCS uses operator as payer,
          // but the message JSON contains the real sender accountId)
          let actualSenderAccountId = hcsMsg.payer_account_id;
          if (hcsMsg.message) {
            try {
              const rawBytes = Buffer.from(hcsMsg.message, "base64").toString("utf8");
              const parsedPayload = JSON.parse(rawBytes) as Record<string, unknown>;
              if (typeof parsedPayload.sender === "string") {
                actualSenderAccountId = parsedPayload.sender;
              }
            } catch { /* not decodable — use payer */ }
          }

          // Check if there's a pending record with sequenceNumber=0 from the actual sender
          const pending = await this.messageRepository.findOne({
            where: {
              hcsTopicId: topicId,
              sequenceNumber: 0,
              senderAccountId: actualSenderAccountId,
            },
          });

          if (pending) {
            // Update the pending record with the real sequence number and timestamp
            await this.messageRepository.update(pending.id, {
              sequenceNumber: seq,
              consensusTimestamp: new Date(
                parseFloat(hcsMsg.consensus_timestamp) * 1000,
              ),
            });
          } else {
            // Try to detect the message type by decoding the HCS message bytes
            const KNOWN_TYPES = new Set(["message", "payment", "payment_request", "payment_split", "system"]);
            let detectedType: "message" | "payment" | "payment_request" | "payment_split" | "system" = "message";
            if (hcsMsg.message) {
              try {
                const raw = Buffer.from(hcsMsg.message, "base64").toString("utf8");
                const parsed: unknown = JSON.parse(raw);
                if (
                  parsed &&
                  typeof parsed === "object" &&
                  "type" in parsed &&
                  typeof (parsed as Record<string, unknown>).type === "string"
                ) {
                  const t = (parsed as Record<string, unknown>).type as string;
                  if (KNOWN_TYPES.has(t)) {
                    detectedType = t as typeof detectedType;
                  } else {
                    // Unknown system type — treat as system to hide from chat
                    detectedType = "system";
                  }
                }
              } catch {
                // Not valid JSON — it's an encrypted user message
                detectedType = "message";
              }
            }

            const messageId = uuidv4();
            const entity = this.messageRepository.create({
              id: messageId,
              hcsTopicId: topicId,
              sequenceNumber: seq,
              consensusTimestamp: new Date(
                parseFloat(hcsMsg.consensus_timestamp) * 1000,
              ),
              senderAccountId: actualSenderAccountId,
              messageType: detectedType,
              encryptedPreview: null,
              hasMedia: false,
            });

            await this.messageRepository.save(entity);
          }
          newCount++;
        }
      }

      if (newCount > 0) {
        this.logger.log(
          `Synced ${newCount} new messages for topic ${topicId} (max seq: ${maxSequence})`,
        );

        // Update conversation's lastMessageSeq if we found newer messages
        if (maxSequence > conversation.lastMessageSeq) {
          conversation.lastMessageSeq = maxSequence;
          conversation.lastMessageAt = new Date();
          await this.conversationRepository.save(conversation);
        }
      }

      return maxSequence;
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Mirror Node sync failed for topic ${topicId}: ${reason}`,
      );
      throw new MessageSyncException(topicId, reason);
    }
  }

  // ---------------------------------------------------------------------------
  // Get Last Synced Sequence
  // ---------------------------------------------------------------------------

  /**
   * Get the last synced sequence number for a topic.
   * Used by MessageSyncService to know where to resume polling.
   */
  async getLastSyncedSequence(topicId: string): Promise<number> {
    const lastMessage = await this.messageRepository.findOne({
      where: { hcsTopicId: topicId },
      order: { sequenceNumber: "DESC" },
    });

    return lastMessage ? lastMessage.sequenceNumber : 0;
  }

  // ---------------------------------------------------------------------------
  // Media Upload — Not Yet Implemented
  // ---------------------------------------------------------------------------

  /**
   * Upload encrypted media to IPFS via Pinata.
   *
   * Encrypted media upload requires additional client-side encryption flow
   * that is not yet built. Text messages are fully supported.
   */
  uploadEncryptedMedia(): never {
    throw new MediaUploadNotImplementedException();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Encrypt a plaintext string using AES-256-GCM.
   *
   * Returns a Buffer containing: IV (12 bytes) + ciphertext + authTag (16 bytes).
   *
   * For the hackathon prototype, we derive a key from the conversation's keyId.
   * In production, encryption would happen client-side with the real symmetric key.
   */
  private encryptPayload(plaintext: string, keySource: string): Buffer {
    // Derive a 32-byte key from the keySource using SHA-256
    const keyBuffer = crypto.createHash("sha256").update(keySource).digest();

    const iv = crypto.randomBytes(MESSAGE_CONSTANTS.AES_IV_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-gcm", keyBuffer, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Wire format: IV (12) + ciphertext + authTag (16)
    return Buffer.concat([iv, encrypted, authTag]);
  }
}
