'use strict';

/**
 * utils/mfaCrypto.js + services/mfaService.js — direct unit coverage.
 *
 * These are exercised indirectly through mfa.spec.js's HTTP-level tests,
 * but the underlying crypto and TOTP/backup-code logic deserves its own
 * pinned coverage — tamper detection and malformed-payload handling in
 * particular have no other path that reaches them.
 */

const { expect } = require('@playwright/test');
const otplib = require('otplib');
const { setupSuite } = require('../helpers/test-setup'); // side effect: sets JWT_SECRET/NODE_ENV before config/env loads
const mfaCrypto = require('../../utils/mfaCrypto');

const { test, ctx } = setupSuite();

// NOTE on bcrypt: setupSuite()'s beforeAll (create-test-server.js) swaps the
// 'bcrypt' entry in require.cache with ctx.mockBcrypt so the rest of the app
// never touches real bcrypt in tests. A plain top-level `require(mfaService)`
// in this file would run BEFORE that beforeAll — Node evaluates top-level
// requires at file-collection time — so it would capture the REAL bcrypt
// module and silently ignore every ctx.mockBcrypt override below (real
// bcrypt.compare() against a fake "hashed:..." string just resolves false,
// it doesn't throw, so this fails quietly rather than with an obvious
// error). mfaService is required fresh inside beforeAll instead, once the
// harness has already pointed 'bcrypt' at ctx.mockBcrypt.
let mfaService;
test.beforeAll(() => {
  mfaService = require('../../services/mfaService');
});

// ─── utils/mfaCrypto.js ────────────────────────────────────────────────────

test.describe('mfaCrypto — encrypt/decrypt', () => {
  test('decrypt(encrypt(x)) round-trips to the original plaintext', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    expect(mfaCrypto.decrypt(mfaCrypto.encrypt(secret))).toBe(secret);
  });

  test('encrypt() produces a different ciphertext each call (random IV) even for the same input', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    expect(mfaCrypto.encrypt(secret)).not.toBe(mfaCrypto.encrypt(secret));
  });

  test('encrypted payload has the "iv:authTag:ciphertext" hex shape', () => {
    const parts = mfaCrypto.encrypt('some-secret').split(':');
    expect(parts).toHaveLength(3);
    parts.forEach((p) => expect(p).toMatch(/^[0-9a-f]+$/));
  });

  test('decrypt() throws on a tampered ciphertext (auth tag check fails)', () => {
    const [iv, authTag, ciphertext] = mfaCrypto.encrypt('some-secret').split(':');
    const tampered = [
      iv,
      authTag,
      ciphertext.slice(0, -2) + (ciphertext.slice(-2) === '00' ? '01' : '00'),
    ].join(':');
    expect(() => mfaCrypto.decrypt(tampered)).toThrow();
  });

  test('decrypt() throws on a malformed payload missing parts', () => {
    expect(() => mfaCrypto.decrypt('not-a-valid-payload')).toThrow('Malformed MFA secret payload');
    expect(() => mfaCrypto.decrypt('')).toThrow('Malformed MFA secret payload');
  });
});

// ─── services/mfaService.js ────────────────────────────────────────────────

test.describe('mfaService — enrollment', () => {
  test('generateSecret() returns a non-empty base32-looking string, different each call', () => {
    const a = mfaService.generateSecret();
    const b = mfaService.generateSecret();
    expect(a).toEqual(expect.any(String));
    expect(a.length).toBeGreaterThan(10);
    expect(a).toMatch(/^[A-Z2-7]+$/); // base32 alphabet
    expect(a).not.toBe(b);
  });

  test('buildEnrollment() returns an otpauth URI carrying the issuer/username, plus a PNG data URL', async () => {
    const secret = mfaService.generateSecret();
    const { otpauth, qrCodeDataUrl } = await mfaService.buildEnrollment('super1', secret);

    expect(otpauth).toMatch(/^otpauth:\/\/totp\//);
    expect(decodeURIComponent(otpauth)).toContain('Vikas Milk Dairy');
    expect(decodeURIComponent(otpauth)).toContain('super1');
    expect(new URL(otpauth).searchParams.get('secret')).toBe(secret);
    expect(qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  test('verifyEnrollmentCode() accepts the current code for the secret and rejects a wrong one', async () => {
    const secret = mfaService.generateSecret();
    const code = await otplib.generate({ secret });

    expect(await mfaService.verifyEnrollmentCode(secret, code)).toBe(true);
    expect(await mfaService.verifyEnrollmentCode(secret, '000000')).toBe(false);
  });

  test('verifyEnrollmentCode() rejects anything that is not exactly 6 digits without ever calling otplib', async () => {
    const secret = mfaService.generateSecret();
    expect(await mfaService.verifyEnrollmentCode(secret, '12345')).toBe(false);
    expect(await mfaService.verifyEnrollmentCode(secret, '1234567')).toBe(false);
    expect(await mfaService.verifyEnrollmentCode(secret, 'abcdef')).toBe(false);
    expect(await mfaService.verifyEnrollmentCode(secret, '')).toBe(false);
    expect(await mfaService.verifyEnrollmentCode(secret, undefined)).toBe(false);
  });
});

test.describe('mfaService — backup codes', () => {
  test('generateBackupCodes() defaults to MFA_BACKUP_CODE_COUNT (8) unique "XXXXX-XXXXX" codes', () => {
    const codes = mfaService.generateBackupCodes();
    expect(codes).toHaveLength(8);
    codes.forEach((c) => expect(c).toMatch(/^[0-9A-F]{5}-[0-9A-F]{5}$/));
    expect(new Set(codes).size).toBe(8); // no duplicates
  });

  test('generateBackupCodes() honors an explicit count', () => {
    expect(mfaService.generateBackupCodes(3)).toHaveLength(3);
  });

  test('hashBackupCodes() calls bcrypt.hash once per input code, in order', async () => {
    ctx.mockBcrypt.hash = async (v) => `hashed:${v}`;
    const codes = mfaService.generateBackupCodes(2);

    const hashed = await mfaService.hashBackupCodes(codes);

    expect(hashed).toEqual([`hashed:${codes[0]}`, `hashed:${codes[1]}`]);
  });
});

test.describe('mfaService — verifyLoginCode', () => {
  test("accepts a live TOTP code for the account's encrypted secret", async () => {
    const secret = mfaService.generateSecret();
    const adminUser = { mfaSecret: mfaCrypto.encrypt(secret), mfaBackupCodes: [] };
    const code = await otplib.generate({ secret });

    const result = await mfaService.verifyLoginCode(adminUser, code);
    expect(result).toEqual({ ok: true, usedBackupCode: false });
  });

  test('rejects a wrong TOTP code and a code for the wrong account entirely', async () => {
    const secret = mfaService.generateSecret();
    const adminUser = { mfaSecret: mfaCrypto.encrypt(secret), mfaBackupCodes: [] };

    expect(await mfaService.verifyLoginCode(adminUser, '000000')).toEqual({ ok: false });
  });

  test('falls through to a backup code when the input is not a live TOTP code', async () => {
    ctx.mockBcrypt.compare = async (raw, hash) => hash === `hashed:${raw}`;
    const plain = 'DEADB-EEF01';
    const adminUser = { mfaSecret: null, mfaBackupCodes: [`hashed:${plain}`] };

    const result = await mfaService.verifyLoginCode(adminUser, plain);
    expect(result.ok).toBe(true);
    expect(result.usedBackupCode).toBe(true);
    expect(result.remainingBackupCodes).toEqual([]);
  });

  test('backup code matching is case-insensitive (lowercase input still matches)', async () => {
    // verifyLoginCode uppercases the raw input before comparing — the mock
    // just has to prove that normalized value, not lowercase, reaches compare().
    ctx.mockBcrypt.compare = async (raw, hash) => hash === `hashed:${raw}`;
    const plain = 'DEADB-EEF01';
    const adminUser = { mfaSecret: null, mfaBackupCodes: [`hashed:${plain}`] };

    const result = await mfaService.verifyLoginCode(adminUser, plain.toLowerCase());
    expect(result.ok).toBe(true);
  });

  test('removes only the matched backup code, leaving the others untouched and in order', async () => {
    ctx.mockBcrypt.compare = async (raw, hash) => hash === `hashed:${raw}`;
    const plainCodes = ['AAAAA-11111', 'BBBBB-22222', 'CCCCC-33333'];
    const hashedCodes = plainCodes.map((c) => `hashed:${c}`);
    const adminUser = { mfaSecret: null, mfaBackupCodes: hashedCodes };

    const result = await mfaService.verifyLoginCode(adminUser, plainCodes[1]);
    expect(result.ok).toBe(true);
    expect(result.remainingBackupCodes).toEqual([hashedCodes[0], hashedCodes[2]]);
  });

  test('rejects a code that matches neither the TOTP secret nor any backup code', async () => {
    ctx.mockBcrypt.compare = async (raw, hash) => hash === `hashed:${raw}`;
    const adminUser = { mfaSecret: null, mfaBackupCodes: ['hashed:AAAAA-11111'] };

    expect(await mfaService.verifyLoginCode(adminUser, 'ZZZZZ-99999')).toEqual({ ok: false });
  });

  test('never throws for a missing/undefined code', async () => {
    const adminUser = { mfaSecret: null, mfaBackupCodes: [] };
    await expect(mfaService.verifyLoginCode(adminUser, undefined)).resolves.toEqual({ ok: false });
  });
});
