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
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  // Database
  DATABASE_URL: isProd ? z.string().min(1, 'DATABASE_URL is required in production') : z.string().optional(),
  DIRECT_URL: z.string().optional(),

  // Auth secrets — fail closed in production
  JWT_SECRET: requiredInProd(
    z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    'dev-insecure-jwt-secret-change-me-0000000000'
  ),
  ADMIN_PASSWORD: isProd
    ? z.string().min(1, 'ADMIN_PASSWORD is required in production')
    : z.string().optional(),
  EDIT_PIN: requiredInProd(
    z.string().min(4, 'EDIT_PIN must be at least 4 characters').max(12),
    '123456'
  ),

  // CORS / links
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
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
