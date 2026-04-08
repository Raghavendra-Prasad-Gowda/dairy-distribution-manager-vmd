const bcrypt = require('bcrypt');
const prisma = require('../lib/prisma');
const logger = require('../config/logger');
const { BCRYPT_ROUNDS } = require('../utils/constants');

/**
 * Idempotent — creates AppSettings if it doesn't exist.
 * Runs at server startup.
 */
async function seedAdmin() {
  const existing = await prisma.appSettings.findFirst();
  if (existing) {
    logger.info('Admin account already seeded — skipping');
    return;
  }
  const rawPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const passwordHash = await bcrypt.hash(rawPassword, BCRYPT_ROUNDS);
  await prisma.appSettings.create({
    data: { businessName: 'Vikas Milk Dairy', username: 'admin', passwordHash },
  });
  logger.info('Admin account seeded successfully');
}

module.exports = { seedAdmin };
