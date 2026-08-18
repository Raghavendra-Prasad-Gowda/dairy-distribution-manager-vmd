'use strict';

/**
 * Auth API Tests
 * Covers: POST /api/v1/auth/login, POST /api/v1/auth/logout, POST /api/v1/auth/change-password
 */

const { expect } = require('@playwright/test');
const jwt = require('jsonwebtoken');
const { setupSuite, makeSalesmanToken } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken, makeDispatcherToken, makeSuperAdminToken } = setupSuite();

// Same secret test-setup.js signs tokens with — used here only to craft a
// token carrying a role the app never actually issues (to exercise the
// controller's `else` / unauthorized-role branch).
const TEST_SECRET = 'test-secret-for-ci';
const makeUnknownRoleToken = () => jwt.sign({ id: 99, role: 'bogus' }, TEST_SECRET, { expiresIn: '1h' });

const ADMIN_USER = {
  id:           1,
  username:     'admin',
  passwordHash: 'hashed',
  role:         'admin',
  isActive:     true,
};

const DISPATCHER_USER = {
  id:           2,
  username:     'dispatcher1',
  passwordHash: 'hashed',
  role:         'dispatcher',
  isActive:     true,
};

// ─── POST /api/v1/auth/login ──────────────────────────────────────────────────

test.describe('POST /api/v1/auth/login', () => {
  test('returns 200 with accessToken on valid credentials', async ({ request }) => {
    ctx.mockPrisma.adminUser.findFirst.mockResolvedValue(ADMIN_USER);
    ctx.mockBcrypt.compare = async () => true;

    const res = await request.post('/api/v1/auth/login', {
      data: { username: 'admin', password: 'correctpass' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('accessToken');
    expect(body.data).toHaveProperty('businessName', 'Vikas Milk Dairy');
  });

  test('returns 401 when username does not exist', async ({ request }) => {
    ctx.mockPrisma.adminUser.findFirst.mockResolvedValue(null);
    ctx.mockPrisma.salesperson.findFirst.mockResolvedValue(null);

    const res = await request.post('/api/v1/auth/login', {
      data: { username: 'nobody', password: 'anypass' },
    });

    expect(res.status()).toBe(401);
  });

  test('returns 401 when password is wrong', async ({ request }) => {
    ctx.mockPrisma.adminUser.findFirst.mockResolvedValue(ADMIN_USER);
    ctx.mockBcrypt.compare = async () => false;

    const res = await request.post('/api/v1/auth/login', {
      data: { username: 'admin', password: 'wrongpass' },
    });

    expect(res.status()).toBe(401);
  });

  test('returns 400 when username is missing', async ({ request }) => {
    const res = await request.post('/api/v1/auth/login', {
      data: { password: 'somepass' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when password is missing', async ({ request }) => {
    const res = await request.post('/api/v1/auth/login', {
      data: { username: 'admin' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 401 when admin account is inactive', async ({ request }) => {
    ctx.mockPrisma.adminUser.findFirst.mockResolvedValue({ ...ADMIN_USER, isActive: false });

    const res = await request.post('/api/v1/auth/login', {
      data: { username: 'admin', password: 'anypass' },
    });

    expect(res.status()).toBe(401);
  });

  test('returns 200 with salesman token when salesperson credentials are valid', async ({ request }) => {
    const SALESPERSON = {
      id: 5, username: 'raju', name: 'Raju', passwordHash: 'hashed', isActive: true,
    };
    ctx.mockPrisma.adminUser.findFirst.mockResolvedValue(null);
    ctx.mockPrisma.salesperson.findFirst.mockResolvedValue(SALESPERSON);
    ctx.mockBcrypt.compare = async () => true;

    const res = await request.post('/api/v1/auth/login', {
      data: { username: 'raju', password: 'correctpass' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.role).toBe('salesman');
    expect(body.data.salespersonId).toBe(5);
    expect(body.data).toHaveProperty('accessToken');
  });

  test('returns 401 when salesperson password is wrong', async ({ request }) => {
    const SALESPERSON = { id: 5, username: 'raju', name: 'Raju', passwordHash: 'hashed', isActive: true };
    ctx.mockPrisma.adminUser.findFirst.mockResolvedValue(null);
    ctx.mockPrisma.salesperson.findFirst.mockResolvedValue(SALESPERSON);
    ctx.mockBcrypt.compare = async () => false;

    const res = await request.post('/api/v1/auth/login', {
      data: { username: 'raju', password: 'wrongpass' },
    });

    expect(res.status()).toBe(401);
  });

  // ── Case-insensitive username matching ──────────────────────────────────
  // Login now matches usernames case-insensitively for both AdminUser and
  // Salesperson lookups (mode: 'insensitive'). See auth.controller.js.

  test('matches admin username regardless of case ("ADMIN" vs stored "admin")', async ({ request }) => {
    ctx.mockPrisma.adminUser.findFirst.mockResolvedValue(ADMIN_USER);
    ctx.mockBcrypt.compare = async () => true;

    const res = await request.post('/api/v1/auth/login', {
      data: { username: 'ADMIN', password: 'correctpass' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.role).toBe('admin');
  });

  test('admin lookup uses a case-insensitive Prisma filter (mode: insensitive)', async ({ request }) => {
    let findFirstArgs = null;
    ctx.mockPrisma.adminUser.findFirst.mockImplementation(async (args) => {
      findFirstArgs = args;
      return null;
    });
    ctx.mockPrisma.salesperson.findFirst.mockResolvedValue(null);

    await request.post('/api/v1/auth/login', { data: { username: 'Admin', password: 'x' } });

    expect(findFirstArgs.where.username).toEqual({ equals: 'Admin', mode: 'insensitive' });
  });

  test('matches salesperson username regardless of case ("RAJU" vs stored "raju")', async ({ request }) => {
    const SALESPERSON = { id: 5, username: 'raju', name: 'Raju', passwordHash: 'hashed', isActive: true };
    ctx.mockPrisma.adminUser.findFirst.mockResolvedValue(null);
    ctx.mockPrisma.salesperson.findFirst.mockResolvedValue(SALESPERSON);
    ctx.mockBcrypt.compare = async () => true;

    const res = await request.post('/api/v1/auth/login', {
      data: { username: 'RAJU', password: 'correctpass' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.role).toBe('salesman');
    expect(body.data.salespersonId).toBe(5);
  });

  test('salesperson lookup uses a case-insensitive Prisma filter (mode: insensitive)', async ({ request }) => {
    let findFirstArgs = null;
    ctx.mockPrisma.adminUser.findFirst.mockResolvedValue(null);
    ctx.mockPrisma.salesperson.findFirst.mockImplementation(async (args) => {
      findFirstArgs = args;
      return null;
    });

    await request.post('/api/v1/auth/login', { data: { username: 'Raju', password: 'x' } });

    expect(findFirstArgs.where.username).toEqual({ equals: 'Raju', mode: 'insensitive' });
    expect(findFirstArgs.where.isActive).toBe(true);
  });

  test('returns 200 with role "superadmin" for a superadmin account', async ({ request }) => {
    const SUPERADMIN_USER = { id: 3, username: 'super', passwordHash: 'hashed', role: 'superadmin', isActive: true };
    ctx.mockPrisma.adminUser.findFirst.mockResolvedValue(SUPERADMIN_USER);
    ctx.mockBcrypt.compare = async () => true;

    const res = await request.post('/api/v1/auth/login', {
      data: { username: 'super', password: 'correctpass' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.role).toBe('superadmin');
  });

  test('returns 200 with role "dispatcher" for a dispatcher account (goes through the AdminUser table)', async ({ request }) => {
    ctx.mockPrisma.adminUser.findFirst.mockResolvedValue(DISPATCHER_USER);
    ctx.mockBcrypt.compare = async () => true;

    const res = await request.post('/api/v1/auth/login', {
      data: { username: 'dispatcher1', password: 'correctpass' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.role).toBe('dispatcher');
    expect(body.data.adminUserId).toBe(2);
    expect(body.data).toHaveProperty('accessToken');
  });
});

// ─── POST /api/v1/auth/change-password ───────────────────────────────────────

test.describe('POST /api/v1/auth/change-password', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/auth/change-password', {
      data: { currentPassword: 'old', newPassword: 'newpass123' },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 200 when password is changed successfully', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue(ADMIN_USER);
    ctx.mockBcrypt.compare = async () => true;
    ctx.mockBcrypt.hash = async () => 'new_hashed_password';
    ctx.mockPrisma.adminUser.update.mockResolvedValue({ ...ADMIN_USER, passwordHash: 'new_hashed_password' });

    const res = await request.post('/api/v1/auth/change-password', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { currentPassword: 'correctpass', newPassword: 'newpass123' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toMatch(/changed/i);
  });

  test('returns 401 when current password is wrong', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue(ADMIN_USER);
    ctx.mockBcrypt.compare = async () => false;

    const res = await request.post('/api/v1/auth/change-password', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { currentPassword: 'wrongpass', newPassword: 'newpass123' },
    });

    expect(res.status()).toBe(401);
  });

  test('returns 404 when the admin user record no longer exists', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue(null);

    const res = await request.post('/api/v1/auth/change-password', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { currentPassword: 'correctpass', newPassword: 'newpass123' },
    });

    expect(res.status()).toBe(404);
  });

  test('honors a forwarded IP header on login and change-password (not just req.ip)', async ({ request }) => {
    ctx.mockPrisma.adminUser.findFirst.mockResolvedValue(null);
    ctx.mockPrisma.salesperson.findFirst.mockResolvedValue(null);
    const loginRes = await request.post('/api/v1/auth/login', {
      headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
      data: { username: 'nobody', password: 'x' },
    });
    expect(loginRes.status()).toBe(401);

    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue(ADMIN_USER);
    ctx.mockBcrypt.compare = async () => false;
    const changePwRes = await request.post('/api/v1/auth/change-password', {
      headers: { Authorization: `Bearer ${makeAuthToken()}`, 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
      data: { currentPassword: 'wrong', newPassword: 'newpass123' },
    });
    expect(changePwRes.status()).toBe(401);
  });

  test('salesman password-change Slack card falls back to name when username is null', async ({ request }) => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue({ id: 5, username: null, name: 'Raju', passwordHash: 'hashed' });
    ctx.mockBcrypt.compare = async () => true;
    ctx.mockBcrypt.hash = async () => 'new_hashed_password';
    ctx.mockPrisma.salesperson.update.mockResolvedValue({ id: 5, username: null, name: 'Raju' });

    const res = await request.post('/api/v1/auth/change-password', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(5)}` },
      data: { currentPassword: 'correctpass', newPassword: 'newpass123' },
    });

    expect(res.status()).toBe(200);
  });

  test('returns 400 when newPassword is too short', async ({ request }) => {
    const res = await request.post('/api/v1/auth/change-password', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { currentPassword: 'correctpass', newPassword: '123' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when currentPassword is missing', async ({ request }) => {
    const res = await request.post('/api/v1/auth/change-password', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { newPassword: 'newpass123' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 for a dispatcher changing their own password (same AdminUser branch as admin)', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue(DISPATCHER_USER);
    ctx.mockBcrypt.compare = async () => true;
    ctx.mockBcrypt.hash = async () => 'new_hashed_password';
    ctx.mockPrisma.adminUser.update.mockResolvedValue({ ...DISPATCHER_USER, passwordHash: 'new_hashed_password' });

    const res = await request.post('/api/v1/auth/change-password', {
      headers: { Authorization: `Bearer ${makeDispatcherToken()}` },
      data: { currentPassword: 'correctpass', newPassword: 'newpass123' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('returns 200 for a superadmin changing their own password', async ({ request }) => {
    const SUPERADMIN_USER = { id: 3, username: 'super', passwordHash: 'hashed', role: 'superadmin' };
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue(SUPERADMIN_USER);
    ctx.mockBcrypt.compare = async () => true;
    ctx.mockBcrypt.hash = async () => 'new_hashed_password';
    ctx.mockPrisma.adminUser.update.mockResolvedValue({ ...SUPERADMIN_USER, passwordHash: 'new_hashed_password' });

    const res = await request.post('/api/v1/auth/change-password', {
      headers: { Authorization: `Bearer ${jwt.sign({ id: 3, role: 'superadmin', adminUserId: 3 }, TEST_SECRET, { expiresIn: '1h' })}` },
      data: { currentPassword: 'correctpass', newPassword: 'newpass123' },
    });

    expect(res.status()).toBe(200);
  });

  test('returns 200 for a salesman changing their own password', async ({ request }) => {
    const SALESPERSON = { id: 5, username: 'raju', name: 'Raju', passwordHash: 'hashed' };
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue(SALESPERSON);
    ctx.mockBcrypt.compare = async () => true;
    ctx.mockBcrypt.hash = async () => 'new_hashed_password';
    ctx.mockPrisma.salesperson.update.mockResolvedValue({ ...SALESPERSON, passwordHash: 'new_hashed_password' });

    const res = await request.post('/api/v1/auth/change-password', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(5)}` },
      data: { currentPassword: 'correctpass', newPassword: 'newpass123' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('returns 404 when the salesman record no longer exists', async ({ request }) => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue(null);

    const res = await request.post('/api/v1/auth/change-password', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(5)}` },
      data: { currentPassword: 'correctpass', newPassword: 'newpass123' },
    });

    expect(res.status()).toBe(404);
  });

  test('returns 401 when a salesman\'s current password is wrong', async ({ request }) => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue({ id: 5, username: 'raju', passwordHash: 'hashed' });
    ctx.mockBcrypt.compare = async () => false;

    const res = await request.post('/api/v1/auth/change-password', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(5)}` },
      data: { currentPassword: 'wrongpass', newPassword: 'newpass123' },
    });

    expect(res.status()).toBe(401);
  });

  test('returns 403 for a token carrying a role the app never issues', async ({ request }) => {
    const res = await request.post('/api/v1/auth/change-password', {
      headers: { Authorization: `Bearer ${makeUnknownRoleToken()}` },
      data: { currentPassword: 'correctpass', newPassword: 'newpass123' },
    });

    expect(res.status()).toBe(403);
  });
});

// ─── POST /api/v1/auth/logout ─────────────────────────────────────────────────

test.describe('POST /api/v1/auth/logout', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/auth/logout');
    expect(res.status()).toBe(403);
  });

  test('returns 200 and clears the cookie with a valid token', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue(ADMIN_USER);
    const res = await request.post('/api/v1/auth/logout', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('reports "Super Admin" on the Slack logout card for a superadmin', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ username: 'root', role: 'superadmin' });
    const res = await request.post('/api/v1/auth/logout', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}`, 'x-forwarded-for': '203.0.113.1' },
    });
    expect(res.status()).toBe(200);
  });

  test('reports "Dispatcher" on the Slack logout card for a dispatcher', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ username: 'dispatcher1', role: 'dispatcher' });
    const res = await request.post('/api/v1/auth/logout', {
      headers: { Authorization: `Bearer ${makeDispatcherToken()}` },
    });
    expect(res.status()).toBe(200);
  });

  test('returns 200 for a salesman logging out (looked up by salespersonId, username present)', async ({ request }) => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue({ username: 'raju', name: 'Raju' });
    const res = await request.post('/api/v1/auth/logout', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(5)}` },
    });
    expect(res.status()).toBe(200);
  });

  test('falls back to the salesperson\'s name when username is null', async ({ request }) => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue({ username: null, name: 'Raju' });
    const res = await request.post('/api/v1/auth/logout', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(5)}` },
    });
    expect(res.status()).toBe(200);
  });

  test('falls back to "unknown" when the admin user record is gone', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue(null);
    const res = await request.post('/api/v1/auth/logout', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(200);
  });

  test('falls back to "unknown" when the salesperson record is gone', async ({ request }) => {
    ctx.mockPrisma.salesperson.findUnique.mockResolvedValue(null);
    const res = await request.post('/api/v1/auth/logout', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(5)}` },
    });
    expect(res.status()).toBe(200);
  });

  test('reports role "unknown" when the token carries neither adminUserId nor a salesman role', async ({ request }) => {
    const res = await request.post('/api/v1/auth/logout', {
      headers: { Authorization: `Bearer ${makeUnknownRoleToken()}` },
    });
    expect(res.status()).toBe(200);
  });
});
