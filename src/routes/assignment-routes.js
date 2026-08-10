const express = require('express');
const assignmentController = require('../controllers/assignment-controller');
const authenticate = require('../middlewares/authenticate');
const authorizeMinRole = require('../middlewares/authorizeMinRole');
const validateRequest = require('../middlewares/validate-request');
const {
  assignmentQueryValidator,
  createAssignmentValidator,
  updateAssignmentValidator,
  cancelAssignmentValidator,
  assignmentIdParamValidator,
  calendarQueryValidator,
  bulkCreateAssignmentValidator,
  copyAssignmentValidator,
  bulkDeleteAssignmentValidator,
  bulkUpdateLocationValidator,
  bulkUpdateSelectedAssignmentsValidator,
  bulkDeleteSelectedAssignmentsValidator
} = require('../validators/assignment-validator');
const ROLE = require('../constants/role.constants');

const router = express.Router();

router.use(authenticate);

router.get(
  '/admin/assignments',
  authorizeMinRole(ROLE.MANAGER),
  assignmentQueryValidator,
  validateRequest,
  assignmentController.getAssignments
);

router.get(
  '/admin/assignments/calendar',
  authorizeMinRole(ROLE.MANAGER),
  calendarQueryValidator,
  validateRequest,
  assignmentController.getAssignmentCalendar
);

router.post(
  '/admin/assignments/bulk',
  authorizeMinRole(ROLE.MANAGER),
  bulkCreateAssignmentValidator,
  validateRequest,
  assignmentController.createBulkAssignments
);

router.post(
  '/admin/assignments/copy',
  authorizeMinRole(ROLE.MANAGER),
  copyAssignmentValidator,
  validateRequest,
  assignmentController.copyAssignments
);

router.post(
  '/admin/assignments/bulk-delete',
  authorizeMinRole(ROLE.MANAGER),
  bulkDeleteAssignmentValidator,
  validateRequest,
  assignmentController.bulkDeleteAssignments
);

router.post(
  '/admin/assignments/bulk-update-location',
  authorizeMinRole(ROLE.MANAGER),
  bulkUpdateLocationValidator,
  validateRequest,
  assignmentController.bulkUpdateLocation
);

router.post(
  '/admin/assignments/bulk-update-selected',
  authorizeMinRole(ROLE.MANAGER),
  bulkUpdateSelectedAssignmentsValidator,
  validateRequest,
  assignmentController.bulkUpdateSelected
);

router.post(
  '/admin/assignments/bulk-delete-selected',
  authorizeMinRole(ROLE.MANAGER),
  bulkDeleteSelectedAssignmentsValidator,
  validateRequest,
  assignmentController.bulkDeleteSelected
);

router.get(
  '/admin/assignments/:id',
  authorizeMinRole(ROLE.MANAGER),
  assignmentIdParamValidator,
  validateRequest,
  assignmentController.getAssignmentById
);

router.post(
  '/admin/assignments',
  authorizeMinRole(ROLE.MANAGER),
  createAssignmentValidator,
  validateRequest,
  assignmentController.createAssignment
);

router.put(
  '/admin/assignments/:id',
  authorizeMinRole(ROLE.MANAGER),
  updateAssignmentValidator,
  validateRequest,
  assignmentController.updateAssignment
);

router.patch(
  '/admin/assignments/:id/cancel',
  authorizeMinRole(ROLE.MANAGER),
  cancelAssignmentValidator,
  validateRequest,
  assignmentController.cancelAssignment
);

module.exports = router;
