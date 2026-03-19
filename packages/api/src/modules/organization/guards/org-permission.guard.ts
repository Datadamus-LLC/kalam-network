import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Request } from "express";
import { OrganizationMemberEntity } from "../../../database/entities/organization-member.entity";
import { OrganizationEntity } from "../../../database/entities/organization.entity";
import {
  ORG_ROLES_KEY,
  OrgRole,
} from "../decorators/requires-org-role.decorator";
import {
  OrgPermissionDeniedException,
  NotOrgMemberException,
  OrganizationNotFoundException,
} from "../exceptions/organization.exceptions";
import type { JwtPayload } from "../../auth/guards/jwt-auth.guard";

/**
 * Organization context attached to the request by OrgPermissionGuard.
 * Accessible downstream via request.orgContext.
 */
export interface OrgContext {
  orgId: string;
  role: OrgRole;
  org: OrganizationEntity;
}

/**
 * Extended request type with org context.
 */
export type RequestWithOrg = Request & {
  user: JwtPayload;
  orgContext: OrgContext;
};

/**
 * Role hierarchy: lower index = higher privilege.
 * Owner (0) > Admin (1) > Member (2) > Viewer (3)
 */
const ROLE_HIERARCHY: OrgRole[] = ["owner", "admin", "member", "viewer"];

/**
 * OrgPermissionGuard — enforces role-based access control on org-scoped endpoints.
 *
 * Flow:
 * 1. Reads the X-Org-Context header to identify the active organization.
 *    If the header is absent, looks up the user's organization by ownership.
 * 2. Validates the user is a member of the specified organization.
 * 3. Reads required roles from @RequiresOrgRole() decorator metadata.
 * 4. Compares the user's actual role against the required roles using the hierarchy.
 * 5. Injects `orgContext` into the request object for downstream use.
 *
 * Must be used AFTER JwtAuthGuard (user must already be authenticated).
 */
@Injectable()
export class OrgPermissionGuard implements CanActivate {
  private readonly logger = new Logger(OrgPermissionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(OrganizationMemberEntity)
    private readonly memberRepository: Repository<OrganizationMemberEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly orgRepository: Repository<OrganizationEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithOrg>();
    const user = request.user;

    if (!user) {
      this.logger.warn(
        "OrgPermissionGuard called without authenticated user — ensure JwtAuthGuard runs first",
      );
      throw new OrgPermissionDeniedException("authenticated", "none");
    }

    // Step 1: Resolve organization ID from header or ownership
    let orgId = request.headers["x-org-context"] as string | undefined;

    if (!orgId) {
      // Fallback: find organization owned by this user
      const ownedOrg = await this.orgRepository.findOne({
        where: { ownerUserId: user.sub },
      });
      if (ownedOrg) {
        orgId = ownedOrg.id;
      }
    }

    if (!orgId) {
      throw new OrganizationNotFoundException(
        `No organization context found for user ${user.sub}. Set X-Org-Context header or ensure user owns an organization.`,
      );
    }

    // Step 2: Load the organization
    const org = await this.orgRepository.findOne({
      where: { id: orgId },
    });

    if (!org) {
      throw new OrganizationNotFoundException(orgId);
    }

    // Step 3: Verify the user is a member of this organization
    const membership = await this.memberRepository.findOne({
      where: {
        organizationId: orgId,
        userId: user.sub,
      },
    });

    if (!membership) {
      throw new NotOrgMemberException(user.sub, orgId);
    }

    const userRole = membership.role as OrgRole;

    // Step 4: Check required roles from decorator metadata
    const requiredRoles = this.reflector.getAllAndOverride<
      OrgRole[] | undefined
    >(ORG_ROLES_KEY, [context.getHandler(), context.getClass()]);

    if (requiredRoles && requiredRoles.length > 0) {
      const userRoleIndex = ROLE_HIERARCHY.indexOf(userRole);
      const hasPermission = requiredRoles.some((requiredRole) => {
        const requiredIndex = ROLE_HIERARCHY.indexOf(requiredRole);
        // User has permission if their role index is <= required role index (higher privilege)
        return userRoleIndex <= requiredIndex;
      });

      if (!hasPermission) {
        this.logger.warn(
          `Org permission denied for user ${user.sub} in org ${orgId}: ` +
            `required=${requiredRoles.join("|")}, actual=${userRole}`,
        );
        throw new OrgPermissionDeniedException(
          requiredRoles.join(" or "),
          userRole,
        );
      }
    }

    // Step 5: Inject org context into request
    request.orgContext = {
      orgId,
      role: userRole,
      org,
    };

    return true;
  }
}
