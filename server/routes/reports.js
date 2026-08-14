const express = require('express');
const controller = require('../controllers/reports.controller');
const { requireAdmin, requireAdminOrDispatcher } = require('../middleware/auth');

const router = express.Router();

router.get('/dairy-statement',       requireAdmin, controller.dairyStatement);
router.get('/salesperson-statement', requireAdmin, controller.salespersonStatement);
router.get('/stock-summary',         requireAdmin, controller.stockSummary);
router.get('/outstanding',           requireAdmin, controller.outstanding);
router.get('/deposit-summary',       requireAdmin, controller.depositSummary);
router.get('/daily-dispatch',        requireAdminOrDispatcher, controller.dailyDispatch);
router.get('/profit-loss',           requireAdmin, controller.profitLoss);

module.exports = router;
