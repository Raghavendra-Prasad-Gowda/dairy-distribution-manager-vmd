// deploy: 2026-04-30
require('dotenv').config();
const { execSync } = require('child_process');
const app = require('./app');
const logger = require('./config/logger');
const { notifySlack, SLACK_EVENTS } = require('./utils/slack');

/** Resolve any migrations that started but never finished. */
async function resolveFailedMigrations() {
  const { Client } = require('pg');
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    const { rows } = await client.query(
      `SELECT migration_name FROM "_prisma_migrations"
       WHERE finished_at IS NULL AND rolled_back_at IS NULL AND started_at IS NOT NULL`
    );
    await client.end();
    for (const { migration_name } of rows) {
      logger.warn(`Resolving failed migration as rolled-back: ${migration_name}`);
      execSync(`npx prisma migrate resolve --rolled-back ${migration_name}`, { stdio: 'inherit' });
    }
  } catch (err) {
    await client.end().catch(() => {});
    logger.warn('Could not check for failed migrations (table may not exist yet).', { message: err.message });
  }
}

/** Run prisma migrate deploy. */
async function runMigrations() {
  logger.info('Running database migrations…');
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  logger.info('Migrations complete.');
}

async function boot() {
  const PORT = process.env.PORT || 3001;

  const server = app.listen(PORT, () => {
    logger.info(`Server listening on port ${PORT} — running startup tasks…`);
  });

  try {
    await runMigrations();
  } catch (err) {
    logger.error('Migrations failed.', { message: err.message });
    process.exit(1);
  }

  try {
    const { seedFoundationData } = require('./prisma/seed');
    await seedFoundationData();
  } catch (err) {
    logger.error('Failed to seed admin user — shutting down.', { message: err.message });
    process.exit(1);
  }

  logger.info('Startup complete — server ready.');
  void notifySlack(SLACK_EVENTS.SERVER_STARTED, { env: process.env.NODE_ENV });

  const shutdown = async (signal) => {
    logger.info(`Received ${signal}. Gracefully shutting down...`);
    await notifySlack(SLACK_EVENTS.SERVER_SHUTDOWN, { env: process.env.NODE_ENV, signal });
    server.close(() => { logger.info('HTTP server closed.'); process.exit(0); });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

boot().catch(err => {
  logger.error('Fatal error during startup', { message: err.message, stack: err.stack });
  process.exit(1);
});
