const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const globalForPrisma = global;

// Managed Postgres providers (Aiven, etc.) present a certificate signed by
// their own project-specific CA, which isn't in Node's default trust store.
// The pre-Prisma-7 binary query engine tolerated this; @prisma/adapter-pg
// delegates TLS to node-postgres, which does strict chain verification and
// rejects it ("self-signed certificate in certificate chain"). Local/dev/test
// Postgres (docker-compose) has no TLS at all, so this must stay prod-only —
// requesting SSL against a non-SSL server makes node-postgres hard-error.
const pgSsl = process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined;

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      ssl: pgSsl,
    }),
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

module.exports = prisma;
