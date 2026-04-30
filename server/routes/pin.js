const express = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

// 5 attempts per 15 min per IP — prevents brute-forcing 6-digit PIN
const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many PIN attempts. Try again in 15 minutes.' },
});

// POST /pin/verify
// Body: { pin: string }
// Returns 200 if correct, 401 if wrong
router.post('/verify', pinLimiter, asyncHandler(async (req, res) => {
  const { pin } = req.body;
  const correct = process.env.EDIT_PIN ?? '123456';

  if (!pin || String(pin) !== String(correct)) {
    return res.status(400).json({ success: false, error: 'Incorrect PIN' });
  }

  res.json({ success: true });
}));

module.exports = router;
