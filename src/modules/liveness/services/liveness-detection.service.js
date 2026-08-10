const mediaPipeService = require('../../face-recognition/services/mediapipe.service');
const livenessConfig = require('../config/liveness-config');
const systemLogRepository = require('../../../repositories/system-log-repository');
const SYSTEM_ACTION = require('../../../constants/system-action.constants');
const { ValidationError } = require('../../../errors/app-error');

class LivenessDetectionService {
  /**
   * Orchestrates the liveness and spoofing verification process.
   */
  async verifyLiveness(employeeId, fileBuffer, filename, dbClient = null) {
    // 1. Log start of liveness check
    await systemLogRepository.createLog({
      employeeId,
      action: SYSTEM_ACTION.LIVENESS_VERIFY,
      description: `Bắt đầu kiểm tra Liveness cho file: ${filename}`,
      status: 'SUCCESS'
    }, dbClient).catch(() => {});

    try {
      // 2. Perform face mesh detection
      const meshRes = await mediaPipeService.detectFaceMesh(fileBuffer, filename);

      // Default checks if no face is detected or multiple faces are found
      if (!meshRes.detected || meshRes.faceCount !== 1 || meshRes.reason) {
        let action = SYSTEM_ACTION.LIVENESS_FAIL;
        let description = 'Xác thực Liveness thất bại: ';
        let reason = meshRes.reason;

        if (!meshRes.detected) {
          action = SYSTEM_ACTION.LIVENESS_FAIL;
          description += 'Không phát hiện thấy khuôn mặt';
          reason = 'NO_FACE_DETECTED';
        } else if (meshRes.faceCount > 1) {
          action = SYSTEM_ACTION.LIVENESS_FAIL;
          description += 'Phát hiện nhiều khuôn mặt';
          reason = 'MULTIPLE_FACES_DETECTED';
        } else if (meshRes.reason === 'FACE_TOO_SMALL') {
          action = SYSTEM_ACTION.FACE_QUALITY_FAILED;
          description += 'Khuôn mặt quá nhỏ';
        } else if (meshRes.reason === 'LOW_FACE_QUALITY') {
          action = SYSTEM_ACTION.FACE_QUALITY_FAILED;
          description += 'Chất lượng ảnh quá thấp';
        }

        await systemLogRepository.createLog({
          employeeId,
          action,
          description,
          status: 'FAILED'
        }, dbClient).catch(() => {});

        return {
          passed: false,
          confidence: 0.0,
          reason: reason || 'NO_FACE_DETECTED',
          details: {
            faceCount: meshRes.faceCount,
            headPose: { passed: false, yaw: 0, pitch: 0, roll: 0 },
            blink: { passed: false },
            orientation: { passed: false, label: 'UNKNOWN' },
            occlusion: { passed: false, hasMask: false, hasGlasses: false },
            spoof: { passed: false, type: 'UNKNOWN', confidence: 0.0 }
          }
        };
      }

      // 3. Perform other checks conditionally based on configuration
      let headPoseRes = { passed: true, yaw: 0, pitch: 0, roll: 0 };
      if (livenessConfig.enableHeadPose) {
        headPoseRes = mediaPipeService.estimateHeadPose(meshRes.mesh, filename);
      }

      let blinkRes = { passed: true };
      if (livenessConfig.enableEyeBlink) {
        blinkRes = mediaPipeService.detectEyeBlink(meshRes.mesh, filename);
      }

      const orientationRes = mediaPipeService.detectFaceOrientation(meshRes.mesh, filename);
      const occlusionRes = mediaPipeService.detectOcclusion(meshRes.mesh, filename);

      let spoofRes = { passed: true, type: 'REAL', confidence: 1.0 };
      if (livenessConfig.enableSpoofDetection) {
        spoofRes = mediaPipeService.detectSpoof(fileBuffer, filename);
      }

      // 4. Collate all checks into final evaluation
      const evalRes = mediaPipeService.evaluateLiveness(
        meshRes,
        headPoseRes,
        blinkRes,
        orientationRes,
        occlusionRes,
        spoofRes,
        filename
      );

      // 5. Write specific audit logs based on failure reasons
      if (!evalRes.passed) {
        await systemLogRepository.createLog({
          employeeId,
          action: SYSTEM_ACTION.LIVENESS_FAIL,
          description: `Xác thực Liveness thất bại: ${evalRes.reason}`,
          status: 'FAILED'
        }, dbClient).catch(() => {});

        // Log subcheck failures
        if (!headPoseRes.passed) {
          await systemLogRepository.createLog({
            employeeId,
            action: SYSTEM_ACTION.HEAD_POSE_INVALID,
            description: `Xác thực head pose thất bại (yaw: ${headPoseRes.yaw}, pitch: ${headPoseRes.pitch}, roll: ${headPoseRes.roll})`,
            status: 'FAILED'
          }, dbClient).catch(() => {});
        }
        if (!blinkRes.passed) {
          await systemLogRepository.createLog({
            employeeId,
            action: SYSTEM_ACTION.EYE_BLINK_INVALID,
            description: 'Xác thực chớp mắt thất bại',
            status: 'FAILED'
          }, dbClient).catch(() => {});
        }
        if (!orientationRes.passed) {
          await systemLogRepository.createLog({
            employeeId,
            action: SYSTEM_ACTION.FACE_ORIENTATION_INVALID,
            description: `Xác thực hướng mặt thất bại (label: ${orientationRes.label})`,
            status: 'FAILED'
          }, dbClient).catch(() => {});
        }
        if (!occlusionRes.passed) {
          await systemLogRepository.createLog({
            employeeId,
            action: SYSTEM_ACTION.OCCLUSION_DETECTED,
            description: 'Phát hiện vật cản che mặt (khẩu trang/kính râm)',
            status: 'FAILED'
          }, dbClient).catch(() => {});
        }
        if (!spoofRes.passed) {
          await systemLogRepository.createLog({
            employeeId,
            action: SYSTEM_ACTION.SPOOF_DETECTED,
            description: `Phát hiện giả mạo khuôn mặt (loại: ${spoofRes.type}, độ tin cậy: ${spoofRes.confidence})`,
            status: 'FAILED'
          }, dbClient).catch(() => {});
        }
      } else {
        // Liveness passed successfully
        await systemLogRepository.createLog({
          employeeId,
          action: SYSTEM_ACTION.LIVENESS_PASS,
          description: `Xác thực Liveness thành công (độ tin cậy: ${evalRes.confidence})`,
          status: 'SUCCESS'
        }, dbClient).catch(() => {});
      }

      return {
        passed: evalRes.passed,
        confidence: evalRes.confidence,
        reason: evalRes.reason,
        details: {
          faceCount: meshRes.faceCount,
          headPose: headPoseRes,
          blink: blinkRes,
          orientation: orientationRes,
          occlusion: occlusionRes,
          spoof: spoofRes
        }
      };
    } catch (err) {
      // Log MediaPipe framework level errors
      await systemLogRepository.createLog({
        employeeId,
        action: SYSTEM_ACTION.MEDIAPIPE_ERROR,
        description: `Lỗi MediaPipe khi xác thực Liveness: ${err.message}`,
        status: 'FAILED'
      }, dbClient).catch(() => {});
      throw err;
    }
  }
}

module.exports = new LivenessDetectionService();
