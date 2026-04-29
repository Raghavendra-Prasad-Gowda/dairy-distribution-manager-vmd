require('dotenv').config();
const { execSync } = require('child_process');
const app = require('./app');
const logger = require('./config/logger');

async function boot() {
  // Resolve any failed migrations so they can be re-applied cleanly
  try {
    const { Client } = require('pg');
    const client = new Client({ connectionString: process.env.DATABASE_URL });
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
    logger.warn('Could not check for failed migrations (table may not exist yet).', { message: err.message });
  }

  // Run database migrations before starting the server
  try {
    logger.info('Running database migrations…');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    logger.info('Migrations complete.');
  } catch (err) {
    logger.error('Migration failed — server will not start.', { message: err.message });
    process.exit(1);
  }

  const PORT = process.env.PORT || 3001;

  const server = app.listen(PORT, async () => {
    logger.info(`Dairy Distribution Manager API running on port ${PORT}`);

    // Seed foundation data on startup (idempotent — brands, admin)
    // Fail-fast: if brands/admin can't be created the app is unusable
    try {
      const { seedFoundationData } = require('./prisma/seed');
      await seedFoundationData();
    } catch (error) {
      logger.error('Critical: Failed to seed foundation data — shutting down.', { message: error.message });
      process.exit(1);
    }

    // Seed master data — idempotent upserts, safe on every deploy
    try {
      const { seedNandiniRoutes } = require('./scripts/seed-nandini');
      await seedNandiniRoutes();
    } catch (error) {
      logger.warn('Non-critical: Failed to seed Nandini routes.', { message: error.message });
    }

    // [DISABLED] reseed-nandini, seed-demo-data, migrate-container-fields, seed-nandini-prices, seed-jersey, seed-gowardhan

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
