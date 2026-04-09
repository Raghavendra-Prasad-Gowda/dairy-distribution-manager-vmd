const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const asyncHandler = require('../middleware/asyncHandler');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../utils/validate');
const { BCRYPT_ROUNDS, JWT_EXPIRES_IN } = require('../utils/constants');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');

const router = express.Router();

// ─── POST /auth/login ─────────────────────────────────────────────────────────
router.post('/login', asyncHandler(async (req, res) => {
  const data = validate(schemas.login, req, res);
  if (!data) return;

  const settings = await prisma.appSettings.findFirst({
    where: { username: data.username },
  });
  if (!settings) throw new AppError('Invalid username or password', 401);

  const valid = await bcrypt.compare(data.password, settings.passwordHash);
  if (!valid) throw new AppError('Invalid username or password', 401);

  const token = jwt.sign(
    { id: settings.id },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  // Any env except 'development' is treated as a deployed environment
  // requiring secure cross-origin cookies (covers 'production', 'testing', 'staging', etc.)
  const isDeployed = process.env.NODE_ENV !== 'development';

  // Set httpOnly cookie
  res.cookie('token', token, {
    httpOnly: true,
    secure: isDeployed,
    sameSite: isDeployed ? 'none' : 'lax',
    maxAge: JWT_EXPIRES_IN * 1000,
  });

  res.json({
    success: true,
    data: {
      accessToken: token,
      businessName: settings.businessName,
    },
  });
}));

// ─── POST /auth/change-password ───────────────────────────────────────────────
router.post('/change-password', authenticate, asyncHandler(async (req, res) => {
  const data = validate(schemas.changePassword, req, res);
  if (!data) return;

  const settings = await prisma.appSettings.findFirst();
  if (!settings) throw new AppError('App settings not found', 404);

  const valid = await bcrypt.compare(data.currentPassword, settings.passwordHash);
  if (!valid) throw new AppError('Current password is incorrect', 401);

  const passwordHash = await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS);
  await prisma.appSettings.update({
    where: { id: settings.id },
    data: { passwordHash },
  });

  res.json({ success: true, data: { message: 'Password changed successfully' } });
}));

// ─── POST /auth/logout ────────────────────────────────────────────────────────
router.post('/logout', authenticate, (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, data: { message: 'Logged out' } });
});

module.exports = router;
