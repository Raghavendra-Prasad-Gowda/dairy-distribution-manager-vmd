const express = require('express');
const controller = require('../controllers/salespersonPayments.controller');
const { requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/',            controller.create);
// Loading pre-existing dues rewrites what salespeople owe — superadmin only.
router.post('/bulk-topup',  requireSuperAdmin, controller.bulkTopUp);
router.get('/',             controller.getAll);
router.put('/:id',    controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
