const express = require('express');
const leaveController = require('../controllers/leave-controller');
const authenticate = require('../middlewares/authenticate');
const authorizeMinRole = require('../middlewares/authorizeMinRole');
const ROLE = require('../constants/role.constants');

const leaveUpload = require('../middlewares/leave-upload');

const router = express.Router();

router.use(authenticate);

// Employee routes
router.post('/leave/requests', authorizeMinRole(ROLE.EMPLOYEE), leaveUpload, leaveController.createRequest);
router.get('/leave/my-requests', authorizeMinRole(ROLE.EMPLOYEE), leaveController.getMyRequests);
router.get('/leave/my-balance', authorizeMinRole(ROLE.EMPLOYEE), leaveController.getMyLeaveBalance);
router.get('/leave/requests/:id', authorizeMinRole(ROLE.EMPLOYEE), leaveController.getLeaveRequestDetails);
router.delete('/leave/requests/:id', authorizeMinRole(ROLE.EMPLOYEE), leaveController.cancelRequest);

// Manager/Admin routes
router.get('/admin/leave/requests', authorizeMinRole(ROLE.MANAGER), leaveController.getAdminRequests);

// Bulk approval routes — MUST be placed before /:id routes to avoid param conflict
router.patch('/admin/leave/requests/bulk-approve', authorizeMinRole(ROLE.ADMIN), leaveController.bulkApprove);
router.patch('/admin/leave/requests/bulk-reject', authorizeMinRole(ROLE.ADMIN), leaveController.bulkReject);

router.patch('/admin/leave/requests/:id/status', authorizeMinRole(ROLE.ADMIN), leaveController.approveOrReject);
router.get('/admin/leave/balances/:employeeId', authorizeMinRole(ROLE.SUPMANAGER), leaveController.getEmployeeLeaveBalance);
router.put('/admin/leave/balances/:employeeId', authorizeMinRole(ROLE.SUPMANAGER), leaveController.updateTotalLeaveDays);

// Support both styles for flexibility
router.patch('/admin/leave/requests/:id/approve', authorizeMinRole(ROLE.ADMIN), (req, res, next) => {
  req.body.status = 'APPROVED';
  leaveController.approveOrReject(req, res, next);
});
router.patch('/admin/leave/requests/:id/reject', authorizeMinRole(ROLE.ADMIN), (req, res, next) => {
  req.body.status = 'REJECTED';
  leaveController.approveOrReject(req, res, next);
});

module.exports = router;
