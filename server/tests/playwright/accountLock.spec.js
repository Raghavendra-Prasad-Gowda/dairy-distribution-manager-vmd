'use strict';

/**
 * Account Lockout API Tests
 * Covers:
 *   login() branches — 5 wrong passwords locks an AdminUser account
 *   POST /api/v1/auth/mfa/verify           — 5 wrong MFA/backup codes locks it too
 *   POST /api/v1/auth/mfa/confirm-required — same, during forced enrollment
 *   PUT  /api/v1/admin-users/:id/unlock    — superadmin unlocking another account
 *
 * See services/accountLockService.js — two independent counters
 * (failedPasswordAttempts, failedMfaAttempts), either reaching
 * ACCOUNT_LOCK_THRESHOLD (5) locks the account for ACCOUNT_LOCK_COOLDOWN_MS
 * (30 min), after which it's usable again even with no admin action.
 */

const { expect } = require('@playwright/test');
const jwt = require('jsonwebtoken');
const otplib = require('otplib');
const { setupSuite } = require('../helpers/test-setup');
const { ACCOUNT_LOCK_COOLDOWN_MS } = require('../../utils/constants');
const mfaCrypto = require('../../utils/mfaCrypto');

const { test, ctx, makeAuthToken, makeSuperAdminToken } = setupSuite();

const TEST_SECRET = 'test-secret-for-ci'; // matches test-setup.js's JWT_SECRET
const makeMfaToken = (adminUserId) =>
  jwt.sign({ adminUserId, mfaPending: true }, TEST_SECRET, { expiresIn: '5m' });

const baseAdmin = (overrides = {}) => ({
  id: 5,
  username: 'manager',
  passwordHash: 'hashed',
  role: 'admin',
  isActive: true,
  mfaEnabled: false,
  mfaRequired: false,
  failedPasswordAttempts: 0,
  failedMfaAttempts: 0,
  lockedAt: null,
  lockedReason: null,
  ...overrides,
});

// ─── login() — password lockout ────────────────────────────────────────────

test.describe('POST /api/v1/auth/login — password lockout', () => {
  test('a wrong password before the threshold returns the generic message, not a lock', async ({ request }) => {
    ctx.mockPrisma.adminUser.findFirst.mockResolvedValue(baseAdmin({ failedPasswordAttempts: 2 }));
    ctx.mockBcrypt.compare = async () => false;
    let updateArgs = null;
    ctx.mockPrisma.adminUser.update.mockImplementation(async (args) => { updateArgs = args; return {}; });

    const res = await request.post('/api/v1/auth/login', {
      data: { username: 'manager', password: 'wrong' },
    });

    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Invalid username or password');
    expect(updateArgs.data.failedPasswordAttempts).toBe(3);
    expect(updateArgs.data.lockedAt).toBeUndefined();
  });

  test('the 5th wrong password locks the account and returns 423', async ({ request }) => {
    ctx.mockPrisma.adminUser.findFirst.mockResolvedValue(baseAdmin({ failedPasswordAttempts: 4 }));
    ctx.mockBcrypt.compare = async () => false;
    let updateArgs = null;
    ctx.mockPrisma.adminUser.update.mockImplementation(async (args) => { updateArgs = args; return {}; });

    const res = await request.post('/api/v1/auth/login', {
      data: { username: 'manager', password: 'wrong' },
    });

    expect(res.status()).toBe(423);
    const body = await res.json();
    expect(body.error).toMatch(/locked/i);
    expect(updateArgs.data.failedPasswordAttempts).toBe(5);
    expect(updateArgs.data.lockedAt).toBeInstanceOf(Date);
    expect(updateArgs.data.lockedReason).toBe('password');
  });

  test('an already-locked account rejects login with 423 even with the correct password', async ({ request }) => {
    ctx.mockPrisma.adminUser.findFirst.mockResolvedValue(
      baseAdmin({ lockedAt: new Date(), lockedReason: 'password' })
    );
    ctx.mockBcrypt.compare = async () => true;

    const res = await request.post('/api/v1/auth/login', {
      data: { username: 'manager', password: 'correctpass' },
    });

    expect(res.status()).toBe(423);
    const body = await res.json();
    expect(body.error).toMatch(/locked/i);
  });

  test('a lock older than the cooldown auto-clears and a correct password logs in normally', async ({ request }) => {
    const expiredLockedAt = new Date(Date.now() - ACCOUNT_LOCK_COOLDOWN_MS - 1000);
    ctx.mockPrisma.adminUser.findFirst.mockResolvedValue(
      baseAdmin({ lockedAt: expiredLockedAt, lockedReason: 'password', failedPasswordAttempts: 5 })
    );
    ctx.mockBcrypt.compare = async () => true;
    const updateCalls = [];
    ctx.mockPrisma.adminUser.update.mockImplementation(async (args) => { updateCalls.push(args); return {}; });

    const res = await request.post('/api/v1/auth/login', {
      data: { username: 'manager', password: 'correctpass' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('accessToken');
    // First update clears the expired lock (assertNotLocked's lazy heal),
    // second clears it again on full login success — both zero it out.
    expect(updateCalls.some(c => c.data.lockedAt === null)).toBe(true);
  });

  test('a correct password resets only the password-attempt counter, keeping any MFA counter', async ({ request }) => {
    ctx.mockPrisma.adminUser.findFirst.mockResolvedValue(
      baseAdmin({ mfaEnabled: true, failedPasswordAttempts: 3, failedMfaAttempts: 2 })
    );
    ctx.mockBcrypt.compare = async () => true;
    let updateArgs = null;
    ctx.mockPrisma.adminUser.update.mockImplementation(async (args) => { updateArgs = args; return {}; });

    const res = await request.post('/api/v1/auth/login', {
      data: { username: 'manager', password: 'correctpass' },
    });

    // Paused for MFA verify — session isn't issued yet.
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.mfaVerifyRequired).toBe(true);
    expect(updateArgs.data).toEqual({ failedPasswordAttempts: 0 });
  });
});

// ─── POST /api/v1/auth/mfa/verify — MFA lockout ────────────────────────────

test.describe('POST /api/v1/auth/mfa/verify — MFA lockout', () => {
  test('a wrong code before the threshold shows a remaining-attempts count, not a lock', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue(
      baseAdmin({ mfaEnabled: true, mfaSecret: null, failedMfaAttempts: 1 })
    );
    let updateArgs = null;
    ctx.mockPrisma.adminUser.update.mockImplementation(async (args) => { updateArgs = args; return {}; });

    const res = await request.post('/api/v1/auth/mfa/verify', {
      data: { mfaToken: makeMfaToken(5), code: '000000' },
    });

    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/3 attempt\(s\) remaining/);
    expect(updateArgs.data.failedMfaAttempts).toBe(2);
  });

  test('the 5th wrong code locks the account and returns 423', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue(
      baseAdmin({ mfaEnabled: true, mfaSecret: null, failedMfaAttempts: 4 })
    );
    let updateArgs = null;
    ctx.mockPrisma.adminUser.update.mockImplementation(async (args) => { updateArgs = args; return {}; });

    const res = await request.post('/api/v1/auth/mfa/verify', {
      data: { mfaToken: makeMfaToken(5), code: '000000' },
    });

    expect(res.status()).toBe(423);
    const body = await res.json();
    expect(body.error).toMatch(/locked/i);
    expect(updateArgs.data.lockedReason).toBe('mfa');
  });

  test('an already-locked account rejects mfa/verify with 423 even with a correct code', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue(
      baseAdmin({ mfaEnabled: true, lockedAt: new Date(), lockedReason: 'mfa' })
    );

    const res = await request.post('/api/v1/auth/mfa/verify', {
      data: { mfaToken: makeMfaToken(5), code: '123456' },
    });

    expect(res.status()).toBe(423);
  });
});

// ─── POST /api/v1/auth/mfa/confirm-required — MFA lockout (forced enrollment) ──

test.describe('POST /api/v1/auth/mfa/confirm-required — MFA lockout', () => {
  test('the 5th wrong code during forced enrollment locks the account and returns 423', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue(
      baseAdmin({
        mfaRequired: true,
        mfaEnabled: false,
        mfaSecret: mfaCrypto.encrypt(otplib.generateSecret()), // real ciphertext — '000000' still won't match it
        failedMfaAttempts: 4,
      })
    );
    let updateArgs = null;
    ctx.mockPrisma.adminUser.update.mockImplementation(async (args) => { updateArgs = args; return {}; });

    const res = await request.post('/api/v1/auth/mfa/confirm-required', {
      data: { mfaToken: makeMfaToken(5), code: '000000' },
    });

    expect(res.status()).toBe(423);
    const body = await res.json();
    expect(body.error).toMatch(/locked/i);
    expect(updateArgs.data.lockedReason).toBe('mfa');
  });
});

// ─── PUT /api/v1/admin-users/:id/unlock ────────────────────────────────────

test.describe('PUT /api/v1/admin-users/:id/unlock', () => {
  test('returns 403 when no token provided', async ({ request }) => {
    const res = await request.put('/api/v1/admin-users/2/unlock');
    expect(res.status()).toBe(403);
  });

  test('returns 403 for a non-superadmin token', async ({ request }) => {
    const res = await request.put('/api/v1/admin-users/2/unlock', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 400 when the ID is not a positive integer', async ({ request }) => {
    const res = await request.put('/api/v1/admin-users/abc/unlock', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 404 when the target account does not exist', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue(null);
    const res = await request.put('/api/v1/admin-users/2/unlock', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
    });
    expect(res.status()).toBe(404);
  });

  test('returns 400 when the target account is not locked', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue(baseAdmin({ id: 2, lockedAt: null }));
    const res = await request.put('/api/v1/admin-users/2/unlock', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200, clears lock state, and returns the updated (unlocked) user', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue(
      baseAdmin({ id: 2, lockedAt: new Date(), lockedReason: 'password', failedPasswordAttempts: 5 })
    );
    let updateArgs = null;
    ctx.mockPrisma.adminUser.update.mockImplementation(async (args) => {
      updateArgs = args;
      return { id: 2, username: 'manager', role: 'admin', isActive: true, mfaEnabled: false, mfaRequired: false, lockedAt: null, lockedReason: null };
    });

    const res = await request.put('/api/v1/admin-users/2/unlock', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.lockedAt).toBeNull();
    expect(updateArgs.data).toEqual({
      failedPasswordAttempts: 0,
      failedMfaAttempts: 0,
      lockedAt: null,
      lockedReason: null,
    });
  });

  test('can target another superadmin account (no self-guard needed — a caller is never their own locked account)', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue(
      baseAdmin({ id: 3, role: 'superadmin', lockedAt: new Date(), lockedReason: 'mfa' })
    );
    ctx.mockPrisma.adminUser.update.mockResolvedValue({
      id: 3, username: 'other-super', role: 'superadmin', lockedAt: null, lockedReason: null,
    });

    const res = await request.put('/api/v1/admin-users/3/unlock', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
    });

    expect(res.status()).toBe(200);
  });
});
