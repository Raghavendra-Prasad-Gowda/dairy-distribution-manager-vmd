'use strict';

/**
 * Centralized, validated environment configuration.
 *
 * All secrets and tunables are read HERE, once, at boot — never via raw
 * `process.env` scattered across the codebase. The schema is validated with
 * Zod so a missing or malformed value fails fast and loud at startup rather
 * than silently defaulting and breaking at request time.
 *
 * Policy:
 *  - In production, security-critical values (JWT_SECRET, EDIT_PIN, DATABASE_URL,
 *    ADMIN_PASSWORD) are REQUIRED and strong — the app refuses to boot without
 *    them (fail closed). There are deliberately NO insecure defaults in prod.
 *  - In development/test, sensible defaults keep local runs and the CI test
 *    server frictionless.
 */

const { z } = require('zod');

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

// A secret is "required & strong" in prod, "optional with a dev default" otherwise.
const requiredInProd = (prodSchema, devDefault) =>
  isProd ? prodSchema : prodSchema.or(z.string()).optional().default(devDefault);

const schema = z.object({
  // z.preprocess guarantees the fn runs before ZodEnum/ZodCoerce sees the value,
  // which is necessary in Zod v4 where ZodDefault no longer short-circuits
  // undefined before the inner type validates.
  NODE_ENV: z.preprocess(
    (val) => val || 'development',
    z.enum(['development', 'test', 'production'])
  ),
  PORT: z.preprocess(
    (val) => val ?? '3001',
    z.coerce.number().int().positive()
  ),

  // Database
  DATABASE_URL: isProd ? z.string().min(1, 'DATABASE_URL is required in production') : z.string().optional(),
  DIRECT_URL: z.string().optional(),
  // PEM contents of the managed Postgres provider's CA certificate (Aiven,
  // etc.) — pins TLS verification to the real CA instead of falling back to
  // unverified TLS. See utils/dbUrl.js for why this can't just be a query
  // param on DATABASE_URL. Optional: unset means unverified-TLS fallback,
  // with a boot-time warning (not a fail-closed secret like JWT_SECRET).
  DATABASE_CA_CERT: z.string().optional(),

  // Auth secrets — fail closed in production
  JWT_SECRET: requiredInProd(
    z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    'dev-insecure-jwt-secret-change-me-0000000000'
  ),
  ADMIN_PASSWORD: isProd
    ? z.string().min(1, 'ADMIN_PASSWORD is required in production')
    : z.string().optional(),
  // EDIT_PIN is now stored as a bcrypt hash in the AppSettings DB table and
  // managed via the superadmin UI. This env var is consulted only by seed.js
  // on the very first deploy to initialise the DB row. Rotate the PIN via the
  // superadmin UI thereafter — no env var change or server redeployment needed.
  EDIT_PIN: z.string().optional(),

  // Superadmin auto-provisioning (prisma/seed.js). Genuinely optional — when
  // unset, seeding is skipped entirely (no superadmin is created/synced). Never
  // required-in-prod like the secrets above; a deployment may deliberately omit
  // these and create the superadmin some other way.
  SUPERADMIN_USERNAME: z.string().optional(),
  SUPERADMIN_PASSWORD: z.string().optional(),

  // Login attempts allowed per IP per hour (brute-force guard on /auth/login). Defaults to 20 and
  // must stay there in production; raise it only on a test environment, where one CI runner makes
  // many logins from one address.
  LOGIN_RATE_LIMIT_MAX: z.preprocess(
    (val) => (val === undefined || val === '' ? 20 : val),
    z.coerce.number().int().min(1),
  ),

  // Requests per IP per minute on the bulk-write routes (/stock-receipts, salesperson products and price
  // bulk saves). Defaults to 30 and must stay there in production; raise it only on a test environment,
  // where one UI-automation runner drives many of these routes from one address.
  BULK_WRITE_RATE_LIMIT_MAX: z.preprocess(
    (val) => (val === undefined || val === '' ? 30 : val),
    z.coerce.number().int().min(1),
  ),

  // CORS / links
  CLIENT_ORIGIN: z.preprocess(
    (val) => val || 'http://localhost:5173',
    z.string()
  ),
  APP_URL: z.string().optional().default(''),

  // Optional integrations
  SLACK_WEBHOOK_URL: z.string().url().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  // Logger imports env, so avoid a circular dependency here and write to stderr.
  console.error(`\n[env] Invalid environment configuration:\n${issues}\n`);
  throw new Error('Invalid environment configuration — see errors above.');
}

const env = Object.freeze({
  ...parsed.data,
  isProd,
  isDev: NODE_ENV === 'development',
  isTest: NODE_ENV === 'test',
  allowedOrigins: parsed.data.CLIENT_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
});

module.exports = env;
