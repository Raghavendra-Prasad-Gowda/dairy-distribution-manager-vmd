const bcrypt = require('bcrypt');
const asyncHandler = require('../middleware/asyncHandler');
const { validate, schemas } = require('../utils/validate');
const { BCRYPT_ROUNDS } = require('../utils/constants');
const prisma = require('../lib/prisma');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');
const { getActingUsername } = require('../utils/actor');

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
      username: await getActingUsername(req),
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

  void notifySlack(SLACK_EVENTS.PIN_UPDATED, { username: await getActingUsername(req) });
  res.json({ success: true });
});

/**
 * GET /pin/settings
 * Returns the current P&L PIN gate setting. Any admin may call this.
 */
const getSettings = asyncHandler(async (_req, res) => {
  const row = await prisma.appSettings.findUnique({ where: { key: 'pl_pin_enabled' } });
  res.json({ success: true, data: { plPinEnabled: row ? row.value === 'true' : true } });
});

/**
 * PUT /pin/settings
 * Superadmin only — toggles whether the P&L page requires a PIN.
 */
const updateSettings = asyncHandler(async (req, res) => {
  const data = validate(schemas.updatePinSettings, req, res);
  if (!data) return;

  await prisma.appSettings.upsert({
    where:  { key: 'pl_pin_enabled' },
    update: { value: String(data.plPinEnabled) },
    create: { key: 'pl_pin_enabled', value: String(data.plPinEnabled) },
  });

  void notifySlack(SLACK_EVENTS.PIN_SETTINGS_UPDATED, {
    username:      await getActingUsername(req),
    plPinEnabled:  data.plPinEnabled,
  });
  res.json({ success: true });
});

/**
 * POST /pin/verify-pl
 * Verifies the provided PIN against the P&L-specific PIN stored in AppSettings.
 * Any admin may call this (rate-limited at the route level, same limiter as verify).
 */
const verifyPl = asyncHandler(async (req, res) => {
  const data = validate(schemas.verifyPin, req, res);
  if (!data) return;

  const row = await prisma.appSettings.findUnique({ where: { key: 'pl_pin' } });
  const ok  = row ? await bcrypt.compare(String(data.pin), row.value) : false;

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
 * PUT /pin/update-pl
 * Superadmin only — changes the P&L-specific PIN.
 * Requires the current P&L PIN as proof of knowledge before accepting the new one.
 */
const updatePl = asyncHandler(async (req, res) => {
  const data = validate(schemas.updatePin, req, res);
  if (!data) return;
  const { currentPin, newPin } = data;

  const row = await prisma.appSettings.findUnique({ where: { key: 'pl_pin' } });
  const ok  = row ? await bcrypt.compare(String(currentPin), row.value) : false;

  if (!ok) {
    void notifySlack(SLACK_EVENTS.PIN_FAILED, {
      username: await getActingUsername(req),
      role:     req.user?.role === 'superadmin' ? 'Super Admin' : 'Admin',
      ip:       req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.ip,
    });
    return res.status(400).json({ success: false, error: 'Incorrect current PIN' });
  }

  const newHash = await bcrypt.hash(String(newPin), BCRYPT_ROUNDS);
  await prisma.appSettings.upsert({
    where:  { key: 'pl_pin' },
    update: { value: newHash },
    create: { key: 'pl_pin', value: newHash },
  });

  void notifySlack(SLACK_EVENTS.PL_PIN_UPDATED, { username: await getActingUsername(req) });
  res.json({ success: true });
});

module.exports = { verify, update, getSettings, updateSettings, verifyPl, updatePl };
