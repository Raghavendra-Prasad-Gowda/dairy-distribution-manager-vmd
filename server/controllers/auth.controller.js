const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const asyncHandler = require('../middleware/asyncHandler');
const { validate, schemas } = require('../utils/validate');
const { BCRYPT_ROUNDS, JWT_EXPIRES_IN } = require('../utils/constants');
const AppError = require('../utils/AppError');
const prisma = require('../lib/prisma');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');

const login = asyncHandler(async (req, res) => {
  const data = validate(schemas.login, req, res);
  if (!data) return;

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.ip;

  // Try admin first
  const settings = await prisma.appSettings.findFirst({
    where: { username: data.username },
  });

  if (settings) {
    const valid = await bcrypt.compare(data.password, settings.passwordHash);
    if (!valid) {
      void notifySlack(SLACK_EVENTS.FAILED_LOGIN, { attemptedUsername: data.username, ip, reason: 'Wrong password' });
      throw new AppError('Invalid username or password', 401);
    }

    const token = jwt.sign(
      { id: settings.id, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const isDeployed = process.env.NODE_ENV !== 'development';
    res.cookie('token', token, {
      httpOnly: true,
      secure: isDeployed,
      sameSite: isDeployed ? 'none' : 'lax',
      maxAge: JWT_EXPIRES_IN * 1000,
    });

    void notifySlack(SLACK_EVENTS.LOGIN, { username: settings.username, role: 'Admin', ip });
    return res.json({
      success: true,
      data: { accessToken: token, businessName: settings.businessName, role: 'admin' },
    });
  }

  // Try salesman
  const salesperson = await prisma.salesperson.findFirst({
    where: { username: data.username, isActive: true },
  });

  if (!salesperson || !salesperson.passwordHash) {
    void notifySlack(SLACK_EVENTS.FAILED_LOGIN, { attemptedUsername: data.username, ip, reason: 'Username not found' });
    throw new AppError('Invalid username or password', 401);
  }

  const valid = await bcrypt.compare(data.password, salesperson.passwordHash);
  if (!valid) {
    void notifySlack(SLACK_EVENTS.FAILED_LOGIN, { attemptedUsername: data.username, ip, reason: 'Wrong password' });
    throw new AppError('Invalid username or password', 401);
  }

  const token = jwt.sign(
    { id: salesperson.id, role: 'salesman', salespersonId: salesperson.id },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  const isDeployed = process.env.NODE_ENV !== 'development';
  res.cookie('token', token, {
    httpOnly: true,
    secure: isDeployed,
    sameSite: isDeployed ? 'none' : 'lax',
    maxAge: JWT_EXPIRES_IN * 1000,
  });

  const settings2 = await prisma.appSettings.findFirst({ select: { businessName: true } });
  void notifySlack(SLACK_EVENTS.LOGIN, { username: salesperson.username, role: 'Salesman', ip });
  res.json({
    success: true,
    data: {
      accessToken: token,
      businessName: settings2?.businessName ?? 'Vikas Milk Dairy',
      role: 'salesman',
      salespersonId: salesperson.id,
      salespersonName: salesperson.name,
    },
  });
});

const changePassword = asyncHandler(async (req, res) => {
  const data = validate(schemas.changePassword, req, res);
  if (!data) return;

  if (req.user.role !== 'admin') throw new AppError('Only admin can change password via this endpoint', 403);

  const settings = await prisma.appSettings.findFirst();
  if (!settings) throw new AppError('App settings not found', 404);

  const valid = await bcrypt.compare(data.currentPassword, settings.passwordHash);
  if (!valid) throw new AppError('Current password is incorrect', 401);

  const passwordHash = await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS);
  await prisma.appSettings.update({ where: { id: settings.id }, data: { passwordHash } });

  res.json({ success: true, data: { message: 'Password changed successfully' } });
});

const logout = asyncHandler(async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.ip;
  let username = 'unknown';
  let role = 'unknown';

  if (req.user?.role === 'admin') {
    const settings = await prisma.appSettings.findFirst({ where: { id: req.user.id }, select: { username: true } });
    username = settings?.username ?? 'unknown';
    role = 'Admin';
  } else if (req.user?.role === 'salesman') {
    const sp = await prisma.salesperson.findUnique({ where: { id: req.user.salespersonId }, select: { username: true, name: true } });
    username = sp?.username ?? sp?.name ?? 'unknown';
    role = 'Salesman';
  }

  res.clearCookie('token');
  void notifySlack(SLACK_EVENTS.LOGOUT, { username, role, ip });
  res.json({ success: true, data: { message: 'Logged out' } });
});

module.exports = { login, changePassword, logout };
