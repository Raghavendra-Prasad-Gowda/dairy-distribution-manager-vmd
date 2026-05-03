const express = require('express');
const controller = require('../controllers/reports.controller');

const router = express.Router();

router.get('/dairy-statement',       controller.dairyStatement);
router.get('/salesperson-statement', controller.salespersonStatement);
router.get('/stock-summary',         controller.stockSummary);
router.get('/outstanding',           controller.outstanding);
router.get('/deposit-summary',       controller.depositSummary);

module.exports = router;
