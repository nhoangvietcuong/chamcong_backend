const { pool } = require('../config/db');

function formatDateToLocalString(dateVal) {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

class AttendanceOtRepository {
  async create(data, dbClient = pool) {
    const {
      attendanceId,
      otRequestId,
      assignmentId,
      shiftId,
      checkInTime,
      checkInLatitude,
      checkInLongitude,
      checkInPhotoUrl,
      checkInDistanceMeter,
      matchedLocationId,
      createdBy
    } = data;

    const queryText = `
      INSERT INTO public.attendance_overtime (
        attendance_id,
        ot_request_id,
        assignment_id,
        shift_id,
        check_in_time,
        check_in_latitude,
        check_in_longitude,
        check_in_photo_url,
        check_in_distance_meter,
        matched_location_id,
        created_by,
        attendance_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'IN_PROGRESS')
      RETURNING 
        attendance_ot_id as "attendanceOtId",
        attendance_id as "attendanceId",
        ot_request_id as "otRequestId",
        assignment_id as "assignmentId",
        shift_id as "shiftId",
        check_in_time as "checkInTime",
        check_in_latitude as "checkInLatitude",
        check_in_longitude as "checkInLongitude",
        check_in_photo_url as "checkInPhotoUrl",
        check_in_distance_meter as "checkInDistanceMeter",
        matched_location_id as "matchedLocationId",
        attendance_status as "attendanceStatus";
    `;

    const res = await dbClient.query(queryText, [
      attendanceId,
      otRequestId,
      assignmentId,
      shiftId,
      checkInTime,
      checkInLatitude,
      checkInLongitude,
      checkInPhotoUrl,
      checkInDistanceMeter,
      matchedLocationId,
      createdBy
    ]);
    return res.rows[0];
  }

  async findById(id, dbClient = pool) {
    const queryText = `
      SELECT 
        ao.attendance_ot_id as "attendanceOtId",
        ao.attendance_id as "attendanceId",
        ao.ot_request_id as "otRequestId",
        ao.assignment_id as "assignmentId",
        ao.shift_id as "shiftId",
        ao.check_in_time as "checkInTime",
        ao.check_in_latitude as "checkInLatitude",
        ao.check_in_longitude as "checkInLongitude",
        ao.check_in_photo_url as "checkInPhotoUrl",
        ao.check_in_distance_meter as "checkInDistanceMeter",
        ao.matched_location_id as "matchedLocationId",
        ao.check_out_time as "checkOutTime",
        ao.check_out_latitude as "checkOutLatitude",
        ao.check_out_longitude as "checkOutLongitude",
        ao.check_out_photo_url as "checkOutPhotoUrl",
        ao.check_out_distance_meter as "checkOutDistanceMeter",
        ao.attendance_status as "attendanceStatus",
        ao.actual_minutes as "actualMinutes",
        ao.approved_minutes as "approvedMinutes",
        ao.payroll_processed as "payrollProcessed",
        ao.payroll_processed_at as "payrollProcessedAt",
        ao.created_by as "createdBy",
        ao.updated_by as "updatedBy"
      FROM public.attendance_overtime ao
      WHERE ao.attendance_ot_id = $1
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [id]);
    return res.rows[0];
  }

  async findByOtRequestId(otRequestId, dbClient = pool) {
    const queryText = `
      SELECT 
        ao.attendance_ot_id as "attendanceOtId",
        ao.attendance_id as "attendanceId",
        ao.ot_request_id as "otRequestId",
        ao.assignment_id as "assignmentId",
        ao.shift_id as "shiftId",
        ao.check_in_time as "checkInTime",
        ao.check_in_latitude as "checkInLatitude",
        ao.check_in_longitude as "checkInLongitude",
        ao.check_in_photo_url as "checkInPhotoUrl",
        ao.check_in_distance_meter as "checkInDistanceMeter",
        ao.matched_location_id as "matchedLocationId",
        ao.check_out_time as "checkOutTime",
        ao.check_out_latitude as "checkOutLatitude",
        ao.check_out_longitude as "checkOutLongitude",
        ao.check_out_photo_url as "checkOutPhotoUrl",
        ao.check_out_distance_meter as "checkOutDistanceMeter",
        ao.attendance_status as "attendanceStatus",
        ao.actual_minutes as "actualMinutes",
        ao.approved_minutes as "approvedMinutes",
        ao.payroll_processed as "payrollProcessed",
        ao.payroll_processed_at as "payrollProcessedAt",
        ao.created_by as "createdBy",
        ao.updated_by as "updatedBy"
      FROM public.attendance_overtime ao
      WHERE ao.ot_request_id = $1
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [otRequestId]);
    return res.rows[0] || null;
  }

  async findTodaySessions(employeeId, workDate, dbClient = pool) {
    const queryText = `
      SELECT 
        ao.attendance_ot_id as "attendanceOtId",
        ao.attendance_id as "attendanceId",
        ao.ot_request_id as "otRequestId",
        ao.assignment_id as "assignmentId",
        ao.shift_id as "shiftId",
        ao.check_in_time as "checkInTime",
        ao.check_in_latitude as "checkInLatitude",
        ao.check_in_longitude as "checkInLongitude",
        ao.check_in_photo_url as "checkInPhotoUrl",
        ao.check_in_distance_meter as "checkInDistanceMeter",
        ao.matched_location_id as "matchedLocationId",
        ao.check_out_time as "checkOutTime",
        ao.check_out_latitude as "checkOutLatitude",
        ao.check_out_longitude as "checkOutLongitude",
        ao.check_out_photo_url as "checkOutPhotoUrl",
        ao.check_out_distance_meter as "checkOutDistanceMeter",
        ao.attendance_status as "attendanceStatus",
        ao.actual_minutes as "actualMinutes",
        ao.approved_minutes as "approvedMinutes",
        ao.payroll_processed as "payrollProcessed",
        ao.payroll_processed_at as "payrollProcessedAt"
      FROM public.attendance_overtime ao
      JOIN public.attendance a ON ao.attendance_id = a.attendance_id
      WHERE a.employee_id = $1 AND a.work_date = $2
      ORDER BY ao.check_in_time ASC;
    `;
    const res = await dbClient.query(queryText, [employeeId, workDate]);
    return res.rows;
  }

  async update(id, data, dbClient = pool) {
    const {
      checkOutTime,
      checkOutLatitude,
      checkOutLongitude,
      checkOutPhotoUrl,
      checkOutDistanceMeter,
      attendanceStatus,
      actualMinutes,
      approvedMinutes,
      updatedBy
    } = data;

    const queryText = `
      UPDATE public.attendance_overtime
      SET
        check_out_time = COALESCE($1, check_out_time),
        check_out_latitude = COALESCE($2, check_out_latitude),
        check_out_longitude = COALESCE($3, check_out_longitude),
        check_out_photo_url = COALESCE($4, check_out_photo_url),
        check_out_distance_meter = COALESCE($5, check_out_distance_meter),
        attendance_status = COALESCE($6, attendance_status),
        actual_minutes = COALESCE($7, actual_minutes),
        approved_minutes = COALESCE($8, approved_minutes),
        updated_by = COALESCE($9, updated_by),
        updated_at = CURRENT_TIMESTAMP
      WHERE attendance_ot_id = $10
      RETURNING *;
    `;

    const res = await dbClient.query(queryText, [
      checkOutTime,
      checkOutLatitude,
      checkOutLongitude,
      checkOutPhotoUrl,
      checkOutDistanceMeter,
      attendanceStatus,
      actualMinutes,
      approvedMinutes,
      updatedBy,
      id
    ]);
    return res.rows[0];
  }

  async checkOverlap(employeeId, checkInTime, dbClient = pool) {
    const queryText = `
      SELECT ao.attendance_ot_id
      FROM public.attendance_overtime ao
      JOIN public.attendance a ON ao.attendance_id = a.attendance_id
      WHERE a.employee_id = $1
        AND ao.attendance_status = 'IN_PROGRESS'
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [employeeId]);
    return res.rows.length > 0;
  }

  async getOvertimeDetailsByAttendanceId(attendanceId, dbClient = pool) {
    const queryText = `
      SELECT 
        ao.attendance_ot_id as "attendanceOtId",
        ao.attendance_id as "attendanceId",
        ao.ot_request_id as "otRequestId",
        ao.check_in_time as "checkInTime",
        ao.check_out_time as "checkOutTime",
        ao.attendance_status as "attendanceStatus",
        ao.actual_minutes as "actualMinutes",
        ao.approved_minutes as "approvedMinutes",
        wl.location_name as "locationName",
        ao.check_in_photo_url as "checkInPhotoUrl",
        ao.check_out_photo_url as "checkOutPhotoUrl",
        ao.check_in_distance_meter as "checkInDistanceMeter",
        ao.check_out_distance_meter as "checkOutDistanceMeter"
      FROM public.attendance_overtime ao
      LEFT JOIN public.work_locations wl ON ao.matched_location_id = wl.location_id
      WHERE ao.attendance_id = $1;
    `;
    const res = await dbClient.query(queryText, [attendanceId]);
    return res.rows;
  }
}

module.exports = new AttendanceOtRepository();
