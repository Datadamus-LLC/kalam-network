/**
 * Response DTO for a conversation.
 *
 * Returned from create, get, and list endpoints.
 * Maps from ConversationEntity + ConversationMemberEntity + UserEntity data.
 */
export interface ConversationParticipantResponse {
  accountId: string;
  displayName: string | null;
  role: "admin" | "member";
}

export interface ConversationResponse {
  id: string;
  type: "direct" | "group";
  hcsTopicId: string;
  groupName: string | null;
  groupAvatarCid: string | null;
  participants: ConversationParticipantResponse[];
  createdBy: string;
  createdAt: string; // ISO 8601
  lastMessageAt: string | null;
  unreadCount: number;
  /** Map of accountId → base64(X25519-encrypted AES-256 symmetric key). Client decrypts using their private key. */
  encryptedKeys: Record<string, string> | null;
}

export interface PaginatedConversationsResponse {
  data: ConversationResponse[];
  nextCursor: string | null;
  hasMore: boolean;
}
