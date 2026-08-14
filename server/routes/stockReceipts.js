const express = require('express');
const controller = require('../controllers/stockReceipts.controller');
const { requireAdmin, requireAdminOrDispatcher } = require('../middleware/auth');

const router = express.Router();

router.get('/availability', requireAdminOrDispatcher, controller.getAvailability);
router.get('/',             requireAdmin,             controller.getAll);
router.post('/bulk',        requireAdmin,             controller.bulkCreate);

module.exports = router;
