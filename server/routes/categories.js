const express = require('express');
const controller = require('../controllers/categories.controller');

const router = express.Router();

router.get('/',          controller.getAll);
router.patch('/reorder', controller.reorder);
router.post('/',         controller.create);
router.put('/:id',       controller.update);
router.delete('/:id',    controller.remove);

module.exports = router;
