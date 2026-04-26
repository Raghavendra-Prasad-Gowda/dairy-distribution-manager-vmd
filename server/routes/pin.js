const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

// POST /pin/verify
// Body: { pin: string }
// Returns 200 if correct, 401 if wrong
router.post('/verify', asyncHandler(async (req, res) => {
  const { pin } = req.body;
  const correct = process.env.EDIT_PIN ?? '1234';

  if (!pin || String(pin) !== String(correct)) {
    return res.status(401).json({ success: false, error: 'Incorrect PIN' });
  }

  res.json({ success: true });
}));

module.exports = router;
