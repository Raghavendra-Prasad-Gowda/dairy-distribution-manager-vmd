const express = require('express');
const controller = require('../controllers/salespersonPayments.controller');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/',            controller.create);
// Loading pre-existing dues rewrites what salespeople owe — any admin can do
// this for salesmen (unlike the dairy/deposit top-ups and ledger reset,
// which stay superadmin-only).
router.post('/bulk-topup',  requireAdmin, controller.bulkTopUp);
router.get('/',             controller.getAll);
router.put('/:id',    controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
