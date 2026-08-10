const express = require('express');
const deviceBiometricController = require('../modules/device-biometric/controllers/device-biometric-controller');
const authenticate = require('../middlewares/authenticate');
const authorizeMinRole = require('../middlewares/authorizeMinRole');
const ROLE = require('../constants/role.constants');

const router = express.Router();

// Apply auth middlewares
router.use(authenticate);

router.get('/admin/webauthn-credentials', authorizeMinRole(ROLE.MANAGER), deviceBiometricController.getAdminCredentials);
router.patch('/admin/webauthn-credentials/:credentialId/status', authorizeMinRole(ROLE.MANAGER), deviceBiometricController.updateStatusAdmin);
router.delete('/admin/webauthn-credentials/:credentialId', authorizeMinRole(ROLE.MANAGER), deviceBiometricController.revokeCredentialAdmin);

module.exports = router;
