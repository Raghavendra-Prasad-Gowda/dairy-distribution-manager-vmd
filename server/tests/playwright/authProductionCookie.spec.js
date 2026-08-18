'use strict';

/**
 * auth.controller.js — production-mode cookie flags.
 *
 * `setCookie()` sets `secure`/`sameSite` based on `!env.isDev`, which is only
 * ever false in this suite (NODE_ENV=test everywhere else) — so the
 * "deployed" branch (`sameSite: 'none'`) never runs. This file boots its own
 * fresh app with NODE_ENV=production (env.js and app.js are re-required from
 * scratch per test.beforeAll via createTestServer's cache-clearing) so that
 * branch gets exercised too, then restores process.env for any other file
 * sharing this worker.
 */

const { test, expect } = require('@playwright/test');

const savedEnv = { ...process.env };
process.env.NODE_ENV      = 'production';
process.env.JWT_SECRET    = 'a'.repeat(32);
process.env.DATABASE_URL  = 'postgres://unused-mocked-out';
process.env.ADMIN_PASSWORD = 'unused-mocked-out';
process.env.EDIT_PIN      = '654321';

const { setupSuite } = require('../helpers/test-setup');
const { ctx, test: base } = setupSuite();

test.afterAll(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, savedEnv);
});

const ADMIN_USER = { id: 1, username: 'admin', passwordHash: 'hashed', role: 'admin', isActive: true };

base.describe('POST /api/v1/auth/login — production mode cookie flags', () => {
  base('sets SameSite=None and Secure on the auth cookie when deployed (NODE_ENV=production)', async ({ request }) => {
    ctx.mockPrisma.adminUser.findFirst.mockResolvedValue(ADMIN_USER);
    ctx.mockBcrypt.compare = async () => true;

    const res = await request.post('/api/v1/auth/login', {
      data: { username: 'admin', password: 'correctpass' },
    });

    expect(res.status()).toBe(200);
    const setCookie = res.headers()['set-cookie'] ?? '';
    expect(setCookie).toMatch(/SameSite=None/i);
    expect(setCookie).toMatch(/Secure/i);
  });
});
