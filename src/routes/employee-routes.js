const express = require('express');
const employeeController = require('../controllers/employee-controller');
const accountController = require('../controllers/account-controller');
const authenticate = require('../middlewares/authenticate');
const authorizeMinRole = require('../middlewares/authorizeMinRole');
const validateRequest = require('../middlewares/validate-request');
const {
  employeeQueryValidator,
  createEmployeeValidator,
  createEmployeeWithAccountValidator,
  updateEmployeeValidator,
  updateEmployeeStatusValidator,
  updateSelfProfileValidator,
  changeSelfPasswordValidator
} = require('../validators/employee-validator');
const { createAccountValidator } = require('../validators/account-validator');
const ROLE = require('../constants/role.constants');
const avatarUpload = require('../middlewares/avatar-upload');

const router = express.Router();

router.use(authenticate);

// Self profile routes (for authenticated employee)
router.put('/employee/profile', updateSelfProfileValidator, validateRequest, employeeController.updateSelfProfile);
router.put('/employee/profile/password', changeSelfPasswordValidator, validateRequest, employeeController.updateSelfPassword);
router.post('/employee/profile/avatar', avatarUpload, employeeController.updateSelfAvatar);

router.get('/admin/employees', authorizeMinRole(ROLE.MANAGER), employeeQueryValidator, validateRequest, employeeController.getEmployees);
router.get('/admin/employees/next-code', authorizeMinRole(ROLE.MANAGER), employeeController.getNextCode);
router.get('/admin/employees/:id', authorizeMinRole(ROLE.MANAGER), employeeController.getEmployeeById);

router.post('/admin/employees', authorizeMinRole(ROLE.ADMIN), createEmployeeValidator, validateRequest, employeeController.createEmployee);
router.post('/admin/employees/with-account', authorizeMinRole(ROLE.ADMIN), createEmployeeWithAccountValidator, validateRequest, employeeController.createEmployeeWithAccount);
router.put('/admin/employees/:id', authorizeMinRole(ROLE.ADMIN), updateEmployeeValidator, validateRequest, employeeController.updateEmployee);
router.patch('/admin/employees/:id/status', authorizeMinRole(ROLE.ADMIN), updateEmployeeStatusValidator, validateRequest, employeeController.updateEmployeeStatus);

router.post('/admin/employees/:employeeId/account', authorizeMinRole(ROLE.ADMIN), createAccountValidator, validateRequest, accountController.createAccount);
router.delete('/admin/employees/bulk-delete', authorizeMinRole(ROLE.ADMIN), employeeController.bulkDeleteEmployees);

module.exports = router;
