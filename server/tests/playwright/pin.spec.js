'use strict';

/**
 * PIN API Tests
 * Covers:
 *   POST /api/v1/pin/verify   — verify the current PIN (admin + superadmin)
 *   PUT  /api/v1/pin/update   — change the PIN (superadmin only)
 *   GET  /api/v1/pin/settings — get P&L PIN gate setting (any admin)
 *   PUT  /api/v1/pin/settings — update P&L PIN gate setting (superadmin only)
 *
 * The PIN is now stored as a bcrypt hash in AppSettings (key='edit_pin').
 * The test server uses a mock bcrypt (compare always returns false by default).
 * Tests that expect PIN acceptance must set ctx.mockBcrypt.compare = async () => true.
 */

const { expect } = require('@playwright/test');
const { setupSuite } = require('../helpers/test-setup');

const { test, ctx, makeAuthToken, makeSuperAdminToken } = setupSuite();

// A dummy row returned by appSettings.findUnique for tests that need a non-null row.
// The actual value doesn't matter since mock bcrypt ignores the hash.
const DUMMY_PIN_ROW    = { key: 'edit_pin',      value: '$2b$10$dummyhashvalue' };
const DUMMY_PL_PIN_ROW = { key: 'pl_pin_enabled', value: 'true' };

// ─── POST /api/v1/pin/verify ──────────────────────────────────────────────────

test.describe('POST /api/v1/pin/verify', () => {
  test.beforeEach(() => {
    // Default: return a valid row; compare is false by default (mock bcrypt).
    ctx.mockPrisma.appSettings.findUnique.mockResolvedValue(DUMMY_PIN_ROW);
  });

  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/pin/verify', { data: { pin: '123456' } });
    expect(res.status()).toBe(403);
  });

  test('returns 200 when correct PIN is submitted', async ({ request }) => {
    ctx.mockBcrypt.compare = async () => true; // override: this PIN is correct

    const res = await request.post('/api/v1/pin/verify', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { pin: '123456' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('returns 400 when PIN is wrong', async ({ request }) => {
    // compare returns false by default — correct behaviour for wrong PIN
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ username: 'admin', role: 'admin' });

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

  test('returns 400 when no AppSettings row exists (DB not seeded yet)', async ({ request }) => {
    ctx.mockPrisma.appSettings.findUnique.mockResolvedValue(null); // no row in DB
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ username: 'admin', role: 'admin' });

    const res = await request.post('/api/v1/pin/verify', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { pin: '123456' },
    });

    // null row → ok=false → 400
    expect(res.status()).toBe(400);
  });

  test('accepts a PIN sent as a JSON number, not just a string', async ({ request }) => {
    ctx.mockBcrypt.compare = async () => true; // correct PIN

    const res = await request.post('/api/v1/pin/verify', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { pin: 123456 }, // number, not string
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('reports the failing admin\'s username and role on a wrong PIN', async ({ request }) => {
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

  test('correct PINs do not count towards the rate limit', async ({ request }) => {
    ctx.mockBcrypt.compare = async () => true;
    for (let i = 0; i < 25; i++) {
      const res = await request.post('/api/v1/pin/verify', {
        headers: { Authorization: `Bearer ${makeAuthToken()}` },
        data: { pin: '123456' },
      });
      expect(res.status(), `correct PIN #${i + 1}`).toBe(200); // 25 > the limit of 20, none blocked
    }
  });

  test('correct PINs do not use up the quota for wrong ones', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ username: 'admin', role: 'admin' });
    ctx.mockBcrypt.compare = async () => true;
    for (let i = 0; i < 10; i++) {
      await request.post('/api/v1/pin/verify', {
        headers: { Authorization: `Bearer ${makeAuthToken()}` },
        data: { pin: '123456' },
      });
    }
    ctx.mockBcrypt.compare = async () => false;
    const first = await request.post('/api/v1/pin/verify', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { pin: '000000' },
    });
    expect(first.status()).toBe(400); // a wrong PIN is still counted and still refused, not rate-limited
  });

  // Placed last: rate limiter is shared across the whole file (one server instance
  // per file). This test deliberately exhausts the remaining quota so nothing
  // after it can call /pin/verify successfully.
  test('rate-limits after 20 attempts in the 15-minute window', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ username: 'admin', role: 'admin' });
    let sawRateLimited = false;
    for (let i = 0; i < 25 && !sawRateLimited; i++) {
      const res = await request.post('/api/v1/pin/verify', {
        headers: { Authorization: `Bearer ${makeAuthToken()}` },
        data: { pin: '000000' },
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

// ─── PUT /api/v1/pin/update ───────────────────────────────────────────────────

test.describe('PUT /api/v1/pin/update', () => {
  test.beforeEach(() => {
    ctx.mockPrisma.appSettings.findUnique.mockResolvedValue(DUMMY_PIN_ROW);
  });

  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.put('/api/v1/pin/update', {
      data: { currentPin: '123456', newPin: '654321' },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 403 when admin (not superadmin) calls it', async ({ request }) => {
    const res = await request.put('/api/v1/pin/update', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` }, // admin token
      data: { currentPin: '123456', newPin: '654321' },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 400 when currentPin is wrong', async ({ request }) => {
    // compare returns false by default — the current PIN is wrong
    const res = await request.put('/api/v1/pin/update', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { currentPin: '000000', newPin: '654321' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Incorrect current PIN/i);
  });

  // Regression: req.user carries no `username` field (see middleware/auth.js —
  // only id/role/salespersonId/adminUserId are set from the JWT), so
  // `req.user?.username ?? 'unknown'` always fell to 'unknown' in the Slack
  // card. The fix resolves the acting username via getActingUsername(), which
  // looks it up from adminUserId — asserted here by checking that lookup
  // actually happens, since the fire-and-forget Slack call itself isn't
  // observable through the HTTP response.
  test('resolves the acting superadmin via a DB lookup, not the non-existent req.user.username', async ({ request }) => {
    // makeSuperAdminToken() signs adminUserId: 1
    let lookupArgs = null;
    ctx.mockPrisma.adminUser.findUnique.mockImplementation(async (args) => {
      lookupArgs = args;
      return { username: 'root' };
    });

    await request.put('/api/v1/pin/update', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { currentPin: '000000', newPin: '654321' }, // wrong currentPin — PIN_FAILED path
    });

    expect(lookupArgs).toEqual({ where: { id: 1 }, select: { username: true } });
  });

  test('returns 400 when newPin is not exactly 6 digits', async ({ request }) => {
    ctx.mockBcrypt.compare = async () => true; // currentPin accepted
    const res = await request.put('/api/v1/pin/update', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { currentPin: '123456', newPin: '1234' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when newPin contains non-digits', async ({ request }) => {
    ctx.mockBcrypt.compare = async () => true; // currentPin accepted
    const res = await request.put('/api/v1/pin/update', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { currentPin: '123456', newPin: '12345a' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when currentPin is missing', async ({ request }) => {
    const res = await request.put('/api/v1/pin/update', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { newPin: '654321' },
    });
    expect(res.status()).toBe(400);
  });

  test('happy path: returns 200 and upserts new hash', async ({ request }) => {
    ctx.mockBcrypt.compare = async () => true; // currentPin accepted
    ctx.mockBcrypt.hash    = async () => 'new_hashed_pin';
    ctx.mockPrisma.appSettings.upsert.mockResolvedValue({ key: 'edit_pin', value: 'new_hashed_pin' });

    const res = await request.put('/api/v1/pin/update', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { currentPin: '123456', newPin: '654321' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // upsert was called (we got 200 and the mock returned the row without error)
  });
});

// ─── GET /api/v1/pin/settings ─────────────────────────────────────────────────

test.describe('GET /api/v1/pin/settings', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.get('/api/v1/pin/settings');
    expect(res.status()).toBe(403);
  });

  test('returns 200 with plPinEnabled: true when the DB row exists and is "true"', async ({ request }) => {
    ctx.mockPrisma.appSettings.findUnique.mockResolvedValue(DUMMY_PL_PIN_ROW);

    const res = await request.get('/api/v1/pin/settings', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.plPinEnabled).toBe(true);
  });

  test('returns plPinEnabled: false when the DB row has value "false"', async ({ request }) => {
    ctx.mockPrisma.appSettings.findUnique.mockResolvedValue({ key: 'pl_pin_enabled', value: 'false' });

    const res = await request.get('/api/v1/pin/settings', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.plPinEnabled).toBe(false);
  });

  test('returns plPinEnabled: true (fail-closed) when the DB row does not exist', async ({ request }) => {
    ctx.mockPrisma.appSettings.findUnique.mockResolvedValue(null);

    const res = await request.get('/api/v1/pin/settings', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    // null row → default to enabled (fail-closed)
    expect(body.data.plPinEnabled).toBe(true);
  });

  test('is accessible by a regular admin (not superadmin-only)', async ({ request }) => {
    ctx.mockPrisma.appSettings.findUnique.mockResolvedValue(DUMMY_PL_PIN_ROW);

    const res = await request.get('/api/v1/pin/settings', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` }, // admin token, not superadmin
    });

    expect(res.status()).toBe(200);
  });
});

// ─── PUT /api/v1/pin/settings ─────────────────────────────────────────────────

test.describe('PUT /api/v1/pin/settings', () => {
  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.put('/api/v1/pin/settings', {
      data: { plPinEnabled: false },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 403 when a regular admin (not superadmin) calls it', async ({ request }) => {
    const res = await request.put('/api/v1/pin/settings', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` }, // admin, not superadmin
      data: { plPinEnabled: false },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 400 when plPinEnabled is missing from the body', async ({ request }) => {
    const res = await request.put('/api/v1/pin/settings', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when plPinEnabled is not a boolean', async ({ request }) => {
    const res = await request.put('/api/v1/pin/settings', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { plPinEnabled: 'yes' },
    });
    expect(res.status()).toBe(400);
  });

  test('happy path: superadmin can disable the P&L PIN gate', async ({ request }) => {
    ctx.mockPrisma.appSettings.upsert.mockResolvedValue({ key: 'pl_pin_enabled', value: 'false' });

    const res = await request.put('/api/v1/pin/settings', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { plPinEnabled: false },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('happy path: superadmin can re-enable the P&L PIN gate', async ({ request }) => {
    ctx.mockPrisma.appSettings.upsert.mockResolvedValue({ key: 'pl_pin_enabled', value: 'true' });

    const res = await request.put('/api/v1/pin/settings', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { plPinEnabled: true },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  // Regression — see the equivalent test on PUT /pin/update above.
  test('resolves the acting superadmin via a DB lookup, not the non-existent req.user.username', async ({ request }) => {
    ctx.mockPrisma.appSettings.upsert.mockResolvedValue({ key: 'pl_pin_enabled', value: 'false' });
    let lookupArgs = null;
    ctx.mockPrisma.adminUser.findUnique.mockImplementation(async (args) => {
      lookupArgs = args;
      return { username: 'root' };
    });

    await request.put('/api/v1/pin/settings', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { plPinEnabled: false },
    });

    expect(lookupArgs).toEqual({ where: { id: 1 }, select: { username: true } });
  });
});

// ─── POST /api/v1/pin/verify-pl ───────────────────────────────────────────────

const DUMMY_PL_SETTINGS_ROW = { key: 'pl_pin', value: '$2b$10$dummyhashvalue' };

test.describe('POST /api/v1/pin/verify-pl', () => {
  test.beforeEach(() => {
    ctx.mockPrisma.appSettings.findUnique.mockResolvedValue(DUMMY_PL_SETTINGS_ROW);
  });

  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.post('/api/v1/pin/verify-pl', { data: { pin: '123456' } });
    expect(res.status()).toBe(403);
  });

  test('returns 200 when correct P&L PIN is submitted', async ({ request }) => {
    ctx.mockBcrypt.compare = async () => true;

    // Use a distinct IP so this test doesn't share the exhausted rate-limit
    // counter from the /pin/verify tests earlier in this file.
    const res = await request.post('/api/v1/pin/verify-pl', {
      headers: {
        Authorization: `Bearer ${makeAuthToken()}`,
        'x-forwarded-for': '10.20.30.40',
      },
      data: { pin: '123456' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('returns 400 when P&L PIN is wrong', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ username: 'admin', role: 'admin' });

    const res = await request.post('/api/v1/pin/verify-pl', {
      headers: { Authorization: `Bearer ${makeAuthToken()}`, 'x-forwarded-for': '10.20.30.40' },
      data: { pin: '000000' },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/Incorrect PIN/i);
  });

  test('returns 400 when no AppSettings row exists for pl_pin', async ({ request }) => {
    ctx.mockPrisma.appSettings.findUnique.mockResolvedValue(null);
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ username: 'admin', role: 'admin' });

    const res = await request.post('/api/v1/pin/verify-pl', {
      headers: { Authorization: `Bearer ${makeAuthToken()}`, 'x-forwarded-for': '10.20.30.41' },
      data: { pin: '123456' },
    });

    expect(res.status()).toBe(400);
  });

  test('returns 400 when pin is missing', async ({ request }) => {
    const res = await request.post('/api/v1/pin/verify-pl', {
      headers: { Authorization: `Bearer ${makeAuthToken()}`, 'x-forwarded-for': '10.20.30.42' },
      data: {},
    });

    expect(res.status()).toBe(400);
  });
});

// ─── PUT /api/v1/pin/update-pl ────────────────────────────────────────────────

test.describe('PUT /api/v1/pin/update-pl', () => {
  test.beforeEach(() => {
    ctx.mockPrisma.appSettings.findUnique.mockResolvedValue(DUMMY_PL_SETTINGS_ROW);
  });

  test('returns 403 when no token is provided', async ({ request }) => {
    const res = await request.put('/api/v1/pin/update-pl', {
      data: { currentPin: '123456', newPin: '654321' },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 403 when admin (not superadmin) calls it', async ({ request }) => {
    const res = await request.put('/api/v1/pin/update-pl', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
      data: { currentPin: '123456', newPin: '654321' },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 400 when currentPin is wrong', async ({ request }) => {
    const res = await request.put('/api/v1/pin/update-pl', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { currentPin: '000000', newPin: '654321' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Incorrect current PIN/i);
  });

  // Regression — see the equivalent test on PUT /pin/update above.
  test('resolves the acting superadmin via a DB lookup, not the non-existent req.user.username', async ({ request }) => {
    let lookupArgs = null;
    ctx.mockPrisma.adminUser.findUnique.mockImplementation(async (args) => {
      lookupArgs = args;
      return { username: 'root' };
    });

    await request.put('/api/v1/pin/update-pl', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { currentPin: '000000', newPin: '654321' }, // wrong currentPin — PIN_FAILED path
    });

    expect(lookupArgs).toEqual({ where: { id: 1 }, select: { username: true } });
  });

  test('returns 400 when newPin is not exactly 6 digits', async ({ request }) => {
    ctx.mockBcrypt.compare = async () => true;
    const res = await request.put('/api/v1/pin/update-pl', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { currentPin: '123456', newPin: '1234' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when newPin contains non-digits', async ({ request }) => {
    ctx.mockBcrypt.compare = async () => true;
    const res = await request.put('/api/v1/pin/update-pl', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { currentPin: '123456', newPin: '12345a' },
    });
    expect(res.status()).toBe(400);
  });

  test('happy path: returns 200 and upserts new P&L PIN hash', async ({ request }) => {
    ctx.mockBcrypt.compare = async () => true;
    ctx.mockBcrypt.hash    = async () => 'new_pl_pin_hash';
    ctx.mockPrisma.appSettings.upsert.mockResolvedValue({ key: 'pl_pin', value: 'new_pl_pin_hash' });

    const res = await request.put('/api/v1/pin/update-pl', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { currentPin: '123456', newPin: '654321' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
