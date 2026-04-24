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

  // Seed foundation data on startup (idempotent — brands, products, admin)
  try {
    const { seedFoundationData } = require('./prisma/seed');
    await seedFoundationData();
  } catch (error) {
    logger.warn('Warning: Failed to seed foundation data', { message: error.message });
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
