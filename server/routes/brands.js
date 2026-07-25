const express = require('express');
const controller = require('../controllers/brands.controller');
const { requireAdmin, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/',                        controller.getAll);
router.patch('/reorder',               requireAdmin, controller.reorder);
router.post('/',                       requireSuperAdmin, controller.create);
router.post('/:id/copy-products',      requireAdmin, controller.copyProducts);
router.put('/:id',                     requireAdmin, controller.update);

module.exports = router;
