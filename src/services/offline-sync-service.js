const { pool } = require('../config/db');
const attendanceRepository = require('../repositories/attendance-repository');
const assignmentRepository = require('../repositories/assignment-repository');
const faceProfileRepository = require('../modules/face-recognition/repositories/face-profile-repository');
const workLocationRepository = require('../repositories/work-location-repository');
const systemLogRepository = require('../repositories/system-log-repository');
const livenessDetectionService = require('../modules/liveness/services/liveness-detection.service');
const identityVerificationService = require('../modules/face-recognition/services/identity-verification.service');
const locationValidationService = require('./location-validation-service');
const fileStorageService = require('./file-storage-service');
const attendancePhotoService = require('./attendance-photo-service');
const { calculateDistanceMeters } = require('../utils/haversine');
const { BadRequestError, ValidationError, NotFoundError, ConflictError } = require('../errors/app-error');
const ERROR_CODE = require('../constants/error-code.constants');
const SYSTEM_ACTION = require('../constants/system-action.constants');

class OfflineSyncService {
  async syncOfflineRecord(authContext, body, file, ipAddress) {
    const { employeeId, accountId, sessionId, deviceFingerprint } = authContext;
    const {
      queueId,
      clientRequestId,
      assignmentId,
      type,
      capturedAtClient,
      latitude,
      longitude,
      gpsAccuracy,
      isNoGps
    } = body;

    if (!file) {
      throw new BadRequestError('Thiếu ảnh xác thực đồng bộ ngoại tuyến', ERROR_CODE.PHOTO_REQUIRED);
    }

    const queueIdStr = queueId || clientRequestId;
    const parsedAssignmentId = (assignmentId && !isNaN(parseInt(assignmentId, 10))) ? parseInt(assignmentId, 10) : null;
    const isNoGpsMode = isNoGps === 'true' || isNoGps === true || !latitude || !longitude || isNaN(parseFloat(latitude)) || isNaN(parseFloat(longitude));
    const parsedLat = !isNoGpsMode ? parseFloat(latitude) : null;
    const parsedLng = !isNoGpsMode ? parseFloat(longitude) : null;
    const parsedAccuracy = !isNoGpsMode && gpsAccuracy ? parseFloat(gpsAccuracy) : null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 0. Idempotency Check: Avoid duplicate processing if queueId was already processed
      if (queueIdStr) {
        const existingByQueue = await client.query(
          'SELECT * FROM public.attendance WHERE queue_id = $1 OR client_request_id = $1 LIMIT 1',
          [queueIdStr]
        );
        if (existingByQueue.rows.length > 0) {
          await client.query('ROLLBACK');
          return {
            success: true,
            message: 'Bản ghi chấm công đã được xử lý trước đó (Idempotent)',
            data: existingByQueue.rows[0]
          };
        }
      }

      // 1. Fetch assignment or fallback to today's assignment for employee
      let assignment = null;
      if (parsedAssignmentId) {
        assignment = await assignmentRepository.findById(parsedAssignmentId, client);
      }
      if (!assignment) {
        const todayStr = capturedAtClient ? capturedAtClient.substring(0, 10) : new Date().toISOString().substring(0, 10);
        assignment = await assignmentRepository.findTodayAssignment(employeeId, todayStr, client);
      }

      if (!assignment) {
        throw new NotFoundError('Không tìm thấy phân công làm việc cho ngày này', ERROR_CODE.ASSIGNMENT_NOT_FOUND);
      }

      const targetAssignmentId = parseInt(assignment.assignmentId, 10);

      let distance = 0;
      let matchedLocation = assignment.location;
      let isInside = false;
      let riskLevel = 'LOW';
      let attendanceStatus = 'IN_PROGRESS';
      let reviewStatus = 'NOT_REQUIRED';
      let trustScore = 100.0;

      if (isNoGpsMode) {
        // No-GPS Technical Fallback: Bypass AI Face Recognition & GPS distance check
        riskLevel = 'NO_GPS';
        reviewStatus = 'PENDING';
        attendanceStatus = 'REVIEW_REQUIRED';
        trustScore = 50.0;
        isInside = false;
      } else {
        // Offline + GPS Normal: Check location distance
        const assignedLocation = await workLocationRepository.findById(assignment.location.locationId, client);
        const allowedLocations = assignment.allowedLocations && assignment.allowedLocations.length > 0
          ? assignment.allowedLocations
          : [assignedLocation || assignment.location];
        const activeAllowedLocations = allowedLocations.filter(loc => parseInt(loc.status, 10) === 1);

        let foundMatch = false;
        matchedLocation = assignedLocation || assignment.location;

        for (const loc of activeAllowedLocations) {
          const dist = calculateDistanceMeters(parsedLat, parsedLng, loc.latitude, loc.longitude);
          if (dist <= loc.allowedRadiusMeter) {
            distance = dist;
            matchedLocation = loc;
            foundMatch = true;
            break;
          }
        }

        if (!foundMatch) {
          const companyLocations = await workLocationRepository.findCompanyLocations(client);
          for (const companyLoc of companyLocations) {
            const dist = calculateDistanceMeters(parsedLat, parsedLng, companyLoc.latitude, companyLoc.longitude);
            if (dist <= companyLoc.allowedRadiusMeter) {
              distance = dist;
              matchedLocation = companyLoc;
              foundMatch = true;
              break;
            }
          }
        }

        isInside = foundMatch;
        reviewStatus = 'PENDING';
        attendanceStatus = 'REVIEW_REQUIRED';
        if (!isInside) {
          riskLevel = 'MEDIUM';
          trustScore = 60.0;
        } else {
          riskLevel = 'OFFLINE_SYNC';
          trustScore = 80.0;
        }
      }

      // Offline submission: allow syncing at any time, server records exact arrival timestamp
      let reviewNote = 'Đồng bộ ngoại tuyến - chờ Admin duyệt ảnh';

      const photoUrl = fileStorageService.getFileUrl(file.filename);

      let record;

      if (type === 'check-in') {
        // Check if attendance already exists
        const existing = await attendanceRepository.findByAssignmentId(targetAssignmentId, client);
        if (existing) {
          throw new ConflictError('Bản ghi chấm công đã tồn tại', ERROR_CODE.ATTENDANCE_EXISTS);
        }

        // Insert new attendance
        const res = await client.query(`
          INSERT INTO public.attendance (
            employee_id,
            assignment_id,
            work_date,
            check_in_time,
            client_check_in_time,
            check_in_latitude,
            check_in_longitude,
            check_in_gps_accuracy,
            check_in_distance_meter,
            check_in_photo_url,
            is_offline_sync,
            location_trust_score,
            risk_level,
            attendance_status,
            review_status,
            review_note,
            actual_check_in_location_id,
            matched_location_id,
            shift_id,
            trust_score,
            queue_id,
            client_request_id
          ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, $7, $8, $9, 1, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
          RETURNING *;
        `, [
          employeeId,
          targetAssignmentId,
          assignment.workDate,
          capturedAtClient,
          parsedLat,
          parsedLng,
          parsedAccuracy,
          distance,
          photoUrl,
          Math.round(trustScore),
          riskLevel,
          attendanceStatus,
          reviewStatus,
          reviewNote,
          matchedLocation.locationId,
          matchedLocation.locationId,
          assignment.shift.shiftId,
          trustScore,
          queueIdStr,
          clientRequestId || queueIdStr
        ]);
        record = res.rows[0];
      } else {
        // type = 'check-out'
        const existing = await attendanceRepository.findByAssignmentId(targetAssignmentId, client);
        if (!existing) {
          // If check-in wasn't synced yet, insert check-out record
          const res = await client.query(`
            INSERT INTO public.attendance (
              employee_id,
              assignment_id,
              work_date,
              check_out_time,
              client_check_out_time,
              check_out_latitude,
              check_out_longitude,
              check_out_gps_accuracy,
              check_out_distance_meter,
              check_out_photo_url,
              is_offline_sync,
              location_trust_score,
              risk_level,
              attendance_status,
              review_status,
              review_note,
              matched_location_id,
              shift_id,
              trust_score,
              queue_id,
              client_request_id
            ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, $7, $8, $9, 1, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
            RETURNING *;
          `, [
            employeeId,
            targetAssignmentId,
            assignment.workDate,
            capturedAtClient,
            parsedLat,
            parsedLng,
            parsedAccuracy,
            distance,
            photoUrl,
            Math.round(trustScore),
            riskLevel,
            attendanceStatus === 'IN_PROGRESS' ? 'COMPLETED' : attendanceStatus,
            reviewStatus,
            reviewNote,
            matchedLocation.locationId,
            assignment.shift.shiftId,
            trustScore,
            queueIdStr,
            clientRequestId || queueIdStr
          ]);
          record = res.rows[0];
        } else {
          // Update existing check-in row
          const finalAttendanceStatus = (riskLevel === 'NO_GPS' || riskLevel === 'HIGH' || riskLevel === 'MEDIUM') ? 'REVIEW_REQUIRED' : 'COMPLETED';
          const res = await client.query(`
            UPDATE public.attendance
            SET
              check_out_time = CURRENT_TIMESTAMP,
              client_check_out_time = $1,
              check_out_latitude = $2,
              check_out_longitude = $3,
              check_out_gps_accuracy = $4,
              check_out_distance_meter = $5,
              check_out_photo_url = $6,
              location_trust_score = $7,
              risk_level = $8,
              attendance_status = $9,
              review_status = $10,
              review_note = COALESCE($15, review_note),
              trust_score = $11,
              matched_location_id = COALESCE(matched_location_id, $12),
              queue_id = COALESCE(queue_id, $13),
              updated_at = CURRENT_TIMESTAMP
            WHERE attendance_id = $14
            RETURNING *;
          `, [
            capturedAtClient,
            parsedLat,
            parsedLng,
            parsedAccuracy,
            distance,
            photoUrl,
            Math.round(trustScore),
            riskLevel,
            finalAttendanceStatus,
            reviewStatus,
            trustScore,
            matchedLocation.locationId,
            queueIdStr,
            existing.attendance_id,
            reviewNote
          ]);
          record = res.rows[0];
        }

        // Complete assignment status if review not required
        if (reviewStatus === 'NOT_REQUIRED') {
          await assignmentRepository.updateStatus(targetAssignmentId, 'COMPLETED', null, client);
        }
      }

      // Save offline sync photo to attendance_photos
      await attendancePhotoService.savePhoto({
        attendanceId: record.attendance_id,
        employeeId,
        assignmentId: targetAssignmentId,
        photoType: 'OFFLINE_SYNC',
        photoUrl: photoUrl,
        capturedAt: capturedAtClient,
        faceConfidence: null,
        livenessScore: null,
        verificationResult: 'BYPASSED',
        gpsAccuracy: parsedAccuracy,
        gpsDistance: distance
      }, file, client);

      await client.query('COMMIT');
      return {
        success: true,
        message: 'Đồng bộ chấm công ngoại tuyến thành công',
        data: record
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new OfflineSyncService();
