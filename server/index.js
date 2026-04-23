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

  // Migrate container fields (idempotent — containerType + unitsPerContainer from mlPerCrate)
  try {
    const { migrateContainerFields } = require('./scripts/migrate-container-fields');
    await migrateContainerFields();
  } catch (error) {
    logger.warn('Warning: Failed to migrate container fields', { message: error.message });
  }

  // Seed Jersey products (clears existing zero-cost products and re-seeds with correct prices)
  try {
    const { seedJerseyProducts } = require('./scripts/seed-jersey');
    await seedJerseyProducts();
  } catch (error) {
    logger.warn('Warning: Failed to seed Jersey products', { message: error.message });
  }

  // Seed Gowardhan products (clears existing zero-cost products and re-seeds with correct prices)
  try {
    const { seedGowardhanProducts } = require('./scripts/seed-gowardhan');
    await seedGowardhanProducts();
  } catch (error) {
    logger.warn('Warning: Failed to seed Gowardhan products', { message: error.message });
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
