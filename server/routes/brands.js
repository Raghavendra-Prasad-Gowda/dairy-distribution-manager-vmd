const express = require('express');
const controller = require('../controllers/brands.controller');
const { requireAdmin, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

// Brand names are non-sensitive, but limiting reads to admin prevents
// salesman/dispatcher from probing the endpoint directly — they get brand
// data indirectly where needed (e.g. via /salespeople/:id/prices).
router.get('/',                        requireAdmin, controller.getAll);
router.patch('/reorder',               requireAdmin, controller.reorder);
router.post('/',                       requireSuperAdmin, controller.create);
router.post('/:id/copy-products',      requireAdmin, controller.copyProducts);
router.put('/:id',                     requireAdmin, controller.update);

module.exports = router;
