# External Integrations Reference

This file documents integration interfaces for external services. Each service has a clear documentation status indicating whether the integration can proceed with implementation or is blocked pending documentation.

## Documentation Status Legend

- **VERIFIED**: Integration has been tested against real API documentation. Safe to implement.
- **UNVERIFIED**: Integration interface is our assumption based on service description. Needs user confirmation before real implementation.
- **BLOCKED**: Missing critical API documentation. Placeholder interface only, will throw `NotImplementedError` at runtime.

---

## Critical Rule: Implementation Under Documentation Status

**IF BLOCKED or UNVERIFIED:**

1. DO define the TypeScript interface representing what we WANT the API to look like
2. DO create the service class with proper method signatures
3. DO throw `NotImplementedError` in every method body with a clear message
4. DO include a comment block: `// BLOCKED: Awaiting [Service] API documentation`
5. DO list specific questions for the user about the API contract

**WHEN USER PROVIDES DOCUMENTATION:**

1. Verify the interface matches the actual API specification
2. Adjust the interface if the real API differs from our assumptions
3. Implement the real API integration (remove `NotImplementedError`)
4. Update the documentation status comment in this file
5. Add example usage from the real API documentation

---

## Tamam MPC Custody Service

**Status**: VERIFIED — Integration based on official Tamam MPC Custody API documentation

Tamam MPC Custody is a FROST-based multi-party computation (MPC) service that manages ECDSA private keys across 9 threshold nodes. The platform uses it to:
- Create MPC vaults and generate Ed25519 keys for users (key shards distributed across 9 nodes)
- Auto-create Hedera accounts during key generation (`createHederaAccount: true`)
- Sign Hedera transactions (payments, NFT minting, HCS topic creation) via MPC protocol
- Support policy-based approval workflows for transaction signing

**Complete Reference**: See `custody-integration.md` for full service documentation (~1,826 lines).

### Verified Interface

The Tamam MPC Custody service is now VERIFIED with complete integration documentation. Implementation can proceed with confidence using the specifications in `custody-integration.md`.

Key endpoints:
- `POST /api/vaults` — Create a new MPC vault for a user
- `POST /api/vaults/{vaultId}/keys` — Generate key with optional `createHederaAccount: true`
- `POST /api/transactions` — Submit transaction for MPC signing
- `GET /api/transactions/{txId}` — Poll transaction signing status
- `GET /api/vaults/{vaultId}/keys` — List keys in a vault

Authentication: API key in `X-API-Key` header.

Transaction signing is **asynchronous** with status flow: `PENDING_POLICY → PENDING_APPROVAL → APPROVED → SIGNING → COMPLETED`

### Architecture Note: Payments

In-chat payments use standard Hedera `CryptoTransferTransaction` signed through Tamam MPC Custody. There is no separate "payment rails" service — the platform constructs the Hedera transaction directly and submits it for MPC signing. This simplifies the architecture and gives us full control over the payment flow.

---

## Mirsad AI KYC/AML Service

**Status**: VERIFIED — Integration based on official API documentation (hosted at olara.ai)

Mirsad AI provides KYC (Know Your Customer) / AML (Anti-Money Laundering) verification and transaction risk scoring. The platform uses it to:
- Verify user identity before DID NFT issuance (both individual and corporate)
- Support business account onboarding (KYB)
- Maintain regulatory compliance with sanction screening and AML risk assessment
- Score transactions in real-time for money laundering risk
- Support blockchain-native verification (explicitly supports HEDERA)

**Complete Reference**: See `mirsad-ai-integration.md` for full service documentation.

### Verified Interface

The Mirsad AI KYC/AML service is now VERIFIED with complete integration documentation. Implementation can proceed with confidence using the specifications in `mirsad-ai-integration.md`.

Key endpoints:
- `POST /api/v1/public/onboarding` — Individual/Corporate KYC submission
- `POST /api/v1/public/transaction-scoring` — AML transaction risk scoring
- `GET /api/v1/private/ai/decision/{request_id}` — Detailed AI reasoning (private endpoint, auth TBD)

Both public endpoints are callback-based (async) and require no authentication.

---

## Pinata IPFS Service

**Status**: PARTIALLY VERIFIED — Using public Pinata API documentation

Pinata is an IPFS hosting service. The platform uses it to:
- Store DID NFT metadata (HIP-412 JSON)
- Host user profile images and assets
- Provide IPFS gateway URLs for decentralized content delivery

### Verified Interface

```typescript
/**
 * VERIFIED: This interface is based on Pinata's public API documentation
 * at https://docs.pinata.cloud/
 *
 * Implementation uses Pinata's official SDK (@pinata/sdk)
 */

interface IPinataService {
  /**
   * Pin a JSON object to IPFS and return its content hash (CID).
   * Pinata stores the content and serves it via gateway.
   *
   * @param name - Descriptive name for the pin (e.g., 'did-metadata-user-0.0.12345')
   * @param data - JSON object to pin
   * @param metadata - Optional custom metadata to attach to the pin
   */
  pinJSON(
    name: string,
    data: Record<string, any>,
    metadata?: Record<string, any>,
  ): Promise<{
    cid: string;                      // IPFS content hash (v0 or v1)
    ipfsHash: string;                 // Alias for cid
  }>;

  /**
   * Pin a file to IPFS.
   *
   * @param name - Descriptive name for the pin
   * @param buffer - File contents as Buffer
   * @param mimeType - Content type (e.g., 'image/png')
   */
  pinFile(
    name: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{
    cid: string;
    ipfsHash: string;
  }>;

  /**
   * Get a gateway URL for an IPFS CID.
   * URL can be used in browsers or as direct links.
   *
   * @param cid - IPFS content hash
   * @param gateway - Gateway provider ('pinata' | 'cloudflare' | 'ipfs-io')
   */
  getGatewayUrl(
    cid: string,
    gateway?: 'pinata' | 'cloudflare' | 'ipfs-io',
  ): string;

  /**
   * Optional: Unpin content from Pinata.
   * Useful for removing old/outdated data.
   *
   * @param cid - IPFS content hash to unpin
   */
  unpin(cid: string): Promise<void>;

  /**
   * List all pinned content.
   *
   * @param limit - Max results per page
   * @param offset - Pagination offset
   */
  listPins(limit?: number, offset?: number): Promise<
    Array<{
      cid: string;
      name: string;
      size: number;
      dateAdded: string;
      metadata?: Record<string, any>;
    }>
  >;
}
```

### Service Implementation

```typescript
import { Injectable } from '@nestjs/common';
import { PinataSDK } from '@pinata/sdk';

@Injectable()
export class PinataService implements IPinataService {
  private pinata: PinataSDK;

  constructor() {
    this.pinata = new PinataSDK({
      pinataApiKey: process.env.PINATA_API_KEY,
      pinataSecretApiKey: process.env.PINATA_SECRET_API_KEY,
    });
  }

  async pinJSON(
    name: string,
    data: Record<string, any>,
    metadata?: Record<string, any>,
  ): Promise<{ cid: string; ipfsHash: string }> {
    const options = {
      pinataMetadata: {
        name,
        ...(metadata && { keyvalues: metadata }),
      },
    };

    const result = await this.pinata.pinJSONToIPFS(data, options);

    return {
      cid: result.IpfsHash,
      ipfsHash: result.IpfsHash,
    };
  }

  async pinFile(
    name: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ cid: string; ipfsHash: string }> {
    const blob = new Blob([buffer], { type: mimeType });
    const file = new File([blob], name, { type: mimeType });

    const options = {
      pinataMetadata: {
        name,
      },
    };

    const result = await this.pinata.pinFileToIPFS(file, options);

    return {
      cid: result.IpfsHash,
      ipfsHash: result.IpfsHash,
    };
  }

  getGatewayUrl(
    cid: string,
    gateway: 'pinata' | 'cloudflare' | 'ipfs-io' = 'cloudflare',
  ): string {
    switch (gateway) {
      case 'pinata':
        return `https://gateway.pinata.cloud/ipfs/${cid}`;
      case 'cloudflare':
        return `https://cloudflare-ipfs.com/ipfs/${cid}`;
      case 'ipfs-io':
        return `https://ipfs.io/ipfs/${cid}`;
      default:
        return `https://cloudflare-ipfs.com/ipfs/${cid}`;
    }
  }

  async unpin(cid: string): Promise<void> {
    await this.pinata.unpin(cid);
  }

  async listPins(
    limit = 10,
    offset = 0,
  ): Promise<
    Array<{
      cid: string;
      name: string;
      size: number;
      dateAdded: string;
      metadata?: Record<string, any>;
    }>
  > {
    const result = await this.pinata.pinList({
      pageLimit: limit,
      pageOffset: offset,
    });

    return result.rows.map(pin => ({
      cid: pin.ipfs_pin_hash,
      name: pin.metadata?.name || 'Unnamed',
      size: pin.size,
      dateAdded: pin.date_pinned,
      metadata: pin.metadata?.keyvalues,
    }));
  }
}
```

### Example Usage

```typescript
// DID NFT Metadata (HIP-412 compliant)
const didMetadata = {
  name: `DID:hedera:0.0.${accountId}`,
  description: 'Soulbound DID NFT for Hedera Social',
  image: await pinataService.getGatewayUrl(profileImageCid),
  attributes: [
    { trait_type: 'account_id', value: accountId },
    { trait_type: 'created_at', value: new Date().toISOString() },
  ],
  did: {
    method: 'hedera',
    account: accountId,
    publicKey: userPublicKeyHex,
  },
  encryption: {
    publicKey: x25519PublicKeyBase64,           // X25519 public key for E2E encryption
    algorithm: 'x25519-xsalsa20-poly1305',     // nacl.box compatible
    keyBackupCid: keyBackupIpfsCid,             // IPFS CID of encrypted key backup
    keyBackupMethod: 'platform-auth-derived',   // Auth-session-derived decryption
  },
};

const result = await pinataService.pinJSON(
  `did-metadata-${accountId}`,
  didMetadata,
  { userId: accountId },
);

const metadataCid = result.cid;
const metadataUrl = pinataService.getGatewayUrl(metadataCid);
```

---

## Summary Table

| Service | Status | Blocking | Action Required |
|---------|--------|----------|-----------------|
| Hedera SDK | VERIFIED | No | Use hedera-integration.md |
| Tamam MPC Custody | VERIFIED | No | Use custody-integration.md |
| Mirsad AI KYC/AML | VERIFIED | No | Use mirsad-ai-integration.md |
| Pinata IPFS | PARTIALLY VERIFIED | No | Use provided implementation |

---

## Template for Adding New Services

When a new external service is required:

1. Create a section with the service name
2. Set status to BLOCKED/UNVERIFIED
3. Define the TypeScript interface (what we WANT)
4. List specific questions for the user
5. Provide a service skeleton that throws `NotImplementedError`
6. Update the summary table above

```typescript
// Template
interface INewService {
  // Define methods that will be implemented once docs are available
}

@Injectable()
export class NewService implements INewService {
  async method(): Promise<void> {
    throw new NotImplementedError(
      'New service integration not yet implemented. ' +
      'User must provide API documentation.',
    );
  }
}
```

---

## See Also

- hedera-integration.md — Verified Hedera SDK patterns
- custody-integration.md — Verified Tamam MPC Custody API reference (~1,826 lines)
- mirsad-ai-integration.md — Verified Mirsad AI KYC/AML API reference (~823 lines)
- architecture-overview.md — How these services fit into the platform
