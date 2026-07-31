const express = require('express');
const controller = require('../controllers/salespersonProducts.controller');

const router = express.Router();

router.get('/:id/products',            controller.getProducts);
router.post('/:id/products/bulk',      controller.bulkUpdate);
router.post('/products/bulk-update',   controller.bulkUpdateMultipleSalesmen);

module.exports = router;
