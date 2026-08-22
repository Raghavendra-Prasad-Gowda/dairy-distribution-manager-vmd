'use strict';

/**
 * MFA (superadmin-only two-factor login) API Tests
 * Covers:
 *   POST /api/v1/auth/mfa/verify                — completes a paused login
 *   GET  /api/v1/admin-users/mfa/status          — self-service enrollment status
 *   POST /api/v1/admin-users/mfa/setup           — start enrollment
 *   POST /api/v1/admin-users/mfa/confirm         — confirm enrollment, get backup codes
 *   POST /api/v1/admin-users/mfa/disable         — turn MFA off
 * Plus the login() branch that pauses a superadmin login when MFA is enabled.
 */

const { expect } = require('@playwright/test');
const jwt = require('jsonwebtoken');
const otplib = require('otplib');
const { setupSuite, makeSalesmanToken, makeExpiredToken } = require('../helpers/test-setup');
const mfaCrypto = require('../../utils/mfaCrypto');

const { test, ctx, makeAuthToken, makeSuperAdminToken, makeDispatcherToken } = setupSuite();

const TEST_SECRET = 'test-secret-for-ci'; // matches test-setup.js's JWT_SECRET
const makeMfaToken = (adminUserId, overrides = {}) =>
  jwt.sign({ adminUserId, mfaPending: true, ...overrides }, TEST_SECRET, { expiresIn: '5m' });

const SUPER_MFA_USER = {
  id: 9,
  username: 'super',
  passwordHash: 'hashed',
  role: 'superadmin',
  isActive: true,
  mfaEnabled: true,
};

// ─── login() — pauses for MFA when enabled ────────────────────────────────────

test.describe('POST /api/v1/auth/login — MFA branch', () => {
  test('returns mfaRequired + mfaToken (no accessToken) for a superadmin with MFA enabled', async ({
    request,
  }) => {
    ctx.mockPrisma.adminUser.findFirst.mockResolvedValue(SUPER_MFA_USER);
    ctx.mockBcrypt.compare = async () => true;

    const res = await request.post('/api/v1/auth/login', {
      data: { username: 'super', password: 'correctpass' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.mfaRequired).toBe(true);
    expect(body.data).toHaveProperty('mfaToken');
    expect(body.data).not.toHaveProperty('accessToken');
  });

  test('logs in normally (no MFA step) for a superadmin with MFA disabled', async ({ request }) => {
    ctx.mockPrisma.adminUser.findFirst.mockResolvedValue({ ...SUPER_MFA_USER, mfaEnabled: false });
    ctx.mockBcrypt.compare = async () => true;

    const res = await request.post('/api/v1/auth/login', {
      data: { username: 'super', password: 'correctpass' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('accessToken');
    expect(body.data.mfaRequired).toBeUndefined();
  });

  test('a plain admin (not superadmin) never pauses for MFA even if mfaEnabled were set', async ({
    request,
  }) => {
    ctx.mockPrisma.adminUser.findFirst.mockResolvedValue({
      id: 2,
      username: 'manager',
      passwordHash: 'hashed',
      role: 'admin',
      isActive: true,
      mfaEnabled: true,
    });
    ctx.mockBcrypt.compare = async () => true;

    const res = await request.post('/api/v1/auth/login', {
      data: { username: 'manager', password: 'correctpass' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('accessToken');
  });
});

// ─── POST /api/v1/auth/mfa/verify ─────────────────────────────────────────────

test.describe('POST /api/v1/auth/mfa/verify', () => {
  test('returns 400 when mfaToken is missing', async ({ request }) => {
    const res = await request.post('/api/v1/auth/mfa/verify', { data: { code: '123456' } });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when code is missing', async ({ request }) => {
    const res = await request.post('/api/v1/auth/mfa/verify', { data: { mfaToken: 'x' } });
    expect(res.status()).toBe(400);
  });

  test('returns 401 when mfaToken is garbage/invalid', async ({ request }) => {
    const res = await request.post('/api/v1/auth/mfa/verify', {
      data: { mfaToken: 'not-a-real-token', code: '123456' },
    });
    expect(res.status()).toBe(401);
  });

  test('returns 401 when the token is not an MFA-pending token (e.g. a normal session token)', async ({
    request,
  }) => {
    const res = await request.post('/api/v1/auth/mfa/verify', {
      data: { mfaToken: makeSuperAdminToken(), code: '123456' },
    });
    expect(res.status()).toBe(401);
  });

  test('returns 401 when the admin user no longer exists', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue(null);
    const res = await request.post('/api/v1/auth/mfa/verify', {
      data: { mfaToken: makeMfaToken(99), code: '123456' },
    });
    expect(res.status()).toBe(401);
  });

  test('returns 401 when MFA was disabled after the login step (race)', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({
      id: 9,
      role: 'superadmin',
      isActive: true,
      mfaEnabled: false,
    });
    const res = await request.post('/api/v1/auth/mfa/verify', {
      data: { mfaToken: makeMfaToken(9), code: '123456' },
    });
    expect(res.status()).toBe(401);
  });

  test('returns 401 for an incorrect code', async ({ request }) => {
    const secret = otplib.generateSecret();
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({
      id: 9,
      username: 'super',
      role: 'superadmin',
      isActive: true,
      mfaEnabled: true,
      mfaSecret: mfaCrypto.encrypt(secret),
      mfaBackupCodes: [],
    });
    const res = await request.post('/api/v1/auth/mfa/verify', {
      data: { mfaToken: makeMfaToken(9), code: '000000' },
    });
    expect(res.status()).toBe(401);
  });

  test('returns 200 with a full session for a correct TOTP code', async ({ request }) => {
    const secret = otplib.generateSecret();
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({
      id: 9,
      username: 'super',
      role: 'superadmin',
      isActive: true,
      mfaEnabled: true,
      mfaSecret: mfaCrypto.encrypt(secret),
      mfaBackupCodes: [],
    });
    const code = await otplib.generate({ secret });

    const res = await request.post('/api/v1/auth/mfa/verify', {
      data: { mfaToken: makeMfaToken(9), code },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.role).toBe('superadmin');
    expect(body.data).toHaveProperty('accessToken');
  });

  test('returns 200 and consumes a backup code when the authenticator is unavailable', async ({
    request,
  }) => {
    const plainCodes = ['AAAAA-11111', 'BBBBB-22222'];
    const hashedCodes = plainCodes.map((c) => `hashed:${c}`);
    ctx.mockBcrypt.compare = async (raw, hash) => hash === `hashed:${raw}`;
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({
      id: 9,
      username: 'super',
      role: 'superadmin',
      isActive: true,
      mfaEnabled: true,
      mfaSecret: null,
      mfaBackupCodes: hashedCodes,
    });
    let updateArgs = null;
    ctx.mockPrisma.adminUser.update.mockImplementation(async (args) => {
      updateArgs = args;
      return {};
    });

    const res = await request.post('/api/v1/auth/mfa/verify', {
      data: { mfaToken: makeMfaToken(9), code: plainCodes[0] },
    });

    expect(res.status()).toBe(200);
    expect(updateArgs.where).toEqual({ id: 9 });
    expect(updateArgs.data.mfaBackupCodes).toEqual([hashedCodes[1]]);
  });
});

// ─── GET /api/v1/admin-users/mfa/status ───────────────────────────────────────

test.describe('GET /api/v1/admin-users/mfa/status', () => {
  test('returns 403 when no token provided', async ({ request }) => {
    const res = await request.get('/api/v1/admin-users/mfa/status');
    expect(res.status()).toBe(403);
  });

  test('returns 401 when JWT is expired', async ({ request }) => {
    const res = await request.get('/api/v1/admin-users/mfa/status', {
      headers: { Authorization: `Bearer ${makeExpiredToken()}` },
    });
    expect(res.status()).toBe(401);
  });

  test('returns 403 for a non-superadmin (admin) token', async ({ request }) => {
    const res = await request.get('/api/v1/admin-users/mfa/status', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 403 for a dispatcher token', async ({ request }) => {
    const res = await request.get('/api/v1/admin-users/mfa/status', {
      headers: { Authorization: `Bearer ${makeDispatcherToken()}` },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 403 for a salesman token', async ({ request }) => {
    const res = await request.get('/api/v1/admin-users/mfa/status', {
      headers: { Authorization: `Bearer ${makeSalesmanToken(1)}` },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 200 with mfaEnabled for the calling superadmin', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({ mfaEnabled: true });
    const res = await request.get('/api/v1/admin-users/mfa/status', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ mfaEnabled: true });
  });
});

// ─── POST /api/v1/admin-users/mfa/setup ───────────────────────────────────────

test.describe('POST /api/v1/admin-users/mfa/setup', () => {
  test('returns 403 for a non-superadmin token', async ({ request }) => {
    const res = await request.post('/api/v1/admin-users/mfa/setup', {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });
    expect(res.status()).toBe(403);
  });

  test('returns 400 when MFA is already enabled', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({
      id: 1,
      username: 'super',
      role: 'superadmin',
      mfaEnabled: true,
    });
    const res = await request.post('/api/v1/admin-users/mfa/setup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when the account is not actually a superadmin row', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({
      id: 1,
      username: 'super',
      role: 'admin',
      mfaEnabled: false,
    });
    const res = await request.post('/api/v1/admin-users/mfa/setup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200 with an otpauth URI and QR code, and stores the encrypted secret', async ({
    request,
  }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({
      id: 1,
      username: 'super',
      role: 'superadmin',
      mfaEnabled: false,
    });
    let updateArgs = null;
    ctx.mockPrisma.adminUser.update.mockImplementation(async (args) => {
      updateArgs = args;
      return {};
    });

    const res = await request.post('/api/v1/admin-users/mfa/setup', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.otpauth).toMatch(/^otpauth:\/\/totp\//);
    expect(body.data.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(updateArgs.data.mfaSecret).toEqual(expect.any(String));
  });
});

// ─── POST /api/v1/admin-users/mfa/confirm ─────────────────────────────────────

test.describe('POST /api/v1/admin-users/mfa/confirm', () => {
  test('returns 400 when the code is not 6 digits', async ({ request }) => {
    const res = await request.post('/api/v1/admin-users/mfa/confirm', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { code: 'abc' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when setup was never started', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({
      id: 1,
      username: 'super',
      mfaSecret: null,
      mfaEnabled: false,
    });
    const res = await request.post('/api/v1/admin-users/mfa/confirm', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { code: '123456' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 for an incorrect code', async ({ request }) => {
    const secret = otplib.generateSecret();
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({
      id: 1,
      username: 'super',
      mfaSecret: mfaCrypto.encrypt(secret),
      mfaEnabled: false,
    });
    const res = await request.post('/api/v1/admin-users/mfa/confirm', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { code: '000000' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 200, enables MFA, and returns 8 plaintext backup codes on a valid code', async ({
    request,
  }) => {
    const secret = otplib.generateSecret();
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({
      id: 1,
      username: 'super',
      mfaSecret: mfaCrypto.encrypt(secret),
      mfaEnabled: false,
    });
    ctx.mockBcrypt.hash = async (v) => `hashed:${v}`;
    let updateArgs = null;
    ctx.mockPrisma.adminUser.update.mockImplementation(async (args) => {
      updateArgs = args;
      return {};
    });
    const code = await otplib.generate({ secret });

    const res = await request.post('/api/v1/admin-users/mfa/confirm', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { code },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.backupCodes).toHaveLength(8);
    expect(updateArgs.data.mfaEnabled).toBe(true);
    expect(updateArgs.data.mfaBackupCodes).toHaveLength(8);
  });
});

// ─── POST /api/v1/admin-users/mfa/disable ─────────────────────────────────────

test.describe('POST /api/v1/admin-users/mfa/disable', () => {
  test('returns 400 when password is missing', async ({ request }) => {
    const res = await request.post('/api/v1/admin-users/mfa/disable', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('returns 401 when the password is wrong', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({
      id: 1,
      username: 'super',
      passwordHash: 'hashed',
    });
    ctx.mockBcrypt.compare = async () => false;
    const res = await request.post('/api/v1/admin-users/mfa/disable', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { password: 'wrongpass' },
    });
    expect(res.status()).toBe(401);
  });

  test('returns 200 and clears MFA fields on a correct password', async ({ request }) => {
    ctx.mockPrisma.adminUser.findUnique.mockResolvedValue({
      id: 1,
      username: 'super',
      passwordHash: 'hashed',
    });
    ctx.mockBcrypt.compare = async () => true;
    let updateArgs = null;
    ctx.mockPrisma.adminUser.update.mockImplementation(async (args) => {
      updateArgs = args;
      return {};
    });

    const res = await request.post('/api/v1/admin-users/mfa/disable', {
      headers: { Authorization: `Bearer ${makeSuperAdminToken()}` },
      data: { password: 'correctpass' },
    });

    expect(res.status()).toBe(200);
    expect(updateArgs.data).toEqual({ mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [] });
  });
});
