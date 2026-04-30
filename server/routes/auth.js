const express = require('express');
const { authenticate } = require('../middleware/auth');
const controller = require('../controllers/auth.controller');

const router = express.Router();

router.post('/login',           controller.login);
router.post('/change-password', authenticate, controller.changePassword);
router.post('/logout',          authenticate, controller.logout);

module.exports = router;
