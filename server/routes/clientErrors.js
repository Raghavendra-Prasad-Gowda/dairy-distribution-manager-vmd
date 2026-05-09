const express = require('express');
const jwt     = require('jsonwebtoken');
const prisma  = require('../lib/prisma');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');

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
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const settings = await prisma.appSettings.findFirst({ where: { id: decoded.id }, select: { username: true } });
      username = settings?.username ?? null;
    }
  } catch (_) { /* no valid session — report anonymously */ }

  void notifySlack(SLACK_EVENTS.CLIENT_ERROR, { message, stack, page, username });
  res.json({ success: true });
});

module.exports = router;
