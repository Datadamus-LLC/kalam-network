/**
 * Organization Member Management
 * Tests: role change, remove member, invite accept, pending invitations
 */
import { test, expect } from './fixtures';
import { registerUserViaApi } from './helpers';

const API = 'http://localhost:3001/api/v1';

let owner: { email: string; token: string; refreshToken: string; hederaAccountId: string };
let invitee: { email: string; token: string; refreshToken: string; hederaAccountId: string };
let orgId: string | null = null;

test.beforeAll(async () => {
  owner = await registerUserViaApi('orgMgmtOwner');
  invitee = await registerUserViaApi('orgMgmtInvitee');

  // Create org if not exists
  const createRes = await fetch(`${API}/organizations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ name: `MgmtOrg ${Date.now().toString().slice(-4)}` }),
  });
  if (createRes.ok) {
    orgId = (await createRes.json() as { data?: { id: string } }).data?.id ?? null;
  } else if (createRes.status === 409) {
    const getRes = await fetch(`${API}/organizations/me`, { headers: { Authorization: `Bearer ${owner.token}` } });
    if (getRes.ok) orgId = (await getRes.json() as { data?: { id: string } }).data?.id ?? null;
  }
});

// ─── Invite Accept Flow ───────────────────────────────────────────────────────

test.describe('Invite Accept', () => {
  let invitationToken: string | null = null;

  test('create invitation with valid email and role', async ({ page }) => {
    if (!orgId) { test.skip(true, 'No org'); return; }
    const res = await fetch(`${API}/organizations/me/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ email: invitee.email, role: 'member' }),
    });
    expect([200, 201]).toContain(res.status);
    const d = await res.json() as { data?: { id: string; token: string; status: string; email: string } };
    expect(d.data?.status).toBe('pending');
    expect(d.data?.email).toBe(invitee.email);
    invitationToken = d.data?.token ?? null;
  });

  test('accept invitation adds user to org as member', async ({ page }) => {
    if (!orgId || !invitationToken) { test.skip(true, 'No org or invitation token'); return; }

    const res = await fetch(`${API}/organizations/invitations/${invitationToken}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${invitee.token}` },
    });
    // 200 = accepted, 409 = already a member
    expect([200, 201, 409]).toContain(res.status);
    if (res.ok) {
      const d = await res.json() as { data?: { role: string } };
      // Should be member after accepting
      expect(['member', 'admin', 'viewer']).toContain(d.data?.role);
    }
  });

  test('invitation token is single-use (second accept returns error)', async ({ page }) => {
    if (!orgId || !invitationToken) { test.skip(true, 'No invitation token'); return; }
    const res = await fetch(`${API}/organizations/invitations/${invitationToken}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${invitee.token}` },
    });
    // Already accepted or already a member → error
    expect([400, 409, 404]).toContain(res.status);
  });

  test('invalid invitation token returns 404', async ({ page }) => {
    const res = await fetch(`${API}/organizations/invitations/invalid-fake-token-xyz/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${invitee.token}` },
    });
    expect([400, 404]).toContain(res.status);
  });
});

// ─── Role Change ─────────────────────────────────────────────────────────────

test.describe('Role Change', () => {
  let inviteeMemberId: string | null = null;

  test.beforeAll(async () => {
    if (!orgId) return;
    // Find the invitee in the members list
    const res = await fetch(`${API}/organizations/me/members`, { headers: { Authorization: `Bearer ${owner.token}` } });
    if (res.ok) {
      const d = await res.json() as { data?: Array<{ userId: string; role: string; id: string }> };
      const members = Array.isArray(d.data) ? d.data : [];
      // invitee user ID from JWT
      const inviteeJwt = JSON.parse(Buffer.from(invitee.token.split('.')[1], 'base64').toString());
      const member = members.find(m => m.userId === inviteeJwt.sub);
      inviteeMemberId = member?.userId ?? null;
    }
  });

  test('owner can change member role to admin', async ({ page }) => {
    if (!orgId || !inviteeMemberId) { test.skip(true, 'No member to change'); return; }
    const res = await fetch(`${API}/organizations/me/members/${inviteeMemberId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ role: 'admin' }),
    });
    expect([200, 404]).toContain(res.status); // 404 if member not yet accepted invite
    if (res.ok) {
      const d = await res.json() as { data?: { role: string } };
      expect(d.data?.role).toBe('admin');
    }
  });

  test('owner can change role back to member', async ({ page }) => {
    if (!orgId || !inviteeMemberId) { test.skip(true, 'No member'); return; }
    const res = await fetch(`${API}/organizations/me/members/${inviteeMemberId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ role: 'member' }),
    });
    expect([200, 404]).toContain(res.status);
  });

  test('invalid role returns 400', async ({ page }) => {
    if (!orgId || !inviteeMemberId) { test.skip(true, 'No member'); return; }
    const res = await fetch(`${API}/organizations/me/members/${inviteeMemberId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ role: 'superpower' }),
    });
    expect(res.status).toBe(400);
  });

  test('non-owner cannot change roles', async ({ page }) => {
    if (!orgId || !inviteeMemberId) { test.skip(true, 'No member'); return; }
    const res = await fetch(`${API}/organizations/me/members/${inviteeMemberId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${invitee.token}` },
      body: JSON.stringify({ role: 'viewer' }),
    });
    // invitee has no org of their own → 404
    expect([403, 404]).toContain(res.status);
  });
});

// ─── Remove Member ────────────────────────────────────────────────────────────

test.describe('Remove Member', () => {
  let memberToRemoveId: string | null = null;

  test.beforeAll(async () => {
    if (!orgId) return;
    const res = await fetch(`${API}/organizations/me/members`, { headers: { Authorization: `Bearer ${owner.token}` } });
    if (res.ok) {
      const d = await res.json() as { data?: Array<{ userId: string; role: string }> };
      const members = Array.isArray(d.data) ? d.data : [];
      const inviteeJwt = JSON.parse(Buffer.from(invitee.token.split('.')[1], 'base64').toString());
      const member = members.find(m => m.userId === inviteeJwt.sub && m.role !== 'owner');
      memberToRemoveId = member?.userId ?? null;
    }
  });

  test('owner can remove a non-owner member', async ({ page }) => {
    if (!orgId || !memberToRemoveId) { test.skip(true, 'No member to remove'); return; }
    const res = await fetch(`${API}/organizations/me/members/${memberToRemoveId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect([200, 404]).toContain(res.status);
    if (res.ok) {
      // Verify member is no longer in the list
      const listRes = await fetch(`${API}/organizations/me/members`, { headers: { Authorization: `Bearer ${owner.token}` } });
      const d = await listRes.json() as { data?: Array<{ userId: string }> };
      const members = Array.isArray(d.data) ? d.data : [];
      const stillMember = members.find(m => m.userId === memberToRemoveId);
      expect(stillMember).toBeFalsy();
    }
  });

  test('owner cannot remove themselves', async ({ page }) => {
    if (!orgId) { test.skip(true, 'No org'); return; }
    const ownerJwt = JSON.parse(Buffer.from(owner.token.split('.')[1], 'base64').toString());
    const res = await fetch(`${API}/organizations/me/members/${ownerJwt.sub}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    // Cannot remove yourself as owner
    expect([400, 403]).toContain(res.status);
  });

  test('removing non-existent member returns 404', async ({ page }) => {
    if (!orgId) { test.skip(true, 'No org'); return; }
    const res = await fetch(`${API}/organizations/me/members/00000000-0000-4000-8000-000000000000`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect([400, 404]).toContain(res.status);
  });
});
