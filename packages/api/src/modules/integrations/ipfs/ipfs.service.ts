import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class IpfsService {
  private readonly logger = new Logger(IpfsService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Upload a file buffer to IPFS via Pinata
   */
  async uploadFile(buffer: Buffer, filename: string): Promise<string> {
    // TODO: implement Pinata file upload
    this.logger.log(`IPFS file upload placeholder — filename: ${filename}`);
    return '';
  }

  /**
   * Upload a JSON object to IPFS via Pinata
   */
  async uploadJson(data: Record<string, unknown>): Promise<string> {
    // TODO: implement Pinata JSON upload
    this.logger.log('IPFS JSON upload placeholder');
    return '';
  }

  /**
   * Retrieve content from IPFS via the configured gateway
   */
  async getContent(cid: string): Promise<Buffer> {
    const gatewayUrl = this.configService.get<string>('pinata.gatewayUrl');
    const url = `${gatewayUrl}/${cid}`;

    const response = await fetch(url);
    if (!response.ok) {
      this.logger.error(`IPFS fetch failed: ${response.status} for CID: ${cid}`);
      throw new Error(`IPFS fetch failed: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
