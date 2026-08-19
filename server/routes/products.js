const router = require('express').Router();
const controller = require('../controllers/products.controller');

// Order matters: the literal `/salesperson-global` and `/reorder` paths must be
// registered before the `/:id` param routes so they aren't captured as an :id.
router.get('/',                          controller.getAll);
router.get('/salesperson-global',        controller.getSalespersonGlobal);
router.patch('/salesperson-global',      controller.updateSalespersonGlobal);
router.patch('/reorder',                 controller.reorder);
router.post('/',                         controller.create);
router.delete('/:id/salesperson-prices', controller.clearSalespersonPrices);
router.put('/:id',                       controller.update);
router.delete('/:id',                    controller.remove);

module.exports = router;
