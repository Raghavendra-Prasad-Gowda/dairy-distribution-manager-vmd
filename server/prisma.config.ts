import { defineConfig } from 'prisma/config';
import { PrismaPg } from '@prisma/adapter-pg';
const { withInsecureSsl } = require('./utils/dbUrl');

// Prisma 7 requires datasource URLs to be configured here rather than in
// schema.prisma. We use the pg driver adapter for both the client (pooled
// DATABASE_URL) and migrations (direct DIRECT_URL, bypassing PgBouncer).
//
// See utils/dbUrl.js — managed Postgres providers (Aiven, etc.) present a
// certificate signed by their own project-specific CA, which node-postgres
// won't trust by default ("self-signed certificate in certificate chain").
// A plain `ssl:` option gets silently clobbered by node-postgres's own
// sslmode parsing, so the connection string itself must carry
// sslmode=no-verify. Local/dev Postgres has no TLS at all, so this stays
// prod-only — see lib/prisma.js.
const rawUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const dbUrl = process.env.NODE_ENV === 'production' ? withInsecureSsl(rawUrl) : rawUrl;

export default defineConfig({
  earlyAccess: true,
  schema: './prisma/schema.prisma',
  datasource: {
    url: dbUrl,
  },
  migrate: {
    adapter: () =>
      new PrismaPg({
        connectionString: dbUrl,
      }),
  },
});
