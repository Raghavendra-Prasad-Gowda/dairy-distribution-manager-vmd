import { defineConfig } from 'prisma/config';
import { PrismaPg } from '@prisma/adapter-pg';
const { stripSslParams, buildProdSsl } = require('./utils/dbUrl');

// Prisma 7 requires datasource URLs to be configured here rather than in
// schema.prisma. We use the pg driver adapter for both the client (pooled
// DATABASE_URL) and migrations (direct DIRECT_URL, bypassing PgBouncer).
//
// See utils/dbUrl.js — managed Postgres providers (Aiven, etc.) present a
// certificate signed by their own project-specific CA, which node-postgres
// won't trust by default ("self-signed certificate in certificate chain").
// A plain `ssl:` option gets silently clobbered by node-postgres's own
// sslmode parsing unless sslmode is stripped from the string first. Local/
// dev Postgres has no TLS at all, so this stays prod-only — see lib/prisma.js.
const isProd = process.env.NODE_ENV === 'production';
const rawUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const dbUrl = isProd ? stripSslParams(rawUrl) : rawUrl;
const pgSsl = isProd ? buildProdSsl(process.env.DATABASE_CA_CERT, console) : undefined;

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
        ssl: pgSsl,
      }),
  },
});
