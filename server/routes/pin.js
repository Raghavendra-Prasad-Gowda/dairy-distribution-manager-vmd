const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/pin.controller');
const { authenticate, requireAdmin, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many PIN attempts. Try again in 15 minutes.' },
});

router.post('/verify',   pinLimiter,                          controller.verify);
router.put('/update',    requireSuperAdmin,                   controller.update);
router.get('/settings',  authenticate, requireAdmin,          controller.getSettings);
router.put('/settings',  authenticate, requireSuperAdmin,     controller.updateSettings);

module.exports = router;
