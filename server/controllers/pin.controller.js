const bcrypt = require('bcrypt');
const asyncHandler = require('../middleware/asyncHandler');
const { validate, schemas } = require('../utils/validate');
const { BCRYPT_ROUNDS } = require('../utils/constants');
const prisma = require('../lib/prisma');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');

/**
 * POST /pin/verify
 * Verifies the provided PIN against the bcrypt-hashed value stored in AppSettings.
 * Any admin or superadmin may call this endpoint (rate-limited at the route level).
 */
const verify = asyncHandler(async (req, res) => {
  const data = validate(schemas.verifyPin, req, res);
  if (!data) return;
  const { pin } = data;

  const row = await prisma.appSettings.findUnique({ where: { key: 'edit_pin' } });
  const ok  = row ? await bcrypt.compare(String(pin), row.value) : false;

  if (!ok) {
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

/**
 * PUT /pin/update
 * Allows a superadmin to change the edit PIN.
 * Requires the current PIN as proof of knowledge before accepting the new one.
 */
const update = asyncHandler(async (req, res) => {
  const data = validate(schemas.updatePin, req, res);
  if (!data) return;
  const { currentPin, newPin } = data;

  const row = await prisma.appSettings.findUnique({ where: { key: 'edit_pin' } });
  const ok  = row ? await bcrypt.compare(String(currentPin), row.value) : false;

  if (!ok) {
    void notifySlack(SLACK_EVENTS.PIN_FAILED, {
      username: req.user?.username ?? 'unknown',
      role:     req.user?.role === 'superadmin' ? 'Super Admin' : 'Admin',
      ip:       req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.ip,
    });
    return res.status(400).json({ success: false, error: 'Incorrect current PIN' });
  }

  const newHash = await bcrypt.hash(String(newPin), BCRYPT_ROUNDS);
  await prisma.appSettings.upsert({
    where:  { key: 'edit_pin' },
    update: { value: newHash },
    create: { key: 'edit_pin', value: newHash },
  });

  void notifySlack(SLACK_EVENTS.PIN_UPDATED, { username: req.user?.username ?? 'unknown' });
  res.json({ success: true });
});

module.exports = { verify, update };
