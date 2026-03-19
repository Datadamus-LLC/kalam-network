import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In, ILike } from "typeorm";
import { randomUUID } from "crypto";
import sanitizeHtml from "sanitize-html";
import { BroadcastMessageEntity } from "../../../database/entities/broadcast-message.entity";
import { BroadcastSubscriptionEntity } from "../../../database/entities/broadcast-subscription.entity";
import { OrganizationEntity } from "../../../database/entities/organization.entity";
import { OrganizationMemberEntity } from "../../../database/entities/organization-member.entity";
import { HederaService } from "../../hedera/hedera.service";
import type { CreateBroadcastDto } from "../dto/broadcast.dto";
import type {
  BroadcastMessageResponse,
  BroadcastFeedResponse,
  BroadcastSubscriptionResponse,
} from "../dto/broadcast.dto";
import {
  BroadcastTopicNotFoundException,
  BroadcastOrgNotFoundException,
  BroadcastNotAuthorizedToPostException,
  AlreadySubscribedException,
  NotSubscribedException,
  BroadcastCreationFailedException,
} from "../exceptions/broadcast.exceptions";

/**
 * HCS Broadcast payload structure submitted to an org's broadcast topic.
 */
interface HcsBroadcastPayload {
  version: 1;
  type: "broadcast";
  timestamp: string;
  sender: string;
  organizationId: string;
  content: {
    text: string;
    media?: Array<{
      type: "image" | "video";
      ref: string;
      mimeType: string;
      size: number;
    }>;
  };
}

@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);

  constructor(
    @InjectRepository(BroadcastMessageEntity)
    private readonly messageRepo: Repository<BroadcastMessageEntity>,
    @InjectRepository(BroadcastSubscriptionEntity)
    private readonly subscriptionRepo: Repository<BroadcastSubscriptionEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
    @InjectRepository(OrganizationMemberEntity)
    private readonly orgMemberRepo: Repository<OrganizationMemberEntity>,
    private readonly hederaService: HederaService,
  ) {}

  // ---------------------------------------------------------------------------
  // Post Broadcast
  // ---------------------------------------------------------------------------

  /**
   * Create a broadcast message for an organization.
   *
   * Only org owners and admins can post broadcasts.
   * The message is submitted to the org's HCS broadcast topic and indexed in PostgreSQL.
   */
  async createBroadcast(
    orgId: string,
    authorAccountId: string,
    authorUserId: string,
    dto: CreateBroadcastDto,
  ): Promise<BroadcastMessageResponse> {
    // Verify org exists
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) {
      throw new BroadcastOrgNotFoundException(orgId);
    }

    // Verify broadcast topic exists
    if (!org.broadcastTopicId) {
      throw new BroadcastTopicNotFoundException(orgId);
    }

    // Verify user is an owner or admin of the org
    const membership = await this.orgMemberRepo.findOne({
      where: { organizationId: orgId, userId: authorUserId },
    });

    if (
      !membership ||
      (membership.role !== "owner" && membership.role !== "admin")
    ) {
      throw new BroadcastNotAuthorizedToPostException(authorUserId, orgId);
    }

    // Sanitize text input
    const sanitizedText = sanitizeHtml(dto.text, {
      allowedTags: [],
      allowedAttributes: {},
    }).trim();

    // Build HCS payload
    const hcsPayload: HcsBroadcastPayload = {
      version: 1,
      type: "broadcast",
      timestamp: new Date().toISOString(),
      sender: authorAccountId,
      organizationId: orgId,
      content: {
        text: sanitizedText,
      },
    };

    if (dto.media && dto.media.length > 0) {
      hcsPayload.content.media = dto.media.map((m) => ({
        type: m.type,
        ref: `ipfs://${m.ipfsCid}`,
        mimeType: m.mimeType,
        size: m.size,
      }));
    }

    // Submit to HCS
    let sequenceNumber: string;
    try {
      const messageBuffer = Buffer.from(JSON.stringify(hcsPayload));
      sequenceNumber = await this.hederaService.submitMessage(
        org.broadcastTopicId,
        messageBuffer,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `HCS broadcast submission failed for org ${orgId}: ${message}`,
      );
      throw new BroadcastCreationFailedException(
        `HCS submission failed: ${message}`,
      );
    }

    // Index in PostgreSQL
    const messageId = randomUUID();
    const now = new Date();
    const mediaRefs = dto.media ? dto.media.map((m) => m.ipfsCid) : [];

    const entity = this.messageRepo.create({
      id: messageId,
      organizationId: orgId,
      authorAccountId,
      hcsTopicId: org.broadcastTopicId,
      sequenceNumber: parseInt(sequenceNumber, 10),
      consensusTimestamp: now,
      contentText: sanitizedText,
      hasMedia: mediaRefs.length > 0,
      mediaRefs: mediaRefs.length > 0 ? mediaRefs : null,
    });

    try {
      await this.messageRepo.save(entity);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to index broadcast ${messageId}: ${message}`);
      throw new BroadcastCreationFailedException(
        `Database indexing failed: ${message}`,
      );
    }

    this.logger.log(
      `Broadcast created: ${messageId} for org ${orgId}, topic: ${org.broadcastTopicId}, seq: ${sequenceNumber}`,
    );

    return this.toBroadcastResponse(entity, org);
  }

  // ---------------------------------------------------------------------------
  // Get Broadcast Feed for an Organization
  // ---------------------------------------------------------------------------

  /**
   * Get paginated broadcast messages for a specific organization.
   */
  async getOrgBroadcasts(
    orgId: string,
    cursor?: string,
    limit: number = 20,
  ): Promise<BroadcastFeedResponse> {
    const effectiveLimit = Math.min(Math.max(limit, 1), 100);

    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) {
      throw new BroadcastOrgNotFoundException(orgId);
    }

    const qb = this.messageRepo
      .createQueryBuilder("b")
      .where("b.organizationId = :orgId", { orgId })
      .orderBy("b.consensusTimestamp", "DESC")
      .take(effectiveLimit + 1);

    if (cursor) {
      qb.andWhere("b.consensusTimestamp < :cursor", {
        cursor: new Date(cursor),
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > effectiveLimit;
    const items = hasMore ? rows.slice(0, effectiveLimit) : rows;

    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].consensusTimestamp.toISOString()
        : null;

    return {
      broadcasts: items.map((b) => this.toBroadcastResponse(b, org)),
      nextCursor,
      hasMore,
    };
  }

  // ---------------------------------------------------------------------------
  // Get Subscribed Broadcast Feed (all subscribed orgs)
  // ---------------------------------------------------------------------------

  /**
   * Get broadcasts from all organizations the user is subscribed to.
   */
  async getSubscribedFeed(
    subscriberAccountId: string,
    cursor?: string,
    limit: number = 20,
  ): Promise<BroadcastFeedResponse> {
    const effectiveLimit = Math.min(Math.max(limit, 1), 100);

    // Find all org IDs the user is subscribed to
    const subscriptions = await this.subscriptionRepo.find({
      where: { subscriberAccountId },
    });

    const orgIds = subscriptions.map((s) => s.organizationId);

    if (orgIds.length === 0) {
      return { broadcasts: [], nextCursor: null, hasMore: false };
    }

    const qb = this.messageRepo
      .createQueryBuilder("b")
      .where("b.organizationId IN (:...orgIds)", { orgIds })
      .orderBy("b.consensusTimestamp", "DESC")
      .take(effectiveLimit + 1);

    if (cursor) {
      qb.andWhere("b.consensusTimestamp < :cursor", {
        cursor: new Date(cursor),
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > effectiveLimit;
    const items = hasMore ? rows.slice(0, effectiveLimit) : rows;

    // Load org details for all referenced orgs
    const referencedOrgIds = [...new Set(items.map((b) => b.organizationId))];
    const orgs =
      referencedOrgIds.length > 0
        ? await this.orgRepo.find({ where: { id: In(referencedOrgIds) } })
        : [];
    const orgMap = new Map(orgs.map((o) => [o.id, o]));

    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].consensusTimestamp.toISOString()
        : null;

    return {
      broadcasts: items.map((b) =>
        this.toBroadcastResponse(b, orgMap.get(b.organizationId)),
      ),
      nextCursor,
      hasMore,
    };
  }

  // ---------------------------------------------------------------------------
  // Subscribe / Unsubscribe
  // ---------------------------------------------------------------------------

  /**
   * Subscribe a user to an organization's broadcast channel.
   */
  async subscribe(
    subscriberAccountId: string,
    orgId: string,
  ): Promise<BroadcastSubscriptionResponse> {
    // Accept: UUID, Hedera account ID (0.0.XXXXX), or org name (partial match)
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const hederaPattern = /^\d+\.\d+\.\d+$/;
    let org = null;
    if (uuidPattern.test(orgId)) {
      org = await this.orgRepo.findOne({ where: { id: orgId } });
    } else if (hederaPattern.test(orgId)) {
      org = await this.orgRepo.findOne({ where: { hederaAccountId: orgId } });
    } else {
      org = await this.orgRepo.findOne({
        where: { name: ILike(`%${orgId}%`) },
      });
    }
    if (!org) {
      throw new BroadcastOrgNotFoundException(orgId);
    }

    // Check for existing subscription
    const existing = await this.subscriptionRepo.findOne({
      where: { subscriberAccountId, organizationId: orgId },
    });

    if (existing) {
      throw new AlreadySubscribedException(subscriberAccountId, orgId);
    }

    const subscription = this.subscriptionRepo.create({
      subscriberAccountId,
      organizationId: orgId,
      broadcastTopicId: org.broadcastTopicId ?? null,
    });

    const saved = await this.subscriptionRepo.save(subscription);
    this.logger.log(
      `Account ${subscriberAccountId} subscribed to broadcasts of org ${orgId}`,
    );

    return {
      subscriberAccountId: saved.subscriberAccountId,
      organizationId: saved.organizationId,
      broadcastTopicId: saved.broadcastTopicId,
      subscribedAt: saved.subscribedAt.toISOString(),
    };
  }

  /**
   * Unsubscribe a user from an organization's broadcast channel.
   */
  async unsubscribe(subscriberAccountId: string, orgId: string): Promise<void> {
    const existing = await this.subscriptionRepo.findOne({
      where: { subscriberAccountId, organizationId: orgId },
    });

    if (!existing) {
      throw new NotSubscribedException(subscriberAccountId, orgId);
    }

    await this.subscriptionRepo.remove(existing);
    this.logger.log(
      `Account ${subscriberAccountId} unsubscribed from broadcasts of org ${orgId}`,
    );
  }

  /**
   * Get subscriber count for an organization's broadcast channel.
   */
  async getSubscriberCount(orgId: string): Promise<number> {
    return this.subscriptionRepo.count({
      where: { organizationId: orgId },
    });
  }

  /**
   * Check if a user is subscribed to an org's broadcasts.
   */
  async isSubscribed(
    subscriberAccountId: string,
    orgId: string,
  ): Promise<boolean> {
    const sub = await this.subscriptionRepo.findOne({
      where: { subscriberAccountId, organizationId: orgId },
    });
    return sub !== null;
  }

  // ---------------------------------------------------------------------------
  // Response Mapping
  // ---------------------------------------------------------------------------

  private toBroadcastResponse(
    entity: BroadcastMessageEntity,
    org?: OrganizationEntity,
  ): BroadcastMessageResponse {
    const media = entity.mediaRefs
      ? entity.mediaRefs.map((cid) => ({
          type: "image" as const,
          ref: `ipfs://${cid}`,
          mimeType: "image/png",
          size: 0,
        }))
      : [];

    // Compute badge tier from KYB status
    let badgeTier: string | null = null;
    if (org) {
      switch (org.kybStatus) {
        case "verified":
          badgeTier = "verified";
          break;
        case "certified":
          badgeTier = "certified";
          break;
        case "pending":
          badgeTier = "basic";
          break;
        default:
          badgeTier = null;
      }
    }

    return {
      id: entity.id,
      organizationId: entity.organizationId,
      author: {
        accountId: entity.authorAccountId,
        organizationName: org?.name ?? null,
        badgeTier,
      },
      text: entity.contentText,
      media,
      hcsTopicId: entity.hcsTopicId,
      sequenceNumber:
        typeof entity.sequenceNumber === "string"
          ? parseInt(String(entity.sequenceNumber), 10)
          : entity.sequenceNumber,
      consensusTimestamp: entity.consensusTimestamp.toISOString(),
      createdAt: entity.createdAt.toISOString(),
    };
  }
}
