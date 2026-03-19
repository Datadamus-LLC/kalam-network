import type { BadgeTier } from './organization.types';
/** Types of content that can be sent in a message */
export type MessageContentType = 'text' | 'image' | 'file' | 'voice' | 'location' | 'contact';
/** Conversation types */
export type ConversationType = 'direct' | 'group';
/** All possible HCS message types on a conversation topic */
export type HcsMessageType = 'message' | 'key_exchange' | 'group_meta' | 'system' | 'payment' | 'payment_request' | 'payment_split';
/** Group member roles */
export type GroupMemberRole = 'admin' | 'member';
/** System message actions */
export type SystemAction = 'member_added' | 'member_removed' | 'key_rotated' | 'group_renamed';
/**
 * DM-MSG-001: Chat Message Payload
 *
 * This is the JSON that gets encrypted with AES-256-GCM and submitted to HCS.
 * Max size: 1024 bytes after encryption (HCS limit).
 * For text messages: ~800 chars available.
 * For media messages: ~200-300 bytes (CID + metadata).
 *
 * IMPORTANT: The "nonce" field is the AES-GCM nonce used for encryption.
 * It must be unique for every message (random 96-bit value).
 */
export interface ChatMessagePayload {
    v: '1.0';
    type: 'message';
    sender: string;
    ts: number;
    content: {
        type: MessageContentType;
        text?: string;
        mediaRef?: string;
        mediaMeta?: {
            filename: string;
            mimeType: string;
            size: number;
            dimensions?: string;
        };
    };
    replyTo?: number;
    nonce: string;
}
/**
 * DM-MSG-002: Key Exchange Payload
 *
 * Submitted as the FIRST message on every conversation topic.
 * The wrapper is plaintext, but each key bundle is encrypted with
 * the recipient's X25519 public key (nacl.box).
 *
 * When you receive this and find your account ID in "keys":
 * 1. Decode the base64 value
 * 2. Decrypt with your X25519 secret key (nacl.box.open)
 * 3. The result is the 256-bit AES key for this conversation
 * 4. Import it and store it locally indexed by topicId + keyId
 */
export interface KeyExchangePayload {
    v: '1.0';
    type: 'key_exchange';
    keys: Record<string, string>;
    algorithm: 'AES-256-GCM';
    keyId: string;
    rotationIndex: number;
}
/**
 * DM-MSG-003: Group Metadata Payload
 *
 * Submitted when a group is created or its metadata is updated.
 * This message IS encrypted (part of the conversation topic).
 */
export interface GroupMetaPayload {
    v: '1.0';
    type: 'group_meta';
    action: 'create' | 'update';
    data: {
        name: string;
        avatar?: string;
        admin: string;
        participants: string[];
    };
}
/**
 * DM-MSG-004: System Message Payload
 *
 * Auto-generated messages for group events.
 * These are encrypted and submitted to the conversation topic.
 * The frontend renders them as gray system messages (not chat bubbles).
 */
export interface SystemMessagePayload {
    v: '1.0';
    type: 'system';
    sender: string;
    action: SystemAction;
    data: {
        actor: string;
        target: string;
        newKeyId?: string;
    };
}
/**
 * Conversation object returned by the API.
 * This is NOT an HCS payload — it's a platform-level aggregation.
 */
export interface Conversation {
    id: string;
    hcsTopicId: string;
    type: ConversationType;
    groupName?: string | null;
    groupAvatarCid?: string | null;
    adminAccountId?: string | null;
    createdBy: string;
    participants: ConversationParticipant[];
    lastMessage?: MessagePreview | null;
    unreadCount: number;
    createdAt: string;
    lastMessageAt: string | null;
}
export interface ConversationParticipant {
    accountId: string;
    displayName: string | null;
    avatarUrl: string | null;
    role: GroupMemberRole;
    isOnline: boolean;
    /** Verified business badge tier — null for individual accounts */
    badgeTier: BadgeTier | null;
}
export interface MessagePreview {
    type: HcsMessageType;
    preview: string;
    senderAccountId: string;
    timestamp: string;
    sequenceNumber: number;
}
/**
 * Encrypted message as received from the API / WebSocket.
 * The client must decrypt "encryptedPayload" using the conversation's
 * symmetric key to get the actual ChatMessagePayload.
 */
export interface EncryptedMessage {
    sequenceNumber: number;
    consensusTimestamp: string;
    senderAccountId: string;
    encryptedPayload: string;
    nonce: string;
    keyId: string;
    transactionId: string;
}
/**
 * Decrypted message — what the UI actually renders.
 * Created by combining EncryptedMessage metadata + decrypted ChatMessagePayload.
 */
export interface DecryptedMessage {
    sequenceNumber: number;
    consensusTimestamp: string;
    senderAccountId: string;
    senderDisplayName: string;
    senderAvatarUrl: string | null;
    transactionId: string;
    content: {
        type: MessageContentType;
        text?: string;
        mediaRef?: string;
        mediaMeta?: {
            filename: string;
            mimeType: string;
            size: number;
            dimensions?: string;
        };
    };
    replyTo?: number;
    isMine: boolean;
}
//# sourceMappingURL=message.types.d.ts.map