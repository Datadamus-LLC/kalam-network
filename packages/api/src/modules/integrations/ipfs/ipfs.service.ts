import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  IpfsNotConfiguredException,
  IpfsUploadFailedException,
} from "./ipfs.exceptions";

/**
 * Response shape from the Pinata pin API.
 */
interface PinataPinResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}

/**
 * IPFS service using Pinata for file and JSON pinning.
 *
 * If PINATA_API_KEY and PINATA_SECRET_KEY are not set, the service
 * logs a warning and throws IpfsNotConfiguredException on any upload attempt.
 * Content fetching via the gateway still works without credentials.
 */
@Injectable()
export class IpfsService implements OnModuleInit {
  private readonly logger = new Logger(IpfsService.name);
  private apiKey: string | undefined;
  private secretKey: string | undefined;
  private gatewayUrl: string;
  private configured = false;

  private readonly pinFileUrl: string;
  private readonly pinJsonUrl: string;

  constructor(private readonly configService: ConfigService) {
    const apiBase = this.configService.get<string>("pinata.apiBaseUrl", "");
    this.pinFileUrl = `${apiBase}/pinning/pinFileToIPFS`;
    this.pinJsonUrl = `${apiBase}/pinning/pinJSONToIPFS`;
    this.gatewayUrl = this.configService.get<string>("pinata.gatewayUrl", "");
  }

  onModuleInit(): void {
    this.apiKey = this.configService.get<string>("pinata.apiKey");
    this.secretKey = this.configService.get<string>("pinata.secretKey");

    if (this.apiKey && this.secretKey) {
      this.configured = true;
      this.logger.log("IPFS (Pinata) service initialized with credentials");
    } else {
      this.logger.warn(
        "IPFS (Pinata) credentials not configured. " +
          "Media uploads will be unavailable. " +
          "Set PINATA_API_KEY and PINATA_SECRET_KEY to enable.",
      );
    }
  }

  /**
   * Check whether IPFS is available (credentials configured).
   */
  isConfigured(): boolean {
    return this.configured;
  }

  /**
   * Ensure credentials are available before making API calls.
   */
  private ensureConfigured(): void {
    if (!this.configured) {
      throw new IpfsNotConfiguredException();
    }
  }

  /**
   * Upload a file buffer to IPFS via Pinata.
   *
   * @param buffer   The file content
   * @param filename The filename to associate with the upload
   * @returns The IPFS CID (content identifier)
   */
  async uploadFile(buffer: Buffer, filename: string): Promise<string> {
    this.ensureConfigured();

    try {
      const blob = new Blob([buffer]);
      const formData = new FormData();
      formData.append("file", blob, filename);

      const metadataJson = JSON.stringify({
        name: filename,
        keyvalues: {
          platform: "hedera-social",
          uploadedAt: new Date().toISOString(),
        },
      });
      formData.append("pinataMetadata", metadataJson);

      const apiKey = this.apiKey!;
      const secretKey = this.secretKey!;

      const response = await fetch(this.pinFileUrl, {
        method: "POST",
        headers: {
          pinata_api_key: apiKey,
          pinata_secret_api_key: secretKey,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new IpfsUploadFailedException(
          `Pinata API returned ${response.status}: ${errorText}`,
        );
      }

      const data = (await response.json()) as PinataPinResponse;
      this.logger.log(`File uploaded to IPFS: ${data.IpfsHash} (${filename})`);
      return data.IpfsHash;
    } catch (error: unknown) {
      if (error instanceof IpfsUploadFailedException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`IPFS file upload failed: ${message}`);
      throw new IpfsUploadFailedException(message);
    }
  }

  /**
   * Upload a JSON object to IPFS via Pinata.
   *
   * @param data The JSON data to pin
   * @param name Optional name for the pin
   * @returns The IPFS CID
   */
  async uploadJson(
    data: Record<string, unknown>,
    name?: string,
  ): Promise<string> {
    this.ensureConfigured();

    try {
      const payload = {
        pinataContent: data,
        pinataMetadata: {
          name: name ?? "hedera-social-json",
          keyvalues: {
            platform: "hedera-social",
            uploadedAt: new Date().toISOString(),
          },
        },
      };

      const apiKey = this.apiKey!;
      const secretKey = this.secretKey!;

      const response = await fetch(this.pinJsonUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          pinata_api_key: apiKey,
          pinata_secret_api_key: secretKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new IpfsUploadFailedException(
          `Pinata API returned ${response.status}: ${errorText}`,
        );
      }

      const result = (await response.json()) as PinataPinResponse;
      this.logger.log(`JSON uploaded to IPFS: ${result.IpfsHash}`);
      return result.IpfsHash;
    } catch (error: unknown) {
      if (error instanceof IpfsUploadFailedException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`IPFS JSON upload failed: ${message}`);
      throw new IpfsUploadFailedException(message);
    }
  }

  /**
   * Build a gateway URL for a given CID.
   */
  getGatewayUrl(cid: string): string {
    return `${this.gatewayUrl}/${cid}`;
  }

  /**
   * Retrieve content from IPFS via the configured gateway.
   */
  async getContent(cid: string): Promise<Buffer> {
    const url = this.getGatewayUrl(cid);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new IpfsUploadFailedException(
          `IPFS fetch failed: ${response.status} ${response.statusText} for CID: ${cid}`,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error: unknown) {
      if (error instanceof IpfsUploadFailedException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`IPFS content fetch failed for ${cid}: ${message}`);
      throw new IpfsUploadFailedException(
        `Failed to fetch content for CID ${cid}: ${message}`,
      );
    }
  }
}
