const express = require('express');
const controller = require('../controllers/dispatches.controller');

const router = express.Router();

router.get('/summary', controller.getSummary);
router.get('/',        controller.getAll);
router.post('/',            controller.createOrUpdate);
router.post('/open-for-entry', controller.openForEntry);
router.post('/finalize-day',   controller.finalizeDay);
router.delete('/finalize-day', controller.unfinalizeDay);
router.patch('/:id/submit', controller.submit);
router.patch('/:id/lock',   controller.lock);
router.patch('/:id/unlock', controller.unlock);
router.delete('/:id',       controller.remove);

module.exports = router;
