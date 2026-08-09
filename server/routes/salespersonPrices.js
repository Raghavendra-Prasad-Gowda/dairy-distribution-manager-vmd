const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/salespersonPrices.controller');
const { requireAdmin } = require('../middleware/auth');

const bulkWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many bulk price updates, please slow down',
});

const router = express.Router();

// This router is mounted on /api/v1/salespeople WITHOUT a router-level
// requireAdmin (app.js), deliberately — GET /:id/prices must stay reachable by
// a salesman reading their own prices. That leaves the bulk WRITE routes below
// with no mount gate, so each carries requireAdmin here: without it they'd rest
// entirely on the single in-controller role check, and deleting that one line
// would silently let a salesman rewrite what they're billed. The controller
// checks stay too — two layers, matching every other bulk endpoint in the app.
//
// requireAdmin runs BEFORE bulkWriteLimiter so a rejected salesman request
// never eats into the 30/min budget real admins share.
router.get('/:id/prices',                        controller.getPrices);
router.post('/:id/prices/bulk',                  requireAdmin, bulkWriteLimiter, controller.bulkSave);
router.post('/:id/prices/copy-from/:sourceId',  requireAdmin, bulkWriteLimiter, controller.copyFromSalesman);
router.post('/bulk-update',                      requireAdmin, bulkWriteLimiter, controller.bulkUpdateMultipleSalesmen);

module.exports = router;
