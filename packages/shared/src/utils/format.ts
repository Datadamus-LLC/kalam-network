// =============================================================================
// FORMATTING UTILITIES
// =============================================================================

/** Truncate Account ID for display: "0.0.12345" → "0.0.123...45" */
export function truncateAccountId(accountId: string, maxLength = 12): string {
  if (accountId.length <= maxLength) return accountId;
  const prefix = accountId.slice(0, 8);
  const suffix = accountId.slice(-4);
  return `${prefix}...${suffix}`;
}

/** Format HBAR amount: 100000000 tinybars → "1.00 HBAR" */
export function formatHbar(tinybars: number): string {
  return `${(tinybars / 100_000_000).toFixed(2)} HBAR`;
}

/** Format currency amount: 50.00, "USD" → "$50.00" */
export function formatCurrency(amount: number, currency: string): string {
  const symbols: Record<string, string> = {
    USD: '$',
    AED: 'AED ',
    EUR: '\u20AC',
    GBP: '\u00A3',
    HBAR: '\u210F',
  };
  const symbol = symbols[currency] || `${currency} `;
  return `${symbol}${amount.toFixed(2)}`;
}

/** Build HashScan URL for a transaction */
export function hashScanTxUrl(txId: string, network: 'testnet' | 'mainnet' = 'testnet'): string {
  return `https://hashscan.io/${network}/transaction/${txId}`;
}

/** Build HashScan URL for an account */
export function hashScanAccountUrl(accountId: string, network: 'testnet' | 'mainnet' = 'testnet'): string {
  return `https://hashscan.io/${network}/account/${accountId}`;
}

/** Build HashScan URL for an NFT */
export function hashScanNftUrl(tokenId: string, serial: number, network: 'testnet' | 'mainnet' = 'testnet'): string {
  return `https://hashscan.io/${network}/token/${tokenId}/${serial}`;
}

/** Build IPFS gateway URL from CID */
export function ipfsUrl(cid: string, gatewayBase = 'https://gateway.pinata.cloud/ipfs'): string {
  // Remove ipfs:// prefix if present
  const cleanCid = cid.replace(/^ipfs:\/\//, '');
  return `${gatewayBase}/${cleanCid}`;
}
