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

  test('returns 400 when message exceeds the max length', async ({ request }) => {
    const res = await request.post('/api/v1/errors/client', {
      data: { message: 'x'.repeat(2001) },
    });

    expect(res.status()).toBe(400);
  });

  test('returns 400 when stack exceeds the max length', async ({ request }) => {
    const res = await request.post('/api/v1/errors/client', {
      data: { message: 'ok', stack: 'x'.repeat(5001) },
    });

    expect(res.status()).toBe(400);
  });

  test('returns 400 when page exceeds the max length', async ({ request }) => {
    const res = await request.post('/api/v1/errors/client', {
      data: { message: 'ok', page: '/x'.repeat(200) },
    });

    expect(res.status()).toBe(400);
  });

  test('is rate-limited past the per-IP budget', async ({ request }) => {
    // The route's dedicated limiter allows 30/hour/IP. Playwright's request
    // fixture reuses one context (one apparent IP) for the whole test, so
    // burning through the budget here proves the limiter is actually wired
    // to this route rather than relying only on the generic global limiter.
    for (let i = 0; i < 30; i++) {
      const res = await request.post('/api/v1/errors/client', {
        data: { message: `burst ${i}` },
      });
      expect(res.status()).toBe(200);
    }

    // Budget is now exhausted. The limiter is configured to still return
    // success:true/200 (best-effort beacon — never surface an error to the
    // reporting client), so assert via the limiter's own headers instead.
    const limited = await request.post('/api/v1/errors/client', { data: { message: 'one more' } });
    expect(limited.status()).toBe(200);
    const body = await limited.json();
    expect(body.success).toBe(true);
    expect(limited.headers()['ratelimit-remaining']).toBe('0');
  });
});
