require('dotenv').config();
const { execSync } = require('child_process');
const app = require('./app');
const logger = require('./config/logger');

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

  // One-time reseed: clears and re-seeds Nandini catalogue + prices.
  // Runs once per environment (guarded by _seed_log table), then never again.
  try {
    const { reseedNandiniOnce } = require('./scripts/reseed-nandini');
    await reseedNandiniOnce();
  } catch (error) {
    logger.error('Nandini reseed failed — continuing startup.', { message: error.message });
  }

  // [DISABLED] seed-demo-data, migrate-container-fields, seed-nandini-prices, seed-jersey, seed-gowardhan

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
