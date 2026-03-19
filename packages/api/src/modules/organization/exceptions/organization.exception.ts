import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Organization-specific exception.
 * All organization errors are typed and include an error code
 * for client-side handling.
 */
export class OrganizationException extends HttpException {
  readonly code: string;

  constructor(code: string, message: string, statusCode: HttpStatus) {
    super({ code, message, statusCode }, statusCode);
    this.code = code;
  }

  static notFound(orgId: string): OrganizationException {
    return new OrganizationException(
      "ORG_NOT_FOUND",
      `Organization not found: ${orgId}`,
      HttpStatus.NOT_FOUND,
    );
  }

  static kybNotApproved(orgId: string): OrganizationException {
    return new OrganizationException(
      "ORG_KYB_NOT_APPROVED",
      `Organization KYB not approved: ${orgId}`,
      HttpStatus.FORBIDDEN,
    );
  }

  static permissionDenied(): OrganizationException {
    return new OrganizationException(
      "ORG_PERMISSION_DENIED",
      "You do not have permission to perform this action",
      HttpStatus.FORBIDDEN,
    );
  }
}
