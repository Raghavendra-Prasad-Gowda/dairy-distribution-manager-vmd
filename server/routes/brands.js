const express = require('express');
const controller = require('../controllers/brands.controller');

const router = express.Router();

router.get('/',    controller.getAll);
router.post('/',   controller.create);
router.put('/:id', controller.update);

module.exports = router;
