import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from "@nestjs/common";

// ---------------------------------------------------------------------------
// Not Found
// ---------------------------------------------------------------------------

export class OrganizationNotFoundException extends NotFoundException {
  constructor(identifier: string) {
    super({
      code: "ORGANIZATION_NOT_FOUND",
      message: `Organization ${identifier} not found`,
    });
  }
}

export class OrganizationMemberNotFoundException extends NotFoundException {
  constructor(orgId: string, userId: string) {
    super({
      code: "ORGANIZATION_MEMBER_NOT_FOUND",
      message: `User ${userId} is not a member of organization ${orgId}`,
    });
  }
}

export class InvitationNotFoundException extends NotFoundException {
  constructor(token: string) {
    super({
      code: "INVITATION_NOT_FOUND",
      message: `Invitation with token ${token} not found`,
    });
  }
}

// ---------------------------------------------------------------------------
// Forbidden / Authorization
// ---------------------------------------------------------------------------

export class OrgPermissionDeniedException extends ForbiddenException {
  constructor(requiredRole: string, actualRole: string) {
    super({
      code: "ORG_PERMISSION_DENIED",
      message: `Insufficient organization permissions. Required: ${requiredRole}, actual: ${actualRole}`,
      requiredRole,
      actualRole,
    });
  }
}

export class CannotRemoveOwnerException extends ForbiddenException {
  constructor(orgId: string) {
    super({
      code: "CANNOT_REMOVE_OWNER",
      message: `Cannot remove the owner of organization ${orgId}`,
    });
  }
}

export class CannotModifyOwnRoleException extends ForbiddenException {
  constructor() {
    super({
      code: "CANNOT_MODIFY_OWN_ROLE",
      message: "Cannot modify your own role. Another owner must do this.",
    });
  }
}

export class OwnershipTransferNotAllowedException extends ForbiddenException {
  constructor(reason: string) {
    super({
      code: "OWNERSHIP_TRANSFER_NOT_ALLOWED",
      message: `Ownership transfer failed: ${reason}`,
    });
  }
}

export class NotOrgMemberException extends ForbiddenException {
  constructor(userId: string, orgId: string) {
    super({
      code: "NOT_ORG_MEMBER",
      message: `User ${userId} is not a member of organization ${orgId}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Bad Request / Validation
// ---------------------------------------------------------------------------

export class InvitationExpiredException extends BadRequestException {
  constructor(token: string) {
    super({
      code: "INVITATION_EXPIRED",
      message: `Invitation ${token} has expired`,
    });
  }
}

export class InvitationAlreadyAcceptedException extends BadRequestException {
  constructor(token: string) {
    super({
      code: "INVITATION_ALREADY_ACCEPTED",
      message: `Invitation ${token} has already been accepted`,
    });
  }
}

export class InvalidOrgRoleException extends BadRequestException {
  constructor(role: string) {
    super({
      code: "INVALID_ORG_ROLE",
      message: `Invalid organization role: ${role}. Valid roles: owner, admin, member, viewer`,
    });
  }
}

export class UserAlreadyMemberException extends ConflictException {
  constructor(userId: string, orgId: string) {
    super({
      code: "USER_ALREADY_MEMBER",
      message: `User ${userId} is already a member of organization ${orgId}`,
    });
  }
}

export class OrgAlreadyExistsForUserException extends ConflictException {
  constructor(userId: string) {
    super({
      code: "ORG_ALREADY_EXISTS",
      message: `An organization already exists for user ${userId}`,
    });
  }
}

export class DuplicateInvitationException extends ConflictException {
  constructor(email: string, orgId: string) {
    super({
      code: "DUPLICATE_INVITATION",
      message: `A pending invitation already exists for ${email} in organization ${orgId}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Internal / System Errors
// ---------------------------------------------------------------------------

export class OrgCreationException extends InternalServerErrorException {
  constructor(reason: string) {
    super({
      code: "ORG_CREATION_FAILED",
      message: `Organization creation failed: ${reason}`,
    });
  }
}

export class OrgHcsSubmissionException extends InternalServerErrorException {
  constructor(topicId: string, reason: string) {
    super({
      code: "ORG_HCS_SUBMISSION_FAILED",
      message: `Failed to submit organization message to topic ${topicId}: ${reason}`,
    });
  }
}
