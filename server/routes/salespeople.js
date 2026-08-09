const express = require('express');
const controller = require('../controllers/salespeople.controller');
const { requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

// Irreversible wipe of one or more salespeople's financial ledgers — superadmin
// only. Declared before the '/:id' routes so 'reset-ledger' can never be read
// as an id if a POST /:id is ever added below.
router.post('/reset-ledger', requireSuperAdmin, controller.resetLedger);

router.get('/',          controller.getAll);
router.put('/reorder',   controller.reorder);
router.get('/:id',       controller.getById);
router.post('/',         controller.create);
router.put('/:id',       controller.update);
router.delete('/:id',    controller.remove);

module.exports = router;
