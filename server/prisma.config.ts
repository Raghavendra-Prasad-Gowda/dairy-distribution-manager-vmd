import { defineConfig } from 'prisma/config';
import { PrismaPg } from '@prisma/adapter-pg';

// Prisma 7 requires datasource URLs to be configured here rather than in
// schema.prisma. We use the pg driver adapter for both the client (pooled
// DATABASE_URL) and migrations (direct DIRECT_URL, bypassing PgBouncer).
export default defineConfig({
  earlyAccess: true,
  schema: './prisma/schema.prisma',
  migrate: {
    adapter: () =>
      new PrismaPg({
        connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
      }),
  },
});
