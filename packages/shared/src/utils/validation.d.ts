/** Validate email format */
export declare function isValidEmail(email: string): boolean;
/** Validate phone number in E.164 format: +[country code][number] */
export declare function isValidPhone(phone: string): boolean;
/** Validate Hedera Account ID format: 0.0.XXXXX */
export declare function isValidAccountId(accountId: string): boolean;
/** Validate HCS Topic ID format: 0.0.XXXXX */
export declare function isValidTopicId(topicId: string): boolean;
/** Validate UUID v4 */
export declare function isValidUuid(uuid: string): boolean;
/** Check if a string is within max byte length (for HCS payload size) */
export declare function isWithinByteLimit(str: string, maxBytes: number): boolean;
//# sourceMappingURL=validation.d.ts.map