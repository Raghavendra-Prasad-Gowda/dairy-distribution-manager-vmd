const express = require('express');
const controller = require('../controllers/dairyBalance.controller');

const router = express.Router();

router.get('/',                controller.getAll);
router.get('/route-breakdown', controller.getRouteBreakdown);
router.get('/:brandId',        controller.getByBrand);

module.exports = router;
