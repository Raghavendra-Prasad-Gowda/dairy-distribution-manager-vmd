// deploy: 2026-04-30
require('dotenv').config();
const { execSync } = require('child_process');
const app = require('./app');
const logger = require('./config/logger');

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

/** Run prisma migrate deploy — retries up to maxAttempts times. */
async function runMigrations({ maxAttempts = 3 } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.info(`Running database migrations (attempt ${attempt})…`);
      execSync('npx prisma migrate deploy', { stdio: 'inherit' });
      logger.info('Migrations complete.');
      return;
    } catch (err) {
      logger.error(`Migration attempt ${attempt} failed.`, { message: err.message });
      if (attempt === maxAttempts) throw err;
      await resolveFailedMigrations();
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

async function boot() {
  const PORT = process.env.PORT || 3001;

  const server = app.listen(PORT, () => {
    logger.info(`Server listening on port ${PORT} — running startup tasks…`);
  });

  try {
    await runMigrations();
  } catch (err) {
    logger.error('Migrations failed after all retries.', { message: err.message });
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

  const shutdown = (signal) => {
    logger.info(`Received ${signal}. Gracefully shutting down...`);
    server.close(() => { logger.info('HTTP server closed.'); process.exit(0); });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

boot().catch(err => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
