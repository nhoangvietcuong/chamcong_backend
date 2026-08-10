const express = require('express');
const departmentController = require('../controllers/department-controller');
const authenticate = require('../middlewares/authenticate');
const authorizeMinRole = require('../middlewares/authorizeMinRole');
const validateRequest = require('../middlewares/validate-request');
const {
  departmentQueryValidator,
  createDepartmentValidator,
  updateDepartmentValidator,
  updateDepartmentStatusValidator
} = require('../validators/department-validator');
const ROLE = require('../constants/role.constants');

const router = express.Router();

router.use(authenticate);

router.get('/admin/departments', authorizeMinRole(ROLE.MANAGER), departmentQueryValidator, validateRequest, departmentController.getDepartments);
router.get('/admin/departments/:id', authorizeMinRole(ROLE.MANAGER), departmentController.getDepartmentById);

router.post('/admin/departments', authorizeMinRole(ROLE.ADMIN), createDepartmentValidator, validateRequest, departmentController.createDepartment);
router.put('/admin/departments/:id', authorizeMinRole(ROLE.ADMIN), updateDepartmentValidator, validateRequest, departmentController.updateDepartment);
router.patch('/admin/departments/:id/status', authorizeMinRole(ROLE.ADMIN), updateDepartmentStatusValidator, validateRequest, departmentController.updateDepartmentStatus);

module.exports = router;
