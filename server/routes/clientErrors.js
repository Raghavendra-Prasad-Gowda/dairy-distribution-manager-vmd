const express = require('express');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');

const router = express.Router();

// POST /api/v1/errors/client — public, unauthenticated
// Receives frontend crash reports from the ErrorBoundary and forwards to Slack.
router.post('/', (req, res) => {
  const { message, stack, page } = req.body ?? {};
  void notifySlack(SLACK_EVENTS.CLIENT_ERROR, { message, stack, page });
  res.json({ success: true });
});

module.exports = router;
