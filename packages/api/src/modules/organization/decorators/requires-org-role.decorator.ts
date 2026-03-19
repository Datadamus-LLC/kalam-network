import { SetMetadata } from "@nestjs/common";

/**
 * Metadata key used by OrgPermissionGuard to retrieve required roles.
 */
export const ORG_ROLES_KEY = "requiredOrgRoles";

/**
 * Organization role type for the RBAC permission matrix.
 *
 * Hierarchy (from most to least privileged):
 *   Owner > Admin > Member > Viewer
 */
export type OrgRole = "owner" | "admin" | "member" | "viewer";

/**
 * Decorator that sets the minimum required organization roles for an endpoint.
 *
 * Usage:
 *   @RequiresOrgRole('owner', 'admin')
 *   @UseGuards(JwtAuthGuard, OrgPermissionGuard)
 *   async updateProfile() { ... }
 *
 * The OrgPermissionGuard reads these roles from metadata and compares
 * against the user's actual role in the organization (from X-Org-Context header).
 */
export const RequiresOrgRole = (...roles: OrgRole[]) =>
  SetMetadata(ORG_ROLES_KEY, roles);
