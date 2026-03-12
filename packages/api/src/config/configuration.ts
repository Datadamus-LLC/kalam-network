export default () => ({
  port: parseInt(process.env.API_PORT || '3001', 10),
  wsPort: parseInt(process.env.WS_PORT || '3002', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Hedera configuration
  hedera: {
    network: process.env.HEDERA_NETWORK || 'testnet',
    operatorId: process.env.HEDERA_OPERATOR_ID,
    operatorKey: process.env.HEDERA_OPERATOR_KEY,
    didTokenId: process.env.HEDERA_DID_TOKEN_ID,
    socialGraphTopic: process.env.HEDERA_SOCIAL_GRAPH_TOPIC,
    kycAttestationTopic: process.env.HEDERA_KYC_ATTESTATION_TOPIC,
    announcementsTopic: process.env.HEDERA_ANNOUNCEMENTS_TOPIC,
  },

  // Database configuration
  database: {
    type: 'postgres' as const,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'hedera_social',
    password: process.env.DB_PASSWORD || 'devpassword',
    database: process.env.DB_DATABASE || 'hedera_social',
    synchronize: false,
    logging: process.env.NODE_ENV === 'development',
  },

  // Redis configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRY || '24h',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRY || '30d',
  },

  // CORS configuration
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },

  // Integration APIs
  mirsadKyc: {
    apiUrl: process.env.MIRSAD_KYC_API_URL,
    callbackUrl: process.env.MIRSAD_KYC_CALLBACK_URL,
    enabled: process.env.MIRSAD_KYC_ENABLED === 'true',
  },

  tamam: {
    custody: {
      apiUrl: process.env.TAMAM_CUSTODY_API_URL,
      apiKey: process.env.TAMAM_CUSTODY_API_KEY,
      mock: process.env.TAMAM_CUSTODY_MOCK === 'true',
    },
    rails: {
      apiUrl: process.env.TAMAM_RAILS_API_URL,
      apiKey: process.env.TAMAM_RAILS_API_KEY,
      mock: process.env.TAMAM_RAILS_MOCK === 'true',
    },
  },

  // IPFS (Pinata) configuration
  pinata: {
    apiKey: process.env.PINATA_API_KEY,
    secretKey: process.env.PINATA_SECRET_KEY,
    gatewayUrl:
      process.env.PINATA_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs',
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'debug',
  },
});
