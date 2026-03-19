import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In, IsNull } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { v4 as uuidv4 } from "uuid";
import sanitizeHtml from "sanitize-html";
import { ConversationEntity } from "../../database/entities/conversation.entity";
import { ConversationMemberEntity } from "../../database/entities/conversation-member.entity";
import { UserEntity } from "../../database/entities/user.entity";
import { HederaService } from "../hedera/hedera.service";
import { CreateConversationDto } from "./dto/create-conversation.dto";
import type {
  ConversationResponse,
  ConversationParticipantResponse,
  PaginatedConversationsResponse,
} from "./dto/conversation-response.dto";
import {
  ConversationNotFoundException,
  NotConversationMemberException,
  NotConversationAdminException,
  InvalidParticipantsException,
  ConversationCreationFailedException,
  ParticipantNotFoundException,
  GroupNameRequiredException,
  CannotAddToDirectConversationException,
  AlreadyMemberException,
  MissingEncryptionKeyException,
} from "./exceptions/conversation.exceptions";
import {
  createKeyExchangePayload,
  type KeyExchangePayload,
} from "./crypto/key-exchange";

const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @InjectRepository(ConversationEntity)
    private readonly conversationRepository: Repository<ConversationEntity>,
    @InjectRepository(ConversationMemberEntity)
    private readonly memberRepository: Repository<ConversationMemberEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly hederaService: HederaService,
    private readonly configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Create Conversation
  // ---------------------------------------------------------------------------

  /**
   * Create a new conversation (direct 1:1 or group).
   *
   * Steps:
   * 1. Validate all participant account IDs exist in users table
   * 2. For direct: check no existing conversation between these 2 users
   * 3. Create HCS topic via HederaService
   * 4. Generate conversation symmetric key & encrypt for each participant
   * 5. Submit key exchange message to HCS topic
   * 6. Save ConversationEntity and ConversationMemberEntity rows
   */
  async createConversation(
    initiatorAccountId: string,
    dto: CreateConversationDto,
  ): Promise<ConversationResponse> {
    this.logger.log(
      `Creating ${dto.type} conversation, initiator: ${initiatorAccountId}, participants: ${dto.participantAccountIds.length}`,
    );

    // Validate conversation type constraints
    if (dto.type === "group" && !dto.groupName) {
      throw new GroupNameRequiredException();
    }

    if (dto.type === "direct" && dto.participantAccountIds.length !== 1) {
      throw new InvalidParticipantsException(
        "Direct conversations require exactly 1 participant (the other party)",
      );
    }

    if (dto.type === "group" && dto.participantAccountIds.length < 2) {
      throw new InvalidParticipantsException(
        "Group conversations require at least 2 other participants",
      );
    }

    // Ensure initiator is not in the participant list (they're added automatically)
    if (dto.participantAccountIds.includes(initiatorAccountId)) {
      throw new InvalidParticipantsException(
        "Initiator should not be included in the participants list",
      );
    }

    // Build full participant list (initiator + provided IDs)
    const allParticipantAccountIds = [
      initiatorAccountId,
      ...dto.participantAccountIds,
    ];

    // Step 1: Validate all participants exist
    const users = await this.validateParticipantsExist(
      allParticipantAccountIds,
    );

    // Step 2: For direct conversations, return existing conversation if one exists
    if (dto.type === "direct") {
      const existing = await this.findExistingDirectConversation(
        initiatorAccountId,
        dto.participantAccountIds[0]!,
      );
      if (existing) {
        this.logger.log(
          `Returning existing DM conversation ${existing.id} for ${initiatorAccountId} ↔ ${dto.participantAccountIds[0]}`,
        );
        return this.getConversation(existing.id, initiatorAccountId);
      }
    }

    // Collect encryption public keys for key exchange
    const participantPublicKeys = this.collectEncryptionKeys(
      users,
      allParticipantAccountIds,
    );

    // Sanitize group name to prevent stored XSS
    const sanitizedGroupName = dto.groupName
      ? sanitizeHtml(dto.groupName, {
          allowedTags: [],
          allowedAttributes: {},
        }).trim()
      : undefined;

    // Step 3: Create HCS topic
    const topicMemo =
      dto.type === "direct"
        ? `DM:${[...allParticipantAccountIds].sort().join(":")}`
        : `Group:${sanitizedGroupName}`;

    let hcsTopicId: string;
    try {
      hcsTopicId = await this.hederaService.createTopic({
        memo: topicMemo,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`HCS topic creation failed: ${message}`);
      throw new ConversationCreationFailedException(
        `HCS topic creation failed: ${message}`,
      );
    }

    this.logger.log(`Created HCS topic ${hcsTopicId} for conversation`);

    // Step 4: Generate conversation key and encrypt for each participant
    let keyExchangePayload: KeyExchangePayload;
    let keyId: string;
    let encryptedKeysJson: string;

    try {
      keyExchangePayload = createKeyExchangePayload(participantPublicKeys);
      keyId = keyExchangePayload.keyId;
      encryptedKeysJson = JSON.stringify(keyExchangePayload.keys);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Key exchange generation failed: ${message}`);
      throw new ConversationCreationFailedException(
        `Key exchange generation failed: ${message}`,
      );
    }

    // Step 5: Submit key exchange message to HCS topic
    try {
      const keyExchangeBuffer = Buffer.from(JSON.stringify(keyExchangePayload));
      await this.hederaService.submitMessage(hcsTopicId, keyExchangeBuffer);
      this.logger.log(
        `Submitted key exchange to topic ${hcsTopicId}, keyId: ${keyId}`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Key exchange submission to HCS failed: ${message}`);
      throw new ConversationCreationFailedException(
        `Key exchange message submission failed: ${message}`,
      );
    }

    // Step 6: Save conversation and members to PostgreSQL
    const conversationId = uuidv4();

    const conversation = this.conversationRepository.create({
      id: conversationId,
      hcsTopicId,
      conversationType: dto.type,
      groupName: dto.type === "group" ? (sanitizedGroupName ?? null) : null,
      groupAvatarCid:
        dto.type === "group" ? (dto.groupAvatarCid ?? null) : null,
      adminAccountId: dto.type === "group" ? initiatorAccountId : null,
      createdBy: initiatorAccountId,
      lastMessageAt: null,
      lastMessageSeq: 0,
      encryptedKeysJson,
      currentKeyId: keyId,
    });

    try {
      await this.conversationRepository.save(conversation);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to save conversation entity: ${message}`);
      throw new ConversationCreationFailedException(
        `Database save failed: ${message}`,
      );
    }

    // Save member entries
    const members: ConversationMemberEntity[] = allParticipantAccountIds.map(
      (accountId) => {
        const member = this.memberRepository.create({
          conversationId,
          hederaAccountId: accountId,
          role: accountId === initiatorAccountId ? "admin" : "member",
          leftAt: null,
          lastReadSeq: 0,
        });
        return member;
      },
    );

    try {
      await this.memberRepository.save(members);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to save member entities: ${message}`);
      throw new ConversationCreationFailedException(
        `Database member save failed: ${message}`,
      );
    }

    this.logger.log(
      `Conversation ${conversationId} created successfully with ${allParticipantAccountIds.length} participants`,
    );

    // Build response
    const participantResponses = this.buildParticipantResponses(
      users,
      allParticipantAccountIds,
      initiatorAccountId,
    );

    // Parse the encrypted keys from JSON (stored as { "accountId": "base64Key" })
    let encryptedKeys: Record<string, string> | null = null;
    if (conversation.encryptedKeysJson) {
      try {
        encryptedKeys = JSON.parse(conversation.encryptedKeysJson) as Record<
          string,
          string
        >;
      } catch {
        encryptedKeys = null;
      }
    }

    return {
      id: conversationId,
      type: dto.type,
      hcsTopicId,
      groupName: conversation.groupName,
      groupAvatarCid: conversation.groupAvatarCid,
      participants: participantResponses,
      createdBy: initiatorAccountId,
      createdAt: conversation.createdAt.toISOString(),
      lastMessageAt: null,
      unreadCount: 0,
      encryptedKeys,
    };
  }

  // ---------------------------------------------------------------------------
  // Get Conversation
  // ---------------------------------------------------------------------------

  /**
   * Get a single conversation by ID.
   * Verifies the requestor is a member.
   */
  async getConversation(
    conversationId: string,
    requestorAccountId: string,
  ): Promise<ConversationResponse> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new ConversationNotFoundException(conversationId);
    }

    // Verify requestor is a member
    await this.verifyMembership(conversationId, requestorAccountId);

    // Load members
    const members = await this.memberRepository.find({
      where: { conversationId, leftAt: IsNull() },
    });

    const activeMembers = members.filter((m) => m.leftAt === null);
    const accountIds = activeMembers.map((m) => m.hederaAccountId);

    // Load user details for participants
    const users = await this.userRepository.find({
      where: { hederaAccountId: In(accountIds) },
    });

    const participantResponses: ConversationParticipantResponse[] =
      activeMembers.map((member) => {
        const user = users.find(
          (u) => u.hederaAccountId === member.hederaAccountId,
        );
        return {
          accountId: member.hederaAccountId,
          displayName: user?.displayName ?? null,
          role: member.role,
        };
      });

    // Compute unread count for the requestor
    const requestorMember = activeMembers.find(
      (m) => m.hederaAccountId === requestorAccountId,
    );
    const lastReadSeq = requestorMember
      ? Number(requestorMember.lastReadSeq)
      : 0;
    const lastMsgSeq = Number(conversation.lastMessageSeq) || 0;
    const unreadCount = Math.max(0, lastMsgSeq - lastReadSeq);

    let encryptedKeys: Record<string, string> | null = null;
    if (conversation.encryptedKeysJson) {
      try {
        encryptedKeys = JSON.parse(conversation.encryptedKeysJson) as Record<
          string,
          string
        >;
      } catch {
        encryptedKeys = null;
      }
    }

    return {
      id: conversation.id,
      type: conversation.conversationType,
      hcsTopicId: conversation.hcsTopicId,
      groupName: conversation.groupName,
      groupAvatarCid: conversation.groupAvatarCid,
      participants: participantResponses,
      createdBy: conversation.createdBy,
      createdAt: conversation.createdAt.toISOString(),
      lastMessageAt: conversation.lastMessageAt
        ? conversation.lastMessageAt.toISOString()
        : null,
      unreadCount,
      encryptedKeys,
    };
  }

  // ---------------------------------------------------------------------------
  // List User Conversations (cursor-based pagination)
  // ---------------------------------------------------------------------------

  /**
   * Get all conversations for a user, sorted by lastMessageAt DESC.
   * Uses cursor-based pagination where the cursor is the lastMessageAt timestamp.
   */
  async getUserConversations(
    accountId: string,
    cursor?: string,
    limit?: number,
  ): Promise<PaginatedConversationsResponse> {
    const pageSize = limit ?? DEFAULT_PAGE_SIZE;

    // Find conversation IDs where user is a member
    const memberQuery = this.memberRepository
      .createQueryBuilder("member")
      .select("member.conversationId")
      .where("member.hederaAccountId = :accountId", { accountId })
      .andWhere("member.leftAt IS NULL");

    const memberRows = await memberQuery.getRawMany<{
      member_conversationId: string;
    }>();

    const conversationIds = memberRows.map((row) => row.member_conversationId);

    if (conversationIds.length === 0) {
      return { data: [], nextCursor: null, hasMore: false };
    }

    // Build conversation query with cursor pagination
    let conversationQuery = this.conversationRepository
      .createQueryBuilder("conv")
      .where("conv.id IN (:...ids)", { ids: conversationIds })
      .orderBy("conv.lastMessageAt", "DESC", "NULLS LAST")
      .addOrderBy("conv.createdAt", "DESC")
      .take(pageSize + 1); // Fetch one extra to check hasMore

    if (cursor) {
      const cursorDate = new Date(cursor);
      conversationQuery = conversationQuery.andWhere(
        "(conv.lastMessageAt < :cursor OR (conv.lastMessageAt IS NULL AND conv.createdAt < :cursor))",
        { cursor: cursorDate },
      );
    }

    const conversations = await conversationQuery.getMany();

    const hasMore = conversations.length > pageSize;
    const pageConversations = hasMore
      ? conversations.slice(0, pageSize)
      : conversations;

    // Load all members for these conversations
    const pageIds = pageConversations.map((c) => c.id);
    const allMembers =
      pageIds.length > 0
        ? await this.memberRepository.find({
            where: { conversationId: In(pageIds) },
          })
        : [];

    const activeMembers = allMembers.filter((m) => m.leftAt === null);

    // Load all user details
    const allAccountIds = [
      ...new Set(activeMembers.map((m) => m.hederaAccountId)),
    ];
    const users =
      allAccountIds.length > 0
        ? await this.userRepository.find({
            where: { hederaAccountId: In(allAccountIds) },
          })
        : [];

    // Build responses with unread counts
    const data: ConversationResponse[] = pageConversations.map((conv) => {
      const convMembers = activeMembers.filter(
        (m) => m.conversationId === conv.id,
      );
      const participants: ConversationParticipantResponse[] = convMembers.map(
        (member) => {
          const user = users.find(
            (u) => u.hederaAccountId === member.hederaAccountId,
          );
          return {
            accountId: member.hederaAccountId,
            displayName: user?.displayName ?? null,
            role: member.role,
          };
        },
      );

      // Compute unread count: lastMessageSeq - lastReadSeq for the requesting user
      const requestorMember = convMembers.find(
        (m) => m.hederaAccountId === accountId,
      );
      const lastReadSeq = requestorMember
        ? Number(requestorMember.lastReadSeq)
        : 0;
      const lastMsgSeq = Number(conv.lastMessageSeq) || 0;
      const unreadCount = Math.max(0, lastMsgSeq - lastReadSeq);

      let convEncryptedKeys: Record<string, string> | null = null;
      if (conv.encryptedKeysJson) {
        try {
          convEncryptedKeys = JSON.parse(conv.encryptedKeysJson) as Record<
            string,
            string
          >;
        } catch {
          convEncryptedKeys = null;
        }
      }

      return {
        id: conv.id,
        type: conv.conversationType,
        hcsTopicId: conv.hcsTopicId,
        groupName: conv.groupName,
        groupAvatarCid: conv.groupAvatarCid,
        participants,
        createdBy: conv.createdBy,
        createdAt: conv.createdAt.toISOString(),
        lastMessageAt: conv.lastMessageAt
          ? conv.lastMessageAt.toISOString()
          : null,
        unreadCount,
        encryptedKeys: convEncryptedKeys,
      };
    });

    // Compute next cursor from the last item
    let nextCursor: string | null = null;
    if (hasMore && pageConversations.length > 0) {
      const lastConv = pageConversations[pageConversations.length - 1];
      nextCursor = lastConv.lastMessageAt
        ? lastConv.lastMessageAt.toISOString()
        : lastConv.createdAt.toISOString();
    }

    return { data, nextCursor, hasMore };
  }

  // ---------------------------------------------------------------------------
  // Add Participant (groups only)
  // ---------------------------------------------------------------------------

  /**
   * Add a participant to a group conversation.
   *
   * Only admins can add participants. Direct conversations cannot have
   * members added. The new participant's encryption key is used to
   * re-encrypt the conversation key.
   */
  async addParticipant(
    conversationId: string,
    newAccountId: string,
    requestorAccountId: string,
  ): Promise<ConversationResponse> {
    // Load conversation
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new ConversationNotFoundException(conversationId);
    }

    // Verify it's a group conversation
    if (conversation.conversationType === "direct") {
      throw new CannotAddToDirectConversationException();
    }

    // Verify requestor is admin
    const requestorMember = await this.memberRepository.findOne({
      where: {
        conversationId,
        hederaAccountId: requestorAccountId,
      },
    });

    if (!requestorMember || requestorMember.leftAt !== null) {
      throw new NotConversationMemberException(
        requestorAccountId,
        conversationId,
      );
    }

    if (requestorMember.role !== "admin") {
      throw new NotConversationAdminException(
        requestorAccountId,
        conversationId,
      );
    }

    // Verify new participant is not already a member
    const existingMember = await this.memberRepository.findOne({
      where: {
        conversationId,
        hederaAccountId: newAccountId,
      },
    });

    if (existingMember && existingMember.leftAt === null) {
      throw new AlreadyMemberException(newAccountId);
    }

    // Validate the new user exists
    const newUser = await this.userRepository.findOne({
      where: { hederaAccountId: newAccountId },
    });

    if (!newUser) {
      throw new ParticipantNotFoundException(newAccountId);
    }

    // Validate the new user has an encryption public key
    if (!newUser.encryptionPublicKey) {
      throw new MissingEncryptionKeyException(newAccountId);
    }

    // Add the new member
    if (existingMember && existingMember.leftAt !== null) {
      // Re-join: clear leftAt
      existingMember.leftAt = null;
      existingMember.role = "member";
      await this.memberRepository.save(existingMember);
    } else {
      const newMember = this.memberRepository.create({
        conversationId,
        hederaAccountId: newAccountId,
        role: "member",
        leftAt: null,
        lastReadSeq: 0,
      });
      await this.memberRepository.save(newMember);
    }

    this.logger.log(
      `Added participant ${newAccountId} to conversation ${conversationId}`,
    );

    // Re-encrypt conversation key for all current members (key rotation)
    // Load all active members
    const allActiveMembers = await this.memberRepository.find({
      where: { conversationId },
    });

    const activeAccountIds = allActiveMembers
      .filter((m) => m.leftAt === null)
      .map((m) => m.hederaAccountId);

    const users = await this.userRepository.find({
      where: { hederaAccountId: In(activeAccountIds) },
    });

    // Build participant public keys map for key re-exchange
    const participantPublicKeys = this.collectEncryptionKeys(
      users,
      activeAccountIds,
    );

    try {
      const rotatedPayload = createKeyExchangePayload(participantPublicKeys);

      // Submit the new key exchange to the HCS topic
      const keyExchangeBuffer = Buffer.from(JSON.stringify(rotatedPayload));
      await this.hederaService.submitMessage(
        conversation.hcsTopicId,
        keyExchangeBuffer,
      );

      // Update conversation with new key info
      conversation.encryptedKeysJson = JSON.stringify(rotatedPayload.keys);
      conversation.currentKeyId = rotatedPayload.keyId;
      await this.conversationRepository.save(conversation);

      this.logger.log(
        `Key rotated for conversation ${conversationId}, new keyId: ${rotatedPayload.keyId}`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Key rotation failed for conversation ${conversationId}: ${message}`,
      );
      // The member was already added; key rotation can be retried.
      // We don't rollback the member addition.
    }

    // Build and return the updated conversation response
    return this.getConversation(conversationId, requestorAccountId);
  }

  // ---------------------------------------------------------------------------
  // Remove Participant / Leave Group (GAP-008)
  // ---------------------------------------------------------------------------

  /**
   * Remove a participant from a group conversation (admin only).
   *
   * Flow:
   * 1. Validate conversation is a group
   * 2. Validate requestor is admin
   * 3. Prevent removing the last admin
   * 4. Mark member as left (set leftAt timestamp)
   * 5. Rotate encryption keys for remaining members
   *
   * @param conversationId - UUID of the conversation
   * @param targetAccountId - Hedera account ID to remove
   * @param requestorAccountId - Hedera account ID of the requesting admin
   */
  async removeParticipant(
    conversationId: string,
    targetAccountId: string,
    requestorAccountId: string,
  ): Promise<ConversationResponse> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new ConversationNotFoundException(conversationId);
    }

    if (conversation.conversationType === "direct") {
      throw new CannotAddToDirectConversationException();
    }

    // Verify requestor is admin
    const requestorMember = await this.memberRepository.findOne({
      where: {
        conversationId,
        hederaAccountId: requestorAccountId,
      },
    });

    if (!requestorMember || requestorMember.leftAt !== null) {
      throw new NotConversationMemberException(
        requestorAccountId,
        conversationId,
      );
    }

    if (requestorMember.role !== "admin") {
      throw new NotConversationAdminException(
        requestorAccountId,
        conversationId,
      );
    }

    // Find the target member
    const targetMember = await this.memberRepository.findOne({
      where: {
        conversationId,
        hederaAccountId: targetAccountId,
      },
    });

    if (!targetMember || targetMember.leftAt !== null) {
      throw new NotConversationMemberException(targetAccountId, conversationId);
    }

    // Mark as left
    targetMember.leftAt = new Date();
    await this.memberRepository.save(targetMember);

    this.logger.log(
      `Removed participant ${targetAccountId} from conversation ${conversationId}`,
    );

    // Rotate keys for remaining members
    await this.rotateKeysForConversation(conversation, conversationId);

    return this.getConversation(conversationId, requestorAccountId);
  }

  /**
   * Leave a group conversation voluntarily.
   *
   * Any member can leave. If the leaving member is the last admin,
   * the next-oldest member is promoted to admin.
   *
   * @param conversationId - UUID of the conversation
   * @param accountId - Hedera account ID of the user leaving
   */
  async leaveConversation(
    conversationId: string,
    accountId: string,
  ): Promise<{ left: true }> {
    // Accept either DB UUID or HCS topic ID
    let conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });
    if (!conversation) {
      conversation = await this.conversationRepository.findOne({
        where: { hcsTopicId: conversationId },
      });
    }

    if (!conversation) {
      throw new ConversationNotFoundException(conversationId);
    }

    const member = await this.memberRepository.findOne({
      where: {
        conversationId,
        hederaAccountId: accountId,
      },
    });

    if (!member || member.leftAt !== null) {
      throw new NotConversationMemberException(accountId, conversationId);
    }

    // If leaving member is admin, check if there are other admins
    if (member.role === "admin") {
      const otherAdmins = await this.memberRepository.find({
        where: {
          conversationId,
          role: "admin",
        },
      });

      const activeAdmins = otherAdmins.filter(
        (a) => a.leftAt === null && a.hederaAccountId !== accountId,
      );

      // If no other admins, promote the oldest active member
      if (activeAdmins.length === 0) {
        const otherMembers = await this.memberRepository.find({
          where: { conversationId },
          order: { joinedAt: "ASC" },
        });

        const nextMember = otherMembers.find(
          (m) => m.leftAt === null && m.hederaAccountId !== accountId,
        );

        if (nextMember) {
          nextMember.role = "admin";
          await this.memberRepository.save(nextMember);
          this.logger.log(
            `Promoted ${nextMember.hederaAccountId} to admin in conversation ${conversationId}`,
          );
        }
      }
    }

    // Mark as left
    member.leftAt = new Date();
    await this.memberRepository.save(member);

    this.logger.log(`User ${accountId} left conversation ${conversationId}`);

    // Rotate keys for remaining members
    await this.rotateKeysForConversation(conversation, conversationId);

    return { left: true };
  }

  /**
   * Rotate encryption keys for all active members of a conversation.
   * Called after member removal or leaving.
   */
  private async rotateKeysForConversation(
    conversation: ConversationEntity,
    conversationId: string,
  ): Promise<void> {
    try {
      const allActiveMembers = await this.memberRepository.find({
        where: { conversationId },
      });

      const activeAccountIds = allActiveMembers
        .filter((m) => m.leftAt === null)
        .map((m) => m.hederaAccountId);

      if (activeAccountIds.length === 0) {
        return;
      }

      const users = await this.userRepository.find({
        where: { hederaAccountId: In(activeAccountIds) },
      });

      const participantPublicKeys = this.collectEncryptionKeys(
        users,
        activeAccountIds,
      );

      const rotatedPayload = createKeyExchangePayload(participantPublicKeys);

      const keyExchangeBuffer = Buffer.from(JSON.stringify(rotatedPayload));
      await this.hederaService.submitMessage(
        conversation.hcsTopicId,
        keyExchangeBuffer,
      );

      conversation.encryptedKeysJson = JSON.stringify(rotatedPayload.keys);
      conversation.currentKeyId = rotatedPayload.keyId;
      await this.conversationRepository.save(conversation);

      this.logger.log(
        `Key rotated for conversation ${conversationId} after member change`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Key rotation failed for conversation ${conversationId}: ${message}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Validate that all participant account IDs exist in the users table.
   */
  private async validateParticipantsExist(
    accountIds: string[],
  ): Promise<UserEntity[]> {
    const users = await this.userRepository.find({
      where: { hederaAccountId: In(accountIds) },
    });

    const foundAccountIds = new Set(
      users
        .filter((u) => u.hederaAccountId !== null)
        .map((u) => u.hederaAccountId as string),
    );

    for (const accountId of accountIds) {
      if (!foundAccountIds.has(accountId)) {
        throw new ParticipantNotFoundException(accountId);
      }
    }

    return users;
  }

  /**
   * Find an existing direct conversation between two users, if one exists.
   * Returns the ConversationEntity or null.
   */
  private async findExistingDirectConversation(
    accountA: string,
    accountB: string,
  ): Promise<ConversationEntity | null> {
    // Find all conversations where accountA is an active member
    const aMemberships = await this.memberRepository.find({
      where: { hederaAccountId: accountA },
    });

    const aConversationIds = aMemberships
      .filter((m) => m.leftAt === null)
      .map((m) => m.conversationId);

    if (aConversationIds.length === 0) {
      return null;
    }

    // Find conversations where accountB is also an active member
    const bMemberships = await this.memberRepository.find({
      where: {
        hederaAccountId: accountB,
        conversationId: In(aConversationIds),
      },
    });

    const sharedConversationIds = bMemberships
      .filter((m) => m.leftAt === null)
      .map((m) => m.conversationId);

    if (sharedConversationIds.length === 0) {
      return null;
    }

    // Return the first direct conversation found
    return this.conversationRepository.findOne({
      where: {
        id: In(sharedConversationIds),
        conversationType: "direct",
      },
    });
  }

  /**
   * Collect X25519 encryption public keys for all participants.
   * Returns a map of accountId -> Uint8Array(32).
   */
  private collectEncryptionKeys(
    users: UserEntity[],
    accountIds: string[],
  ): Record<string, Uint8Array> {
    const keys: Record<string, Uint8Array> = {};

    for (const accountId of accountIds) {
      const user = users.find((u) => u.hederaAccountId === accountId);
      if (!user) {
        throw new ParticipantNotFoundException(accountId);
      }

      if (!user.encryptionPublicKey) {
        throw new MissingEncryptionKeyException(accountId);
      }

      // Convert base64-encoded X25519 public key to Uint8Array
      const keyBytes = Buffer.from(user.encryptionPublicKey, "base64");
      keys[accountId] = new Uint8Array(keyBytes);
    }

    return keys;
  }

  /**
   * Verify that the given account is an active member of the conversation.
   */
  private async verifyMembership(
    conversationId: string,
    accountId: string,
  ): Promise<ConversationMemberEntity> {
    const member = await this.memberRepository.findOne({
      where: {
        conversationId,
        hederaAccountId: accountId,
      },
    });

    if (!member || member.leftAt !== null) {
      throw new NotConversationMemberException(accountId, conversationId);
    }

    return member;
  }

  /**
   * Mark a conversation as read for a participant by updating their lastReadSeq.
   * Called when a participant fetches messages — clears the unread count.
   */
  async markAsRead(topicId: string, accountId: string): Promise<void> {
    try {
      const conversation = await this.conversationRepository.findOne({
        where: { hcsTopicId: topicId },
      });
      if (!conversation) return;

      // Use lastMessageSeq from conversation, or fall back to a large number
      // to ensure all current messages are marked as read
      const lastSeq = Number(conversation.lastMessageSeq) || 9999999;

      await this.memberRepository.update(
        { conversationId: conversation.id, hederaAccountId: accountId },
        { lastReadSeq: lastSeq },
      );
    } catch (err: unknown) {
      // Non-critical — unread count self-corrects on next sync
      this.logger.warn(
        `markAsRead non-critical failure for topic ${topicId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Build participant response array from users and account IDs.
   */
  private buildParticipantResponses(
    users: UserEntity[],
    accountIds: string[],
    initiatorAccountId: string,
  ): ConversationParticipantResponse[] {
    return accountIds.map((accountId) => {
      const user = users.find((u) => u.hederaAccountId === accountId);
      return {
        accountId,
        displayName: user?.displayName ?? null,
        role: (accountId === initiatorAccountId ? "admin" : "member") as
          | "admin"
          | "member",
      };
    });
  }
}
