import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
    const network = this.configService.get<string>('hedera.network');
    if (network === 'mainnet') {
      this.baseUrl = 'https://mainnet-public.mirrornode.hedera.com/api/v1';
    } else {
      this.baseUrl = 'https://testnet.mirrornode.hedera.com/api/v1';
    }
    this.logger.log(`Mirror Node service initialized with base URL: ${this.baseUrl}`);
  }

  /**
   * Get messages from an HCS topic
   */
  async getTopicMessages(
    topicId: string,
    options?: { limit?: number; sequenceNumberLt?: number },
  ): Promise<MirrorNodeTopicMessage[]> {
    const params = new URLSearchParams();
    if (options?.limit) {
      params.append('limit', options.limit.toString());
    }
    if (options?.sequenceNumberLt) {
      params.append(
        'sequencenumber',
        `lte:${options.sequenceNumberLt.toString()}`,
      );
    }

    const queryString = params.toString();
    const url = `${this.baseUrl}/topics/${topicId}/messages${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url);
    if (!response.ok) {
      this.logger.error(
        `Mirror Node request failed: ${response.status} ${response.statusText} for ${url}`,
      );
      throw new Error(
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
      throw new Error(
        `Mirror Node request failed: ${response.status} ${response.statusText}`,
      );
    }
    return (await response.json()) as MirrorNodeAccountInfo;
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
      throw new Error(
        `Mirror Node request failed: ${response.status} ${response.statusText}`,
      );
    }
    return (await response.json()) as MirrorNodeNftInfo;
  }
}
