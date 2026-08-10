const express = require('express');
const faceProfileController = require('../modules/face-recognition/controllers/face-profile-controller');
const authenticate = require('../middlewares/authenticate');
const authorizeMinRole = require('../middlewares/authorizeMinRole');
const ROLE = require('../constants/role.constants');

const router = express.Router();

// Apply auth middlewares
const attendanceUpload = require('../middlewares/attendance-upload');

router.use(authenticate);

router.get('/admin/face-profiles', authorizeMinRole(ROLE.MANAGER), faceProfileController.getAdminFaceProfiles);
router.get('/admin/face-profiles/employee/:employeeId', authorizeMinRole(ROLE.MANAGER), faceProfileController.getProfileByEmployeeIdAdmin);
router.patch('/admin/face-profiles/:profileId/status', authorizeMinRole(ROLE.MANAGER), faceProfileController.updateStatusAdmin);
router.delete('/admin/face-profiles/:profileId', authorizeMinRole(ROLE.MANAGER), faceProfileController.deleteProfileAdmin);

// Admin manual registration/updating for an employee
router.post('/admin/face-profiles/employee/:employeeId/register', authorizeMinRole(ROLE.MANAGER), attendanceUpload, faceProfileController.registerFaceAdmin);
router.put('/admin/face-profiles/employee/:employeeId', authorizeMinRole(ROLE.MANAGER), attendanceUpload, faceProfileController.updateFaceAdmin);

// New client-side calculated embeddings endpoints for Admin
router.post('/admin/face-profiles/employee/:employeeId/register-embedding', authorizeMinRole(ROLE.MANAGER), faceProfileController.registerEmbeddingAdmin);
router.put('/admin/face-profiles/employee/:employeeId/update-embedding', authorizeMinRole(ROLE.MANAGER), faceProfileController.updateEmbeddingAdmin);

router.delete('/admin/face-profiles/employee/:employeeId', authorizeMinRole(ROLE.MANAGER), faceProfileController.deleteProfileByEmployeeIdAdmin);

module.exports = router;
