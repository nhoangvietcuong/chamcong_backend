const { pool } = require('../config/db');

class AttendanceAnalyticsRepository {
  async getEmployeePeriodData(employeeId, startDate, endDate, dbClient = pool) {
    const queryText = `
      SELECT 
        ewa.assignment_id,
        ewa.work_date,
        ewa.status AS assignment_status,
        ws.shift_id,
        ws.shift_code,
        ws.shift_name,
        ws.start_time AS scheduled_start,
        ws.end_time AS scheduled_end,
        a.attendance_id,
        a.check_in_time,
        a.check_out_time,
        a.attendance_status,
        a.check_in_status,
        a.check_out_status,
        a.late_minutes,
        a.early_leave_minutes
      FROM public.employee_work_assignments ewa
      LEFT JOIN public.work_shifts ws ON ewa.shift_id = ws.shift_id
      LEFT JOIN public.attendance a ON ewa.assignment_id = a.assignment_id
      WHERE ewa.employee_id = $1 
        AND ewa.work_date >= $2 
        AND ewa.work_date <= $3
      ORDER BY ewa.work_date ASC;
    `;
    const res = await dbClient.query(queryText, [employeeId, startDate, endDate]);
    return res.rows;
  }
}

module.exports = new AttendanceAnalyticsRepository();
