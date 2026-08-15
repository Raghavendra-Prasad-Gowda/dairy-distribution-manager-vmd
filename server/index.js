// deploy: 2026-04-30
require('dotenv').config();
const { execSync } = require('child_process');
const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const { notifySlack, SLACK_EVENTS } = require('./utils/slack');

/** Resolve any migrations that started but never finished. */
async function resolveFailedMigrations() {
  const { Client } = require('pg');
  const client = new Client({
    connectionString: env.DATABASE_URL,
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

// Node process lifecycle guards — these fire for errors that never touched
// asyncHandler/the Express error handler at all (thrown outside a request,
// or a rejected promise nobody awaited). Without these, such a crash was
// completely silent: no Slack, just the process dying. Awaited (not
// fire-and-forget) since the process is about to exit right after.
process.on('uncaughtException', async (err) => {
  logger.error('Uncaught exception — crashing.', { message: err.message, stack: err.stack });
  await notifySlack(SLACK_EVENTS.PROCESS_CRASH, {
    env: process.env.NODE_ENV, type: 'uncaughtException', message: err.message, stack: err.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error('Unhandled promise rejection.', { message: err.message, stack: err.stack });
  await notifySlack(SLACK_EVENTS.PROCESS_CRASH, {
    env: process.env.NODE_ENV, type: 'unhandledRejection', message: err.message, stack: err.stack,
  });
  // Not exiting here — Node itself doesn't crash on an unhandled rejection by
  // default, and process state after one is usually still trustworthy (unlike
  // after a genuine uncaught exception). Just make sure it's visible.
});

async function boot() {
  const PORT = env.PORT;

  const server = app.listen(PORT, () => {
    logger.info(`Server listening on port ${PORT} — running startup tasks…`);
  });

  try {
    await runMigrations();
  } catch (err) {
    logger.error('Migrations failed.', { message: err.message });
    await notifySlack(SLACK_EVENTS.SERVER_BOOT_FAILED, {
      env: process.env.NODE_ENV, stage: 'migrations', message: err.message, stack: err.stack,
    });
    process.exit(1);
  }

  try {
    const { seedFoundationData } = require('./prisma/seed');
    await seedFoundationData();
  } catch (err) {
    logger.error('Failed to seed admin user — shutting down.', { message: err.message });
    await notifySlack(SLACK_EVENTS.SERVER_BOOT_FAILED, {
      env: process.env.NODE_ENV, stage: 'seed', message: err.message, stack: err.stack,
    });
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

boot().catch(async (err) => {
  logger.error('Fatal error during startup', { message: err.message, stack: err.stack });
  await notifySlack(SLACK_EVENTS.SERVER_BOOT_FAILED, {
    env: process.env.NODE_ENV, stage: 'boot', message: err.message, stack: err.stack,
  });
  process.exit(1);
});
