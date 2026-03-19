/**
 * Response shape for organization profile.
 */
export interface OrganizationResponse {
  id: string;
  name: string;
  ownerUserId: string;
  hederaAccountId: string;
  broadcastTopicId: string | null;
  logoCid: string | null;
  bio: string | null;
  category: string | null;
  website: string | null;
  businessHours: Record<string, string> | null;
  kybStatus: string;
  badgeTier: "basic" | "verified" | "certified";
  createdAt: string;
  updatedAt: string;
}

/**
 * Response shape for organization with members list.
 */
export interface OrganizationWithMembersResponse extends OrganizationResponse {
  members: OrganizationMemberResponse[];
}

/**
 * Response shape for an organization member.
 */
export interface OrganizationMemberResponse {
  id: string;
  userId: string;
  displayName: string | null;
  hederaAccountId: string | null;
  role: string;
  joinedAt: string;
  invitedBy: string | null;
}

/**
 * Response shape for an organization invitation.
 */
export interface OrganizationInvitationResponse {
  id: string;
  email: string;
  role: string;
  status: string;
  token: string;
  expiresAt: string;
  createdAt: string;
  invitedBy: string;
}
