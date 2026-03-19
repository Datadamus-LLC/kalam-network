import type { UserStatus } from './user.types';
import type { AccountType, KycLevel } from './user.types';
export interface RegisterRequest {
    method: 'email' | 'phone';
    value: string;
}
export interface RegisterResponse {
    registrationId: string;
    otpSent: boolean;
    expiresAt: string;
}
export interface VerifyOtpRequest {
    registrationId: string;
    otp: string;
}
export interface VerifyOtpResponse {
    token: string;
    refreshToken: string;
    user: {
        id: string;
        hederaAccountId: string;
        status: UserStatus;
        accountType: AccountType | null;
    };
}
export interface KycSubmitRequest {
    accountType: 'individual' | 'business';
    fullName: string;
    dateOfBirth?: string;
    nationality: string;
}
export interface KycStatusResponse {
    status: 'submitted' | 'approved' | 'rejected' | 'pending_review';
    kycLevel: KycLevel | null;
    rejectionReason: string | null;
    canResubmit: boolean;
    didNftSerial: number | null;
    didNftMetadataCid: string | null;
}
export interface ProfileUpdateRequest {
    displayName?: string;
    bio?: string;
    avatar?: string;
}
export interface ProfileUpdateResponse {
    updated: boolean;
    didNftSerial: number;
    hederaTransactions: HederaTransactionRef[];
}
export interface CreateConversationRequest {
    type: 'direct' | 'group';
    participants: string[];
    groupName?: string;
    groupAvatar?: string;
}
export interface CreateConversationResponse {
    id: string;
    hcsTopicId: string;
    type: 'direct' | 'group';
    participants: Array<{
        accountId: string;
        displayName: string | null;
    }>;
    createdAt: string;
    hederaTransactions: HederaTransactionRef[];
}
export interface SendMessageRequest {
    encryptedPayload: string;
    nonce: string;
    keyId: string;
}
export interface SendMessageResponse {
    sequenceNumber: number;
    consensusTimestamp: string;
    transactionId: string;
}
export interface AddMemberRequest {
    accountId: string;
}
export interface AddMemberResponse {
    added: boolean;
    keyRotated: boolean;
    hederaTransactions: HederaTransactionRef[];
}
export interface CreatePostRequest {
    text: string;
    media?: Array<{
        ipfsCid: string;
        mimeType: string;
        size: number;
        dimensions?: string;
        alt?: string;
    }>;
}
export interface CreatePostResponse {
    sequenceNumber: number;
    consensusTimestamp: string;
    transactionId: string;
    hcsTopicId: string;
}
export interface HederaTransactionRef {
    type: string;
    txId: string;
    note?: string;
}
export interface PaginatedRequest {
    limit?: number;
    cursor?: string;
}
export interface PaginatedResponse<T> {
    data: T[];
    nextCursor: string | null;
    hasMore: boolean;
}
export interface ApiError {
    statusCode: number;
    message: string;
    error: string;
    details?: Record<string, unknown>;
}
export interface WsSubscribeEvent {
    topics: string[];
}
export interface WsTypingEvent {
    topicId: string;
}
export interface WsReadEvent {
    topicId: string;
    upToSeq: number;
}
export interface WsNewMessageEvent {
    topicId: string;
    data: {
        sequenceNumber: number;
        consensusTimestamp: string;
        senderAccountId: string;
        encryptedPayload: string;
        nonce: string;
        keyId: string;
        transactionId: string;
    };
}
export interface WsTypingIndicator {
    topicId: string;
    accountId: string;
}
export interface WsReadReceipt {
    topicId: string;
    accountId: string;
    upToSeq: number;
}
export interface WsPresenceEvent {
    accountId: string;
    status: 'online' | 'offline';
}
export interface WsPaymentEvent {
    topicId: string;
    data: Record<string, unknown>;
}
export interface WsNotificationEvent {
    notification: Record<string, unknown>;
}
//# sourceMappingURL=api.types.d.ts.map