'use strict';

/**
 * Client Errors API Tests
 * Covers: POST /api/v1/errors/client
 *
 * Public endpoint (no auth required) — receives frontend crash reports
 * from the ErrorBoundary and forwards them to Slack.
 */

const { expect } = require('@playwright/test');
const { setupSuite, makeExpiredToken } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken } = setupSuite();

// ─── POST /api/v1/errors/client ──────────────────────────────────────────────

test.describe('POST /api/v1/errors/client', () => {
  test('returns 200 without any auth token (public endpoint)', async ({ request }) => {
    const res = await request.post('/api/v1/errors/client', {
      data: {
        message: 'ChunkLoadError: Loading chunk 42 failed',
        stack: 'Error at bundle.js:1:500',
        page: '/dashboard',
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('returns 200 with a valid authenticated session', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ username: 'testadmin' });

    const res = await request.post('/api/v1/errors/client', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { message: 'React render error', stack: 'at Component.jsx:22', page: '/stock' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('returns 200 even when all fields are missing (graceful)', async ({ request }) => {
    const res = await request.post('/api/v1/errors/client', {
      data: {},
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('returns 200 with only a message (partial payload)', async ({ request }) => {
    const res = await request.post('/api/v1/errors/client', {
      data: { message: 'TypeError: Cannot read properties of undefined' },
    });

    expect(res.status()).toBe(200);
  });

  test('returns 200 even when JWT is expired (no auth enforcement)', async ({ request }) => {
    const res = await request.post('/api/v1/errors/client', {
      headers: { Authorization: `Bearer ${makeExpiredToken()}` },
      data: { message: 'Test error', page: '/reports' },
    });

    // Expired token is tolerated — the endpoint is public
    expect(res.status()).toBe(200);
  });
});
