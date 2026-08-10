const express = require('express');
const authController = require('../controllers/auth-controller');
const authenticate = require('../middlewares/authenticate');
const authorizeMinRole = require('../middlewares/authorizeMinRole');
const validateRequest = require('../middlewares/validate-request');
const { loginValidator, refreshTokenValidator } = require('../validators/auth-validator');
const ROLE = require('../constants/role.constants');

const router = express.Router();

router.post('/auth/login', loginValidator, validateRequest, authController.login);
router.post('/auth/refresh-token', refreshTokenValidator, validateRequest, authController.refreshToken);

// Forgot Password Flow (Public / Unauthenticated)
router.post('/auth/forgot-password/request-otp', authController.requestForgotPasswordOtp);
router.post('/auth/forgot-password/verify-otp', authController.verifyForgotPasswordOtp);
router.post('/auth/forgot-password/reset', authController.resetPassword);

// Authenticated Routes
router.post('/auth/logout', authenticate, authController.logout);
router.get('/auth/me', authenticate, authController.getMe);
router.put('/auth/change-password', authenticate, authController.changePassword);
router.get('/auth/admin-only', authenticate, authorizeMinRole(ROLE.ADMIN), authController.adminOnly);

module.exports = router;
