'use strict';

const crypto = require('crypto');
const env = require('../config/env');

/**
 * Encrypts/decrypts an AdminUser's TOTP secret at rest (AES-256-GCM).
 *
 * No separate secret is provisioned for this — JWT_SECRET is already a
 * required-in-prod, 32+ character secret (config/env.js), so the encryption
 * key is derived from it via SHA-256 with a fixed, purpose-specific salt.
 * This keeps MFA deployable with zero new environment variables.
 */
const ALGORITHM = 'aes-256-gcm';
const KEY = crypto.createHash('sha256').update(`${env.JWT_SECRET}:mfa-secret-encryption`).digest();

/** Encrypts plaintext, returning "iv:authTag:ciphertext" (all hex). */
function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), ciphertext.toString('hex')].join(':');
}

/** Reverses encrypt() — throws if the payload was tampered with or malformed. */
function decrypt(payload) {
  const [ivHex, authTagHex, ciphertextHex] = String(payload).split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error('Malformed MFA secret payload');
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

module.exports = { encrypt, decrypt };
