const express = require('express');
const controller = require('../controllers/dispatches.controller');

const router = express.Router();

router.get('/summary', controller.getSummary);
router.get('/',        controller.getAll);
router.post('/',       controller.createOrUpdate);
router.delete('/:id',  controller.remove);

module.exports = router;
