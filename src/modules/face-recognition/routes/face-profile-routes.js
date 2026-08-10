const express = require('express');
const faceProfileController = require('../controllers/face-profile-controller');
const authenticate = require('../../../middlewares/authenticate');
const attendanceUpload = require('../../../middlewares/attendance-upload');
const {
  registerFaceValidator,
  updateFaceValidator,
  verifyFaceValidator
} = require('../validators/face-profile-validator');

const router = express.Router();

// All face recognition routes require authentication
router.use(authenticate);

router.post(
  '/face/register',
  attendanceUpload,
  registerFaceValidator,
  faceProfileController.registerFace
);

router.put(
  '/face',
  attendanceUpload,
  updateFaceValidator,
  faceProfileController.updateFace
);

router.delete(
  '/face',
  faceProfileController.deleteFace
);

router.get(
  '/face',
  faceProfileController.getProfile
);

router.get(
  '/face/status',
  faceProfileController.getStatus
);

router.get(
  '/face/health',
  faceProfileController.getHealthStatus
);

router.post(
  '/face/verify',
  attendanceUpload,
  verifyFaceValidator,
  faceProfileController.verifyFace
);

// New endpoints for client-calculated embeddings (WebGL)
router.post(
  '/face/verify-embedding',
  faceProfileController.verifyEmbedding
);

router.post(
  '/face/register-embedding',
  faceProfileController.registerEmbedding
);

router.put(
  '/face/update-embedding',
  faceProfileController.updateEmbedding
);

module.exports = router;
