const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { stripSslParams, buildProdSsl } = require('../utils/dbUrl');
const env = require('../config/env');
const logger = require('../config/logger');

const globalForPrisma = global;

// See utils/dbUrl.js — a plain `ssl:` option is silently clobbered by
// node-postgres's own sslmode parsing, so any sslmode in the connection
// string must be stripped before an explicit `ssl` option is attached.
// Local/dev/test Postgres (docker-compose) has no TLS at all, so this
// stays prod-only — requesting SSL against a non-SSL server makes
// node-postgres hard-error.
const dbUrl = env.isProd ? stripSslParams(env.DATABASE_URL) : env.DATABASE_URL;
const pgSsl = env.isProd ? buildProdSsl(env.DATABASE_CA_CERT, logger) : undefined;

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: dbUrl,
      ssl: pgSsl,
    }),
    log: env.isDev ? ['query', 'error', 'warn'] : ['error', 'warn'],
  });

if (!env.isProd) globalForPrisma.prisma = prisma;

module.exports = prisma;
