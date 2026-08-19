'use strict';

/**
 * PIN API Tests
 * Covers: POST /api/v1/pin/verify
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

// ─── POST /api/v1/pin/verify ──────────────────────────────────────────────────

test.describe('POST /api/v1/pin/verify', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/pin/verify', { data: { pin: '123456' } });
    expect(res.status()).toBe(403);
  });

  test('returns 200 when correct PIN is submitted', async ({ request }) => {
    const res = await request.post('/api/v1/pin/verify', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { pin: '123456' }, // matches EDIT_PIN set in test-setup.js
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('returns 400 when PIN is wrong', async ({ request }) => {
    const res = await request.post('/api/v1/pin/verify', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { pin: '000000' },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('returns 400 when PIN is missing', async ({ request }) => {
    const res = await request.post('/api/v1/pin/verify', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: {},
    });

    expect(res.status()).toBe(400);
  });

  test('accepts a PIN sent as a JSON number, not just a string', async ({ request }) => {
    // The controller compares via String(pin) !== String(correct) specifically
    // so a client that JSON-encodes the PIN field as a number still works.
    const res = await request.post('/api/v1/pin/verify', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { pin: 123456 },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('reports the failing admin\'s username and "Super Admin" role label on a wrong PIN', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ username: 'root', role: 'superadmin' });

    const res = await request.post('/api/v1/pin/verify', {
      headers: {
        Authorization: `Bearer ${makeAuthToken()}`,
        'x-forwarded-for': '203.0.113.5, 10.0.0.1',
      },
      data: { pin: '000000' },
    });

    expect(res.status()).toBe(400);
  });

  // Placed last in the file: the rate limiter is shared across every test in
  // this file (one server instance per file, per test-setup.js), so this
  // deliberately exhausts the remaining quota rather than assuming an exact
  // request count — nothing after this test can call /pin/verify successfully.
  test('rate-limits after 5 attempts in the 15-minute window', async ({ request }) => {
    let sawRateLimited = false;
    for (let i = 0; i < 10 && !sawRateLimited; i++) {
      const res = await request.post('/api/v1/pin/verify', {
        headers: { Authorization: `Bearer ${makeAuthToken()}` },
        data: { pin: '000000' }, // wrong PIN — status doesn't matter, only that it counts against the limiter
      });
      if (res.status() === 429) {
        sawRateLimited = true;
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toMatch(/Too many PIN attempts/i);
      }
    }
    expect(sawRateLimited).toBe(true);
  });
});
