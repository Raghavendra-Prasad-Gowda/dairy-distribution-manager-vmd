'use strict';

const prisma = require('../lib/prisma');

/**
 * Resolves the acting admin's username for audit/Slack attribution.
 *
 * Centralizes the lookup that was copy-pasted verbatim across brands,
 * salespersonPrices, adminUsers and the products route. Returns 'admin' as a
 * safe fallback when the actor can't be resolved (e.g. legacy tokens).
 *
 * @param {import('express').Request} req
 * @param {string} [fallback='admin'] Value returned when the actor can't be resolved.
 * @returns {Promise<string>}
 */
async function getActingUsername(req, fallback = 'admin') {
  const actor = await prisma.adminUser.findUnique({
    where:  { id: req.user.adminUserId },
    select: { username: true },
  });
  return actor?.username ?? fallback;
}

module.exports = { getActingUsername };
