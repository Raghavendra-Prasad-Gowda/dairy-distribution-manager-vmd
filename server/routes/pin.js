const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/pin.controller');
const { authenticate, requireAdmin, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  // Only wrong PINs count towards the limit. A correct PIN cannot be guessed, so counting it adds no brute-force
  // protection; it only locks legitimate staff (and the UI automation suite) out after 20 genuine edits. A request
  // counts as successful when it answers below 400; a wrong PIN is a 400 and is still counted.
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many PIN attempts. Try again in 15 minutes.' },
});

router.post('/verify',    pinLimiter,                         controller.verify);
router.put('/update',     requireSuperAdmin,                  controller.update);
router.get('/settings',   authenticate, requireAdmin,         controller.getSettings);
router.put('/settings',   authenticate, requireSuperAdmin,    controller.updateSettings);
router.post('/verify-pl', pinLimiter,                         controller.verifyPl);
router.put('/update-pl',  requireSuperAdmin,                  controller.updatePl);

module.exports = router;
