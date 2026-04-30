'use strict';

/**
 * PIN API Tests
 * Covers: POST /api/v1/pin/verify
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');

const { test, makeAuthToken } = setupSuite();

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
});
