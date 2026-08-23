const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middleware/auth');
const controller = require('../controllers/auth.controller');

const router = express.Router();

// Guards code-guessing independently of the login rate limiter (app.js) —
// that one only covers POST /login. Each MFA sub-endpoint below gets its
// OWN limiter instance (not a shared one) so a burst against one doesn't
// eat into another's budget — /mfa/verify and /mfa/confirm-required both
// accept a guessable 6-digit/backup code and share this stricter budget;
// /mfa/setup-required only ever returns a QR code, nothing guessable, but
// still gets a (lighter) limit against secret-regeneration spam.
const codeGuessLimiterOpts = {
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many MFA attempts. Please log in again.' },
};
const mfaVerifyLimiter = rateLimit(codeGuessLimiterOpts);
const mfaConfirmRequiredLimiter = rateLimit(codeGuessLimiterOpts);
const mfaSetupRequiredLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please log in again.' },
});

router.post('/login', controller.login);
router.post('/mfa/verify', mfaVerifyLimiter, controller.mfaLogin);
router.post('/mfa/setup-required', mfaSetupRequiredLimiter, controller.mfaSetupRequired);
router.post('/mfa/confirm-required', mfaConfirmRequiredLimiter, controller.mfaConfirmRequired);
router.post('/change-password', authenticate, controller.changePassword);
router.post('/logout', authenticate, controller.logout);

module.exports = router;
