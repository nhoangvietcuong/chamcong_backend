const { pool } = require('../config/db');

class AttendanceLogRepository {
  async findByClientRequestId(clientRequestId, dbClient = pool) {
    if (!clientRequestId) return null;
    const queryText = `
      SELECT * FROM public.attendance_location_logs
      WHERE client_request_id = $1
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [clientRequestId]);
    return res.rows[0];
  }

  async create(data, dbClient = pool) {
    const {
      clientRequestId,
      attendanceId = null,
      employeeId,
      sessionId = null,
      assignmentId = null,
      locationId = null,
      actionType,
      latitude = null,
      longitude = null,
      gpsAccuracy = null,
      targetLatitude = null,
      targetLongitude = null,
      appliedRadiusMeter = null,
      distanceMeter = null,
      deviceFingerprint = null,
      isPwaStandalone = 0,
      capturedAtClient = null,
      isOfflinePayload = 0,
      locationTrustScore = null,
      validationResult,
      validationReason = null,
      riskLevel = null,
    } = data;

    const queryText = `
      INSERT INTO public.attendance_location_logs (
        client_request_id,
        attendance_id,
        employee_id,
        session_id,
        assignment_id,
        location_id,
        action_type,
        latitude,
        longitude,
        gps_accuracy,
        target_latitude,
        target_longitude,
        applied_radius_meter,
        distance_meter,
        device_fingerprint,
        is_pwa_standalone,
        captured_at_client,
        received_at_server,
        is_offline_payload,
        location_trust_score,
        validation_result,
        validation_reason,
        risk_level
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP, $18, $19, $20, $21, $22)
      RETURNING *;
    `;

    const res = await dbClient.query(queryText, [
      clientRequestId,
      attendanceId,
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
      isOfflinePayload,
      locationTrustScore,
      validationResult,
      validationReason,
      riskLevel,
    ]);

    return res.rows[0];
  }
}

module.exports = new AttendanceLogRepository();
