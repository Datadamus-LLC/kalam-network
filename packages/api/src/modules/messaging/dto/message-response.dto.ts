/**
 * Response shape for a single message returned from the API.
 *
 * Note: The encryptedPayload is NOT exposed here — clients must
 * decrypt messages client-side using the conversation symmetric key.
 */
export interface MessageResponse {
  id: string;
  hcsTopicId: string;
  sequenceNumber: number;
  senderAccountId: string;
  messageType: string;
  hasMedia: boolean;
  consensusTimestamp: string; // ISO 8601
  text: string | null; // Plaintext (null — server never stores plaintext for E2E security)
  encryptedContent: string | null; // Client-side AES-256-GCM encrypted content (JSON: {ciphertext,iv,tag})
}

/**
 * Response shape for paginated messages.
 */
export interface PaginatedMessagesResponse {
  messages: MessageResponse[];
  cursor: string | null; // sequence number for next page
  hasMore: boolean;
}

/**
 * Map a MessageIndexEntity to MessageResponse.
 */
export function toMessageResponse(entity: {
  id: string;
  hcsTopicId: string;
  sequenceNumber: number;
  senderAccountId: string;
  messageType: string;
  hasMedia: boolean;
  consensusTimestamp: Date;
  plaintextContent?: string | null;
  encryptedPreview?: Buffer | null;
}): MessageResponse {
  return {
    id: entity.id,
    hcsTopicId: entity.hcsTopicId,
    sequenceNumber: entity.sequenceNumber,
    senderAccountId: entity.senderAccountId,
    messageType: entity.messageType,
    hasMedia: entity.hasMedia,
    consensusTimestamp: entity.consensusTimestamp.toISOString(),
    text: entity.plaintextContent ?? null,
    // Return client-encrypted content if stored (client decrypts with X25519-derived key)
    encryptedContent: entity.encryptedPreview
      ? entity.encryptedPreview.toString("utf8")
      : null,
  };
}
