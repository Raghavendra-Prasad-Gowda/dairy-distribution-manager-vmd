const asyncHandler = require('../middleware/asyncHandler');

const verify = asyncHandler(async (req, res) => {
  const { pin } = req.body;
  const correct = process.env.EDIT_PIN ?? '123456';
  if (!pin || String(pin) !== String(correct)) {
    return res.status(400).json({ success: false, error: 'Incorrect PIN' });
  }
  res.json({ success: true });
});

module.exports = { verify };
