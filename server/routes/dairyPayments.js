const express = require('express');
const controller = require('../controllers/dairyPayments.controller');

const router = express.Router();

router.post('/',    controller.create);
router.get('/',     controller.getAll);
router.put('/:id',  controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
