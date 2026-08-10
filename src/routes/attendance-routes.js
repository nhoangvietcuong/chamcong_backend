const express = require('express');
const attendanceController = require('../controllers/attendance-controller');
const attendanceOvertimeController = require('../controllers/attendance-ot-controller');
const offlineAttendanceReviewController = require('../controllers/offline-attendance-review-controller');
const authenticate = require('../middlewares/authenticate');
const authorizeMinRole = require('../middlewares/authorizeMinRole');
const validateRequest = require('../middlewares/validate-request');
const attendanceUpload = require('../middlewares/attendance-upload');
const faceQualityLivenessMiddleware = require('../middlewares/face-quality-liveness.middleware');
const {
  checkInCheckOutValidator,
  checkInCheckOutOtValidator,
  attendanceHistoryQueryValidator,
  adminAttendanceQueryValidator,
  reviewBodyValidator,
  reviewQueueQueryValidator,
  offlineSyncValidator,
  offlineReviewQueryValidator,
  offlineRejectValidator,
  offlineApproveValidator,
  getAttendancePhotosValidator,
  getEmployeePhotosValidator,
} = require('../validators/attendance-validator');
const ROLE = require('../constants/role.constants');

const router = express.Router();

// All attendance routes require valid Access Token & session authentication
router.use(authenticate);

router.post(
  '/attendance/check-in',
  attendanceUpload,
  checkInCheckOutValidator,
  validateRequest,
  faceQualityLivenessMiddleware,
  attendanceController.checkIn
);

router.post(
  '/attendance/check-out',
  attendanceUpload,
  checkInCheckOutValidator,
  validateRequest,
  faceQualityLivenessMiddleware,
  attendanceController.checkOut
);

// Overtime Attendance Check-in / Check-out
router.post(
  '/attendance/overtime/check-in',
  attendanceUpload,
  checkInCheckOutOtValidator,
  validateRequest,
  faceQualityLivenessMiddleware,
  attendanceOvertimeController.checkIn
);

router.post(
  '/attendance/overtime/check-out',
  attendanceUpload,
  checkInCheckOutOtValidator,
  validateRequest,
  faceQualityLivenessMiddleware,
  attendanceOvertimeController.checkOut
);

// Offline Attendance Synchronization Endpoint
router.post(
  '/attendance/offline-sync',
  attendanceUpload,
  offlineSyncValidator,
  validateRequest,
  faceQualityLivenessMiddleware,
  attendanceController.offlineSync
);

router.get('/attendance/today', attendanceController.getTodayState);

router.get(
  '/attendance/history',
  attendanceHistoryQueryValidator,
  validateRequest,
  attendanceController.getHistory
);

router.get(
  '/admin/attendance',
  authorizeMinRole(ROLE.MANAGER),
  adminAttendanceQueryValidator,
  validateRequest,
  attendanceController.getAdminAttendance
);

router.get(
  '/admin/attendance/review-queue',
  authorizeMinRole(ROLE.MANAGER),
  reviewQueueQueryValidator,
  validateRequest,
  attendanceController.getReviewQueue
);

router.patch(
  '/admin/attendance/:attendanceId/review',
  authorizeMinRole(ROLE.MANAGER),
  reviewBodyValidator,
  validateRequest,
  attendanceController.reviewAttendance
);

// Offline Attendance Review Workflow endpoints
router.get(
  '/admin/offline-attendance',
  authorizeMinRole(ROLE.MANAGER),
  offlineReviewQueryValidator,
  validateRequest,
  offlineAttendanceReviewController.getReviewList
);

router.get(
  '/admin/offline-attendance/:attendanceId',
  authorizeMinRole(ROLE.MANAGER),
  offlineAttendanceReviewController.getReviewDetail
);

router.patch(
  '/admin/offline-attendance/:attendanceId/approve',
  authorizeMinRole(ROLE.MANAGER),
  offlineApproveValidator,
  validateRequest,
  offlineAttendanceReviewController.approveAttendance
);

router.patch(
  '/admin/offline-attendance/:attendanceId/reject',
  authorizeMinRole(ROLE.MANAGER),
  offlineRejectValidator,
  validateRequest,
  offlineAttendanceReviewController.rejectAttendance
);

router.get(
  '/admin/attendance/:attendanceId/photos',
  authorizeMinRole(ROLE.MANAGER),
  getAttendancePhotosValidator,
  validateRequest,
  attendanceController.getAttendancePhotos
);

router.get(
  '/admin/employees/:employeeId/photos',
  authorizeMinRole(ROLE.MANAGER),
  getEmployeePhotosValidator,
  validateRequest,
  attendanceController.getEmployeePhotos
);

module.exports = router;
