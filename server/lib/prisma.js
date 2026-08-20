const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { withInsecureSsl } = require('../utils/dbUrl');

const globalForPrisma = global;

// See utils/dbUrl.js — a plain `ssl:` option is silently clobbered by
// node-postgres's own sslmode parsing, so the connection string itself must
// say `sslmode=no-verify`. Local/dev/test Postgres (docker-compose) has no
// TLS at all, so this stays prod-only — requesting SSL against a non-SSL
// server makes node-postgres hard-error.
const dbUrl = process.env.NODE_ENV === 'production'
  ? withInsecureSsl(process.env.DATABASE_URL)
  : process.env.DATABASE_URL;

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: dbUrl,
    }),
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

module.exports = prisma;
