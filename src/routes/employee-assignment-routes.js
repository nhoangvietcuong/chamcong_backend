const express = require('express');
const employeeAssignmentController = require('../controllers/employee-assignment-controller');
const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');
const validateRequest = require('../middlewares/validate-request');
const {
  employeeAssignmentQueryValidator,
  assignmentIdParamValidator
} = require('../validators/assignment-validator');
const ROLE = require('../constants/role.constants');

const router = express.Router();

router.use(authenticate);

router.get(
  '/employee/assignments/today',
  authorize(ROLE.EMPLOYEE),
  employeeAssignmentController.getTodayAssignment
);

router.get(
  '/employee/assignments',
  authorize(ROLE.EMPLOYEE),
  employeeAssignmentQueryValidator,
  validateRequest,
  employeeAssignmentController.getPersonalAssignmentsHistory
);

router.get(
  '/employee/assignments/:id',
  authorize(ROLE.EMPLOYEE),
  assignmentIdParamValidator,
  validateRequest,
  employeeAssignmentController.getPersonalAssignmentById
);

module.exports = router;
