const asyncHandler = require('../middleware/asyncHandler');
const { validate, schemas } = require('../utils/validate');
const prisma = require('../lib/prisma');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');
const env = require('../config/env');

const verify = asyncHandler(async (req, res) => {
  const data = validate(schemas.verifyPin, req, res);
  if (!data) return;
  const { pin } = data;
  // EDIT_PIN is validated at boot (config/env.js) and required in production,
  // so there is no insecure hardcoded fallback here.
  const correct = env.EDIT_PIN;
  if (!pin || String(pin) !== String(correct)) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.ip;
    const admin = await prisma.adminUser.findUnique({
      where:  { id: req.user.adminUserId },
      select: { username: true, role: true },
    });
    void notifySlack(SLACK_EVENTS.PIN_FAILED, {
      username: admin?.username ?? 'unknown',
      role:     admin?.role === 'superadmin' ? 'Super Admin' : 'Admin',
      ip,
    });
    return res.status(400).json({ success: false, error: 'Incorrect PIN' });
  }
  res.json({ success: true });
});

module.exports = { verify };
