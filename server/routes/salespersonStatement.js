'use strict';

const express    = require('express');
const controller = require('../controllers/salespersonStatement.controller');

const router = express.Router();

// GET /api/v1/salesperson-statement/me?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/me', controller.myStatement);

module.exports = router;
