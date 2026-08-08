const express = require('express');
const controller = require('../controllers/salespeople.controller');
const { requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/',          controller.getAll);
router.put('/reorder',   controller.reorder);
router.get('/:id',       controller.getById);
router.post('/',         controller.create);
router.put('/:id',       controller.update);
router.delete('/:id',    controller.remove);
// Irreversible wipe of a salesperson's financial ledger — superadmin only.
router.post('/:id/reset-ledger', requireSuperAdmin, controller.resetLedger);

module.exports = router;
