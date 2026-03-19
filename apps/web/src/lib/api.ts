/**
 * API Client for Hedera Social Platform
 *
 * Single source of truth for all HTTP communication with the NestJS backend.
 * All methods throw ApiError on non-2xx responses so callers can discriminate
 * on status codes (e.g. 401 triggers token refresh, 404 treated as null).
 */

import { useAuthStore } from '@/stores/auth.store';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface RequestOptions {
  params?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface Post {
  id: string;
  authorAccountId: string;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  content: string;
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  hcsTopicId: string | null;
  hcsSequenceNumber: number | null;
  createdAt: string;
}

export interface ConversationItem {
  id: string;
  hcsTopicId: string;
  type: string;
  participants: Array<{
    accountId: string;
    displayName: string | null;
    role: string;
  }>;
  createdBy: string;
  createdAt: string;
  lastMessageAt: string | null;
  unreadCount: number;
  groupName: string | null;
  /** X25519-encrypted AES-256 key for each participant — for E2E decryption */
  encryptedKeys?: Record<string, string> | null;
}

export interface ChatMessageResponse {
  id: string;
  topicId: string;
  senderAccountId: string;
  text: string;
  encryptedContent?: string | null;
  sequenceNumber: number;
  consensusTimestamp: string;
  createdAt: string;
  messageType?: string;
}

export interface BroadcastMessage {
  id: string;
  organizationId: string;
  orgName: string;
  content: string;
  hcsTopicId: string;
  sequenceNumber: number;
  createdAt: string;
}

export interface OrgData {
  id: string;
  name: string;
  bio: string | null;
  category: string | null;
  website: string | null;
  kybStatus: string;
  badgeTier: 'basic' | 'verified' | 'certified' | null;
  hcsAttestationTopic: string | null;
  hcsAttestationSeq: number | null;
  kybVerifiedAt: string | null;
  logoCid: string | null;
  members: Array<{
    userId: string;
    role: string;
    displayName: string | null;
    hederaAccountId: string | null;
    joinedAt: string;
  }>;
}

// ---------------------------------------------------------------------------
// ApiClient
// ---------------------------------------------------------------------------

class ApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  // ─── Core HTTP ───────────────────────────────────────────────────────────

  /**
   * Build URL with query string parameters, omitting null/undefined values.
   */
  private buildUrl(
    path: string,
    params?: Record<string, string | number | boolean | null | undefined>,
  ): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== null && value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      }
    }
    return url.toString();
  }

  /**
   * Get the current access token from the Zustand store.
   * Works on both server (returns null) and client.
   */
  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return useAuthStore.getState().token;
  }

  /**
   * Attempt a silent token refresh and return the new access token.
   * Throws ApiError if the refresh itself fails.
   */
  private async attemptTokenRefresh(): Promise<string | null> {
    const currentRefreshToken = useAuthStore.getState().refreshToken;
    if (!currentRefreshToken) return null;

    try {
      const data = await this.executeRequest<{
        accessToken: string;
        refreshToken: string;
      }>('POST', '/auth/refresh', { body: { refreshToken: currentRefreshToken } });

      useAuthStore.getState().setTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    } catch {
      // Refresh failed — clear auth and propagate by returning null
      useAuthStore.getState().logout();
      return null;
    }
  }

  /**
   * Execute a single fetch without any retry logic.
   * Throws ApiError on non-2xx. Returns undefined for 204 No Content.
   */
  private async executeRequest<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
    token?: string | null,
  ): Promise<T> {
    const { params, body, headers: extraHeaders = {} } = options;
    const url = this.buildUrl(path, params);

    const headers: Record<string, string> = {
      ...extraHeaders,
    };

    // Only set Content-Type for requests that carry a body
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const resolvedToken = token !== undefined ? token : this.getToken();
    if (resolvedToken) {
      headers['Authorization'] = `Bearer ${resolvedToken}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (response.status === 204) {
      return undefined as T;
    }

    if (!response.ok) {
      let errorMessage = `${response.status} ${response.statusText}`;
      try {
        const errorBody = await response.json();
        // Custom API envelope: { success, data, error: { code, message }, timestamp }
        if (errorBody?.error?.message) {
          errorMessage = String(errorBody.error.message);
        } else if (errorBody?.message) {
          // NestJS standard: { message: string | string[] }
          errorMessage = Array.isArray(errorBody.message)
            ? errorBody.message.join(', ')
            : String(errorBody.message);
        } else if (errorBody?.error && typeof errorBody.error === 'string') {
          errorMessage = errorBody.error;
        }
      } catch {
        // Could not parse error body — use status text
      }
      throw new ApiError(errorMessage, response.status);
    }

    const json = await response.json();
    // Unwrap the NestJS API envelope { success, data, error, timestamp }
    // if the response has the standard shape — otherwise return as-is.
    if (json && typeof json === 'object' && 'success' in json && 'data' in json) {
      return json.data as T;
    }
    return json as T;
  }

  /**
   * Make an authenticated HTTP request. On 401 it silently refreshes the
   * access token and retries once. Subsequent 401s throw ApiError.
   */
  private async request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    try {
      return await this.executeRequest<T>(method, path, options);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        const newToken = await this.attemptTokenRefresh();
        if (newToken) {
          return this.executeRequest<T>(method, path, options, newToken);
        }
      }
      throw err;
    }
  }

  // ─── Auth ─────────────────────────────────────────────────────────────────

  /** Initiate email registration — backend sends an OTP. */
  register(params: {
    method: 'email';
    value: string;
  }): Promise<{ registrationId: string }> {
    return this.request('POST', '/auth/register', { body: { email: params.value } });
  }

  /**
   * Verify OTP after registration or login.
   * Returns a pair of JWT tokens.
   */
  verifyOtp(params: {
    identifier: string;
    identifierType: 'email' | 'phone';
    otp: string;
  }): Promise<{ accessToken: string; refreshToken: string }> {
    return this.request('POST', '/auth/verify-otp', { body: { email: params.identifier, otp: params.otp } });
  }

  /** Initiate email login — backend sends an OTP (mirrors register). */
  login(params: {
    method: 'email';
    value: string;
  }): Promise<{ registrationId: string }> {
    return this.request('POST', '/auth/login', { body: { email: params.value } });
  }

  /** Exchange a refresh token for a new token pair. */
  refreshToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    return this.request('POST', '/auth/refresh', {
      body: { refreshToken },
    });
  }

  /** Create a Hedera wallet via Tamam MPC custody for the authenticated user. */
  createWallet(): Promise<{
    hederaAccountId: string;
    accessToken: string;
    refreshToken: string;
  }> {
    return this.request('POST', '/wallet/create');
  }

  // ─── Profile ──────────────────────────────────────────────────────────────

  /** Fetch a user profile. Pass 'me' for the authenticated user. */
  getProfile(accountId: 'me' | string): Promise<{
    hederaAccountId: string;
    displayName: string | null;
    bio: string | null;
    avatarUrl: string | null;
    accountType: string;
    kycLevel: string | null;
    stats: {
      posts: number;
      followers: number;
      following: number;
      paymentsOnChain: number;
    };
    createdAt: string;
    didNft: {
      tokenId: string;
      serialNumber: number;
      metadataCid: string;
    } | null;
    badgeInfo: unknown | null;
  }> {
    return this.request('GET', `/profile/${accountId}`);
  }

  /** Update the authenticated user's profile. */
  updateProfile(data: {
    displayName?: string;
    bio?: string;
    avatarUrl?: string;
  }): Promise<unknown> {
    return this.request('PUT', '/profile/me', { body: data });
  }

  /** Get wallet and encryption key status for the authenticated user. */
  getWalletStatus(): Promise<{
    hasWallet: boolean;
    hasEncryptionKey: boolean;
    hederaAccountId: string | null;
    status: string;
    keyId?: string;
  }> {
    return this.request('GET', '/wallet/status');
  }

  /**
   * Generate (or re-derive) the X25519 encryption key for the authenticated
   * user so they can participate in end-to-end encrypted conversations.
   */
  generateEncryptionKey(): Promise<{ encryptionPublicKey: string; encryptionPrivateKey?: string; encryptedBackup?: string; generated: boolean }> {
    return this.request('POST', '/wallet/encryption-key');
  }

  /**
   * Ensure an encryption key exists — same as generateEncryptionKey but used
   * in contexts where we only want to create the key if one is not already set.
   */
  ensureEncryptionKey(): Promise<{ encryptionPublicKey: string; encryptionPrivateKey?: string; encryptedBackup?: string; generated: boolean }> {
    return this.generateEncryptionKey();
  }

  /** Store a PIN-encrypted private key backup on the server. */
  storeKeyBackup(encryptedBackup: string): Promise<{ stored: boolean }> {
    return this.request('PUT', '/wallet/encryption-key/backup', { body: { encryptedBackup } });
  }

  /** Retrieve the PIN-encrypted private key backup for new device login. */
  getKeyBackup(): Promise<{ encryptedBackup: string | null }> {
    return this.request('GET', '/wallet/encryption-key/backup');
  }

  // ─── Feed / Posts ─────────────────────────────────────────────────────────

  /** Map a backend PostResponseDto to the frontend Post shape. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapPost(p: any): Post {
    return {
      id: p.id ?? '',
      authorAccountId: p.author?.accountId ?? p.authorAccountId ?? '',
      authorDisplayName: p.author?.displayName ?? p.authorDisplayName ?? null,
      authorAvatarUrl: p.author?.avatarUrl ?? p.authorAvatarUrl ?? null,
      content: p.text ?? p.content ?? '',
      likeCount: p.likeCount ?? p.likes ?? 0,
      commentCount: p.commentCount ?? p.replies ?? 0,
      isLiked: p.isLiked ?? false,
      hcsTopicId: p.hcsTopicId ?? null,
      hcsSequenceNumber: p.hcsSequenceNumber ?? null,
      createdAt: p.createdAt ?? new Date().toISOString(),
    };
  }

  private mapFeed(raw: { posts: unknown[]; nextCursor?: string | null; hasMore?: boolean }): { posts: Post[]; nextCursor?: string } {
    return {
      posts: (raw?.posts ?? []).map((p) => this.mapPost(p as Parameters<typeof this.mapPost>[0])),
      nextCursor: raw?.nextCursor ?? undefined,
    };
  }

  /** Fetch the global home feed (all recent posts). */
  async getHomeFeed(limit = 20, cursor?: string): Promise<{ posts: Post[]; nextCursor?: string }> {
    const raw = await this.request<{ posts: unknown[]; nextCursor?: string | null }>('GET', '/posts/feed', { params: { limit, cursor } });
    return this.mapFeed(raw);
  }

  /** Fetch posts from accounts the authenticated user follows. */
  async getFollowingFeed(limit = 20, cursor?: string): Promise<{ posts: Post[]; nextCursor?: string }> {
    const raw = await this.request<{ posts: unknown[]; nextCursor?: string | null }>('GET', '/posts/following', { params: { limit, cursor } });
    return this.mapFeed(raw);
  }

  /** Fetch posts from a specific user. */
  async getUserFeed(accountId: string, limit = 20, cursor?: string): Promise<{ posts: Post[]; nextCursor?: string }> {
    const raw = await this.request<{ posts: unknown[]; nextCursor?: string | null }>(`GET`, `/posts/user/${accountId}`, { params: { limit, cursor } });
    return this.mapFeed(raw);
  }

  /** Fetch trending posts. */
  async getTrendingPosts(limit = 20, cursor?: string): Promise<{ posts: Post[]; nextCursor?: string }> {
    const raw = await this.request<{ posts: unknown[]; nextCursor?: string | null }>('GET', '/posts/trending', { params: { limit, cursor } });
    return this.mapFeed(raw);
  }

  /** Create a new post. */
  createPost(
    content: string,
    media?: string[],
  ): Promise<{ id: string; content: string; createdAt: string }> {
    return this.request('POST', '/posts', { body: { text: content, media } });
  }

  /** Delete a post authored by the authenticated user. */
  deletePost(postId: string): Promise<{ deleted: boolean }> {
    return this.request('DELETE', `/posts/${postId}`);
  }

  /** Like a post. */
  likePost(postId: string): Promise<void> {
    return this.request('POST', `/posts/${postId}/like`);
  }

  /** Unlike a post. */
  unlikePost(postId: string): Promise<void> {
    return this.request('DELETE', `/posts/${postId}/like`);
  }

  /** Add a comment to a post. */
  addComment(postId: string, text: string): Promise<unknown> {
    return this.request('POST', `/posts/${postId}/comments`, { body: { text } });
  }

  /** Alias for addComment — preferred name used in PostCard. */
  createComment(postId: string, text: string): Promise<unknown> {
    return this.addComment(postId, text);
  }

  /** Delete a comment. */
  deleteComment(
    postId: string,
    commentId: string,
  ): Promise<{ success: boolean }> {
    return this.request('DELETE', `/posts/${postId}/comments/${commentId}`);
  }

  /** Fetch comments for a post. */
  getPostComments(
    postId: string,
    limit = 20,
    cursor?: string,
  ): Promise<unknown> {
    return this.request('GET', `/posts/${postId}/comments`, {
      params: { limit, cursor },
    });
  }

  /** Alias for getPostComments — used in PostCard. */
  getComments(
    postId: string,
    limit = 20,
    cursor?: string,
  ): Promise<unknown> {
    return this.getPostComments(postId, limit, cursor);
  }

  // ─── Social (follow / search) ─────────────────────────────────────────────

  /** Follow a user. */
  followUser(targetAccountId: string): Promise<void> {
    return this.request('POST', '/social/follow', { body: { targetAccountId } });
  }

  /** Unfollow a user. */
  unfollowUser(targetAccountId: string): Promise<void> {
    return this.request('POST', '/social/unfollow', { body: { targetAccountId } });
  }

  /** Search for users by query string. */
  async searchUsers(
    query: string,
    filter?: string,
    limit = 20,
  ): Promise<{ users: unknown[] }> {
    const raw = await this.request<{ users?: unknown[]; results?: unknown[] }>('GET', '/identity/search', {
      params: { q: query, limit },
    });
    return { users: raw?.users ?? raw?.results ?? (Array.isArray(raw) ? raw : []) };
  }

  // ─── Conversations / Messaging ────────────────────────────────────────────

  /** List conversations the authenticated user is a participant of. */
  async getConversations(
    limit = 20,
    cursor?: string,
  ): Promise<{
    conversations: ConversationItem[];
    nextCursor?: string;
    hasMore: boolean;
  }> {
    const raw = await this.request<{
      data?: ConversationItem[];
      conversations?: ConversationItem[];
      nextCursor?: string;
      hasMore: boolean;
    }>('GET', '/conversations', { params: { limit, cursor } });
    return {
      conversations: raw.conversations ?? raw.data ?? [],
      nextCursor: raw.nextCursor,
      hasMore: raw.hasMore,
    };
  }

  /**
   * Fetch messages for a conversation identified by its HCS topic ID.
   * The API returns raw HCS message fields which are normalized here.
   */
  async getConversationMessages(
    topicId: string,
    limit = 50,
    cursor?: string,
  ): Promise<{ messages: ChatMessageResponse[]; hasMore: boolean }> {
    const raw = await this.request<{
      messages: Array<{
        hcsTopicId?: string;
        senderAccountId: string;
        text: string | null;
        sequenceNumber: number;
        consensusTimestamp: string;
        messageType?: string;
        hasMedia?: boolean;
      }>;
      hasMore: boolean;
    }>('GET', `/conversations/${topicId}/messages`, {
      params: { limit, cursor },
    });

    const messages: ChatMessageResponse[] = raw.messages.map((m) => ({
      id: `${m.hcsTopicId ?? topicId}-${m.sequenceNumber}`,
      topicId: m.hcsTopicId ?? topicId,
      senderAccountId: m.senderAccountId,
      text: m.text ?? '',
      encryptedContent: (m as { encryptedContent?: string | null }).encryptedContent ?? null,
      sequenceNumber: m.sequenceNumber,
      consensusTimestamp: m.consensusTimestamp,
      createdAt: m.consensusTimestamp,
      messageType: m.messageType,
    }));

    return { messages, hasMore: raw.hasMore };
  }

  /** Send a message to a conversation. */
  sendMessage(topicId: string, text: string, encryptedContent?: string): Promise<unknown> {
    return this.request('POST', `/conversations/${topicId}/messages`, {
      body: encryptedContent ? { text, encryptedContent } : { text },
    });
  }

  /** Create a new direct or group conversation. */
  createConversation(
    type: 'direct' | 'group',
    participants: string[],
    groupName?: string,
  ): Promise<unknown> {
    return this.request('POST', '/conversations', {
      body: { type, participantAccountIds: participants, groupName },
    });
  }

  /** Leave a conversation. */
  leaveConversation(conversationId: string): Promise<unknown> {
    return this.request('POST', `/conversations/${conversationId}/leave`);
  }

  // ─── Payments ─────────────────────────────────────────────────────────────

  /** Get the authenticated user's balance from Hedera (HBAR + TMUSD). */
  getBalance(): Promise<{
    accountId: string;
    hbarBalance: number;
    tmUsdBalance: number;
    timestamp: string;
  }> {
    return this.request('GET', '/payments/balance');
  }

  /** Send an HBAR payment to another account. */
  sendPayment(params: {
    recipientAccountId: string;
    amount: number;
    currency: string;
    note?: string;
    conversationTopicId?: string;
  }): Promise<unknown> {
    const { conversationTopicId, ...rest } = params;
    const body: Record<string, unknown> = { ...rest };
    if (conversationTopicId) body.topicId = conversationTopicId;
    return this.request('POST', '/payments/send', { body });
  }

  /**
   * Send payment — extended signature used by the payment store.
   * Includes the conversation topic ID for HCS recording.
   */
  sendPaymentFull(
    conversationTopicId: string,
    recipientAccountId: string,
    amount: number,
    currency: string,
    note?: string,
  ): Promise<unknown> {
    return this.sendPayment({
      recipientAccountId,
      amount,
      currency,
      note,
      conversationTopicId,
    });
  }

  /** Create a payment request (asking another user to pay). */
  requestPayment(params: {
    payerAccountId: string;
    amount: number;
    currency: string;
    note?: string;
    conversationTopicId?: string;
  }): Promise<unknown> {
    return this.request('POST', '/payments/request', { body: params });
  }

  /**
   * Request payment — extended signature used by the payment store.
   */
  requestPaymentFull(
    conversationTopicId: string,
    amount: number,
    currency: string,
    description?: string,
  ): Promise<unknown> {
    return this.request('POST', '/payments/request', {
      body: { topicId: conversationTopicId || undefined, amount, currency, description },
    });
  }

  /** Fulfill (pay) an existing payment request. */
  fulfillPaymentRequest(requestId: string, topicId?: string): Promise<unknown> {
    return this.request('POST', `/payments/requests/${requestId}/fulfill`, {
      body: topicId ? { topicId } : undefined,
    });
  }

  /** Decline a payment request. */
  declinePaymentRequest(requestId: string, reason?: string): Promise<unknown> {
    return this.request('POST', `/payments/requests/${requestId}/decline`, {
      body: reason ? { reason } : undefined,
    });
  }

  /** Get a single payment request by ID. */
  getPaymentRequest(requestId: string): Promise<unknown> {
    return this.request('GET', `/payments/requests/${requestId}`);
  }

  /** List payment requests, optionally filtered by conversation. */
  getPaymentRequests(params?: {
    conversationId?: string;
    status?: string;
    cursor?: string;
  }): Promise<unknown> {
    return this.request('GET', '/payments/requests', { params });
  }

  /**
   * Get paginated payment history. Returns the raw API envelope so callers
   * can unwrap the ApiEnvelope<T>.
   */
  getPaymentHistory(params?: {
    direction?: string;
    status?: string;
    cursor?: string;
    search?: string;
    from?: string;
    to?: string;
  }): Promise<unknown> {
    return this.request('GET', '/payments/history', { params });
  }

  /**
   * getPaymentHistoryFull — used by payment.store to fetch history with
   * limit and cursor positional arguments.
   */
  getPaymentHistoryFull(limit = 20, cursor?: string): Promise<unknown> {
    return this.request('GET', '/payments/history', {
      params: { limit, cursor },
    });
  }

  /**
   * Query transactions with rich filter parameters.
   */
  queryTransactions(params?: {
    direction?: string;
    status?: string;
    from?: string;
    to?: string;
    search?: string;
    cursor?: string;
    limit?: number;
  }): Promise<unknown> {
    return this.request('GET', '/payments/transactions', { params });
  }

  /** Create a split-payment request across conversation participants. */
  splitPayment(params: {
    conversationTopicId: string;
    amount: number;
    currency: string;
    note?: string;
  }): Promise<unknown> {
    return this.request('POST', '/payments/split', { body: params });
  }

  /**
   * createSplitPayment — extended signature used by payment.store.
   */
  createSplitPayment(
    conversationTopicId: string,
    totalAmount: number,
    currency: string,
    splitMethod: 'equal' | 'custom',
    participantAccountIds: string[],
    note?: string,
    customAmounts?: Record<string, number>,
  ): Promise<unknown> {
    return this.request('POST', '/payments/split', {
      body: {
        topicId: conversationTopicId || undefined,
        totalAmount,
        currency,
        splitMethod,
        participantAccountIds,
        note,
        customAmounts,
      },
    });
  }

  // ─── Notifications ────────────────────────────────────────────────────────

  /** Fetch notifications with optional category filter. */
  getNotifications(
    limit = 50,
    cursor?: string,
    category?: string,
  ): Promise<{
    notifications: Array<{
      id: string;
      category: string;
      type: string;
      message: string;
      read: boolean;
      createdAt: string;
      data?: Record<string, unknown>;
    }>;
    totalCount: number;
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    return this.request('GET', '/notifications', {
      params: { limit, cursor, category },
    });
  }

  /** Mark a single notification as read. */
  markNotificationRead(notificationId: string): Promise<void> {
    return this.request('PUT', `/notifications/${notificationId}/read`);
  }

  /** Mark all notifications as read. */
  markAllNotificationsAsRead(): Promise<void> {
    return this.request('PUT', '/notifications/read-all');
  }

  /**
   * Mark all notifications read — alias kept for compat with notification.store.
   */
  markAllNotificationsRead(): Promise<void> {
    return this.markAllNotificationsAsRead();
  }

  /**
   * Bulk-mark a list of notification IDs as read.
   * Used by notification.store which batches multiple IDs.
   */
  markNotificationsAsRead(notificationIds: string[]): Promise<void> {
    return this.request('POST', '/notifications/read', {
      body: { notificationIds },
    });
  }

  /** Get the current unread notification count. */
  getUnreadCount(): Promise<{ count: number }> {
    return this.request('GET', '/notifications/unread-count');
  }

  // ─── Organizations ────────────────────────────────────────────────────────

  /**
   * Get the organization the authenticated user belongs to (or owns).
   * Returns null when the backend responds with 404.
   */
  async getMyOrganization(): Promise<OrgData | null> {
    try {
      return await this.request<OrgData>('GET', '/organizations/me');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  /** Create a new organization. */
  createOrganization(name: string): Promise<unknown> {
    return this.request('POST', '/organizations', { body: { name } });
  }

  /** Update organization profile fields. */
  updateOrganization(data: {
    name?: string;
    bio?: string;
    category?: string;
    website?: string;
  }): Promise<unknown> {
    return this.request('PUT', '/organizations/me', { body: data });
  }

  /** Get members of the authenticated user's organization. */
  getOrgMembers(): Promise<unknown> {
    return this.request('GET', '/organizations/me/members');
  }

  /** Invite a member to the organization by email. */
  inviteMember(email: string, role: string): Promise<unknown> {
    return this.request('POST', '/organizations/me/invitations', {
      body: { email, role },
    });
  }

  /** Change a member's role within the organization. */
  changeRole(userId: string, role: string): Promise<unknown> {
    return this.request('PATCH', `/organizations/me/members/${userId}`, {
      body: { role },
    });
  }

  /** Remove a member from the organization. */
  removeMember(userId: string): Promise<unknown> {
    return this.request('DELETE', `/organizations/me/members/${userId}`);
  }

  /** Accept an organization invitation by token. */
  acceptInvitation(token: string): Promise<unknown> {
    return this.request('POST', '/organizations/invitations/accept', {
      body: { token },
    });
  }

  /** List pending invitations for the authenticated user's organization. */
  getOrgInvitations(): Promise<unknown> {
    return this.request('GET', '/organizations/me/invitations');
  }

  /** Transfer organization ownership to another member. */
  transferOwnership(newOwnerUserId: string): Promise<unknown> {
    return this.request('POST', '/organizations/me/transfer-ownership', {
      body: { newOwnerUserId },
    });
  }

  // ─── Broadcasts ───────────────────────────────────────────────────────────

  /**
   * Fetch the broadcast feed. Maps the raw API response to BroadcastMessage[].
   */
  async getBroadcastFeed(
    limit = 20,
    cursor?: string,
  ): Promise<{ messages: BroadcastMessage[]; nextCursor?: string; hasMore: boolean }> {
    const raw = await this.request<{
      broadcasts: Array<{
        id: string;
        organizationId: string;
        author: {
          accountId: string;
          organizationName: string;
          badgeTier?: string;
        };
        text: string;
        hcsTopicId: string;
        sequenceNumber: number;
        createdAt: string;
      }>;
      nextCursor?: string;
      hasMore: boolean;
    }>('GET', '/broadcasts/feed/subscribed', { params: { limit, cursor } });

    const messages: BroadcastMessage[] = raw.broadcasts.map((b) => ({
      id: b.id,
      organizationId: b.organizationId,
      orgName: b.author.organizationName,
      content: b.text,
      hcsTopicId: b.hcsTopicId,
      sequenceNumber: b.sequenceNumber,
      createdAt: b.createdAt,
    }));

    return { messages, nextCursor: raw.nextCursor, hasMore: raw.hasMore };
  }

  /** Subscribe to an organization's broadcast channel. */
  subscribeToBroadcast(orgId: string): Promise<unknown> {
    return this.request('POST', `/broadcasts/${orgId}/subscribe`);
  }

  /** Unsubscribe from an organization's broadcast channel. */
  unsubscribeFromBroadcast(orgId: string): Promise<void> {
    return this.request('DELETE', `/broadcasts/${orgId}/subscribe`);
  }

  /** Publish a broadcast message as the authenticated organization. */
  publishBroadcast(orgId: string, content: string): Promise<unknown> {
    return this.request('POST', `/broadcasts/${orgId}`, {
      body: { text: content },
    });
  }

  // ─── KYC / Identity ──────────────────────────────────────────────────────

  /** Submit KYC data (generic, accepts any payload). */
  submitKyc(data: unknown): Promise<unknown> {
    return this.request('POST', '/identity/kyc/submit', { body: data });
  }

  /**
   * Submit individual KYC data to the Mirsad AI screening endpoint.
   * Returns the requestId (screeningId) for status polling.
   */
  submitIndividualKyc(data: {
    fullLegalName: string;
    dateOfBirth: string;
    nationality: string;
    countryOfResidence: string;
    countryOfBirth: string;
    cityOfBirth: string;
    currentResidentialAddress: string;
    nationalIdNumber: string;
    gender?: string;
    passportNumber?: string;
    occupation?: string;
  }): Promise<{ requestId: string; submittedAt: string; userId: string }> {
    return this.request('POST', '/identity/kyc/individual', { body: { ...data, accountType: 'individual' } });
  }

  /**
   * Submit corporate KYB data to the Mirsad AI screening endpoint.
   */
  submitCorporateKyc(data: {
    legalEntityName: string;
    countryOfIncorporation: string;
    businessRegistrationNumber: string;
    businessAddress: string;
    primaryActivityDescription?: string;
  }): Promise<{ requestId: string; submittedAt: string; userId: string }> {
    return this.request('POST', '/identity/kyc/corporate', { body: { ...data, accountType: 'business' } });
  }

  /** Poll the status of a KYC/KYB screening. */
  getKycStatus(screeningId?: string): Promise<{
    status: 'submitted' | 'pending_review' | 'approved' | 'active' | 'rejected';
    kycLevel: string | null;
  }> {
    const path = screeningId
      ? `/identity/kyc/status/${screeningId}`
      : '/identity/kyc/status';
    return this.request('GET', path);
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const api = new ApiClient();
