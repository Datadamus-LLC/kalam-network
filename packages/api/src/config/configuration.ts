import { validateEnv, EnvConfig } from "./env.validation";

/**
 * Cached validated config — populated once at startup.
 * All downstream code accesses env vars through the NestJS ConfigService,
 * which reads from the nested object returned by this factory.
 */
let validatedEnv: EnvConfig | undefined;

/**
 * NestJS ConfigModule factory.
 *
 * On first call, validates ALL environment variables against the Zod schema.
 * If any variable is missing or invalid the process exits immediately with
 * a human-readable error list.
 *
 * The returned object is the shape that the rest of the application accesses
 * via `configService.get<T>("database.host")` etc.
 */
export default () => {
  if (!validatedEnv) {
    validatedEnv = validateEnv(
      process.env as Record<string, string | undefined>,
    );
  }

  const env = validatedEnv;

  return {
    port: env.API_PORT,
    wsPort: env.WS_PORT,
    nodeEnv: env.NODE_ENV,

    // Hedera configuration
    hedera: {
      network: env.HEDERA_NETWORK,
      operatorId: env.HEDERA_OPERATOR_ID,
      operatorKey: env.HEDERA_OPERATOR_KEY,
      didTokenId: env.HEDERA_DID_TOKEN_ID,
      socialGraphTopic: env.HEDERA_SOCIAL_GRAPH_TOPIC,
      kycAttestationTopic: env.HEDERA_KYC_ATTESTATION_TOPIC,
      announcementsTopic: env.HEDERA_ANNOUNCEMENTS_TOPIC,
      notificationTopic: env.HEDERA_NOTIFICATION_TOPIC,
      mirrorNodeUrl: env.HEDERA_MIRROR_NODE_URL,
      htsTokenId: env.HTS_TOKEN_ID,
    },

    // Database configuration
    database: {
      type: "postgres" as const,
      host: env.DB_HOST,
      port: env.DB_PORT,
      username: env.DB_USERNAME,
      password: env.DB_PASSWORD,
      database: env.DB_DATABASE,
      synchronize: false,
      logging: env.NODE_ENV === "development",
    },

    // Redis configuration
    redis: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      url: env.REDIS_URL ?? `redis://${env.REDIS_HOST}:${env.REDIS_PORT}`,
      password: env.REDIS_PASSWORD,
    },

    // JWT configuration
    jwt: {
      secret: env.JWT_SECRET,
      expiresIn: env.JWT_EXPIRY,
      refreshSecret: env.JWT_REFRESH_SECRET,
      refreshExpiresIn: env.JWT_REFRESH_EXPIRY,
    },

    // CORS configuration
    cors: {
      origin: env.CORS_ORIGIN,
      credentials: true,
    },

    // Integration APIs
    mirsadKyc: {
      apiUrl: env.MIRSAD_KYC_API_URL,
      callbackUrl: env.MIRSAD_KYC_CALLBACK_URL,
      enabled: env.MIRSAD_KYC_ENABLED,
    },

    // Encryption master key for local key storage (hackathon fallback)
    encryptionMasterKey: env.ENCRYPTION_MASTER_KEY,

    tamam: {
      custody: {
        apiUrl: env.TAMAM_CUSTODY_API_URL,
        apiKey: env.TAMAM_CUSTODY_API_KEY,
        signingSecret: env.TAMAM_CUSTODY_SIGNING_SECRET,
        vaultId: env.TAMAM_CUSTODY_VAULT_ID,
        orgId: env.TAMAM_CUSTODY_ORG_ID,
      },
    },

    // IPFS (Pinata) configuration
    pinata: {
      apiKey: env.PINATA_API_KEY,
      secretKey: env.PINATA_SECRET_KEY,
      apiBaseUrl: env.PINATA_API_BASE_URL,
      gatewayUrl: env.PINATA_GATEWAY_URL,
    },

    // HashScan block explorer
    hashscan: {
      baseUrl: env.HASHSCAN_BASE_URL,
    },

    // Resend email delivery
    resend: {
      apiKey: env.RESEND_API_KEY,
      fromEmail: env.RESEND_FROM_EMAIL,
    },

    // Logging
    logging: {
      level: env.LOG_LEVEL,
    },
  };
};
