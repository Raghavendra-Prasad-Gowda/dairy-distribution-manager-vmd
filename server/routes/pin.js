const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/pin.controller');
const { requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many PIN attempts. Try again in 15 minutes.' },
});

router.post('/verify',  pinLimiter,      controller.verify);
router.put('/update',   requireSuperAdmin, controller.update);

module.exports = router;
