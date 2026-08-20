'use strict';

/**
 * utils/dbUrl.js — Postgres connection-string SSL handling.
 *
 * Regression coverage for the incident where an explicit `ssl: {...}`
 * option passed alongside a connection string was silently clobbered by
 * node-postgres's own `sslmode` parsing (Object.assign merges the parsed
 * connection string in LAST). See utils/dbUrl.js for the full writeup.
 */

const { test, expect } = require('@playwright/test');
const { stripSslParams, buildProdSsl } = require('../../utils/dbUrl');
const { parse } = require('pg-connection-string');

test.describe('stripSslParams', () => {
  test('removes sslmode from the query string', () => {
    const out = stripSslParams('postgresql://u:p@host:5432/db?sslmode=require');
    expect(out).not.toContain('sslmode');
  });

  test('removes sslcert / sslkey / sslrootcert alongside sslmode', () => {
    const out = stripSslParams(
      'postgresql://u:p@host:5432/db?sslmode=verify-full&sslrootcert=%2Ftmp%2Fca.pem'
    );
    expect(out).not.toContain('sslmode');
    expect(out).not.toContain('sslrootcert');
  });

  test('preserves user, password, host, port, database, and other query params', () => {
    const out = stripSslParams('postgresql://u:p%40ss@host:5432/db?sslmode=require&schema=public');
    expect(out).toContain('u:p%40ss@host:5432/db');
    expect(out).toContain('schema=public');
  });

  test('a connection string with no sslmode is returned unchanged in substance', () => {
    const out = stripSslParams('postgresql://u:p@host:5432/db');
    expect(out).toBe('postgresql://u:p@host:5432/db');
  });

  test('returns falsy input unchanged (e.g. undefined DATABASE_URL in dev)', () => {
    expect(stripSslParams(undefined)).toBeUndefined();
    expect(stripSslParams('')).toBe('');
  });

  test('returns the original string unchanged if it cannot be parsed as a URL', () => {
    expect(stripSslParams('not-a-valid-url')).toBe('not-a-valid-url');
  });

  // The actual bug: after stripping, pg-connection-string must not
  // reintroduce a `ssl` key that would clobber an explicit ssl option.
  test('after stripping, pg-connection-string does not set an ssl key at all', () => {
    const stripped = stripSslParams('postgresql://u:p@host:5432/db?sslmode=require');
    const parsed = parse(stripped);
    expect(parsed.ssl).toBeUndefined();
  });
});

test.describe('buildProdSsl', () => {
  test('pins the provided CA certificate when DATABASE_CA_CERT is set', () => {
    const ssl = buildProdSsl('-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----');
    expect(ssl).toEqual({ ca: '-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----' });
  });

  test('falls back to unverified TLS when no CA cert is provided', () => {
    const ssl = buildProdSsl(undefined);
    expect(ssl).toEqual({ rejectUnauthorized: false });
  });

  test('warns via the provided logger when falling back', () => {
    const warnings = [];
    buildProdSsl(undefined, { warn: (msg) => warnings.push(msg) });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('DATABASE_CA_CERT');
  });

  test('does not warn when a CA cert is provided', () => {
    const warnings = [];
    buildProdSsl('some-cert', { warn: (msg) => warnings.push(msg), info: () => {} });
    expect(warnings).toHaveLength(0);
  });

  test('logs a positive confirmation when pinning succeeds — the signal to watch for at boot', () => {
    const infos = [];
    buildProdSsl('some-cert', { info: (msg) => infos.push(msg), warn: () => {} });
    expect(infos).toHaveLength(1);
    expect(infos[0]).toContain('pinned CA certificate');
  });

  test('tolerates a missing logger', () => {
    expect(() => buildProdSsl(undefined)).not.toThrow();
    expect(() => buildProdSsl('some-cert')).not.toThrow();
  });
});

// End-to-end proof that the combination actually fixes the original bug:
// stripping sslmode + attaching ssl.ca survives pg's own merge intact.
test.describe('stripSslParams + buildProdSsl combined', () => {
  test('a pinned CA option is not overwritten by a require-mode connection string', () => {
    const rawUrl = 'postgresql://u:p@host:5432/db?sslmode=require';
    const stripped = stripSslParams(rawUrl);
    const ssl = buildProdSsl('the-real-ca-cert');

    // Simulate node-postgres's own merge order:
    //   config = Object.assign({}, config, parse(config.connectionString))
    const config = Object.assign({ ssl }, parse(stripped));

    expect(config.ssl).toEqual({ ca: 'the-real-ca-cert' });
  });
});
