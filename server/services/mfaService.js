'use strict';

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const otplib = require('otplib');
const QRCode = require('qrcode');
const mfaCrypto = require('../utils/mfaCrypto');
const { BCRYPT_ROUNDS, MFA_BACKUP_CODE_COUNT } = require('../utils/constants');

// Allow ±1 time-step (~30s) of clock drift between server and authenticator
// device — otplib's default tolerance is 0, which is too strict for real
// phones whose clocks aren't perfectly synced.
const EPOCH_TOLERANCE = 1;

const ISSUER = 'Vikas Milk Dairy';

/** Generates a new random base32 TOTP secret. */
function generateSecret() {
  return otplib.generateSecret();
}

/**
 * Builds the enrollment payload for an authenticator app: the otpauth:// URI
 * and a scannable QR code (as a data: URL, so nothing is written to disk).
 */
async function buildEnrollment(username, secret) {
  const otpauth = otplib.generateURI({ issuer: ISSUER, label: username, secret });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauth);
  return { otpauth, qrCodeDataUrl };
}

/** Verifies a 6-digit TOTP code against a plaintext (not-yet-encrypted) secret — used at enrollment confirm time. */
async function verifyEnrollmentCode(secret, rawCode) {
  const code = String(rawCode ?? '').trim();
  if (!/^\d{6}$/.test(code)) return false;
  const result = await otplib.verify({ secret, token: code, epochTolerance: EPOCH_TOLERANCE });
  return result.valid;
}

/** Generates one-time backup codes in "XXXXX-XXXXX" form (plaintext — caller must show these to the user exactly once). */
function generateBackupCodes(count = MFA_BACKUP_CODE_COUNT) {
  return Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase(); // 10 hex chars
    return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
  });
}

/** Bcrypt-hashes a batch of plaintext backup codes for storage. */
async function hashBackupCodes(codes) {
  return Promise.all(codes.map((code) => bcrypt.hash(code, BCRYPT_ROUNDS)));
}

/**
 * Verifies a login-time MFA code against an AdminUser row — either a live
 * 6-digit TOTP code from the authenticator app, or one of the hashed
 * one-time backup codes. Never throws.
 *
 * @returns {Promise<{ ok: boolean, usedBackupCode?: boolean, remainingBackupCodes?: string[] }>}
 */
async function verifyLoginCode(adminUser, rawCode) {
  const code = String(rawCode ?? '').trim();

  if (/^\d{6}$/.test(code) && adminUser.mfaSecret) {
    const secret = mfaCrypto.decrypt(adminUser.mfaSecret);
    const result = await otplib.verify({ secret, token: code, epochTolerance: EPOCH_TOLERANCE });
    if (result.valid) return { ok: true, usedBackupCode: false };
  }

  const normalized = code.toUpperCase();
  const codes = adminUser.mfaBackupCodes || [];
  for (let i = 0; i < codes.length; i++) {
    if (await bcrypt.compare(normalized, codes[i])) {
      return {
        ok: true,
        usedBackupCode: true,
        remainingBackupCodes: [...codes.slice(0, i), ...codes.slice(i + 1)],
      };
    }
  }
  return { ok: false };
}

module.exports = {
  generateSecret,
  buildEnrollment,
  verifyEnrollmentCode,
  generateBackupCodes,
  hashBackupCodes,
  verifyLoginCode,
};
