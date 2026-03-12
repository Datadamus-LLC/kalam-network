# Rules & Standards: Hedera Social Platform

**This document is LAW. No exceptions. No shortcuts. Every PR must pass these checks.**

---

## 1. Error Handling Standard

### Backend (NestJS)

**All errors must be custom exception classes:**

```typescript
// ✅ CORRECT
export class HederaTransactionFailedError extends Error {
  constructor(
    public readonly transactionId: string,
    public readonly status: TransactionReceiptStatus,
    message?: string,
  ) {
    super(message || `Hedera transaction failed: ${status}`);
    this.name = 'HederaTransactionFailedError';
  }
}

// ❌ WRONG
throw new Error('Transaction failed'); // Generic error
throw `Transaction failed`; // String error
```

**Global exception filter catches everything:**

```typescript
// app.module.ts
@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}

// global-exception.filter.ts
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: HttpArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';

    // Log the error with full context
    this.logger.error(
      {
        error: exception instanceof Error ? exception.message : String(exception),
        path: request.url,
        method: request.method,
        stack: exception instanceof Error ? exception.stack : undefined,
      },
      'Unhandled exception',
    );

    // Transform known errors
    if (exception instanceof HederaTransactionFailedError) {
      statusCode = HttpStatus.BAD_REQUEST;
      code = 'HEDERA_SUBMIT_FAILED';
      message = exception.message;
    }

    response.status(statusCode).json({
      success: false,
      error: {
        code,
        message,
        details: {
          path: request.url,
          timestamp: new Date().toISOString(),
        },
      },
    });
  }
}
```

**Every catch block must log with context and re-throw or transform:**

```typescript
// ✅ CORRECT
async submitMessage(topicId: string, payload: string): Promise<void> {
  try {
    const transaction = new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(payload);

    const receipt = await transaction
      .executeAndWait(this.client);

    // ALWAYS check receipt status
    if (receipt.status !== Status.Success) {
      throw new HederaTransactionFailedError(
        receipt.transactionId.toString(),
        receipt.status,
      );
    }

    this.logger.log(
      {
        transactionId: receipt.transactionId.toString(),
        topicId,
        payloadSize: payload.length,
      },
      'Message submitted to HCS topic',
    );
  } catch (error) {
    // Log with context
    this.logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        topicId,
        payloadSize: payload.length,
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Failed to submit message to HCS',
    );

    // Re-throw as typed error
    if (error instanceof HederaTransactionFailedError) {
      throw error; // Already typed
    }
    throw new HederaTransactionFailedError(
      'UNKNOWN',
      Status.Unknown,
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}

// ❌ WRONG
try {
  await submitTransaction();
} catch (e) {
  console.error(e); // No context logged
  throw e; // Generic error
}
```

**Database operations wrapped in transactions:**

```typescript
// ✅ CORRECT
async createConversation(
  input: CreateConversationInput,
): Promise<Conversation> {
  return this.db.transaction(async (trx) => {
    // Step 1: Create conversation
    const conversation = await trx
      .create(Conversation, {
        title: input.title,
        ownerId: input.ownerId,
      })
      .save();

    // Step 2: Add participants
    for (const participantId of input.participantIds) {
      await trx
        .create(ConversationParticipant, {
          conversationId: conversation.id,
          accountId: participantId,
          joinedAt: new Date(),
        })
        .save();
    }

    // If any step fails, entire transaction rolls back
    return conversation;
  });
}

// ❌ WRONG
async createConversation(input: CreateConversationInput) {
  const conversation = await this.repo.save({
    title: input.title,
  }); // No transaction

  // If next step fails, conversation is already created (orphaned)
  for (const id of input.participantIds) {
    await this.repo.save({ conversationId: conversation.id, accountId: id });
  }
}
```

**Always handle "not found" — never assume a record exists:**

```typescript
// ✅ CORRECT
async getConversation(id: string): Promise<Conversation> {
  const conversation = await this.repo.findOne(id);

  if (!conversation) {
    this.logger.warn({ conversationId: id }, 'Conversation not found');
    throw new NotFoundException('Conversation not found');
  }

  return conversation;
}

// ❌ WRONG
async getConversation(id: string) {
  return await this.repo.findOne(id); // Might be null, caller gets undefined
}
```

### Frontend (React)

**Every async operation has loading/error/success states:**

```typescript
// ✅ CORRECT
export function SendMessageForm({ conversationId }: Props) {
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: message }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error.message || 'Failed to send message');
      }

      setSuccessMessage('Message sent');
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="text-red-600">{error}</div>}
      {successMessage && <div className="text-green-600">{successMessage}</div>}

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        disabled={isLoading}
      />

      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Sending...' : 'Send'}
      </button>
    </form>
  );
}

// ❌ WRONG
function SendMessageForm({ conversationId }) {
  const [message, setMessage] = useState('');

  const handleSubmit = async () => {
    const res = await fetch(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: message }),
    });
    // No loading state, no error handling, no feedback
    setMessage('');
  };

  return <textarea value={message} onChange={(e) => setMessage(e.target.value)} />;
}
```

### API Response Envelope

**ALL responses use this exact format:**

```typescript
// Success (2xx)
{
  "success": true,
  "data": {
    "id": "0.0.12345",
    "name": "Alice",
    "createdAt": "2026-03-11T10:00:00Z"
  }
}

// Error (4xx, 5xx)
{
  "success": false,
  "error": {
    "code": "HEDERA_SUBMIT_FAILED",
    "message": "Transaction failed with status INVALID_TRANSACTION_BODY",
    "details": {
      "transactionId": "0.0.12345-1234567890-123456789",
      "status": "INVALID_TRANSACTION_BODY"
    }
  }
}

// List endpoint (with pagination)
{
  "success": true,
  "data": [
    { "id": "1", "content": "Hello" },
    { "id": "2", "content": "World" }
  ],
  "pagination": {
    "cursor": "abc123def456",
    "limit": 10,
    "hasMore": true
  }
}
```

**Implement in NestJS:**

```typescript
@Controller('conversations')
export class ConversationController {
  @Get(':id')
  async getConversation(@Param('id') id: string) {
    const conversation = await this.service.getConversation(id);
    return {
      success: true,
      data: conversation,
    };
  }

  @Post()
  async createConversation(@Body() input: CreateConversationDto) {
    const conversation = await this.service.createConversation(input);
    return {
      success: true,
      data: conversation,
    };
  }
}
```

---

## 2. Logging Standard

### Backend Logging

**Use NestJS Logger only (NEVER console.log/warn/error):**

```typescript
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  async createConversation(input: CreateConversationInput): Promise<Conversation> {
    this.logger.log(
      {
        userId: input.ownerId,
        participantCount: input.participantIds.length,
      },
      'Creating new conversation',
    );

    try {
      const conversation = await this.repository.save(input);

      this.logger.log(
        {
          conversationId: conversation.id,
          userId: input.ownerId,
          participantCount: input.participantIds.length,
        },
        'Conversation created successfully',
      );

      return conversation;
    } catch (error) {
      this.logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          userId: input.ownerId,
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Failed to create conversation',
      );
      throw error;
    }
  }
}

// ❌ WRONG — never use console
console.log('Creating conversation'); // FORBIDDEN
console.error('Error:', error); // FORBIDDEN
```

**Log structure in production (JSON):**

```json
{
  "timestamp": "2026-03-11T10:30:45.123Z",
  "level": "error",
  "context": "ConversationService",
  "message": "Failed to create conversation",
  "data": {
    "userId": "0.0.12345",
    "error": "Database connection timeout",
    "stack": "Error: ECONNREFUSED at ConversationService.createConversation..."
  }
}
```

**Log levels and when to use:**

| Level | When to use | Example |
|-------|------------|---------|
| `error` | Operations that fail and block user action | Transaction failed, API unreachable, validation error |
| `warn` | Degraded operation or unexpected condition | Retry attempt, API slow response, missing optional field |
| `log` | Successful completion of significant operations | Message sent, conversation created, transaction confirmed |
| `debug` | Detailed execution flow (only in dev) | Entering function, intermediate state, calculations |
| `verbose` | Trace-level debugging (only in dev) | Every condition check, variable values, loop iterations |

**Hedera operations — ALWAYS log transaction ID on success:**

```typescript
const receipt = await transaction.executeAndWait(this.client);

if (receipt.status !== Status.Success) {
  throw new HederaTransactionFailedError(receipt.transactionId.toString(), receipt.status);
}

// ALWAYS log this
this.logger.log(
  {
    transactionId: receipt.transactionId.toString(),
    topicId: topic.id,
    consensusTimestamp: receipt.consensusTimestamp?.toString(),
  },
  'Message submitted to HCS topic',
);
```

**NEVER log sensitive data:**

```typescript
// ❌ WRONG
this.logger.log({ privateKey: signingKey }, 'Generated key');
this.logger.log({ jwtToken: token }, 'User authenticated');
this.logger.log({ otpCode: '123456' }, 'OTP generated');
this.logger.log({ creditCard: '4111-1111-1111-1111' }, 'Payment processed');

// ✅ CORRECT
this.logger.log({ keyFingerprint: '...abc123' }, 'Generated key');
this.logger.log({ userId: user.id }, 'User authenticated');
this.logger.log({ otpLength: 6 }, 'OTP generated');
this.logger.log({ lastFourDigits: '1111' }, 'Payment processed');
```

### Frontend Logging

**Use a structured logging service (not console):**

```typescript
// hooks/useLogger.ts
export function useLogger(componentName: string) {
  return {
    log: (data: Record<string, unknown>, message: string) => {
      console.log(JSON.stringify({ component: componentName, data, message }));
    },
    error: (data: Record<string, unknown>, message: string) => {
      console.error(JSON.stringify({ component: componentName, level: 'error', data, message }));
    },
  };
}

// In components
export function MessageList({ conversationId }: Props) {
  const logger = useLogger('MessageList');

  useEffect(() => {
    logger.log({ conversationId }, 'Loading messages');
    fetchMessages().catch((error) => {
      logger.error(
        { error: String(error), conversationId },
        'Failed to load messages',
      );
    });
  }, [conversationId]);
}
```

---

## 3. Environment & Configuration

### Backend Configuration

**Use Zod for validation:**

```typescript
// config/env.ts
import { z } from 'zod';

const EnvSchema = z.object({
  // Required values — NO defaults
  HEDERA_NETWORK: z.enum(['testnet', 'mainnet']),
  HEDERA_OPERATOR_ID: z.string().min(1, 'Required'),
  HEDERA_OPERATOR_KEY: z.string().min(1, 'Required'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'Must be 32+ chars'),

  // Optional with defaults
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),
  PORT: z.coerce.number().default(3000),
});

export const ENV = EnvSchema.parse(process.env);
```

**App crashes on startup if env is invalid:**

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { ENV } from './config/env';
import { AppModule } from './app.module';

async function bootstrap() {
  if (!ENV) {
    console.error('Invalid environment configuration');
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule);
  await app.listen(ENV.PORT);
}

bootstrap();
```

**NO defaults for critical values:**

```typescript
// ✅ CORRECT
const schema = z.object({
  HEDERA_OPERATOR_ID: z.string().min(1), // Required, no default
  HEDERA_OPERATOR_KEY: z.string().min(1), // Required, no default
  JWT_SECRET: z.string().min(32), // Required, no default
  LOG_LEVEL: z.string().default('log'), // OK default for non-critical
});

// ❌ WRONG
const schema = z.object({
  HEDERA_OPERATOR_ID: z.string().default('0.0.1234'), // Dangerous default
  HEDERA_OPERATOR_KEY: z.string().default('xxx'), // Dangerous default
  DATABASE_URL: z.string().default('localhost'), // Dangerous default
});
```

### Frontend Configuration

**Only NEXT_PUBLIC_* vars accessible client-side:**

```typescript
// .env.local
NEXT_PUBLIC_HEDERA_NETWORK=testnet
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_PINATA_GATEWAY=https://gateway.pinata.cloud

# NOT accessible in browser
API_SECRET_KEY=xxx # Only backend
JWT_SIGNING_KEY=xxx # Only backend
```

**Use environment in client code:**

```typescript
// lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function fetchConversations() {
  const response = await fetch(`${API_URL}/api/conversations`);
  return response.json();
}
```

---

## 4. Naming Conventions

### Files & Directories

**kebab-case for all files:**

```
✅ CORRECT
src/
  features/
    conversations/
      services/
        create-conversation.service.ts
        get-conversation.service.ts
      controllers/
        conversation.controller.ts
      entities/
        conversation.entity.ts
      dto/
        create-conversation.dto.ts
      conversation.module.ts

❌ WRONG
src/
  features/
    conversations/
      CreateConversationService.ts # Should be create-conversation.service.ts
      getConversation.ts # Should be get-conversation.service.ts
```

### Classes & Interfaces

**PascalCase, no I prefix for interfaces:**

```typescript
// ✅ CORRECT
export class ConversationService {
  async createConversation() {}
}

export interface ConversationParticipant {
  conversationId: string;
  accountId: string;
  joinedAt: Date;
}

export type ConversationStatus = 'active' | 'archived' | 'deleted';

// ❌ WRONG
export class conversationService {} // Should be PascalCase
export interface IConversation {} // No I prefix
export interface IConversationParticipant {} // No I prefix
```

### Functions & Methods

**camelCase:**

```typescript
// ✅ CORRECT
export async function getTopicMessages(topicId: string): Promise<Message[]> {
  return messages;
}

class ConversationService {
  async createConversation(input: CreateConversationInput) {}
  async deleteConversation(id: string) {}
  async getParticipants(conversationId: string) {}
}

// ❌ WRONG
async function GetTopicMessages() {} // Should be camelCase
async function get_topic_messages() {} // Should be camelCase
GetTopicMessages() {} // Should be camelCase
```

### Constants

**SCREAMING_SNAKE_CASE:**

```typescript
// ✅ CORRECT
export const MAX_MESSAGE_LENGTH = 500;
export const HEDERA_NETWORK_TIMEOUT_MS = 30_000;
export const ENCRYPTION_ALGORITHM = 'AES-256-GCM';
export const CONVERSATION_DEFAULT_PAGE_SIZE = 20;

// ❌ WRONG
export const maxMessageLength = 500; // Should be SCREAMING_SNAKE_CASE
export const MaxMessageLength = 500; // Should be SCREAMING_SNAKE_CASE
export const max_message_length = 500; // Should be SCREAMING_SNAKE_CASE
```

### Enums

**PascalCase name, PascalCase members:**

```typescript
// ✅ CORRECT
export enum AccountType {
  Individual = 'INDIVIDUAL',
  Business = 'BUSINESS',
  GovernmentEntity = 'GOVERNMENT_ENTITY',
}

export enum TransactionStatus {
  Pending = 'PENDING',
  Confirmed = 'CONFIRMED',
  Failed = 'FAILED',
}

// ❌ WRONG
export enum accountType { // Should be PascalCase
  individual = 'individual', // Should be PascalCase
  business = 'business',
}

export const TransactionStatus = {
  PENDING: 'pending', // Use enum, not const object
  CONFIRMED: 'confirmed',
};
```

### Database Columns

**snake_case:**

```typescript
// ✅ CORRECT
@Entity('conversations')
export class Conversation {
  @PrimaryColumn()
  id: string;

  @Column()
  title: string;

  @Column()
  owner_id: string;

  @Column('varchar', { name: 'hedera_topic_id' })
  hederaTopicId: string;

  @Column('timestamp')
  created_at: Date;

  @Column('timestamp')
  updated_at: Date;
}

// ❌ WRONG
@Column()
ownerId: string; // Should be owner_id

@Column('varchar', { name: 'hederaTopicId' })
hederaTopicId: string; // Should be hedera_topic_id
```

### API Routes

**kebab-case:**

```typescript
// ✅ CORRECT
@Controller('conversations')
export class ConversationController {
  @Get(':id')
  getConversation() {}

  @Post(':id/messages')
  createMessage() {}

  @Get(':id/participants')
  getParticipants() {}

  @Delete(':id/participants/:participantId')
  removeParticipant() {}
}

// Routes become:
// GET /conversations/:id
// POST /conversations/:id/messages
// GET /conversations/:id/participants
// DELETE /conversations/:id/participants/:participantId

// ❌ WRONG
@Get(':id/get-all-messages') // Redundant
@Get(':id/getAllMessages') // Should be kebab-case
@Post(':id/AddMessage') // Should be kebab-case
```

### Git Branches

**Pattern: `{type}/{ticket}-{description}`**

```
✅ CORRECT
feat/T10-wallet-creation
feat/T12-hcs-topic-creation
fix/T15-message-decryption-error
refactor/T26-profile-service
test/T01-add-conversation-tests

❌ WRONG
feature/wallet # Missing ticket
T10 # Missing type
wallet-creation # Missing ticket
feat-T10-wallet-creation # Wrong separator
```

### Git Commits

**Conventional format: `{type}({scope}): {description}`**

```
✅ CORRECT
feat(wallet): implement MPC key generation flow
feat(messaging): add HCS topic creation and encryption
fix(conversation): handle null participants in list
refactor(security): extract encryption to dedicated service
test(mirror-api): add query integration tests
docs(README): update wallet setup instructions

Longer explanation in body if needed.
For backwards-incompatible changes:

BREAKING CHANGE: Removed HCS topic auto-creation. Users must create topics manually.

❌ WRONG
Implement wallet # Missing type/scope
feat: wallet # Missing scope
Fixed stuff # Too vague
wip # Incomplete
asdf # Meaningless
```

---

## 5. TypeScript Strictness

**ALL projects must compile with these tsconfig settings:**

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitAny": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "moduleResolution": "node"
  }
}
```

**NO EXCEPTIONS:**

- Every file must compile with these settings
- No `// @ts-ignore` comments
- No `any` type (use `unknown` instead)
- All public method return types explicit

**Example of type narrowing (not assertions):**

```typescript
// ✅ CORRECT — type narrowing
function processValue(value: unknown) {
  if (typeof value === 'string') {
    console.log(value.toUpperCase()); // TypeScript knows it's string
    return;
  }

  if (Array.isArray(value)) {
    console.log(value.length); // TypeScript knows it's array
    return;
  }

  throw new Error('Expected string or array');
}

// ❌ WRONG — type assertion (less safe)
function processValue(value: unknown) {
  const str = value as string; // Dangerous — might not be string
  console.log(str.toUpperCase()); // Could crash at runtime
}

// ❌ WRONG — using any
function processValue(value: any) {
  return value.toUpperCase(); // No type checking
}
```

**Return types explicit on public methods:**

```typescript
// ✅ CORRECT
export class ConversationService {
  // Public methods have explicit return types
  async createConversation(input: CreateConversationInput): Promise<Conversation> {
    // ...
  }

  async getConversation(id: string): Promise<Conversation | null> {
    // ...
  }

  // Private method can omit (but still good to have)
  private validateInput(input: unknown): CreateConversationInput {
    // ...
  }
}

// ❌ WRONG
export class ConversationService {
  async createConversation(input) { // Missing return type
    return conversation;
  }

  async getConversation(id: string) { // Missing return type
    return conversation;
  }
}
```

---

## 6. Dependency Injection (NestJS)

**NEVER import services directly — use NestJS DI:**

```typescript
// ✅ CORRECT
@Injectable()
export class ConversationService {
  constructor(
    private readonly messageService: MessageService,
    private readonly repository: ConversationRepository,
  ) {}

  async createConversation(input: CreateConversationInput): Promise<Conversation> {
    // messageService injected, not imported
    const conversation = await this.repository.save(input);
    await this.messageService.initialize(conversation.id);
    return conversation;
  }
}

// ❌ WRONG
import MessageService from './message.service'; // Direct import

export class ConversationService {
  async createConversation(input) {
    const messageService = new MessageService(); // Instantiating with new
    const conversation = await this.repository.save(input);
    messageService.initialize(conversation.id);
  }
}
```

**Cross-module access through exports:**

```typescript
// message.module.ts
@Module({
  providers: [MessageService],
  exports: [MessageService], // ← Export to make available to other modules
})
export class MessageModule {}

// conversation.module.ts
@Module({
  imports: [MessageModule], // ← Import the module
  providers: [ConversationService],
  controllers: [ConversationController],
})
export class ConversationModule {}

// conversation.service.ts
@Injectable()
export class ConversationService {
  constructor(private readonly messageService: MessageService) {} // ← DI from imported module
}
```

---

## 7. Database Rules

### TypeORM Repository Pattern

**All queries through TypeORM repository:**

```typescript
// ✅ CORRECT
@Injectable()
export class ConversationRepository {
  constructor(
    @InjectRepository(Conversation)
    private readonly repo: Repository<Conversation>,
  ) {}

  async findById(id: string): Promise<Conversation | null> {
    return this.repo.findOne({
      where: { id },
      relations: ['participants'], // Load relations explicitly
    });
  }

  async findByOwnerId(ownerId: string): Promise<Conversation[]> {
    return this.repo.find({
      where: { owner_id: ownerId },
      relations: ['participants'],
      order: { created_at: 'DESC' },
      take: 20,
      skip: 0,
    });
  }

  async createWithParticipants(
    conversation: Conversation,
    participantIds: string[],
  ): Promise<Conversation> {
    const participants = participantIds.map((id) =>
      this.repo.create({ accountId: id }),
    );

    conversation.participants = participants;
    return this.repo.save(conversation);
  }
}

// ❌ WRONG
async findById(id) {
  const result = await this.db.query(`SELECT * FROM conversations WHERE id = ?`, [id]);
  return result[0]; // Raw SQL, no TypeORM
}

async findAll() {
  return this.repo.find(); // No relations specified, N+1 query problem
}
```

**Multi-step mutations wrapped in transactions:**

```typescript
// ✅ CORRECT
async archiveConversation(id: string): Promise<void> {
  await this.db.transaction(async (trx) => {
    // Step 1: Update conversation
    await trx.update(Conversation, { id }, { status: 'archived' });

    // Step 2: Notify participants (e.g., create notifications)
    const conversation = await trx.findOne(Conversation, { where: { id } });
    for (const participant of conversation.participants) {
      await trx.save(Notification, {
        userId: participant.accountId,
        message: 'Conversation archived',
      });
    }

    // If any step fails, entire transaction rolls back
  });
}

// ❌ WRONG
async archiveConversation(id) {
  await this.repo.update({ id }, { status: 'archived' }); // Not in transaction

  // If next step fails, conversation is already archived (inconsistent state)
  const participants = await this.repo.find({ conversationId: id });
  for (const p of participants) {
    await this.notificationRepo.save({ userId: p.accountId }); // Separate operations
  }
}
```

**Always handle "not found":**

```typescript
// ✅ CORRECT
async getConversation(id: string): Promise<Conversation> {
  const conversation = await this.repo.findOne({ where: { id } });

  if (!conversation) {
    this.logger.warn({ conversationId: id }, 'Conversation not found');
    throw new NotFoundException(`Conversation ${id} not found`);
  }

  return conversation;
}

// ❌ WRONG
async getConversation(id) {
  return await this.repo.findOne({ where: { id } }); // Might return null
}

// Caller code
const convo = await getConversation('123');
const participants = convo.participants; // Crash: Cannot read property of null
```

### Pagination

**Cursor-based pagination preferred over offset:**

```typescript
// ✅ CORRECT — cursor-based
async listMessages(
  conversationId: string,
  { cursor, limit = 20 }: { cursor?: string; limit: number },
): Promise<{ items: Message[]; nextCursor?: string }> {
  const query = this.repo
    .createQueryBuilder('m')
    .where('m.conversationId = :conversationId', { conversationId })
    .orderBy('m.created_at', 'DESC')
    .take(limit + 1); // Fetch one extra to know if there are more

  if (cursor) {
    const decodedCursor = Buffer.from(cursor, 'base64').toString();
    query.andWhere('m.created_at < :cursor', { cursor: decodedCursor });
  }

  const items = await query.getMany();
  const hasMore = items.length > limit;
  const messages = items.slice(0, limit);

  return {
    items: messages,
    nextCursor: hasMore
      ? Buffer.from(messages[messages.length - 1].created_at.toISOString()).toString(
          'base64',
        )
      : undefined,
  };
}

// ❌ WRONG — offset-based
async listMessages(conversationId, { page = 1, limit = 20 }) {
  const skip = (page - 1) * limit;
  return this.repo.find({ where: { conversationId }, skip, take: limit }); // Inefficient on large datasets
}
```

---

## 8. Hedera-Specific Rules

### Transaction Handling

**ALWAYS check receipt.status after transactions:**

```typescript
// ✅ CORRECT
const transaction = new TopicMessageSubmitTransaction()
  .setTopicId(topicId)
  .setMessage(payload);

const receipt = await transaction.executeAndWait(this.client);

// Check status BEFORE proceeding
if (receipt.status !== Status.Success) {
  this.logger.error(
    {
      status: receipt.status,
      transactionId: receipt.transactionId.toString(),
    },
    'Transaction failed',
  );
  throw new HederaTransactionFailedError(
    receipt.transactionId.toString(),
    receipt.status,
  );
}

this.logger.log(
  { transactionId: receipt.transactionId.toString() },
  'Transaction succeeded',
);

// ❌ WRONG
const receipt = await transaction.executeAndWait(this.client);
// Assuming success without checking status
const transactionId = receipt.transactionId; // Might be failed
```

**ALWAYS retry on BUSY status (up to 3x, exponential backoff):**

```typescript
// ✅ CORRECT
async executeTransactionWithRetry<T>(
  transaction: Transaction,
  maxRetries: number = 3,
): Promise<TransactionReceipt> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const receipt = await transaction.executeAndWait(this.client);

      if (receipt.status === Status.Success) {
        return receipt;
      }

      if (receipt.status === Status.Busy && attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        this.logger.warn(
          { attempt, nextRetryMs: delayMs, transactionId: receipt.transactionId.toString() },
          'Transaction busy, retrying',
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      throw new HederaTransactionFailedError(
        receipt.transactionId.toString(),
        receipt.status,
      );
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        continue;
      }
    }
  }

  throw lastError || new Error('Transaction failed after retries');
}

// ❌ WRONG
const receipt = await transaction.executeAndWait(this.client);
if (receipt.status === Status.Busy) {
  // No retry logic
  throw new Error('Network busy');
}
```

**ALWAYS log transaction IDs for debugging:**

```typescript
// ✅ CORRECT
this.logger.log(
  {
    transactionId: receipt.transactionId.toString(),
    topicId: this.topicId,
    timestamp: receipt.consensusTimestamp?.toString(),
    operationName: 'submitMessageToTopic',
  },
  'Message successfully submitted to HCS',
);

// ❌ WRONG
this.logger.log('Message sent'); // No transaction ID for debugging
```

### Key Management

**NEVER expose operator private key:**

```typescript
// ✅ CORRECT
export class HederaClientFactory {
  static create(network: 'testnet' | 'mainnet'): Client {
    const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID!);
    const operatorKey = PrivateKey.fromStringEd25519(
      process.env.HEDERA_OPERATOR_KEY!,
    );

    const client = Client.forTestnet(); // or forMainnet()
    client.setOperator(operatorId, operatorKey);

    // ✅ Private key not exposed anywhere
    return client;
  }

  // ❌ NEVER expose like this:
  // getPrivateKey() { return this.operatorKey; }
  // logOperatorKey() { console.log(this.operatorKey); }
}

// In service
@Injectable()
export class ConversationService {
  private readonly client: Client;

  constructor() {
    this.client = HederaClientFactory.create(
      process.env.HEDERA_NETWORK as 'testnet' | 'mainnet',
    );
    // Client owns the key internally
  }

  // Never try to access or expose the key
}
```

### HCS Message Format

**ALL HCS payloads include version:**

```typescript
// ✅ CORRECT
interface HCSMessage {
  v: '1.0'; // Version for schema evolution
  type: 'text' | 'media' | 'system';
  content: string;
  encryptedKey?: string; // If private message
  senderAccountId: string;
  timestamp: number;
}

async submitMessage(conversationId: string, content: string): Promise<void> {
  const payload: HCSMessage = {
    v: '1.0', // Always include version
    type: 'text',
    content: content,
    senderAccountId: this.userId,
    timestamp: Date.now(),
  };

  const transaction = new TopicMessageSubmitTransaction()
    .setTopicId(conversationId)
    .setMessage(JSON.stringify(payload));

  const receipt = await transaction.executeAndWait(this.client);
  // ... handle receipt
}

// ❌ WRONG
const payload = {
  content: content, // No version field
  sender: this.userId,
};
```

**Private messages ALWAYS encrypted before HCS submission:**

```typescript
// ✅ CORRECT
async submitPrivateMessage(
  conversationId: string,
  recipientPublicKey: string,
  content: string,
): Promise<void> {
  // 1. Encrypt content
  const encryptionKey = await this.deriveSharedKey(recipientPublicKey);
  const { ciphertext, iv, salt } = await this.encrypt(content, encryptionKey);

  // 2. Create payload
  const payload: HCSMessage = {
    v: '1.0',
    type: 'text',
    content: ciphertext, // Encrypted
    encryptedKey: iv, // IV for decryption
    senderAccountId: this.userId,
    timestamp: Date.now(),
  };

  // 3. Submit to HCS
  const transaction = new TopicMessageSubmitTransaction()
    .setTopicId(conversationId)
    .setMessage(JSON.stringify(payload));

  const receipt = await transaction.executeAndWait(this.client);
  this.logger.log(
    { transactionId: receipt.transactionId.toString(), conversationId },
    'Encrypted message submitted',
  );
}

// ❌ WRONG
async submitPrivateMessage(conversationId, recipientKey, content) {
  const payload = {
    content: content, // Not encrypted!
    recipient: recipientKey,
  };
  // Anyone reading HCS can see plaintext
}
```

### Configuration

**Topic IDs, Token IDs from env config — never hardcoded:**

```typescript
// ✅ CORRECT
@Injectable()
export class HederaConfigService {
  readonly topicIds = {
    global: TokenId.fromString(process.env.HEDERA_GLOBAL_TOPIC_ID!),
    notifications: TokenId.fromString(process.env.HEDERA_NOTIFICATIONS_TOPIC_ID!),
  };

  readonly tokenIds = {
    credential: TokenId.fromString(process.env.HEDERA_CREDENTIAL_TOKEN_ID!),
  };

  constructor() {
    // Validate on startup
    if (!process.env.HEDERA_GLOBAL_TOPIC_ID) {
      throw new Error('HEDERA_GLOBAL_TOPIC_ID is required');
    }
  }
}

@Injectable()
export class ConversationService {
  constructor(private readonly hederaConfig: HederaConfigService) {}

  async createTopic(): Promise<string> {
    const transaction = new TopicCreateTransaction();
    const receipt = await transaction.executeAndWait(this.client);
    return receipt.topicId!.toString();
  }
}

// ❌ WRONG
const GLOBAL_TOPIC_ID = '0.0.123456'; // Hardcoded
const CREDENTIAL_TOKEN = '0.0.789012'; // Hardcoded
```

---

## 9. Frontend Rules

### Client Components

**`'use client'` directive on every client component:**

```typescript
// ✅ CORRECT
'use client';

import { useState } from 'react';

export function ConversationForm() {
  const [title, setTitle] = useState('');

  return (
    <form>
      <input value={title} onChange={(e) => setTitle(e.target.value)} />
    </form>
  );
}

// ❌ WRONG
import { useState } from 'react';

// Missing 'use client' directive
export function ConversationForm() {
  const [title, setTitle] = useState('');
  return <form>...</form>;
}
```

### Async Operations

**Loading spinner, error message, empty state for every async operation:**

```typescript
// ✅ CORRECT
'use client';

import { useEffect, useState } from 'react';
import { MessageList } from '@/components/message-list';
import { LoadingSpinner } from '@/components/loading-spinner';
import { ErrorMessage } from '@/components/error-message';
import { EmptyState } from '@/components/empty-state';

interface Message {
  id: string;
  content: string;
}

export function ConversationMessages({ conversationId }: { conversationId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMessages = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/conversations/${conversationId}/messages`);

        if (!response.ok) {
          throw new Error('Failed to fetch messages');
        }

        const data = await response.json();
        setMessages(data.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setMessages([]); // Clear partial data
      } finally {
        setIsLoading(false);
      }
    };

    fetchMessages();
  }, [conversationId]);

  // Loading state
  if (isLoading) {
    return <LoadingSpinner />;
  }

  // Error state
  if (error) {
    return <ErrorMessage message={error} />;
  }

  // Empty state
  if (messages.length === 0) {
    return <EmptyState message="No messages yet" />;
  }

  // Success state
  return <MessageList messages={messages} />;
}

// ❌ WRONG
export function ConversationMessages({ conversationId }) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    fetch(`/api/conversations/${conversationId}/messages`)
      .then((res) => res.json())
      .then((data) => setMessages(data.data));
    // No loading state, no error handling, no empty state
  }, [conversationId]);

  return <MessageList messages={messages} />;
}
```

### State Management

**Local → useState, Shared → Zustand, Server → TanStack Query:**

```typescript
// ✅ CORRECT

// Local state (single component)
function TextInput() {
  const [text, setText] = useState(''); // useState for local
  return <input value={text} onChange={(e) => setText(e.target.value)} />;
}

// Shared state (multiple components)
// store/conversation-store.ts
import { create } from 'zustand';

interface ConversationState {
  selectedId: string | null;
  setSelected: (id: string) => void;
}

export const useConversationStore = create<ConversationState>((set) => ({
  selectedId: null,
  setSelected: (id) => set({ selectedId: id }),
}));

// Server/async state (fetched from API)
import { useQuery } from '@tanstack/react-query';

function MessageList({ conversationId }: { conversationId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () =>
      fetch(`/api/conversations/${conversationId}/messages`).then((r) =>
        r.json(),
      ),
  });

  // Use the data...
}

// ❌ WRONG
function App() {
  const [allConversations, setAllConversations] = useState([]); // useEffect to fetch
  // useState for server state is inefficient, use TanStack Query

  useEffect(() => {
    fetch('/api/conversations').then((r) => r.json()).then(setAllConversations);
  }, []);
  // No caching, no deduplication, no background refetching
}
```

### Styling

**No inline styles — Tailwind only:**

```typescript
// ✅ CORRECT
'use client';

export function Button({ children }: { children: React.ReactNode }) {
  return (
    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
      {children}
    </button>
  );
}

// ❌ WRONG
export function Button({ children }) {
  return (
    <button
      style={{
        padding: '8px 16px',
        backgroundColor: '#2563eb',
        color: 'white',
        borderRadius: '8px',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
```

### Semantic HTML

**Use semantic HTML elements (button not div, a not span):**

```typescript
// ✅ CORRECT
export function Navigation() {
  return (
    <nav>
      <ul>
        <li>
          <a href="/conversations">Conversations</a>
        </li>
        <li>
          <a href="/profile">Profile</a>
        </li>
      </ul>
    </nav>
  );
}

export function MessageActions() {
  return (
    <>
      <button onClick={handleEdit}>Edit</button>
      <button onClick={handleDelete}>Delete</button>
    </>
  );
}

// ❌ WRONG
export function Navigation() {
  return (
    <div onClick={() => navigate('/conversations')}>
      Conversations
    </div>
  );
}

export function MessageActions() {
  return (
    <>
      <div onClick={handleEdit}>Edit</div>
      <div onClick={handleDelete}>Delete</div>
    </>
  );
}
```

### Form Validation

**Client-side validation with Zod + react-hook-form:**

```typescript
// ✅ CORRECT
'use client';

import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

const CreateConversationSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title too long'),
  participantEmails: z.array(
    z.string().email('Invalid email'),
  ).min(1, 'At least one participant required'),
});

type CreateConversationInput = z.infer<typeof CreateConversationSchema>;

export function CreateConversationForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateConversationInput>({
    resolver: zodResolver(CreateConversationSchema),
  });

  const onSubmit = async (data: CreateConversationInput) => {
    const response = await fetch('/api/conversations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    // ...
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('title')} />
      {errors.title && <span>{errors.title.message}</span>}

      <input {...register('participantEmails.0')} />
      {errors.participantEmails && (
        <span>{errors.participantEmails.message}</span>
      )}

      <button type="submit" disabled={isSubmitting}>
        Create
      </button>
    </form>
  );
}

// ❌ WRONG
export function CreateConversationForm() {
  const [title, setTitle] = useState('');
  const [emails, setEmails] = useState('');

  const handleSubmit = async () => {
    // No client-side validation
    await fetch('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ title, emails: emails.split(',') }),
    });
  };

  return <form onSubmit={handleSubmit}>...</form>;
}
```

---

## 10. Security Checklist (per PR)

Before merging any PR, verify:

### Code Review

- [ ] **No secrets in code** — No API keys, private keys, passwords hardcoded
- [ ] **Input validation on all endpoints** — Query params, body, headers validated with Zod/class-validator
- [ ] **Auth guard on all non-public endpoints** — Public routes explicitly marked, others protected
- [ ] **Rate limiting on auth endpoints** — Login, register, password reset throttled (e.g., 5 attempts/minute)
- [ ] **XSS prevention** — No `dangerouslySetInnerHTML`, React escaping enabled
- [ ] **CORS configured** — Restricted to specific origins, not `*`
- [ ] **No sensitive logging** — No secrets in logs, only IDs and safe data
- [ ] **Dependency versions pinned** — No floating patch versions like `^1.0.0`

### Hedera-Specific

- [ ] **Operator key not exposed** — Key only accessible inside HederaClientFactory
- [ ] **Transaction status always checked** — No assumptions about success
- [ ] **Retry logic on BUSY** — Network transients handled
- [ ] **Topic IDs from environment** — Never hardcoded
- [ ] **HCS messages versioned** — All payloads include `v` field
- [ ] **Private messages encrypted** — Content encrypted before HCS submission

### Database

- [ ] **No N+1 queries** — Relations loaded explicitly with `relations: [...]`
- [ ] **Transactions used for multi-step operations** — All-or-nothing semantics
- [ ] **Not found handled** — No assumptions about record existence

### Frontend

- [ ] **No useEffect for data fetching** — TanStack Query used
- [ ] **Loading/error/empty states** — All async operations have UI feedback
- [ ] **No inline styles** — Tailwind only
- [ ] **Form validation** — Zod + react-hook-form
- [ ] **Client components marked** — `'use client'` directive present

---

## 11. What To Do When Stuck

### Hedera Transaction Failed

1. Check operator account balance: `await client.getAccountBalance(operatorId)`
2. Check transaction ID in logs: Look for transaction hash in testnet explorer
3. Verify network is accessible: Ping `testnet.hedera.com`
4. Check receipt status code: `Status.InvalidTransactionBody`, `Status.InsufficientFee`, etc.
5. If BUSY: Retry with exponential backoff
6. If persistent: Ask Hedera support or check community Discord

### External API Not Documented

1. STOP immediately — don't invent
2. Create a GitHub issue: "Integration blocked: Need API docs for [Service]"
3. Ask the user in Slack/email: "Can you provide [API name] documentation?"
4. Move service status to UNDOCUMENTED in documentation-status.md
5. List what you need: endpoints, auth, schemas
6. Wait for user response before writing code

### Type Error That Won't Fix

1. Never use `// @ts-ignore` — fix the type
2. Use `unknown` + type narrowing instead of `any`
3. If assertion necessary, add comment explaining why: `const x = value as string; // Safe because validated above`
4. Check TypeScript strict mode is enabled: `"strict": true`
5. Run `tsc --noEmit` to see all errors

### Stuck on Implementation for >15 minutes

1. Take a 5-minute break — fresh perspective helps
2. Write the test case first — clarifies requirements
3. Search existing code for similar patterns
4. Ask the tech lead or senior engineer
5. Document the blocker in an issue/PR comment

### Test Fails

1. FIX THE CODE, not the test — tests are specification
2. Exception: If test itself is wrong (typo, logic error), fix test + code
3. NEVER use jest.fn(), jest.mock(), jest.spyOn(), stubs, or fakes — all tests run against real infrastructure (real DB, real Redis, real Hedera Testnet)
4. Run full test suite: `pnpm test -- --coverage` to catch regressions

---

## Final Checklist

**Before writing ANY code:**
- [ ] Read documentation-status.md
- [ ] Check if dependencies are DOCUMENTED or blocking
- [ ] Verify environment variables are defined
- [ ] Create database migration if needed

**Before committing:**
- [ ] All tests pass: `npm test`
- [ ] No TypeScript errors: `tsc --noEmit`
- [ ] Code follows naming conventions (files kebab-case, classes PascalCase, etc.)
- [ ] No `console.log`, `console.error` — use Logger
- [ ] No hardcoded secrets or IDs
- [ ] Commit message is conventional: `feat(scope): description`

**Before PR:**
- [ ] Run security checklist above
- [ ] Add tests for new functionality
- [ ] Update CHANGELOG if user-facing
- [ ] Add comment to documentation-status.md if integration updated
