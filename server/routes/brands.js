const express = require('express');
const controller = require('../controllers/brands.controller');
const { requireAdmin, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/',                        controller.getAll);
router.patch('/reorder',               requireAdmin, controller.reorder);
router.patch('/salesperson-reorder',   requireAdmin, controller.salespersonReorder);
router.post('/',                       requireSuperAdmin, controller.create);
router.put('/:id',                     requireAdmin, controller.update);

module.exports = router;
