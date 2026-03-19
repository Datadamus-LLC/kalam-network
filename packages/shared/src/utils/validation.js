"use strict";
// =============================================================================
// VALIDATION UTILITIES
// =============================================================================
// Reusable validation functions for input checking.
// Used by both backend (controller validation) and frontend (form validation).
// =============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidEmail = isValidEmail;
exports.isValidPhone = isValidPhone;
exports.isValidAccountId = isValidAccountId;
exports.isValidTopicId = isValidTopicId;
exports.isValidUuid = isValidUuid;
exports.isWithinByteLimit = isWithinByteLimit;
/** Validate email format */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}
/** Validate phone number in E.164 format: +[country code][number] */
function isValidPhone(phone) {
    const phoneRegex = /^\+[1-9]\d{6,14}$/;
    return phoneRegex.test(phone);
}
/** Validate Hedera Account ID format: 0.0.XXXXX */
function isValidAccountId(accountId) {
    const accountRegex = /^0\.0\.\d{1,10}$/;
    return accountRegex.test(accountId);
}
/** Validate HCS Topic ID format: 0.0.XXXXX */
function isValidTopicId(topicId) {
    return isValidAccountId(topicId); // Same format
}
/** Validate UUID v4 */
function isValidUuid(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
}
/** Check if a string is within max byte length (for HCS payload size) */
function isWithinByteLimit(str, maxBytes) {
    return new TextEncoder().encode(str).length <= maxBytes;
}
//# sourceMappingURL=validation.js.map