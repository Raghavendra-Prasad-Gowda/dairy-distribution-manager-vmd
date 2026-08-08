'use strict';

/**
 * Admin Users API Tests
 * Covers: GET /, POST /, PUT /:id, DELETE /:id  /api/v1/admin-users
 *
 * All endpoints are superadmin-only.
 */

const { expect } = require('@playwright/test');
const { setupSuite, makeSalesmanToken, makeExpiredToken, makeSuperAdminToken } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

const ADMIN_USER = {
  id: 2,
  username: 'manager',
  role: 'admin',
  isActive: true,
  createdAt: new Date('2026-01-01'),
};

const SUPER_USER = {
  id: 1,
  username: 'superadmin',
  role: 'superadmin',
  isActive: true,
  createdAt: new Date('2026-01-01'),
};

// ─── GET /api/v1/admin-users ──────────────────────────────────────────────────

test.describe('GET /api/v1/admin-users', () => {
  test('returns 403 when no token provided (unauthenticated)', async ({ request }) => {
    const res = await request.get('/api/v1/admin-users');
    expect(res.status()).toBe(403);
  });

  test('returns 401 when JWT is expired', async ({ request }) => {
    const res = await request.get('/api/v1/admin-users', {
      headers: { Authorization: `Bearer ${makeExpiredToken()}` },
    });
    expect(res.status()).toBe(401);
  });

  test('returns 403 when salesman token provided', async ({ request }) => {
    const res = await request.get('/api/v1/admin-users', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 200 with admin user list when superadmin authenticated', async ({ request }) => {
    ctx.mockPrisma.adminUser.findMany.mockResolvedValue([SUPER_USER, ADMIN_USER]);

    const res = await request.get('/api/v1/admin-users', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });

  test('returns 403 when admin (non-superadmin) token provided', async ({ request }) => {
    const res = await request.get('/api/v1/admin-users', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(403);
  });

  test('response does not include passwordHash field', async ({ request }) => {
    ctx.mockPrisma.adminUser.findMany.mockResolvedValue([ADMIN_USER]);

    const res = await request.get('/api/v1/admin-users', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
    });

    const body = await res.json();
    expect(body.data[0]).not.toHaveProperty('passwordHash');
    expect(body.data[0]).toHaveProperty('username');
    expect(body.data[0]).toHaveProperty('role');
  });
});

// ─── POST /api/v1/admin-users ─────────────────────────────────────────────────

test.describe('POST /api/v1/admin-users', () => {
  test('returns 403 when no token provided (unauthenticated)', async ({ request }) => {
    const res = await request.post('/api/v1/admin-users', {
      data: { username: 'newadmin', password: 'password123', role: 'admin' },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 401 when JWT is expired', async ({ request }) => {
    const res = await request.post('/api/v1/admin-users', {
      headers: { Authorization: `Bearer ${makeExpiredToken()}` },
      data: { username: 'newadmin', password: 'password123', role: 'admin' },
    });
    expect(res.status()).toBe(401);
  });

  test('returns 403 when salesman token provided', async ({ request }) => {
    const res = await request.post('/api/v1/admin-users', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
      data: { username: 'newadmin', password: 'password123', role: 'admin' },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 201 when admin user is created', async ({ request }) => {
    ctx.mockPrisma.adminUser.create.mockResolvedValue(ADMIN_USER);

    const res = await request.post('/api/v1/admin-users', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { username: 'manager', password: 'securepass', role: 'admin' },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('username', 'manager');
    expect(body.data).not.toHaveProperty('passwordHash');
  });

  test('returns 201 with default role admin when role is omitted', async ({ request }) => {
    ctx.mockPrisma.adminUser.create.mockResolvedValue(ADMIN_USER);

    const res = await request.post('/api/v1/admin-users', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { username: 'manager', password: 'securepass' },
    });

    expect(res.status()).toBe(201);
  });

  test('returns 400 when username is missing', async ({ request }) => {
    const res = await request.post('/api/v1/admin-users', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { password: 'securepass', role: 'admin' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when username is too short (< 3 chars)', async ({ request }) => {
    const res = await request.post('/api/v1/admin-users', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { username: 'ab', password: 'securepass', role: 'admin' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when password is missing', async ({ request }) => {
    const res = await request.post('/api/v1/admin-users', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { username: 'manager', role: 'admin' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when password is too short (< 6 chars)', async ({ request }) => {
    const res = await request.post('/api/v1/admin-users', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { username: 'manager', password: 'abc', role: 'admin' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when role is invalid', async ({ request }) => {
    const res = await request.post('/api/v1/admin-users', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { username: 'manager', password: 'securepass', role: 'god' },
    });
    expect(res.status()).toBe(400);
  });

  // ── Case-insensitive username uniqueness ─────────────────────────────────
  // Login matches usernames case-insensitively, so "manager" and "MANAGER"
  // must not both be allowed to exist. See adminUsers.controller.js create().

  test('returns 409 when username collides case-insensitively with an existing admin', async ({ request }) => {
    ctx.mockPrisma.adminUser.findFirst.mockResolvedValue(ADMIN_USER); // stored username: 'manager'

    const res = await request.post('/api/v1/admin-users', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { username: 'MANAGER', password: 'securepass', role: 'admin' },
    });

    expect(res.status()).toBe(409);
  });

  test('uniqueness check queries the username case-insensitively', async ({ request }) => {
    let findFirstArgs = null;
    ctx.mockPrisma.adminUser.findFirst.mockImplementation(async (args) => {
      findFirstArgs = args;
      return null;
    });
    ctx.mockPrisma.adminUser.create.mockResolvedValue(ADMIN_USER);

    await request.post('/api/v1/admin-users', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { username: 'newmanager', password: 'securepass', role: 'admin' },
    });

    expect(findFirstArgs.where.username).toEqual({ equals: 'newmanager', mode: 'insensitive' });
  });

  test('returns 201 when username has no case-insensitive collision', async ({ request }) => {
    ctx.mockPrisma.adminUser.findFirst.mockResolvedValue(null);
    ctx.mockPrisma.adminUser.create.mockResolvedValue(ADMIN_USER);

    const res = await request.post('/api/v1/admin-users', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { username: 'newmanager', password: 'securepass', role: 'admin' },
    });

    expect(res.status()).toBe(201);
  });
});

// ─── PUT /api/v1/admin-users/:id ─────────────────────────────────────────────

test.describe('PUT /api/v1/admin-users/:id', () => {
  test('returns 403 when no token provided (unauthenticated)', async ({ request }) => {
    const res = await request.put('/api/v1/admin-users/2', {
      data: { username: 'updatedname' },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 401 when JWT is expired', async ({ request }) => {
    const res = await request.put('/api/v1/admin-users/2', {
      headers: { Authorization: `Bearer ${makeExpiredToken()}` },
      data: { username: 'updatedname' },
    });
    expect(res.status()).toBe(401);
  });

  test('returns 403 when salesman token provided', async ({ request }) => {
    const res = await request.put('/api/v1/admin-users/2', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
      data: { username: 'updatedname' },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 400 for non-numeric ID', async ({ request }) => {
    const res = await request.put('/api/v1/admin-users/abc', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { username: 'updatedname' },
    });
    expect(res.status()).toBe(400);
  });

  // ── Case-insensitive username uniqueness ─────────────────────────────────

  test('returns 409 when updated username collides case-insensitively with another admin', async ({ request }) => {
    ctx.mockPrisma.adminUser.findFirst.mockResolvedValue({ id: 3, username: 'other' });

    const res = await request.put('/api/v1/admin-users/2', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { username: 'OTHER' },
    });

    expect(res.status()).toBe(409);
  });

  test('uniqueness check excludes the record being updated (id: { not: id })', async ({ request }) => {
    let findFirstArgs = null;
    ctx.mockPrisma.adminUser.findFirst.mockImplementation(async (args) => {
      findFirstArgs = args;
      return null;
    });
    ctx.mockPrisma.adminUser.update.mockResolvedValue({ ...ADMIN_USER, username: 'manager' });

    await request.put('/api/v1/admin-users/2', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { username: 'manager' },
    });

    expect(findFirstArgs.where).toMatchObject({
      username: { equals: 'manager', mode: 'insensitive' },
      id: { not: 2 },
    });
  });

  test('returns 200 when username is updated', async ({ request }) => {
    ctx.mockPrisma.adminUser.update.mockResolvedValue({ ...ADMIN_USER, username: 'newname' });

    const res = await request.put('/api/v1/admin-users/2', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { username: 'newname' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('username', 'newname');
    expect(body.data).not.toHaveProperty('passwordHash');
  });

  test('returns 200 when role is updated to superadmin', async ({ request }) => {
    ctx.mockPrisma.adminUser.update.mockResolvedValue({ ...ADMIN_USER, role: 'superadmin' });

    const res = await request.put('/api/v1/admin-users/2', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { role: 'superadmin' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('role', 'superadmin');
  });

  test('returns 200 when isActive is set to false (deactivate)', async ({ request }) => {
    ctx.mockPrisma.adminUser.update.mockResolvedValue({ ...ADMIN_USER, isActive: false });

    const res = await request.put('/api/v1/admin-users/2', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { isActive: false },
    });

    expect(res.status()).toBe(200);
  });

  test('returns 400 when superadmin tries to demote themselves', async ({ request }) => {
    // adminUserId=1 in token; id=1 in URL; role='admin' in body → self-demotion
    const res = await request.put('/api/v1/admin-users/1', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { role: 'admin' },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cannot change your own role/i);
  });

  test('returns 400 when superadmin tries to deactivate themselves', async ({ request }) => {
    const res = await request.put('/api/v1/admin-users/1', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { isActive: false },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cannot deactivate your own account/i);
  });

  test('returns 404 when admin user does not exist', async ({ request }) => {
    const notFound = Object.assign(new Error('not found'), { code: 'P2025' });
    ctx.mockPrisma.adminUser.update.mockRejectedValue(notFound);

    const res = await request.put('/api/v1/admin-users/999', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { username: 'ghost' },
    });

    expect(res.status()).toBe(404);
  });

  test('returns 400 when username is too short (< 3 chars)', async ({ request }) => {
    const res = await request.put('/api/v1/admin-users/2', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { username: 'ab' },
    });
    expect(res.status()).toBe(400);
  });
});

// ─── DELETE /api/v1/admin-users/:id ──────────────────────────────────────────

test.describe('DELETE /api/v1/admin-users/:id', () => {
  test('returns 403 when no token provided (unauthenticated)', async ({ request }) => {
    const res = await request.delete('/api/v1/admin-users/2');
    expect(res.status()).toBe(403);
  });

  test('returns 401 when JWT is expired', async ({ request }) => {
    const res = await request.delete('/api/v1/admin-users/2', {
      headers: { Authorization: `Bearer ${makeExpiredToken()}` },
    });
    expect(res.status()).toBe(401);
  });

  test('returns 403 when salesman token provided', async ({ request }) => {
    const res = await request.delete('/api/v1/admin-users/2', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 400 for non-numeric ID', async ({ request }) => {
    const res = await request.delete('/api/v1/admin-users/abc', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when trying to delete own account', async ({ request }) => {
    // Token has adminUserId: 1; deleting id: 1
    const res = await request.delete('/api/v1/admin-users/1', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cannot delete your own account/i);
  });

  test('returns 404 when admin user does not exist', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue(null);

    const res = await request.delete('/api/v1/admin-users/999', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
    });

    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  test('returns 400 when deleting the last superadmin', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ ...SUPER_USER, id: 2 });
    ctx.mockPrisma.adminUser.count.mockResolvedValue(1); // only 1 superadmin

    const res = await request.delete('/api/v1/admin-users/2', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/last super admin/i);
  });

  test('returns 200 when a non-last superadmin is deleted', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ ...SUPER_USER, id: 2 });
    ctx.mockPrisma.adminUser.count.mockResolvedValue(2); // 2 superadmins exist
    ctx.mockPrisma.adminUser.delete.mockResolvedValue({ id: 2 });

    const res = await request.delete('/api/v1/admin-users/2', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.message).toMatch(/deleted/i);
  });

  test('returns 200 when a regular admin is deleted', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue(ADMIN_USER); // role: 'admin'
    ctx.mockPrisma.adminUser.delete.mockResolvedValue(ADMIN_USER);

    const res = await request.delete('/api/v1/admin-users/2', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
    });

    expect(res.status()).toBe(200);
  });
});
