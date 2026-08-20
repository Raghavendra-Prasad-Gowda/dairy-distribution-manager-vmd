'use strict';

/**
 * Forces `sslmode=no-verify` onto a Postgres connection string.
 *
 * `pg` (the runtime behind @prisma/adapter-pg) resolves SSL config with:
 *   config = Object.assign({}, config, parse(config.connectionString))
 * — whatever `sslmode` the connection string carries always wins, even
 * over an explicit `ssl: {...}` option passed alongside it, because the
 * parsed string is merged in last.
 *
 * Aiven's own recommended connection string uses `sslmode=require`. As of
 * the pg-connection-string version pulled in by the Prisma 7 migration,
 * `require`/`prefer`/`verify-ca` are treated as aliases for `verify-full`
 * — full chain + hostname verification — which parses to `ssl: {}` and
 * rejects Aiven's project-specific CA ("self-signed certificate in
 * certificate chain"). Passing `ssl: { rejectUnauthorized: false }` as a
 * separate option does NOT help; it gets clobbered by the merge above.
 *
 * The only reliable fix is to make the string itself say `no-verify`,
 * which pg-connection-string maps to `{ rejectUnauthorized: false }`.
 */
function withInsecureSsl(connectionString) {
  if (!connectionString) return connectionString;
  try {
    const url = new URL(connectionString);
    url.searchParams.set('sslmode', 'no-verify');
    return url.toString();
  } catch {
    return connectionString; // malformed URL — let pg surface the real error
  }
}

module.exports = { withInsecureSsl };
