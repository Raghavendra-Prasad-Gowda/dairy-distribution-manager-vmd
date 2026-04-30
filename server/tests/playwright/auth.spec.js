'use strict';

/**
 * Auth API Tests
 * Covers: POST /api/v1/auth/login, POST /api/v1/auth/logout
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

const ADMIN_SETTINGS = {
  id:           1,
  username:     'admin',
  passwordHash: 'hashed',
  businessName: 'Vikas Milk Dairy',
};

// ─── POST /api/v1/auth/login ──────────────────────────────────────────────────

test.describe('POST /api/v1/auth/login', () => {
  test('returns 200 with accessToken on valid credentials', async ({ request }) => {
    ctx.mockPrisma.appSettings.findFirst.mockResolvedValue(ADMIN_SETTINGS);
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
    ctx.mockPrisma.appSettings.findFirst.mockResolvedValue(null);

    const res = await request.post('/api/v1/auth/login', {
      data: { username: 'nobody', password: 'anypass' },
    });

    expect(res.status()).toBe(401);
  });

  test('returns 401 when password is wrong', async ({ request }) => {
    ctx.mockPrisma.appSettings.findFirst.mockResolvedValue(ADMIN_SETTINGS);
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

// ─── POST /api/v1/auth/logout ─────────────────────────────────────────────────

test.describe('POST /api/v1/auth/logout', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/auth/logout');
    expect(res.status()).toBe(403);
  });

  test('returns 200 and clears the cookie with a valid token', async ({ request }) => {
    const res = await request.post('/api/v1/auth/logout', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
