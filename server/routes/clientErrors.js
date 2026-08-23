const express = require('express');
const jwt     = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const prisma  = require('../lib/prisma');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');
const { validate, schemas } = require('../utils/validate');
const env = require('../config/env');

const router = express.Router();

// Being public and unauthenticated, this endpoint has no per-user budget to
// key off of — without its own limit it's an open, unbounded way to spam
// the team's Slack channel (or run up the fire-and-forget webhook traffic)
// from anywhere on the internet. 30/hour per IP comfortably covers a real
// bad-deploy burst of crashes from one user while still bounding abuse.
const clientErrorLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  // `message` alone only changes the response body — express-rate-limit still
  // defaults to a 429 status. This is a best-effort beacon, so pin the status
  // to 200 too: the reporting client should never see a rate-limit error.
  statusCode: 200,
  message: { success: true },
});

// POST /api/v1/errors/client — public, no auth required
// Receives frontend crash reports from the ErrorBoundary and forwards to Slack.
// If a valid session cookie is present, username is included in the alert.
router.post('/', clientErrorLimiter, async (req, res) => {
  const data = validate(schemas.reportClientError, req, res);
  if (!data) return;
  const { message, stack, page } = data;

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
