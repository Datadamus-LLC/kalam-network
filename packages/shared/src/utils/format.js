"use strict";
// =============================================================================
// FORMATTING UTILITIES
// =============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.truncateAccountId = truncateAccountId;
exports.formatHbar = formatHbar;
exports.formatCurrency = formatCurrency;
exports.hashScanTxUrl = hashScanTxUrl;
exports.hashScanAccountUrl = hashScanAccountUrl;
exports.hashScanNftUrl = hashScanNftUrl;
exports.ipfsUrl = ipfsUrl;
/** Truncate Account ID for display: "0.0.12345" → "0.0.123...45" */
function truncateAccountId(accountId, maxLength = 12) {
    if (accountId.length <= maxLength)
        return accountId;
    const prefix = accountId.slice(0, 8);
    const suffix = accountId.slice(-4);
    return `${prefix}...${suffix}`;
}
/** Format HBAR amount: 100000000 tinybars → "1.00 HBAR" */
function formatHbar(tinybars) {
    return `${(tinybars / 100_000_000).toFixed(2)} HBAR`;
}
/** Format currency amount: 50.00, "USD" → "$50.00" */
function formatCurrency(amount, currency) {
    const symbols = {
        USD: '$',
        AED: 'AED ',
        EUR: '\u20AC',
        GBP: '\u00A3',
        HBAR: '\u210F',
    };
    const symbol = symbols[currency] || `${currency} `;
    return `${symbol}${amount.toFixed(2)}`;
}
/** Build HashScan URL for a transaction — baseUrl should come from env/config */
function hashScanTxUrl(txId, network, baseUrl) {
    return `${baseUrl}/${network}/transaction/${txId}`;
}
/** Build HashScan URL for an account — baseUrl should come from env/config */
function hashScanAccountUrl(accountId, network, baseUrl) {
    return `${baseUrl}/${network}/account/${accountId}`;
}
/** Build HashScan URL for an NFT — baseUrl should come from env/config */
function hashScanNftUrl(tokenId, serial, network, baseUrl) {
    return `${baseUrl}/${network}/token/${tokenId}/${serial}`;
}
/** Build IPFS gateway URL from CID — gatewayBase should come from env/config */
function ipfsUrl(cid, gatewayBase) {
    // Remove ipfs:// prefix if present
    const cleanCid = cid.replace(/^ipfs:\/\//, '');
    return `${gatewayBase}/${cleanCid}`;
}
//# sourceMappingURL=format.js.map