const express = require('express');
const controller = require('../controllers/stockReceipts.controller');

const router = express.Router();

router.get('/availability', controller.getAvailability);
router.get('/',             controller.getAll);
router.post('/bulk',        controller.bulkCreate);

module.exports = router;
