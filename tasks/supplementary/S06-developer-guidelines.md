# S06: Developer Guidelines & Code Review Checklist

| Field | Value |
|-------|-------|
| Task ID | S06 |
| Priority | 🔴 P0 — Read Before Writing Any Code |
| Estimated Time | 1 hour (read + understand) |
| Depends On | Nothing |
| Phase | Supplementary — Engineering Standards |
| Assignee | All developers (mandatory reading) |
| Created | 2026-03-11 |
| Status | Active |

---

## Overview

**This is NOT a coding task.** This is a **mandatory reference document** that all developers must read and understand before writing any code on the Hedera Social Platform. It defines:

- Where files belong (project structure)
- How files should be named (conventions)
- What code patterns to use (best practices)
- How to work with Git (workflow)
- Rules specific to Hedera and blockchain operations
- Common mistakes to avoid
- Security checklist for code reviews

**Expected time:** 1 hour to read. Then reference throughout development.

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Naming Conventions](#naming-conventions)
3. [Code Patterns & Standards](#code-patterns--standards)
4. [Git Workflow](#git-workflow)
5. [Hedera-Specific Rules](#hedera-specific-rules)
6. [Task Completion Protocol](#task-completion-protocol)
7. [Common Mistakes to Avoid](#common-mistakes-to-avoid)
8. [Security Checklist](#security-checklist)
9. [Code Review Process](#code-review-process)
10. [Code Quality: Human-Grade Standards](#code-quality-human-grade-standards)

---

## Project Structure

```
social-platform/
├── apps/
│   └── web/                           # Next.js 14 Frontend
│       ├── src/
│       │   ├── app/                   # Next.js App Router pages
│       │   │   ├── page.tsx           # Homepage
│       │   │   ├── auth/              # /auth routes
│       │   │   ├── dashboard/         # /dashboard routes
│       │   │   ├── messages/          # /messages routes
│       │   │   ├── payments/          # /payments routes
│       │   │   └── layout.tsx         # Root layout
│       │   ├── components/            # React components
│       │   │   ├── ui/                # Reusable UI primitives
│       │   │   │   ├── button.tsx     # Button component
│       │   │   │   ├── input.tsx      # Input field
│       │   │   │   ├── modal.tsx      # Modal dialog
│       │   │   │   ├── card.tsx       # Card container
│       │   │   │   └── badge.tsx      # Badge/tag
│       │   │   ├── chat/              # Chat-specific components
│       │   │   │   ├── conversation-list.tsx
│       │   │   │   ├── message-bubble.tsx
│       │   │   │   └── group-settings.tsx
│       │   │   ├── payment/           # Payment widgets
│       │   │   │   ├── payment-form.tsx
│       │   │   │   ├── hbar-select.tsx
│       │   │   │   └── receipt-display.tsx
│       │   │   ├── social/            # Feed & post components
│       │   │   │   ├── post-feed.tsx
│       │   │   │   ├── post-card.tsx
│       │   │   │   ├── create-post.tsx
│       │   │   │   └── follow-button.tsx
│       │   │   ├── auth/              # Authentication components
│       │   │   │   ├── login-form.tsx
│       │   │   │   ├── signup-form.tsx
│       │   │   │   └── kyc-modal.tsx
│       │   │   └── layout/            # Layout components
│       │   │       ├── sidebar.tsx    # Navigation sidebar
│       │   │       ├── header.tsx     # Top header
│       │   │       └── footer.tsx     # Footer
│       │   ├── hooks/                 # Custom React hooks
│       │   │   ├── use-auth.ts        # Authentication hook
│       │   │   ├── use-messages.ts    # Messages hook
│       │   │   ├── use-user-profile.ts
│       │   │   └── use-balance.ts     # HBAR balance hook
│       │   ├── stores/                # Zustand state management
│       │   │   ├── auth-store.ts      # Auth state
│       │   │   ├── chat-store.ts      # Messages & conversations
│       │   │   └── ui-store.ts        # UI state (modals, etc.)
│       │   ├── lib/                   # Utilities
│       │   │   ├── api-client.ts      # API request client
│       │   │   ├── socket.ts          # WebSocket client
│       │   │   ├── env.ts             # Environment validation
│       │   │   ├── format.ts          # Formatting utilities
│       │   │   └── validation.ts      # Form validation
│       │   ├── types/                 # Frontend-only types
│       │   │   ├── api.ts             # API response types
│       │   │   ├── models.ts          # Domain models
│       │   │   └── ui.ts              # UI state types
│       │   └── middleware.ts          # Next.js middleware
│       ├── public/                    # Static assets
│       │   ├── logos/
│       │   ├── icons/
│       │   └── images/
│       └── next.config.js
│
├── packages/
│   ├── api/                           # NestJS Backend
│   │   ├── src/
│   │   │   ├── modules/               # Feature modules (one per folder)
│   │   │   │   ├── auth/
│   │   │   │   │   ├── auth.controller.ts
│   │   │   │   │   ├── auth.service.ts
│   │   │   │   │   ├── auth.module.ts
│   │   │   │   │   ├── dto/
│   │   │   │   │   │   ├── login.dto.ts
│   │   │   │   │   │   └── signup.dto.ts
│   │   │   │   │   ├── entities/
│   │   │   │   │   │   └── user.entity.ts
│   │   │   │   │   └── guards/
│   │   │   │   │       └── jwt.guard.ts
│   │   │   │   ├── identity/          # KYC, DID NFT, Profile
│   │   │   │   │   ├── identity.controller.ts
│   │   │   │   │   ├── identity.service.ts
│   │   │   │   │   ├── kyc.service.ts
│   │   │   │   │   ├── did-nft.service.ts
│   │   │   │   │   ├── profile.service.ts
│   │   │   │   │   ├── entities/
│   │   │   │   │   └── dto/
│   │   │   │   ├── messaging/         # Private & group messaging
│   │   │   │   │   ├── messaging.controller.ts
│   │   │   │   │   ├── messaging.service.ts
│   │   │   │   │   ├── conversation.service.ts
│       │   │   │   ├── message.service.ts
│       │   │   │   ├── entities/
│       │   │   │   └── dto/
│   │   │   │   ├── social/            # Posts, follows, feed
│   │   │   │   │   ├── social.controller.ts
│   │   │   │   │   ├── post.service.ts
│   │   │   │   │   ├── follow.service.ts
│   │   │   │   │   ├── feed.service.ts
│   │   │   │   │   ├── entities/
│   │   │   │   │   └── dto/
│   │   │   │   ├── payments/          # HBAR transfers
│   │   │   │   │   ├── payments.controller.ts
│   │   │   │   │   ├── payments.service.ts
│   │   │   │   │   ├── entities/
│   │   │   │   │   └── dto/
│   │   │   │   ├── notifications/     # Real-time notifications
│   │   │   │   │   ├── notifications.controller.ts
│   │   │   │   │   ├── notifications.service.ts
│   │   │   │   │   └── entities/
│   │   │   │   └── hedera/            # Hedera SDK + Mirror Node
│   │   │   │       ├── hedera.service.ts
│   │   │   │       ├── hcs.service.ts
│   │   │   │       ├── hts.service.ts
│   │   │   │       └── mirror-node.service.ts
│   │   │   ├── common/                # Shared across modules
│   │   │   │   ├── filters/
│   │   │   │   │   └── exception.filter.ts
│   │   │   │   ├── guards/
│   │   │   │   │   ├── jwt.guard.ts
│   │   │   │   │   └── roles.guard.ts
│   │   │   │   ├── interceptors/
│   │   │   │   │   ├── logging.interceptor.ts
│   │   │   │   │   └── transform.interceptor.ts
│   │   │   │   ├── pipes/
│   │   │   │   │   └── validation.pipe.ts
│   │   │   │   ├── decorators/
│   │   │   │   │   ├── user.decorator.ts
│   │   │   │   │   └── roles.decorator.ts
│   │   │   │   └── exceptions/
│   │   │   │       ├── api-error.exception.ts
│   │   │   │       └── hedera-error.exception.ts
│   │   │   ├── config/                # Configuration & env
│   │   │   │   ├── env.validation.ts
│   │   │   │   ├── configuration.ts
│   │   │   │   └── database.ts
│   │   │   ├── integrations/          # External services
│   │   │   │   ├── mirsad-ai/         # KYC service
│   │   │   │   ├── tamam/             # Wallet custody
│   │   │   │   ├── pinata/            # IPFS
│   │   │   │   └── hedera-mirror/     # Mirror Node API
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   └── test/
│   │
│   ├── shared/                        # @hedera-social/shared
│   │   ├── src/
│   │   │   ├── types/                 # All TypeScript interfaces
│   │   │   │   ├── api.ts             # API request/response types
│   │   │   │   ├── auth.ts            # Auth types
│   │   │   │   ├── user.ts            # User types
│   │   │   │   ├── messages.ts        # Message types
│   │   │   │   ├── payments.ts        # Payment types
│   │   │   │   ├── hedera.ts          # Hedera types
│   │   │   │   └── hcs.ts             # HCS message types
│   │   │   ├── constants/             # All constants
│   │   │   │   ├── error-codes.ts     # Error code enum
│   │   │   │   ├── hedera.ts          # Hedera constants
│   │   │   │   ├── validation.ts      # Validation regexes
│   │   │   │   └── messages.ts        # HCS message versions
│   │   │   └── utils/                 # Validation, formatting
│   │   │       ├── validation.ts      # Email, password validators
│   │   │       ├── format.ts          # HBAR formatting, date
│   │   │       └── encoding.ts        # Base64, hex encoding
│   │   └── package.json
│   │
│   └── crypto/                        # @hedera-social/crypto
│       ├── src/
│       │   ├── aes.ts                 # AES-256-GCM encryption
│       │   ├── key-exchange.ts        # X25519/nacl.box key exchange
│       │   ├── key-store.ts           # In-memory key storage
│       │   ├── index.ts               # Exports
│       │   └── __tests__/
│       └── package.json
│
└── scripts/                           # One-off scripts
    ├── seed.ts                        # Database seeding
    ├── create-topics.ts               # Hedera topic creation
    └── generate-operator-key.ts       # Key generation utility
```

### Key Principles

1. **One Module = One Feature** — Each NestJS module handles one domain (auth, messaging, payments)
2. **Controllers are thin** — Business logic lives in services
3. **Shared types are centralized** — Never duplicate types
4. **No circular dependencies** — Use dependency injection to break cycles
5. **Frontend components are organized by feature** — Not by type (not /containers, /presentational)

---

## Naming Conventions

### Files & Folders

| Category | Format | Example | Notes |
|----------|--------|---------|-------|
| **NestJS Controller** | `kebab-case.controller.ts` | `user-profile.controller.ts` | Always `.controller.ts` suffix |
| **NestJS Service** | `kebab-case.service.ts` | `kyc-verification.service.ts` | Always `.service.ts` suffix |
| **NestJS Module** | `kebab-case.module.ts` | `identity.module.ts` | Always `.module.ts` suffix |
| **NestJS Entity** | `kebab-case.entity.ts` | `user-account.entity.ts` | Always `.entity.ts` suffix |
| **NestJS DTO** | `kebab-case.dto.ts` | `create-user.dto.ts` | Always `.dto.ts` suffix |
| **NestJS Guard** | `kebab-case.guard.ts` | `jwt.guard.ts` | Always `.guard.ts` suffix |
| **NestJS Pipe** | `kebab-case.pipe.ts` | `validation.pipe.ts` | Always `.pipe.ts` suffix |
| **React Component** | `PascalCase.tsx` | `MessageBubble.tsx` | Always `.tsx` (not `.ts`) |
| **React Hook** | `kebab-case.ts` with export `useXxx` | `use-auth.ts` exports `useAuth` | Always `use` prefix |
| **Zustand Store** | `kebab-case.ts` with export `useXxxStore` | `auth-store.ts` exports `useAuthStore` | Always `Store` suffix |
| **Utility Functions** | `kebab-case.ts` | `format-hbar.ts` | Lowercase, kebab-case |
| **Constants File** | `SCREAMING_SNAKE_CASE.ts` | `HCS_MESSAGE_TYPES.ts` | Or grouped in one file |
| **Test File** | `<filename>.spec.ts` | `auth.service.spec.ts` | Always `.spec.ts` suffix |
| **Database Tables** | `snake_case` | `user_accounts`, `hcs_messages` | Always plural |
| **Database Columns** | `snake_case` | `hedera_account_id`, `created_at` | Always snake_case |

### Code Identifiers

| Category | Format | Example | Notes |
|----------|--------|---------|-------|
| **Class Names** | `PascalCase` | `UserService`, `AuthGuard`, `HttpException` | Constructors use PascalCase |
| **Interface Names** | `PascalCase` | `IUserProfile`, `IMessage` | Only use `I` prefix if conflicting with class |
| **Enum Names** | `PascalCase` | `UserRole`, `MessageType`, `PaymentStatus` | Name is singular or verb phrase |
| **Enum Members** | `PascalCase` | `UserRole.Admin`, `MessageType.PrivateMessage` | NOT SCREAMING_SNAKE_CASE |
| **Function Names** | `camelCase` | `getUserById()`, `validateEmail()` | Lowercase verb-noun pattern |
| **Variable Names** | `camelCase` | `userId`, `isValidEmail`, `hbarAmount` | Noun phrase, boolean = `is`/`has` prefix |
| **Constant Names** | `SCREAMING_SNAKE_CASE` | `MAX_GROUP_SIZE`, `HCS_MESSAGE_COST` | File-level constants only |
| **Type Aliases** | `PascalCase` | `UserId = string & { readonly __brand: 'UserId' }` | Branded types for safety |
| **Private Members** | `#privateProperty` | `#apiKey`, `#encryptionKey` | Use private field syntax |

### API Routes

| Pattern | Example | Notes |
|---------|---------|-------|
| **Resource routes** | `GET /api/v1/users/:id` | Plural resource name, kebab-case |
| **Sub-resources** | `GET /api/v1/users/:id/messages` | Parent/child relationship |
| **Actions** | `POST /api/v1/users/:id/kyc-verify` | Verb-based actions |
| **Collection filters** | `GET /api/v1/messages?conversation-id=X` | Kebab-case query params |

### Git Conventions

| Category | Format | Example |
|----------|--------|---------|
| **Branch names** | `feat/<task-id>-<description>` | `feat/P0-T14-create-conversation` |
| | `fix/<task-id>-<description>` | `fix/P0-T15-message-encryption` |
| | `refactor/<task-id>-<description>` | `refactor/S02-hedera-client` |
| **Commit messages** | Conventional Commits | `feat(messaging): add group conversation creation` |
| | | `fix(auth): handle token expiry correctly` |
| | | `docs(readme): add Docker setup instructions` |

### Example Commits

```bash
# Feature
git commit -m "feat(auth): implement JWT token refresh"

# Bug fix
git commit -m "fix(payments): retry Hedera transfer on network timeout"

# Documentation
git commit -m "docs(developers): add environment setup guide"

# Refactor
git commit -m "refactor(hedera): extract mirror node queries to separate service"

# Test
git commit -m "test(identity): add KYC verification unit tests"
```

---

## Code Patterns & Standards

### Backend (NestJS)

#### Pattern 1: Service Dependency Injection

CORRECT:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { HederaService } from '../hedera/hedera.service';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
    private hederaService: HederaService,
  ) {}

  async getUserById(userId: string): Promise<User | null> {
    this.logger.log(`Fetching user: ${userId}`);
    return this.userRepository.findOneBy({ id: userId });
  }
}
```

INCORRECT:
```typescript
// ❌ Using require
const { User } = require('./entities/user.entity');

// ❌ Direct service instantiation
const hederaService = new HederaService();

// ❌ console.log instead of logger
console.log('Getting user...');

// ❌ Hardcoded values
const MAX_USERS = 1000; // Should be in constants/env
```

#### Pattern 2: Data Transfer Objects (DTOs)

CORRECT:
```typescript
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(50)
  password: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName: string;
}
```

INCORRECT:
```typescript
// ❌ No validation decorators
export class CreateUserDto {
  email: string;
  password: string;
  displayName: string;
}

// ❌ Any type
export class CreateUserDto {
  [key: string]: any;
}
```

#### Pattern 3: Custom Exceptions

CORRECT:
```typescript
import { HttpException, HttpStatus } from '@nestjs/common';

export class UserNotFoundException extends HttpException {
  constructor(userId: string) {
    super(
      `User ${userId} not found`,
      HttpStatus.NOT_FOUND
    );
  }
}

// In service:
async getUserById(userId: string): Promise<User> {
  const user = await this.userRepository.findOneBy({ id: userId });
  if (!user) {
    throw new UserNotFoundException(userId);
  }
  return user;
}
```

INCORRECT:
```typescript
// ❌ Generic Error class
throw new Error('User not found');

// ❌ No HTTP status context
throw new Error('User not found');

// ❌ Exposing internal details
throw new Error(`SELECT * FROM users WHERE id='${userId}' returned null`);
```

#### Pattern 4: Hedera Transactions

CORRECT:
```typescript
async createPayment(from: string, to: string, amount: number): Promise<string> {
  const txId = await this.getRandomTransactionId();

  try {
    // Log operation start
    this.logger.log(`[HEDERA] Creating payment from ${from} to ${to} (${amount} HBAR)`);

    // Retry logic
    let retries = 3;
    let lastError: Error;

    while (retries > 0) {
      try {
        const receipt = await new CryptoTransferTransaction()
          .addHbarTransfer(from, new Hbar(-amount))
          .addHbarTransfer(to, new Hbar(amount))
          .setTransactionMemo(`Payment from ${from}`)
          .execute(this.client);

        const result = await receipt.getReceipt(this.client);

        this.logger.log(`[HEDERA] Payment successful. TX: ${txId.toString()}`);
        return txId.toString();
      } catch (error) {
        lastError = error as Error;
        retries--;
        if (retries > 0) {
          const delay = Math.pow(2, 3 - retries) * 1000; // Exponential backoff
          this.logger.warn(`[HEDERA] Transfer failed, retrying in ${delay}ms...`);
          // LEGITIMATE: Exponential backoff utility for Hedera transaction retries
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  } catch (error) {
    this.logger.error(`[HEDERA] Payment failed: ${(error as Error).message}`);
    throw new HederaException('Payment creation failed', error as Error);
  }
}
```

INCORRECT:
```typescript
// ❌ No retry logic
const receipt = await transaction.execute(this.client);

// ❌ No error logging or recovery
new CryptoTransferTransaction().execute(this.client);

// ❌ Exposing operator key in logs
this.logger.log(`Using key: ${this.operatorKey}`); // NEVER

// ❌ No transaction ID logging for debugging
transfer.execute(client);
```

#### Pattern 5: Database Transactions

CORRECT:
```typescript
async transferMessageToEncryption(): Promise<void> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // 1. Fetch message
    const message = await queryRunner.manager.findOne(Message, {
      where: { id: messageId }
    });

    // 2. Encrypt content
    const encryptedContent = await this.cryptoService.encrypt(message.content);

    // 3. Update message
    message.content = encryptedContent;
    message.encrypted = true;
    await queryRunner.manager.save(message);

    // 4. Log to HCS
    const hcsMessage = { type: 'MESSAGE_ENCRYPTED', messageId };
    await this.hcsService.submitMessage(hcsMessage);

    // Commit both changes
    await queryRunner.commitTransaction();
    this.logger.log(`Message ${messageId} encrypted and logged to HCS`);
  } catch (error) {
    await queryRunner.rollbackTransaction();
    this.logger.error(`Failed to encrypt message ${messageId}:`, error);
    throw error;
  } finally {
    await queryRunner.release();
  }
}
```

INCORRECT:
```typescript
// ❌ No transaction, data consistency risk
message.content = encrypt(message.content);
await messageRepo.save(message);
await hcsService.submitMessage(...); // If this fails, data is inconsistent
```

### Frontend (Next.js)

#### Pattern 1: Client Components with 'use client'

CORRECT:
```typescript
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { apiClient } from '@/lib/api-client';

interface Message {
  id: string;
  content: string;
  createdAt: string;
}

export function MessageFeed() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        setLoading(true);
        const data = await apiClient.get<Message[]>('/messages');
        setMessages(data);
      } catch (err) {
        setError('Failed to load messages');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();
  }, []);

  if (loading) return <div>Loading messages...</div>;
  if (error) return <div>Error: {error}</div>;
  if (messages.length === 0) return <div>No messages yet</div>;

  return (
    <div className="space-y-4">
      {messages.map(msg => (
        <div key={msg.id} className="p-4 border rounded">
          {msg.content}
        </div>
      ))}
    </div>
  );
}
```

INCORRECT:
```typescript
// ❌ Missing 'use client' directive
import { useState } from 'react';

// ❌ No error state handling
const [messages, setMessages] = useState([]);
fetch('/api/messages').then(res => setMessages(res.data));

// ❌ No loading state
return <div>{messages.map(...)}</div>;

// ❌ Inline styles instead of Tailwind
<div style={{ padding: '16px', border: '1px solid gray' }} />
```

#### Pattern 2: Custom Hooks with TanStack Query

CORRECT:
```typescript
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

interface Message {
  id: string;
  conversationId: string;
  content: string;
  createdAt: string;
}

export function useMessages(conversationId: string) {
  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () =>
      apiClient.get<Message[]>(`/messaging/conversations/${conversationId}/messages`),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useSendMessage() {
  return useMutation({
    mutationFn: (data: { conversationId: string; content: string }) =>
      apiClient.post('/messaging/messages/send', data),
    onSuccess: (data, variables) => {
      // Invalidate cache to refetch messages
      queryClient.invalidateQueries({
        queryKey: ['messages', variables.conversationId]
      });
    },
  });
}

// In component:
export function ChatWindow({ conversationId }: { conversationId: string }) {
  const { data: messages, isLoading, error } = useMessages(conversationId);
  const { mutate: sendMessage, isPending } = useSendMessage();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading messages</div>;

  return (
    <div>
      {messages?.map(msg => <MessageBubble key={msg.id} message={msg} />)}
      <MessageInput
        onSend={(content) => sendMessage({ conversationId, content })}
        disabled={isPending}
      />
    </div>
  );
}
```

INCORRECT:
```typescript
// ❌ Using useState + useEffect for API calls (no caching, no retry)
const [messages, setMessages] = useState([]);
useEffect(() => {
  fetch(...).then(res => setMessages(res));
}, []);

// ❌ Not using hooks for logic reuse
// (copy-pasting fetch code in multiple components)
```

#### Pattern 3: Zustand Store for Shared State

CORRECT:
```typescript
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface AuthState {
  userId: string | null;
  email: string | null;
  isAuthenticated: boolean;
  setUser: (userId: string, email: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    persist(
      (set) => ({
        userId: null,
        email: null,
        isAuthenticated: false,
        setUser: (userId, email) =>
          set({
            userId,
            email,
            isAuthenticated: true,
          }),
        logout: () =>
          set({
            userId: null,
            email: null,
            isAuthenticated: false,
          }),
      }),
      {
        name: 'auth-storage', // Persist to localStorage
      }
    )
  )
);

// In component:
export function UserProfile() {
  const { userId, email, logout } = useAuthStore();

  return (
    <div>
      <p>User: {email}</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

INCORRECT:
```typescript
// ❌ Using React Context for mutable data (causes re-renders of entire tree)
// Use Zustand for state, Context only for app-wide config

// ❌ Not persisting auth state (user loses session on refresh)
```

#### Pattern 4: Component Props Typing

CORRECT:
```typescript
interface MessageBubbleProps {
  id: string;
  content: string;
  senderName: string;
  createdAt: Date;
  isOwn: boolean;
  onReply?: (messageId: string) => void;
}

export function MessageBubble({
  id,
  content,
  senderName,
  createdAt,
  isOwn,
  onReply,
}: MessageBubbleProps) {
  return (
    <div className={`p-3 rounded ${isOwn ? 'bg-blue-100' : 'bg-gray-100'}`}>
      <p className="font-semibold">{senderName}</p>
      <p className="text-gray-700">{content}</p>
      <p className="text-xs text-gray-500">
        {createdAt.toLocaleTimeString()}
      </p>
      {onReply && (
        <button onClick={() => onReply(id)}>Reply</button>
      )}
    </div>
  );
}
```

INCORRECT:
```typescript
// ❌ Untyped props
export function MessageBubble(props: any) { }

// ❌ Using inline objects instead of interface
export function MessageBubble({ message }: { message: any }) { }

// ❌ Spreading props without typing
export function MessageBubble({ ...props }) { }
```

#### Pattern 5: Semantic HTML

CORRECT:
```typescript
export function LoginForm() {
  const [email, setEmail] = useState('');

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="email-input">Email</label>
      <input
        id="email-input"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <button type="submit">Login</button>
    </form>
  );
}

export function NavigationMenu() {
  return (
    <nav aria-label="main navigation">
      <ul>
        <li><a href="/home">Home</a></li>
        <li><a href="/messages">Messages</a></li>
      </ul>
    </nav>
  );
}
```

INCORRECT:
```typescript
// ❌ div instead of button
<div onClick={handleSubmit}>Submit</div>

// ❌ Unstructured markup
<div><div>Email</div><input /></div>

// ❌ Not using semantic elements
<div role="navigation">...</div> // Use <nav> instead

// ❌ onClick on non-button elements
<span onClick={handleDelete}>Delete</span> // Use <button>
```

---

## Git Workflow

### Step-by-Step Workflow

#### 1. Pull Latest Main

```bash
git checkout main
git pull origin main
```

Always start from the latest main branch to avoid merge conflicts.

#### 2. Create Feature Branch

```bash
git checkout -b feat/P0-T14-create-conversation
```

**Branch naming format:** `<type>/<task-id>-<short-description>`

Types:
- `feat/` — New feature
- `fix/` — Bug fix
- `refactor/` — Code refactoring (no logic change)
- `docs/` — Documentation
- `test/` — Tests only
- `chore/` — Dependencies, configs

#### 3. Make Changes & Commit Regularly

```bash
# Make changes
git add packages/api/src/messaging/message.service.ts

# Commit with conventional message
git commit -m "feat(messaging): add group conversation creation"

# Make more changes
git add apps/web/src/components/chat/conversation-list.tsx
git commit -m "feat(messaging): add conversation list UI"
```

**Commit message format:** `<type>(<scope>): <description>`

- `type`: feat, fix, refactor, docs, test, chore
- `scope`: Feature name (messaging, auth, payments)
- `description`: What changed (lowercase, no period)

#### 4. Push to Remote

```bash
git push -u origin feat/P0-T14-create-conversation
```

The `-u` flag sets the remote branch as the default for future pushes.

#### 5. Open Pull Request

Create a PR on GitHub with template filled out:

```markdown
## Description
Adds group conversation creation to the messaging module.

## Changes
- [ ] Added ConversationService.createGroupConversation()
- [ ] Added POST /messaging/conversations/group endpoint
- [ ] Added ConversationList component UI
- [ ] Added unit tests for group creation

## Depends On
#123 (Auth module completed)

## Verification
- [ ] Backend tests pass
- [ ] Frontend builds without errors
- [ ] E2E test for group creation passes

## Screenshots
(if UI changes)
```

#### 6. Code Review

Wait for at least one approval from:
- Backend lead (for `packages/api/*`)
- Frontend lead (for `apps/web/*`)
- Tech lead (for architecture changes)

**Address feedback:**
```bash
# Make changes based on review
git add <files>
git commit -m "refactor(messaging): simplify conversation creation logic"
git push
```

#### 7. Merge to Main

Once approved and CI passes, squash merge:

```bash
# Rebase on latest main
git fetch origin
git rebase origin/main

# Resolve any conflicts
git add <resolved-files>
git rebase --continue

# Push rebased branch
git push --force-with-lease origin feat/P0-T14-create-conversation
```

Then merge on GitHub (use squash commit):

```
feat(messaging): add group conversation creation

- Added ConversationService.createGroupConversation()
- Added POST /messaging/conversations/group endpoint
- Added ConversationList component UI
- Added unit tests for group creation
```

#### 8. Clean Up

```bash
git checkout main
git pull origin main
git branch -d feat/P0-T14-create-conversation
git push origin --delete feat/P0-T14-create-conversation
```

---

## Hedera-Specific Rules

### Account & Operator

1. **NEVER hardcode Hedera Account IDs** — always use environment variables

CORRECT:
```typescript
const operatorId = AccountId.fromString(
  this.configService.get('HEDERA_OPERATOR_ID')
);
```

INCORRECT:
```typescript
const operatorId = AccountId.fromString('0.0.1234567');
```

2. **Check operator balance before batch operations**

```typescript
async submitBatchPayments(payments: Payment[]): Promise<void> {
  // Check balance
  const accountBalance = await this.hederaService.getAccountBalance(
    this.operatorId
  );

  const totalCost = payments.length * 0.001; // Approximate cost
  if (accountBalance.hbars.toTinybars() < totalCost * 100000000) {
    throw new Error(`Insufficient operator balance. Need ${totalCost} HBAR`);
  }

  // Submit payments
  for (const payment of payments) {
    await this.createPayment(payment);
  }
}
```

### HCS (Hedera Consensus Service)

1. **ALWAYS include version field in HCS messages for forward compatibility**

```typescript
const hcsMessage = {
  v: '1.0', // Version for schema evolution
  type: 'MESSAGE_CREATED',
  messageId: message.id,
  conversationId: message.conversationId,
  timestamp: Date.now(),
  content: encryptedContent,
};

await hcsService.submitMessage(hcsMessage);
```

2. **NEVER submit unencrypted private messages to HCS**

```typescript
// Encrypt before HCS submission
const encryptedContent = await this.cryptoService.encrypt(message.content);

const hcsMessage = {
  v: '1.0',
  type: 'PRIVATE_MESSAGE',
  messageId: message.id,
  encryptedContent, // Always encrypted
};

await this.hcsService.submitMessage(hcsMessage);
```

3. **ALWAYS retry HCS submissions with exponential backoff**

```typescript
async submitMessageWithRetry(
  topic: string,
  message: unknown,
  maxRetries: number = 3
): Promise<string> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const txId = await this.submitMessage(topic, JSON.stringify(message));
      this.logger.log(`[HCS] Message submitted: ${txId}`);
      return txId;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        this.logger.warn(
          `[HCS] Submission failed, retrying in ${delay}ms...`,
          error
        );
        // LEGITIMATE: Exponential backoff utility for HCS topic submission retries
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new HederaException('HCS submission failed after retries', lastError!);
}
```

4. **ALWAYS log Hedera transaction IDs for debugging**

```typescript
try {
  const txId = await transaction.execute(client);
  const receipt = await txId.getReceipt(client);
  this.logger.log(`[HEDERA-TX] ${txId.toString()} - Status: ${receipt.status}`);
} catch (error) {
  this.logger.error(`[HEDERA-TX] Transaction failed: ${error.message}`);
  throw error;
}
```

### HTS (Hedera Token Service)

1. **ALWAYS freeze DID NFT after minting**

```typescript
async mintDidNft(
  holder: string,
  metadata: DidMetadata
): Promise<string> {
  // 1. Mint NFT
  const mintTxn = await new TokenMintTransaction()
    .setTokenId(this.didTokenId)
    .setMetadata([Buffer.from(JSON.stringify(metadata))])
    .execute(this.client);

  const mintReceipt = await mintTxn.getReceipt(this.client);
  const nftSerialNum = mintReceipt.serials[0];

  this.logger.log(`[HTS] DID NFT minted: ${nftSerialNum}`);

  // 2. Freeze NFT (prevent transfers)
  await new TokenFreezeTransaction()
    .setTokenId(this.didTokenId)
    .setAccountId(holder)
    .execute(this.client);

  this.logger.log(`[HTS] DID NFT frozen for ${holder}`);

  return `${this.didTokenId}/${nftSerialNum}`;
}
```

### Hedera Cost Awareness

Every operation has a cost in HBAR. Keep this in mind:

| Operation | Cost | When | Optimization |
|-----------|------|------|---|
| HCS CreateTopic | $0.01 (100M tinybars) | New conversation | Reuse topics where possible |
| HCS SubmitMessage | $0.0008 (8M tinybars) | Every message, post, payment receipt | Batch messages into single HCS submission |
| HTS TokenMint (NFT) | $0.05 (500M tinybars) | DID NFT creation | Only mint when absolutely needed |
| HTS TokenFreeze | $0.001 (10M tinybars) | After NFT mint | Required for DID immutability |
| CryptoTransfer | $0.001 (10M tinybars) | Every HBAR payment | Min HBAR amount to transfer |

**Cost calculation example:**
- 1000 messages per day × $0.0008 = $0.80/day = $24/month
- Batch 10 messages per HCS submission → $0.08/day = $2.40/month

---

## Task Completion Protocol

### Before Starting a Task

1. **Read the ENTIRE task document** — Don't skim, read every section
2. **Check the "Depends On" section** — Those tasks MUST be completed first
3. **Understand the "Verification Steps"** — These are your success criteria
4. **Check the "Definition of Done"** — All checklist items must pass

### During Implementation

1. **Follow the steps IN ORDER** — Don't skip or reorder steps
2. **Code incrementally** — Commit after each logical step
3. **Test as you go** — Don't write 500 lines then test
4. **Document as you code** — Add comments for complex logic
5. **Save time for verification** — Don't code until the last minute

### After Implementation

1. **Go through "Verification Steps"** — Every row must pass
2. **Check "Definition of Done"** — Every checkbox must be marked
3. **Run the verification commands** — Exactly as written
4. **Read "Troubleshooting"** — Apply if you hit any issues
5. **If stuck >30 minutes** — Ask the tech lead, don't struggle alone

### Submission Checklist

Before opening a PR:

- [ ] Task document read completely
- [ ] All dependencies completed
- [ ] Code follows naming conventions
- [ ] Code follows patterns in this document
- [ ] All verification steps pass
- [ ] All "Definition of Done" items checked
- [ ] No console.log() statements (use Logger)
- [ ] No hardcoded values (use env/config)
- [ ] No `any` types (use proper TypeScript)
- [ ] No circular dependencies
- [ ] Secrets not in code (use env variables)
- [ ] Tests written and passing
- [ ] Types exported from shared package
- [ ] Security checklist passed

---

## Common Mistakes to Avoid

### Mistake 1: Forgetting `await` on Hedera SDK Calls

Hedera SDK methods return Promises. Always await them.

WRONG:
```typescript
const receipt = transaction.execute(client); // Returns Promise, not receipt!
console.log(receipt.status); // undefined
```

CORRECT:
```typescript
const txId = await transaction.execute(client); // Correctly awaited
const receipt = await txId.getReceipt(client); // Also awaited
console.log(receipt.status); // StatusOK
```

### Mistake 2: Using `==` Instead of `===`

JavaScript type coercion with `==` causes subtle bugs.

WRONG:
```typescript
if (statusCode == 200) { } // "200" == 200 is true!
if (user == null) { } // null == undefined is true!
```

CORRECT:
```typescript
if (statusCode === 200) { }
if (user === null || user === undefined) { }
if (user == null) { } // Only valid use case (checks both null and undefined)
```

### Mistake 3: Not Handling Null Database Queries

The user might not exist. Always check.

WRONG:
```typescript
async getUserName(userId: string): Promise<string> {
  const user = await this.userRepository.findOneBy({ id: userId });
  return user.displayName; // Crashes if user is null!
}
```

CORRECT:
```typescript
async getUserName(userId: string): Promise<string> {
  const user = await this.userRepository.findOneBy({ id: userId });
  if (!user) {
    throw new UserNotFoundException(userId);
  }
  return user.displayName;
}
```

### Mistake 4: Exposing Sensitive Data in Error Messages

Never expose secrets or internal system details to clients.

WRONG:
```typescript
catch (error) {
  throw new Error(
    `Database connection failed: ${DB_PASSWORD}@${DB_HOST}`
  );
}

// API Response:
// "error": "SELECT * FROM users WHERE id=$1 returned null"
```

CORRECT:
```typescript
catch (error) {
  this.logger.error('Database error', error); // Log internally
  throw new InternalServerErrorException(
    'Unable to process request' // Generic message
  );
}
```

### Mistake 5: Not Cleaning Up Test HCS Topics

Testnet has rate limits. Leave test topics lying around and you'll hit limits.

WRONG:
```typescript
// test.spec.ts
describe('HCS', () => {
  it('should create topic', async () => {
    const topicId = await hcsService.createTopic(); // Creates topic
    // Never deletes it!
  });
});

// Running 100 tests = 100 orphan topics!
```

CORRECT:
```typescript
describe('HCS', () => {
  let topicId: string;

  afterEach(async () => {
    if (topicId) {
      // Clean up created topic
      await hcsService.deleteTopic(topicId);
    }
  });

  it('should create topic', async () => {
    topicId = await hcsService.createTopic();
    expect(topicId).toBeDefined();
  });
});
```

### Mistake 6: Importing from `dist/` Instead of `src/`

NestJS modules need to be imported from source, not compiled output.

WRONG:
```typescript
import { UserService } from '../dist/auth/user.service.js';
```

CORRECT:
```typescript
import { UserService } from '../auth/user.service';
// NestJS resolves to src/ automatically
```

### Mistake 7: Circular Dependencies Between Modules

Module A imports Module B, Module B imports Module A. Code crashes at runtime.

WRONG:
```typescript
// auth.module.ts
import { IdentityModule } from '../identity/identity.module';
export class AuthModule {}

// identity.module.ts
import { AuthModule } from '../auth/auth.module';
export class IdentityModule {}
```

CORRECT:
```typescript
// Use dependency injection to break cycle
// Or create a third module that exports both services

// common.module.ts
@Module({
  providers: [AuthService, IdentityService],
  exports: [AuthService, IdentityService],
})
export class CommonModule {}

// auth.module.ts & identity.module.ts import CommonModule
```

### Mistake 8: Not Running `pnpm build` After Type Changes in Shared

Frontend imports types from @hedera-social/shared. If you change types but don't rebuild shared, frontend gets old types.

WRONG:
```bash
# Changed types/user.ts
git commit -m "feat(types): add new user field"
git push
# Frontend still sees old types!
```

CORRECT:
```bash
pnpm --filter @hedera-social/shared build
# Now frontend sees new types
git add .
git commit -m "feat(types): add new user field"
```

### Mistake 9: Committing .env Files

.env contains secrets. Git will expose them to everyone with repo access.

WRONG:
```bash
git add .env
git commit -m "Add environment config"
# Now API_KEY is in git history forever!
```

CORRECT:
```bash
# .gitignore already has .env
cp .env.example .env
git add .env.example
git commit -m "Add environment template"
# Only example goes to git
```

### Mistake 10: Using `any` to Silence TypeScript Errors

`any` disables type safety. You lose the benefit of TypeScript.

WRONG:
```typescript
async getUser(id: any): Promise<any> {
  return await fetch(`/api/users/${id}`).then(r => r.json());
}

// All type checking disabled. Could pass null, undefined, etc.
```

CORRECT:
```typescript
async getUser(id: string): Promise<User> {
  return await apiClient.get<User>(`/api/users/${id}`);
}

// Type-safe. Compiler ensures id is string, returns User type.
```

### Mistake 11: Not Updating Shared Types After API Changes

Backend changes API contract but forgets to update types in @hedera-social/shared.

WRONG:
```typescript
// Backend adds new field
@Get('/users/:id')
getUserById(id: string) {
  return { id, name, email, newField: 123 };
}

// Frontend still expects old type
// TypeScript error not caught until runtime!
```

CORRECT:
```typescript
// Update shared types first
// packages/shared/types/user.ts
export interface User {
  id: string;
  name: string;
  email: string;
  newField: number; // Added
}

// Rebuild shared
pnpm --filter @hedera-social/shared build

// Then backend & frontend both use new type
```

### Mistake 12: Only Testing Happy Path

Test success case but not error cases. App crashes in production.

WRONG:
```typescript
describe('PaymentService', () => {
  it('should create payment', async () => {
    const result = await service.createPayment('0.0.1', '0.0.2', 100);
    expect(result).toBeDefined(); // Only tests success
  });
});
```

CORRECT:
```typescript
describe('PaymentService', () => {
  it('should create payment', async () => {
    const result = await service.createPayment('0.0.1', '0.0.2', 100);
    expect(result).toBeDefined();
  });

  it('should throw if sender lacks funds', async () => {
    await expect(
      service.createPayment('0.0.BROKE', '0.0.2', 10000)
    ).rejects.toThrow(InsufficientFundsException);
  });

  it('should throw on invalid account ID', async () => {
    await expect(
      service.createPayment('INVALID', '0.0.2', 100)
    ).rejects.toThrow(InvalidAccountIdException);
  });
});
```

### Mistake 13: Using Date.now() Instead of HCS Consensus Timestamp

Hedera has a global consensus time. Using Date.now() means messages appear out of order.

WRONG:
```typescript
const message = {
  id: uuid(),
  conversationId,
  content,
  timestamp: Date.now(), // Client's local time, might be wrong!
};

// HCS records: timestamp = Date.now() on client
// If client clock is 1 hour behind, message appears old
```

CORRECT:
```typescript
// Use HCS consensus timestamp
const hcsMessage = await this.hcsService.submitMessage({
  v: '1.0',
  type: 'MESSAGE',
  content,
});

// HCS returns consensus timestamp
const consensusTimestamp = hcsMessage.consensusTimestamp;
const message = {
  id: uuid(),
  conversationId,
  content,
  timestamp: consensusTimestamp, // Hedera's official timestamp
};

// All messages ordered by Hedera's clock (globally consistent)
```

### Mistake 14: Not Encrypting Messages Before HCS Submission

HCS messages are public and immutable. Never submit unencrypted private messages.

WRONG:
```typescript
// ❌ Secret message submitted to public ledger!
await hcsService.submitMessage({
  type: 'PRIVATE_MESSAGE',
  content: 'This is a secret only between us',
  toUser: '0.0.5678',
});

// Everyone who reads HCS topic sees this message!
```

CORRECT:
```typescript
// ✓ Encrypt before submission
const encryptedContent = await this.cryptoService.encryptForUser(
  message.content,
  recipientPublicKey
);

await hcsService.submitMessage({
  v: '1.0',
  type: 'PRIVATE_MESSAGE',
  encryptedContent, // Only recipient can decrypt
  toUser: '0.0.5678',
});
```

### Mistake 15: Hardcoding Testnet Account IDs

Testnet account IDs change between environments. Code breaks in production.

WRONG:
```typescript
const OPERATOR_ID = '0.0.98765'; // Hardcoded testnet ID

if (accountId === '0.0.98765') { // Will never match mainnet!
  // Do something
}
```

CORRECT:
```typescript
const OPERATOR_ID = this.configService.get('HEDERA_OPERATOR_ID');

if (accountId === OPERATOR_ID) { // Matches environment
  // Do something
}
```

---

## Security Checklist

Before submitting any PR, go through this checklist. Mark each item as complete.

### Secrets & Credentials

- [ ] No API keys in code (use env variables)
- [ ] No private keys in code (use env variables)
- [ ] No JWT secrets in code (use env variables)
- [ ] No database passwords in code (use env variables)
- [ ] No `.env` files committed to git
- [ ] No secrets logged to console or error messages
- [ ] Secrets not printed in stack traces
- [ ] Operator key never exposed in API responses

### Input Validation

- [ ] All API endpoints have request DTOs with validation
- [ ] All user inputs validated on backend (never trust client)
- [ ] File uploads validated (size, type, content)
- [ ] Query parameters validated (no SQL injection)
- [ ] Request body size limited (DOS protection)

### Authentication & Authorization

- [ ] All non-public endpoints have @UseGuards(JwtGuard)
- [ ] JWT tokens verified on every protected endpoint
- [ ] JWT tokens have expiry time
- [ ] Users can only access their own data
- [ ] Admin operations require admin role
- [ ] Session tokens rotated on login/logout

### Database & Data

- [ ] Using TypeORM parameterized queries (no SQL injection)
- [ ] Database transactions used for multi-step operations
- [ ] No sensitive data logged (passwords, emails in plain text)
- [ ] Encryption at rest for sensitive columns
- [ ] Database backups taken regularly
- [ ] Test data doesn't contain real PII

### Hedera & Blockchain

- [ ] Operator private key never exposed in logs
- [ ] Hedera transaction IDs logged for audit trail
- [ ] HCS messages encrypted before submission (private messages)
- [ ] All HCS messages versioned (v: "1.0") for compatibility
- [ ] No unencrypted PII stored in HCS topics
- [ ] Retry logic with exponential backoff for Hedera calls
- [ ] Account balance checked before batch operations

### Frontend Security

- [ ] No hardcoded API keys in client code
- [ ] No secrets in localStorage
- [ ] JWT stored in httpOnly cookie (not localStorage)
- [ ] React auto-escapes HTML (no XSS from dangerouslySetInnerHTML)
- [ ] External API calls use CORS headers
- [ ] No console.log with sensitive data
- [ ] API responses validated on client

### Rate Limiting & DOS Protection

- [ ] Login endpoint rate-limited (max 5 attempts/min)
- [ ] API endpoints have rate limiting
- [ ] File upload size limits enforced
- [ ] Request timeout configured
- [ ] Large queries limit result set (pagination)

### Error Handling

- [ ] Internal errors don't expose system details to client
- [ ] All endpoints have error handling (try/catch)
- [ ] Errors logged with full stack trace internally
- [ ] Generic error message sent to client
- [ ] No error codes that leak system info
- [ ] 500 errors don't expose implementation details

### Code Quality

- [ ] No `eval()` or similar dynamic code execution
- [ ] No regex DOS attacks (catastrophic backtracking)
- [ ] No prototype pollution vulnerabilities
- [ ] Dependencies up to date (pnpm audit)
- [ ] No known CVEs in dependencies
- [ ] No hardcoded test data in production code

### Third-Party Integrations

- [ ] Mirsad AI KYC API calls over HTTPS
- [ ] Tamam Custody API calls over HTTPS
- [ ] Pinata IPFS gateway over HTTPS
- [ ] All external API keys stored in env
- [ ] External API responses validated
- [ ] Timeouts set for external API calls
- [ ] Sensitive data not sent to logging services

---

## Code Review Process

### For Authors (Before Submitting PR)

1. **Read your own code first**
   - Does it follow conventions in this document?
   - Are there any obvious bugs?
   - Are error cases handled?

2. **Check the automated tools**
   ```bash
   pnpm lint    # ESLint
   pnpm type-check  # TypeScript
   pnpm test    # Unit tests
   pnpm build   # Compilation
   ```

3. **Self-review against security checklist**
   - Run through every item in the checklist above
   - Fix any issues before requesting review

4. **Write a clear PR description**
   - What changed and why
   - Which task this completes
   - How to test it
   - Any known limitations

### For Reviewers

**Checklist for every PR:**

- [ ] **Does it follow conventions?**
  - Naming (files, functions, variables)
  - Project structure (where files are)
  - Code patterns (services, DTOs, error handling)

- [ ] **Is the code correct?**
  - Logic is sound
  - Error cases handled
  - No off-by-one errors
  - Null checks where needed

- [ ] **Is it tested?**
  - Unit tests for business logic
  - Error paths tested (not just happy path)
  - Tests are meaningful (not mocked everything)

- [ ] **Is it secure?**
  - No secrets in code
  - Input validation
  - SQL injection risks mitigated
  - Hedera best practices followed

- [ ] **Is it performant?**
  - No N+1 queries
  - Appropriate caching
  - No blocking operations
  - Hedera transaction costs reasonable

- [ ] **Is it maintainable?**
  - Clear variable/function names
  - Comments for complex logic
  - No code duplication
  - Types are specific (not `any`)

- [ ] **Does it handle Hedera specifics?**
  - Retry logic on failures
  - Transaction IDs logged
  - Operator key never exposed
  - Cost awareness (batching, etc.)

### Feedback Template

**Good comment:**
```
The retry logic looks good, but I'm concerned about the exponential backoff calculation.
If we have 3 retries with 2^attempt * 1000, the delays are:
- 2 seconds
- 4 seconds
- 8 seconds
= 14 seconds total

For a blocking operation, this might be too long. Consider reducing to 1s, 2s, 4s?

See S06 Hedera-Specific Rules section for cost awareness.
```

**Not helpful:**
```
This doesn't look right
```

### When to Request Changes vs. Approve

**Request Changes if:**
- Security issue (e.g., secret in code, no input validation)
- Breaks task requirements (Definition of Done not met)
- Violates naming conventions or code patterns
- Missing error handling
- No tests for new logic

**Approve if:**
- Follows all conventions and patterns
- Tests pass locally
- Security checklist satisfied
- Code is readable and maintainable
- Minor issues can be addressed after merge

---

## Code Quality: Human-Grade Standards

This section addresses patterns that indicate low-quality, AI-generated code. These standards ensure code is written for humans to read and maintain, not to satisfy a generator's template.

### Variable Naming

**Rule:** Use domain-specific names. Never use generic containers.

**Bad:**
```typescript
const data = await fetchUser(userId);
const result = processData(data);
const item = result.posts[0];
const info = getUserInfo(item);
const value = info.score;
```

**Good:**
```typescript
const user = await fetchUser(userId);
const profile = enrichUserProfile(user);
const latestPost = profile.posts[0];
const postAuthor = getPostAuthor(latestPost);
const authorReputation = postAuthor.reputationScore;
```

**Specific rules:**
- Never use `data`, `result`, `value`, `item`, `obj`, `el`, `thing` as standalone variable names
- Use domain language: `user`, `conversation`, `message`, `topicId`, `screeningId`, not `var1` or `temp`
- No Hungarian notation (`strName`, `intCount`, `boolActive`) — TypeScript types handle this
- Variable name should reflect intent: `isApproved` (boolean), `approvalCount` (number), `approvedUsers` (array)
- Map/object keys should be descriptive: `{ screeningId, status }` not `{ val1, val2 }`

### Comments

**Rule:** Don't state the obvious. Comments explain WHY, not WHAT.

**Bad:**
```typescript
// Create user
const user = await createUser(payload);

// Check if user exists
if (!user) {
  throw new Error('User not found');
}

// Get the user's posts
const posts = await getUserPosts(user.id);

/**
 * Fetch user by ID
 * @param userId The user ID
 * @returns The user object
 */
async function fetchUser(userId: string): Promise<User> {
```

**Good:**
```typescript
const user = await createUser(payload);

if (!user) {
  // Mirsad AI returned a screeningId but status remained pending_review
  // Retry after KYC callback is received, not immediately
  throw new UserNotVerifiedException(userId);
}

// Load posts for sidebar — may be stale if user just posted
const posts = await getUserPostsWithCache(user.id, { staleWhileRevalidate: 60000 });
```

**Specific rules:**
- Delete comments that just restate the code
- Remove auto-generated JSDoc that only repeats the function signature
- Comment BEFORE complex logic explaining the strategy
- Document surprising behavior or counterintuitive decisions
- Include context for why a constraint exists (performance, security, Hedera cost)
- Mark BLOCKED sections with task ID: `// BLOCKED: T22 — awaiting Mirsad AI docs`

### Error Messages

**Rule:** Be specific and actionable. Include context the developer needs to debug.

**Bad:**
```typescript
throw new Error('Not found');
throw new Error('Operation failed');
throw new BadRequestException('Invalid input');
```

**Good:**
```typescript
throw new UserNotFoundException(
  `User ${userId} not found in organization ${orgId}`
);

throw new ScreeningPendingException(
  `KYC screening ${screeningId} still pending for user ${userId}. ` +
  `Expected completion by ${expectedCompletionTime}. ` +
  `Check Mirsad AI dashboard for details.`
);

throw new InvalidHederaAccountException(
  `Account ID "${accountId}" does not match pattern 0.0.[0-9]+. ` +
  `Received from Hedera SDK: ${SDK_VERSION}`
);
```

**Specific rules:**
- Always include IDs and identifiers in error messages
- Include the expected vs. actual value when comparing
- Suggest next steps (check config, verify credentials, contact support)
- Log the full error context in the service, pass a sanitized message to the client
- Never expose secrets, private keys, or tokens in error messages

### Code Structure

**Rule:** Functions do ONE thing. Keep files focused.

**Function size:**
- Maximum 40 lines per function (excluding comments and blank lines)
- If a function has "and" in its description, split it
- A function called `submitKycAndReturnToken` should be two functions

**File size:**
- Maximum 200 lines per file (excluding comments and imports)
- If a service has multiple responsibilities, split into separate services
- Group related utility functions into a single file (all retry utilities together)

**Bad:**
```typescript
// 150+ lines, does 5 things
async submitKycAndVerifyAndMintNftAndCreateWalletAndStoreMetadata(userId: string) {
  // KYC logic...
  // Verification logic...
  // NFT minting...
  // Wallet creation...
  // Metadata storage...
}
```

**Good:**
```typescript
// Clear responsibility
async submitKycScreening(userId: string): Promise<ScreeningId> {
  const screeningId = await mirsadAi.submitKyc(userId);
  await this.db.screening.create({ userId, screeningId });
  return screeningId;
}

// Separate functions
async verifyUserApproval(userId: string): Promise<void> { ... }
async mintIdentityNft(userId: string): Promise<NftId> { ... }

// Orchestrate in service
async onKycApproved(userId: string): Promise<void> {
  await this.verifyUserApproval(userId);
  await this.mintIdentityNft(userId);
  await this.walletService.createWallet(userId);
}
```

### No Boilerplate Padding

**Rule:** Every line serves a purpose. No placeholders.

**Bad:**
```typescript
export class UserService {
  constructor() {}  // Empty constructor

  async getUserName(userId: string): Promise<string> {
    // TODO: Implement this
    return '';
  }

  // Unused import
  import { UnusedService } from './unused.service';

  // Placeholder method
  private helperMethod(): void {
    // Will implement later
  }
}
```

**Good:**
```typescript
export class UserService {
  async getUserName(userId: string): Promise<string> {
    const user = await this.db.user.findById(userId);
    return user?.displayName || user?.email || userId;
  }
}
```

**Specific rules:**
- Delete empty constructors
- Remove unused imports (check with ESLint)
- No placeholder methods without task references
- No TODO comments without a task ID (`// TODO: T22 — add rate limiting`)
- No catch blocks that swallow errors
- No functions that just call another function with the same arguments

### No Over-Abstraction

**Rule:** Only abstract when there's concrete repetition.

**Bad:**
```typescript
// Created for one implementation
interface UserRepository {
  get(id: string): Promise<User>;
}

class PostgresUserRepository implements UserRepository {
  async get(id: string): Promise<User> {
    return this.db.user.findById(id);
  }
}

// One-line wrapper
async function fetchUserProfile(userId: string): Promise<Profile> {
  return this.userRepository.get(userId);  // Does nothing
}

// Base class for one subclass
class BaseKycProcessor {
  protected async submitScreening() { ... }
}

class MirsadKycProcessor extends BaseKycProcessor { }
```

**Good:**
```typescript
// Direct dependency on DB
private db: Database;

async getUser(id: string): Promise<User> {
  return this.db.user.findById(id);
}

// Abstract only when there are 3+ implementations
interface KycProvider {
  submitScreening(userId: string): Promise<ScreeningId>;
}

class MirsadAiKycProvider implements KycProvider { ... }
class ManualReviewKycProvider implements KycProvider { ... }
class MockKycProvider implements KycProvider { ... }
```

### Test Names

**Rule:** Describe business behavior, not implementation.

**Bad:**
```typescript
it('should throw InsufficientBalanceException', () => { ... });
it('returns User object on successful fetch', () => { ... });
it('calls database method', () => { ... });
```

**Good:**
```typescript
it('rejects payment when sender has insufficient balance', () => { ... });
it('returns user profile with all fields populated', () => { ... });
it('logs transaction ID after successful Hedera submission', () => { ... });
```

### Formatting

**Rule:** Consistent with project ESLint/Prettier. Never override.

**Specific rules:**
- Use `pnpm lint --fix` before every commit
- No manual formatting overrides (no extra blank lines, no weird indentation)
- No comment blocks that break the linter
- Max line length: follow `.eslintrc.js` (usually 100-120 chars)
- Group imports: Node builtins → External packages → Internal modules → Types

### Imports

**Rule:** Organize by category. No circular dependencies.

**Good order:**
```typescript
// Node builtins
import * as crypto from 'crypto';
import { promises as fs } from 'fs';

// External packages
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

// Internal modules
import { DatabaseService } from '../database/database.service';
import { HederaService } from '../hedera/hedera.service';

// Types (last)
import { UserDto, CreateUserDto } from './user.dto';
import type { Transaction } from '../hedera/types';
```

**Specific rules:**
- No barrel re-exports from within the same module
- Import only what you use (no wildcard `import *` unless needed)
- Type-only imports with `import type` in TypeScript 4.5+
- Group related imports together

### Red Flags for AI-Generated Code

These patterns indicate code that was generated by an AI and not reviewed by a human:

1. **Overly verbose variable names:**
   - `userAuthenticationTokenRefreshResult` instead of `refreshToken`
   - `databaseConnectorConnectionPoolInitializationStatus` instead of `poolReady`

2. **Line-by-line comments that paraphrase code:**
   ```typescript
   // Create a new variable called count and set it to 0
   let count = 0;

   // Iterate over each item in the array
   for (const item of items) {
     // Increment count by one
     count++;
   }
   ```

3. **Unnecessary try/catch for synchronous operations:**
   ```typescript
   try {
     const name = user.displayName;  // Synchronous property access
   } catch (error) {
     logger.error('Failed to read user name', error);
   }
   ```

4. **Over-defensive null checks on values that can't be null:**
   ```typescript
   // After checking user exists above
   if (user?.profile?.displayName !== null && user?.profile?.displayName !== undefined) {
     // User's display name is definitely set at this point
   }
   ```

5. **Identical error handling in every method instead of a shared interceptor:**
   ```typescript
   // Same pattern repeated 20 times
   try { ... } catch (error) {
     logger.error('Operation failed:', error);
     throw new InternalServerException('Operation failed');
   }
   ```

6. **Unused parameters with default values:**
   ```typescript
   async createUser(
     userData: CreateUserDto,
     organizationId?: string = 'default',  // Never used
   ): Promise<User> {
     return this.db.user.create(userData);
   }
   ```

7. **Functions that just pass through the same type:**
   ```typescript
   function validateAndReturn(user: User): User {
     // Just returns the input unchanged
     return user;
   }
   ```

8. **Wrapper functions that add no value:**
   ```typescript
   private getCurrentTimestamp(): number {
     return Date.now();
   }
   ```

**When you see these patterns, ask yourself:**
- Could a human have written this more simply?
- Does this abstraction exist because it's genuinely useful, or because it feels "professional"?
- Am I adding lines of code without adding value?

---

## Final Checklist for Developers

Before you start any task, make sure you've:

- [ ] Read this entire document (S06)
- [ ] Read the specific task document completely
- [ ] Checked that all dependencies are completed
- [ ] Understood the project structure
- [ ] Understood the naming conventions
- [ ] Understood the code patterns to use
- [ ] Understood the Hedera-specific rules
- [ ] Set up your development environment (make setup)
- [ ] Created your feature branch
- [ ] Kept this document bookmarked for reference

Remember: **Engineering standards are not bureaucracy—they're guardrails that prevent bugs and security issues.**

When in doubt, reference this document or ask the tech lead.
