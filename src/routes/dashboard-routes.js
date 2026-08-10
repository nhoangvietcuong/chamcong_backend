const express = require('express');
const dashboardController = require('../controllers/dashboard-controller');
const authenticate = require('../middlewares/authenticate');
const authorizeMinRole = require('../middlewares/authorizeMinRole');
const ROLE = require('../constants/role.constants');

const router = express.Router();

// Apply authentication middleware
router.use(authenticate);

router.get('/admin/dashboard/stats', authorizeMinRole(ROLE.MANAGER), dashboardController.getStats);
router.get('/admin/dashboard/charts', authorizeMinRole(ROLE.MANAGER), dashboardController.getCharts);

router.get('/admin/system-logs', authorizeMinRole(ROLE.MANAGER), dashboardController.getSystemLogs);
router.get('/admin/security/metrics', authorizeMinRole(ROLE.ADMIN), dashboardController.getSecurityMetrics);

router.get('/admin/audit-logs', authorizeMinRole(ROLE.SUPMANAGER), dashboardController.getAuditLogs);
router.get('/admin/settings', authorizeMinRole(ROLE.SUPMANAGER), dashboardController.getSystemSettings);
router.put('/admin/settings', authorizeMinRole(ROLE.SUPMANAGER), dashboardController.updateSystemSettings);

module.exports = router;
