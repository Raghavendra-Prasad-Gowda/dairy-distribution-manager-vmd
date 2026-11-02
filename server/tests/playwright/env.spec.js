'use strict';

/**
 * config/env.js — environment validation.
 * Verifies the module fails closed in production when secrets are missing/weak,
 * and applies safe defaults outside production.
 */

const { test, expect } = require('@playwright/test');
const path = require('path');

const ENV_PATH = path.resolve(__dirname, '../../config/env.js');

/** Load a fresh copy of config/env.js under a given process.env snapshot. */
function loadEnv(overrides) {
  const saved = { ...process.env };
  Object.assign(process.env, overrides);
  // Ensure the keys we intend to "unset" are actually absent.
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
  }
  try {
    delete require.cache[require.resolve(ENV_PATH)];
    return require(ENV_PATH);
  } finally {
    // Restore the original environment for other tests in this worker.
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, saved);
    delete require.cache[require.resolve(ENV_PATH)];
  }
}

test.describe('config/env.js', () => {
  test('throws in production when JWT_SECRET is missing', () => {
    expect(() =>
      loadEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x', EDIT_PIN: '654321', ADMIN_PASSWORD: 'x', JWT_SECRET: undefined })
    ).toThrow(/Invalid environment configuration/);
  });

  test('throws in production when JWT_SECRET is too short', () => {
    expect(() =>
      loadEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x', EDIT_PIN: '654321', ADMIN_PASSWORD: 'x', JWT_SECRET: 'short' })
    ).toThrow(/Invalid environment configuration/);
  });

  test('boots in production even when EDIT_PIN is missing (PIN now stored in DB, not env)', () => {
    // EDIT_PIN is now optional — the PIN is managed via the superadmin UI and
    // stored as a bcrypt hash in AppSettings. The env var is only used by
    // seed.js on the very first deploy to initialise the DB row.
    expect(() =>
      loadEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x', ADMIN_PASSWORD: 'x', JWT_SECRET: 'a'.repeat(32), EDIT_PIN: undefined })
    ).not.toThrow();
  });

  test('boots in production with all required secrets present', () => {
    const env = loadEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://x',
      ADMIN_PASSWORD: 'x',
      JWT_SECRET: 'a'.repeat(32),
      EDIT_PIN: '654321',
    });
    expect(env.isProd).toBe(true);
    expect(env.EDIT_PIN).toBe('654321');
  });

  test('applies safe defaults outside production', () => {
    const env = loadEnv({ NODE_ENV: 'development', JWT_SECRET: undefined, EDIT_PIN: undefined, DATABASE_URL: undefined });
    expect(env.isDev).toBe(true);
    // EDIT_PIN is optional — no default required now that PIN lives in the DB
    expect(env.EDIT_PIN).toBeUndefined();
    expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(env.allowedOrigins).toContain('http://localhost:5173');
  });

  test('SUPERADMIN_USERNAME/PASSWORD are genuinely optional, even in production', () => {
    // Unlike JWT_SECRET/EDIT_PIN, these must never block boot when unset —
    // prisma/seed.js treats their absence as "skip seeding", not an error.
    const env = loadEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://x',
      ADMIN_PASSWORD: 'x',
      JWT_SECRET: 'a'.repeat(32),
      EDIT_PIN: '654321',
      SUPERADMIN_USERNAME: undefined,
      SUPERADMIN_PASSWORD: undefined,
    });
    expect(env.SUPERADMIN_USERNAME).toBeUndefined();
    expect(env.SUPERADMIN_PASSWORD).toBeUndefined();
  });

  test('defaults NODE_ENV to "development" when unset', () => {
    const env = loadEnv({ NODE_ENV: undefined, JWT_SECRET: undefined, EDIT_PIN: undefined, DATABASE_URL: undefined });
    expect(env.NODE_ENV).toBe('development');
    expect(env.isDev).toBe(true);
  });

  test('SUPERADMIN_USERNAME/PASSWORD pass through when set', () => {
    const env = loadEnv({ NODE_ENV: 'development', SUPERADMIN_USERNAME: 'root', SUPERADMIN_PASSWORD: 'hunter2' });
    expect(env.SUPERADMIN_USERNAME).toBe('root');
    expect(env.SUPERADMIN_PASSWORD).toBe('hunter2');
  });

  test('LOGIN_RATE_LIMIT_MAX defaults to 20 when unset or empty', () => {
    expect(loadEnv({ NODE_ENV: 'development', LOGIN_RATE_LIMIT_MAX: undefined }).LOGIN_RATE_LIMIT_MAX).toBe(20);
    expect(loadEnv({ NODE_ENV: 'development', LOGIN_RATE_LIMIT_MAX: '' }).LOGIN_RATE_LIMIT_MAX).toBe(20);
  });

  test('LOGIN_RATE_LIMIT_MAX can be raised for a test environment', () => {
    expect(loadEnv({ NODE_ENV: 'development', LOGIN_RATE_LIMIT_MAX: '1000' }).LOGIN_RATE_LIMIT_MAX).toBe(1000);
  });

  test('LOGIN_RATE_LIMIT_MAX rejects zero, negative and non-numeric values', () => {
    for (const bad of ['0', '-5', 'abc', '2.5']) {
      expect(() => loadEnv({ NODE_ENV: 'development', LOGIN_RATE_LIMIT_MAX: bad })).toThrow(/Invalid environment configuration/);
    }
  });
});
