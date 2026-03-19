import { z } from "zod";
import { Logger } from "@nestjs/common";

/**
 * Hedera account/topic/token ID format: 0.0.DIGITS
 */
const hederaIdSchema = z
  .string()
  .regex(/^0\.0\.\d+$/, "Must be a valid Hedera ID (0.0.X)");

/**
 * Optional Hedera ID: empty string → undefined, otherwise validates format
 */
const optionalHederaId = z.preprocess(
  (val) => (val === "" ? undefined : val),
  hederaIdSchema.optional(),
);

/**
 * Optional URL: empty string → undefined, otherwise validates URL format
 */
const optionalUrl = z.preprocess(
  (val) => (val === "" ? undefined : val),
  z.string().url().optional(),
);

/**
 * Optional string: empty string → undefined
 */
const optionalString = z.preprocess(
  (val) => (val === "" ? undefined : val),
  z.string().optional(),
);

/**
 * Environment variable schema for NestJS API.
 *
 * Validation happens at startup via ConfigModule.
 * If any variable fails validation, the app crashes with a detailed error
 * message listing every missing or invalid variable.
 *
 * Variables are required unless explicitly marked .optional() or given a .default().
 */
export const envSchema = z.object({
  // ============================
  // SERVER & RUNTIME
  // ============================

  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),

  WS_PORT: z.coerce.number().int().min(1).max(65535).default(3001),

  LOG_LEVEL: z
    .enum(["error", "warn", "log", "debug", "verbose"])
    .default("log"),

  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  // ============================
  // DATABASE (PostgreSQL)
  // ============================

  DB_HOST: z.string().min(1).default("localhost"),

  DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),

  DB_USERNAME: z.string().min(1).default("hedera_social"),

  DB_PASSWORD: z.string().min(1),

  DB_DATABASE: z.string().min(1).default("hedera_social"),

  // ============================
  // REDIS
  // ============================

  REDIS_HOST: z.string().default("localhost"),

  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),

  REDIS_URL: optionalString,

  REDIS_PASSWORD: optionalString,

  // ============================
  // HEDERA NETWORK
  // ============================

  HEDERA_NETWORK: z
    .enum(["testnet", "mainnet", "previewnet"])
    .default("testnet"),

  HEDERA_OPERATOR_ID: optionalHederaId,

  HEDERA_OPERATOR_KEY: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string().min(20).optional(),
  ),

  HEDERA_DID_TOKEN_ID: optionalHederaId,

  HEDERA_SOCIAL_GRAPH_TOPIC: optionalHederaId,

  HEDERA_KYC_ATTESTATION_TOPIC: optionalHederaId,

  HEDERA_ANNOUNCEMENTS_TOPIC: optionalHederaId,

  HEDERA_NOTIFICATION_TOPIC: optionalHederaId,

  HEDERA_MIRROR_NODE_URL: z
    .string()
    .url()
    .default("https://testnet.mirrornode.hedera.com/api/v1"),

  HTS_TOKEN_ID: optionalHederaId,

  NOTIFICATION_TOPIC_ID: optionalHederaId,

  // ============================
  // JWT AUTHENTICATION
  // ============================

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),

  JWT_EXPIRY: z.string().default("24h"),

  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),

  JWT_REFRESH_EXPIRY: z.string().default("30d"),

  // ============================
  // TAMAM CUSTODY (MPC Wallet)
  // ============================

  TAMAM_CUSTODY_API_URL: optionalUrl,

  TAMAM_CUSTODY_API_KEY: optionalString,

  TAMAM_CUSTODY_SIGNING_SECRET: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string().length(64).optional(),
  ),

  TAMAM_CUSTODY_VAULT_ID: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string().uuid().optional(),
  ),

  TAMAM_CUSTODY_ORG_ID: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string().uuid().optional(),
  ),

  // ============================
  // MIRSAD AI (KYC & Screening)
  // ============================

  MIRSAD_KYC_API_URL: optionalUrl,

  MIRSAD_KYC_CALLBACK_URL: optionalString,

  MIRSAD_KYC_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((val) => val === "true"),

  // ============================
  // PINATA IPFS
  // ============================

  PINATA_API_KEY: optionalString,

  PINATA_SECRET_KEY: optionalString,

  PINATA_API_BASE_URL: z.string().url().default("https://api.pinata.cloud"),

  PINATA_GATEWAY_URL: z.string().default("https://gateway.pinata.cloud/ipfs"),

  HASHSCAN_BASE_URL: z.string().url().default("https://hashscan.io"),

  // ============================
  // ENCRYPTION
  // ============================

  ENCRYPTION_MASTER_KEY: optionalString,

  ENCRYPTION_WRAP_KEY: z
    .string()
    .min(32, "ENCRYPTION_WRAP_KEY must be at least 32 characters"),

  // ============================
  // PAYMENTS
  // ============================

  TMUSD_TOKEN_ID: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, "Must be a valid Hedera token ID")
    .optional(),

  // ============================
  // RESEND (Email delivery)
  // ============================

  RESEND_API_KEY: z.string().min(1),

  RESEND_FROM_EMAIL: z.string().email().default("onboarding@resend.dev"),
});

/**
 * Inferred type from the env schema.
 * Use this for type-safe access to validated env vars.
 */
export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validate environment variables at application startup.
 *
 * Returns the validated and transformed config object.
 * Crashes the process with a clear error listing if validation fails.
 */
export function validateEnv(
  env: Record<string, string | undefined>,
): EnvConfig {
  const logger = new Logger("EnvValidation");

  const result = envSchema.safeParse(env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join(".")} - ${issue.message}`)
      .join("\n");

    logger.error(
      `Environment validation failed.\n\nInvalid or missing variables:\n${issues}\n\nRefer to .env.example for required values.\n`,
    );

    process.exit(1);
  }

  return result.data;
}
