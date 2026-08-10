const express = require('express');
const deviceBiometricController = require('../controllers/device-biometric-controller');
const authenticate = require('../../../middlewares/authenticate');
const validateRequest = require('../../../middlewares/validate-request');
const {
  beginRegistrationValidator,
  finishRegistrationValidator,
  beginAuthenticationValidator,
  finishAuthenticationValidator,
  deleteCredentialValidator,
} = require('../validators/device-biometric-validator');

const router = express.Router();

// Require authentication for all device biometric routes
router.use(authenticate);

router.post(
  '/device-biometric/registration/options',
  beginRegistrationValidator,
  validateRequest,
  deviceBiometricController.beginRegistration
);

router.post(
  '/device-biometric/registration/verification',
  finishRegistrationValidator,
  validateRequest,
  deviceBiometricController.finishRegistration
);

router.post(
  '/device-biometric/authentication/options',
  beginAuthenticationValidator,
  validateRequest,
  deviceBiometricController.beginAuthentication
);

router.post(
  '/device-biometric/authentication/verification',
  finishAuthenticationValidator,
  validateRequest,
  deviceBiometricController.finishAuthentication
);

router.get(
  '/device-biometric/credentials',
  deviceBiometricController.getCredentials
);

router.delete(
  '/device-biometric/credentials/:id',
  deleteCredentialValidator,
  validateRequest,
  deviceBiometricController.deleteCredential
);

module.exports = router;
