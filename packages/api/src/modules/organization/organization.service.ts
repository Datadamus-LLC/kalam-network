import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
import { randomUUID, randomBytes } from "crypto";
import sanitizeHtml from "sanitize-html";
import { OrganizationEntity } from "../../database/entities/organization.entity";
import { OrganizationMemberEntity } from "../../database/entities/organization-member.entity";
import { OrganizationInvitationEntity } from "../../database/entities/organization-invitation.entity";
import { UserEntity } from "../../database/entities/user.entity";
import { HederaService } from "../hedera/hedera.service";
import { DidNftService } from "../identity/services/did-nft.service";
import type { DIDNftMetadata } from "../identity/services/did-nft.service";
import type {
  BadgeTier,
  KybStatus,
  VerifiedBadgeInfo,
} from "@hedera-social/shared";
import {
  OrganizationNotFoundException,
  OrganizationMemberNotFoundException,
  InvitationNotFoundException,
  CannotRemoveOwnerException,
  CannotModifyOwnRoleException,
  OwnershipTransferNotAllowedException,
  UserAlreadyMemberException,
  OrgAlreadyExistsForUserException,
  InvitationExpiredException,
  InvitationAlreadyAcceptedException,
  DuplicateInvitationException,
  OrgCreationException,
} from "./exceptions/organization.exceptions";
import type { UpdateOrgProfileDto } from "./dto/update-org-profile.dto";
import type { CreateInvitationDto } from "./dto/create-invitation.dto";
import type {
  OrganizationResponse,
  OrganizationWithMembersResponse,
  OrganizationMemberResponse,
  OrganizationInvitationResponse,
} from "./dto/organization-response.dto";

/** How long an invitation token is valid (7 days) */
const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(
    @InjectRepository(OrganizationEntity)
    private readonly orgRepository: Repository<OrganizationEntity>,
    @InjectRepository(OrganizationMemberEntity)
    private readonly memberRepository: Repository<OrganizationMemberEntity>,
    @InjectRepository(OrganizationInvitationEntity)
    private readonly invitationRepository: Repository<OrganizationInvitationEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly hederaService: HederaService,
    private readonly didNftService: DidNftService,
  ) {}

  // ---------------------------------------------------------------------------
  // Badge Computation (existing methods)
  // ---------------------------------------------------------------------------

  computeBadgeTier(kybStatus: KybStatus): BadgeTier | null {
    switch (kybStatus) {
      case "pending":
        return "basic";
      case "verified":
        return "verified";
      case "certified":
        return "certified";
      case "rejected":
        return null;
      default:
        this.logger.warn(
          `Unknown KYB status encountered: ${String(kybStatus)}`,
        );
        return null;
    }
  }

  buildBadgeInfo(
    kybStatus: KybStatus,
    kybVerifiedAt: string | null,
    hcsAttestationTopic: string | null,
    hcsAttestationSeq: number | null,
  ): VerifiedBadgeInfo | null {
    const tier = this.computeBadgeTier(kybStatus);
    if (tier === null) {
      return null;
    }

    return {
      tier,
      kybVerifiedAt,
      hcsAttestationTopic: hcsAttestationTopic ?? "",
      hcsAttestationSeq,
    };
  }

  // ---------------------------------------------------------------------------
  // Organization CRUD
  // ---------------------------------------------------------------------------

  async getOrganizationByOwner(
    userId: string,
  ): Promise<OrganizationResponse | null> {
    const org = await this.orgRepository.findOne({
      where: { ownerUserId: userId },
    });

    if (!org) {
      return null;
    }

    return this.mapOrgToResponse(org);
  }

  async getOrganizationById(orgId: string): Promise<OrganizationResponse> {
    const org = await this.orgRepository.findOne({
      where: { id: orgId },
    });

    if (!org) {
      throw new OrganizationNotFoundException(orgId);
    }

    return this.mapOrgToResponse(org);
  }

  async getOrganizationWithMembers(
    orgId: string,
  ): Promise<OrganizationWithMembersResponse> {
    const org = await this.orgRepository.findOne({
      where: { id: orgId },
    });

    if (!org) {
      throw new OrganizationNotFoundException(orgId);
    }

    const members = await this.memberRepository.find({
      where: { organizationId: orgId },
      order: { joinedAt: "ASC" },
    });

    return {
      ...this.mapOrgToResponse(org),
      members: members.map((m) => this.mapMemberToResponse(m)),
    };
  }

  async updateOrgProfile(
    orgId: string,
    dto: UpdateOrgProfileDto,
  ): Promise<OrganizationResponse> {
    const org = await this.orgRepository.findOne({
      where: { id: orgId },
    });

    if (!org) {
      throw new OrganizationNotFoundException(orgId);
    }

    if (dto.name !== undefined)
      org.name = sanitizeHtml(dto.name, {
        allowedTags: [],
        allowedAttributes: {},
      }).trim();
    if (dto.bio !== undefined)
      org.bio = sanitizeHtml(dto.bio, {
        allowedTags: [],
        allowedAttributes: {},
      }).trim();
    if (dto.category !== undefined) org.category = dto.category;
    if (dto.website !== undefined) org.website = dto.website;
    if (dto.businessHours !== undefined) org.businessHours = dto.businessHours;
    if (dto.logoCid !== undefined) org.logoCid = dto.logoCid;

    const updated = await this.orgRepository.save(org);
    this.logger.log(`Organization ${orgId} profile updated`);

    return this.mapOrgToResponse(updated);
  }

  // ---------------------------------------------------------------------------
  // Member Management
  // ---------------------------------------------------------------------------

  async getMembers(orgId: string): Promise<OrganizationMemberResponse[]> {
    const members = await this.memberRepository.find({
      where: { organizationId: orgId },
      order: { joinedAt: "ASC" },
    });

    // Batch-fetch user details for display names and account IDs
    const userIds = members.map((m) => m.userId);
    const users =
      userIds.length > 0
        ? await this.userRepository.find({ where: { id: In(userIds) } })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return members.map((m) => {
      const user = userMap.get(m.userId);
      return {
        ...this.mapMemberToResponse(m),
        displayName: user?.displayName ?? null,
        hederaAccountId: user?.hederaAccountId ?? null,
      };
    });
  }

  async updateMemberRole(
    orgId: string,
    targetUserId: string,
    actorUserId: string,
    newRole: "admin" | "member" | "viewer",
  ): Promise<OrganizationMemberResponse> {
    if (targetUserId === actorUserId) {
      throw new CannotModifyOwnRoleException();
    }

    const membership = await this.memberRepository.findOne({
      where: { organizationId: orgId, userId: targetUserId },
    });

    if (!membership) {
      throw new OrganizationMemberNotFoundException(orgId, targetUserId);
    }

    if (membership.role === "owner") {
      throw new CannotRemoveOwnerException(orgId);
    }

    membership.role = newRole;
    const updated = await this.memberRepository.save(membership);
    this.logger.log(
      `Member ${targetUserId} role updated to ${newRole} in org ${orgId}`,
    );

    return this.mapMemberToResponse(updated);
  }

  async removeMember(
    orgId: string,
    targetUserId: string,
    actorUserId: string,
  ): Promise<void> {
    if (targetUserId === actorUserId) {
      throw new CannotModifyOwnRoleException();
    }

    const membership = await this.memberRepository.findOne({
      where: { organizationId: orgId, userId: targetUserId },
    });

    if (!membership) {
      throw new OrganizationMemberNotFoundException(orgId, targetUserId);
    }

    if (membership.role === "owner") {
      throw new CannotRemoveOwnerException(orgId);
    }

    await this.memberRepository.remove(membership);
    this.logger.log(`Member ${targetUserId} removed from org ${orgId}`);
  }

  // ---------------------------------------------------------------------------
  // Ownership Transfer
  // ---------------------------------------------------------------------------

  /**
   * Transfer organization ownership from the current owner to another member.
   *
   * Only the current owner can transfer ownership:
   * 1. Verify the org exists and the actor is the owner
   * 2. Verify the target user is an existing member
   * 3. Demote current owner to admin
   * 4. Promote target to owner
   * 5. Update org.ownerUserId
   */
  async transferOwnership(
    orgId: string,
    newOwnerUserId: string,
    currentOwnerUserId: string,
  ): Promise<OrganizationWithMembersResponse> {
    if (newOwnerUserId === currentOwnerUserId) {
      throw new OwnershipTransferNotAllowedException(
        "Cannot transfer ownership to yourself",
      );
    }

    // Verify org exists
    const org = await this.orgRepository.findOne({ where: { id: orgId } });
    if (!org) {
      throw new OrganizationNotFoundException(orgId);
    }

    // Verify actor is the actual owner
    if (org.ownerUserId !== currentOwnerUserId) {
      throw new OwnershipTransferNotAllowedException(
        "Only the current owner can transfer ownership",
      );
    }

    // Find current owner membership
    const currentOwnerMembership = await this.memberRepository.findOne({
      where: {
        organizationId: orgId,
        userId: currentOwnerUserId,
        role: "owner",
      },
    });

    if (!currentOwnerMembership) {
      throw new OwnershipTransferNotAllowedException(
        "Current owner membership record not found",
      );
    }

    // Find the target member
    const targetMembership = await this.memberRepository.findOne({
      where: { organizationId: orgId, userId: newOwnerUserId },
    });

    if (!targetMembership) {
      throw new OrganizationMemberNotFoundException(orgId, newOwnerUserId);
    }

    // Execute transfer: demote current owner to admin, promote target to owner
    currentOwnerMembership.role = "admin";
    targetMembership.role = "owner";
    org.ownerUserId = newOwnerUserId;

    await this.memberRepository.save([
      currentOwnerMembership,
      targetMembership,
    ]);
    await this.orgRepository.save(org);

    this.logger.log(
      `Ownership of org ${orgId} transferred from ${currentOwnerUserId} to ${newOwnerUserId}`,
    );

    return this.getOrganizationWithMembers(orgId);
  }

  // ---------------------------------------------------------------------------
  // Invitation System
  // ---------------------------------------------------------------------------

  async createInvitation(
    orgId: string,
    invitedByUserId: string,
    dto: CreateInvitationDto,
  ): Promise<OrganizationInvitationResponse> {
    // Check if user with this email is already a member of the organization
    const existingMember = await this.memberRepository
      .createQueryBuilder("member")
      .innerJoin("users", "u", "u.id = member.userId")
      .where("member.organizationId = :orgId", { orgId })
      .andWhere("u.email = :email", { email: dto.email })
      .getOne();

    if (existingMember) {
      throw new UserAlreadyMemberException(existingMember.userId, orgId);
    }

    // Check if there is already a pending invitation for this email in this org
    const existingInvitation = await this.invitationRepository.findOne({
      where: {
        organizationId: orgId,
        email: dto.email,
        status: "pending",
      },
    });

    if (existingInvitation) {
      throw new DuplicateInvitationException(dto.email, orgId);
    }

    const token = randomBytes(48).toString("base64url");
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS);

    const invitation = this.invitationRepository.create({
      id: randomUUID(),
      organizationId: orgId,
      email: dto.email,
      role: dto.role,
      invitedBy: invitedByUserId,
      status: "pending",
      token,
      expiresAt,
    });

    const saved = await this.invitationRepository.save(invitation);
    this.logger.log(
      `Invitation created for ${dto.email} to org ${orgId} (role: ${dto.role})`,
    );

    return this.mapInvitationToResponse(saved);
  }

  async getInvitations(
    orgId: string,
  ): Promise<OrganizationInvitationResponse[]> {
    const invitations = await this.invitationRepository.find({
      where: { organizationId: orgId },
      order: { createdAt: "DESC" },
    });

    return invitations.map((i) => this.mapInvitationToResponse(i));
  }

  async acceptInvitation(
    token: string,
    userId: string,
  ): Promise<OrganizationMemberResponse> {
    const invitation = await this.invitationRepository.findOne({
      where: { token },
    });

    if (!invitation) {
      throw new InvitationNotFoundException(token);
    }

    if (invitation.status === "accepted") {
      throw new InvitationAlreadyAcceptedException(token);
    }

    if (invitation.expiresAt < new Date()) {
      invitation.status = "expired";
      await this.invitationRepository.save(invitation);
      throw new InvitationExpiredException(token);
    }

    // Check if user is already a member
    const existing = await this.memberRepository.findOne({
      where: {
        organizationId: invitation.organizationId,
        userId,
      },
    });

    if (existing) {
      throw new UserAlreadyMemberException(userId, invitation.organizationId);
    }

    // Create membership
    const member = this.memberRepository.create({
      id: randomUUID(),
      organizationId: invitation.organizationId,
      userId,
      role: invitation.role,
      invitedBy: invitation.invitedBy,
    });

    const savedMember = await this.memberRepository.save(member);

    // Mark invitation as accepted
    invitation.status = "accepted";
    await this.invitationRepository.save(invitation);

    this.logger.log(
      `User ${userId} accepted invitation to org ${invitation.organizationId} (role: ${invitation.role})`,
    );

    return this.mapMemberToResponse(savedMember);
  }

  // ---------------------------------------------------------------------------
  // Organization Creation (called during business account setup)
  // ---------------------------------------------------------------------------

  async createOrganization(
    ownerUserId: string,
    name: string,
    _ownerHederaAccountId: string,
  ): Promise<OrganizationResponse> {
    // Sanitize name to prevent stored XSS
    const sanitizedName = sanitizeHtml(name, {
      allowedTags: [],
      allowedAttributes: {},
    }).trim();

    // Check if user already has an org
    const existing = await this.orgRepository.findOne({
      where: { ownerUserId },
    });

    if (existing) {
      throw new OrgAlreadyExistsForUserException(ownerUserId);
    }

    try {
      // GAP-011: Create a dedicated Hedera account for the organization.
      // The organization receives its own Hedera account funded by the operator.
      // We use the operator's own public key as the org account key for now —
      // full MPC custody per-org keys require Tamam org vault provisioning.
      let orgHederaAccountId: string;
      try {
        const operatorPublicKeyHex =
          this.hederaService.getOperatorPublicKeyHex();
        orgHederaAccountId = await this.hederaService.createAccount(
          operatorPublicKeyHex,
          0,
        );
        this.logger.log(
          `Created dedicated Hedera account ${orgHederaAccountId} for org (owner: ${ownerUserId})`,
        );
      } catch (accountError: unknown) {
        const reason =
          accountError instanceof Error
            ? accountError.message
            : String(accountError);
        this.logger.error(
          `Failed to create dedicated org Hedera account for user ${ownerUserId}: ${reason}`,
        );
        throw new OrgCreationException(
          `Organization Hedera account creation failed: ${reason}`,
        );
      }

      const orgId = randomUUID();

      // Create HCS broadcast topic for the organization (async — non-fatal)
      let broadcastTopicId: string | undefined;
      try {
        broadcastTopicId = await this.hederaService.createTopic({
          memo: `${sanitizedName} — Broadcast Channel`,
        });
        this.logger.log(
          `Created broadcast HCS topic ${broadcastTopicId} for org ${orgId}`,
        );
      } catch (topicError: unknown) {
        const reason =
          topicError instanceof Error ? topicError.message : String(topicError);
        this.logger.warn(
          `Failed to create broadcast topic for org ${orgId} (non-fatal): ${reason}`,
        );
      }

      const org = this.orgRepository.create({
        id: orgId,
        ownerUserId,
        name: sanitizedName,
        hederaAccountId: orgHederaAccountId,
        ...(broadcastTopicId ? { broadcastTopicId } : {}),
        kybStatus: "pending",
      });

      const savedOrg = await this.orgRepository.save(org);

      // Create owner membership
      const ownerMembership = this.memberRepository.create({
        id: randomUUID(),
        organizationId: orgId,
        userId: ownerUserId,
        role: "owner",
      });

      await this.memberRepository.save(ownerMembership);

      // GAP-012: Mint a DID NFT for the organization asynchronously
      const orgMetadata: DIDNftMetadata = {
        name: `${sanitizedName} — Organization DID`,
        description: `Hedera Social Platform organization identity certificate for ${sanitizedName}`,
        image: "ipfs://QmPlaceholderOrgDid",
        type: "organization/did",
        format: "HIP-412",
        properties: {
          accountType: "business",
          kycLevel: "pending",
          kycProvider: "mirsad-ai",
          kycTimestamp: new Date().toISOString(),
          kycHash: randomUUID(),
          displayName: sanitizedName,
          bio: "",
          createdAt: new Date().toISOString(),
          version: "1.0",
        },
        businessProperties: {
          companyName: sanitizedName,
        },
      };

      this.didNftService
        .mintDidNft(orgMetadata, orgHederaAccountId)
        .then(async (result) => {
          await this.orgRepository.update(
            { id: orgId },
            { didNftSerial: result.serial },
          );
          this.logger.log(
            `DID NFT minted for org ${orgId}: serial=${result.serial}, token=${result.tokenId}`,
          );
        })
        .catch((mintError: unknown) => {
          const reason =
            mintError instanceof Error ? mintError.message : String(mintError);
          this.logger.warn(
            `DID NFT mint failed for org ${orgId} (non-fatal): ${reason}`,
          );
        });

      this.logger.log(
        `Organization ${orgId} created for user ${ownerUserId} with Hedera account ${orgHederaAccountId}`,
      );

      return this.mapOrgToResponse(savedOrg);
    } catch (error: unknown) {
      if (error instanceof OrgAlreadyExistsForUserException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new OrgCreationException(message);
    }
  }

  // ---------------------------------------------------------------------------
  // Response Mapping
  // ---------------------------------------------------------------------------

  private mapOrgToResponse(org: OrganizationEntity): OrganizationResponse {
    const tier = this.computeBadgeTier(org.kybStatus as KybStatus);

    return {
      id: org.id,
      name: org.name,
      ownerUserId: org.ownerUserId,
      hederaAccountId: org.hederaAccountId,
      broadcastTopicId: org.broadcastTopicId ?? null,
      logoCid: org.logoCid ?? null,
      bio: org.bio ?? null,
      category: org.category ?? null,
      website: org.website ?? null,
      businessHours: org.businessHours ?? null,
      kybStatus: org.kybStatus,
      badgeTier: tier ?? "basic",
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
    };
  }

  private mapMemberToResponse(
    member: OrganizationMemberEntity,
  ): OrganizationMemberResponse {
    return {
      id: member.id,
      userId: member.userId,
      displayName: null,
      hederaAccountId: null,
      role: member.role,
      joinedAt: member.joinedAt.toISOString(),
      invitedBy: member.invitedBy ?? null,
    };
  }

  private mapInvitationToResponse(
    invitation: OrganizationInvitationEntity,
  ): OrganizationInvitationResponse {
    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      token: invitation.token,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
      invitedBy: invitation.invitedBy,
    };
  }
}
