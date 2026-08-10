const express = require('express');
const accountController = require('../controllers/account-controller');
const authenticate = require('../middlewares/authenticate');
const authorizeMinRole = require('../middlewares/authorizeMinRole');
const validateRequest = require('../middlewares/validate-request');
const {
  updateRoleValidator,
  updateAccountStatusValidator,
  resetPasswordValidator,
  updateUsernameValidator
} = require('../validators/account-validator');
const ROLE = require('../constants/role.constants');

const router = express.Router();

router.use(authenticate);

router.get('/admin/accounts', authorizeMinRole(ROLE.MANAGER), accountController.getAccounts);
router.patch('/admin/accounts/:accountId/role', authorizeMinRole(ROLE.SUPMANAGER), updateRoleValidator, validateRequest, accountController.updateAccountRole);
router.patch('/admin/accounts/:accountId/status', authorizeMinRole(ROLE.ADMIN), updateAccountStatusValidator, validateRequest, accountController.updateAccountStatus);
router.patch('/admin/accounts/:accountId/reset-password', authorizeMinRole(ROLE.ADMIN), resetPasswordValidator, validateRequest, accountController.resetPassword);
router.patch('/admin/accounts/:accountId/username', authorizeMinRole(ROLE.ADMIN), updateUsernameValidator, validateRequest, accountController.updateUsername);

module.exports = router;

