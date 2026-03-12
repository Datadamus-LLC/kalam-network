# Phase 1: Identity & Onboarding

**Status**: PARTIALLY IMPLEMENTABLE. Wallet creation and KYC are partially blocked.

**Scope**: Tasks T09–T13

---

## Design Pattern for Blocked Features

For features that depend on external APIs we don't have docs for (Tamam MPC Custody, Mirsad AI), the implementation pattern is:

1. **Implement the full flow** (database, validation, error handling)
2. **Throw NotImplementedError at the external call point** (not a mock, but an honest admission of a gap)
3. **Clear error message** to the user: "Feature blocked pending documentation"
4. **No simulated success** — fake success is worse than honest failure

Example:
```typescript
async generateWallet(userId: string): Promise<Wallet> {
  // All the DB prep, validation, etc. ✓
  // Then when we need the Tamam MPC call:
  throw new NotImplementedError(
    'Tamam MPC Custody API integration blocked — awaiting API documentation'
  );
}
```

---

## Authentication & OTP

**Status**: FULLY IMPLEMENTABLE

### Backend: Auth Module Structure

**File**: `apps/backend/src/auth/auth.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { User } from './entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: process.env.JWT_EXPIRY || '24h' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

### User Entity

**File**: `apps/backend/src/auth/entities/user.entity.ts`

```typescript
import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryColumn('varchar', { length: 64 })
  id: string; // UUID

  @Column('varchar', { length: 20 })
  username: string;

  @Column('varchar', { length: 255 })
  email: string;

  @Column('varchar', { length: 20, nullable: true })
  phoneNumber?: string;

  @Column('varchar', { length: 255, nullable: true })
  profilePictureCID?: string; // IPFS CID

  @Column('varchar', { length: 500, nullable: true })
  bio?: string;

  @Column('varchar', { length: 200 })
  accountId: string; // Hedera account ID (0.0.X)

  @Column('varchar', { length: 1000 })
  publicKey: string; // For key exchange

  @Column('boolean', { default: false })
  walletCreated: boolean;

  @Column('boolean', { default: false })
  kycApproved: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### Auth Controller

**File**: `apps/backend/src/auth/auth.controller.ts`

```typescript
import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { AuthService } from './auth.service';

interface RequestOTPDto {
  email?: string;
  phoneNumber?: string;
}

interface ValidateOTPDto {
  email?: string;
  phoneNumber?: string;
  otp: string;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('request-otp')
  async requestOTP(@Body() dto: RequestOTPDto): Promise<{ message: string }> {
    await this.authService.requestOTP(dto.email, dto.phoneNumber);
    return { message: 'OTP sent. Check your email/SMS.' };
  }

  @Post('validate-otp')
  @HttpCode(200)
  async validateOTP(@Body() dto: ValidateOTPDto): Promise<AuthResponse> {
    return this.authService.validateOTP(dto.email, dto.phoneNumber, dto.otp);
  }
}
```

### Auth Service

**File**: `apps/backend/src/auth/auth.service.ts`

```typescript
import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { OTPService } from './otp.service';
import { v4 as uuid } from 'uuid';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private otpService: OTPService,
  ) {}

  async requestOTP(email?: string, phoneNumber?: string): Promise<void> {
    if (!email && !phoneNumber) {
      throw new BadRequestException('Email or phone number required');
    }

    const contact = email || phoneNumber!;

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const ttl = 10 * 60 * 1000; // 10 minutes

    // Store in Redis
    await this.otpService.storeOTP(contact, otp, ttl);

    // Send OTP (email or SMS)
    if (email) {
      console.log(`📧 OTP for ${email}: ${otp}`); // Dev: log to console
      // TODO: integrate Nodemailer or SendGrid
    } else if (phoneNumber) {
      console.log(`📱 OTP for ${phoneNumber}: ${otp}`); // Dev: log to console
      // TODO: integrate Twilio or similar
    }
  }

  async validateOTP(
    email?: string,
    phoneNumber?: string,
    otp?: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    if (!email && !phoneNumber) {
      throw new BadRequestException('Email or phone number required');
    }

    if (!otp) {
      throw new BadRequestException('OTP required');
    }

    const contact = email || phoneNumber!;

    // Verify OTP from Redis
    const isValid = await this.otpService.verifyOTP(contact, otp);
    if (!isValid) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // Find or create user
    let user = await this.userRepository.findOne({
      where: email ? { email } : { phoneNumber },
    });

    if (!user) {
      user = this.userRepository.create({
        id: uuid(),
        username: `user_${Date.now()}`, // Placeholder — user can update
        email: email || '',
        phoneNumber: phoneNumber || '',
        accountId: '', // Set during wallet creation
        publicKey: '', // Set during wallet creation
      });
      await this.userRepository.save(user);
    }

    // Generate JWT tokens
    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email },
      { expiresIn: process.env.JWT_EXPIRY || '24h' }
    );

    const refreshToken = this.jwtService.sign(
      { sub: user.id, type: 'refresh' },
      { expiresIn: '30d' }
    );

    // Clear OTP
    await this.otpService.clearOTP(contact);

    return {
      accessToken,
      refreshToken,
      expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
    };
  }
}
```

### OTP Service

**File**: `apps/backend/src/auth/otp.service.ts`

Uses Redis for OTP storage.

```typescript
import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { InjectRedis } from '@liaoliao/nestjs-redis';

@Injectable()
export class OTPService {
  constructor(@InjectRedis() private redis: Redis) {}

  async storeOTP(contact: string, otp: string, ttl: number): Promise<void> {
    const key = `otp:${contact}`;
    await this.redis.setex(key, Math.floor(ttl / 1000), otp);
  }

  async verifyOTP(contact: string, otp: string): Promise<boolean> {
    const key = `otp:${contact}`;
    const stored = await this.redis.get(key);
    return stored === otp;
  }

  async clearOTP(contact: string): Promise<void> {
    const key = `otp:${contact}`;
    await this.redis.del(key);
  }
}
```

### JWT Strategy

**File**: `apps/backend/src/auth/jwt.strategy.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: JwtPayload): Promise<User | null> {
    return this.userRepository.findOne({ where: { id: payload.sub } });
  }
}
```

---

## Wallet Creation (Hedera Account + Keypair)

**Status**: PARTIALLY BLOCKED on Tamam MPC Custody

### Blocker Identification

```
┌─────────────────────────────────────────┐
│ Wallet Creation Flow                    │
├─────────────────────────────────────────┤
│ 1. User requests wallet creation        │ ✓ Implementable
│ 2. Generate keypair                     │ ❌ BLOCKED: Tamam MPC Custody
│ 3. Create Hedera account                │ ✓ Implementable (TransferTransaction)
│ 4. Store wallet data encrypted          │ ✓ Implementable
└─────────────────────────────────────────┘
```

**What we're blocked on**: Tamam MPC Custody API generates and securely stores the keypair. We need:
- API endpoint: `POST /v1/keypairs`
- Response: `{ publicKey: string }`
- We get the public key, but private key stays in Tamam MPC's vault

**Workaround for Phase 1 demo**:
- Implement the full flow as if Tamam MPC works
- Have `Tamam MPCCustodyService.generateKeyPair()` throw `NotImplementedError`
- UI will show: "Wallet creation blocked — awaiting Tamam MPC Custody integration"

### Wallet Module Structure

**File**: `apps/backend/src/wallet/wallet.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { Tamam MPCCustodyService } from './tamam-custody.service';
import { Wallet } from './entities/wallet.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Wallet])],
  controllers: [WalletController],
  providers: [WalletService, Tamam MPCCustodyService],
  exports: [WalletService],
})
export class WalletModule {}
```

### Wallet Entity

**File**: `apps/backend/src/wallet/entities/wallet.entity.ts`

```typescript
import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('wallets')
export class Wallet {
  @PrimaryColumn('varchar', { length: 64 })
  userId: string; // UUID from users table

  @Column('varchar', { length: 20 })
  accountId: string; // Hedera account ID (0.0.X)

  @Column('varchar', { length: 1000 })
  publicKey: string; // From Tamam MPC Custody

  @Column('varchar', { length: 1000 })
  encryptedPrivateKey: string; // BLOCKED: Tamam MPC stores this, we don't

  @Column('varchar', { length: 20 })
  status: 'pending_custody' | 'active' | 'frozen'; // pending = awaiting Tamam MPC response

  @CreateDateColumn()
  createdAt: Date;
}
```

### Tamam MPC Custody Service

**File**: `apps/backend/src/wallet/tamam-custody.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { NotImplementedError } from '../common/errors';

interface Tamam MPCKeyPair {
  publicKey: string;
  // privateKey is never returned — stays in Tamam MPC's vault
}

@Injectable()
export class Tamam MPCCustodyService {
  /**
   * BLOCKED: Awaiting Tamam MPC Custody API documentation.
   * Expected to call: POST /v1/keypairs with userId and return { publicKey }
   */
  async generateKeyPair(userId: string): Promise<Tamam MPCKeyPair> {
    throw new NotImplementedError(
      'Tamam MPC Custody API integration blocked — awaiting API documentation. ' +
      'Expected endpoint: POST /v1/keypairs'
    );
  }

  /**
   * BLOCKED: Awaiting Tamam MPC Custody API documentation.
   * Expected to return wallet status from Tamam MPC.
   */
  async getWalletStatus(userId: string): Promise<string> {
    throw new NotImplementedError('Tamam MPC Custody API not yet integrated');
  }
}
```

### Wallet Service

**File**: `apps/backend/src/wallet/wallet.service.ts`

```typescript
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import { Tamam MPCCustodyService } from './tamam-custody.service';
import { HederaClient } from '@hedera-social/hedera-config';
import {
  TransferTransaction,
  Client,
  AccountCreateTransaction,
  Key,
  PublicKey,
} from '@hashgraph/sdk';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    private tamamCustodyService: Tamam MPCCustodyService,
  ) {}

  async createWallet(userId: string): Promise<Wallet> {
    // Check if wallet already exists
    const existing = await this.walletRepository.findOne({ where: { userId } });
    if (existing) {
      throw new BadRequestException('Wallet already exists for this user');
    }

    // Step 1: Generate keypair via Tamam MPC (BLOCKED)
    const keyPair = await this.tamamCustodyService.generateKeyPair(userId);

    // Step 2: Create Hedera account using the public key
    const client = HederaClient.getInstance(
      process.env.HEDERA_NETWORK as 'testnet' | 'mainnet' | 'previewnet',
      process.env.HEDERA_ACCOUNT_ID!,
      process.env.HEDERA_PRIVATE_KEY!,
    );

    const accountId = await this.createHederaAccount(client, keyPair.publicKey);

    // Step 3: Store wallet in database
    const wallet = this.walletRepository.create({
      userId,
      accountId,
      publicKey: keyPair.publicKey,
      encryptedPrivateKey: '', // BLOCKED: never stored — Tamam MPC holds it
      status: 'active',
    });

    await this.walletRepository.save(wallet);
    return wallet;
  }

  private async createHederaAccount(
    client: Client,
    publicKeyString: string,
  ): Promise<string> {
    /**
     * IMPLEMENTABLE: Use TransferTransaction to create a Hedera account.
     * This is the standard way to auto-create accounts on the Hedera network.
     */
    const publicKey = PublicKey.fromString(publicKeyString);

    const transaction = new AccountCreateTransaction()
      .setKey(publicKey)
      .setInitialBalance(1_000_000); // 0.01 HBAR for fees

    const submitted = await transaction.execute(client);
    const receipt = await submitted.getReceipt(client);

    if (!receipt.accountId) {
      throw new Error('Failed to create Hedera account');
    }

    return receipt.accountId.toString();
  }

  async getWallet(userId: string): Promise<Wallet | null> {
    return this.walletRepository.findOne({ where: { userId } });
  }
}
```

### Wallet Controller

**File**: `apps/backend/src/wallet/wallet.controller.ts`

```typescript
import { Controller, Post, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WalletService } from './wallet.service';

@Controller('wallet')
export class WalletController {
  constructor(private walletService: WalletService) {}

  @Post('create')
  @UseGuards(JwtAuthGuard)
  async createWallet(@Request() req: any) {
    return this.walletService.createWallet(req.user.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getWallet(@Request() req: any) {
    return this.walletService.getWallet(req.user.id);
  }
}
```

---

## KYC/KYB Flow

**Status**: PARTIALLY BLOCKED on Mirsad AI

### Blocker Identification

```
┌──────────────────────────────────────────────┐
│ KYC Flow                                     │
├──────────────────────────────────────────────┤
│ 1. User submits KYC data (encrypted)         │ ✓ Implementable
│ 2. Mirsad AI verifies data                      │ ❌ BLOCKED: Mirsad AI API
│ 3. Backend receives approval webhook         │ ✓ Implementable
│ 4. Mint DID NFT token                        │ ✓ Implementable (HTS)
│ 5. Update user KYC status                    │ ✓ Implementable
└──────────────────────────────────────────────┘
```

**What we're blocked on**: Mirsad AI API verification. We need:
- Endpoint to submit KYC documents and personal data
- Webhook callback for approval/rejection
- Response: `{ kycId: string, status: 'approved' | 'rejected' }`

### KYC Module Structure

**File**: `apps/backend/src/kyc/kyc.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { Mirsad AIService } from './mirsad.service';
import { KYCSubmission } from './entities/kyc-submission.entity';

@Module({
  imports: [TypeOrmModule.forFeature([KYCSubmission])],
  controllers: [KycController],
  providers: [KycService, Mirsad AIService],
  exports: [KycService],
})
export class KycModule {}
```

### KYC Entity

**File**: `apps/backend/src/kyc/entities/kyc-submission.entity.ts`

```typescript
import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('kyc_submissions')
export class KYCSubmission {
  @PrimaryColumn('varchar', { length: 64 })
  userId: string; // UUID

  @Column('varchar', { length: 20 })
  status: 'pending' | 'approved' | 'rejected';

  @Column('varchar', { length: 1000, nullable: true })
  encryptedData: string; // AES-256-GCM encrypted personal info

  @Column('varchar', { length: 1000, nullable: true })
  mirsadKycId?: string; // Reference to Mirsad AI submission

  @Column('varchar', { length: 100, nullable: true })
  didNFTTokenId?: string; // HTS token ID after approval

  @CreateDateColumn()
  submittedAt: Date;

  @UpdateDateColumn()
  reviewedAt?: Date;
}
```

### Mirsad AI Service

**File**: `apps/backend/src/kyc/mirsad.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { NotImplementedError } from '../common/errors';

interface Mirsad AIKYCRequest {
  encryptedData: string;
  documentType: 'passport' | 'drivers_license' | 'national_id';
}

interface Mirsad AIKYCResponse {
  kycId: string;
  status: 'approved' | 'rejected' | 'pending';
  message?: string;
}

@Injectable()
export class Mirsad AIService {
  /**
   * BLOCKED: Awaiting Mirsad AI API documentation.
   * Expected to call: POST /v1/kyc with encrypted personal data.
   */
  async submitKYC(request: Mirsad AIKYCRequest): Promise<Mirsad AIKYCResponse> {
    throw new NotImplementedError(
      'Mirsad AI API integration blocked — awaiting API documentation. ' +
      'Expected endpoint: POST /v1/kyc with encrypted personal data'
    );
  }

  /**
   * BLOCKED: Awaiting Mirsad AI webhook setup.
   * Expected to be called by Mirsad AI when KYC verification completes.
   */
  async handleKYCCallback(kycId: string, status: string): Promise<void> {
    throw new NotImplementedError('Mirsad AI webhook handler not yet implemented');
  }
}
```

### KYC Service

**File**: `apps/backend/src/kyc/kyc.service.ts`

```typescript
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KYCSubmission } from './entities/kyc-submission.entity';
import { Mirsad AIService } from './mirsad.service';
import { AES256GCM } from '@hedera-social/crypto';
import { HederaClient } from '@hedera-social/hedera-config';
import { TokenMintTransaction } from '@hashgraph/sdk';

@Injectable()
export class KycService {
  private readonly DID_NFT_TOKEN_ID = process.env.DID_NFT_TOKEN_ID || '0.0.0';

  constructor(
    @InjectRepository(KYCSubmission)
    private kycRepository: Repository<KYCSubmission>,
    private mirsadService: Mirsad AIService,
  ) {}

  async submitKYC(
    userId: string,
    personalData: Record<string, string>,
  ): Promise<KYCSubmission> {
    // Check if already submitted
    const existing = await this.kycRepository.findOne({
      where: { userId },
    });

    if (existing && existing.status === 'approved') {
      throw new BadRequestException('KYC already approved');
    }

    // Encrypt personal data with AES-256-GCM
    const key = await AES256GCM.generateKey();
    const encryptedData = await AES256GCM.encrypt(
      JSON.stringify(personalData),
      key,
    );

    // Submit to Mirsad AI (BLOCKED)
    const mirsadResponse = await this.mirsadService.submitKYC({
      encryptedData,
      documentType: 'passport', // TODO: accept from user
    });

    // Create submission record
    const submission = this.kycRepository.create({
      userId,
      status: mirsadResponse.status,
      encryptedData,
      mirsadKycId: mirsadResponse.kycId,
    });

    await this.kycRepository.save(submission);
    return submission;
  }

  /**
   * Called when Mirsad AI webhook notifies us of KYC approval.
   * IMPLEMENTABLE: Mint DID NFT token and update KYC status.
   */
  async approveKYC(userId: string, mirsadKycId: string): Promise<KYCSubmission> {
    const submission = await this.kycRepository.findOne({
      where: { userId, mirsadKycId },
    });

    if (!submission) {
      throw new BadRequestException('KYC submission not found');
    }

    // Mint DID NFT
    const client = HederaClient.getInstance(
      process.env.HEDERA_NETWORK as 'testnet' | 'mainnet' | 'previewnet',
      process.env.HEDERA_ACCOUNT_ID!,
      process.env.HEDERA_PRIVATE_KEY!,
    );

    const transaction = new TokenMintTransaction()
      .setTokenId(this.DID_NFT_TOKEN_ID)
      .setMetadata([Buffer.from(JSON.stringify({ userId, approvedAt: Date.now() }))])
      .addNftSerialNumber(1);

    const submitted = await transaction.execute(client);
    await submitted.getReceipt(client);

    submission.status = 'approved';
    submission.didNFTTokenId = this.DID_NFT_TOKEN_ID;
    submission.reviewedAt = new Date();

    await this.kycRepository.save(submission);
    return submission;
  }

  async getKYC(userId: string): Promise<KYCSubmission | null> {
    return this.kycRepository.findOne({ where: { userId } });
  }
}
```

### KYC Controller

**File**: `apps/backend/src/kyc/kyc.controller.ts`

```typescript
import { Controller, Post, Get, Body, UseGuards, Request, Webhook } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { KycService } from './kyc.service';

@Controller('kyc')
export class KycController {
  constructor(private kycService: KycService) {}

  @Post('submit')
  @UseGuards(JwtAuthGuard)
  async submitKYC(
    @Request() req: any,
    @Body() data: Record<string, string>,
  ) {
    return this.kycService.submitKYC(req.user.id, data);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getKYC(@Request() req: any) {
    return this.kycService.getKYC(req.user.id);
  }

  /**
   * Webhook endpoint for Mirsad AI to notify us of KYC approval.
   * BLOCKED: Awaiting Mirsad AI webhook documentation.
   */
  @Post('webhook/mirsad')
  async handleMirsad AIWebhook(
    @Body() payload: { userId: string; kycId: string; status: string }
  ) {
    if (payload.status === 'approved') {
      return this.kycService.approveKYC(payload.userId, payload.kycId);
    }
    return { message: 'KYC rejected or pending' };
  }
}
```

---

## Profile CRUD

**Status**: FULLY IMPLEMENTABLE

Create a simple profile service that uses the existing User entity:

```typescript
// apps/backend/src/profile/profile.service.ts
async updateProfile(
  userId: string,
  updates: Partial<{ username; bio; profilePictureCID }>,
): Promise<User> {
  // Update user record in database
  // NO HTS operations required at this stage
}

async getProfile(userId: string): Promise<User> {
  // Return user details
}
```

---

## Frontend Onboarding Flow

**Status**: FULLY IMPLEMENTABLE

### Pages Structure

```
apps/frontend/app/(auth)/
├── login/page.tsx          # Email/phone form
├── register/page.tsx       # Creates user
└── otp/page.tsx            # OTP verification

apps/frontend/app/(onboarding)/
├── kyc/page.tsx            # KYC form
├── kyc-confirmation/page.tsx
└── wallet/page.tsx         # Shows wallet status
```

### Example: Login Page

```typescript
// apps/frontend/app/(auth)/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRequestOTP = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        router.push(`/auth/otp?email=${email}`);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h1>Login to Hedera Social</h1>
      <input
        type="email"
        placeholder="Enter your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button onClick={handleRequestOTP} disabled={loading}>
        {loading ? 'Sending OTP...' : 'Request OTP'}
      </button>
    </div>
  );
}
```

### Example: Wallet Creation Page

```typescript
// apps/frontend/app/(onboarding)/wallet/page.tsx
'use client';

import { useState, useEffect } from 'react';

export default function WalletPage() {
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateWallet = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/wallet/create', { method: 'POST' });
      const data = await res.json();

      if (res.ok) {
        setWallet(data);
      } else {
        // If Tamam MPC is not integrated, error message will be informative
        setError(data.message || 'Failed to create wallet');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Create Your Hedera Wallet</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {wallet ? (
        <p>✅ Wallet created: {wallet.accountId}</p>
      ) : (
        <button onClick={handleCreateWallet} disabled={loading}>
          {loading ? 'Creating...' : 'Create Wallet'}
        </button>
      )}
    </div>
  );
}
```

---

## Key Takeaways for Phase 1

- **OTP auth** is fully implementable with Redis + email logging
- **Wallet creation** is blocked on Tamam MPC Custody API — we implement the flow and throw NotImplementedError when needed
- **KYC** is blocked on Mirsad AI API — same pattern: full flow, NotImplementedError at the Mirsad AI call
- **Profile CRUD** is fully implementable — no blockers
- **Frontend** can be built to handle these errors gracefully
- **Error messages** are clear and guide the user: "Feature blocked pending documentation"

Next: Phase 2 (Messaging) — fully implementable, no blockers.
