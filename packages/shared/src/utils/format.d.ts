/** Truncate Account ID for display: "0.0.12345" → "0.0.123...45" */
export declare function truncateAccountId(accountId: string, maxLength?: number): string;
/** Format HBAR amount: 100000000 tinybars → "1.00 HBAR" */
export declare function formatHbar(tinybars: number): string;
/** Format currency amount: 50.00, "USD" → "$50.00" */
export declare function formatCurrency(amount: number, currency: string): string;
/** Build HashScan URL for a transaction — baseUrl should come from env/config */
export declare function hashScanTxUrl(txId: string, network: 'testnet' | 'mainnet', baseUrl: string): string;
/** Build HashScan URL for an account — baseUrl should come from env/config */
export declare function hashScanAccountUrl(accountId: string, network: 'testnet' | 'mainnet', baseUrl: string): string;
/** Build HashScan URL for an NFT — baseUrl should come from env/config */
export declare function hashScanNftUrl(tokenId: string, serial: number, network: 'testnet' | 'mainnet', baseUrl: string): string;
/** Build IPFS gateway URL from CID — gatewayBase should come from env/config */
export declare function ipfsUrl(cid: string, gatewayBase: string): string;
//# sourceMappingURL=format.d.ts.map