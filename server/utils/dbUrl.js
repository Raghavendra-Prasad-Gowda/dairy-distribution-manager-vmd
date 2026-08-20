'use strict';

/**
 * Strips SSL-related query params (sslmode, sslcert, sslkey, sslrootcert)
 * off a Postgres connection string.
 *
 * node-postgres resolves SSL config with:
 *   config = Object.assign({}, config, parse(config.connectionString))
 * — whatever the connection string's `sslmode` produces is merged in LAST,
 * silently overwriting any explicit `ssl: {...}` option passed alongside
 * it. So a pinned CA (or any other explicit ssl option) only survives if
 * the string itself carries no sslmode at all — this must run before any
 * explicit `ssl` option is attached.
 */
function stripSslParams(connectionString) {
  if (!connectionString) return connectionString;
  try {
    const url = new URL(connectionString);
    ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'].forEach((p) => url.searchParams.delete(p));
    return url.toString();
  } catch {
    return connectionString; // malformed URL — let pg surface the real error
  }
}

/**
 * Builds the `ssl` option for a production Postgres connection.
 *
 * Preferred path: `caCert` (DATABASE_CA_CERT) holds the provider's CA
 * certificate PEM — full chain + hostname verification against the real
 * CA. This is the correct long-term state.
 *
 * Fallback: if `caCert` is unset, disables verification
 * (`rejectUnauthorized: false` — still encrypted, but no server-identity
 * check) and logs a warning via `logger` so this never fails silently.
 * Only ever called for production — local/CI Postgres has no TLS at all.
 */
function buildProdSsl(caCert, logger) {
  if (caCert) {
    return { ca: caCert };
  }
  logger?.warn(
    'DATABASE_CA_CERT is not set — production Postgres connection is using ' +
    'unverified TLS (rejectUnauthorized: false). Set DATABASE_CA_CERT to the ' +
    "provider's CA certificate to restore full certificate verification."
  );
  return { rejectUnauthorized: false };
}

module.exports = { stripSslParams, buildProdSsl };
