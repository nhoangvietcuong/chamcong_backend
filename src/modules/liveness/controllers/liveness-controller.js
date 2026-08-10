const livenessDetectionService = require('../services/liveness-detection.service');
const livenessValidator = require('../validators/liveness-validator');
const livenessConfig = require('../config/liveness-config');

class LivenessController {
  /**
   * Standalone endpoint to verify liveness/anti-spoofing from uploaded video or image file.
   * POST /api/v1/liveness/verify
   */
  async verifyLiveness(req, res, next) {
    try {
      // 1. Run validation checks
      await livenessValidator.validateRequest(req);

      const { employeeId } = req.body;
      const file = req.file;

      // 2. Perform liveness verification
      const result = await livenessDetectionService.verifyLiveness(
        parseInt(employeeId, 10),
        file.buffer,
        file.originalname
      );

      // 3. Return response
      return res.status(200).json({
        success: true,
        message: result.passed ? 'Xác thực Liveness thành công' : 'Xác thực Liveness thất bại',
        data: {
          passed: result.passed,
          confidence: result.confidence,
          reason: result.reason,
          details: result.details
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Standalone endpoint to check service configurations and health state.
   * GET /api/v1/liveness/status
   */
  async getStatus(req, res, next) {
    try {
      return res.status(200).json({
        success: true,
        message: 'Dịch vụ Liveness hoạt động bình thường',
        data: {
          status: 'RUNNING',
          model: 'face_landmarker',
          config: {
            livenessThreshold: livenessConfig.livenessThreshold,
            headPoseThreshold: livenessConfig.headPoseThreshold,
            maxFaceCount: livenessConfig.maxFaceCount,
            faceQualityThreshold: livenessConfig.faceQualityThreshold,
            enableEyeBlink: livenessConfig.enableEyeBlink,
            enableHeadPose: livenessConfig.enableHeadPose,
            enableSpoofDetection: livenessConfig.enableSpoofDetection
          }
        }
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new LivenessController();
