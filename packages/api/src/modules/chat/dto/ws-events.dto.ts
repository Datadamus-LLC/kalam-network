import { IsString, IsNotEmpty, IsBoolean, IsInt, Min } from "class-validator";

/**
 * DTO for the join_conversation WebSocket event.
 * Client sends this to join a conversation room and receive real-time updates.
 */
export class JoinConversationDto {
  @IsString()
  @IsNotEmpty()
  topicId!: string;
}

/**
 * DTO for the leave_conversation WebSocket event.
 * Client sends this when navigating away from a conversation.
 */
export class LeaveConversationDto {
  @IsString()
  @IsNotEmpty()
  topicId!: string;
}

/**
 * DTO for the typing WebSocket event.
 * Client sends this when the user starts or stops typing.
 */
export class TypingDto {
  @IsString()
  @IsNotEmpty()
  topicId!: string;

  @IsBoolean()
  isTyping!: boolean;
}

/**
 * DTO for the read_receipt WebSocket event.
 * Client sends this when the user has read messages up to a given sequence number.
 */
export class ReadReceiptDto {
  @IsString()
  @IsNotEmpty()
  topicId!: string;

  @IsInt()
  @Min(1)
  lastReadSequence!: number;
}

// ---------------------------------------------------------------------------
// Server-emitted event payload interfaces
// ---------------------------------------------------------------------------

/**
 * Payload for server_new_message events.
 * Emitted when new messages are synced from the Mirror Node.
 */
export interface ServerNewMessagePayload {
  topicId: string;
  lastSequence: number;
  timestamp: number;
}

/**
 * Payload for server_typing events.
 * Emitted when another user starts typing in a conversation.
 */
export interface ServerTypingPayload {
  accountId: string;
  topicId: string;
  isTyping: boolean;
  timestamp: number;
}

/**
 * Payload for server_read_receipt events.
 * Emitted when another user sends a read receipt.
 */
export interface ServerReadReceiptPayload {
  accountId: string;
  topicId: string;
  lastReadSequence: number;
  timestamp: number;
}

/**
 * Payload for server_user_online and server_user_offline events.
 * Emitted when a user joins or leaves a conversation room.
 */
export interface ServerPresencePayload {
  accountId: string;
  topicId: string;
  timestamp: number;
}

/**
 * Payload for joined_conversation confirmation events.
 * Sent to the client after successfully joining a conversation room.
 */
export interface JoinedConversationPayload {
  topicId: string;
  onlineUsers: string[];
  timestamp: number;
}

/**
 * Payload for read_receipt_sync events.
 * Sent to the client after joining a conversation room for initial sync.
 */
export interface ReadReceiptSyncPayload {
  topicId: string;
  receipts: ReadReceiptEntry[];
}

/**
 * A single read receipt entry in the sync payload.
 */
export interface ReadReceiptEntry {
  accountId: string;
  topicId: string;
  lastReadSequence: number;
  timestamp: number;
}

/**
 * Payload for the ws_error event.
 * Emitted to the client when a WebSocket operation fails.
 */
export interface WsErrorPayload {
  code: string;
  message: string;
}

/**
 * Conversation state returned by the REST endpoint.
 */
export interface ConversationStateResponse {
  topicId: string;
  onlineUsers: PresenceUserResponse[];
  readReceipts: ReadReceiptEntry[];
  typingUsers: string[];
}

/**
 * Presence user data returned in the conversation state response.
 */
export interface PresenceUserResponse {
  accountId: string;
  joinedAt: number;
}

/**
 * Event payload received from the messages.synced EventEmitter event.
 */
export interface MessagesSyncedEvent {
  topicId: string;
  previousSequence: number;
  lastSequence: number;
}
