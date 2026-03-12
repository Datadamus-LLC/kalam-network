/**
 * API Client for Hedera Social Platform
 * Handles all HTTP communication with the backend
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Build a complete URL with query parameters
   */
  private buildUrl(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }
    return url.toString();
  }

  /**
   * Get JWT token from localStorage
   */
  private getAuthToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('auth_token');
  }

  /**
   * Make an HTTP request with automatic JWT injection
   */
  private async request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const { params, ...fetchOptions } = options;
    const url = this.buildUrl(path, params);
    const token = this.getAuthToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...fetchOptions,
      method,
      headers,
    });

    if (!response.ok) {
      throw new ApiError(
        `API error: ${response.status} ${response.statusText}`,
        response.status,
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // Auth endpoints
  async register(email: string) {
    return this.request<{
      registrationId: string;
      otpSent: boolean;
      expiresAt: string;
    }>('POST', '/auth/register', {
      body: JSON.stringify({ method: 'email', value: email }),
    });
  }

  async verifyOtp(registrationId: string, otp: string) {
    return this.request<{
      token: string;
      user: { id: string; hederaAccountId: string; status: string };
    }>('POST', '/auth/verify-otp', {
      body: JSON.stringify({ registrationId, otp }),
    });
  }

  async submitKyc(accountType: 'individual' | 'business', data: FormData) {
    const token = this.getAuthToken();
    const headers: Record<string, string> = {};

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = this.buildUrl('/auth/kyc');
    data.append('accountType', accountType);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: data,
    });

    if (!response.ok) {
      throw new ApiError(
        `KYC submission failed: ${response.statusText}`,
        response.status,
      );
    }

    return response.json() as Promise<{ status: string; kycId: string }>;
  }

  async getKycStatus() {
    return this.request<{
      status: 'submitted' | 'approved' | 'rejected' | 'pending_review';
      kycLevel: string;
      didNftSerial: number;
      didNftMetadataCid: string;
    }>('GET', '/auth/kyc-status');
  }

  // Profile endpoints
  async getProfile(accountId: string) {
    return this.request<{
      id: string;
      displayName: string;
      bio: string;
      avatar: string;
      hederaAccountId: string;
    }>('GET', `/profile/${accountId}`);
  }

  async updateProfile(data: {
    displayName?: string;
    bio?: string;
    avatar?: string;
  }) {
    return this.request<{
      id: string;
      displayName: string;
      bio: string;
      avatar: string;
    }>('PUT', '/profile/me', {
      body: JSON.stringify(data),
    });
  }

  // Messaging endpoints
  async createConversation(
    type: 'direct' | 'group',
    participants: string[],
    groupName?: string,
  ) {
    return this.request<{
      id: string;
      hcsTopicId: string;
      type: string;
    }>('POST', '/conversations', {
      body: JSON.stringify({
        type,
        participants,
        groupName,
      }),
    });
  }

  async getConversations(limit = 20, cursor?: string) {
    return this.request<{
      conversations: Array<{
        id: string;
        hcsTopicId: string;
        type: string;
        participants: Array<{ accountId: string; displayName?: string }>;
        lastMessage?: string;
        unreadCount: number;
      }>;
      nextCursor?: string;
    }>('GET', '/conversations', {
      params: { limit, cursor },
    });
  }

  async getConversationMessages(topicId: string, limit = 50, before?: number) {
    return this.request<{
      messages: Array<{
        id: string;
        topicId: string;
        senderAccountId: string;
        encryptedPayload: string;
        nonce: string;
        timestamp: string;
      }>;
      hasMore: boolean;
    }>('GET', `/conversations/${topicId}/messages`, {
      params: { limit, before },
    });
  }

  async sendMessage(topicId: string, encryptedPayload: string, nonce: string) {
    return this.request<{
      sequenceNumber: number;
      timestamp: string;
    }>('POST', `/conversations/${topicId}/messages`, {
      body: JSON.stringify({ encryptedPayload, nonce }),
    });
  }

  async addConversationMember(topicId: string, accountId: string) {
    return this.request<{ success: boolean }>('POST', `/conversations/${topicId}/members`, {
      body: JSON.stringify({ accountId }),
    });
  }

  // Social endpoints
  async createPost(content: string, media?: string[]) {
    return this.request<{
      id: string;
      content: string;
      createdAt: string;
    }>('POST', '/social/posts', {
      body: JSON.stringify({ content, media }),
    });
  }

  async getHomeFeed(limit = 20, cursor?: string) {
    return this.request<{
      posts: Array<{
        id: string;
        authorAccountId: string;
        content: string;
        createdAt: string;
        likes?: number;
        replies?: number;
        media?: string[];
      }>;
      nextCursor?: string;
    }>('GET', '/social/feed', {
      params: { limit, cursor },
    });
  }

  async getUserFeed(accountId: string, limit = 20, cursor?: string) {
    return this.request<{
      posts: Array<{
        id: string;
        authorAccountId: string;
        content: string;
        createdAt: string;
        likes?: number;
        replies?: number;
        media?: string[];
      }>;
      nextCursor?: string;
    }>('GET', `/social/feed/${accountId}`, {
      params: { limit, cursor },
    });
  }

  async followUser(accountId: string) {
    return this.request<{ success: boolean }>('POST', '/social/follows', {
      body: JSON.stringify({ accountId }),
    });
  }

  async unfollowUser(accountId: string) {
    return this.request<{ success: boolean }>('DELETE', `/social/follows/${accountId}`);
  }

  // Payments endpoints
  async sendPayment(topicId: string, recipientId: string, amount: number) {
    return this.request<{
      transactionId: string;
      status: string;
    }>('POST', `/conversations/${topicId}/payments`, {
      body: JSON.stringify({ recipientId, amount }),
    });
  }

  async requestPayment(topicId: string, amount: number, note?: string) {
    return this.request<{
      requestId: string;
      status: string;
    }>('POST', `/conversations/${topicId}/payment-requests`, {
      body: JSON.stringify({ amount, note }),
    });
  }

  async getPaymentHistory(limit = 50, cursor?: string) {
    return this.request<{
      payments: Array<{
        id: string;
        amount: number;
        senderId: string;
        recipientId: string;
        status: string;
        timestamp: string;
      }>;
      nextCursor?: string;
    }>('GET', '/payments/history', {
      params: { limit, cursor },
    });
  }

  // Notifications endpoints
  async getNotifications(limit = 50, cursor?: string) {
    return this.request<{
      notifications: Array<{
        id: string;
        type: string;
        message: string;
        read: boolean;
        createdAt: string;
      }>;
      nextCursor?: string;
    }>('GET', '/notifications', {
      params: { limit, cursor },
    });
  }

  async markNotificationAsRead(notificationId: string) {
    return this.request<{ success: boolean }>('PUT', `/notifications/${notificationId}`, {
      body: JSON.stringify({ read: true }),
    });
  }
}

export const api = new ApiClient();
export { ApiError };
