"use strict";
// =============================================================================
// ERROR CODES
// =============================================================================
// Standardized error codes returned by the API.
// Format: CATEGORY_SPECIFIC_ERROR
// =============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorCode = void 0;
var ErrorCode;
(function (ErrorCode) {
    // Auth errors
    ErrorCode["AUTH_INVALID_EMAIL"] = "AUTH_INVALID_EMAIL";
    ErrorCode["AUTH_INVALID_PHONE"] = "AUTH_INVALID_PHONE";
    ErrorCode["AUTH_DUPLICATE_ACCOUNT"] = "AUTH_DUPLICATE_ACCOUNT";
    ErrorCode["AUTH_INVALID_OTP"] = "AUTH_INVALID_OTP";
    ErrorCode["AUTH_OTP_EXPIRED"] = "AUTH_OTP_EXPIRED";
    ErrorCode["AUTH_OTP_MAX_ATTEMPTS"] = "AUTH_OTP_MAX_ATTEMPTS";
    ErrorCode["AUTH_TOKEN_EXPIRED"] = "AUTH_TOKEN_EXPIRED";
    ErrorCode["AUTH_TOKEN_INVALID"] = "AUTH_TOKEN_INVALID";
    ErrorCode["AUTH_UNAUTHORIZED"] = "AUTH_UNAUTHORIZED";
    // Identity errors
    ErrorCode["IDENTITY_WALLET_CREATION_FAILED"] = "IDENTITY_WALLET_CREATION_FAILED";
    ErrorCode["IDENTITY_KYC_ALREADY_SUBMITTED"] = "IDENTITY_KYC_ALREADY_SUBMITTED";
    ErrorCode["IDENTITY_KYC_NOT_APPROVED"] = "IDENTITY_KYC_NOT_APPROVED";
    ErrorCode["IDENTITY_PROFILE_NOT_FOUND"] = "IDENTITY_PROFILE_NOT_FOUND";
    ErrorCode["IDENTITY_NFT_MINT_FAILED"] = "IDENTITY_NFT_MINT_FAILED";
    // Messaging errors
    ErrorCode["MSG_CONVERSATION_NOT_FOUND"] = "MSG_CONVERSATION_NOT_FOUND";
    ErrorCode["MSG_NOT_A_MEMBER"] = "MSG_NOT_A_MEMBER";
    ErrorCode["MSG_PAYLOAD_TOO_LARGE"] = "MSG_PAYLOAD_TOO_LARGE";
    ErrorCode["MSG_TOPIC_SUBMIT_FAILED"] = "MSG_TOPIC_SUBMIT_FAILED";
    ErrorCode["MSG_GROUP_MEMBER_LIMIT"] = "MSG_GROUP_MEMBER_LIMIT";
    ErrorCode["MSG_ALREADY_MEMBER"] = "MSG_ALREADY_MEMBER";
    ErrorCode["MSG_NOT_ADMIN"] = "MSG_NOT_ADMIN";
    ErrorCode["MSG_CANNOT_REMOVE_ADMIN"] = "MSG_CANNOT_REMOVE_ADMIN";
    // Social errors
    ErrorCode["SOCIAL_ALREADY_FOLLOWING"] = "SOCIAL_ALREADY_FOLLOWING";
    ErrorCode["SOCIAL_NOT_FOLLOWING"] = "SOCIAL_NOT_FOLLOWING";
    ErrorCode["SOCIAL_CANNOT_FOLLOW_SELF"] = "SOCIAL_CANNOT_FOLLOW_SELF";
    ErrorCode["SOCIAL_POST_TEXT_TOO_LONG"] = "SOCIAL_POST_TEXT_TOO_LONG";
    ErrorCode["SOCIAL_TOO_MANY_MEDIA"] = "SOCIAL_TOO_MANY_MEDIA";
    // Payment errors
    ErrorCode["PAY_INSUFFICIENT_BALANCE"] = "PAY_INSUFFICIENT_BALANCE";
    ErrorCode["PAY_RECIPIENT_NOT_FOUND"] = "PAY_RECIPIENT_NOT_FOUND";
    ErrorCode["PAY_TRANSFER_FAILED"] = "PAY_TRANSFER_FAILED";
    ErrorCode["PAY_REQUEST_NOT_FOUND"] = "PAY_REQUEST_NOT_FOUND";
    ErrorCode["PAY_REQUEST_EXPIRED"] = "PAY_REQUEST_EXPIRED";
    ErrorCode["PAY_SPLIT_NOT_FOUND"] = "PAY_SPLIT_NOT_FOUND";
    ErrorCode["PAY_ALREADY_PAID"] = "PAY_ALREADY_PAID";
    ErrorCode["PAY_TAMAM_ERROR"] = "PAY_TAMAM_ERROR";
    // Organization errors
    ErrorCode["ORG_NOT_FOUND"] = "ORG_NOT_FOUND";
    ErrorCode["ORG_PERMISSION_DENIED"] = "ORG_PERMISSION_DENIED";
    ErrorCode["ORG_MEMBER_LIMIT_REACHED"] = "ORG_MEMBER_LIMIT_REACHED";
    ErrorCode["ORG_ALREADY_MEMBER"] = "ORG_ALREADY_MEMBER";
    ErrorCode["ORG_INVITATION_EXPIRED"] = "ORG_INVITATION_EXPIRED";
    ErrorCode["ORG_INVITATION_NOT_FOUND"] = "ORG_INVITATION_NOT_FOUND";
    ErrorCode["ORG_CANNOT_REMOVE_OWNER"] = "ORG_CANNOT_REMOVE_OWNER";
    ErrorCode["ORG_KYB_NOT_APPROVED"] = "ORG_KYB_NOT_APPROVED";
    // Hedera errors
    ErrorCode["HEDERA_TOPIC_CREATE_FAILED"] = "HEDERA_TOPIC_CREATE_FAILED";
    ErrorCode["HEDERA_MESSAGE_SUBMIT_FAILED"] = "HEDERA_MESSAGE_SUBMIT_FAILED";
    ErrorCode["HEDERA_MIRROR_NODE_ERROR"] = "HEDERA_MIRROR_NODE_ERROR";
    ErrorCode["HEDERA_TRANSACTION_FAILED"] = "HEDERA_TRANSACTION_FAILED";
    // Generic
    ErrorCode["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    ErrorCode["INTERNAL_ERROR"] = "INTERNAL_ERROR";
    ErrorCode["NOT_FOUND"] = "NOT_FOUND";
    ErrorCode["RATE_LIMITED"] = "RATE_LIMITED";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
//# sourceMappingURL=errors.js.map