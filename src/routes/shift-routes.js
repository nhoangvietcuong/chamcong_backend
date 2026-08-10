const express = require('express');
const shiftController = require('../controllers/shift-controller');
const authenticate = require('../middlewares/authenticate');
const authorizeMinRole = require('../middlewares/authorizeMinRole');
const validateRequest = require('../middlewares/validate-request');
const {
  shiftQueryValidator,
  createShiftValidator,
  updateShiftValidator,
  shiftIdParamValidator
} = require('../validators/shift-validator');
const ROLE = require('../constants/role.constants');

const router = express.Router();

router.use(authenticate);

router.get(
  '/admin/work-shifts',
  authorizeMinRole(ROLE.MANAGER),
  shiftQueryValidator,
  validateRequest,
  shiftController.getShifts
);

router.get(
  '/admin/work-shifts/:id',
  authorizeMinRole(ROLE.MANAGER),
  shiftIdParamValidator,
  validateRequest,
  shiftController.getShiftById
);

router.post(
  '/admin/work-shifts',
  authorizeMinRole(ROLE.MANAGER),
  createShiftValidator,
  validateRequest,
  shiftController.createShift
);

router.put(
  '/admin/work-shifts/:id',
  authorizeMinRole(ROLE.MANAGER),
  updateShiftValidator,
  validateRequest,
  shiftController.updateShift
);

router.delete(
  '/admin/work-shifts/:id',
  authorizeMinRole(ROLE.MANAGER),
  shiftIdParamValidator,
  validateRequest,
  shiftController.deleteShift
);

module.exports = router;
