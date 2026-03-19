import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MirrorNodeRequestException } from "./exceptions/hedera.exceptions";

interface MirrorNodeTopicMessage {
  consensus_timestamp: string;
  topic_id: string;
  message: string;
  sequence_number: number;
  running_hash: string;
  payer_account_id: string;
}

interface MirrorNodeTopicMessagesResponse {
  messages: MirrorNodeTopicMessage[];
  links?: { next?: string };
}

interface MirrorNodeAccountInfo {
  account: string;
  balance: { balance: number; timestamp: string };
  [key: string]: unknown;
}

interface MirrorNodeTokenBalancesResponse {
  balances: Array<{
    account: string;
    balance: number;
  }>;
}

interface MirrorNodeNftInfo {
  token_id: string;
  serial_number: number;
  account_id: string;
  metadata: string;
  [key: string]: unknown;
}

@Injectable()
export class MirrorNodeService {
  private readonly logger = new Logger(MirrorNodeService.name);
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    const raw = this.configService.get<string>("hedera.mirrorNodeUrl") ?? "";
    // Ensure base URL includes the /api/v1 path prefix
    this.baseUrl = raw.endsWith("/api/v1")
      ? raw
      : `${raw.replace(/\/+$/, "")}/api/v1`;
    this.logger.log(
      `Mirror Node service initialized with base URL: ${this.baseUrl}`,
    );
  }

  /**
   * Get messages from an HCS topic
   */
  async getTopicMessages(
    topicId: string,
    options?: {
      limit?: number;
      sequenceNumberLt?: number;
      sequenceNumberGt?: number;
    },
  ): Promise<MirrorNodeTopicMessage[]> {
    const params = new URLSearchParams();
    if (options?.limit) {
      params.append("limit", options.limit.toString());
    }
    if (options?.sequenceNumberLt) {
      params.append(
        "sequencenumber",
        `lte:${options.sequenceNumberLt.toString()}`,
      );
    }
    if (options?.sequenceNumberGt) {
      params.append(
        "sequencenumber",
        `gt:${options.sequenceNumberGt.toString()}`,
      );
    }

    const queryString = params.toString();
    const url = `${this.baseUrl}/topics/${topicId}/messages${queryString ? `?${queryString}` : ""}`;

    const response = await fetch(url);
    if (!response.ok) {
      this.logger.error(
        `Mirror Node request failed: ${response.status} ${response.statusText} for ${url}`,
      );
      throw new MirrorNodeRequestException(
        `Mirror Node request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as MirrorNodeTopicMessagesResponse;
    return data.messages || [];
  }

  /**
   * Get account information
   */
  async getAccountInfo(accountId: string): Promise<MirrorNodeAccountInfo> {
    const url = `${this.baseUrl}/accounts/${accountId}`;
    const response = await fetch(url);
    if (!response.ok) {
      this.logger.error(
        `Mirror Node request failed: ${response.status} ${response.statusText} for ${url}`,
      );
      throw new MirrorNodeRequestException(
        `Mirror Node request failed: ${response.status} ${response.statusText}`,
      );
    }
    return (await response.json()) as MirrorNodeAccountInfo;
  }

  /**
   * Get the balance of a specific HTS token for an account.
   * Returns the balance in smallest token units (divide by 10^decimals for display).
   * Returns 0 if the account has no association or zero balance.
   */
  async getTokenBalance(accountId: string, tokenId: string): Promise<number> {
    const url = `${this.baseUrl}/tokens/${encodeURIComponent(tokenId)}/balances?account.id=${encodeURIComponent(accountId)}`;
    const response = await fetch(url);
    if (!response.ok) {
      this.logger.warn(
        `Mirror Node token balance request failed: ${response.status} for ${url}`,
      );
      return 0;
    }
    const data = (await response.json()) as MirrorNodeTokenBalancesResponse;
    return data.balances?.[0]?.balance ?? 0;
  }

  /**
   * Get NFT information
   */
  async getNftInfo(
    tokenId: string,
    serial: number,
  ): Promise<MirrorNodeNftInfo> {
    const url = `${this.baseUrl}/tokens/${tokenId}/nfts/${serial}`;
    const response = await fetch(url);
    if (!response.ok) {
      this.logger.error(
        `Mirror Node request failed: ${response.status} ${response.statusText} for ${url}`,
      );
      throw new MirrorNodeRequestException(
        `Mirror Node request failed: ${response.status} ${response.statusText}`,
      );
    }
    return (await response.json()) as MirrorNodeNftInfo;
  }
}
