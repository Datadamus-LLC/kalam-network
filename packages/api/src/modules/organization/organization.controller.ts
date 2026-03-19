import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { OrganizationService } from "./organization.service";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { UpdateOrgProfileDto } from "./dto/update-org-profile.dto";
import { CreateInvitationDto } from "./dto/create-invitation.dto";
import { UpdateMemberRoleDto } from "./dto/update-member-role.dto";
import { TransferOwnershipDto } from "./dto/transfer-ownership.dto";
import type {
  OrganizationResponse,
  OrganizationWithMembersResponse,
  OrganizationMemberResponse,
  OrganizationInvitationResponse,
} from "./dto/organization-response.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { JwtPayload } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { OrgPermissionGuard } from "./guards/org-permission.guard";
import { RequiresOrgRole } from "./decorators/requires-org-role.decorator";
import { OrganizationNotFoundException } from "./exceptions/organization.exceptions";

/**
 * Standard API envelope response.
 */
interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
  } | null;
  timestamp: string;
}

/**
 * OrganizationController — CRUD, member management, and invitation system.
 *
 * Endpoints:
 *   POST   /api/v1/organizations                   — Create organization
 *   GET    /api/v1/organizations/me               — Get own organization
 *   PUT    /api/v1/organizations/me               — Update organization profile
 *   GET    /api/v1/organizations/me/members        — List members
 *   PUT    /api/v1/organizations/me/members/:userId/role — Update member role
 *   DELETE /api/v1/organizations/me/members/:userId — Remove member
 *   POST   /api/v1/organizations/me/transfer-ownership — Transfer ownership
 *   POST   /api/v1/organizations/me/invitations    — Create invitation
 *   GET    /api/v1/organizations/me/invitations    — List invitations
 *   POST   /api/v1/organizations/invitations/:token/accept — Accept invitation
 */
@Controller("api/v1/organizations")
export class OrganizationController {
  private readonly logger = new Logger(OrganizationController.name);

  constructor(private readonly organizationService: OrganizationService) {}

  /**
   * POST /api/v1/organizations
   *
   * Create a new organization for the authenticated user.
   * Each user can own at most one organization.
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createOrganization(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateOrganizationDto,
  ): Promise<ApiResponse<OrganizationResponse>> {
    this.logger.log(`Creating organization for user ${user.sub}`);

    const org = await this.organizationService.createOrganization(
      user.sub,
      dto.name,
      user.hederaAccountId ?? "",
    );

    return {
      success: true,
      data: org,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/organizations/me
   *
   * Get the authenticated user's organization.
   */
  @Get("me")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getMyOrganization(
    @CurrentUser() user: JwtPayload,
  ): Promise<ApiResponse<OrganizationWithMembersResponse>> {
    this.logger.log(`GET organization for user ${user.sub}`);

    const org = await this.organizationService.getOrganizationByOwner(user.sub);

    if (!org) {
      throw new OrganizationNotFoundException(
        `No organization found for user ${user.sub}`,
      );
    }

    const withMembers =
      await this.organizationService.getOrganizationWithMembers(org.id);

    return {
      success: true,
      data: withMembers,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * PUT /api/v1/organizations/me
   *
   * Update organization profile. Requires owner or admin role.
   */
  @Put("me")
  @UseGuards(JwtAuthGuard, OrgPermissionGuard)
  @RequiresOrgRole("owner", "admin")
  @HttpCode(HttpStatus.OK)
  async updateOrganization(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateOrgProfileDto,
  ): Promise<ApiResponse<OrganizationResponse>> {
    const org = await this.organizationService.getOrganizationByOwner(user.sub);

    if (!org) {
      throw new OrganizationNotFoundException(
        `No organization found for user ${user.sub}`,
      );
    }

    this.logger.log(`Updating organization ${org.id}`);

    const updated = await this.organizationService.updateOrgProfile(
      org.id,
      dto,
    );

    return {
      success: true,
      data: updated,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/organizations/me/members
   *
   * List all members of the user's organization.
   */
  @Get("me/members")
  @UseGuards(JwtAuthGuard, OrgPermissionGuard)
  @RequiresOrgRole("owner", "admin", "member", "viewer")
  @HttpCode(HttpStatus.OK)
  async getMembers(
    @CurrentUser() user: JwtPayload,
  ): Promise<ApiResponse<OrganizationMemberResponse[]>> {
    const org = await this.organizationService.getOrganizationByOwner(user.sub);

    if (!org) {
      throw new OrganizationNotFoundException(
        `No organization found for user ${user.sub}`,
      );
    }

    const members = await this.organizationService.getMembers(org.id);

    return {
      success: true,
      data: members,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * PUT /api/v1/organizations/me/members/:userId/role
   *
   * Update a member's role. Requires owner or admin role.
   */
  @Put("me/members/:userId/role")
  @UseGuards(JwtAuthGuard, OrgPermissionGuard)
  @RequiresOrgRole("owner", "admin")
  @HttpCode(HttpStatus.OK)
  async updateMemberRole(
    @CurrentUser() user: JwtPayload,
    @Param("userId") targetUserId: string,
    @Body() dto: UpdateMemberRoleDto,
  ): Promise<ApiResponse<OrganizationMemberResponse>> {
    const org = await this.organizationService.getOrganizationByOwner(user.sub);

    if (!org) {
      throw new OrganizationNotFoundException(
        `No organization found for user ${user.sub}`,
      );
    }

    const updated = await this.organizationService.updateMemberRole(
      org.id,
      targetUserId,
      user.sub,
      dto.role,
    );

    return {
      success: true,
      data: updated,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * DELETE /api/v1/organizations/me/members/:userId
   *
   * Remove a member from the organization. Requires owner or admin role.
   */
  @Delete("me/members/:userId")
  @UseGuards(JwtAuthGuard, OrgPermissionGuard)
  @RequiresOrgRole("owner", "admin")
  @HttpCode(HttpStatus.OK)
  async removeMember(
    @CurrentUser() user: JwtPayload,
    @Param("userId") targetUserId: string,
  ): Promise<ApiResponse<{ message: string }>> {
    const org = await this.organizationService.getOrganizationByOwner(user.sub);

    if (!org) {
      throw new OrganizationNotFoundException(
        `No organization found for user ${user.sub}`,
      );
    }

    await this.organizationService.removeMember(org.id, targetUserId, user.sub);

    return {
      success: true,
      data: { message: `Member ${targetUserId} removed from organization` },
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * POST /api/v1/organizations/me/transfer-ownership
   *
   * Transfer organization ownership to another member. Owner only.
   */
  @Post("me/transfer-ownership")
  @UseGuards(JwtAuthGuard, OrgPermissionGuard)
  @RequiresOrgRole("owner")
  @HttpCode(HttpStatus.OK)
  async transferOwnership(
    @CurrentUser() user: JwtPayload,
    @Body() dto: TransferOwnershipDto,
  ): Promise<ApiResponse<OrganizationWithMembersResponse>> {
    const org = await this.organizationService.getOrganizationByOwner(user.sub);

    if (!org) {
      throw new OrganizationNotFoundException(
        `No organization found for user ${user.sub}`,
      );
    }

    this.logger.log(
      `Transferring ownership of org ${org.id} to user ${dto.newOwnerUserId}`,
    );

    const result = await this.organizationService.transferOwnership(
      org.id,
      dto.newOwnerUserId,
      user.sub,
    );

    return {
      success: true,
      data: result,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * POST /api/v1/organizations/me/invitations
   *
   * Create an invitation to join the organization. Requires owner or admin role.
   */
  @Post("me/invitations")
  @UseGuards(JwtAuthGuard, OrgPermissionGuard)
  @RequiresOrgRole("owner", "admin")
  @HttpCode(HttpStatus.CREATED)
  async createInvitation(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateInvitationDto,
  ): Promise<ApiResponse<OrganizationInvitationResponse>> {
    const org = await this.organizationService.getOrganizationByOwner(user.sub);

    if (!org) {
      throw new OrganizationNotFoundException(
        `No organization found for user ${user.sub}`,
      );
    }

    const invitation = await this.organizationService.createInvitation(
      org.id,
      user.sub,
      dto,
    );

    return {
      success: true,
      data: invitation,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/organizations/me/invitations
   *
   * List all invitations for the organization. Requires owner or admin role.
   */
  @Get("me/invitations")
  @UseGuards(JwtAuthGuard, OrgPermissionGuard)
  @RequiresOrgRole("owner", "admin")
  @HttpCode(HttpStatus.OK)
  async getInvitations(
    @CurrentUser() user: JwtPayload,
  ): Promise<ApiResponse<OrganizationInvitationResponse[]>> {
    const org = await this.organizationService.getOrganizationByOwner(user.sub);

    if (!org) {
      throw new OrganizationNotFoundException(
        `No organization found for user ${user.sub}`,
      );
    }

    const invitations = await this.organizationService.getInvitations(org.id);

    return {
      success: true,
      data: invitations,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * POST /api/v1/organizations/invitations/:token/accept
   *
   * Accept an invitation. Requires authentication.
   */
  @Post("invitations/:token/accept")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async acceptInvitation(
    @CurrentUser() user: JwtPayload,
    @Param("token") token: string,
  ): Promise<ApiResponse<OrganizationMemberResponse>> {
    this.logger.log(`User ${user.sub} accepting invitation token`);

    const member = await this.organizationService.acceptInvitation(
      token,
      user.sub,
    );

    return {
      success: true,
      data: member,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }
}
