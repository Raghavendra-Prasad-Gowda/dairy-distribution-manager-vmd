const asyncHandler = require('../middleware/asyncHandler');
const prisma = require('../lib/prisma');
const { notifySlack, SLACK_EVENTS } = require('../utils/slack');

const verify = asyncHandler(async (req, res) => {
  const { pin } = req.body;
  const correct = process.env.EDIT_PIN ?? '123456';
  if (!pin || String(pin) !== String(correct)) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.ip;
    const admin = await prisma.adminUser.findUnique({
      where:  { id: req.user.adminUserId },
      select: { username: true, role: true },
    });
    void notifySlack(SLACK_EVENTS.PIN_FAILED, {
      username: admin?.username ?? 'unknown',
      role:     admin?.role === 'superadmin' ? 'Super Admin' : 'Admin',
      ip,
    });
    return res.status(400).json({ success: false, error: 'Incorrect PIN' });
  }
  res.json({ success: true });
});

module.exports = { verify };
