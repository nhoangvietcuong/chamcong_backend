const { pool } = require('../config/db');

class ReportRepository {
  /**
   * Tổng hợp số liệu chấm công theo khoảng thời gian
   */
  async getAttendanceSummary(filters, dbClient = pool) {
    const { fromDate, toDate } = filters;

    const params = [];
    let dateWhere = '';
    if (fromDate) {
      params.push(fromDate);
      dateWhere += ` AND a.work_date >= $${params.length}`;
    }
    if (toDate) {
      params.push(toDate);
      dateWhere += ` AND a.work_date <= $${params.length}`;
    }

    const summaryRes = await dbClient.query(`
      SELECT
        COUNT(*)::int                                              AS total_records,
        COUNT(*) FILTER (WHERE a.attendance_status = 'COMPLETED')::int  AS completed,
        COUNT(*) FILTER (WHERE a.attendance_status = 'IN_PROGRESS')::int AS in_progress,
        COUNT(*) FILTER (WHERE a.attendance_status = 'INVALID')::int    AS invalid,
        COUNT(*) FILTER (WHERE a.attendance_status = 'REVIEW_REQUIRED')::int AS review_required,
        COUNT(*) FILTER (WHERE a.review_status = 'PENDING')::int        AS review_pending,
        COUNT(*) FILTER (WHERE a.review_status = 'APPROVED')::int       AS review_approved,
        COUNT(*) FILTER (WHERE a.review_status = 'REJECTED')::int       AS review_rejected,
        COUNT(*) FILTER (WHERE a.is_offline_sync = 1)::int              AS offline_sync_count,
        COUNT(*) FILTER (WHERE a.risk_level = 'HIGH')::int              AS high_risk_count,
        COUNT(*) FILTER (WHERE a.risk_level = 'MEDIUM')::int            AS medium_risk_count,
        COUNT(*) FILTER (WHERE a.risk_level = 'LOW')::int               AS low_risk_count,
        COUNT(*) FILTER (WHERE a.check_out_time IS NOT NULL)::int        AS checked_out,
        COUNT(*) FILTER (WHERE a.check_out_time IS NULL)::int            AS not_checked_out
      FROM public.attendance a
      WHERE 1=1 ${dateWhere}
    `, params);

    return summaryRes.rows[0];
  }

  /**
   * Thống kê theo từng phòng ban
   */
  async getStatsByDepartment(filters, dbClient = pool) {
    const { fromDate, toDate } = filters;

    const params = [];
    let dateWhere = '';
    if (fromDate) {
      params.push(fromDate);
      dateWhere += ` AND a.work_date >= $${params.length}`;
    }
    if (toDate) {
      params.push(toDate);
      dateWhere += ` AND a.work_date <= $${params.length}`;
    }

    const res = await dbClient.query(`
      SELECT
        d.department_id,
        d.department_name,
        COUNT(*)::int                                              AS total,
        COUNT(*) FILTER (WHERE a.attendance_status = 'COMPLETED')::int  AS completed,
        COUNT(*) FILTER (WHERE a.is_offline_sync = 1)::int              AS offline_sync,
        COUNT(*) FILTER (WHERE a.review_status = 'PENDING')::int        AS review_pending
      FROM public.attendance a
      JOIN public.employees e ON a.employee_id = e.employee_id
      JOIN public.departments d ON e.department_id = d.department_id
      WHERE 1=1 ${dateWhere}
      GROUP BY d.department_id, d.department_name
      ORDER BY total DESC
    `, params);

    return res.rows;
  }

  /**
   * Thống kê theo từng địa điểm chấm công
   */
  async getStatsByLocation(filters, dbClient = pool) {
    const { fromDate, toDate } = filters;

    const params = [];
    let dateWhere = '';
    if (fromDate) {
      params.push(fromDate);
      dateWhere += ` AND a.work_date >= $${params.length}`;
    }
    if (toDate) {
      params.push(toDate);
      dateWhere += ` AND a.work_date <= $${params.length}`;
    }

    const res = await dbClient.query(`
      SELECT
        wl.location_id,
        wl.location_name,
        COUNT(*)::int                                              AS total,
        COUNT(*) FILTER (WHERE a.attendance_status = 'COMPLETED')::int  AS completed,
        COUNT(*) FILTER (WHERE a.is_offline_sync = 1)::int              AS offline_sync
      FROM public.attendance a
      JOIN public.employee_work_assignments ewa ON a.assignment_id = ewa.assignment_id
      JOIN public.work_locations wl ON COALESCE(a.actual_check_in_location_id, a.matched_location_id, ewa.location_id) = wl.location_id
      WHERE 1=1 ${dateWhere}
      GROUP BY wl.location_id, wl.location_name
      ORDER BY total DESC
    `, params);

    return res.rows;
  }

  /**
   * Tỷ lệ nhận diện Face Recognition thành công
   */
  async getFaceVerificationStats(filters, dbClient = pool) {
    const { fromDate, toDate } = filters;

    const params = [];
    let dateWhere = '';
    if (fromDate) {
      params.push(fromDate);
      dateWhere += ` AND DATE(sl.action_time) >= $${params.length}`;
    }
    if (toDate) {
      params.push(toDate);
      dateWhere += ` AND DATE(sl.action_time) <= $${params.length}`;
    }

    const res = await dbClient.query(`
      SELECT
        COUNT(*) FILTER (WHERE sl.action = 'FACE_VERIFY' AND sl.status = 'SUCCESS')::int   AS success_count,
        COUNT(*) FILTER (WHERE sl.action = 'FACE_VERIFY_FAILED' AND sl.status = 'FAILED')::int AS failed_count,
        COUNT(*) FILTER (WHERE sl.action IN ('FACE_VERIFY', 'FACE_VERIFY_FAILED'))::int     AS total_attempts
      FROM public.system_logs sl
      WHERE sl.action IN ('FACE_VERIFY', 'FACE_VERIFY_FAILED')
        ${dateWhere}
    `, params);

    return res.rows[0];
  }

  /**
   * Tỷ lệ xác thực WebAuthn thành công
   */
  async getWebAuthnStats(filters, dbClient = pool) {
    const { fromDate, toDate } = filters;

    const params = [];
    let dateWhere = '';
    if (fromDate) {
      params.push(fromDate);
      dateWhere += ` AND DATE(sl.action_time) >= $${params.length}`;
    }
    if (toDate) {
      params.push(toDate);
      dateWhere += ` AND DATE(sl.action_time) <= $${params.length}`;
    }

    const res = await dbClient.query(`
      SELECT
        COUNT(*) FILTER (WHERE sl.action = 'SIGNATURE_VERIFIED' AND sl.status = 'SUCCESS')::int AS success_count,
        COUNT(*) FILTER (WHERE sl.action = 'WEBAUTHN_AUTHENTICATE_FAILED')::int                 AS failed_count,
        (
          COUNT(*) FILTER (WHERE sl.action = 'SIGNATURE_VERIFIED' AND sl.status = 'SUCCESS') +
          COUNT(*) FILTER (WHERE sl.action = 'WEBAUTHN_AUTHENTICATE_FAILED')
        )::int AS total_attempts
      FROM public.system_logs sl
      WHERE sl.action IN ('SIGNATURE_VERIFIED', 'WEBAUTHN_AUTHENTICATE_FAILED')
        ${dateWhere}
    `, params);

    return res.rows[0];
  }

  /**
   * Số lượng nhân viên vắng mặt (có phân công nhưng chưa check-in)
   */
  async getAbsentCount(filters, dbClient = pool) {
    const { fromDate, toDate } = filters;

    // Mặc định xem ngày hôm nay nếu không có bộ lọc
    const effectiveFrom = fromDate || new Date().toISOString().substring(0, 10);
    const effectiveTo = toDate || new Date().toISOString().substring(0, 10);

    const res = await dbClient.query(`
      SELECT COUNT(*)::int AS absent_count
      FROM public.employee_work_assignments ewa
      WHERE ewa.status = 'ASSIGNED'
        AND ewa.work_date BETWEEN $1 AND $2
        AND NOT EXISTS (
          SELECT 1 FROM public.attendance a
          WHERE a.assignment_id = ewa.assignment_id
        )
    `, [effectiveFrom, effectiveTo]);

    return res.rows[0];
  }

  /**
   * Xu hướng chấm công theo ngày (7 ngày gần nhất hoặc theo bộ lọc)
   */
  async getDailyTrend(filters, dbClient = pool) {
    const { fromDate, toDate } = filters;

    const effectiveFrom = fromDate || new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
    const effectiveTo = toDate || new Date().toISOString().substring(0, 10);

    const res = await dbClient.query(`
      SELECT
        a.work_date::text AS date,
        COUNT(*)::int                                              AS total,
        COUNT(*) FILTER (WHERE a.attendance_status = 'COMPLETED')::int  AS completed,
        COUNT(*) FILTER (WHERE a.is_offline_sync = 1)::int              AS offline_sync
      FROM public.attendance a
      WHERE a.work_date BETWEEN $1 AND $2
      GROUP BY a.work_date
      ORDER BY a.work_date ASC
    `, [effectiveFrom, effectiveTo]);

    return res.rows;
  }

  async getPayrollReportData(startDate, endDate, dbClient = pool) {
    const res = await dbClient.query(`
      SELECT 
        e.employee_id,
        e.employee_code,
        e.full_name,
        d.department_name,
        ewa.work_date::text as work_date,
        ewa.status as assignment_status,
        a.attendance_id,
        a.attendance_status,
        a.check_in_time,
        a.check_out_time,
        a.check_in_status,
        a.check_out_status,
        a.worked_minutes,
        a.late_minutes,
        a.early_leave_minutes
      FROM public.employees e
      LEFT JOIN public.departments d ON e.department_id = d.department_id
      LEFT JOIN public.employee_work_assignments ewa ON e.employee_id = ewa.employee_id AND ewa.work_date >= $1 AND ewa.work_date <= $2
      LEFT JOIN public.attendance a ON ewa.assignment_id = a.assignment_id
      WHERE e.status = 1
      ORDER BY e.employee_id ASC, ewa.work_date ASC
    `, [startDate, endDate]);
    return res.rows;
  }
}

module.exports = new ReportRepository();
