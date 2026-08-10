const express = require('express');
const otController = require('../controllers/ot-controller');
const authenticate = require('../middlewares/authenticate');
const authorizeMinRole = require('../middlewares/authorizeMinRole');
const validateRequest = require('../middlewares/validate-request');
const { createRequestValidator, rejectRequestValidator } = require('../validators/ot-validator');
const ROLE = require('../constants/role.constants');

const router = express.Router();

router.use(authenticate);

// Employee routes
router.post('/ot/requests', authorizeMinRole(ROLE.EMPLOYEE), createRequestValidator, validateRequest, otController.createRequest);
router.get('/ot/my-requests', authorizeMinRole(ROLE.EMPLOYEE), otController.getMyRequests);
router.delete('/ot/requests/:id', authorizeMinRole(ROLE.EMPLOYEE), otController.cancelRequest);

// Manager/Admin routes
router.get('/admin/ot/requests', authorizeMinRole(ROLE.MANAGER), otController.getAdminRequests);
router.patch('/admin/ot/requests/bulk-approve', authorizeMinRole(ROLE.MANAGER), otController.bulkApprove);
router.patch('/admin/ot/requests/bulk-reject', authorizeMinRole(ROLE.MANAGER), otController.bulkReject);
router.patch('/admin/ot/requests/:id/approve', authorizeMinRole(ROLE.MANAGER), otController.approveRequest);
router.patch('/admin/ot/requests/:id/reject', authorizeMinRole(ROLE.MANAGER), rejectRequestValidator, validateRequest, otController.rejectRequest);

module.exports = router;
