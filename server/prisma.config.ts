import { defineConfig } from 'prisma/config';
import { PrismaPg } from '@prisma/adapter-pg';

// Prisma 7 requires datasource URLs to be configured here rather than in
// schema.prisma. We use the pg driver adapter for both the client (pooled
// DATABASE_URL) and migrations (direct DIRECT_URL, bypassing PgBouncer).
//
// ssl: managed Postgres providers (Aiven, etc.) present a certificate signed
// by their own project-specific CA, which node-postgres won't trust by
// default ("self-signed certificate in certificate chain"). Local/dev
// Postgres has no TLS at all, so this stays prod-only — see lib/prisma.js.
const pgSsl = process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined;

export default defineConfig({
  earlyAccess: true,
  schema: './prisma/schema.prisma',
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
  migrate: {
    adapter: () =>
      new PrismaPg({
        connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
        ssl: pgSsl,
      }),
  },
});
