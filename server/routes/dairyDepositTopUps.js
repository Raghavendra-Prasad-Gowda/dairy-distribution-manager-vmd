const express = require('express');
const controller = require('../controllers/dairyDepositTopUps.controller');
const { requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

// Standalone deposit ledger — feeds only the Deposit report. See
// dairyDepositTopUps.controller.js for why this is not a DairyPayment.
router.post('/bulk',   requireSuperAdmin, controller.bulkCreate);
router.delete('/:id',  requireSuperAdmin, controller.remove);

module.exports = router;
