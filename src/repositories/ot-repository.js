const { pool } = require('../config/db');

class OtRepository {
  async createRequest(data, dbClient = pool) {
    const { employeeId, assignmentId, workDate, startTime, endTime, durationHours, reason } = data;
    const queryText = `
      INSERT INTO public.ot_requests (employee_id, assignment_id, work_date, start_time, end_time, duration_hours, reason, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')
      RETURNING 
        ot_request_id as "otRequestId", 
        employee_id as "employeeId", 
        assignment_id as "assignmentId",
        work_date as "workDate", 
        start_time as "startTime", 
        end_time as "endTime", 
        duration_hours as "durationHours",
        reason, 
        status, 
        created_at as "createdAt";
    `;
    const res = await dbClient.query(queryText, [employeeId, assignmentId, workDate, startTime, endTime, durationHours, reason]);
    return res.rows[0];
  }

  async findRequestById(id, dbClient = pool) {
    const queryText = `
      SELECT 
        ot_request_id as "otRequestId",
        employee_id as "employeeId",
        assignment_id as "assignmentId",
        work_date as "workDate",
        start_time as "startTime",
        end_time as "endTime",
        duration_hours as "durationHours",
        reason,
        status,
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        reject_reason as "rejectReason",
        created_at as "createdAt"
      FROM public.ot_requests
      WHERE ot_request_id = $1;
    `;
    const res = await dbClient.query(queryText, [id]);
    return res.rows[0];
  }

  async updateRequestStatus(id, status, approvalData = {}, dbClient = pool) {
    const { approvedBy, rejectReason } = approvalData;
    const queryText = `
      UPDATE public.ot_requests
      SET 
        status = $1::text,
        approved_by = $2,
        approved_at = CASE WHEN $1::text = 'APPROVED' THEN CURRENT_TIMESTAMP ELSE NULL END,
        reject_reason = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE ot_request_id = $4
      RETURNING 
        ot_request_id as "otRequestId",
        employee_id as "employeeId",
        assignment_id as "assignmentId",
        work_date as "workDate",
        status;
    `;
    const res = await dbClient.query(queryText, [status, approvedBy || null, rejectReason || null, id]);
    return res.rows[0];
  }

  async checkOverlap(employeeId, workDate, startTime, endTime, dbClient = pool) {
    const queryText = `
      SELECT ot_request_id as "otRequestId"
      FROM public.ot_requests
      WHERE employee_id = $1
        AND work_date = $2
        AND status IN ('PENDING', 'APPROVED')
        AND NOT (end_time <= $3 OR start_time >= $4)
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [employeeId, workDate, startTime, endTime]);
    return res.rows.length > 0;
  }

  async getAssignmentForDate(employeeId, workDate, dbClient = pool) {
    const queryText = `
      SELECT 
        ewa.assignment_id as "assignmentId",
        ewa.status,
        ws.end_time as "shiftEndTime"
      FROM public.employee_work_assignments ewa
      LEFT JOIN public.work_shifts ws ON ewa.shift_id = ws.shift_id
      WHERE ewa.employee_id = $1 
        AND ewa.work_date = $2 
        AND ewa.status != 'CANCELLED'
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [employeeId, workDate]);
    return res.rows[0] || null;
  }

  async checkLeaveConflict(employeeId, workDate, dbClient = pool) {
    const queryText = `
      SELECT leave_request_id as "leaveRequestId"
      FROM public.leave_requests
      WHERE employee_id = $1
        AND status = 'APPROVED'
        AND start_date <= $2 AND end_date >= $2
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [employeeId, workDate]);
    return res.rows.length > 0;
  }

  async findRequests(filters, dbClient = pool) {
    const { page = 1, limit = 10, employeeId, status, departmentId, workDate } = filters;
    const offset = (page - 1) * limit;
    const params = [];
    const countParams = [];
    const whereClauses = [];

    if (employeeId) {
      params.push(employeeId);
      countParams.push(employeeId);
      whereClauses.push(`otr.employee_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      countParams.push(status);
      whereClauses.push(`otr.status = $${params.length}`);
    }

    if (workDate) {
      params.push(workDate);
      countParams.push(workDate);
      whereClauses.push(`otr.work_date = $${params.length}`);
    }

    if (departmentId) {
      params.push(departmentId);
      countParams.push(departmentId);
      whereClauses.push(`e.department_id = $${params.length}`);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRes = await dbClient.query(`
      SELECT COUNT(*)::int AS total
      FROM public.ot_requests otr
      JOIN public.employees e ON otr.employee_id = e.employee_id
      ${whereStr}
    `, countParams);

    params.push(limit, offset);
    const listRes = await dbClient.query(`
      SELECT 
        otr.ot_request_id as "otRequestId",
        otr.employee_id as "employeeId",
        otr.assignment_id as "assignmentId",
        otr.work_date as "workDate",
        otr.start_time as "startTime",
        otr.end_time as "endTime",
        otr.duration_hours as "durationHours",
        otr.reason,
        otr.status,
        otr.approved_by as "approvedBy",
        otr.approved_at as "approvedAt",
        otr.reject_reason as "rejectReason",
        otr.created_at as "createdAt",
        e.full_name as "employeeFullName",
        e.employee_code as "employeeCode",
        d.department_name as "departmentName",
        ao.check_in_time as "actualOtCheckIn",
        ao.check_out_time as "actualOtCheckOut",
        ao.actual_minutes as "actualOtMinutes"
      FROM public.ot_requests otr
      JOIN public.employees e ON otr.employee_id = e.employee_id
      LEFT JOIN public.departments d ON e.department_id = d.department_id
      LEFT JOIN public.attendance_overtime ao ON otr.ot_request_id = ao.ot_request_id
      ${whereStr}
      ORDER BY otr.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    return {
      items: listRes.rows,
      total: countRes.rows[0].total
    };
  }

  async findApprovedOtRequestsForToday(employeeId, workDate, dbClient = pool) {
    const queryText = `
      SELECT 
        ot_request_id as "otRequestId",
        employee_id as "employeeId",
        assignment_id as "assignmentId",
        work_date as "workDate",
        start_time as "startTime",
        end_time as "endTime",
        duration_hours as "durationHours",
        reason,
        status
      FROM public.ot_requests
      WHERE employee_id = $1 
        AND work_date = $2 
        AND status = 'APPROVED'
      ORDER BY start_time ASC;
    `;
    const res = await dbClient.query(queryText, [employeeId, workDate]);
    return res.rows;
  }
}

module.exports = new OtRepository();
