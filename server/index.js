require('dotenv').config();
const app = require('./app');
const logger = require('./config/logger');

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

  // Seed demo data on startup (idempotent — salespeople, prices)
  try {
    const { seedDemoData } = require('./scripts/seed-demo-data');
    await seedDemoData();
  } catch (error) {
    logger.warn('Warning: Failed to seed demo data', { message: error.message });
  }

  // Seed Nandini products (one-time — guard skips if already applied)
  try {
    const { seedNandiniProducts } = require('./scripts/seed-nandini');
    await seedNandiniProducts();
  } catch (error) {
    logger.warn('Warning: Failed to seed Nandini products', { message: error.message });
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
