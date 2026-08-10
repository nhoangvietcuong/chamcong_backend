const express = require('express');
const deviceAdminController = require('../controllers/device-admin-controller');
const authenticate = require('../middlewares/authenticate');
const authorizeMinRole = require('../middlewares/authorizeMinRole');
const ROLE = require('../constants/role.constants');

const router = express.Router();

// Apply auth middlewares
router.use(authenticate);

router.get('/admin/registered-devices', authorizeMinRole(ROLE.MANAGER), deviceAdminController.getDevices);
router.patch('/admin/registered-devices/:sessionId/status', authorizeMinRole(ROLE.MANAGER), deviceAdminController.updateStatus);
router.delete('/admin/registered-devices/:sessionId', authorizeMinRole(ROLE.MANAGER), deviceAdminController.revokeDevice);
router.get('/admin/employees/:employeeId/devices', authorizeMinRole(ROLE.MANAGER), deviceAdminController.getEmployeeDevicesAdmin);

module.exports = router;
