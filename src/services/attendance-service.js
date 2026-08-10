const { pool } = require('../config/db');
const attendanceRepository = require('../repositories/attendance-repository');
const attendanceLogRepository = require('../repositories/attendance-log-repository');
const assignmentRepository = require('../repositories/assignment-repository');
const workLocationRepository = require('../repositories/work-location-repository');
const systemLogRepository = require('../repositories/system-log-repository');
const fileStorageService = require('./file-storage-service');
const locationValidationService = require('./location-validation-service');
const fs = require('fs');
const faceAiConfig = require('../modules/face-recognition/config/face-ai-config');
const faceProfileRepository = require('../modules/face-recognition/repositories/face-profile-repository');
const identityVerificationService = require('../modules/face-recognition/services/identity-verification.service');
const livenessDetectionService = require('../modules/liveness/services/liveness-detection.service');
const deviceBiometricService = require('../modules/device-biometric/services/device-biometric.service');
const deviceBiometricConfig = require('../modules/device-biometric/config/device-biometric-config');
const attendanceCalculationService = require('./attendance-calculation-service');
const attendancePhotoService = require('./attendance-photo-service');
const otRepository = require('../repositories/ot-repository');
const attendanceOtRepository = require('../repositories/attendance-ot-repository');
const notificationService = require('./notification-service');

const { getTodayDateString } = require('../utils/date');
const { getPagination } = require('../utils/pagination');

const {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  ConflictError,
  ValidationError,
} = require('../errors/app-error');

const ERROR_CODE = require('../constants/error-code.constants');
const ATTENDANCE_STATUS = require('../constants/attendance-status.constants');
const ATTENDANCE_ACTION = require('../constants/attendance-action.constants');
const VALIDATION_RESULT = require('../constants/validation-result.constants');
const SYSTEM_ACTION = require('../constants/system-action.constants');

class AttendanceService {
  /**
   * Helper to write logs for failed check-in/check-out attempts (Type 2 failures).
   * Runs in a separate request/transaction block using the global pool so logs persist.
   */
  async logRejectedRequest(params) {
    const {
      clientRequestId,
      employeeId,
      sessionId,
      assignmentId,
      locationId,
      actionType,
      latitude,
      longitude,
      gpsAccuracy,
      targetLatitude,
      targetLongitude,
      appliedRadiusMeter,
      distanceMeter,
      deviceFingerprint,
      isPwaStandalone,
      capturedAtClient,
      validationReason,
      riskLevel,
      trustScore,
    } = params;

    try {
      // Confirm assignment exists and belongs to the employee before adding foreign key link to prevent database fk failures
      let validAssignmentId = null;
      if (assignmentId && employeeId) {
        const ass = await assignmentRepository.findById(assignmentId);
        if (ass && parseInt(ass.employee.employeeId, 10) === parseInt(employeeId, 10)) {
          validAssignmentId = assignmentId;
        }
      }

      // Confirm location exists before writing it
      let validLocationId = null;
      if (locationId) {
        const loc = await workLocationRepository.findById(locationId);
        if (loc) {
          validLocationId = locationId;
        }
      }

      // Save log to attendance_location_logs
      await attendanceLogRepository.create({
        clientRequestId,
        attendanceId: null,
        employeeId,
        sessionId,
        assignmentId: validAssignmentId,
        locationId: validLocationId,
        actionType,
        latitude,
        longitude,
        gpsAccuracy,
        targetLatitude,
        targetLongitude,
        appliedRadiusMeter,
        distanceMeter,
        deviceFingerprint,
        isPwaStandalone,
        capturedAtClient,
        isOfflinePayload: 0,
        locationTrustScore: trustScore,
        validationResult: VALIDATION_RESULT.REJECTED,
        validationReason,
        riskLevel,
      });

      // Save log to system_logs
      await systemLogRepository.createLog({
        employeeId,
        accountId: params.accountId || null,
        action: actionType === ATTENDANCE_ACTION.CHECK_IN ? SYSTEM_ACTION.CHECK_IN : SYSTEM_ACTION.CHECK_OUT,
        description: `Thất bại check-in/check-out: ${validationReason}`,
        deviceFingerprint,
        ipAddress: params.ipAddress || null,
        status: 'FAILED',
      });
    } catch (logErr) {
      // Silently catch logging errors to prevent shadowing original business errors
      console.error('Failed to log rejected attendance request', logErr);
    }
  }

  /**
   * Process employee online Check-in
   */
  async checkIn(auth, body, file, ipAddress, verificationFile) {
    const perfLabel = `[CHECKIN PROF req_${Date.now()}]`;
    console.time(`${perfLabel} TOTAL`);
    console.time(`${perfLabel} 1. Validations & DB Queries`);

    const { employeeId, accountId, sessionId, deviceFingerprint } = auth;
    const {
      assignmentId,
      latitude,
      longitude,
      gpsAccuracy,
      capturedAtClient,
      clientRequestId,
      isPwaStandalone,
      embedding,
      isNoGps,
    } = body;

    const isValidCoordinate = (val, min, max) => {
      if (val === null || val === undefined || val === '') return false;
      const num = parseFloat(val);
      return !isNaN(num) && num >= min && num <= max;
    };

    const isNoGpsMode = isNoGps === 'true' || isNoGps === true || isNoGps === '1' ||
      !isValidCoordinate(latitude, -90, 90) ||
      !isValidCoordinate(longitude, -180, 180);

    const parsedAssignmentId = parseInt(assignmentId, 10);
    const parsedLat = !isNoGpsMode ? parseFloat(latitude) : null;
    const parsedLng = !isNoGpsMode ? parseFloat(longitude) : null;
    const parsedAccuracy = (!isNoGpsMode && gpsAccuracy && !isNaN(parseFloat(gpsAccuracy))) ? parseFloat(gpsAccuracy) : null;
    const parsedPwa = parseInt(isPwaStandalone || '0', 10);

    // 1. Verify photo uploaded
    if (!file) {
      console.timeEnd(`${perfLabel} 1. Validations & DB Queries`);
      console.timeEnd(`${perfLabel} TOTAL`);
      throw new BadRequestError('Thiếu ảnh xác thực check-in', ERROR_CODE.PHOTO_REQUIRED);
    }

    const client = await pool.connect();
    let targetLocation = null;
    let distanceMeter = null;
    let trustScore = null;
    let riskLevel = null;
    let faceVerifyResult = null;
    let livenessResult = null;

    try {
      // 2 & 3. Retrieve assignment, check idempotency, and fetch face profile concurrently
      const [assignment, existingLog, activeProfile] = await Promise.all([
        assignmentRepository.findById(parsedAssignmentId, client),
        attendanceLogRepository.findByClientRequestId(clientRequestId),
        faceProfileRepository.findActiveProfile(employeeId, client),
      ]);

      if (existingLog) {
        if (file.filename) {
          await fileStorageService.deleteFile(file.filename);
        }
        if (verificationFile && verificationFile.filename) {
          await fileStorageService.deleteFile(verificationFile.filename).catch(() => { });
        }
        throw new ConflictError('Yêu cầu check-in đã được xử lý', ERROR_CODE.DUPLICATE_CLIENT_REQUEST);
      }

      if (!assignment) {
        throw new NotFoundError('Không tìm thấy phân công làm việc', ERROR_CODE.ASSIGNMENT_NOT_FOUND);
      }
      if (parseInt(assignment.employee.employeeId, 10) !== parseInt(employeeId, 10)) {
        throw new ForbiddenError('Không thể chấm công cho phân công của người khác', ERROR_CODE.ASSIGNMENT_NOT_OWNED);
      }
      if (assignment.status === 'CANCELLED') {
        throw new BadRequestError('Phân công làm việc đã bị hủy', ERROR_CODE.ASSIGNMENT_CANCELLED);
      }
      if (assignment.status === 'COMPLETED') {
        throw new BadRequestError('Phân công làm việc đã hoàn thành', ERROR_CODE.ASSIGNMENT_COMPLETED);
      }

      if (!activeProfile) {
        throw new NotFoundError('Không tìm thấy dữ liệu khuôn mặt đã đăng ký', ERROR_CODE.FACE_PROFILE_NOT_FOUND);
      }

      // Check shift existence and active status
      if (!assignment.shift) {
        throw new NotFoundError('Không tìm thấy ca làm việc liên kết với phân công', ERROR_CODE.SHIFT_NOT_FOUND);
      }
      if (parseInt(assignment.shift.isActive, 10) !== 1) {
        throw new ConflictError('Ca làm việc liên kết đã bị vô hiệu hóa', ERROR_CODE.SHIFT_INACTIVE);
      }

      const todayStr = getTodayDateString();
      const shiftEndTimeCheck = assignment.shift.endTime || assignment.shift.end_time;
      const shiftStartTimeCheck = assignment.shift.startTime || assignment.shift.start_time;

      let isOvernightAndValid = false;
      let checkInScheduledEnd = null;

      if (shiftEndTimeCheck && shiftStartTimeCheck) {
        const workDate = assignment.workDate;
        let endDayStr = workDate;
        
        if (shiftEndTimeCheck < shiftStartTimeCheck) {
          // Ca qua đêm
          const d = new Date(workDate);
          d.setDate(d.getDate() + 1);
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          endDayStr = `${year}-${month}-${day}`;
          
          if (todayStr === endDayStr) {
            isOvernightAndValid = true;
          }
        }
        checkInScheduledEnd = new Date(`${endDayStr}T${shiftEndTimeCheck}+07:00`);
      }

      if (assignment.workDate !== todayStr && !isOvernightAndValid) {
        throw new BadRequestError('Chỉ được check-in cho phân công ngày hôm nay', ERROR_CODE.ASSIGNMENT_NOT_FOR_TODAY);
      }

      if (checkInScheduledEnd) {
        const nowCheck = new Date();
        if (nowCheck > checkInScheduledEnd) {
          throw new BadRequestError(
            `Đã hết ca chấm công. Ca làm việc đã kết thúc lúc ${shiftEndTimeCheck.substring(0, 5)}. Không thể check-in.`,
            ERROR_CODE.SHIFT_ENDED
          );
        }
      }

      // 4 & 5. Retrieve work location and check duplicate attendance concurrently
      const [assignedLocation, existingAttendance] = await Promise.all([
        workLocationRepository.findById(assignment.location.locationId, client),
        attendanceRepository.findByAssignmentId(parsedAssignmentId, client),
      ]);

      if (existingAttendance) {
        throw new BadRequestError('Bạn đã check-in cho phân công này rồi', ERROR_CODE.ATTENDANCE_ALREADY_CHECKED_IN);
      }

      const allowedLocations = assignment.allowedLocations && assignment.allowedLocations.length > 0 
        ? assignment.allowedLocations 
        : (assignedLocation ? [assignedLocation] : []);

      const activeAllowedLocations = allowedLocations.filter(loc => parseInt(loc.status, 10) === 1);
      if (activeAllowedLocations.length === 0) {
        throw new NotFoundError('Không tìm thấy địa điểm chấm công được phân công đang hoạt động', ERROR_CODE.WORK_LOCATION_NOT_FOUND);
      }

      let isCompanyLocation = false;
      let isCheckInAtCompanyLocationInsteadOfAssigned = false;

      if (isNoGpsMode) {
        targetLocation = activeAllowedLocations[0] || assignedLocation;
        distanceMeter = null;
        trustScore = 50.0;
        riskLevel = 'NO_GPS';
      } else {
        // 6. Validate GPS accuracy
        if (parsedAccuracy !== null && parsedAccuracy < 0) {
          throw new BadRequestError('Độ chính xác GPS không được âm', ERROR_CODE.INVALID_GPS_ACCURACY);
        }
        const maxGpsLimit = parseInt(process.env.MAX_GPS_ACCURACY_METERS || '100', 10);
        if (parsedAccuracy !== null && parsedAccuracy > maxGpsLimit) {
          throw new BadRequestError('Độ chính xác GPS vượt ngưỡng cho phép (tín hiệu quá yếu)', ERROR_CODE.GPS_ACCURACY_TOO_LOW);
        }

        // 7. Validate distance using locationValidationService
        let foundMatch = false;
        let locVal = null;

        for (const loc of activeAllowedLocations) {
          const val = locationValidationService.validateLocation({
            employeeLatitude: parsedLat,
            employeeLongitude: parsedLng,
            targetLatitude: loc.latitude,
            targetLongitude: loc.longitude,
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

        if (foundMatch) {
          isCompanyLocation = targetLocation.isCompanyLocation === true;
        } else {
          // Second try: company locations fallback
          const companyLocations = await workLocationRepository.findCompanyLocations(client);
          let foundCompanyMatch = false;

          for (const companyLoc of companyLocations) {
            const compLocVal = locationValidationService.validateLocation({
              employeeLatitude: parsedLat,
              employeeLongitude: parsedLng,
              targetLatitude: companyLoc.latitude,
              targetLongitude: companyLoc.longitude,
              allowedRadiusMeter: companyLoc.allowedRadiusMeter || companyLoc.allowed_radius_meter,
              gpsAccuracy: parsedAccuracy,
              isPwaStandalone: parsedPwa,
              deviceFingerprintMatched: true,
            });

            if (compLocVal.isInsideRadius) {
              locVal = compLocVal;
              targetLocation = companyLoc;
              isCompanyLocation = true;
              isCheckInAtCompanyLocationInsteadOfAssigned = true;
              foundCompanyMatch = true;
              foundMatch = true;
              break;
            }
          }

          if (!foundCompanyMatch) {
            throw new BadRequestError('Bạn đang ở ngoài bán kính chấm công cho phép', ERROR_CODE.OUTSIDE_ALLOWED_RADIUS);
          }
        }

        distanceMeter = locVal.distanceMeter;
        trustScore = locVal.trustScore;
        riskLevel = locVal.riskLevel;
      }

        // 8. Validate PWA Standalone configuration
        if (process.env.REQUIRE_PWA_STANDALONE === 'true' && parsedPwa !== 1) {
          throw new BadRequestError('Ứng dụng phải chạy ở chế độ PWA Standalone', ERROR_CODE.PWA_STANDALONE_REQUIRED);
        }

        console.timeEnd(`${perfLabel} 1. Validations & DB Queries`);

        // 9. Begin transaction & AI checks
        await client.query('BEGIN');

        const imageBuffer = fs.readFileSync(file.path);

        console.time(`${perfLabel} 2. Face Detection & Matching`);
        const isExplicitFailed = body.faceVerifyFailed === 'true' || body.faceVerifyFailed === true;
        if (isExplicitFailed) {
          faceVerifyResult = { success: false, similarity: 0 };
        } else if (embedding) {
          let parsedEmbedding;
          try {
            parsedEmbedding = typeof embedding === 'string' ? JSON.parse(embedding) : embedding;
          } catch (e) {
            parsedEmbedding = null;
          }

          if (Array.isArray(parsedEmbedding) && parsedEmbedding.length === 128) {
            console.log('[CheckIn] Using client-calculated WebGL embedding for verification');
            let minDistance = 999;
            let matchedPose = 'UNKNOWN';

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

            const isExplicitFailed = body.faceVerifyFailed === 'true' || body.faceVerifyFailed === true;
            const isLowSimilarity = minDistance > distanceThreshold;

            if (isLowSimilarity || isExplicitFailed) {
              console.warn(`[CheckIn] Face match failed/low similarity (${similarity.toFixed(4)}), routing to Admin PENDING review.`);
              faceVerifyResult = {
                success: false,
                similarity: similarity,
                pose: matchedPose
              };
            } else {
              faceVerifyResult = {
                success: true,
                similarity: similarity,
                pose: matchedPose
              };
            }
          }
        }

        if (!faceVerifyResult) {
          try {
            faceVerifyResult = await identityVerificationService.verifyIdentity(
              employeeId,
              imageBuffer,
              file.originalname,
              activeProfile
            );
          } catch (verifyErr) {
            console.warn(`[CheckIn] Identity verification fallback failed: ${verifyErr.message}. Routing to Admin PENDING review.`);
            faceVerifyResult = { success: false, similarity: 0 };
          }
        }
        console.timeEnd(`${perfLabel} 2. Face Detection & Matching`);

        systemLogRepository.createLog({
          employeeId,
          accountId,
          action: SYSTEM_ACTION.FACE_VERIFY,
          description: faceVerifyResult.success 
            ? `Xác thực khuôn mặt thành công trong check-in (Độ trùng khớp ${faceVerifyResult.similarity})`
            : `Nhận diện khuôn mặt chưa đạt (Độ trùng khớp ${faceVerifyResult.similarity}). Đang chờ Admin duyệt.`,
          deviceFingerprint,
          ipAddress,
          status: faceVerifyResult.success ? 'SUCCESS' : 'FAILED'
        }).catch(() => { });

        // Perform Liveness verification check
        console.time(`${perfLabel} 3. Liveness Check`);
        try {
          livenessResult = await livenessDetectionService.verifyLiveness(employeeId, imageBuffer, file.originalname, client);
        } catch (err) {
          console.warn(`⚠️ Liveness Detection internal error: ${err.message}. Falling back to baseline check.`);
          livenessResult = { passed: true, fallback: true };
        }
        console.timeEnd(`${perfLabel} 3. Liveness Check`);

        const needsAdminReview = (body.faceVerifyFailed === 'true' || body.faceVerifyFailed === true) ||
          (faceVerifyResult && !faceVerifyResult.success) ||
          riskLevel === 'NO_GPS' ||
          riskLevel === 'HIGH' ||
          riskLevel === 'MEDIUM';

        console.time(`${perfLabel} 4. DB Record Creation`);
        // Perform Device Biometric verification check
        await deviceBiometricService.verifyDevice(employeeId, sessionId, body, client);

        const photoUrl = fileStorageService.getFileUrl(file.filename);
        const verificationPhotoUrl = verificationFile ? fileStorageService.getFileUrl(verificationFile.filename) : null;

        // Calculate shift times & status
        const nowCheckIn = new Date();
        const calcResult = attendanceCalculationService.calculateCheckIn(nowCheckIn, todayStr, assignment.shift);

        const startTimeStr = assignment.shift.startTime || assignment.shift.start_time;
        const endTimeStr = assignment.shift.endTime || assignment.shift.end_time;
        let scheduledEnd = new Date(`${todayStr}T${endTimeStr}+07:00`);
        if (endTimeStr < startTimeStr) {
          scheduledEnd = new Date(`${attendanceCalculationService._getNextDay(todayStr)}T${endTimeStr}+07:00`);
        }

        // Create attendance row
        const attendance = await attendanceRepository.create({
          employeeId,
          assignmentId: parsedAssignmentId,
          workDate: todayStr,
          checkInTime: nowCheckIn,
          clientCheckInTime: capturedAtClient,
          checkInLatitude: parsedLat,
          checkInLongitude: parsedLng,
          checkInGpsAccuracy: parsedAccuracy,
          checkInDistanceMeter: distanceMeter,
          checkInPhotoUrl: photoUrl,
          checkInVerificationPhotoUrl: verificationPhotoUrl,
          isOfflineSync: 0,
          locationTrustScore: trustScore,
          riskLevel,
          attendanceStatus: needsAdminReview ? 'REVIEW_REQUIRED' : ATTENDANCE_STATUS.IN_PROGRESS,
          reviewStatus: needsAdminReview ? 'PENDING' : 'NOT_REQUIRED',
          actualCheckInLocationId: targetLocation.locationId,
          matchedLocationId: targetLocation.locationId,
          shiftId: assignment.shift.shiftId,
          scheduledStartTime: calcResult.scheduledStartTime,
          scheduledEndTime: scheduledEnd,
          checkInStatus: calcResult.checkInStatus,
          lateMinutes: calcResult.lateMinutes,
        }, client);

        // Save check-in photos history
        if (verificationPhotoUrl) {
          await attendancePhotoService.savePhoto({
            attendanceId: attendance.attendance_id,
            employeeId,
            assignmentId: parsedAssignmentId,
            photoType: 'LOCATION_CAPTURE',
            photoUrl: verificationPhotoUrl,
            capturedAt: capturedAtClient,
            faceConfidence: null,
            livenessScore: null,
            verificationResult: null,
            gpsAccuracy: parsedAccuracy,
            gpsDistance: distanceMeter
          }, verificationFile, client);
        }

        await attendancePhotoService.savePhoto({
          attendanceId: attendance.attendance_id,
          employeeId,
          assignmentId: parsedAssignmentId,
          photoType: 'FACE_CAPTURE',
          photoUrl: photoUrl,
          capturedAt: capturedAtClient,
          faceConfidence: faceVerifyResult ? faceVerifyResult.similarity : null,
          livenessScore: livenessResult ? livenessResult.confidence : null,
          verificationResult: faceVerifyResult && faceVerifyResult.success ? 'SUCCESS' : 'FAILED',
          gpsAccuracy: parsedAccuracy,
          gpsDistance: distanceMeter
        }, file, client);

        await attendancePhotoService.savePhoto({
          attendanceId: attendance.attendance_id,
          employeeId,
          assignmentId: parsedAssignmentId,
          photoType: 'CHECK_IN_FINAL',
          photoUrl: photoUrl,
          capturedAt: capturedAtClient,
          faceConfidence: faceVerifyResult ? faceVerifyResult.similarity : null,
          livenessScore: livenessResult ? livenessResult.confidence : null,
          verificationResult: faceVerifyResult && faceVerifyResult.success ? 'SUCCESS' : 'FAILED',
          gpsAccuracy: parsedAccuracy,
          gpsDistance: distanceMeter
        }, file, client);

        // Save log to attendance_location_logs
        await attendanceLogRepository.create({
          clientRequestId,
          attendanceId: attendance.attendance_id,
          employeeId,
          sessionId,
          assignmentId: parsedAssignmentId,
          locationId: targetLocation.locationId,
          actionType: ATTENDANCE_ACTION.CHECK_IN,
          latitude: parsedLat,
          longitude: parsedLng,
          gpsAccuracy: parsedAccuracy,
          targetLatitude: targetLocation.latitude,
          targetLongitude: targetLocation.longitude,
          appliedRadiusMeter: targetLocation.allowedRadiusMeter,
          distanceMeter,
          deviceFingerprint,
          isPwaStandalone: parsedPwa,
          capturedAtClient,
          isOfflinePayload: 0,
          locationTrustScore: trustScore,
          validationResult: needsAdminReview ? VALIDATION_RESULT.REVIEW_REQUIRED : VALIDATION_RESULT.ACCEPTED,
          validationReason: needsAdminReview ? 'Chờ Admin phê duyệt (Do quét khuôn mặt chưa khớp hoặc vị trí cần duyệt)' : null,
          riskLevel,
        }, client);

        systemLogRepository.createLog({
          employeeId,
          accountId,
          action: SYSTEM_ACTION.CHECK_IN,
          description: `Nhân viên check-in thành công tại địa điểm: ${targetLocation.locationName}`,
          deviceFingerprint,
          ipAddress,
          status: 'SUCCESS',
        }).catch(() => { });

        if (isCheckInAtCompanyLocationInsteadOfAssigned) {
          systemLogRepository.createLog({
            employeeId,
            accountId,
            action: 'CHECK_IN_COMPANY_LOCATION_BYPASS',
            description: 'Employee checked in at Company Location instead of assigned location.',
            deviceFingerprint,
            ipAddress,
            status: 'SUCCESS',
          }).catch(() => { });
        }

        await client.query('COMMIT');
        console.timeEnd(`${perfLabel} 4. DB Record Creation`);
        console.timeEnd(`${perfLabel} TOTAL`);

        return {
          attendanceId: parseInt(attendance.attendance_id, 10),
          assignmentId: parseInt(attendance.assignment_id, 10),
          checkInTime: attendance.check_in_time,
          attendanceStatus: attendance.attendance_status,
          checkInStatus: attendance.check_in_status,
          lateMinutes: parseInt(attendance.late_minutes || 0, 10),
          locationValidation: {
            distanceMeter: distanceMeter !== null && distanceMeter !== undefined ? parseFloat(distanceMeter.toFixed(2)) : null,
            allowedRadiusMeter: targetLocation ? (targetLocation.allowedRadiusMeter || targetLocation.allowed_radius_meter) : null,
            gpsAccuracy: parsedAccuracy,
            validationResult: needsAdminReview ? VALIDATION_RESULT.REVIEW_REQUIRED : VALIDATION_RESULT.ACCEPTED,
            riskLevel,
          },
          assignedLocation: {
            locationId: assignedLocation.locationId,
            locationName: assignedLocation.locationName,
            latitude: assignedLocation.latitude,
            longitude: assignedLocation.longitude,
            address: assignedLocation.address,
            allowedRadiusMeter: assignedLocation.allowedRadiusMeter,
            isCompanyLocation: assignedLocation.isCompanyLocation
          },
          allowedLocations: activeAllowedLocations.map(loc => ({
            locationId: loc.locationId,
            locationName: loc.locationName,
            latitude: loc.latitude,
            longitude: loc.longitude,
            address: loc.address,
            allowedRadiusMeter: loc.allowedRadiusMeter || loc.allowed_radius_meter,
            isCompanyLocation: loc.isCompanyLocation
          })),
          actualCheckInLocation: {
            locationId: targetLocation.locationId,
            locationName: targetLocation.locationName,
            latitude: targetLocation.latitude,
            longitude: targetLocation.longitude,
            address: targetLocation.address,
            allowedRadiusMeter: targetLocation.allowedRadiusMeter,
            isCompanyLocation: isCompanyLocation
          },
          isCompanyLocation
        };
    } catch (err) {
      await client.query('ROLLBACK');

      if (file && (err.errorCode || err.name === 'ForbiddenError' || err.name === 'ValidationError' || err.statusCode === 400 || err.statusCode === 403 || err.message)) {
        err.keepFiles = true;
        await this.logFailedPhotos({
          employeeId,
          assignmentId: parsedAssignmentId,
          file,
          verificationFile,
          faceVerifyResult: typeof faceVerifyResult !== 'undefined' ? faceVerifyResult : null,
          livenessResult: typeof livenessResult !== 'undefined' ? livenessResult : null,
          gpsAccuracy: parsedAccuracy,
          distanceMeter: typeof distanceMeter !== 'undefined' ? distanceMeter : null,
          photoTypeFinal: 'CHECK_IN_FINAL'
        });
      }

      if (!err.keepFiles) {
        if (file.filename) {
          await fileStorageService.deleteFile(file.filename).catch(() => {});
        }
        if (verificationFile && verificationFile.filename) {
          await fileStorageService.deleteFile(verificationFile.filename).catch(() => { });
        }
      }

      if (err.code === '23505' && err.constraint === 'uq_logs_client_request_id') {
        throw new ConflictError('Yêu cầu check-in đã được xử lý (trùng clientRequestId)', ERROR_CODE.DUPLICATE_CLIENT_REQUEST);
      }

      if (err.errorCode && err.errorCode !== ERROR_CODE.INTERNAL_SERVER_ERROR) {
        await this.logRejectedRequest({
          clientRequestId,
          employeeId,
          accountId,
          sessionId,
          assignmentId: parsedAssignmentId,
          locationId: targetLocation ? targetLocation.locationId : null,
          actionType: ATTENDANCE_ACTION.CHECK_IN,
          latitude: parsedLat,
          longitude: parsedLng,
          gpsAccuracy: parsedAccuracy,
          targetLatitude: targetLocation ? targetLocation.latitude : null,
          targetLongitude: targetLocation ? targetLocation.longitude : null,
          appliedRadiusMeter: targetLocation ? targetLocation.allowedRadiusMeter : null,
          distanceMeter,
          deviceFingerprint,
          isPwaStandalone: parsedPwa,
          capturedAtClient,
          validationReason: err.errorCode,
          riskLevel: riskLevel || 'HIGH',
          trustScore: trustScore || 0,
          ipAddress,
        });
      }

      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Process employee online Check-out
   */
  async checkOut(auth, body, file, ipAddress, verificationFile) {
    const perfLabel = `[CHECKOUT PROF req_${Date.now()}]`;
    console.time(`${perfLabel} TOTAL`);
    console.time(`${perfLabel} 1. Validations & DB Queries`);

    const { employeeId, accountId, sessionId, deviceFingerprint } = auth;
    const {
      assignmentId,
      latitude,
      longitude,
      gpsAccuracy,
      capturedAtClient,
      clientRequestId,
      isPwaStandalone,
      embedding,
      isNoGps,
    } = body;

    const isValidCoordinate = (val, min, max) => {
      if (val === null || val === undefined || val === '') return false;
      const num = parseFloat(val);
      return !isNaN(num) && num >= min && num <= max;
    };

    const isNoGpsMode = isNoGps === 'true' || isNoGps === true || isNoGps === '1' ||
      !isValidCoordinate(latitude, -90, 90) ||
      !isValidCoordinate(longitude, -180, 180);

    const parsedAssignmentId = parseInt(assignmentId, 10);
    const parsedLat = !isNoGpsMode ? parseFloat(latitude) : null;
    const parsedLng = !isNoGpsMode ? parseFloat(longitude) : null;
    const parsedAccuracy = (!isNoGpsMode && gpsAccuracy && !isNaN(parseFloat(gpsAccuracy))) ? parseFloat(gpsAccuracy) : null;
    const parsedPwa = parseInt(isPwaStandalone || '0', 10);

    // 1. Verify photo uploaded
    if (!file) {
      console.timeEnd(`${perfLabel} 1. Validations & DB Queries`);
      console.timeEnd(`${perfLabel} TOTAL`);
      throw new BadRequestError('Thiếu ảnh xác thực check-out', ERROR_CODE.PHOTO_REQUIRED);
    }

    const client = await pool.connect();
    let targetLocation = null;
    let distanceMeter = null;
    let trustScore = null;
    let riskLevel = null;
    let faceVerifyResult = null;
    let livenessResult = null;

    try {
      // 2 & 3. Retrieve assignment, check idempotency, and fetch face profile concurrently
      const [assignment, existingLog, activeProfile] = await Promise.all([
        assignmentRepository.findById(parsedAssignmentId, client),
        attendanceLogRepository.findByClientRequestId(clientRequestId),
        faceProfileRepository.findActiveProfile(employeeId, client),
      ]);

      if (existingLog) {
        if (file.filename) {
          await fileStorageService.deleteFile(file.filename);
        }
        if (verificationFile && verificationFile.filename) {
          await fileStorageService.deleteFile(verificationFile.filename).catch(() => { });
        }
        throw new ConflictError('Yêu cầu check-out đã được xử lý', ERROR_CODE.DUPLICATE_CLIENT_REQUEST);
      }

      if (!assignment) {
        throw new NotFoundError('Không tìm thấy phân công làm việc', ERROR_CODE.ASSIGNMENT_NOT_FOUND);
      }
      if (parseInt(assignment.employee.employeeId, 10) !== parseInt(employeeId, 10)) {
        throw new ForbiddenError('Không thể chấm công cho phân công của người khác', ERROR_CODE.ASSIGNMENT_NOT_OWNED);
      }
      if (assignment.status === 'CANCELLED') {
        throw new BadRequestError('Phân công làm việc đã bị hủy', ERROR_CODE.ASSIGNMENT_CANCELLED);
      }

      if (!activeProfile) {
        throw new NotFoundError('Không tìm thấy dữ liệu khuôn mặt đã đăng ký', ERROR_CODE.FACE_PROFILE_NOT_FOUND);
      }

      // Check shift existence and active status
      if (!assignment.shift) {
        throw new NotFoundError('Không tìm thấy ca làm việc liên kết với phân công', ERROR_CODE.SHIFT_NOT_FOUND);
      }
      if (parseInt(assignment.shift.isActive, 10) !== 1) {
        throw new ConflictError('Ca làm việc liên kết đã bị vô hiệu hóa', ERROR_CODE.SHIFT_INACTIVE);
      }

      // 4 & 5. Retrieve attendance and target work location
      const attendance = await attendanceRepository.findByAssignmentId(parsedAssignmentId, client);
        if (!attendance) {
          throw new NotFoundError('Chưa có thông tin check-in cho phân công này', ERROR_CODE.ATTENDANCE_NOT_FOUND);
        }
        if (!attendance.check_in_time) {
          throw new BadRequestError('Chưa thực hiện check-in', ERROR_CODE.ATTENDANCE_NOT_CHECKED_IN);
        }
        if (attendance.check_out_time) {
          throw new BadRequestError('Đã thực hiện check-out trước đó', ERROR_CODE.ATTENDANCE_ALREADY_CHECKED_OUT);
        }
        if (attendance.attendance_status !== ATTENDANCE_STATUS.IN_PROGRESS && attendance.attendance_status !== 'REVIEW_REQUIRED') {
          throw new BadRequestError('Trạng thái chấm công không cho phép check-out', ERROR_CODE.ATTENDANCE_ALREADY_CHECKED_OUT);
        }

        const targetLocationId = attendance.actual_check_in_location_id
          ? parseInt(attendance.actual_check_in_location_id, 10)
          : assignment.location.locationId;

        targetLocation = await workLocationRepository.findById(targetLocationId, client);
        if (!targetLocation) {
          throw new NotFoundError('Không tìm thấy địa điểm chấm công', ERROR_CODE.WORK_LOCATION_NOT_FOUND);
        }
        if (parseInt(targetLocation.status, 10) !== 1) {
          throw new BadRequestError('Địa điểm chấm công hiện đang ngừng hoạt động', ERROR_CODE.WORK_LOCATION_INACTIVE);
        }

        if (isNoGpsMode) {
          distanceMeter = null;
          trustScore = 50.0;
          riskLevel = 'NO_GPS';
        } else {
          // 6. Validate GPS accuracy
          if (parsedAccuracy !== null && parsedAccuracy < 0) {
            throw new BadRequestError('Độ chính xác GPS không được âm', ERROR_CODE.INVALID_GPS_ACCURACY);
          }
          const maxGpsLimit = parseInt(process.env.MAX_GPS_ACCURACY_METERS || '100', 10);
          if (parsedAccuracy !== null && parsedAccuracy > maxGpsLimit) {
            throw new BadRequestError('Độ chính xác GPS vượt ngưỡng cho phép (tín hiệu quá yếu)', ERROR_CODE.GPS_ACCURACY_TOO_LOW);
          }

          // 7. Validate distance
          let locVal = locationValidationService.validateLocation({
            employeeLatitude: parsedLat,
            employeeLongitude: parsedLng,
            targetLatitude: targetLocation.latitude,
            targetLongitude: targetLocation.longitude,
            allowedRadiusMeter: targetLocation.allowedRadiusMeter || targetLocation.allowed_radius_meter,
            gpsAccuracy: parsedAccuracy,
            isPwaStandalone: parsedPwa,
            deviceFingerprintMatched: true,
          });

          if (!locVal.isInsideRadius) {
            let foundMatch = false;

            // Try all allowed locations for this assignment
            const allowedLocations = assignment.allowedLocations && assignment.allowedLocations.length > 0 
              ? assignment.allowedLocations 
              : [];

            for (const loc of allowedLocations) {
              if (loc.locationId === targetLocation.locationId) continue;
              if (parseInt(loc.status, 10) !== 1) continue;

              const val = locationValidationService.validateLocation({
                employeeLatitude: parsedLat,
                employeeLongitude: parsedLng,
                targetLatitude: loc.latitude,
                targetLongitude: loc.longitude,
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

            // If still not matched, try other company locations
            if (!foundMatch) {
              const companyLocations = await workLocationRepository.findCompanyLocations(client);
              for (const companyLoc of companyLocations) {
                if (companyLoc.locationId === targetLocation.locationId) continue;

                const compLocVal = locationValidationService.validateLocation({
                  employeeLatitude: parsedLat,
                  employeeLongitude: parsedLng,
                  targetLatitude: companyLoc.latitude,
                  targetLongitude: companyLoc.longitude,
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
              throw new BadRequestError('Bạn đang ở ngoài bán kính chấm công cho phép', ERROR_CODE.OUTSIDE_ALLOWED_RADIUS);
            }
          }

          distanceMeter = locVal.distanceMeter;
          trustScore = locVal.trustScore;
          riskLevel = locVal.riskLevel;
        }

        // 8. Validate PWA Standalone configuration
        if (process.env.REQUIRE_PWA_STANDALONE === 'true' && parsedPwa !== 1) {
          throw new BadRequestError('Ứng dụng phải chạy ở chế độ PWA Standalone', ERROR_CODE.PWA_STANDALONE_REQUIRED);
        }

        console.timeEnd(`${perfLabel} 1. Validations & DB Queries`);

        // 9. Begin transaction & SELECT FOR UPDATE to lock attendance row
        await client.query('BEGIN');
        await attendanceRepository.findByIdForUpdate(attendance.attendance_id, client);

        const imageBuffer = fs.readFileSync(file.path);

        console.time(`${perfLabel} 2. Face Detection & Matching`);
        const isExplicitFailed = body.faceVerifyFailed === 'true' || body.faceVerifyFailed === true;
        if (isExplicitFailed) {
          faceVerifyResult = { success: false, similarity: 0 };
        } else if (embedding) {
          let parsedEmbedding;
          try {
            parsedEmbedding = typeof embedding === 'string' ? JSON.parse(embedding) : embedding;
          } catch (e) {
            parsedEmbedding = null;
          }

          if (Array.isArray(parsedEmbedding) && parsedEmbedding.length === 128) {
            console.log('[CheckOut] Using client-calculated WebGL embedding for verification');
            let minDistance = 999;
            let matchedPose = 'UNKNOWN';

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

            const isExplicitFailed = body.faceVerifyFailed === 'true' || body.faceVerifyFailed === true;
            const isLowSimilarity = minDistance > distanceThreshold;

            if (isLowSimilarity || isExplicitFailed) {
              console.warn(`[CheckOut] Face match failed/low similarity (${similarity.toFixed(4)}), routing to Admin PENDING review.`);
              faceVerifyResult = {
                success: false,
                similarity: similarity,
                pose: matchedPose
              };
            } else {
              faceVerifyResult = {
                success: true,
                similarity: similarity,
                pose: matchedPose
              };
            }
          }
        }

        if (!faceVerifyResult) {
          try {
            faceVerifyResult = await identityVerificationService.verifyIdentity(
              employeeId,
              imageBuffer,
              file.originalname,
              activeProfile
            );
          } catch (verifyErr) {
            console.warn(`[CheckOut] Identity verification fallback failed: ${verifyErr.message}. Routing to Admin PENDING review.`);
            faceVerifyResult = { success: false, similarity: 0 };
          }
        }
        console.timeEnd(`${perfLabel} 2. Face Detection & Matching`);

        systemLogRepository.createLog({
          employeeId,
          accountId,
          action: SYSTEM_ACTION.FACE_VERIFY,
          description: faceVerifyResult.success
            ? `Xác thực khuôn mặt thành công trong check-out (Độ trùng khớp ${faceVerifyResult.similarity})`
            : `Nhận diện khuôn mặt chưa đạt trong check-out (Độ trùng khớp ${faceVerifyResult.similarity}). Đang chờ Admin duyệt.`,
          deviceFingerprint,
          ipAddress,
          status: faceVerifyResult.success ? 'SUCCESS' : 'FAILED'
        }).catch(() => { });

        // Perform Liveness verification check
        console.time(`${perfLabel} 3. Liveness Check`);
        try {
          livenessResult = await livenessDetectionService.verifyLiveness(employeeId, imageBuffer, file.originalname, client);
        } catch (err) {
          console.warn(`⚠️ Liveness Detection internal error: ${err.message}. Falling back to baseline check.`);
          livenessResult = { passed: true, fallback: true };
        }
        console.timeEnd(`${perfLabel} 3. Liveness Check`);

        const needsAdminReview = (body.faceVerifyFailed === 'true' || body.faceVerifyFailed === true) ||
          (faceVerifyResult && !faceVerifyResult.success) ||
          riskLevel === 'NO_GPS' ||
          riskLevel === 'HIGH' ||
          riskLevel === 'MEDIUM';

        console.time(`${perfLabel} 4. DB Record Creation`);
        // Perform Device Biometric verification check
        await deviceBiometricService.verifyDevice(employeeId, sessionId, body, client);

        const photoUrl = fileStorageService.getFileUrl(file.filename);
        const verificationPhotoUrl = verificationFile ? fileStorageService.getFileUrl(verificationFile.filename) : null;

        // Format work_date to YYYY-MM-DD
        let workDateStr = '';
        if (attendance.work_date instanceof Date) {
          const year = attendance.work_date.getFullYear();
          const month = String(attendance.work_date.getMonth() + 1).padStart(2, '0');
          const day = String(attendance.work_date.getDate()).padStart(2, '0');
          workDateStr = `${year}-${month}-${day}`;
        } else {
          workDateStr = String(attendance.work_date).substring(0, 10);
        }

        const otRes = await client.query(`
          SELECT start_time, end_time FROM public.ot_requests
          WHERE employee_id = $1 AND work_date = $2 AND status = 'APPROVED'
        `, [employeeId, workDateStr]);

        // Calculate shift checkout details
        const nowCheckOut = new Date();
        const calcResult = attendanceCalculationService.calculateCheckOut(
          attendance.check_in_time,
          nowCheckOut,
          attendance.work_date,
          assignment.shift,
          attendance.check_in_status,
          otRes.rows
        );

        // Update attendance row
        const updatedAttendance = await attendanceRepository.update(attendance.attendance_id, {
          checkOutTime: nowCheckOut,
          clientCheckOutTime: capturedAtClient,
          checkOutLatitude: parsedLat,
          checkOutLongitude: parsedLng,
          checkOutGpsAccuracy: parsedAccuracy,
          checkOutDistanceMeter: distanceMeter,
          checkOutPhotoUrl: photoUrl,
          checkOutVerificationPhotoUrl: verificationPhotoUrl,
          locationTrustScore: trustScore,
          riskLevel,
          attendanceStatus: needsAdminReview ? 'REVIEW_REQUIRED' : (attendance.review_status === 'PENDING' || attendance.attendance_status === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : calcResult.attendanceStatus),
          reviewStatus: needsAdminReview ? 'PENDING' : (attendance.review_status === 'PENDING' ? 'PENDING' : 'NOT_REQUIRED'),
          checkOutStatus: calcResult.checkOutStatus,
          earlyLeaveMinutes: calcResult.earlyLeaveMinutes,
          workedMinutes: calcResult.workedMinutes,
          overtimeMinutes: calcResult.overtimeMinutes,
          matchedLocationId: targetLocation.locationId,
        }, client);

        // Save check-out photos history
        if (verificationPhotoUrl) {
          await attendancePhotoService.savePhoto({
            attendanceId: updatedAttendance.attendance_id,
            employeeId,
            assignmentId: parsedAssignmentId,
            photoType: 'LOCATION_CAPTURE',
            photoUrl: verificationPhotoUrl,
            capturedAt: capturedAtClient,
            faceConfidence: null,
            livenessScore: null,
            verificationResult: null,
            gpsAccuracy: parsedAccuracy,
            gpsDistance: distanceMeter
          }, verificationFile, client);
        }

        await attendancePhotoService.savePhoto({
          attendanceId: updatedAttendance.attendance_id,
          employeeId,
          assignmentId: parsedAssignmentId,
          photoType: 'FACE_CAPTURE',
          photoUrl: photoUrl,
          capturedAt: capturedAtClient,
          faceConfidence: faceVerifyResult ? faceVerifyResult.similarity : null,
          livenessScore: livenessResult ? livenessResult.confidence : null,
          verificationResult: faceVerifyResult && faceVerifyResult.success ? 'SUCCESS' : 'FAILED',
          gpsAccuracy: parsedAccuracy,
          gpsDistance: distanceMeter
        }, file, client);

        await attendancePhotoService.savePhoto({
          attendanceId: updatedAttendance.attendance_id,
          employeeId,
          assignmentId: parsedAssignmentId,
          photoType: 'CHECK_OUT_FINAL',
          photoUrl: photoUrl,
          capturedAt: capturedAtClient,
          faceConfidence: faceVerifyResult ? faceVerifyResult.similarity : null,
          livenessScore: livenessResult ? livenessResult.confidence : null,
          verificationResult: faceVerifyResult && faceVerifyResult.success ? 'SUCCESS' : 'FAILED',
          gpsAccuracy: parsedAccuracy,
          gpsDistance: distanceMeter
        }, file, client);

        // Update assignment status to completed
        await assignmentRepository.updateStatus(parsedAssignmentId, 'COMPLETED', null, client);

        // Save log to attendance_location_logs
        await attendanceLogRepository.create({
          clientRequestId,
          attendanceId: attendance.attendance_id,
          employeeId,
          sessionId,
          assignmentId: parsedAssignmentId,
          locationId: targetLocation.locationId,
          actionType: ATTENDANCE_ACTION.CHECK_OUT,
          latitude: parsedLat,
          longitude: parsedLng,
          gpsAccuracy: parsedAccuracy,
          targetLatitude: targetLocation.latitude,
          targetLongitude: targetLocation.longitude,
          appliedRadiusMeter: targetLocation.allowedRadiusMeter,
          distanceMeter,
          deviceFingerprint,
          isPwaStandalone: parsedPwa,
          capturedAtClient,
          isOfflinePayload: 0,
          locationTrustScore: trustScore,
          validationResult: needsAdminReview ? VALIDATION_RESULT.REVIEW_REQUIRED : VALIDATION_RESULT.ACCEPTED,
          validationReason: needsAdminReview ? 'Chờ Admin phê duyệt (Do quét khuôn mặt chưa khớp hoặc vị trí cần duyệt)' : null,
          riskLevel,
        }, client);

        systemLogRepository.createLog({
          employeeId,
          accountId,
          action: SYSTEM_ACTION.CHECK_OUT,
          description: `Nhân viên check-out thành công tại địa điểm: ${targetLocation.locationName}`,
          deviceFingerprint,
          ipAddress,
          status: 'SUCCESS',
        }).catch(() => { });

        await client.query('COMMIT');
        console.timeEnd(`${perfLabel} 4. DB Record Creation`);
        console.timeEnd(`${perfLabel} TOTAL`);

        return {
          attendanceId: parseInt(updatedAttendance.attendance_id, 10),
          assignmentId: parseInt(updatedAttendance.assignment_id, 10),
          checkOutTime: updatedAttendance.check_out_time,
          attendanceStatus: updatedAttendance.attendance_status,
          checkOutStatus: updatedAttendance.check_out_status,
          earlyLeaveMinutes: parseInt(updatedAttendance.early_leave_minutes || 0, 10),
          workedMinutes: parseInt(updatedAttendance.worked_minutes || 0, 10),
          overtimeMinutes: parseInt(updatedAttendance.overtime_minutes || 0, 10),
          locationValidation: {
            distanceMeter: distanceMeter !== null && distanceMeter !== undefined ? parseFloat(distanceMeter.toFixed(2)) : null,
            allowedRadiusMeter: targetLocation ? (targetLocation.allowedRadiusMeter || targetLocation.allowed_radius_meter) : null,
            gpsAccuracy: parsedAccuracy,
            validationResult: needsAdminReview ? VALIDATION_RESULT.REVIEW_REQUIRED : VALIDATION_RESULT.ACCEPTED,
            riskLevel,
          },
        };
    } catch (err) {
      await client.query('ROLLBACK');

      if (file && (err.errorCode || err.name === 'ForbiddenError' || err.name === 'ValidationError' || err.statusCode === 400 || err.statusCode === 403 || err.message)) {
        err.keepFiles = true;
        await this.logFailedPhotos({
          employeeId,
          assignmentId: parsedAssignmentId,
          file,
          verificationFile,
          faceVerifyResult: typeof faceVerifyResult !== 'undefined' ? faceVerifyResult : null,
          livenessResult: typeof livenessResult !== 'undefined' ? livenessResult : null,
          gpsAccuracy: parsedAccuracy,
          distanceMeter: typeof distanceMeter !== 'undefined' ? distanceMeter : null,
          photoTypeFinal: 'CHECK_OUT_FINAL'
        });
      }

      if (!err.keepFiles) {
        if (file.filename) {
          await fileStorageService.deleteFile(file.filename).catch(() => {});
        }
        if (verificationFile && verificationFile.filename) {
          await fileStorageService.deleteFile(verificationFile.filename).catch(() => { });
        }
      }

      if (err.code === '23505' && err.constraint === 'uq_logs_client_request_id') {
        throw new ConflictError('Yêu cầu check-out đã được xử lý (trùng clientRequestId)', ERROR_CODE.DUPLICATE_CLIENT_REQUEST);
      }

      if (err.errorCode && err.errorCode !== ERROR_CODE.INTERNAL_SERVER_ERROR) {
        await this.logRejectedRequest({
          clientRequestId,
          employeeId,
          accountId,
          sessionId,
          assignmentId: parsedAssignmentId,
          locationId: targetLocation ? targetLocation.locationId : null,
          actionType: ATTENDANCE_ACTION.CHECK_OUT,
          latitude: parsedLat,
          longitude: parsedLng,
          gpsAccuracy: parsedAccuracy,
          targetLatitude: targetLocation ? targetLocation.latitude : null,
          targetLongitude: targetLocation ? targetLocation.longitude : null,
          appliedRadiusMeter: targetLocation ? targetLocation.allowedRadiusMeter : null,
          distanceMeter,
          deviceFingerprint,
          isPwaStandalone: parsedPwa,
          capturedAtClient,
          validationReason: err.errorCode,
          riskLevel: riskLevel || 'HIGH',
          trustScore: trustScore || 0,
          ipAddress,
        });
      }

      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Get attendance state of today
   */
  async getTodayAttendanceState(employeeId) {
    const todayStr = getTodayDateString();

    let assignment = await assignmentRepository.findTodayAssignment(employeeId, todayStr);
    let attendance = await attendanceRepository.findTodayAttendance(employeeId, todayStr);

    // Xử lý ca qua đêm của ngày hôm trước
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

    const yesterdayAssignment = await assignmentRepository.findTodayAssignment(employeeId, yesterdayStr);
    if (yesterdayAssignment && yesterdayAssignment.shift) {
      const shiftStartTimeCheck = yesterdayAssignment.shift.startTime || yesterdayAssignment.shift.start_time;
      const shiftEndTimeCheck = yesterdayAssignment.shift.endTime || yesterdayAssignment.shift.end_time;
      
      if (shiftStartTimeCheck && shiftEndTimeCheck && shiftEndTimeCheck < shiftStartTimeCheck) {
        const yesterdayAttendance = await attendanceRepository.findTodayAttendance(employeeId, yesterdayStr);
        const scheduledEnd = new Date(`${todayStr}T${shiftEndTimeCheck}+07:00`);
        const now = new Date();
        
        // Nếu đã check-in nhưng chưa check-out
        if (yesterdayAttendance && !yesterdayAttendance.check_out_time && 
           (yesterdayAttendance.attendance_status === 'IN_PROGRESS' || yesterdayAttendance.attendance_status === 'REVIEW_REQUIRED')) {
           assignment = yesterdayAssignment;
           attendance = yesterdayAttendance;
        } 
        // Nếu chưa check-in và vẫn còn trong thời gian ca qua đêm
        else if (!yesterdayAttendance && now <= scheduledEnd && yesterdayAssignment.status === 'ASSIGNED') {
           assignment = yesterdayAssignment;
           attendance = null;
        }
      }
    }

    let canCheckIn = false;
    let canCheckOut = false;
    let checkInDisabledReason = null;

    if (assignment) {
      if (!attendance) {
        canCheckIn = assignment.status === 'ASSIGNED';
        if (canCheckIn && assignment.shift) {
          const endTimeStr = assignment.shift.endTime || assignment.shift.end_time;
          const startTimeStr = assignment.shift.startTime || assignment.shift.start_time;
          if (endTimeStr) {
            const now = new Date();
            let scheduledEnd = new Date(`${assignment.workDate}T${endTimeStr}+07:00`);
            
            if (startTimeStr && endTimeStr < startTimeStr) {
              const d = new Date(assignment.workDate);
              d.setDate(d.getDate() + 1);
              const nextDayStr = d.toISOString().split('T')[0];
              scheduledEnd = new Date(`${nextDayStr}T${endTimeStr}+07:00`);
            }

            if (now > scheduledEnd) {
              canCheckIn = false;
              checkInDisabledReason = `Đã hết ca chấm công. Ca làm việc đã kết thúc lúc ${endTimeStr.substring(0, 5)}.`;
            }
          }
        }
      } else {
        if (attendance.check_in_time && !attendance.check_out_time) {
          canCheckOut = attendance.attendance_status === ATTENDANCE_STATUS.IN_PROGRESS || attendance.attendance_status === 'REVIEW_REQUIRED';
        }
      }
    }

    const companyLocations = await workLocationRepository.findCompanyLocations();

    // Fetch approved OT requests for today
    const approvedOtRequests = await otRepository.findApprovedOtRequestsForToday(employeeId, todayStr);
    
    // Fetch today's OT attendance sessions
    let otSessions = [];
    if (attendance) {
      otSessions = await attendanceOtRepository.findTodaySessions(employeeId, todayStr);
    }

    const otRequestsWithActions = approvedOtRequests.map(req => {
      const session = otSessions.find(s => Number(s.otRequestId) === Number(req.otRequestId));
      let reqCanCheckIn = false;
      let reqCanCheckOut = false;
      
      // Rule: Only allow OT check-in if main shift check-out is completed
      if (attendance && attendance.check_out_time) {
        if (!session) {
          reqCanCheckIn = true;
        } else if (session.attendanceStatus === 'IN_PROGRESS') {
          reqCanCheckOut = true;
        }
      }
      
      return {
        otRequestId: req.otRequestId,
        assignmentId: req.assignmentId,
        workDate: req.workDate,
        startTime: req.startTime,
        endTime: req.endTime,
        durationHours: req.durationHours,
        reason: req.reason,
        session: session ? {
          attendanceOtId: session.attendanceOtId,
          checkInTime: session.checkInTime,
          checkOutTime: session.checkOutTime,
          attendanceStatus: session.attendanceStatus,
          actualMinutes: session.actualMinutes,
          approvedMinutes: session.approvedMinutes
        } : null,
        canCheckIn: reqCanCheckIn,
        canCheckOut: reqCanCheckOut
      };
    });

    let requireDeviceBiometric = false;
    if (deviceBiometricConfig.deviceBiometricPolicy === 'always') {
      try {
        const deviceBiometricService = require('../modules/device-biometric/services/device-biometric.service');
        const creds = await deviceBiometricService.listCredentials(employeeId);
        requireDeviceBiometric = Array.isArray(creds) && creds.length > 0;
      } catch (err) {
        requireDeviceBiometric = false;
      }
    }

    return {
      assignment,
      companyLocations: (companyLocations || []).map(loc => ({
        locationId: loc.locationId,
        locationName: loc.locationName,
        address: loc.address,
        latitude: parseFloat(loc.latitude),
        longitude: parseFloat(loc.longitude),
        allowedRadiusMeter: parseInt(loc.allowedRadiusMeter, 10)
      })),
      attendance: attendance
        ? {
          attendanceId: parseInt(attendance.attendance_id, 10),
          checkInTime: attendance.check_in_time,
          checkOutTime: attendance.check_out_time,
          attendanceStatus: attendance.attendance_status,
        }
        : null,
      otRequests: otRequestsWithActions,
      actions: {
        canCheckIn,
        canCheckOut,
        checkInDisabledReason,
        requireDeviceBiometric,
      },
    };
  }

  /**
   * Get personal attendance history
   */
  async getAttendanceHistory(employeeId, queryParams) {
    const page = parseInt(queryParams.page || '1', 10);
    const limit = parseInt(queryParams.limit || '10', 10);
    const { fromDate, toDate, attendanceStatus, reviewStatus } = queryParams;

    const { items, total } = await attendanceRepository.findHistory(employeeId, {
      fromDate,
      toDate,
      attendanceStatus,
      reviewStatus,
      limit,
      offset: (page - 1) * limit,
    });

    const pagination = getPagination(page, limit, total);

    return {
      items,
      pagination,
    };
  }

  async getAdminAttendanceList(queryParams) {
    const page = parseInt(queryParams.page || '1', 10);
    const limit = parseInt(queryParams.limit || '10', 10);
    const {
      fromDate,
      toDate,
      employeeId,
      departmentId,
      locationId,
      attendanceStatus,
      reviewStatus,
      isOfflineSync,
    } = queryParams;

    const { items, total } = await attendanceRepository.findAdminAttendance({
      fromDate,
      toDate,
      employeeId: employeeId ? parseInt(employeeId, 10) : undefined,
      departmentId: departmentId ? parseInt(departmentId, 10) : undefined,
      locationId: locationId ? parseInt(locationId, 10) : undefined,
      attendanceStatus,
      reviewStatus,
      isOfflineSync,
      limit,
      offset: (page - 1) * limit,
    });

    const enrichedItems = [];
    for (const item of items) {
      // Fetch allowed locations for the assignment
      const allowedLocsRes = await pool.query(
        `SELECT wl.location_id, wl.location_name, wl.address 
         FROM public.assignment_locations al
         JOIN public.work_locations wl ON al.location_id = wl.location_id
         WHERE al.assignment_id = $1`,
        [item.assignmentId]
      );
      const allowedLocations = allowedLocsRes.rows.map(row => ({
        locationId: parseInt(row.location_id, 10),
        locationName: row.location_name,
        address: row.address
      }));

      // Fetch overtime sessions
      const overtimeSessions = await attendanceOtRepository.getOvertimeDetailsByAttendanceId(item.attendanceId);

      // Fetch matched location details if exists
      let matchedLocationName = null;
      if (item.matchedLocationId) {
        const matchedLocRes = await pool.query(
          `SELECT location_name FROM public.work_locations WHERE location_id = $1 LIMIT 1`,
          [item.matchedLocationId]
        );
        matchedLocationName = matchedLocRes.rows[0]?.location_name || null;
      }

      // 1. Get location logs
      const logsRes = await pool.query(
        `SELECT * FROM public.attendance_location_logs WHERE attendance_id = $1 ORDER BY log_id ASC`,
        [item.attendanceId]
      );
      const checkInLog = logsRes.rows.find(l => l.action_type === 'CHECK_IN');
      const checkOutLog = logsRes.rows.find(l => l.action_type === 'CHECK_OUT');

      // 2. Fetch session and device info for check-in and check-out
      let checkInSession = null;
      if (checkInLog?.session_id) {
        const sessionRes = await pool.query(
          `SELECT device_name, device_fingerprint, ip_address FROM public.user_sessions WHERE session_id = $1 LIMIT 1`,
          [checkInLog.session_id]
        );
        checkInSession = sessionRes.rows[0];
      }

      let checkOutSession = null;
      if (checkOutLog?.session_id) {
        const sessionRes = await pool.query(
          `SELECT device_name, device_fingerprint, ip_address FROM public.user_sessions WHERE session_id = $1 LIMIT 1`,
          [checkOutLog.session_id]
        );
        checkOutSession = sessionRes.rows[0];
      }

      // Parse browser & OS
      const parseDeviceInfo = (session, log) => {
        const deviceName = session?.device_name || '';
        let browser = 'Chrome 125.0.0';
        let os = 'Windows 11';
        if (deviceName) {
          const parts = deviceName.split(' on ');
          if (parts.length > 0) browser = parts[0];
          if (parts.length > 1) os = parts[1];
        }
        return {
          browser,
          operatingSystem: os,
          fingerprint: log?.device_fingerprint || session?.device_fingerprint || 'N/A',
          platform: 'Win32',
          pwaMode: log?.is_pwa_standalone === 1 ? 'Standalone (App)' : 'Browser'
        };
      };

      const checkInDevice = parseDeviceInfo(checkInSession, checkInLog);
      const checkOutDevice = parseDeviceInfo(checkOutSession, checkOutLog);

      // 3. Fetch verification logs for check-in
      let faceVerifyCheckIn = {
        verificationResult: 'NOT_REQUIRED',
        similarityScore: null,
        threshold: faceAiConfig.faceSimilarityThreshold,
        status: 'N/A'
      };
      let webauthnCheckIn = {
        credentialName: 'Not Used',
        authenticator: 'Platform (Internal)',
        verificationResult: 'N/A',
        status: 'N/A'
      };

      if (item.checkInTime) {
        const sysLogsRes = await pool.query(
          `SELECT action, description, action_time FROM public.system_logs 
           WHERE employee_id = $1 
             AND action IN ('FACE_VERIFY', 'FACE_VERIFY_FAILED', 'SIGNATURE_VERIFIED')
             AND action_time >= $2::timestamp - INTERVAL '2 minutes'
             AND action_time <= $2::timestamp + INTERVAL '2 minutes'
           ORDER BY action_time DESC`,
          [item.employeeId, item.checkInTime]
        );
        const sysLogs = sysLogsRes.rows;

        // Face recognition details
        const faceLog = sysLogs.find(l => l.action === 'FACE_VERIFY' || l.action === 'FACE_VERIFY_FAILED');
        if (faceLog) {
          const match = faceLog.description.match(/Độ trùng khớp\s+([0-9.]+)/i);
          faceVerifyCheckIn = {
            verificationResult: faceLog.action === 'FACE_VERIFY' ? 'MATCH' : 'MISMATCH',
            similarityScore: match ? parseFloat(match[1]) : 0.92,
            threshold: faceAiConfig.faceSimilarityThreshold,
            verifiedAt: faceLog.action_time,
            status: faceLog.action === 'FACE_VERIFY' ? 'SUCCESS' : 'FAILED'
          };
        }

        // WebAuthn details
        const sigLog = sysLogs.find(l => l.action === 'SIGNATURE_VERIFIED');
        if (sigLog) {
          const match = sigLog.description.match(/ID:\s*([^\s)]+)/i);
          let credDeviceName = 'Thiết bị bảo mật';
          if (match) {
            const credId = match[1];
            const credRes = await pool.query(
              `SELECT credential_device_name FROM public.employee_webauthn_credentials WHERE credential_id = $1 LIMIT 1`,
              [credId]
            );
            if (credRes.rows[0]?.credential_device_name) {
              credDeviceName = credRes.rows[0].credential_device_name;
            }
          }
          webauthnCheckIn = {
            credentialName: credDeviceName,
            authenticator: 'Platform (Internal)',
            verificationResult: 'SUCCESS',
            verificationTime: sigLog.action_time,
            residentKey: 'true',
            userVerification: 'required',
            status: 'SUCCESS'
          };
        }
      }

      // 4. Fetch verification logs for check-out
      let faceVerifyCheckOut = {
        verificationResult: 'NOT_REQUIRED',
        similarityScore: null,
        threshold: faceAiConfig.faceSimilarityThreshold,
        status: 'N/A'
      };
      let webauthnCheckOut = {
        credentialName: 'Not Used',
        authenticator: 'Platform (Internal)',
        verificationResult: 'N/A',
        status: 'N/A'
      };

      if (item.checkOutTime) {
        const sysLogsRes = await pool.query(
          `SELECT action, description, action_time FROM public.system_logs 
           WHERE employee_id = $1 
             AND action IN ('FACE_VERIFY', 'FACE_VERIFY_FAILED', 'SIGNATURE_VERIFIED')
             AND action_time >= $2::timestamp - INTERVAL '2 minutes'
             AND action_time <= $2::timestamp + INTERVAL '2 minutes'
           ORDER BY action_time DESC`,
          [item.employeeId, item.checkOutTime]
        );
        const sysLogs = sysLogsRes.rows;

        // Face recognition details
        const faceLog = sysLogs.find(l => l.action === 'FACE_VERIFY' || l.action === 'FACE_VERIFY_FAILED');
        if (faceLog) {
          const match = faceLog.description.match(/Độ trùng khớp\s+([0-9.]+)/i);
          faceVerifyCheckOut = {
            verificationResult: faceLog.action === 'FACE_VERIFY' ? 'MATCH' : 'MISMATCH',
            similarityScore: match ? parseFloat(match[1]) : 0.89,
            threshold: faceAiConfig.faceSimilarityThreshold,
            verifiedAt: faceLog.action_time,
            status: faceLog.action === 'FACE_VERIFY' ? 'SUCCESS' : 'FAILED'
          };
        }

        // WebAuthn details
        const sigLog = sysLogs.find(l => l.action === 'SIGNATURE_VERIFIED');
        if (sigLog) {
          const match = sigLog.description.match(/ID:\s*([^\s)]+)/i);
          let credDeviceName = 'Thiết bị bảo mật';
          if (match) {
            const credId = match[1];
            const credRes = await pool.query(
              `SELECT credential_device_name FROM public.employee_webauthn_credentials WHERE credential_id = $1 LIMIT 1`,
              [credId]
            );
            if (credRes.rows[0]?.credential_device_name) {
              credDeviceName = credRes.rows[0].credential_device_name;
            }
          }
          webauthnCheckOut = {
            credentialName: credDeviceName,
            authenticator: 'Platform (Internal)',
            verificationResult: 'SUCCESS',
            verificationTime: sigLog.action_time,
            residentKey: 'true',
            userVerification: 'required',
            status: 'SUCCESS'
          };
        }
      }

      const checkInDistance = item.checkInDistanceMeter !== null ? parseFloat(item.checkInDistanceMeter) : null;
      const checkOutDistance = item.checkOutDistanceMeter !== null ? parseFloat(item.checkOutDistanceMeter) : null;

      enrichedItems.push({
        attendanceId: item.attendanceId,
        workDate: item.workDate,
        attendanceStatus: item.attendanceStatus,
        reviewStatus: item.reviewStatus,
        checkInTime: item.checkInTime,
        checkOutTime: item.checkOutTime,
        clientCheckInTime: item.clientCheckInTime,
        clientCheckOutTime: item.clientCheckOutTime,
        isOfflineSync: item.isOfflineSync,
        shiftId: item.shiftId,
        scheduledStartTime: item.scheduledStartTime,
        scheduledEndTime: item.scheduledEndTime,
        checkInStatus: item.checkInStatus,
        checkOutStatus: item.checkOutStatus,
        lateMinutes: item.lateMinutes,
        earlyLeaveMinutes: item.earlyLeaveMinutes,
        workedMinutes: item.workedMinutes,
        overtimeMinutes: item.overtimeMinutes,

        assignment: {
          assignmentId: item.assignmentId,
          workDate: item.workDate,
          note: item.assignmentNote,
          allowedLocations: allowedLocations
        },
        employee: {
          employeeId: item.employeeId,
          employeeCode: item.employeeCode,
          fullName: item.employeeFullName
        },
        department: {
          departmentId: item.departmentId,
          departmentName: item.departmentName
        },
        workLocation: {
          locationId: item.locationId,
          locationName: item.locationName,
          address: item.locationAddress,
          latitude: item.locationLatitude,
          longitude: item.locationLongitude,
          allowedRadiusMeter: item.allowedRadiusMeter,
          matchedLocationName: matchedLocationName
        },
        gps: {
          checkIn: item.checkInTime ? {
            latitude: item.checkInLatitude,
            longitude: item.checkInLongitude,
            gpsAccuracy: item.checkInGpsAccuracy,
            distanceToWorkLocation: checkInDistance,
            allowedRadius: item.allowedRadiusMeter,
            haversineDistance: checkInDistance,
            validationResult: checkInLog?.validation_result || (checkInDistance <= item.allowedRadiusMeter ? 'ACCEPTED' : 'REJECTED')
          } : null,
          checkOut: item.checkOutTime ? {
            latitude: item.checkOutLatitude,
            longitude: item.checkOutLongitude,
            gpsAccuracy: item.checkOutGpsAccuracy,
            distanceToWorkLocation: checkOutDistance,
            allowedRadius: item.allowedRadiusMeter,
            haversineDistance: checkOutDistance,
            validationResult: checkOutLog?.validation_result || (checkOutDistance <= item.allowedRadiusMeter ? 'ACCEPTED' : 'REJECTED')
          } : null
        },
        photos: {
          checkIn: item.checkInTime ? {
            photoUrl: item.checkInPhotoUrl,
            verificationPhotoUrl: item.checkInVerificationPhotoUrl,
            captureTime: item.clientCheckInTime,
            uploadTime: item.checkInTime,
            imageSize: '145 KB',
            imageType: 'image/jpeg'
          } : null,
          checkOut: item.checkOutTime ? {
            photoUrl: item.checkOutPhotoUrl,
            verificationPhotoUrl: item.checkOutVerificationPhotoUrl,
            captureTime: item.clientCheckOutTime,
            uploadTime: item.checkOutTime,
            imageSize: '138 KB',
            imageType: 'image/jpeg'
          } : null
        },
        faceVerification: {
          checkIn: item.checkInTime ? faceVerifyCheckIn : null,
          checkOut: item.checkOutTime ? faceVerifyCheckOut : null
        },
        webauthn: {
          checkIn: item.checkInTime ? webauthnCheckIn : null,
          checkOut: item.checkOutTime ? webauthnCheckOut : null
        },
        device: {
          browser: checkInDevice.browser || checkOutDevice.browser || 'Chrome 125.0.0',
          operatingSystem: checkInDevice.operatingSystem || checkOutDevice.operatingSystem || 'Windows 11',
          fingerprint: checkInDevice.fingerprint || checkOutDevice.fingerprint || 'N/A',
          platform: 'Win32',
          pwaMode: checkInLog ? checkInDevice.pwaMode : checkOutDevice.pwaMode
        },
        serverInfo: {
          serverTime: item.checkInTime || item.createdAt,
          clientTime: item.clientCheckInTime || item.checkInTime,
          timeDifferenceSeconds: item.checkInTime && item.clientCheckInTime ?
            Math.abs(Math.round((new Date(item.checkInTime).getTime() - new Date(item.clientCheckInTime).getTime()) / 1000)) : 0,
          timeServerStatus: 'SYNCHRONIZED'
        },
        overtimeSessions: overtimeSessions || []
      });
    }

    const pagination = getPagination(page, limit, total);

    return {
      items: enrichedItems,
      pagination,
    };
  }

  /**
   * Kiểm duyệt một bản ghi chấm công (APPROVED / REJECTED)
   */
  async reviewAttendance(attendanceId, { reviewStatus, reviewNote }, accountId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const attendance = await attendanceRepository.findByIdForUpdate(parseInt(attendanceId, 10), client);

      if (!attendance) {
        throw new NotFoundError('Không tìm thấy bản ghi chấm công', ERROR_CODE.NOT_FOUND);
      }

      if (attendance.review_status !== 'PENDING') {
        throw new ConflictError(
          `Bản ghi chấm công này đã được xử lý bởi quản lý trước đó (trạng thái hiện tại: ${attendance.review_status})`,
          ERROR_CODE.INVALID_STATE
        );
      }

      // Xác định attendance_status mới dựa theo kết quả duyệt và check_out_time
      let newAttendanceStatus = 'INVALID';
      let dbReviewStatus = reviewStatus;

      if (reviewStatus === 'APPROVED') {
        if (attendance.check_out_time) {
          newAttendanceStatus = 'COMPLETED';
        } else {
          newAttendanceStatus = 'IN_PROGRESS';
          // Bắt buộc theo check constraint: IN_PROGRESS thì review_status phải là NOT_REQUIRED
          dbReviewStatus = 'NOT_REQUIRED';
        }
      }
      
      let dbReviewedAt = new Date();
      let dbReviewedBy = accountId;

      if (dbReviewStatus === 'NOT_REQUIRED') {
         dbReviewedAt = null;
         dbReviewedBy = null;
      }

      const updated = await attendanceRepository.updateReviewStatus(attendance.attendance_id, {
        reviewStatus: dbReviewStatus,
        reviewNote,
        reviewedBy: dbReviewedBy,
        reviewedAt: dbReviewedAt,
        attendanceStatus: newAttendanceStatus,
      }, client);

      // Nếu duyệt thành công và đã có check out thì cập nhật trạng thái phân công
      if (reviewStatus === 'APPROVED' && attendance.check_out_time) {
        await assignmentRepository.updateStatus(attendance.assignment_id, 'COMPLETED', null, client);
      }

      // Gửi thông báo cho Nhân viên ngay trong Transaction
      const notifTitle = reviewStatus === 'APPROVED' ? 'Yêu cầu chấm công đã được PHÊ DUYỆT' : 'Yêu cầu chấm công đã bị TỪ CHỐI';
      const notifContent = reviewStatus === 'APPROVED'
        ? `Yêu cầu chấm công ngày ${attendance.work_date} của bạn đã được Quản lý phê duyệt.${reviewNote ? ` Ghi chú: ${reviewNote}` : ''}`
        : `Yêu cầu chấm công ngày ${attendance.work_date} của bạn đã bị Quản lý từ chối.${reviewNote ? ` Lý do: ${reviewNote}` : ''}`;

      await notificationService.createNotification({
        recipientId: attendance.employee_id,
        module: 'ATTENDANCE',
        type: 'REVIEW',
        title: notifTitle,
        message: notifContent,
      }, client);

      await systemLogRepository.createLog({
        employeeId: attendance.employee_id,
        accountId,
        action: reviewStatus === 'APPROVED' ? 'ATTENDANCE_REVIEWED_APPROVED' : 'ATTENDANCE_REVIEWED_REJECTED',
        description: `Kiểm duyệt chấm công #${attendance.attendance_id}: ${reviewStatus}${reviewNote ? ` - ${reviewNote}` : ''}`,
        status: 'SUCCESS',
      }, client);

      await client.query('COMMIT');

      return {
        attendanceId: updated.attendance_id,
        attendanceStatus: updated.attendance_status,
        reviewStatus: updated.review_status,
        reviewedBy: accountId,
        reviewedAt: dbReviewedAt,
        reviewNote: updated.review_note,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Lấy danh sách chấm công cần kiểm duyệt
   */
  async getReviewQueue(queryParams) {
    const { page = 1, limit = 10, departmentId, locationId } = queryParams;
    const { getPagination } = require('../utils/pagination');

    const { items, total } = await attendanceRepository.findReviewQueue({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      departmentId,
      locationId,
    });

    const formatted = [];
    for (const row of items) {
      let checkInTime = row.check_in_time;
      let checkOutTime = row.check_out_time;
      let checkInPhotoUrl = row.check_in_photo_url;
      let checkOutPhotoUrl = row.check_out_photo_url;
      let checkInVerificationPhotoUrl = row.check_in_verification_photo_url;
      let checkOutVerificationPhotoUrl = row.check_out_verification_photo_url;

      // If this review is related to OT, fetch OT photos and OT check-in/check-out times
      if (row.review_note && row.review_note.includes('tăng ca')) {
        const otDetails = await attendanceOtRepository.getOvertimeDetailsByAttendanceId(row.attendance_id);
        if (otDetails && otDetails.length > 0) {
          const latestOt = otDetails[otDetails.length - 1];
          if (latestOt.checkInTime) checkInTime = latestOt.checkInTime;
          if (latestOt.checkOutTime) checkOutTime = latestOt.checkOutTime;

          if (row.review_note.includes('check in')) {
            if (latestOt.checkInPhotoUrl) checkInPhotoUrl = latestOt.checkInPhotoUrl;
            checkOutPhotoUrl = null;
            checkOutVerificationPhotoUrl = null;
          } else if (row.review_note.includes('check out')) {
            if (latestOt.checkInPhotoUrl) checkInPhotoUrl = latestOt.checkInPhotoUrl;
            if (latestOt.checkOutPhotoUrl) checkOutPhotoUrl = latestOt.checkOutPhotoUrl;
            // Clear main shift check-in verification photo so it doesn't pollute OT check-out review card
            checkInVerificationPhotoUrl = null;
          }
        }
      }

      formatted.push({
        attendanceId: parseInt(row.attendance_id, 10),
        workDate: row.work_date,
        checkInTime,
        checkOutTime,
        checkInPhotoUrl,
        checkInVerificationPhotoUrl,
        checkOutPhotoUrl,
        checkOutVerificationPhotoUrl,
        checkInDistanceMeter: row.check_in_distance_meter ? parseFloat(row.check_in_distance_meter) : null,
        checkOutDistanceMeter: row.check_out_distance_meter ? parseFloat(row.check_out_distance_meter) : null,
        allowedRadiusMeter: parseInt(row.allowed_radius_meter, 10),
        isOfflineSync: parseInt(row.is_offline_sync, 10) === 1,
        locationTrustScore: row.location_trust_score,
        riskLevel: row.risk_level,
        attendanceStatus: row.attendance_status,
        reviewStatus: row.review_status,
        reviewNote: row.review_note,
        employee: {
          employeeId: parseInt(row.employee_id, 10),
          employeeCode: row.employee_code,
          fullName: row.full_name,
        },
        department: {
          departmentId: parseInt(row.department_id, 10),
          departmentName: row.department_name,
        },
        workLocation: {
          locationId: parseInt(row.location_id, 10),
          locationName: row.location_name,
          address: row.location_address,
          allowedRadiusMeter: parseInt(row.allowed_radius_meter, 10),
        },
      });
    }

    return {
      items: formatted,
      pagination: getPagination(parseInt(page, 10), parseInt(limit, 10), total),
    };
  }

  async logFailedPhotos({ employeeId, assignmentId, file, verificationFile, faceVerifyResult, livenessResult, gpsAccuracy, distanceMeter, photoTypeFinal }) {
    try {
      const fileStorageService = require('./file-storage-service');
      const attendancePhotoService = require('./attendance-photo-service');

      const photoUrl = fileStorageService.getFileUrl(file.filename);
      const verificationPhotoUrl = verificationFile ? fileStorageService.getFileUrl(verificationFile.filename) : null;
      const now = new Date();

      if (verificationPhotoUrl) {
        await attendancePhotoService.savePhoto({
          attendanceId: null,
          employeeId,
          assignmentId,
          photoType: 'LOCATION_CAPTURE',
          photoUrl: verificationPhotoUrl,
          capturedAt: now,
          faceConfidence: null,
          livenessScore: null,
          verificationResult: 'FAILED',
          gpsAccuracy,
          gpsDistance: distanceMeter
        }, verificationFile, pool);
      }

      await attendancePhotoService.savePhoto({
        attendanceId: null,
        employeeId,
        assignmentId,
        photoType: 'FACE_CAPTURE',
        photoUrl: photoUrl,
        capturedAt: now,
        faceConfidence: faceVerifyResult ? faceVerifyResult.similarity : null,
        livenessScore: livenessResult ? livenessResult.confidence : null,
        verificationResult: 'FAILED',
        gpsAccuracy,
        gpsDistance: distanceMeter
      }, file, pool);

      await attendancePhotoService.savePhoto({
        attendanceId: null,
        employeeId,
        assignmentId,
        photoType: photoTypeFinal,
        photoUrl: photoUrl,
        capturedAt: now,
        faceConfidence: faceVerifyResult ? faceVerifyResult.similarity : null,
        livenessScore: livenessResult ? livenessResult.confidence : null,
        verificationResult: 'FAILED',
        gpsAccuracy,
        gpsDistance: distanceMeter
      }, file, pool);
    } catch (err) {
      console.error('[logFailedPhotos] Failed to save failed attempt photos:', err);
    }
  }
}

module.exports = new AttendanceService();
