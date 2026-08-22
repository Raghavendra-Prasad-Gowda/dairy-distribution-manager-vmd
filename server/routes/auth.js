const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middleware/auth');
const controller = require('../controllers/auth.controller');

const router = express.Router();

// Guards TOTP/backup-code brute-forcing independently of the login rate
// limiter (app.js) — that one only covers POST /login.
const mfaVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many MFA attempts. Please log in again.' },
});

router.post('/login',           controller.login);
router.post('/mfa/verify',      mfaVerifyLimiter, controller.mfaLogin);
router.post('/change-password', authenticate, controller.changePassword);
router.post('/logout',          authenticate, controller.logout);

module.exports = router;
