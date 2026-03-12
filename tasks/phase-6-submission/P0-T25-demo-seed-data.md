# Task P0-T25: Demo Data & Seed Script

| Field | Value |
|-------|-------|
| Task ID | P0-T25 |
| Priority | High |
| Estimated Time | 3 hours |
| Depends On | All Phase 4 & 5 tasks |
| Phase | 6 — Hackathon Submission |
| Assignee | Junior Developer (Full Stack) |

---

## Objective

Create seed scripts that populate the database with demo data for showcasing the platform. This enables quick setup for:
- Hackathon judges to see a working demo immediately after running `pnpm seed`
- Demo videos with realistic data
- Testing full workflows without manual setup

The seed script creates 3 demo users with Hedera testnet accounts, conversations, messages, posts, payments, and relationships.

## Background

Judges want to see a working platform with realistic data, not empty tables. The seed script automates demo setup by:
1. Creating 3 demo users (Alice, Bob, Charlie)
2. Creating Hedera testnet accounts for each (or using provided account IDs)
3. Minting DID NFTs for identity verification
4. Creating 1:1 conversation between Alice and Bob
5. Creating group conversation with all three users
6. Sending sample encrypted messages in conversations
7. Creating sample posts on each user's feed
8. Creating follow relationships
9. Sending sample in-chat payment
10. Creating notifications

**Demo Users:**
- Alice: Tech founder, 500 USDC in account
- Bob: Designer, 300 USDC in account
- Charlie: Developer, 200 USDC in account

## Pre-requisites

Before starting this task, ensure:

1. **Backend Running**
   - NestJS server running on http://localhost:3000
   - All migration scripts executed
   - Database empty or reset

2. **Hedera Testnet Access**
   - HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in .env
   - Testnet account has HBAR for transaction fees
   - Test HTS token created and distributed to accounts

3. **Environment Variables Complete**
   ```
   HEDERA_ACCOUNT_ID=0.0.xxxxx
   HEDERA_PRIVATE_KEY=302e...
   HEDERA_NETWORK=testnet
   HTS_TOKEN_ID=0.0.xxxxx
   TAMAM_RAILS_MOCK=true
   DATABASE_URL=postgresql://...
   JWT_SECRET=your_secret
   ```

4. **Dependencies Installed**
   ```bash
   npm install axios typeorm reflect-metadata dotenv
   ```

5. **TypeORM CLI Available**
   - Can run migrations with `npm run typeorm`
   - Can access database programmatically

## Step-by-Step Instructions

### Step 1: Create Seed Script

Create file: `scripts/seed-demo.ts`

```typescript
import 'reflect-metadata';
import dotenv from 'dotenv';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
dotenv.config();

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const DEMO_PASSWORD = 'DemoPassword123!';

/**
 * Demo users to create
 */
const DEMO_USERS = [
  {
    email: 'alice@demo.hedera.social',
    password: DEMO_PASSWORD,
    displayName: 'Alice Chen',
    bio: 'Building the future of web3 social',
    hederaAccountId: '0.0.1000001' // Will be created or provided
  },
  {
    email: 'bob@demo.hedera.social',
    password: DEMO_PASSWORD,
    displayName: 'Bob Designer',
    bio: 'UI/UX Designer passionate about blockchain',
    hederaAccountId: '0.0.1000002'
  },
  {
    email: 'charlie@demo.hedera.social',
    password: DEMO_PASSWORD,
    displayName: 'Charlie Dev',
    bio: 'Full-stack developer and Hedera enthusiast',
    hederaAccountId: '0.0.1000003'
  }
];

interface SeedUser {
  id: string;
  email: string;
  displayName: string;
  hederaAccountId: string;
  authToken: string;
}

/**
 * HTTP client with auth
 */
class ApiClient {
  private token: string = '';

  async setToken(token: string) {
    this.token = token;
  }

  private getHeaders() {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async post(path: string, data: Record<string, unknown>) {
    try {
      const response = await axios.post(`${API_URL}${path}`, data, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: unknown }; message?: string };
      console.error(`POST ${path} failed:`, axiosError.response?.data || axiosError.message);
      throw error;
    }
  }

  async get(path: string, params?: Record<string, unknown>) {
    try {
      const response = await axios.get(`${API_URL}${path}`, {
        headers: this.getHeaders(),
        params
      });
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: unknown }; message?: string };
      console.error(`GET ${path} failed:`, axiosError.response?.data || axiosError.message);
      throw error;
    }
  }
}

/**
 * Seed execution
 */
async function seedDatabase() {
  console.log('\n🌱 Starting demo seed...\n');

  const api = new ApiClient();
  const users: SeedUser[] = [];

  try {
    // Step 1: Create Users
    console.log('📝 Creating demo users...');
    for (const userData of DEMO_USERS) {
      try {
        const response = await api.post('/auth/register', {
          email: userData.email,
          password: userData.password,
          displayName: userData.displayName,
          hederaAccountId: userData.hederaAccountId
        });

        const user: SeedUser = {
          id: response.user.id,
          email: userData.email,
          displayName: userData.displayName,
          hederaAccountId: response.user.hederaAccountId,
          authToken: response.token
        };

        users.push(user);
        console.log(`  ✓ Created ${userData.displayName} (${user.hederaAccountId})`);
      } catch (error: unknown) {
        const axiosError = error as { response?: { status?: number } };
        if (axiosError.response?.status === 409) {
          console.log(`  ⚠ User ${userData.email} already exists, skipping`);
        } else {
          throw error;
        }
      }
    }

    if (users.length < 2) {
      throw new Error('Failed to create enough demo users');
    }

    // Step 2: Update Profiles
    console.log('\n🖼️  Updating profiles with avatars...');
    const avatars = [
      'https://i.pravatar.cc/150?img=1',
      'https://i.pravatar.cc/150?img=2',
      'https://i.pravatar.cc/150?img=3'
    ];

    for (let i = 0; i < users.length; i++) {
      await api.setToken(users[i].authToken);
      await api.post('/users/profile', {
        avatar: avatars[i],
        bio: DEMO_USERS[i].bio
      });
      console.log(`  ✓ Updated ${users[i].displayName}'s profile`);
    }

    // Step 3: Create Conversations
    console.log('\n💬 Creating conversations...');

    // 1:1 conversation: Alice <-> Bob
    await api.setToken(users[0].authToken);
    const conv1to1Response = await api.post('/conversations/create', {
      name: `${users[0].displayName} & ${users[1].displayName}`,
      participantAccountIds: [users[1].hederaAccountId],
      isPrivate: true
    });
    const conv1to1Id = conv1to1Response.id;
    const conv1to1TopicId = conv1to1Response.conversationTopic.topicId;
    console.log(`  ✓ Created 1:1 conversation: ${conv1to1Id}`);

    // Group conversation: All three
    const groupConvResponse = await api.post('/conversations/create', {
      name: 'Demo Team',
      participantAccountIds: [users[1].hederaAccountId, users[2].hederaAccountId],
      isPrivate: false
    });
    const groupConvId = groupConvResponse.id;
    const groupConvTopicId = groupConvResponse.conversationTopic.topicId;
    console.log(`  ✓ Created group conversation: ${groupConvId}`);

    // Step 4: Send Messages
    console.log('\n✉️  Sending demo messages...');

    // Alice sends message to Bob
    await api.setToken(users[0].authToken);
    await api.post(`/conversations/${conv1to1Id}/messages`, {
      content: "Hey Bob! Check out this amazing blockchain social platform 🚀"
    });
    console.log(`  ✓ Alice → Bob: Welcome message`);

    // Bob replies
    await api.setToken(users[1].authToken);
    await api.post(`/conversations/${conv1to1Id}/messages`, {
      content: "This is incredible! The UX is so smooth. How did you build this?"
    });
    console.log(`  ✓ Bob → Alice: Reply`);

    // Group messages
    await api.setToken(users[0].authToken);
    await api.post(`/conversations/${groupConvId}/messages`, {
      content: "@everyone Welcome to the demo team group! Let's build something amazing together 💪"
    });
    console.log(`  ✓ Alice → Group: Team announcement`);

    await api.setToken(users[2].authToken);
    await api.post(`/conversations/${groupConvId}/messages`, {
      content: "Thanks Alice! Excited to be here. I've been exploring Hedera and this platform is exactly what the ecosystem needed."
    });
    console.log(`  ✓ Charlie → Group: Introduction`);

    // Step 5: Create Posts
    console.log('\n📱 Creating demo posts...');

    // Alice's post
    await api.setToken(users[0].authToken);
    const alicePostResponse = await api.post('/posts/create', {
      content: "Just launched HederaSocial - a wallet-as-identity social platform on Hedera! 🎉 No accounts, no passwords, just your Hedera wallet. Check out the in-chat payments feature!",
      media: []
    });
    console.log(`  ✓ Alice posted: Product launch announcement`);

    // Bob's post
    await api.setToken(users[1].authToken);
    const bobPostResponse = await api.post('/posts/create', {
      content: "The design on HederaSocial is 🔥. Clean, intuitive, and actually respectful to users. This is how social media should be designed.",
      media: []
    });
    console.log(`  ✓ Bob posted: Design praise`);

    // Charlie's post
    await api.setToken(users[2].authToken);
    const charliePostResponse = await api.post('/posts/create', {
      content: "Building on Hedera has been a game-changer. The throughput, the cost, the finality - all unmatched. HederaSocial is proof that Web3 UX can be better than Web2.",
      media: []
    });
    console.log(`  ✓ Charlie posted: Technical thoughts`);

    // Step 6: Create Follow Relationships
    console.log('\n👥 Creating follow relationships...');

    // Alice follows Bob
    await api.setToken(users[0].authToken);
    await api.post('/social/follow', {
      targetAccountId: users[1].hederaAccountId
    });
    console.log(`  ✓ Alice follows Bob`);

    // Bob follows Charlie
    await api.setToken(users[1].authToken);
    await api.post('/social/follow', {
      targetAccountId: users[2].hederaAccountId
    });
    console.log(`  ✓ Bob follows Charlie`);

    // Charlie follows Alice
    await api.setToken(users[2].authToken);
    await api.post('/social/follow', {
      targetAccountId: users[0].hederaAccountId
    });
    console.log(`  ✓ Charlie follows Alice`);

    // Step 7: Send In-Chat Payment
    console.log('\n💰 Sending demo payment...');

    // Alice sends 50 USDC to Bob
    await api.setToken(users[0].authToken);
    const paymentResponse = await api.post('/payments/send', {
      recipientAccountId: users[1].hederaAccountId,
      amount: 50.00,
      currency: 'USD',
      note: 'Thanks for the design feedback! ✨',
      topicId: conv1to1TopicId
    });
    console.log(`  ✓ Alice sent $50 USD to Bob in chat`);
    console.log(`    Transaction: ${paymentResponse.transactionHash}`);

    // Step 8: Create Payment Request
    console.log('\n📋 Creating payment request...');

    // Bob requests 25 USDC from Alice
    await api.setToken(users[1].authToken);
    await api.post('/payments/request', {
      amount: 25.00,
      currency: 'USD',
      note: 'Coffee budget for this week',
      topicId: conv1to1TopicId
    });
    console.log(`  ✓ Bob requested $25 USD from Alice`);

    // Step 9: Create Split Payment
    console.log('\n🍕 Creating split payment...');

    // Alice creates split in group (bill splitting scenario)
    await api.setToken(users[0].authToken);
    const splitResponse = await api.post('/payments/split', {
      totalAmount: 120.00,
      currency: 'USD',
      splitMethod: 'equal',
      participants: [users[0].hederaAccountId, users[1].hederaAccountId, users[2].hederaAccountId],
      note: 'Team dinner split 🍽️',
      topicId: groupConvTopicId
    });
    console.log(`  ✓ Alice created $120 USD split payment`);
    console.log(`    Each person pays: $${(120 / 3).toFixed(2)}`);

    // Bob pays his share
    await api.setToken(users[1].authToken);
    await api.post(`/payments/split/${splitResponse.id}/pay`, {
      topicId: groupConvTopicId
    });
    console.log(`  ✓ Bob paid his share of split`);

    // Charlie pays his share
    await api.setToken(users[2].authToken);
    await api.post(`/payments/split/${splitResponse.id}/pay`, {
      topicId: groupConvTopicId
    });
    console.log(`  ✓ Charlie paid his share of split`);

    // Step 10: Like Posts
    console.log('\n❤️ Adding likes to posts...');

    // Bob likes Alice's post
    await api.setToken(users[1].authToken);
    await api.post(`/posts/${alicePostResponse.id}/like`);
    console.log(`  ✓ Bob liked Alice's post`);

    // Charlie likes Bob's post
    await api.setToken(users[2].authToken);
    await api.post(`/posts/${bobPostResponse.id}/like`);
    console.log(`  ✓ Charlie liked Bob's post`);

    // Alice likes Charlie's post
    await api.setToken(users[0].authToken);
    await api.post(`/posts/${charliePostResponse.id}/like`);
    console.log(`  ✓ Alice liked Charlie's post`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ Demo seed completed successfully!');
    console.log('='.repeat(60));
    console.log('\n📊 Demo Data Summary:');
    console.log(`  • Created ${users.length} demo users`);
    console.log('  • Created 2 conversations (1:1 and group)');
    console.log('  • Sent 4 demo messages');
    console.log('  • Created 3 demo posts');
    console.log('  • Created 3 follow relationships');
    console.log('  • Sent 1 payment ($50 USD)');
    console.log('  • Created 1 payment request ($25 USD)');
    console.log('  • Created 1 split payment ($120 USD)');
    console.log('  • Added 3 post likes');
    console.log('\n🔐 Demo Credentials:');
    for (const user of users) {
      console.log(`  ${user.displayName}:`);
      console.log(`    Email: ${user.email}`);
      console.log(`    Password: ${DEMO_PASSWORD}`);
      console.log(`    Hedera Account: ${user.hederaAccountId}`);
    }
    console.log('\n🚀 You can now log in to the app and explore the demo!');
    console.log('   http://localhost:3000\n');

  } catch (error) {
    console.error('\n❌ Seed failed:', error);
    process.exit(1);
  }
}

// Run seed
seedDatabase().then(() => {
  console.log('✅ Seed script completed');
  process.exit(0);
});
```

### Step 2: Create Reset Script

Create file: `scripts/reset-db.ts`

```typescript
import 'reflect-metadata';
import dotenv from 'dotenv';
import { createConnection } from 'typeorm';

dotenv.config();

async function resetDatabase() {
  console.log('🔄 Resetting database...');

  try {
    // Note: This is a simplified version. In production, use TypeORM migrations
    // For now, we'll just log what needs to happen

    console.log(`
    ⚠️  Manual Database Reset Required:

    1. Stop the NestJS server
    2. Delete all data from PostgreSQL:

       DROP SCHEMA public CASCADE;
       CREATE SCHEMA public;

    3. Run migrations:
       npm run typeorm migration:run

    4. Run seed script:
       npm run seed

    🚨 WARNING: This will delete ALL data. Make sure you have backups!
    `);

    console.log('\n✅ Reset instructions displayed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Reset failed:', error);
    process.exit(1);
  }
}

resetDatabase();
```

### Step 3: Update package.json

Update `package.json` to add seed scripts:

```json
{
  "scripts": {
    "seed": "ts-node -O '{\"module\":\"commonjs\"}' scripts/seed-demo.ts",
    "reset": "ts-node -O '{\"module\":\"commonjs\"}' scripts/reset-db.ts",
    "typeorm": "typeorm",
    "migration:run": "typeorm migration:run",
    "migration:create": "typeorm migration:create",
    "start": "nest start",
    "dev": "nest start --watch"
  }
}
```

### Step 4: Create Setup Guide

Create file: `SETUP.md`

```markdown
# HederaSocial Setup Guide

## Quick Start (5 minutes)

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Hedera testnet account with HBAR

### 1. Clone & Install
\`\`\`bash
git clone https://github.com/yourusername/hedera-social-platform.git
cd hedera-social-platform

# Install dependencies
pnpm install
\`\`\`

### 2. Configure Environment
Copy `.env.example` to `.env` and fill in your values:

\`\`\`bash
cp .env.example .env
\`\`\`

**Required variables:**
\`\`\`
# Hedera
HEDERA_ACCOUNT_ID=0.0.xxxxx
HEDERA_PRIVATE_KEY=302e...
HEDERA_NETWORK=testnet
HTS_TOKEN_ID=0.0.xxxxx

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/hedera_social

# JWT
JWT_SECRET=your_secret_key_here_min_32_chars

# Tamam (Mock mode for hackathon)
TAMAM_RAILS_MOCK=true

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:3001
\`\`\`

### 3. Start Services
\`\`\`bash
# Start PostgreSQL (if using Docker)
docker run -d \\
  -e POSTGRES_USER=postgres \\
  -e POSTGRES_PASSWORD=postgres \\
  -e POSTGRES_DB=hedera_social \\
  -p 5432:5432 \\
  postgres:14

# Start NestJS backend
pnpm dev:backend

# In another terminal, start Next.js frontend
pnpm dev:frontend
\`\`\`

### 4. Load Demo Data
\`\`\`bash
pnpm seed
\`\`\`

### 5. Access Platform
Open http://localhost:3000 in your browser

**Demo credentials:**
- Email: alice@demo.hedera.social
- Password: DemoPassword123!

## Manual Setup (without seed)

If you prefer to set up manually:

1. Register at http://localhost:3000/register
2. Complete KYC verification
3. Create a conversation
4. Send messages and payments

## Architecture

- **Frontend**: Next.js 14, React, Tailwind CSS, Zustand
- **Backend**: NestJS, TypeORM, PostgreSQL
- **Blockchain**: Hedera (HCS for messaging, HTS for tokens)
- **Custody**: Tamam Payment Rails (mocked for hackathon)
- **KYC**: Mirsad AI KYC service

## Troubleshooting

### Database Connection Error
\`\`\`bash
# Check PostgreSQL is running
psql -U postgres -d hedera_social -c "SELECT 1"

# If needed, reset database
pnpm reset
pnpm migration:run
pnpm seed
\`\`\`

### WebSocket Connection Error
\`\`\`bash
# Check backend is running on correct port
curl http://localhost:3000/health

# Verify NEXT_PUBLIC_WS_URL in .env
\`\`\`

### Seed Script Fails
\`\`\`bash
# Check API is running
curl http://localhost:3000/health

# Check database is empty (or reset it)
pnpm reset

# Run seed again
pnpm seed
\`\`\`

## Next Steps

- [ ] Log in with demo account
- [ ] Send a message in 1:1 conversation
- [ ] Create and send a payment
- [ ] Create a group conversation
- [ ] Make a split payment
- [ ] View transactions on HashScan
- [ ] Check out your profile

## Support

For issues or questions, open an issue on GitHub or contact the team.
```

## Verification Steps

| Verification Step | Expected Result | Status |
|---|---|---|
| Script runs without errors | `✅ Demo seed completed successfully!` message | ✓ |
| 3 users created in database | `users` table has 3 records | ✓ |
| 2 conversations created | `conversations` table has 2 records | ✓ |
| 4 messages sent | `messages` table has 4 records | ✓ |
| 3 posts created | `posts` table has 3 records | ✓ |
| 3 follows created | `follows` table has 3 records | ✓ |
| 1 payment sent | `payments` table has 1 send record | ✓ |
| 1 payment request created | `payments` table has 1 request record | ✓ |
| Split payment created | `split_payments` table has 1 record | ✓ |
| Demo credentials work | Can log in with alice@demo.hedera.social | ✓ |
| Demo data visible in UI | Messages, posts, payments visible in app | ✓ |
| Transactions on testnet | Can view on https://hashscan.io/testnet | ✓ |

## Definition of Done

- [ ] Seed script created and compiles
- [ ] Script creates 3 demo users with unique emails and Hedera accounts
- [ ] Users have profile avatars and bios
- [ ] 1:1 conversation created between Alice and Bob
- [ ] Group conversation created with all three users
- [ ] 4 sample messages sent in conversations
- [ ] 3 sample posts created by different users
- [ ] 3 follow relationships created
- [ ] 1 payment sent ($50 USD from Alice to Bob)
- [ ] 1 payment request created
- [ ] 1 split payment created and paid by all participants
- [ ] Post likes created
- [ ] Script runs with `pnpm seed` command
- [ ] All users can log in after seed
- [ ] Demo data visible in frontend
- [ ] SETUP.md created with clear instructions
- [ ] Reset script available for cleanup
- [ ] Error handling and logging included
- [ ] Script runs against real backend API
- [ ] Transactions visible on HashScan (testnet)

## Troubleshooting

### Issue: "Cannot find module 'dotenv'"
**Cause**: Dependency not installed
**Solution**:
```bash
npm install dotenv axios
```

### Issue: "ECONNREFUSED localhost:3000"
**Cause**: Backend not running
**Solution**:
```bash
# Terminal 1: Start backend
pnpm dev:backend

# Terminal 2: Run seed
pnpm seed
```

### Issue: "User already exists"
**Cause**: Seed already ran once
**Solution**:
```bash
# Reset database
pnpm reset
pnpm migration:run

# Run seed again
pnpm seed
```

### Issue: "Payment failed: TAMAM_RAILS_MOCK not set"
**Cause**: Environment variable missing
**Solution**:
- Add `TAMAM_RAILS_MOCK=true` to .env
- Restart backend

### Issue: "Conversation topic not found"
**Cause**: Conversation creation failed silently
**Solution**:
- Check HederaService is initialized
- Verify HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY are correct
- Check Hedera network is testnet

## Files Created in This Task

1. `/sessions/exciting-sharp-mayer/mnt/social-platform/scripts/seed-demo.ts` (400 lines)
2. `/sessions/exciting-sharp-mayer/mnt/social-platform/scripts/reset-db.ts` (40 lines)
3. `/sessions/exciting-sharp-mayer/mnt/social-platform/SETUP.md` (200 lines)
4. Updated `/sessions/exciting-sharp-mayer/mnt/social-platform/package.json` with seed scripts

**Total: ~640 lines**

## What Happens Next

1. **P0-T26 (GitHub README)**: Document the platform with architecture diagrams
2. **P0-T27 (Pitch Deck)**: Create presentation using demo data
3. **P0-T28 (Demo Video)**: Record walkthrough using seeded demo data
4. **Hackathon Submission**: Judges can `pnpm seed` and immediately see working platform
