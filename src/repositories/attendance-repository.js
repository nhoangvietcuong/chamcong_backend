const { pool } = require('../config/db');

function formatDateToLocalString(dateVal) {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

class AttendanceRepository {
  async findById(id, dbClient = pool) {
    const queryText = `
      SELECT * FROM public.attendance
      WHERE attendance_id = $1
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [id]);
    return res.rows[0];
  }

  async findByIdForUpdate(id, dbClient = pool) {
    const queryText = `
      SELECT * FROM public.attendance
      WHERE attendance_id = $1
      FOR UPDATE;
    `;
    const res = await dbClient.query(queryText, [id]);
    return res.rows[0];
  }

  async findByAssignmentId(assignmentId, dbClient = pool) {
    const queryText = `
      SELECT * FROM public.attendance
      WHERE assignment_id = $1
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [assignmentId]);
    return res.rows[0];
  }

  async findTodayAttendance(employeeId, dateStr, dbClient = pool) {
    const queryText = `
      SELECT * FROM public.attendance
      WHERE employee_id = $1 AND work_date = $2
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [employeeId, dateStr]);
    return res.rows[0];
  }

  async create(data, dbClient = pool) {
    const {
      employeeId,
      assignmentId,
      workDate,
      checkInTime,
      clientCheckInTime,
      checkInLatitude,
      checkInLongitude,
      checkInGpsAccuracy,
      checkInDistanceMeter,
      checkInPhotoUrl,
      isOfflineSync = 0,
      locationTrustScore,
      riskLevel,
      attendanceStatus = 'IN_PROGRESS',
      reviewStatus = 'NOT_REQUIRED',
      checkInVerificationPhotoUrl,
      actualCheckInLocationId = null,
      matchedLocationId = null,
      shiftId,
      scheduledStartTime,
      scheduledEndTime,
      checkInStatus = 'ON_TIME',
      lateMinutes = 0,
    } = data;

    const queryText = `
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
        check_in_verification_photo_url,
        is_offline_sync,
        location_trust_score,
        risk_level,
        attendance_status,
        review_status,
        actual_check_in_location_id,
        matched_location_id,
        shift_id,
        scheduled_start_time,
        scheduled_end_time,
        check_in_status,
        late_minutes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      RETURNING *;
    `;

    const res = await dbClient.query(queryText, [
      employeeId,
      assignmentId,
      workDate,
      checkInTime,
      clientCheckInTime,
      checkInLatitude,
      checkInLongitude,
      checkInGpsAccuracy,
      checkInDistanceMeter,
      checkInPhotoUrl,
      checkInVerificationPhotoUrl,
      isOfflineSync,
      locationTrustScore,
      riskLevel,
      attendanceStatus,
      reviewStatus,
      actualCheckInLocationId,
      matchedLocationId,
      shiftId,
      scheduledStartTime,
      scheduledEndTime,
      checkInStatus,
      lateMinutes,
    ]);

    return res.rows[0];
  }

  async update(id, data, dbClient = pool) {
    const {
      checkOutTime,
      clientCheckOutTime,
      checkOutLatitude,
      checkOutLongitude,
      checkOutGpsAccuracy,
      checkOutDistanceMeter,
      checkOutPhotoUrl,
      checkOutVerificationPhotoUrl,
      locationTrustScore,
      riskLevel,
      attendanceStatus,
      reviewStatus,
      checkOutStatus,
      earlyLeaveMinutes,
      workedMinutes,
      overtimeMinutes,
      matchedLocationId,
    } = data;

    const queryText = `
      UPDATE public.attendance
      SET
        check_out_time = COALESCE($1, check_out_time),
        client_check_out_time = COALESCE($2, client_check_out_time),
        check_out_latitude = COALESCE($3, check_out_latitude),
        check_out_longitude = COALESCE($4, check_out_longitude),
        check_out_gps_accuracy = COALESCE($5, check_out_gps_accuracy),
        check_out_distance_meter = COALESCE($6, check_out_distance_meter),
        check_out_photo_url = COALESCE($7, check_out_photo_url),
        check_out_verification_photo_url = COALESCE($8, check_out_verification_photo_url),
        location_trust_score = COALESCE($9, location_trust_score),
        risk_level = COALESCE($10, risk_level),
        attendance_status = COALESCE($11, attendance_status),
        review_status = COALESCE($12, review_status),
        check_out_status = COALESCE($13, check_out_status),
        early_leave_minutes = COALESCE($14, early_leave_minutes),
        worked_minutes = COALESCE($15, worked_minutes),
        overtime_minutes = COALESCE($16, overtime_minutes),
        matched_location_id = COALESCE($17, matched_location_id),
        updated_at = CURRENT_TIMESTAMP
      WHERE attendance_id = $18
      RETURNING *;
    `;

    const res = await dbClient.query(queryText, [
      checkOutTime,
      clientCheckOutTime,
      checkOutLatitude,
      checkOutLongitude,
      checkOutGpsAccuracy,
      checkOutDistanceMeter,
      checkOutPhotoUrl,
      checkOutVerificationPhotoUrl,
      locationTrustScore,
      riskLevel,
      attendanceStatus,
      reviewStatus,
      checkOutStatus,
      earlyLeaveMinutes,
      workedMinutes,
      overtimeMinutes,
      matchedLocationId,
      id,
    ]);

    return res.rows[0];
  }

  async findHistory(employeeId, filters, dbClient = pool) {
    const {
      fromDate,
      toDate,
      attendanceStatus,
      reviewStatus,
      limit,
      offset,
    } = filters;

    let baseQuery = `
      SELECT 
        a.*,
        wl.location_name,
        wl.address as location_address
      FROM public.attendance a
      JOIN public.employee_work_assignments ewa ON a.assignment_id = ewa.assignment_id
      JOIN public.work_locations wl ON COALESCE(a.actual_check_in_location_id, a.matched_location_id, ewa.location_id) = wl.location_id
      WHERE a.employee_id = $1
    `;

    let countQuery = `
      SELECT COUNT(*)::int as total
      FROM public.attendance a
      WHERE a.employee_id = $1
    `;

    const queryParams = [employeeId];
    const whereClauses = [];

    if (fromDate) {
      queryParams.push(fromDate);
      whereClauses.push(`a.work_date >= $${queryParams.length}`);
    }

    if (toDate) {
      queryParams.push(toDate);
      whereClauses.push(`a.work_date <= $${queryParams.length}`);
    }

    if (attendanceStatus) {
      queryParams.push(attendanceStatus);
      whereClauses.push(`a.attendance_status = $${queryParams.length}`);
    }

    if (reviewStatus) {
      queryParams.push(reviewStatus);
      whereClauses.push(`a.review_status = $${queryParams.length}`);
    }

    if (whereClauses.length > 0) {
      const whereString = ' AND ' + whereClauses.join(' AND ');
      baseQuery += whereString;
      countQuery += whereString;
    }

    baseQuery += ` ORDER BY a.work_date DESC, a.attendance_id DESC`;

    queryParams.push(limit);
    baseQuery += ` LIMIT $${queryParams.length}`;

    queryParams.push(offset);
    baseQuery += ` OFFSET $${queryParams.length}`;

    const itemsPromise = dbClient.query(baseQuery, queryParams);
    const countParams = queryParams.slice(0, queryParams.length - 2);
    const countPromise = dbClient.query(countQuery, countParams);

    const [itemsRes, countRes] = await Promise.all([itemsPromise, countPromise]);

    const items = itemsRes.rows.map(row => ({
      attendanceId: parseInt(row.attendance_id, 10),
      employeeId: parseInt(row.employee_id, 10),
      assignmentId: parseInt(row.assignment_id, 10),
      workDate: row.work_date ? formatDateToLocalString(row.work_date) : null,
      checkInTime: row.check_in_time,
      checkOutTime: row.check_out_time,
      clientCheckInTime: row.client_check_in_time,
      clientCheckOutTime: row.client_check_out_time,
      checkInLatitude: row.check_in_latitude ? parseFloat(row.check_in_latitude) : null,
      checkInLongitude: row.check_in_longitude ? parseFloat(row.check_in_longitude) : null,
      checkOutLatitude: row.check_out_latitude ? parseFloat(row.check_out_latitude) : null,
      checkOutLongitude: row.check_out_longitude ? parseFloat(row.check_out_longitude) : null,
      checkInGpsAccuracy: row.check_in_gps_accuracy ? parseFloat(row.check_in_gps_accuracy) : null,
      checkOutGpsAccuracy: row.check_out_gps_accuracy ? parseFloat(row.check_out_gps_accuracy) : null,
      checkInDistanceMeter: row.check_in_distance_meter ? parseFloat(row.check_in_distance_meter) : null,
      checkOutDistanceMeter: row.check_out_distance_meter ? parseFloat(row.check_out_distance_meter) : null,
      checkInPhotoUrl: row.check_in_photo_url,
      checkOutPhotoUrl: row.check_out_photo_url,
      checkInVerificationPhotoUrl: row.check_in_verification_photo_url,
      checkOutVerificationPhotoUrl: row.check_out_verification_photo_url,
      isOfflineSync: parseInt(row.is_offline_sync, 10),
      locationTrustScore: row.location_trust_score !== null ? parseInt(row.location_trust_score, 10) : null,
      riskLevel: row.risk_level,
      attendanceStatus: row.attendance_status,
      reviewStatus: row.review_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      shiftId: row.shift_id ? parseInt(row.shift_id, 10) : null,
      scheduledStartTime: row.scheduled_start_time,
      scheduledEndTime: row.scheduled_end_time,
      checkInStatus: row.check_in_status,
      checkOutStatus: row.check_out_status,
      lateMinutes: row.late_minutes !== null ? parseInt(row.late_minutes, 10) : 0,
      earlyLeaveMinutes: row.early_leave_minutes !== null ? parseInt(row.early_leave_minutes, 10) : 0,
      workedMinutes: row.worked_minutes !== null ? parseInt(row.worked_minutes, 10) : 0,
      overtimeMinutes: row.overtime_minutes !== null ? parseInt(row.overtime_minutes, 10) : 0,
      location: {
        locationName: row.location_name,
        address: row.location_address
      }
    }));

    return {
      items,
      total: countRes.rows[0].total,
    };
  }

  async findAdminAttendance(filters, dbClient = pool) {
    const {
      fromDate,
      toDate,
      employeeId,
      departmentId,
      locationId,
      attendanceStatus,
      reviewStatus,
      isOfflineSync,
      limit,
      offset,
    } = filters;

    let baseQuery = `
      SELECT 
        a.*,
        e.employee_code,
        e.full_name as employee_full_name,
        d.department_id,
        d.department_name,
        wl.location_id,
        wl.location_name,
        wl.address as location_address,
        wl.latitude as location_latitude,
        wl.longitude as location_longitude,
        wl.allowed_radius_meter,
        ewa.note as assignment_note
      FROM public.attendance a
      JOIN public.employees e ON a.employee_id = e.employee_id
      JOIN public.departments d ON e.department_id = d.department_id
      JOIN public.employee_work_assignments ewa ON a.assignment_id = ewa.assignment_id
      JOIN public.work_locations wl ON COALESCE(a.actual_check_in_location_id, a.matched_location_id, ewa.location_id) = wl.location_id
    `;

    let countQuery = `
      SELECT COUNT(*)::int as total
      FROM public.attendance a
      JOIN public.employees e ON a.employee_id = e.employee_id
      JOIN public.employee_work_assignments ewa ON a.assignment_id = ewa.assignment_id
    `;

    const queryParams = [];
    const whereClauses = [];

    if (fromDate) {
      queryParams.push(fromDate);
      whereClauses.push(`a.work_date >= $${queryParams.length}`);
    }

    if (toDate) {
      queryParams.push(toDate);
      whereClauses.push(`a.work_date <= $${queryParams.length}`);
    }

    if (employeeId) {
      queryParams.push(employeeId);
      whereClauses.push(`a.employee_id = $${queryParams.length}`);
    }

    if (departmentId) {
      queryParams.push(departmentId);
      whereClauses.push(`e.department_id = $${queryParams.length}`);
    }

    if (locationId) {
      queryParams.push(locationId);
      whereClauses.push(`COALESCE(a.actual_check_in_location_id, a.matched_location_id, ewa.location_id) = $${queryParams.length}`);
    }

    if (attendanceStatus) {
      queryParams.push(attendanceStatus);
      whereClauses.push(`a.attendance_status = $${queryParams.length}`);
    }

    if (reviewStatus) {
      queryParams.push(reviewStatus);
      whereClauses.push(`a.review_status = $${queryParams.length}`);
    }

    if (isOfflineSync !== undefined && isOfflineSync !== null) {
      queryParams.push(parseInt(isOfflineSync, 10));
      whereClauses.push(`a.is_offline_sync = $${queryParams.length}`);
    }

    if (whereClauses.length > 0) {
      const whereString = ' WHERE ' + whereClauses.join(' AND ');
      baseQuery += whereString;
      countQuery += whereString;
    }

    baseQuery += ` ORDER BY a.work_date DESC, a.attendance_id DESC`;

    queryParams.push(limit);
    baseQuery += ` LIMIT $${queryParams.length}`;

    queryParams.push(offset);
    baseQuery += ` OFFSET $${queryParams.length}`;

    const itemsPromise = dbClient.query(baseQuery, queryParams);
    const countParams = queryParams.slice(0, queryParams.length - 2);
    const countPromise = dbClient.query(countQuery, countParams);

    const [itemsRes, countRes] = await Promise.all([itemsPromise, countPromise]);

    const items = itemsRes.rows.map(row => ({
      attendanceId: parseInt(row.attendance_id, 10),
      employeeId: parseInt(row.employee_id, 10),
      assignmentId: parseInt(row.assignment_id, 10),
      workDate: row.work_date ? formatDateToLocalString(row.work_date) : null,
      checkInTime: row.check_in_time,
      checkOutTime: row.check_out_time,
      clientCheckInTime: row.client_check_in_time,
      clientCheckOutTime: row.client_check_out_time,
      checkInLatitude: row.check_in_latitude ? parseFloat(row.check_in_latitude) : null,
      checkInLongitude: row.check_in_longitude ? parseFloat(row.check_in_longitude) : null,
      checkOutLatitude: row.check_out_latitude ? parseFloat(row.check_out_latitude) : null,
      checkOutLongitude: row.check_out_longitude ? parseFloat(row.check_out_longitude) : null,
      checkInGpsAccuracy: row.check_in_gps_accuracy ? parseFloat(row.check_in_gps_accuracy) : null,
      checkOutGpsAccuracy: row.check_out_gps_accuracy ? parseFloat(row.check_out_gps_accuracy) : null,
      checkInDistanceMeter: row.check_in_distance_meter ? parseFloat(row.check_in_distance_meter) : null,
      checkOutDistanceMeter: row.check_out_distance_meter ? parseFloat(row.check_out_distance_meter) : null,
      checkInPhotoUrl: row.check_in_photo_url,
      checkOutPhotoUrl: row.check_out_photo_url,
      checkInVerificationPhotoUrl: row.check_in_verification_photo_url,
      checkOutVerificationPhotoUrl: row.check_out_verification_photo_url,
      isOfflineSync: parseInt(row.is_offline_sync, 10),
      locationTrustScore: row.location_trust_score !== null ? parseInt(row.location_trust_score, 10) : null,
      riskLevel: row.risk_level,
      attendanceStatus: row.attendance_status,
      reviewStatus: row.review_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      shiftId: row.shift_id ? parseInt(row.shift_id, 10) : null,
      scheduledStartTime: row.scheduled_start_time,
      scheduledEndTime: row.scheduled_end_time,
      checkInStatus: row.check_in_status,
      checkOutStatus: row.check_out_status,
      lateMinutes: row.late_minutes !== null ? parseInt(row.late_minutes, 10) : 0,
      earlyLeaveMinutes: row.early_leave_minutes !== null ? parseInt(row.early_leave_minutes, 10) : 0,
      workedMinutes: row.worked_minutes !== null ? parseInt(row.worked_minutes, 10) : 0,
      overtimeMinutes: row.overtime_minutes !== null ? parseInt(row.overtime_minutes, 10) : 0,

      employeeCode: row.employee_code,
      employeeFullName: row.employee_full_name,
      departmentId: parseInt(row.department_id, 10),
      departmentName: row.department_name,
      locationId: parseInt(row.location_id, 10),
      locationName: row.location_name,
      locationAddress: row.location_address,
      locationLatitude: row.location_latitude ? parseFloat(row.location_latitude) : null,
      locationLongitude: row.location_longitude ? parseFloat(row.location_longitude) : null,
      allowedRadiusMeter: parseInt(row.allowed_radius_meter, 10),
      assignmentNote: row.assignment_note,
    }));

    return {
      items,
      total: countRes.rows[0].total,
    };
  }

  /**
   * Cập nhật trạng thái kiểm duyệt của một bản ghi chấm công
   */
  async updateReviewStatus(attendanceId, { reviewStatus, reviewNote, reviewedBy, reviewedAt, attendanceStatus }, dbClient = pool) {
    const res = await dbClient.query(`
      UPDATE public.attendance
      SET
        review_status    = $1,
        review_note      = $2,
        reviewed_by      = $3,
        reviewed_at      = $4,
        attendance_status = $5,
        worked_minutes   = CASE WHEN $7 = 'REJECTED' THEN 0 ELSE worked_minutes END,
        overtime_minutes = CASE WHEN $7 = 'REJECTED' THEN 0 ELSE overtime_minutes END,
        updated_at       = NOW()
      WHERE attendance_id = $6
      RETURNING *
    `, [reviewStatus, reviewNote || null, reviewedBy, reviewedAt, attendanceStatus, attendanceId, reviewStatus]);
    return res.rows[0];
  }

  /**
   * Lấy danh sách chấm công cần kiểm duyệt (REVIEW_REQUIRED / PENDING)
   */
  async findReviewQueue(filters, dbClient = pool) {
    const { page = 1, limit = 10, departmentId, locationId } = filters;
    const offset = (page - 1) * limit;
    const params = [];

    let where = `WHERE a.attendance_status = 'REVIEW_REQUIRED' AND a.review_status = 'PENDING'`;

    if (departmentId) {
      params.push(parseInt(departmentId, 10));
      where += ` AND e.department_id = $${params.length}`;
    }
    if (locationId) {
      params.push(parseInt(locationId, 10));
      where += ` AND COALESCE(a.actual_check_in_location_id, a.matched_location_id, ewa.location_id) = $${params.length}`;
    }

    const countParams = [...params];
    const countRes = await dbClient.query(`
      SELECT COUNT(*)::int AS total
      FROM public.attendance a
      JOIN public.employees e ON a.employee_id = e.employee_id
      JOIN public.employee_work_assignments ewa ON a.assignment_id = ewa.assignment_id
      ${where}
    `, countParams);

    params.push(limit, offset);
    const dataRes = await dbClient.query(`
      SELECT
        a.attendance_id,
        a.work_date,
        a.check_in_time,
        a.check_out_time,
        a.client_check_in_time,
        a.client_check_out_time,
        a.check_in_latitude,
        a.check_in_longitude,
        a.check_out_latitude,
        a.check_out_longitude,
        a.check_in_gps_accuracy,
        a.check_out_gps_accuracy,
        a.check_in_distance_meter,
        a.check_out_distance_meter,
        a.check_in_photo_url,
        a.check_out_photo_url,
        a.check_in_verification_photo_url,
        a.check_out_verification_photo_url,
        a.is_offline_sync,
        a.location_trust_score,
        a.risk_level,
        a.attendance_status,
        a.review_status,
        a.review_note,
        e.employee_id,
        e.employee_code,
        e.full_name,
        d.department_id,
        d.department_name,
        wl.location_id,
        wl.location_name,
        wl.address       AS location_address,
        wl.allowed_radius_meter
      FROM public.attendance a
      JOIN public.employees e ON a.employee_id = e.employee_id
      JOIN public.departments d ON e.department_id = d.department_id
      JOIN public.employee_work_assignments ewa ON a.assignment_id = ewa.assignment_id
      JOIN public.work_locations wl ON COALESCE(a.actual_check_in_location_id, a.matched_location_id, ewa.location_id) = wl.location_id
      ${where}
      ORDER BY a.risk_level DESC, a.check_in_time DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    return {
      items: dataRes.rows,
      total: countRes.rows[0].total,
    };
  }

  async findOfflineAttendanceReview(filters, dbClient = pool) {
    const { page = 1, limit = 10, departmentId, locationId } = filters;
    const offset = (page - 1) * limit;
    const params = [];

let where = `WHERE a.is_offline_sync = 1 AND a.attendance_status = 'REVIEW_REQUIRED'`;

if (departmentId) {
  params.push(parseInt(departmentId, 10));
  where += ` AND e.department_id = $${params.length}`;
}
if (locationId) {
  params.push(parseInt(locationId, 10));
  where += ` AND COALESCE(a.actual_check_in_location_id, a.matched_location_id, ewa.location_id) = $${params.length}`;
}

const countParams = [...params];
const countRes = await dbClient.query(`
      SELECT COUNT(*)::int AS total
      FROM public.attendance a
      JOIN public.employees e ON a.employee_id = e.employee_id
      JOIN public.employee_work_assignments ewa ON a.assignment_id = ewa.assignment_id
      ${where}
    `, countParams);

params.push(limit, offset);
const dataRes = await dbClient.query(`
      SELECT
        a.attendance_id,
        a.work_date,
        a.check_in_time,
        a.check_out_time,
        a.client_check_in_time,
        a.client_check_out_time,
        a.is_offline_sync,
        a.review_status,
        a.risk_level,
        a.trust_score,
        a.created_at,
        e.employee_id,
        e.employee_code,
        e.full_name,
        d.department_id,
        d.department_name,
        ewa.assignment_id,
        wl.location_id,
        wl.location_name
      FROM public.attendance a
      JOIN public.employees e ON a.employee_id = e.employee_id
      JOIN public.departments d ON e.department_id = d.department_id
      JOIN public.employee_work_assignments ewa ON a.assignment_id = ewa.assignment_id
      JOIN public.work_locations wl ON COALESCE(a.actual_check_in_location_id, a.matched_location_id, ewa.location_id) = wl.location_id
      ${where}
      ORDER BY a.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

return {
  items: dataRes.rows,
  total: countRes.rows[0].total,
};
  }

  async findOfflineAttendanceDetail(attendanceId, dbClient = pool) {
  const queryText = `
      SELECT
        a.*,
        e.employee_code,
        e.full_name,
        d.department_name,
        ewa.assignment_id,
        wl.location_name
      FROM public.attendance a
      JOIN public.employees e ON a.employee_id = e.employee_id
      JOIN public.departments d ON e.department_id = d.department_id
      JOIN public.employee_work_assignments ewa ON a.assignment_id = ewa.assignment_id
      JOIN public.work_locations wl ON COALESCE(a.actual_check_in_location_id, a.matched_location_id, ewa.location_id) = wl.location_id
      WHERE a.attendance_id = $1 AND a.is_offline_sync = 1
      LIMIT 1;
    `;
  const res = await dbClient.query(queryText, [attendanceId]);
  return res.rows[0];
}

  async approveOfflineAttendance(attendanceId, reviewedBy, reviewNote, attendanceStatus, dbClient = pool) {
  const res = await dbClient.query(`
      UPDATE public.attendance
      SET
        review_status     = 'APPROVED',
        review_note       = $1,
        reviewed_by       = $2,
        reviewed_at       = CURRENT_TIMESTAMP,
        attendance_status = $3,
        updated_at        = NOW()
      WHERE attendance_id = $4
      RETURNING *;
    `, [reviewNote || null, reviewedBy, attendanceStatus, attendanceId]);
  return res.rows[0];
}

  async rejectOfflineAttendance(attendanceId, reviewedBy, reviewNote, dbClient = pool) {
  const res = await dbClient.query(`
      UPDATE public.attendance
      SET
        review_status     = 'REJECTED',
        review_note       = $1,
        reviewed_by       = $2,
        reviewed_at       = CURRENT_TIMESTAMP,
        attendance_status = 'INVALID',
        updated_at        = NOW()
      WHERE attendance_id = $3
      RETURNING *;
    `, [reviewNote || null, reviewedBy, attendanceId]);
  return res.rows[0];
}
}

module.exports = new AttendanceRepository();
