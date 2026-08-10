const { pool } = require('../config/db');

class LeaveRepository {
  async createRequest(data, dbClient = pool) {
    const { employeeId, leaveType, startDate, endDate, reason, evidenceUrl } = data;
    const queryText = `
      INSERT INTO public.leave_requests (employee_id, leave_type, start_date, end_date, reason, evidence_url, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
      RETURNING 
        leave_request_id as "leaveRequestId", 
        employee_id as "employeeId", 
        leave_type as "leaveType", 
        start_date as "startDate", 
        end_date as "endDate", 
        reason, 
        evidence_url as "evidenceUrl",
        status, 
        created_at as "createdAt";
    `;
    const res = await dbClient.query(queryText, [employeeId, leaveType, startDate, endDate, reason, evidenceUrl]);
    return res.rows[0];
  }

  async findRequestById(id, dbClient = pool) {
    const queryText = `
      SELECT 
        leave_request_id as "leaveRequestId",
        employee_id as "employeeId",
        leave_type as "leaveType",
        start_date as "startDate",
        end_date as "endDate",
        reason,
        evidence_url as "evidenceUrl",
        status,
        approved_by as "approvedBy",
        approved_at as "approvedAt",
        reject_reason as "rejectReason",
        created_at as "createdAt"
      FROM public.leave_requests
      WHERE leave_request_id = $1;
    `;
    const res = await dbClient.query(queryText, [id]);
    return res.rows[0];
  }

  async updateRequestStatus(id, status, approvalData = {}, dbClient = pool) {
    const { approvedBy, rejectReason } = approvalData;
    const queryText = `
      UPDATE public.leave_requests
      SET 
        status = $1::text,
        approved_by = $2,
        approved_at = CASE WHEN $1::text = 'APPROVED' THEN CURRENT_TIMESTAMP ELSE NULL END,
        reject_reason = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE leave_request_id = $4
      RETURNING 
        leave_request_id as "leaveRequestId",
        employee_id as "employeeId",
        leave_type as "leaveType",
        start_date as "startDate",
        end_date as "endDate",
        status;
    `;
    const res = await dbClient.query(queryText, [status, approvedBy || null, rejectReason || null, id]);
    return res.rows[0];
  }

  async checkOverlap(employeeId, startDate, endDate, dbClient = pool) {
    // Check if there is any overlapping request (PENDING or APPROVED)
    const queryText = `
      SELECT leave_request_id as "leaveRequestId"
      FROM public.leave_requests
      WHERE employee_id = $1
        AND status IN ('PENDING', 'APPROVED')
        AND NOT (end_date < $2 OR start_date > $3)
      LIMIT 1;
    `;
    const res = await dbClient.query(queryText, [employeeId, startDate, endDate]);
    return res.rows.length > 0;
  }

  async getLeaveBalance(employeeId, year, dbClient = pool) {
    const queryText = `
      SELECT 
        leave_balance_id as "leaveBalanceId",
        employee_id as "employeeId",
        year,
        annual_days_total as "annualDaysTotal",
        annual_days_used as "annualDaysUsed",
        sick_days_used as "sickDaysUsed",
        unpaid_days_used as "unpaidDaysUsed",
        marriage_days_used as "marriageDaysUsed",
        maternity_days_used as "maternityDaysUsed",
        other_days_used as "otherDaysUsed"
      FROM public.leave_balances
      WHERE employee_id = $1 AND year = $2;
    `;
    const res = await dbClient.query(queryText, [employeeId, year]);
    return res.rows[0];
  }

  async updateLeaveBalance(employeeId, year, leaveType, daysCount, dbClient = pool) {
    const columnMap = {
      ANNUAL: 'annual_days_used',
      COMPENSATORY: 'other_days_used',
      SICK: 'sick_days_used',
      UNPAID: 'unpaid_days_used',
      MARRIAGE: 'marriage_days_used',
      MATERNITY: 'maternity_days_used',
      OTHER: 'other_days_used'
    };

    const columnName = columnMap[leaveType];
    if (!columnName) return null;

    const queryText = `
      UPDATE public.leave_balances
      SET ${columnName} = ${columnName} + $1, updated_at = CURRENT_TIMESTAMP
      WHERE employee_id = $2 AND year = $3
      RETURNING leave_balance_id as "leaveBalanceId";
    `;
    const res = await dbClient.query(queryText, [daysCount, employeeId, year]);
    return res.rows[0];
  }

  async findRequests(filters, dbClient = pool) {
    const { page = 1, limit = 10, employeeId, status, departmentId, leaveType } = filters;
    const offset = (page - 1) * limit;
    const params = [];
    const countParams = [];
    const whereClauses = [];

    if (employeeId) {
      params.push(employeeId);
      countParams.push(employeeId);
      whereClauses.push(`lr.employee_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      countParams.push(status);
      whereClauses.push(`lr.status = $${params.length}`);
    }

    if (leaveType) {
      params.push(leaveType);
      countParams.push(leaveType);
      whereClauses.push(`lr.leave_type = $${params.length}`);
    }

    if (departmentId) {
      params.push(departmentId);
      countParams.push(departmentId);
      whereClauses.push(`e.department_id = $${params.length}`);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRes = await dbClient.query(`
      SELECT COUNT(*)::int AS total
      FROM public.leave_requests lr
      JOIN public.employees e ON lr.employee_id = e.employee_id
      ${whereStr}
    `, countParams);

    params.push(limit, offset);
    const listRes = await dbClient.query(`
      SELECT 
        lr.leave_request_id as "leaveRequestId",
        lr.employee_id as "employeeId",
        lr.leave_type as "leaveType",
        lr.start_date as "startDate",
        lr.end_date as "endDate",
        lr.reason,
        lr.evidence_url as "evidenceUrl",
        lr.status,
        lr.approved_by as "approvedBy",
        lr.approved_at as "approvedAt",
        lr.reject_reason as "rejectReason",
        lr.created_at as "createdAt",
        e.full_name as "employeeFullName",
        e.employee_code as "employeeCode",
        d.department_name as "departmentName"
      FROM public.leave_requests lr
      JOIN public.employees e ON lr.employee_id = e.employee_id
      LEFT JOIN public.departments d ON e.department_id = d.department_id
      ${whereStr}
      ORDER BY lr.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    return {
      items: listRes.rows,
      total: countRes.rows[0].total
    };
  }

  // Get active leave requests for range of dates (used for dynamic attendance mapping)
  async findApprovedLeavesForRange(employeeId, startDate, endDate, dbClient = pool) {
    const queryText = `
      SELECT 
        leave_request_id as "leaveRequestId",
        employee_id as "employeeId",
        leave_type as "leaveType",
        start_date as "startDate",
        end_date as "endDate",
        status
      FROM public.leave_requests
      WHERE employee_id = $1
        AND status = 'APPROVED'
        AND NOT (end_date < $2 OR start_date > $3);
    `;
    const res = await dbClient.query(queryText, [employeeId, startDate, endDate]);
    return res.rows;
  }
}

module.exports = new LeaveRepository();
