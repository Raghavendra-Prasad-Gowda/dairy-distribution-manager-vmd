const express = require('express');
const controller = require('../controllers/salespersonPrices.controller');

const router = express.Router();

router.get('/:id/prices',       controller.getPrices);
router.post('/:id/prices/bulk', controller.bulkSave);

module.exports = router;
