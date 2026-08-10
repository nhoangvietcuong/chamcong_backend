const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const otRepository = require('../repositories/ot-repository');
const attendanceRepository = require('../repositories/attendance-repository');
const attendanceOtRepository = require('../repositories/attendance-ot-repository');
const assignmentRepository = require('../repositories/assignment-repository');
const workLocationRepository = require('../repositories/work-location-repository');
const systemLogRepository = require('../repositories/system-log-repository');
const fileStorageService = require('./file-storage-service');
const locationValidationService = require('./location-validation-service');
const identityVerificationService = require('../modules/face-recognition/services/identity-verification.service');
const livenessDetectionService = require('../modules/liveness/services/liveness-detection.service');
const deviceBiometricService = require('../modules/device-biometric/services/device-biometric.service');
const attendancePhotoService = require('./attendance-photo-service');
const employeeRepository = require('../repositories/employee-repository');
const faceProfileRepository = require('../modules/face-recognition/repositories/face-profile-repository');

const {
  BadRequestError,
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError
} = require('../errors/app-error');

const ERROR_CODE = {
  OT_SHIFT_NOT_APPROVED: 'OT_SHIFT_NOT_APPROVED',
  MAIN_SHIFT_NOT_COMPLETED: 'MAIN_SHIFT_NOT_COMPLETED',
  OT_CHECK_IN_TOO_EARLY: 'OT_CHECK_IN_TOO_EARLY',
  OT_CHECK_IN_TOO_LATE: 'OT_CHECK_IN_TOO_LATE',
  OT_ALREADY_EXISTS: 'OT_ALREADY_EXISTS',
  OT_TIME_OVERLAP: 'OT_TIME_OVERLAP',
  OT_PAYROLL_LOCKED: 'OT_PAYROLL_LOCKED',
  OT_SESSION_NOT_FOUND: 'OT_SESSION_NOT_FOUND',
  OT_ALREADY_COMPLETED: 'OT_ALREADY_COMPLETED',
  OUTSIDE_ALLOWED_RADIUS: 'OUTSIDE_ALLOWED_RADIUS'
};

const SYSTEM_ACTION = {
  OT_ATTENDANCE_CHECK_IN: 'OT_ATTENDANCE_CHECK_IN',
  OT_ATTENDANCE_CHECK_OUT: 'OT_ATTENDANCE_CHECK_OUT'
};

class AttendanceOvertimeService {
  async checkIn(data, files, authContext) {
    const { employeeId, accountId, deviceFingerprint, ipAddress, sessionId } = authContext;
    const { otRequestId, latitude, longitude, gpsAccuracy, isPwa, clientRequestId, capturedAtClient, embedding } = data;

    const file = files?.photo?.[0] || files?.photo || files?.file?.[0];
    const verificationFile = files?.verificationFile?.[0] || files?.verificationFile || files?.verificationPhoto?.[0];

    if (!otRequestId) {
      throw new BadRequestError('Thiếu ID yêu cầu tăng ca', 'MISSING_OT_REQUEST_ID');
    }
    if (!file) {
      throw new BadRequestError('Thiếu ảnh chụp check-in', 'PHOTO_REQUIRED');
    }

    const isValidCoordinate = (val, min, max) => {
      if (val === null || val === undefined || val === '') return false;
      const num = parseFloat(val);
      return !isNaN(num) && num >= min && num <= max;
    };

    const isNoGpsMode = data.isNoGps === 'true' || data.isNoGps === true || data.isNoGps === '1' ||
      !isValidCoordinate(latitude, -90, 90) ||
      !isValidCoordinate(longitude, -180, 180);

    const parsedLat = !isNoGpsMode ? parseFloat(latitude) : null;
    const parsedLng = !isNoGpsMode ? parseFloat(longitude) : null;
    const parsedAccuracy = (!isNoGpsMode && gpsAccuracy && !isNaN(parseFloat(gpsAccuracy))) ? parseFloat(gpsAccuracy) : null;
    const parsedPwa = parseInt(isPwa || '0', 10);

    const client = await pool.connect();
    try {
      // 1. Fetch OT Request
      const otRequest = await otRepository.findRequestById(otRequestId, client);
      if (!otRequest) {
        throw new NotFoundError('Không tìm thấy yêu cầu tăng ca', 'OT_REQUEST_NOT_FOUND');
      }

      // Check owner
      if (otRequest.employeeId !== employeeId) {
        throw new ForbiddenError('Yêu cầu tăng ca này không thuộc về bạn', 'FORBIDDEN');
      }

      // 2. Business Rules Validation
      // Rule: Only approved requests
      if (otRequest.status !== 'APPROVED') {
        throw new ValidationError('Đơn đăng ký tăng ca chưa được duyệt', ERROR_CODE.OT_SHIFT_NOT_APPROVED);
      }

      const todayStr = otRequest.workDate; // e.g. YYYY-MM-DD

      // Rule: Main shift attendance must have completed check-out (check_out_time must be present)
      const mainAttendance = await attendanceRepository.findTodayAttendance(employeeId, todayStr, client);
      if (!mainAttendance || !mainAttendance.check_out_time) {
        throw new ValidationError('Ca làm việc chính hôm nay chưa hoàn thành check-out', ERROR_CODE.MAIN_SHIFT_NOT_COMPLETED);
      }

      // Rule: Check-in early & late limit (15 mins early, 60 mins late)
      const now = new Date();
      const otStartTime = new Date(`${todayStr}T${otRequest.startTime}+07:00`);
      
      const earlyLimitMs = 15 * 60 * 1000;
      const lateLimitMs = 60 * 60 * 1000;

      if (now.getTime() < otStartTime.getTime() - earlyLimitMs) {
        throw new ValidationError('Chưa đến giờ check-in ca tăng ca', ERROR_CODE.OT_CHECK_IN_TOO_EARLY);
      }
      if (now.getTime() > otStartTime.getTime() + lateLimitMs) {
        throw new ValidationError('Đã quá giờ check-in ca tăng ca cho phép', ERROR_CODE.OT_CHECK_IN_TOO_LATE);
      }

      // Rule: Session already exists
      const existingOtSession = await attendanceOtRepository.findByOtRequestId(otRequestId, client);
      if (existingOtSession) {
        throw new ValidationError('Đơn OT này đã được tạo phiên chấm công trước đó', ERROR_CODE.OT_ALREADY_EXISTS);
      }

      // Rule: Prevent running overlap OT session
      const hasRunningOt = await attendanceOtRepository.checkOverlap(employeeId, now, client);
      if (hasRunningOt) {
        throw new ValidationError('Bạn đang có một ca làm việc tăng ca khác chưa hoàn thành check-out', ERROR_CODE.OT_TIME_OVERLAP);
      }

      // 3. Geofence Location Validation
      // Fetch allowed locations for the assignment
      const assignment = await assignmentRepository.findById(otRequest.assignmentId, client);
      if (!assignment) {
        throw new NotFoundError('Không tìm thấy thông tin phân công của ca làm việc', 'ASSIGNMENT_NOT_FOUND');
      }

      // Read allowed locations
      const allowedLocations = assignment.allowedLocations || [];
      let foundMatch = false;
      let targetLocation = null;
      let locVal = { distanceMeter: null, trustScore: 50.0, riskLevel: 'NO_GPS' };
      let riskLevel = 'LOW';

      if (isNoGpsMode) {
        targetLocation = allowedLocations[0] || (assignment.location ? assignment.location : null);
        locVal = { distanceMeter: null, trustScore: 50.0, riskLevel: 'NO_GPS' };
        riskLevel = 'NO_GPS';
      } else {
        for (const loc of allowedLocations) {
          const val = locationValidationService.validateLocation({
            employeeLatitude: parsedLat,
            employeeLongitude: parsedLng,
            targetLatitude: parseFloat(loc.latitude),
            targetLongitude: parseFloat(loc.longitude),
            allowedRadiusMeter: loc.allowedRadiusMeter || loc.allowed_radius_meter,
            gpsAccuracy: parsedAccuracy,
            isPwaStandalone: parsedPwa,
            deviceFingerprintMatched: true,
          });

          if (val.isInsideRadius) {
            locVal = val;
            targetLocation = loc;
            foundMatch = true;
            break;
          }
        }

        if (!foundMatch) {
          // Fallback: check general company locations
          const companyLocations = await workLocationRepository.findCompanyLocations(client);
          for (const companyLoc of companyLocations) {
            const compLocVal = locationValidationService.validateLocation({
              employeeLatitude: parsedLat,
              employeeLongitude: parsedLng,
              targetLatitude: parseFloat(companyLoc.latitude),
              targetLongitude: parseFloat(companyLoc.longitude),
              allowedRadiusMeter: companyLoc.allowedRadiusMeter || companyLoc.allowed_radius_meter,
              gpsAccuracy: parsedAccuracy,
              isPwaStandalone: parsedPwa,
              deviceFingerprintMatched: true,
            });

            if (compLocVal.isInsideRadius) {
              locVal = compLocVal;
              targetLocation = companyLoc;
              foundMatch = true;
              break;
            }
          }
        }

        if (!foundMatch) {
          throw new BadRequestError('Bạn đang ở ngoài bán kính chấm công cho phép của ca tăng ca', ERROR_CODE.OUTSIDE_ALLOWED_RADIUS);
        }
        riskLevel = locVal ? locVal.riskLevel : 'LOW';
      }

      // 4. Begin transactional edits & AI verification
      await client.query('BEGIN');

      const activeProfile = await faceProfileRepository.findActiveProfile(employeeId, client);
      if (!activeProfile) {
        throw new ValidationError('Nhân viên chưa đăng ký hồ sơ khuôn mặt', 'FACE_PROFILE_NOT_FOUND');
      }

      const imageBuffer = fs.readFileSync(file.path);

      // Face Verification Check
      let faceVerifyResult = null;
      if (embedding) {
        let parsedEmbedding;
        try {
          parsedEmbedding = typeof embedding === 'string' ? JSON.parse(embedding) : embedding;
        } catch (e) {
          parsedEmbedding = null;
        }

        if (Array.isArray(parsedEmbedding) && parsedEmbedding.length === 128) {
          let minDistance = 999;
          let matchedPose = 'STRAIGHT';

          let storedEmbeddings = [];
          const dbEmb = activeProfile.embedding;
          if (Array.isArray(dbEmb)) {
            if (typeof dbEmb[0] === 'number') {
              storedEmbeddings = [{ embedding: dbEmb, pose: 'STRAIGHT' }];
            } else if (typeof dbEmb[0] === 'object' && dbEmb[0] !== null) {
              storedEmbeddings = dbEmb;
            }
          }

          for (const stored of storedEmbeddings) {
            if (!stored.embedding || stored.embedding.length !== 128) continue;
            let sumSq = 0;
            for (let i = 0; i < 128; i++) {
              const diff = parsedEmbedding[i] - stored.embedding[i];
              sumSq += diff * diff;
            }
            const distance = Math.sqrt(sumSq);
            if (distance < minDistance) {
              minDistance = distance;
              matchedPose = stored.pose || 'STRAIGHT';
            }
          }

          const similarityThreshold = parseFloat(process.env.FACE_SIMILARITY_THRESHOLD || '0.82');
          const distanceThreshold = (1.0 - similarityThreshold) / 0.36;
          const similarity = Math.max(0, 1.0 - 0.36 * minDistance);

          if (minDistance <= distanceThreshold) {
            faceVerifyResult = {
              success: true,
              similarity: similarity,
              pose: matchedPose
            };
          }
        }
      }

      const isExplicitFailed = data.faceVerifyFailed === 'true' || data.faceVerifyFailed === true;
      if (isExplicitFailed) {
        faceVerifyResult = { success: false, similarity: 0 };
      } else if (!faceVerifyResult) {
        try {
          faceVerifyResult = await identityVerificationService.verifyIdentity(
            employeeId,
            imageBuffer,
            file.originalname,
            activeProfile
          );
        } catch (verifyErr) {
          console.warn(`[OT CheckIn] Identity verification fallback failed: ${verifyErr.message}.`);
          faceVerifyResult = { success: false, similarity: 0 };
        }
      }

      const needsAdminReview = isExplicitFailed || (faceVerifyResult && !faceVerifyResult.success) || riskLevel === 'NO_GPS' || riskLevel === 'HIGH' || riskLevel === 'MEDIUM';

      // Liveness Detection
      let livenessResult;
      try {
        livenessResult = await livenessDetectionService.verifyLiveness(employeeId, imageBuffer, file.originalname, client);
      } catch (err) {
        if (!err.statusCode || err.statusCode >= 500) {
          console.warn(`⚠️ Liveness Detection internal error: ${err.message}. Falling back to baseline attendance check.`);
          livenessResult = { passed: true, fallback: true };
        } else {
          throw err;
        }
      }
      if (!livenessResult.passed) {
        throw new ValidationError(`Xác thực Liveness thất bại: ${livenessResult.reason}`, 'LIVENESS_FAILED');
      }

      // Device Verification
      await deviceBiometricService.verifyDevice(employeeId, sessionId, data, client);

      const photoUrl = fileStorageService.getFileUrl(file.filename);

      // Create attendance_overtime record
      const attendanceOt = await attendanceOtRepository.create({
        attendanceId: mainAttendance.attendance_id,
        otRequestId: otRequest.otRequestId,
        assignmentId: otRequest.assignmentId,
        shiftId: mainAttendance.shift_id,
        checkInTime: now,
        checkInLatitude: parsedLat,
        checkInLongitude: parsedLng,
        checkInPhotoUrl: photoUrl,
        checkInDistanceMeter: locVal ? locVal.distanceMeter : null,
        matchedLocationId: targetLocation ? (targetLocation.locationId || targetLocation.location_id) : null,
        createdBy: accountId
      }, client);

      // Save photos
      await attendancePhotoService.savePhoto({
        attendanceId: mainAttendance.attendance_id,
        employeeId,
        assignmentId: otRequest.assignmentId,
        photoType: 'CHECK_IN_FINAL',
        photoUrl: photoUrl,
        capturedAt: capturedAtClient,
        faceConfidence: faceVerifyResult ? faceVerifyResult.similarity : null,
        livenessScore: livenessResult ? livenessResult.confidence : null,
        verificationResult: 'SUCCESS',
        gpsAccuracy: parsedAccuracy,
        gpsDistance: locVal ? locVal.distanceMeter : null
      }, file, client);

      // Save System Audit Log (Decoupled from main transaction)
      systemLogRepository.createLog({
        employeeId,
        accountId,
        action: SYSTEM_ACTION.OT_ATTENDANCE_CHECK_IN,
        description: `Check-in Tăng ca thành công. OT ID: ${otRequest.otRequestId}, Điểm khớp: ${targetLocation ? (targetLocation.locationName || targetLocation.location_name) : 'N/A'}, GPS Accuracy: ${parsedAccuracy}m`,
        deviceFingerprint,
        ipAddress,
        status: 'SUCCESS'
      }).catch(() => { });

      if (needsAdminReview) {
        const verificationPhotoUrl = verificationFile ? fileStorageService.getFileUrl(verificationFile.filename) : null;
        const reviewNote = 'Lượt chụp của check in tăng ca';
        
        await client.query(`
          UPDATE public.attendance
          SET review_status = 'PENDING',
              attendance_status = 'REVIEW_REQUIRED',
              reviewed_by = NULL,
              reviewed_at = NULL,
              review_note = $1,
              check_in_verification_photo_url = COALESCE($2, check_in_verification_photo_url)
          WHERE attendance_id = $3
        `, [reviewNote, verificationPhotoUrl, mainAttendance.attendance_id]);
      }

      await client.query('COMMIT');
      return attendanceOt;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async checkOut(data, files, authContext) {
    const { employeeId, accountId, deviceFingerprint, ipAddress, sessionId } = authContext;
    const { otRequestId, latitude, longitude, gpsAccuracy, isPwa, clientRequestId, capturedAtClient, embedding } = data;

    const file = files?.photo?.[0] || files?.photo;
    const verificationFile = files?.verificationPhoto?.[0] || files?.verificationPhoto;

    if (!otRequestId) {
      throw new BadRequestError('Thiếu ID yêu cầu tăng ca', 'MISSING_OT_REQUEST_ID');
    }
    if (!file) {
      throw new BadRequestError('Thiếu ảnh chụp check-out', 'PHOTO_REQUIRED');
    }

    const isValidCoordinate = (val, min, max) => {
      if (val === null || val === undefined || val === '') return false;
      const num = parseFloat(val);
      return !isNaN(num) && num >= min && num <= max;
    };

    const isNoGpsMode = data.isNoGps === 'true' || data.isNoGps === true || data.isNoGps === '1' ||
      !isValidCoordinate(latitude, -90, 90) ||
      !isValidCoordinate(longitude, -180, 180);

    const parsedLat = !isNoGpsMode ? parseFloat(latitude) : null;
    const parsedLng = !isNoGpsMode ? parseFloat(longitude) : null;
    const parsedAccuracy = (!isNoGpsMode && gpsAccuracy && !isNaN(parseFloat(gpsAccuracy))) ? parseFloat(gpsAccuracy) : null;
    const parsedPwa = parseInt(isPwa || '0', 10);

    const client = await pool.connect();
    try {
      // 1. Fetch OT Request
      const otRequest = await otRepository.findRequestById(otRequestId, client);
      if (!otRequest) {
        throw new NotFoundError('Không tìm thấy yêu cầu tăng ca', 'OT_REQUEST_NOT_FOUND');
      }

      // Check owner
      if (otRequest.employeeId !== employeeId) {
        throw new ForbiddenError('Yêu cầu tăng ca này không thuộc về bạn', 'FORBIDDEN');
      }

      // 2. Fetch OT Session
      const attendanceOt = await attendanceOtRepository.findByOtRequestId(otRequestId, client);
      if (!attendanceOt) {
        throw new ValidationError('Không tìm thấy phiên check-in tăng ca tương ứng', ERROR_CODE.OT_SESSION_NOT_FOUND);
      }

      // Rule: Already completed
      if (attendanceOt.attendanceStatus === 'COMPLETED') {
        throw new ValidationError('Phiên tăng ca này đã hoàn thành check-out trước đó', ERROR_CODE.OT_ALREADY_COMPLETED);
      }

      // Rule: Payroll lock status
      if (attendanceOt.payrollProcessed) {
        throw new ValidationError('Kỳ công lương cho ca tăng ca này đã được chốt, không thể thay đổi dữ liệu', ERROR_CODE.OT_PAYROLL_LOCKED);
      }

      // 3. Geofence Location Validation
      let riskLevel = 'LOW';
      let locVal = { distanceMeter: null, trustScore: 50.0, riskLevel: 'NO_GPS' };
      if (isNoGpsMode) {
        riskLevel = 'NO_GPS';
      } else {
        const targetLoc = attendanceOt.matchedLocationId ? await workLocationRepository.findById(attendanceOt.matchedLocationId, client) : null;
        if (targetLoc) {
          locVal = locationValidationService.validateLocation({
            employeeLatitude: parsedLat,
            employeeLongitude: parsedLng,
            targetLatitude: parseFloat(targetLoc.latitude),
            targetLongitude: parseFloat(targetLoc.longitude),
            allowedRadiusMeter: targetLoc.allowedRadiusMeter || targetLoc.allowed_radius_meter,
            gpsAccuracy: parsedAccuracy,
            isPwaStandalone: parsedPwa,
            deviceFingerprintMatched: true,
          });

          if (!locVal.isInsideRadius) {
            throw new BadRequestError('Bạn đang ở ngoài bán kính check-out cho phép của ca tăng ca', ERROR_CODE.OUTSIDE_ALLOWED_RADIUS);
          }
          riskLevel = locVal.riskLevel;
        } else {
          riskLevel = 'LOW';
        }
      }

      // 4. Begin transactional edits & AI verification
      await client.query('BEGIN');

      const activeProfile = await faceProfileRepository.findActiveProfile(employeeId, client);
      const imageBuffer = fs.readFileSync(file.path);

      // Face Verification Check
      let faceVerifyResult = null;
      const isExplicitFailed = data.faceVerifyFailed === 'true' || data.faceVerifyFailed === true;
      if (isExplicitFailed) {
        faceVerifyResult = { success: false, similarity: 0 };
      } else {
        try {
          faceVerifyResult = await identityVerificationService.verifyIdentity(
            employeeId,
            imageBuffer,
            file.originalname,
            activeProfile
          );
        } catch (verifyErr) {
          console.warn(`[OT CheckOut] Identity verification fallback failed: ${verifyErr.message}.`);
          faceVerifyResult = { success: false, similarity: 0 };
        }
      }

      const needsAdminReview = isExplicitFailed || (faceVerifyResult && !faceVerifyResult.success) || riskLevel === 'NO_GPS' || riskLevel === 'HIGH' || riskLevel === 'MEDIUM';

      // Liveness Detection
      let livenessResult;
      try {
        livenessResult = await livenessDetectionService.verifyLiveness(employeeId, imageBuffer, file.originalname, client);
      } catch (err) {
        if (!err.statusCode || err.statusCode >= 500) {
          console.warn(`⚠️ Liveness Detection internal error: ${err.message}. Falling back to baseline attendance check.`);
          livenessResult = { passed: true, fallback: true };
        } else {
          throw err;
        }
      }
      if (!livenessResult.passed) {
        throw new ValidationError(`Xác thực Liveness thất bại: ${livenessResult.reason}`, 'LIVENESS_FAILED');
      }

      const photoUrl = fileStorageService.getFileUrl(file.filename);

      // Calculate minutes
      const now = new Date();
      const checkInDate = new Date(attendanceOt.checkInTime);
      const diffMs = now.getTime() - checkInDate.getTime();
      let actualMinutes = Math.max(0, Math.floor(diffMs / (60 * 1000)));
      if (actualMinutes === 0 && diffMs > 5000) {
        actualMinutes = 1;
      }

      const tz = process.env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh';
      const dateFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const workDateStr = dateFormatter.format(new Date(otRequest.workDate));

      // Registered duration
      const otStartDate = new Date(`${workDateStr}T${otRequest.startTime}+07:00`);
      const otEndDate = new Date(`${workDateStr}T${otRequest.endTime}+07:00`);
      let registeredMinutes = Math.floor((otEndDate.getTime() - otStartDate.getTime()) / (60 * 1000));
      if (registeredMinutes < 0) {
        // Cross midnight
        otEndDate.setDate(otEndDate.getDate() + 1);
        registeredMinutes = Math.floor((otEndDate.getTime() - otStartDate.getTime()) / (60 * 1000));
      }

      const approvedMinutes = Math.min(actualMinutes, registeredMinutes);

      // Update session
      const updatedOt = await attendanceOtRepository.update(attendanceOt.attendanceOtId, {
        checkOutTime: now,
        checkOutLatitude: parsedLat,
        checkOutLongitude: parsedLng,
        checkOutPhotoUrl: photoUrl,
        checkOutDistanceMeter: locVal ? locVal.distanceMeter : null,
        attendanceStatus: 'COMPLETED',
        actualMinutes,
        approvedMinutes,
        updatedBy: accountId
      }, client);

      // Save photos
      await attendancePhotoService.savePhoto({
        attendanceId: attendanceOt.attendanceId,
        employeeId,
        assignmentId: attendanceOt.assignmentId,
        photoType: 'CHECK_OUT_FINAL',
        photoUrl: photoUrl,
        capturedAt: capturedAtClient,
        faceConfidence: faceVerifyResult ? faceVerifyResult.similarity : null,
        livenessScore: livenessResult ? livenessResult.confidence : null,
        verificationResult: 'SUCCESS',
        gpsAccuracy: parsedAccuracy,
        gpsDistance: locVal ? locVal.distanceMeter : null
      }, file, client);

      // Save System Audit Log (Decoupled from main transaction)
      systemLogRepository.createLog({
        employeeId,
        accountId,
        action: SYSTEM_ACTION.OT_ATTENDANCE_CHECK_OUT,
        description: `Check-out Tăng ca thành công. OT ID: ${otRequest.otRequestId}, Thực tế: ${actualMinutes}p, Được duyệt: ${approvedMinutes}p`,
        deviceFingerprint,
        ipAddress,
        status: 'SUCCESS'
      }).catch(() => { });

      if (needsAdminReview) {
        const verificationPhotoUrl = verificationFile ? fileStorageService.getFileUrl(verificationFile.filename) : null;
        const reviewNote = 'Lượt chụp của check out tăng ca';
        
        await client.query(`
          UPDATE public.attendance
          SET review_status = 'PENDING',
              attendance_status = 'REVIEW_REQUIRED',
              reviewed_by = NULL,
              reviewed_at = NULL,
              review_note = $1,
              check_out_verification_photo_url = COALESCE($2, check_out_verification_photo_url)
          WHERE attendance_id = $3
        `, [reviewNote, verificationPhotoUrl, attendanceOt.attendanceId]);
      }

      await client.query('COMMIT');
      return updatedOt;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new AttendanceOvertimeService();
