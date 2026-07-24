const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/salespersonPrices.controller');

const bulkWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many bulk price updates, please slow down',
});

const router = express.Router();

router.get('/:id/prices',                        controller.getPrices);
router.post('/:id/prices/bulk',                  bulkWriteLimiter, controller.bulkSave);
router.post('/:id/prices/copy-from/:sourceId',  bulkWriteLimiter, controller.copyFromSalesman);

module.exports = router;
