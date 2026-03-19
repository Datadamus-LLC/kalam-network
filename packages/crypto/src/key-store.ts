// =============================================================================
// CLIENT-SIDE KEY STORAGE
// =============================================================================
// In-memory store of conversation AES keys, indexed by topic ID.
// On a real app, this would use encrypted local storage (Web Crypto API storage).
// For hackathon, we use in-memory Map (keys lost on page refresh).
//
// Reference: docs/SPECIFICATION.md Section 7.1 (Key storage - client)
// =============================================================================

/**
 * Metadata for a stored key.
 */
export interface StoredKeyMetadata {
  keyId: string; // UUID v4 from key exchange
  key: CryptoKey; // The actual AES-256 CryptoKey
  rotationIndex: number; // Current rotation count
}

/**
 * In-memory store of conversation keys.
 * Maps: topicId -> { keyId, key, rotationIndex }
 */
const keyStore = new Map<string, StoredKeyMetadata>();

/**
 * Store an AES key for a conversation topic.
 *
 * Example:
 *   await storeKey(topicId, { keyId: 'uuid...', key: cryptoKey, rotationIndex: 0 });
 *
 * @param topicId - HCS Topic ID, e.g., "0.0.12345"
 * @param metadata - Key metadata including the CryptoKey
 */
export async function storeKey(
  topicId: string,
  metadata: StoredKeyMetadata
): Promise<void> {
  keyStore.set(topicId, metadata);
}

/**
 * Retrieve the AES key for a conversation topic.
 *
 * Example:
 *   const metadata = await getKey(topicId);
 *   if (metadata) {
 *     const plaintext = await decrypt(metadata.key, ciphertext, nonce);
 *   }
 *
 * @param topicId - HCS Topic ID
 * @returns Key metadata if found, undefined otherwise
 */
export async function getKey(topicId: string): Promise<StoredKeyMetadata | undefined> {
  return keyStore.get(topicId);
}

/**
 * Remove a key from storage.
 *
 * Used when leaving a conversation or when a key is rotated out.
 *
 * @param topicId - HCS Topic ID
 */
export async function removeKey(topicId: string): Promise<void> {
  keyStore.delete(topicId);
}

/**
 * Check if a key exists for a topic.
 *
 * @param topicId - HCS Topic ID
 * @returns true if the key exists, false otherwise
 */
export async function hasKey(topicId: string): Promise<boolean> {
  return keyStore.has(topicId);
}

/**
 * Get all topic IDs that have stored keys.
 *
 * Useful for listing all conversations the user is in.
 *
 * @returns Array of topic IDs
 */
export async function getAllTopicIds(): Promise<string[]> {
  return Array.from(keyStore.keys());
}
