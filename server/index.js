require('dotenv').config();
const { execSync } = require('child_process');
const app = require('./app');
const logger = require('./config/logger');

/** Wait until Postgres accepts a connection — retries with exponential backoff. */
async function waitForDb({ maxAttempts = 15, baseDelayMs = 2000 } = {}) {
  const { Client } = require('pg');
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      logger.info(`Database ready (attempt ${attempt}).`);
      return;
    } catch (err) {
      await client.end().catch(() => {});
      const delay = Math.min(baseDelayMs * attempt, 30000);
      logger.warn(`DB not ready (attempt ${attempt}/${maxAttempts}): ${err.message}. Retrying in ${delay}ms…`);
      if (attempt === maxAttempts) throw new Error(`Database unavailable after ${maxAttempts} attempts.`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/** Resolve any migrations that started but never finished (e.g. from a previous crashed boot). */
async function resolveFailedMigrations() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
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
      // Re-resolve any newly-failed migrations before retrying
      await resolveFailedMigrations();
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

async function boot() {
  // 1. Wait for DB to be reachable before doing anything
  try {
    await waitForDb();
  } catch (err) {
    logger.error('Database never became available — cannot start.', { message: err.message });
    process.exit(1);
  }

  // 2. Resolve any stuck migrations from previous crashed boots
  await resolveFailedMigrations();

  // 3. Run migrations (with retry)
  try {
    await runMigrations();
  } catch (err) {
    logger.error('Migrations failed after all retries — server will not start.', { message: err.message });
    process.exit(1);
  }

  // 4. Start HTTP server
  const PORT = process.env.PORT || 3001;
  const server = app.listen(PORT, async () => {
    logger.info(`Dairy Distribution Manager API running on port ${PORT}`);

    // 5. Seed admin user (idempotent — no-op if already exists)
    try {
      const { seedFoundationData } = require('./prisma/seed');
      await seedFoundationData();
    } catch (error) {
      logger.error('Critical: Failed to seed admin user — shutting down.', { message: error.message });
      process.exit(1);
    }
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    logger.info(`Received ${signal}. Gracefully shutting down...`);
    server.close(() => {
      logger.info('HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

boot().catch(err => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
