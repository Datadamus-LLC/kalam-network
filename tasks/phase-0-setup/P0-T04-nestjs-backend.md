# P0-T04: NestJS Backend Setup

| Field | Value |
|-------|-------|
| Task ID | P0-T04 |
| Priority | 🔴 P0 — Critical Path |
| Estimated Time | 3 hours |
| Depends On | P0-T01 (Monorepo Init), P0-T02 (Shared Types) |
| Phase | 0 — Project Setup |
| Assignee | Backend developer |

---

## Objective

Set up the NestJS backend scaffold (`packages/api`) with complete module structure, all service integrations, and configuration management. After this task, the backend skeleton is ready for implementing business logic in later tasks.

---

## Background

NestJS is a Node.js framework that organizes code into **modules**. Each module contains:
- A **controller** (handles HTTP requests)
- A **service** (implements business logic)
- A **module file** (wires them together)

The Hedera Social Platform has 6 core modules: Auth, Identity, Messaging, Social, Payments, and Notifications. Plus 2 system modules: Hedera integration (for SDK calls) and Integrations (Mirsad AI, Tamam, IPFS).

---

## Pre-requisites

- P0-T01 complete (monorepo exists, pnpm works)
- P0-T02 complete (shared types package exists)
- Node.js v18+ and pnpm installed
- Postgres and Redis running (`docker compose up -d`)

---

## Step-by-Step Instructions

### Step 1: Initialize NestJS project with CLI

```bash
cd packages/api

# Create a new NestJS project (this will scaffold the entire app)
npx @nestjs/cli@latest new .

# When prompted:
# ? Which package manager would you ❤️  to use? → pnpm
# (The `.` means "create in current directory, don't create a subfolder")
```

After this runs, you'll see a fully scaffolded NestJS app. Delete the auto-generated README:

```bash
rm README.md
```

### Step 2: Update package.json with all dependencies

Replace `packages/api/package.json` with this exact content:

```json
{
  "name": "@hedera-social/api",
  "version": "0.1.0",
  "description": "Hedera Social Platform — NestJS backend",
  "author": "",
  "private": true,
  "license": "UNLICENSED",
  "scripts": {
    "prebuild": "rimraf dist",
    "build": "nest build",
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "start:prod": "node dist/main",
    "lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:debug": "node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "typeorm": "typeorm-ts-node-esm",
    "db:migrate": "typeorm migration:run -d src/database/data-source.ts",
    "db:generate": "typeorm migration:generate -d src/database/data-source.ts",
    "db:revert": "typeorm migration:revert -d src/database/data-source.ts"
  },
  "dependencies": {
    "@hashgraph/sdk": "^2.47.0",
    "@nestjs/common": "^10.3.0",
    "@nestjs/config": "^3.2.0",
    "@nestjs/core": "^10.3.0",
    "@nestjs/jwt": "^12.0.1",
    "@nestjs/passport": "^10.0.3",
    "@nestjs/platform-express": "^10.3.0",
    "@nestjs/typeorm": "^10.0.0",
    "@nestjs/websockets": "^10.3.0",
    "@tanstack/react-query": "^5.28.0",
    "bull": "^4.11.5",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.0",
    "dotenv": "^16.3.1",
    "ioredis": "^5.3.2",
    "nest-commander": "^3.12.5",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "pg": "^8.11.3",
    "pinata": "^2.1.0",
    "reflect-metadata": "^0.1.13",
    "rimraf": "^5.0.5",
    "rxjs": "^7.8.1",
    "socket.io": "^4.7.2",
    "typeorm": "^0.3.19",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.3.2",
    "@nestjs/schematics": "^10.0.3",
    "@nestjs/testing": "^10.3.0",
    "@swc/cli": "^0.1.62",
    "@swc/core": "^1.3.99",
    "@types/bull": "^3.15.11",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.11",
    "@types/node": "^20.10.6",
    "@types/passport-jwt": "^3.0.13",
    "@types/supertest": "^6.0.2",
    "@typescript-eslint/eslint-plugin": "^6.17.0",
    "@typescript-eslint/parser": "^6.17.0",
    "eslint": "^8.56.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-prettier": "^5.1.2",
    "jest": "^29.7.0",
    "prettier": "^3.1.1",
    "supertest": "^6.3.3",
    "ts-jest": "^29.1.1",
    "ts-loader": "^9.5.1",
    "ts-node": "^10.9.2",
    "tsconfig-paths": "^4.2.0",
    "typeorm-ts-node-esm": "^10.0.1",
    "typescript": "^5.3.3"
  }
}
```

Install all dependencies:

```bash
cd /sessions/exciting-sharp-mayer/mnt/social-platform  # go back to repo root
pnpm install
```

### Step 3: Create tsconfig.json for the API package

Create `packages/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "lib": ["ES2022"],
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "outDir": "./dist",
    "baseUrl": "./src",
    "rootDir": "./src",
    "paths": {
      "@hedera-social/shared": ["../shared/src"],
      "@hedera-social/shared/*": ["../shared/src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test", "**/*spec.ts"]
}
```

### Step 4: Create environment configuration file

Create `packages/api/src/config/configuration.ts`:

```typescript
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
    type: 'postgres',
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
    gatewayUrl: process.env.PINATA_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs',
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'debug',
  },
});
```

### Step 5: Create the main.ts entry point

Replace `packages/api/src/main.ts` with:

```typescript
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS
  const corsOrigin = configService.get<string>('cors.origin');
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  const port = configService.get<number>('port');
  await app.listen(port, '0.0.0.0');
  logger.log(`Hedera Social Platform API listening on http://localhost:${port}`);
}

bootstrap().catch((err) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to bootstrap application:', err);
  process.exit(1);
});
```

### Step 6: Create full module structure

Create all module directories and files:

```bash
cd packages/api/src

# Auth module
mkdir -p modules/auth
touch modules/auth/auth.controller.ts
touch modules/auth/auth.service.ts
touch modules/auth/auth.module.ts

# Identity module
mkdir -p modules/identity
touch modules/identity/identity.controller.ts
touch modules/identity/identity.service.ts
touch modules/identity/identity.module.ts

# Messaging module
mkdir -p modules/messaging
touch modules/messaging/messaging.controller.ts
touch modules/messaging/messaging.service.ts
touch modules/messaging/messaging.module.ts

# Social module
mkdir -p modules/social
touch modules/social/social.controller.ts
touch modules/social/social.service.ts
touch modules/social/social.module.ts

# Payments module
mkdir -p modules/payments
touch modules/payments/payments.controller.ts
touch modules/payments/payments.service.ts
touch modules/payments/payments.module.ts

# Notifications module
mkdir -p modules/notifications
touch modules/notifications/notifications.controller.ts
touch modules/notifications/notifications.service.ts
touch modules/notifications/notifications.module.ts

# Hedera system module
mkdir -p modules/hedera
touch modules/hedera/hedera.module.ts
touch modules/hedera/hedera.service.ts
touch modules/hedera/mirror-node.service.ts

# Integrations system module
mkdir -p modules/integrations/mirsad-ai
mkdir -p modules/integrations/tamam-custody
mkdir -p modules/integrations/tamam-rails
mkdir -p modules/integrations/ipfs
touch modules/integrations/mirsad-ai/mirsad-ai.service.ts
touch modules/integrations/tamam-custody/tamam-custody.service.ts
touch modules/integrations/tamam-rails/tamam-rails.service.ts
touch modules/integrations/ipfs/ipfs.service.ts

# Database entities and migrations
mkdir -p database/entities
mkdir -p database/migrations
touch database/data-source.ts

# Common utilities
mkdir -p common/decorators
mkdir -p common/filters
mkdir -p common/guards
mkdir -p common/interceptors
mkdir -p common/dto
```

### Step 7: Create placeholder files for all modules

Create `packages/api/src/modules/auth/auth.controller.ts`:

```typescript
import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: { method: string; value: string }) {
    // TODO: implement
    return { message: 'Register endpoint' };
  }

  @Post('verify-otp')
  async verifyOtp(@Body() verifyOtpDto: { registrationId: string; otp: string }) {
    // TODO: implement
    return { message: 'Verify OTP endpoint' };
  }

  @Post('kyc')
  async submitKyc(@Body() kycDto: { accountType: string; data: Record<string, unknown> }) {
    // TODO: implement
    return { message: 'Submit KYC endpoint' };
  }

  @Get('kyc-status')
  async getKycStatus() {
    // TODO: implement
    return { message: 'Get KYC status endpoint' };
  }
}
```

Create `packages/api/src/modules/auth/auth.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthService {
  // Service methods will be implemented in later tasks
}
```

Create `packages/api/src/modules/auth/auth.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: { expiresIn: configService.get<string>('jwt.expiresIn') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
```

Create similar placeholder files for the other modules. For brevity, here's the pattern for each:

**Identity Module** — `packages/api/src/modules/identity/identity.controller.ts`:

```typescript
import { Controller, Get, Put, Param, Body } from '@nestjs/common';
import { IdentityService } from './identity.service';

@Controller('api/v1/profile')
export class IdentityController {
  constructor(private identityService: IdentityService) {}

  @Get(':accountId')
  async getProfile(@Param('accountId') accountId: string) {
    return { message: 'Get profile endpoint' };
  }

  @Put('me')
  async updateProfile(@Body() updateProfileDto: { displayName?: string; bio?: string; avatar?: string }) {
    return { message: 'Update profile endpoint' };
  }
}
```

**Identity Module** — `packages/api/src/modules/identity/identity.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';

@Injectable()
export class IdentityService {
  // Service methods will be implemented in later tasks
}
```

**Identity Module** — `packages/api/src/modules/identity/identity.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';

@Module({
  controllers: [IdentityController],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
```

Create similar files for:
- **Messaging** (MessagingController, MessagingService, MessagingModule)
- **Social** (SocialController, SocialService, SocialModule)
- **Payments** (PaymentsController, PaymentsService, PaymentsModule)
- **Notifications** (NotificationsController, NotificationsService, NotificationsModule)

Each controller should have placeholder endpoints matching the docs/SPECIFICATION.md API section.

### Step 8: Create the Hedera system module

Create `packages/api/src/modules/hedera/hedera.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Client,
  PrivateKey,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicUpdateTransaction,
  TokenMintTransaction,
  TokenFreezeTransaction,
  TokenWipeTransaction,
  TransferTransaction,
  Hbar,
  TokenSupplyType,
  TokenType,
} from '@hashgraph/sdk';

@Injectable()
export class HederaService {
  private client: Client;
  private operatorKey: PrivateKey;

  constructor(private configService: ConfigService) {
    this.initializeClient();
  }

  private initializeClient() {
    const network = this.configService.get<string>('hedera.network');
    const operatorId = this.configService.get<string>('hedera.operatorId');
    const operatorKeyHex = this.configService.get<string>('hedera.operatorKey');

    if (network === 'testnet') {
      this.client = Client.forTestnet();
    } else if (network === 'mainnet') {
      this.client = Client.forMainnet();
    } else {
      this.client = Client.forTestnet();
    }

    this.operatorKey = PrivateKey.fromStringDer(operatorKeyHex);
    this.client.setOperator(operatorId, this.operatorKey);
  }

  /**
   * Create a new HCS topic
   */
  async createTopic(options: {
    submitKey?: string;
    adminKey?: string;
    memo?: string;
  }): Promise<string> {
    const transaction = new TopicCreateTransaction()
      .setMemo(options.memo || 'Hedera Social Platform Topic')
      .freezeWith(this.client);

    if (options.submitKey) {
      transaction.setSubmitKey(options.submitKey);
    }
    if (options.adminKey) {
      transaction.setAdminKey(options.adminKey);
    }

    const response = await transaction.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    return receipt.topicId.toString();
  }

  /**
   * Submit a message to an HCS topic
   */
  async submitMessage(topicId: string, message: Buffer): Promise<string> {
    const transaction = new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message)
      .freezeWith(this.client);

    const response = await transaction.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    return receipt.topicSequenceNumber.toString();
  }

  /**
   * Update an HCS topic
   */
  async updateTopic(
    topicId: string,
    options: { submitKey?: string; adminKey?: string; memo?: string },
  ): Promise<void> {
    const transaction = new TopicUpdateTransaction().setTopicId(topicId);

    if (options.memo) transaction.setMemo(options.memo);
    if (options.submitKey) transaction.setSubmitKey(options.submitKey);
    if (options.adminKey) transaction.setAdminKey(options.adminKey);

    transaction.freezeWith(this.client);
    const response = await transaction.execute(this.client);
    await response.getReceipt(this.client);
  }

  /**
   * Mint a DID NFT to a user's account
   */
  async mintDIDNft(
    tokenId: string,
    metadataCid: string,
    recipientAccountId: string,
  ): Promise<{ serial: number; transactionId: string }> {
    const metadata = Buffer.from(
      JSON.stringify({ metadataCid, type: 'DID_NFT' }),
    );

    const transaction = new TokenMintTransaction()
      .setTokenId(tokenId)
      .addMetadata(metadata)
      .freezeWith(this.client);

    const response = await transaction.execute(this.client);
    const receipt = await response.getReceipt(this.client);

    return {
      serial: receipt.serials[0].toNumber(),
      transactionId: response.transactionId.toString(),
    };
  }

  /**
   * Freeze a token on an account (for soulbound NFTs)
   */
  async freezeToken(tokenId: string, accountId: string): Promise<void> {
    const transaction = new TokenFreezeTransaction()
      .setTokenId(tokenId)
      .setAccountId(accountId)
      .freezeWith(this.client);

    const response = await transaction.execute(this.client);
    await response.getReceipt(this.client);
  }

  /**
   * Wipe (burn) an NFT from an account
   */
  async wipeNft(
    tokenId: string,
    accountId: string,
    serial: number,
  ): Promise<void> {
    const transaction = new TokenWipeTransaction()
      .setTokenId(tokenId)
      .setAccountId(accountId)
      .addSerialNumber(serial)
      .freezeWith(this.client);

    const response = await transaction.execute(this.client);
    await response.getReceipt(this.client);
  }

  /**
   * Transfer HBAR between accounts
   */
  async transferHbar(
    fromAccountId: string,
    toAccountId: string,
    amount: number,
  ): Promise<string> {
    const transaction = new TransferTransaction()
      .addHbarTransfer(fromAccountId, new Hbar(-amount))
      .addHbarTransfer(toAccountId, new Hbar(amount))
      .freezeWith(this.client);

    const response = await transaction.execute(this.client);
    const receipt = await response.getReceipt(this.client);
    return receipt.transactionId.toString();
  }

  /**
   * Get the client instance
   */
  getClient(): Client {
    return this.client;
  }

  /**
   * Close the client
   */
  async close() {
    await this.client.close();
  }
}
```

Create `packages/api/src/modules/hedera/mirror-node.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MirrorNodeService {
  private baseUrl: string;

  constructor(private configService: ConfigService) {
    const network = this.configService.get<string>('hedera.network');
    if (network === 'testnet') {
      this.baseUrl = 'https://testnet.mirrornode.hedera.com/api/v1';
    } else {
      this.baseUrl = 'https://mainnet-public.mirrornode.hedera.com/api/v1';
    }
  }

  /**
   * Get messages from an HCS topic
   */
  async getTopicMessages(
    topicId: string,
    options?: { limit?: number; sequenceNumberLt?: number },
  ): Promise<Record<string, unknown>[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.sequenceNumberLt)
      params.append('sequencenumber.lte', options.sequenceNumberLt.toString());

    const url = `${this.baseUrl}/topics/${topicId}/messages?${params}`;
    const response = await fetch(url);
    const data = await response.json();
    return data.messages || [];
  }

  /**
   * Get account information
   */
  async getAccountInfo(accountId: string): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl}/accounts/${accountId}`;
    const response = await fetch(url);
    return response.json();
  }

  /**
   * Get NFT information
   */
  async getNftInfo(tokenId: string, serial: number): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl}/tokens/${tokenId}/nfts/${serial}`;
    const response = await fetch(url);
    return response.json();
  }

  /**
   * Poll for new topic messages (simplified subscription)
   */
  async subscribeToTopic(
    topicId: string,
    onMessage: (message: Record<string, unknown>) => void,
    pollIntervalMs: number = 5000,
  ): Promise<void> {
    let lastSequence = 0;

    const poll = async () => {
      try {
        const messages = await this.getTopicMessages(topicId);
        messages.forEach((msg) => {
          if (msg.sequence_number > lastSequence) {
            lastSequence = msg.sequence_number;
            onMessage(msg);
          }
        });
      } catch (error) {
        this.logger.error('Error polling topic messages:', error);
      }
    };

    // Start polling
    setInterval(poll, pollIntervalMs);
  }
}
```

Create `packages/api/src/modules/hedera/hedera.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { HederaService } from './hedera.service';
import { MirrorNodeService } from './mirror-node.service';

@Module({
  providers: [HederaService, MirrorNodeService],
  exports: [HederaService, MirrorNodeService],
})
export class HederaModule {}
```

### Step 9: Create integration services (placeholder structure)

Create `packages/api/src/modules/integrations/mirsad-ai/mirsad-ai.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MirsadAiService {
  constructor(private configService: ConfigService) {}

  async submitKyc(kycData: Record<string, unknown>): Promise<Record<string, unknown>> {
    const mirsadEnabled = this.configService.get<boolean>('mirsadKyc.enabled');
    if (mirsadEnabled) {
      // Call actual Mirsad AI API
      return {};
    }
    // Mock mode (disabled)
    return { kycId: 'mock-' + Date.now(), status: 'approved' };
  }

  async checkKycStatus(kycId: string): Promise<Record<string, unknown>> {
    // TODO: implement
    return {};
  }
}
```

Create `packages/api/src/modules/integrations/tamam-custody/tamam-custody.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TamamCustodyService {
  constructor(private configService: ConfigService) {}

  async generateKeypair(): Promise<Record<string, unknown>> {
    const mock = this.configService.get<boolean>('tamam.custody.mock');
    if (mock) {
      // Return mock keypair
      return {
        publicKey: '0x' + '0'.repeat(64),
        keyShareId: 'mock-key-' + Date.now(),
      };
    }
    // Call actual Tamam Custody API
    return {};
  }
}
```

Create `packages/api/src/modules/integrations/tamam-rails/tamam-rails.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TamamRailsService {
  constructor(private configService: ConfigService) {}

  async executeTransfer(transferData: Record<string, unknown>): Promise<Record<string, unknown>> {
    const mock = this.configService.get<boolean>('tamam.rails.mock');
    if (mock) {
      // Return mock transfer confirmation
      return { txId: 'mock-tx-' + Date.now(), status: 'confirmed' };
    }
    // Call actual Tamam Rails API
    return {};
  }

  async checkBalance(accountId: string): Promise<Record<string, unknown>> {
    // TODO: implement
    return {};
  }
}
```

Create `packages/api/src/modules/integrations/ipfs/ipfs.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class IpfsService {
  constructor(private configService: ConfigService) {}

  async uploadFile(buffer: Buffer, filename: string): Promise<string> {
    // TODO: implement Pinata upload
    return 'QmMock' + Date.now();
  }

  async uploadJson(data: Record<string, unknown>): Promise<string> {
    // TODO: implement Pinata JSON upload
    return 'QmMock' + Date.now();
  }
}
```

### Step 10: Create database data-source configuration

Create `packages/api/src/database/data-source.ts`:

```typescript
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'hedera_social',
  password: process.env.DB_PASSWORD || 'devpassword',
  database: process.env.DB_DATABASE || 'hedera_social',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  entities: ['src/database/entities/**/*.ts'],
  migrations: ['src/database/migrations/**/*.ts'],
  subscribers: [],
});
```

### Step 11: Update app.module.ts with all module imports

Replace `packages/api/src/app.module.ts` with:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import { AuthModule } from './modules/auth/auth.module';
import { IdentityModule } from './modules/identity/identity.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { SocialModule } from './modules/social/social.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { HederaModule } from './modules/hedera/hedera.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '../../.env',
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('database.host'),
        port: configService.get('database.port'),
        username: configService.get('database.username'),
        password: configService.get('database.password'),
        database: configService.get('database.database'),
        entities: ['src/database/entities/**/*.ts'],
        migrations: ['src/database/migrations/**/*.ts'],
        synchronize: false,
        logging: configService.get('database.logging'),
      }),
    }),
    // Feature modules
    AuthModule,
    IdentityModule,
    MessagingModule,
    SocialModule,
    PaymentsModule,
    NotificationsModule,
    // System modules
    HederaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

Create `packages/api/src/app.controller.ts`:

```typescript
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
```

Create `packages/api/src/app.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Welcome to Hedera Social Platform API v1';
  }
}
```

### Step 12: Verify the build

```bash
cd /sessions/exciting-sharp-mayer/mnt/social-platform
pnpm build
```

Expected output: Build succeeds for all packages, no TypeScript errors.

---

## Verification Steps

Run each of these and confirm the expected output:

| # | Command | Expected |
|---|---------|----------|
| 1 | `cd packages/api && pnpm lint` | No linting errors |
| 2 | `cd packages/api && npm run build` | Build succeeds, dist/ folder created |
| 3 | `cd packages/api && npm start` | Server starts on port 3001 |
| 4 | `curl http://localhost:3001` | Returns "Welcome to Hedera Social Platform API v1" |
| 5 | `curl http://localhost:3001/health` | Returns JSON with status: "ok" |
| 6 | `ls -la packages/api/src/modules/` | All 6 modules exist (auth, identity, messaging, social, payments, notifications) |
| 7 | `ls -la packages/api/src/modules/hedera/` | Both hedera.service.ts and mirror-node.service.ts exist |
| 8 | `grep -c "Injectable" packages/api/src/modules/**/*.service.ts` | All services are decorated with @Injectable |
| 9 | `npm run db:migrate --workspace=@hedera-social/api` | Shows "Migration completed" or "No migrations to run" (DB not yet populated with tables) |

---

## Definition of Done

- [ ] `pnpm install` completes without errors (all dependencies installed in packages/api)
- [ ] All 6 feature modules exist with controller + service + module files
- [ ] Hedera system module exists with hedera.service.ts and mirror-node.service.ts
- [ ] Integration services exist (mirsad-ai, tamam-custody, tamam-rails, ipfs)
- [ ] Database data-source.ts is configured with TypeORM
- [ ] `npm run build` succeeds from the api package
- [ ] `npm start` starts the server on port 3001 without errors
- [ ] GET /health returns { status: 'ok' }
- [ ] Root app.module.ts imports all 8 modules
- [ ] Configuration is loaded from .env file
- [ ] JWT module is configured in AuthModule with secret from .env
- [ ] TypeORM is configured to connect to Postgres
- [ ] All services are exported from their modules for use by other modules

---

## Troubleshooting

**Problem:** "Cannot find module '@nestjs/cli'"
**Fix:** `npm install -g @nestjs/cli`, or run commands via npx: `npx nest start`

**Problem:** "port 3001 already in use"
**Fix:** Check what's using the port: `lsof -i :3001`. Kill it or change API_PORT in .env.

**Problem:** "Cannot find name 'Buffer'"
**Fix:** Add `"lib": ["ES2022"]` to tsconfig.json compiler options.

**Problem:** "TypeORM migrations not found"
**Fix:** Make sure `entities` and `migrations` paths in data-source.ts match where you're creating files (P0-T05 will populate these).

**Problem:** "HEDERA_OPERATOR_KEY not found"
**Fix:** You'll fill this in during P0-T08 (Testnet Setup). For now, it's OK to skip — the service initialization will fail until you have a key, but the module structure is ready.

---

## Files Created in This Task

```
packages/api/
├── package.json                           (updated with all deps)
├── tsconfig.json
├── src/
│   ├── main.ts                            (entry point)
│   ├── app.module.ts                      (root module)
│   ├── app.controller.ts
│   ├── app.service.ts
│   ├── config/
│   │   └── configuration.ts               (all env vars loaded here)
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   └── auth.module.ts
│   │   ├── identity/
│   │   │   ├── identity.controller.ts
│   │   │   ├── identity.service.ts
│   │   │   └── identity.module.ts
│   │   ├── messaging/
│   │   │   ├── messaging.controller.ts
│   │   │   ├── messaging.service.ts
│   │   │   └── messaging.module.ts
│   │   ├── social/
│   │   │   ├── social.controller.ts
│   │   │   ├── social.service.ts
│   │   │   └── social.module.ts
│   │   ├── payments/
│   │   │   ├── payments.controller.ts
│   │   │   ├── payments.service.ts
│   │   │   └── payments.module.ts
│   │   ├── notifications/
│   │   │   ├── notifications.controller.ts
│   │   │   ├── notifications.service.ts
│   │   │   └── notifications.module.ts
│   │   ├── hedera/
│   │   │   ├── hedera.service.ts          (COMPLETE HederaService with all methods)
│   │   │   ├── mirror-node.service.ts     (Mirror Node REST client)
│   │   │   └── hedera.module.ts
│   │   └── integrations/
│   │       ├── mirsad/
│   │       │   └── mirsad-ai.service.ts
│   │       ├── tamam-custody/
│   │       │   └── tamam-custody.service.ts
│   │       ├── tamam-rails/
│   │       │   └── tamam-rails.service.ts
│   │       └── ipfs/
│   │           └── ipfs.service.ts
│   ├── database/
│   │   ├── data-source.ts                 (TypeORM config for migrations)
│   │   ├── entities/                      (empty, to be populated in P0-T05)
│   │   └── migrations/                    (empty, to be generated in P0-T05)
│   └── common/
│       ├── decorators/
│       ├── filters/
│       ├── guards/
│       ├── interceptors/
│       └── dto/
├── test/
│   └── jest-e2e.json
├── .eslintrc.js
├── jest.config.js
└── README.md
```

---

## What Happens Next

After this task is complete:
- **P0-T05** (Database Schema) — creates all TypeORM entities that inject into this module structure
- **P0-T06** (Hedera Service) — expands the HederaService with full SDK integration tests
- All 6 feature modules are ready to have controllers and services implemented in Phase 1 (P1-T01 through P1-T06)
