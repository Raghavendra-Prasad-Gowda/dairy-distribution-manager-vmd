const express = require('express');
const controller = require('../controllers/bills.controller');

const router = express.Router();

// /preview is declared before /:id so "preview" is never parsed as an ID.
router.get('/preview', controller.preview);
router.get('/',        controller.getAll);
router.get('/:id',     controller.getOne);
router.post('/',       controller.create);
router.delete('/:id',  controller.remove);

module.exports = router;
