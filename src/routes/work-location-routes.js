const express = require('express');
const workLocationController = require('../controllers/work-location-controller');
const authenticate = require('../middlewares/authenticate');
const authorizeMinRole = require('../middlewares/authorizeMinRole');
const validateRequest = require('../middlewares/validate-request');
const {
  workLocationQueryValidator,
  createWorkLocationValidator,
  updateWorkLocationValidator,
  updateWorkLocationStatusValidator,
  locationIdParamValidator
} = require('../validators/work-location-validator');
const ROLE = require('../constants/role.constants');

const router = express.Router();

router.use(authenticate);

router.get(
  '/admin/work-locations',
  authorizeMinRole(ROLE.MANAGER),
  workLocationQueryValidator,
  validateRequest,
  workLocationController.getWorkLocations
);

router.get(
  '/admin/work-locations/:id',
  authorizeMinRole(ROLE.MANAGER),
  locationIdParamValidator,
  validateRequest,
  workLocationController.getWorkLocationById
);

router.post(
  '/admin/work-locations',
  authorizeMinRole(ROLE.ADMIN),
  createWorkLocationValidator,
  validateRequest,
  workLocationController.createWorkLocation
);

router.post(
  '/admin/work-locations/bulk-delete',
  authorizeMinRole(ROLE.ADMIN),
  workLocationController.bulkDeleteWorkLocations
);

router.put(
  '/admin/work-locations/:id',
  authorizeMinRole(ROLE.ADMIN),
  updateWorkLocationValidator,
  validateRequest,
  workLocationController.updateWorkLocation
);

router.patch(
  '/admin/work-locations/:id/status',
  authorizeMinRole(ROLE.ADMIN),
  updateWorkLocationStatusValidator,
  validateRequest,
  workLocationController.updateWorkLocationStatus
);

module.exports = router;
