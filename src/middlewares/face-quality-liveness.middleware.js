const fs = require('fs');
const aiEngine = require('../modules/face-recognition/ai-engine');
const logger = require('../utils/logger');
const { BadRequestError, ForbiddenError, ValidationError } = require('../errors/app-error');
const SYSTEM_ACTION = require('../constants/system-action.constants');

module.exports = async function faceQualityLivenessMiddleware(req, res, next) {
  try {
    const checkQuality = process.env.ENABLE_FACE_QUALITY_ASSESSMENT === 'true';
    const checkLiveness = process.env.ENABLE_LIVENESS_DETECTION === 'true';

    // If Offline Sync, No-GPS technical fallback or both flags are disabled, bypass AI face quality/liveness checks completely
    const isOfflineSyncRoute = (req.path && req.path.includes('offline-sync')) || (req.originalUrl && req.originalUrl.includes('offline-sync'));
    const isOfflineSyncFlag = req.body?.isOfflineSync === 'true' || req.body?.isOfflineSync === true;
    const isNoGpsFlag = req.body?.isNoGps === 'true' || req.body?.isNoGps === true || req.body?.isNoGps === '1';

    if (isOfflineSyncRoute || isOfflineSyncFlag || isNoGpsFlag || (!checkQuality && !checkLiveness)) {
      return next();
    }

    // Only intercept requests containing uploaded files
    if (!req.file || !req.file.path) {
      return next();
    }

    const employeeId = req.auth?.employeeId || null;
    const accountId = req.auth?.accountId || null;
    const deviceFingerprint = req.auth?.deviceFingerprint || null;
    const ipAddress = req.ip || req.socket.remoteAddress || null;

    let imageBuffer;
    try {
      imageBuffer = fs.readFileSync(req.file.path);
    } catch (err) {
      logger.warn(`⚠️ Middleware failed to read uploaded file: ${err.message}. Passing to legacy flow.`);
      return next();
    }

    // 1. Face Quality Assessment
    if (checkQuality) {
      try {
        const qualityResult = await aiEngine.qualityAnalyzer.analyze(imageBuffer, req.file.originalname);
        if (!qualityResult.passed) {
          // Log specific quality check failure to system logs
          await aiEngine.auditLogger.log({
            employeeId,
            accountId,
            action: SYSTEM_ACTION.QUALITY_FAILED || 'QUALITY_FAILED',
            description: `Kiểm tra chất lượng khuôn mặt thất bại (Middleware): ${qualityResult.message}`,
            deviceFingerprint,
            ipAddress,
            status: 'FAILED'
          }).catch(() => { });

          throw new BadRequestError(qualityResult.message, qualityResult.reasonCode || 'LOW_FACE_QUALITY');
        }
      } catch (err) {
        // Graceful Fallback: propagate specific client validation errors (<500), bypass internal/service errors (>=500)
        if (err.statusCode && err.statusCode < 500) {
          throw err;
        }
        logger.warn(`⚠️ Face Quality Assessment internal error: ${err.message}. Falling back to baseline attendance check.`);
      }
    }

    // 2. Liveness Detection
    if (checkLiveness) {
      try {
        const livenessResult = await aiEngine.livenessDetector.verify(imageBuffer, req.file.originalname);
        if (!livenessResult.passed) {
          // Log liveness failure
          let action = SYSTEM_ACTION.LIVENESS_FAIL || 'LIVENESS_FAIL';
          if (livenessResult.reason === 'NO_FACE_DETECTED') action = SYSTEM_ACTION.LIVENESS_FAIL;
          else if (livenessResult.reason === 'MULTIPLE_FACES_DETECTED') action = SYSTEM_ACTION.LIVENESS_FAIL;
          else if (livenessResult.reason === 'FACE_TOO_SMALL') action = SYSTEM_ACTION.FACE_QUALITY_FAILED || 'FACE_QUALITY_FAILED';
          else if (livenessResult.reason === 'LOW_FACE_QUALITY') action = SYSTEM_ACTION.FACE_QUALITY_FAILED || 'FACE_QUALITY_FAILED';

          await aiEngine.auditLogger.log({
            employeeId,
            accountId,
            action,
            description: `Xác thực sinh trắc học (Liveness) thất bại (Middleware): ${livenessResult.reason}`,
            deviceFingerprint,
            ipAddress,
            status: 'FAILED'
          }).catch(() => { });

          let errorCode = 'LIVENESS_FAILED';
          if (livenessResult.reason === 'NO_FACE_DETECTED') errorCode = 'NO_FACE_DETECTED';
          else if (livenessResult.reason === 'MULTIPLE_FACES_DETECTED') errorCode = 'MULTIPLE_FACES_DETECTED';
          else if (livenessResult.reason === 'FACE_TOO_SMALL') errorCode = 'FACE_TOO_SMALL';
          else if (livenessResult.reason === 'LOW_FACE_QUALITY') errorCode = 'LOW_FACE_QUALITY';
          else if (livenessResult.reason === 'HEAD_POSE_INVALID') errorCode = 'HEAD_POSE_INVALID';
          else if (livenessResult.reason === 'EYE_BLINK_NOT_DETECTED') errorCode = 'EYE_BLINK_NOT_DETECTED';
          else if (livenessResult.reason === 'FACE_ORIENTATION_INVALID') errorCode = 'FACE_ORIENTATION_INVALID';
          else if (livenessResult.reason === 'OCCLUSION_DETECTED') errorCode = 'OCCLUSION_DETECTED';
          else if (livenessResult.reason === 'SPOOF_DETECTED') errorCode = 'SPOOF_DETECTED';

          throw new ValidationError(`Xác thực Liveness thất bại: ${livenessResult.reason || errorCode}`, errorCode);
        }
      } catch (err) {
        if (err.statusCode && err.statusCode < 500) {
          throw err;
        }
        logger.warn(`⚠️ Liveness Detection internal error: ${err.message}. Falling back to baseline attendance check.`);
      }
    }

    next();
  } catch (err) {
    // If validation error was thrown, clean up uploaded file before moving to error handler
    if (req.file && req.file.filename) {
      try {
        const fileStorageService = require('../services/file-storage-service');
        await fileStorageService.deleteFile(req.file.filename).catch(() => { });
      } catch (cleanupErr) {
        logger.warn(`Failed to clean up uploaded file after validation failure: ${cleanupErr.message}`);
      }
    }
    next(err);
  }
};
