# P1-T29: Organization Tenancy & RBAC Backend

| Field | Value |
|-------|-------|
| Task ID | P1-T29 |
| Phase | Phase 7: Business Features |
| Priority | P1 |
| Estimated Time | 8 hours |
| Depends On | P0-T05 (DB Schema), P0-T09 (Auth/Registration), P0-T11 (KYC/KYB + DID NFT) |
| Spec References | docs/SPECIFICATION.md: FR-ID-008, FR-ID-009, FR-ID-010, FR-BIZ-002, FR-BIZ-003, FR-BIZ-004 |
| PRD Reference | docs/PRD-BUSINESS-FEATURES.md: Feature 1 (Org Tenancy), Feature 2 (RBAC) |

---

## Objective

Implement the organization model that auto-creates when a business completes KYB verification, multi-member team management with invite/accept flow, and role-based access control (Owner/Admin/Member/Viewer) with a NestJS guard that enforces permissions on all org-scoped endpoints.

---

## Background

Currently, business accounts are individual users with a `business` type flag and a `business_profiles` table. There's no multi-user structure. This task creates the organization layer: a business account becomes an organization with multiple members, each with their own login and scoped permissions.

---

## Prerequisites

- [ ] PostgreSQL running with existing schema (P0-T05)
- [ ] Auth module functional with JWT (P0-T09)
- [ ] KYB webhook handler exists (P0-T11) — org creation hooks into KYB approval callback
- [ ] Hedera service can submit HCS messages (P0-T06)

---

## Step-by-Step Implementation

### Step 1: Database Migration (1 hour)

Create migration for 3 new tables as specified in docs/SPECIFICATION.md Section 4.2:

1. `organizations` — org profile, KYB status, Hedera account, broadcast topic
2. `organization_members` — user ↔ org mapping with role
3. `organization_invitations` — pending invites with token + expiry

Create TypeORM entities:
- `OrganizationEntity` with all columns and relations
- `OrganizationMemberEntity` with role enum and unique constraint
- `OrganizationInvitationEntity` with status enum and token index

### Step 2: NestJS Module Scaffold (30 min)

Create `packages/api/src/organization/`:
- `organization.module.ts` — imports TypeORM entities, Hedera module
- `organization.controller.ts` — REST endpoints
- `organization.service.ts` — business logic
- `dto/` — request/response DTOs with class-validator
- `guards/org-permission.guard.ts` — RBAC guard
- `decorators/requires-org-role.decorator.ts` — role decorator

### Step 3: Auto-Org Creation on KYB Approval (1 hour)

Hook into the existing KYB approval webhook handler (P0-T11):

1. When KYB status changes to `approved`:
   - Create `Organization` record linked to the user
   - Set user as Owner in `organization_members`
   - Migrate data from `business_profiles` (company name, category, website, hours)
   - Assign existing `broadcast_topic` to the organization
   - Submit `org_created` HCS message to social graph topic (DM-ORG-002 format)
2. Organization's `hedera_account_id` = owner's account (shared org wallet deferred)

### Step 4: RBAC Guard Implementation (1.5 hours)

Create `OrgPermissionGuard`:

1. Reads `X-Org-Context` header from request
2. If present: validates user is a member of that org via `organization_members` table
3. Injects `orgContext` into request object: `{ orgId, role, org }`
4. `@RequiresOrgRole('admin', 'owner')` decorator sets metadata
5. Guard reads required roles from metadata, compares against user's actual role
6. Returns 403 with `{ error: 'ORG_PERMISSION_DENIED', requiredRole: '...', actualRole: '...' }` if unauthorized

Permission matrix (from docs/SPECIFICATION.md FR-ID-010):
- **Owner**: all permissions
- **Admin**: invite/remove members, message as org, send payments, post broadcasts, update profile
- **Member**: message as org, create payment requests, view conversations + transactions
- **Viewer**: read-only access to org conversations and transaction history

### Step 5: Invitation Flow (1.5 hours)

Implement endpoints:

1. **POST `/api/v1/organizations/me/invitations`** (Owner/Admin):
   - Validate caller role
   - Generate 128-bit URL-safe token (`crypto.randomBytes(16).toString('hex')`)
   - Create invitation record (pending, 7-day expiry)
   - Return invitation details
   - In production: trigger email notification

2. **POST `/api/v1/organizations/invitations/:token/accept`**:
   - Validate token exists and not expired
   - Link user to org with assigned role
   - Update invitation status to `accepted`
   - Submit role grant to HCS (DM-ORG-001 format)

3. **GET `/api/v1/organizations/me/invitations`** (Owner/Admin):
   - List pending invitations with status

### Step 6: Role Management (1 hour)

1. **PUT `/api/v1/organizations/me/members/:userId/role`** (Owner only):
   - Validate caller is Owner
   - Validate target is a member
   - Update role in `organization_members`
   - Submit role change to HCS (DM-ORG-001 format)
   - Return updated member

2. **DELETE `/api/v1/organizations/me/members/:userId`** (Owner/Admin):
   - Cannot remove Owner
   - Remove from `organization_members`
   - Submit role revocation to HCS

### Step 7: Organization Profile CRUD (1 hour)

1. **GET `/api/v1/organizations/me`**: Return org with members list
2. **PUT `/api/v1/organizations/me`** (Owner/Admin): Update profile fields
   - If logo changed: upload to IPFS via Pinata → store CID
3. Add `badgeTier` computed field (from `kyb_status`):
   - `pending` → `'basic'`
   - `verified` → `'verified'`
   - `certified` → `'certified'`

### Step 8: Org Context in JWT (30 min)

Extend JWT payload to optionally include org context:
```typescript
{
  sub: '0.0.12345',
  uid: 'uuid',
  type: 'individual',
  status: 'active',
  orgId?: 'uuid',        // if user switched to org context
  orgRole?: 'admin',     // user's role in the org
}
```

Or use `X-Org-Context` header approach (simpler for hackathon — no token re-issue needed).

---

## Validation Checklist

- [ ] Organization auto-created when KYB webhook fires with `approved` status
- [ ] Owner role automatically assigned to KYB-verified user
- [ ] Business profile data migrated to organization record
- [ ] Org creation recorded on social graph HCS topic
- [ ] Invitation generates unique token, expires after 7 days
- [ ] Accepting invitation links user to org with correct role
- [ ] Role grant recorded on HCS
- [ ] OrgPermissionGuard blocks unauthorized access (returns 403)
- [ ] Owner can change member roles
- [ ] Role changes recorded on HCS
- [ ] Org profile CRUD works with IPFS logo upload
- [ ] `pnpm lint` passes
- [ ] `pnpm tsc --noEmit` passes
- [ ] No `any` types, no `console.log`, no mocking
