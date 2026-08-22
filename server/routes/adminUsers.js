const express = require('express');
const router = express.Router();
const controller = require('../controllers/adminUsers.controller');

router.get('/', controller.getAll);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

// MFA — self-service only, always acts on the calling superadmin's own
// account (no :id — see adminUsers.controller.js).
router.get('/mfa/status', controller.mfaStatus);
router.post('/mfa/setup', controller.mfaSetup);
router.post('/mfa/confirm', controller.mfaConfirm);
router.post('/mfa/disable', controller.mfaDisable);

// MFA — superadmin acting on SOMEONE ELSE's account (forces/lifts the
// mfaRequired policy; :id is the target, never the caller — see the
// self-guard in adminUsers.controller.js#setMfaRequired).
router.put('/:id/mfa-required', controller.setMfaRequired);

module.exports = router;
