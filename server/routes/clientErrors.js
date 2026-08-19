const express = require('express');
const jwt     = require('jsonwebtoken');
const prisma  = require('../lib/prisma');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');
const env = require('../config/env');

const router = express.Router();

// POST /api/v1/errors/client — public, no auth required
// Receives frontend crash reports from the ErrorBoundary and forwards to Slack.
// If a valid session cookie is present, username is included in the alert.
router.post('/', async (req, res) => {
  const { message, stack, page } = req.body ?? {};

  let username = null;
  try {
    const token = req.cookies?.token;
    if (token) {
      const decoded = jwt.verify(token, env.JWT_SECRET);
      if (decoded.adminUserId) {
        const au = await prisma.adminUser.findUnique({ where: { id: decoded.adminUserId }, select: { username: true } });
        username = au?.username ?? null;
      } else if (decoded.salespersonId) {
        const sp = await prisma.salesperson.findUnique({ where: { id: decoded.salespersonId }, select: { username: true, name: true } });
        username = sp?.username ?? sp?.name ?? null;
      }
    }
  } catch (_) { /* no valid session — report anonymously */ }

  void notifySlack(SLACK_EVENTS.CLIENT_ERROR, { message, stack, page, username });
  res.json({ success: true });
});

module.exports = router;
