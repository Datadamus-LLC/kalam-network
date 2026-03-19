import { z } from "zod";

/**
 * Typed exception for frontend environment validation failures.
 */
class EnvValidationError extends Error {
  public readonly code = "ENV_VALIDATION_FAILED";
  public readonly issues: string[];

  constructor(issues: string[]) {
    super(`Frontend environment validation failed:\n${issues.join("\n")}\n\nCheck .env and .env.example`);
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

/**
 * Frontend environment variables (only NEXT_PUBLIC_* are available client-side).
 * Validated at module load time. If validation fails, the error propagates
 * immediately so the developer sees what is missing.
 */
const clientEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z
    .string()
    .url()
    .default("http://localhost:3001/api/v1"),

  NEXT_PUBLIC_WS_URL: z
    .string()
    .optional(),

  NEXT_PUBLIC_HEDERA_NETWORK: z
    .enum(["testnet", "mainnet", "previewnet"])
    .default("testnet"),

  NEXT_PUBLIC_ENABLE_CHAT: z
    .enum(["true", "false"])
    .default("true")
    .transform((val) => val === "true"),

  NEXT_PUBLIC_ENABLE_KYC: z
    .enum(["true", "false"])
    .default("true")
    .transform((val) => val === "true"),

  NEXT_PUBLIC_ENABLE_PAYMENTS: z
    .enum(["true", "false"])
    .default("true")
    .transform((val) => val === "true"),

  NEXT_PUBLIC_HASHSCAN_URL: z
    .string()
    .url()
    .default("https://hashscan.io"),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

/**
 * Parse and validate the NEXT_PUBLIC_* environment variables.
 *
 * Next.js inlines these at build time, so we read them explicitly
 * to make sure nothing is silently undefined.
 */
function getClientEnv(): ClientEnv {
  const raw: Record<string, string | undefined> = {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
    NEXT_PUBLIC_HEDERA_NETWORK: process.env.NEXT_PUBLIC_HEDERA_NETWORK,
    NEXT_PUBLIC_ENABLE_CHAT: process.env.NEXT_PUBLIC_ENABLE_CHAT,
    NEXT_PUBLIC_ENABLE_KYC: process.env.NEXT_PUBLIC_ENABLE_KYC,
    NEXT_PUBLIC_ENABLE_PAYMENTS: process.env.NEXT_PUBLIC_ENABLE_PAYMENTS,
    NEXT_PUBLIC_HASHSCAN_URL: process.env.NEXT_PUBLIC_HASHSCAN_URL,
  };

  const result = clientEnvSchema.safeParse(raw);

  if (!result.success) {
    const formatted = result.error.issues.map(
      (issue) => `  ${issue.path.join(".")} - ${issue.message}`,
    );

    throw new EnvValidationError(formatted);
  }

  return result.data;
}

/**
 * Singleton validated environment.
 * Import and use: `import { env } from '@/lib/env';`
 */
export const env: ClientEnv = getClientEnv();
