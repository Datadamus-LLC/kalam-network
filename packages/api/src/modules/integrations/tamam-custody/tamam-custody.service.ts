import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, createHmac } from "crypto";
import { PAYMENT_CONSTANTS } from "../../payments/constants/payment.constants";
import {
  TamamCustodyNotConfiguredException,
  TamamCustodyApiException,
  TamamCustodyNetworkException,
  TamamCustodyInvalidResponseException,
  TamamCustodyKeypairException,
  TamamCustodySigningException,
  TamamCustodyTransactionCreationException,
} from "./tamam-custody.exceptions";

// ---------------------------------------------------------------------------
// Response interfaces — verified from olara-mobile-app source code
// (packages/backend/src/routes/vaults.routes.ts, mpc.routes.ts, custody.routes.ts)
// ---------------------------------------------------------------------------

/** POST /api/v1/vaults — create a multi-chain vault under existing org */
interface CreateVaultApiResponse {
  success: true;
  data: {
    id: string;
    name: string;
    description: string;
    type: string;
    supportedChains: string[];
    addresses: Array<{
      chain: string;
      address: string;
      curveType: string;
    }>;
    mpcKeys: Array<{
      curveType: string;
      publicKey: string;
      threshold: number;
    }>;
    status: string;
    createdAt: string;
    warnings?: Array<{
      curveType: string;
      failedChains: string[];
      error: string;
    }>;
  };
}

/** Transaction creation response from POST /api/custody/transactions */
interface CreateTransactionApiResponse {
  success: true;
  data: {
    id: string;
    status: string;
    type: string;
    chain: string;
    amount: string;
    assetSymbol: string;
    sourceVaultId: string;
    destinationAddress: string | null;
    [key: string]: unknown;
  };
}

/** Raw signing response from POST /api/custody/transactions/:txId/sign-raw */
interface SignRawApiResponse {
  success: true;
  data: {
    signedTransaction: string;
    txHash?: string;
    explorerUrl?: string;
  };
}

/** Message signing response from POST /api/custody/sign-message */
interface SignMessageApiResponse {
  success: true;
  data: {
    signature: string;
    publicKey: string;
  };
}

/** Error response from the Tamam API. */
interface TamamApiErrorResponse {
  success: false;
  error: string;
  code: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Request timeout (30 seconds)
// ---------------------------------------------------------------------------

const REQUEST_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Tamam MPC Custody integration service.
 *
 * Makes REAL HTTP calls to the Tamam Custody API for per-user vault creation
 * and two-step transaction signing.
 *
 * Verified endpoints (from olara-mobile-app source):
 * - POST /api/v1/vaults                              — create vault (auto-generates MPC key)
 * - POST /api/custody/transactions                    — create a custody transaction
 * - POST /api/custody/transactions/:txId/sign-raw     — MPC-sign raw tx bytes
 * - POST /api/custody/sign-message                    — MPC-sign an arbitrary hash
 *
 * Authentication (from olara-mobile-app/packages/backend/src/middleware/):
 * - All endpoints: API key via x-api-key header (authenticateAny middleware)
 * - Sensitive ops: API key + HMAC-SHA256 request signing (requireSignedRequest)
 *
 * HMAC canonical format (direct concatenation, NO newlines):
 *   `${METHOD}${PATH}${TIMESTAMP}${BODY_HASH}`
 * - TIMESTAMP = Unix seconds (Math.floor(Date.now() / 1000))
 * - BODY_HASH = SHA256(body).hex() or "" for GET
 */
@Injectable()
export class TamamCustodyService implements OnModuleInit {
  private readonly logger = new Logger(TamamCustodyService.name);

  /** Base URL of the Tamam Custody API (no trailing slash). */
  private apiUrl: string | undefined;
  /** API key for custody API authentication (x-api-key header). */
  private apiKey: string | undefined;
  /** Signing secret for HMAC-SHA256 request signing. */
  private signingSecret: string | undefined;
  /** Default vault ID (platform vault, not per-user). */
  private vaultId: string | undefined;
  /** Organization ID. */
  private orgId: string | undefined;
  /** Whether all required credentials have been configured. */
  private configured = false;

  constructor(private readonly configService: ConfigService) {}

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  onModuleInit(): void {
    this.apiUrl = this.configService.get<string>("tamam.custody.apiUrl");
    this.apiKey = this.configService.get<string>("tamam.custody.apiKey");
    this.signingSecret = this.configService.get<string>(
      "tamam.custody.signingSecret",
    );
    this.vaultId = this.configService.get<string>("tamam.custody.vaultId");
    this.orgId = this.configService.get<string>("tamam.custody.orgId");

    if (
      this.apiUrl &&
      this.apiKey &&
      this.signingSecret &&
      this.vaultId &&
      this.orgId
    ) {
      this.configured = true;
      this.logger.log(
        "Tamam Custody service initialized — API connection configured",
      );
    } else {
      this.logger.warn(
        "Tamam Custody credentials not fully configured. " +
          "MPC custody operations will be unavailable. " +
          "Set TAMAM_CUSTODY_API_URL, TAMAM_CUSTODY_API_KEY, " +
          "TAMAM_CUSTODY_SIGNING_SECRET, TAMAM_CUSTODY_VAULT_ID, " +
          "and TAMAM_CUSTODY_ORG_ID to enable.",
      );
    }
  }

  // -----------------------------------------------------------------------
  // Public helpers
  // -----------------------------------------------------------------------

  /** Whether the service has been fully configured. */
  isConfigured(): boolean {
    return this.configured;
  }

  // -----------------------------------------------------------------------
  // Per-User Vault Creation
  // -----------------------------------------------------------------------

  /**
   * Create a per-user vault under the platform's existing organization.
   *
   * Calls `POST /api/v1/vaults` which:
   * - Creates a new vault under our org (derived from API key auth context)
   * - Auto-generates MPC keys for the requested chains
   * - Returns vault ID, public key, and chain addresses
   *
   * This endpoint uses `authenticateAny` (accepts API key) and does NOT
   * require KYB approval or signed requests.
   *
   * Verified from: olara-mobile-app/packages/backend/src/routes/vaults.routes.ts
   *
   * @param displayName  User's display name (used for vault naming)
   * @returns Vault ID, hex-encoded public key, and optional Hedera account ID
   */
  async createUserVault(displayName: string): Promise<{
    publicKey: string;
    vaultId: string;
    hederaAccountId?: string;
  }> {
    this.ensureConfigured();

    const path = "/api/v1/vaults";
    const body = {
      name: `Wallet — ${displayName}`,
      description: `Hedera Social Platform user vault`,
      chains: ["hedera"],
      threshold: 2,
      totalSigners: 3,
      type: "GENERAL",
    };

    try {
      const response = await this.authenticatedRequest<CreateVaultApiResponse>(
        "POST",
        path,
        body,
      );

      if (!response.data?.id) {
        throw new TamamCustodyInvalidResponseException(
          "createUserVault",
          "Missing data.id in response",
        );
      }

      // Extract the ed25519 MPC public key for Hedera
      const hederaKey = response.data.mpcKeys?.find(
        (k) => k.curveType === "ed25519",
      );
      const hederaAddress = response.data.addresses?.find((a) =>
        a.chain.toLowerCase().includes("hedera"),
      );

      this.logger.log(
        `User vault created — vaultId=${response.data.id} ` +
          `chains=${response.data.supportedChains.join(",")} ` +
          `mpcKeys=${response.data.mpcKeys?.length ?? 0} ` +
          `hederaAccountId=${hederaAddress?.address ?? "none"}`,
      );

      return {
        publicKey: hederaKey?.publicKey ?? "",
        vaultId: response.data.id,
        hederaAccountId: hederaAddress?.address,
      };
    } catch (error: unknown) {
      if (
        error instanceof TamamCustodyApiException ||
        error instanceof TamamCustodyNetworkException ||
        error instanceof TamamCustodyInvalidResponseException
      ) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`User vault creation failed: ${message}`);
      throw new TamamCustodyKeypairException(message);
    }
  }

  // -----------------------------------------------------------------------
  // Transfer via Custody Transactions API (create + auto-sign + broadcast)
  // -----------------------------------------------------------------------

  /** Terminal statuses that stop polling. */
  private static readonly TERMINAL_STATUSES = new Set([
    "COMPLETED",
    "FAILED",
    "REJECTED",
    "CANCELLED",
    "EXPIRED",
  ]);

  /** Max polling attempts (2s interval × 30 = 60s timeout). */
  private static readonly MAX_POLL_ATTEMPTS = 30;
  /** Delay between status polls in milliseconds. */
  private static readonly POLL_INTERVAL_MS = 2_000;

  /**
   * Execute a Hedera HBAR transfer via the custody transactions API.
   *
   * Calls `POST /api/custody/transactions` which creates the transaction,
   * runs policy/compliance gates, auto-triggers MPC signing, and broadcasts.
   * Then polls `GET /api/custody/transactions/:txId` until terminal status.
   *
   * Verified from: olara-mobile-app/packages/backend/src/routes/custody.routes.ts
   *
   * @param vaultId  The user's vault ID (stored as keyId on user entity)
   * @param to       Recipient Hedera account ID (e.g. "0.0.12345")
   * @param amount   Transfer amount in HBAR (as string)
   * @param memo     Optional transaction memo
   * @returns Transaction hash and status
   */
  async executeTransfer(
    vaultId: string,
    to: string,
    amount: string,
    currency: string,
    memo?: string,
  ): Promise<{ txHash: string; status: string; explorerUrl: string | null }> {
    this.ensureConfigured();

    // Step 1: Create custody transaction
    const createPath = "/api/custody/transactions";
    const assetPayload = this.buildAssetPayload(currency);
    const convertedAmount = this.toSmallestUnits(parseFloat(amount), currency);
    const createBody: Record<string, unknown> = {
      sourceVaultId: vaultId,
      type: "TRANSFER",
      chain: "hedera",
      ...assetPayload,
      amount: convertedAmount,
      destinationType: "EXTERNAL",
      destinationAddress: to,
    };
    if (memo) {
      createBody.metadata = { memo };
    }

    let txId: string;

    try {
      const createResponse =
        await this.authenticatedRequest<CreateTransactionApiResponse>(
          "POST",
          createPath,
          createBody,
        );

      if (!createResponse.data?.id) {
        throw new TamamCustodyInvalidResponseException(
          "executeTransfer (create)",
          "Missing data.id in response",
        );
      }

      txId = createResponse.data.id;

      this.logger.log(
        `Custody transaction created — txId=${txId} ` +
          `status=${createResponse.data.status} ` +
          `vault=${vaultId} to=${to} amount=${convertedAmount} currency=${currency}`,
      );
    } catch (error: unknown) {
      if (
        error instanceof TamamCustodyApiException ||
        error instanceof TamamCustodyNetworkException ||
        error instanceof TamamCustodyInvalidResponseException
      ) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Custody transaction creation failed for vault ${vaultId}: ${message}`,
      );
      throw new TamamCustodyTransactionCreationException(vaultId, message);
    }

    // Step 2: Poll for completion
    return this.pollTransactionStatus(txId, vaultId);
  }

  /**
   * Poll `GET /api/custody/transactions/:txId` until the transaction
   * reaches a terminal status (COMPLETED, FAILED, REJECTED, etc.).
   */
  private async pollTransactionStatus(
    txId: string,
    vaultId: string,
  ): Promise<{ txHash: string; status: string; explorerUrl: string | null }> {
    const pollPath = `/api/custody/transactions/${encodeURIComponent(txId)}`;

    for (
      let attempt = 0;
      attempt < TamamCustodyService.MAX_POLL_ATTEMPTS;
      attempt++
    ) {
      // Wait before polling (skip on first attempt to check immediately)
      if (attempt > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, TamamCustodyService.POLL_INTERVAL_MS),
        );
      }

      const pollResponse = await this.authenticatedRequest<{
        success: true;
        data: {
          id: string;
          status: string;
          txHash: string | null;
          explorerUrl?: string | null;
          errorMessage?: string | null;
          errorCode?: string | null;
          [key: string]: unknown;
        };
      }>("GET", pollPath);

      const { status, txHash, explorerUrl, errorMessage } = pollResponse.data;

      if (!TamamCustodyService.TERMINAL_STATUSES.has(status)) {
        this.logger.debug(
          `Custody tx ${txId} status: ${status} (poll ${attempt + 1}/${TamamCustodyService.MAX_POLL_ATTEMPTS})`,
        );
        continue;
      }

      // Terminal status reached
      if (status === "COMPLETED") {
        if (!txHash) {
          throw new TamamCustodyInvalidResponseException(
            "executeTransfer (poll)",
            `Transaction ${txId} is COMPLETED but txHash is null`,
          );
        }

        this.logger.log(
          `Custody transfer completed — txId=${txId} txHash=${txHash} vault=${vaultId}`,
        );

        return {
          txHash,
          status,
          explorerUrl: explorerUrl ?? null,
        };
      }

      // Terminal failure
      const failReason =
        errorMessage ??
        `Transaction ${txId} reached terminal status: ${status}`;
      this.logger.error(
        `Custody transfer failed — txId=${txId} status=${status} error=${failReason}`,
      );
      throw new TamamCustodySigningException(vaultId, failReason);
    }

    // Polling timed out
    throw new TamamCustodySigningException(
      vaultId,
      `Transaction ${txId} did not complete within ${(TamamCustodyService.MAX_POLL_ATTEMPTS * TamamCustodyService.POLL_INTERVAL_MS) / 1000}s`,
    );
  }

  // -----------------------------------------------------------------------
  // Transaction Signing (two-step: create tx + sign-raw)
  // -----------------------------------------------------------------------

  /**
   * Sign a Hedera transfer transaction via two-step MPC custody flow.
   *
   * Step 1: `POST /api/custody/transactions` — create custody transaction record
   * Step 2: `POST /api/custody/transactions/:txId/sign-raw` — MPC-sign the bytes
   *
   * NOTE: The two-step flow requires transaction approval (PENDING_APPROVAL status).
   * For platform-initiated transfers, prefer `executeTransfer()` which uses the
   * v1 vaults API and bypasses the approval workflow.
   *
   * @param vaultId            The user's vault ID (stored as keyId on user entity)
   * @param transactionBytes   Frozen Hedera TransferTransaction bytes
   * @param amount             Transfer amount (for custody record)
   * @param destinationAddress Recipient Hedera account ID (e.g. "0.0.12345")
   * @returns The fully signed transaction bytes
   */
  async signTransaction(
    vaultId: string,
    transactionBytes: Buffer,
    amount: number,
    destinationAddress: string,
  ): Promise<{ signedTransactionBytes: Buffer }> {
    this.ensureConfigured();

    // Step 1: Create a custody transaction record
    const createPath = "/api/custody/transactions";
    const createBody = {
      sourceVaultId: vaultId,
      type: "TRANSFER" as const,
      chain: "hedera",
      assetSymbol: "HBAR",
      amount: String(amount),
      destinationAddress,
      destinationType: "EXTERNAL" as const,
    };

    let custodyTxId: string;

    try {
      const createResponse =
        await this.authenticatedRequest<CreateTransactionApiResponse>(
          "POST",
          createPath,
          createBody,
        );

      if (!createResponse.data?.id) {
        throw new TamamCustodyInvalidResponseException(
          "signTransaction (create)",
          "Missing data.id in transaction creation response",
        );
      }

      custodyTxId = createResponse.data.id;

      this.logger.log(
        `Custody transaction created — txId=${custodyTxId} ` +
          `status=${createResponse.data.status} ` +
          `vaultId=${vaultId}`,
      );
    } catch (error: unknown) {
      if (
        error instanceof TamamCustodyApiException ||
        error instanceof TamamCustodyNetworkException ||
        error instanceof TamamCustodyInvalidResponseException
      ) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Custody transaction creation failed for vault ${vaultId}: ${message}`,
      );
      throw new TamamCustodyTransactionCreationException(vaultId, message);
    }

    // Step 2: Sign the raw transaction bytes via MPC
    const signPath = `/api/custody/transactions/${encodeURIComponent(custodyTxId)}/sign-raw`;
    const signBody = {
      unsignedTransaction: transactionBytes.toString("hex"),
      broadcast: false,
    };

    try {
      const signResponse = await this.signedRequest<SignRawApiResponse>(
        "POST",
        signPath,
        signBody,
      );

      if (!signResponse.data?.signedTransaction) {
        throw new TamamCustodyInvalidResponseException(
          "signTransaction (sign-raw)",
          "Missing data.signedTransaction in response",
        );
      }

      const signedTransactionBytes = Buffer.from(
        signResponse.data.signedTransaction,
        "hex",
      );

      this.logger.log(
        `Transaction signed via MPC — custodyTxId=${custodyTxId} ` +
          `vaultId=${vaultId} ` +
          `signedBytesLength=${signedTransactionBytes.length}`,
      );

      return { signedTransactionBytes };
    } catch (error: unknown) {
      if (
        error instanceof TamamCustodyApiException ||
        error instanceof TamamCustodyNetworkException ||
        error instanceof TamamCustodyInvalidResponseException
      ) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `MPC raw signing failed for custody tx ${custodyTxId}: ${message}`,
      );
      throw new TamamCustodySigningException(vaultId, message);
    }
  }

  // -----------------------------------------------------------------------
  // Arbitrary Message Signing
  // -----------------------------------------------------------------------

  /**
   * Sign an arbitrary message hash via MPC.
   *
   * Calls `POST /api/custody/sign-message` to produce a signature over
   * the SHA-256 hash of the provided message bytes.
   *
   * @param vaultId The user's vault ID
   * @param message The message bytes to sign (will be SHA-256 hashed)
   * @returns The signature as a Buffer
   */
  async signMessage(
    vaultId: string,
    message: Buffer,
  ): Promise<{ signature: Buffer }> {
    this.ensureConfigured();

    const path = "/api/custody/sign-message";

    // The API expects a 64-char hex string (32-byte SHA-256 hash)
    const messageHash = createHash("sha256").update(message).digest("hex");

    const body = {
      vaultId,
      chain: "hedera",
      messageHash,
      note: "Hedera Social Platform message signing",
    };

    try {
      const response = await this.signedRequest<SignMessageApiResponse>(
        "POST",
        path,
        body,
      );

      if (!response.data?.signature) {
        throw new TamamCustodyInvalidResponseException(
          "signMessage",
          "Missing data.signature in response",
        );
      }

      const signatureBuffer = Buffer.from(response.data.signature, "hex");

      this.logger.log(
        `Message signed — vaultId=${vaultId} ` +
          `signatureLength=${signatureBuffer.length}`,
      );

      return { signature: signatureBuffer };
    } catch (error: unknown) {
      if (
        error instanceof TamamCustodyApiException ||
        error instanceof TamamCustodyNetworkException ||
        error instanceof TamamCustodyInvalidResponseException
      ) {
        throw error;
      }
      const message_ = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Message signing failed for vault ${vaultId}: ${message_}`,
      );
      throw new TamamCustodySigningException(vaultId, message_);
    }
  }

  // -----------------------------------------------------------------------
  // Private — Asset payload helpers
  // -----------------------------------------------------------------------

  /**
   * Build the asset-specific fields for a custody transaction body.
   * HBAR uses native transfer; HTS tokens require assetType + assetId.
   */
  private buildAssetPayload(currency: string): Record<string, string> {
    if (currency === "HBAR") {
      return { assetSymbol: "HBAR" };
    }
    const tokenAddresses = PAYMENT_CONSTANTS.TOKEN_ADDRESSES as Record<
      string,
      string
    >;
    const assetId = tokenAddresses[currency];
    if (!assetId) {
      throw new Error(
        `Unknown HTS token: ${currency}. Add it to PAYMENT_CONSTANTS.TOKEN_ADDRESSES.`,
      );
    }
    return {
      assetType: "HTS",
      assetSymbol: currency,
      assetId,
    };
  }

  /**
   * Convert a human-readable amount to the smallest token unit string.
   * e.g. 1.5 TMUSD (2 decimals) → "150"
   * HBAR has 0 decimals in this context (passed as decimal string by Tamam).
   */
  private toSmallestUnits(amount: number, currency: string): string {
    const tokenDecimals = PAYMENT_CONSTANTS.TOKEN_DECIMALS as Record<
      string,
      number
    >;
    const decimals = tokenDecimals[currency] ?? 0;
    if (decimals === 0) {
      return String(amount);
    }
    return String(Math.round(amount * Math.pow(10, decimals)));
  }

  // -----------------------------------------------------------------------
  // Private — Configuration guard
  // -----------------------------------------------------------------------

  /** Throws if the service is not configured. */
  private ensureConfigured(): void {
    if (!this.configured) {
      throw new TamamCustodyNotConfiguredException();
    }
  }

  // -----------------------------------------------------------------------
  // Private — Authenticated request (API key, no HMAC signing)
  // -----------------------------------------------------------------------

  /**
   * Make an authenticated API request using the API key header.
   * Used for standard operations (vault creation, transaction creation).
   *
   * Header: x-api-key (verified from olara-mobile-app apikey.middleware.ts)
   */
  private async authenticatedRequest<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.apiUrl!}${path}`;
    const headers: Record<string, string> = {
      "x-api-key": this.apiKey!,
      "Content-Type": "application/json",
    };

    const serializedBody =
      body !== undefined ? JSON.stringify(body) : undefined;

    return this.executeRequest<T>(method, url, path, headers, serializedBody);
  }

  // -----------------------------------------------------------------------
  // Private — Signed request (API key + HMAC-SHA256 signature)
  // -----------------------------------------------------------------------

  /**
   * Make a signed API request using API key + HMAC-SHA256 request signing.
   * Used for sensitive operations (sign-raw, sign-message).
   *
   * Canonical format (direct concatenation, NO separators):
   *   `${METHOD}${PATH}${TIMESTAMP}${BODY_HASH}`
   *
   * Verified from: olara-mobile-app request-signing.middleware.ts line 124
   *
   * - TIMESTAMP = Unix seconds string (Math.floor(Date.now() / 1000))
   * - BODY_HASH = SHA256(request body).hex() or "" for GET
   */
  private async signedRequest<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.apiUrl!}${path}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const serializedBody =
      body !== undefined ? JSON.stringify(body) : undefined;

    // Body hash: SHA256 hex digest, or empty string for no body
    const bodyHash =
      serializedBody !== undefined
        ? createHash("sha256").update(serializedBody).digest("hex")
        : "";

    // Direct concatenation — NO newlines, NO separators
    const canonical = `${method}${path}${timestamp}${bodyHash}`;

    const signature = createHmac("sha256", this.signingSecret!)
      .update(canonical)
      .digest("base64");

    const headers: Record<string, string> = {
      "x-api-key": this.apiKey!,
      "Content-Type": "application/json",
      "x-request-timestamp": timestamp,
      "x-request-signature": signature,
    };

    return this.executeRequest<T>(method, url, path, headers, serializedBody);
  }

  // -----------------------------------------------------------------------
  // Private — HTTP execution
  // -----------------------------------------------------------------------

  /**
   * Execute an HTTP request to the Tamam Custody API with proper error
   * handling, timeouts, and response validation.
   */
  private async executeRequest<T>(
    method: string,
    url: string,
    path: string,
    headers: Record<string, string>,
    serializedBody: string | undefined,
  ): Promise<T> {
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: serializedBody,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        return this.handleErrorResponse(path, response);
      }

      const json: unknown = await response.json();

      // Validate top-level success flag
      if (
        typeof json !== "object" ||
        json === null ||
        !("success" in json) ||
        (json as Record<string, unknown>).success !== true
      ) {
        throw new TamamCustodyInvalidResponseException(
          path,
          "Response missing success: true",
        );
      }

      return json as T;
    } catch (error: unknown) {
      // Re-throw our own exceptions
      if (
        error instanceof TamamCustodyApiException ||
        error instanceof TamamCustodyInvalidResponseException
      ) {
        throw error;
      }

      // Handle abort (timeout from AbortSignal.timeout)
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new TamamCustodyNetworkException(
          path,
          `Request timed out after ${REQUEST_TIMEOUT_MS}ms`,
        );
      }

      // Handle fetch network errors
      if (error instanceof TypeError) {
        throw new TamamCustodyNetworkException(path, error.message);
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new TamamCustodyNetworkException(path, errorMessage);
    }
  }

  // -----------------------------------------------------------------------
  // Private — Error response parsing
  // -----------------------------------------------------------------------

  /**
   * Parse an error response body from the Tamam API and throw a typed
   * exception.
   */
  private async handleErrorResponse(
    operation: string,
    response: Response,
  ): Promise<never> {
    let apiCode = "UNKNOWN_ERROR";
    let apiMessage = `HTTP ${response.status} ${response.statusText}`;

    let rawBody: string | undefined;
    try {
      rawBody = await response.text();
    } catch {
      this.logger.warn(`Could not read error response body for ${operation}`);
    }

    this.logger.error(
      `Custody API error — operation=${operation} ` +
        `status=${response.status} ` +
        `statusText=${response.statusText} ` +
        `url=${response.url} ` +
        `body=${rawBody ?? "(unreadable)"}`,
    );

    if (rawBody) {
      try {
        const errorBody: unknown = JSON.parse(rawBody);
        if (
          typeof errorBody === "object" &&
          errorBody !== null &&
          "error" in errorBody
        ) {
          const parsed = errorBody as TamamApiErrorResponse;
          apiCode = parsed.code ?? apiCode;
          apiMessage = parsed.error;
        }
      } catch {
        apiMessage = `HTTP ${response.status}: ${rawBody.substring(0, 200)}`;
      }
    }

    throw new TamamCustodyApiException(
      operation,
      response.status,
      apiCode,
      apiMessage,
    );
  }
}
