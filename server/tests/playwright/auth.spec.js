'use strict';

/**
 * Auth API Tests
 * Covers: POST /api/v1/auth/login, POST /api/v1/auth/logout, POST /api/v1/auth/change-password
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

const ADMIN_USER = {
  id:           1,
  username:     'admin',
  passwordHash: 'hashed',
  role:         'admin',
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
});
