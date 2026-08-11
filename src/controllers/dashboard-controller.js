const { pool } = require('../config/db');
const faceAiConfig = require('../modules/face-recognition/config/face-ai-config');

const systemSettingsInMemory = require('../config/system-settings');

class DashboardController {
  async getStats(req, res, next) {
    try {
      // 1. Total accounts
      const accountsRes = await pool.query('SELECT COUNT(*)::int AS count FROM public.accounts');
      const totalAccounts = accountsRes.rows[0].count;

      // 2. Today attendance
      const attendanceTodayRes = await pool.query("SELECT COUNT(*)::int AS count FROM public.attendance WHERE work_date = CURRENT_DATE");
      const todayAttendanceCount = attendanceTodayRes.rows[0].count;

      // 3. Today offline sync
      const offlineSyncRes = await pool.query("SELECT COUNT(*)::int AS count FROM public.attendance WHERE work_date = CURRENT_DATE AND is_offline_sync = 1");
      const todayOfflineSyncCount = offlineSyncRes.rows[0].count;

      // 4. Pending review
      const pendingReviewRes = await pool.query("SELECT COUNT(*)::int AS count FROM public.attendance WHERE attendance_status = 'REVIEW_REQUIRED' AND review_status = 'PENDING'");
      const pendingReviewCount = pendingReviewRes.rows[0].count;

      // 5. Shift statistics (Today)
      const todayStatsRes = await pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE check_in_status = 'LATE')::int as today_late,
          COUNT(*) FILTER (WHERE check_out_status = 'LEFT_EARLY')::int as today_early_leave,
          COALESCE(SUM(worked_minutes), 0)::int as today_worked_minutes,
          COALESCE(SUM(overtime_minutes), 0)::int as today_overtime_minutes,
          COUNT(*) FILTER (WHERE check_in_status = 'ON_TIME')::int as today_on_time
        FROM public.attendance
        WHERE work_date = CURRENT_DATE
      `);
      const tStats = todayStatsRes.rows[0];

      res.status(200).json({
        success: true,
        message: 'Lấy chỉ số thống kê dashboard thành công',
        data: {
          totalAccounts,
          todayAttendanceCount,
          todayOfflineSyncCount,
          pendingReviewCount,
          todayLateCount: tStats.today_late,
          todayEarlyLeaveCount: tStats.today_early_leave,
          todayWorkedMinutes: tStats.today_worked_minutes,
          todayOvertimeMinutes: tStats.today_overtime_minutes,
          todayOnTimeCount: tStats.today_on_time,
          onTimeRate: todayAttendanceCount > 0 ? parseFloat(((tStats.today_on_time / todayAttendanceCount) * 100).toFixed(2)) : 100
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async getCharts(req, res, next) {
    try {
      // 1. Attendance frequency (last 7 days)
      const attendanceByDayRes = await pool.query(`
        SELECT 
          work_date::text as date, 
          COUNT(*)::int as count,
          COUNT(*) FILTER (WHERE check_in_status = 'LATE')::int as late,
          COUNT(*) FILTER (WHERE check_out_status = 'LEFT_EARLY')::int as earlyLeave,
          COALESCE(SUM(worked_minutes), 0)::int as workedMinutes,
          COALESCE(SUM(overtime_minutes), 0)::int as overtimeMinutes
        FROM public.attendance 
        WHERE work_date >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY work_date
        ORDER BY work_date ASC
      `);

      // 2. Attendance by Department
      const attendanceByDeptRes = await pool.query(`
        SELECT 
          d.department_name as departmentName, 
          COUNT(a.attendance_id)::int as present,
          COUNT(ewa.assignment_id)::int as total
        FROM public.employee_work_assignments ewa
        LEFT JOIN public.attendance a ON ewa.assignment_id = a.assignment_id AND a.attendance_status != 'IN_PROGRESS'
        JOIN public.employees e ON ewa.employee_id = e.employee_id
        JOIN public.departments d ON e.department_id = d.department_id
        WHERE ewa.work_date = CURRENT_DATE
        GROUP BY d.department_name
      `);

      // 3. Attendance by Location
      const attendanceByLocRes = await pool.query(`
        SELECT 
          wl.location_name as locationName, 
          COUNT(a.attendance_id)::int as present
        FROM public.employee_work_assignments ewa
        LEFT JOIN public.attendance a ON ewa.assignment_id = a.assignment_id AND a.attendance_status != 'IN_PROGRESS'
        JOIN public.work_locations wl ON COALESCE(a.actual_check_in_location_id, a.matched_location_id, ewa.location_id) = wl.location_id
        WHERE ewa.work_date = CURRENT_DATE
        GROUP BY wl.location_name
      `);

      // 4. Biometric failures
      const bioFailuresRes = await pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE action = 'FACE_VERIFY_FAILED')::int as faceVerificationFail,
          COUNT(*) FILTER (WHERE action = 'WEBAUTHN_AUTHENTICATE_FAILED')::int as webauthnFail
        FROM public.system_logs
        WHERE action_time >= CURRENT_DATE
      `);

      // 5. Offline sync count (7 days)
      const offlineSyncRes = await pool.query("SELECT COUNT(*)::int AS count FROM public.attendance WHERE is_offline_sync = 1 AND work_date >= CURRENT_DATE - INTERVAL '7 days'");

      res.status(200).json({
        success: true,
        message: 'Lấy dữ liệu biểu đồ dashboard thành công',
        data: {
          attendanceByDay: attendanceByDayRes.rows,
          attendanceByDepartment: attendanceByDeptRes.rows,
          attendanceByLocation: attendanceByLocRes.rows,
          biometricVerificationFailures: {
            faceVerificationFail: bioFailuresRes.rows[0].faceverificationfail || 0,
            webauthnFail: bioFailuresRes.rows[0].webauthnfail || 0
          },
          offlineSyncCount: offlineSyncRes.rows[0].count
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async getSystemLogs(req, res, next) {
    try {
      const logsRes = await pool.query(`
        SELECT 
          sl.log_id as logId, 
          sl.action, 
          sl.description, 
          sl.action_time as actionTime, 
          sl.status,
          e.employee_code as employeeCode, 
          e.full_name as fullName
        FROM public.system_logs sl
        LEFT JOIN public.employees e ON sl.employee_id = e.employee_id
        ORDER BY sl.log_id DESC
        LIMIT 10
      `);

      res.status(200).json({
        success: true,
        message: 'Lấy danh sách nhật ký hệ thống thành công',
        data: {
          items: logsRes.rows
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async getSecurityMetrics(req, res, next) {
    try {
      // 1. Active sessions
      const sessionCountRes = await pool.query("SELECT COUNT(*)::int AS count FROM public.user_sessions WHERE session_status = 'ACTIVE'");
      const sessionCount = sessionCountRes.rows[0].count;

      // 2. Total unique devices
      const deviceCountRes = await pool.query("SELECT COUNT(DISTINCT device_fingerprint)::int AS count FROM public.user_sessions");
      const deviceCount = deviceCountRes.rows[0].count;

      // 3. WebAuthn credentials count
      const credCountRes = await pool.query("SELECT COUNT(*)::int AS count FROM public.employee_webauthn_credentials WHERE deleted_at IS NULL");
      const credentialCount = credCountRes.rows[0].count;

      // 4. Face profiles count
      const faceCountRes = await pool.query("SELECT COUNT(*)::int AS count FROM public.employee_face_profiles WHERE deleted_at IS NULL AND status = 1");
      const faceProfileCount = faceCountRes.rows[0].count;

      // 5. Failed logins today
      const failedLoginsRes = await pool.query("SELECT COUNT(*)::int AS count FROM public.system_logs WHERE action = 'LOGIN_FAILED' AND action_time >= CURRENT_DATE");
      const failedLoginCountToday = failedLoginsRes.rows[0].count;

      // 6. Blocked / Revoked sessions
      const blockedRes = await pool.query("SELECT COUNT(*)::int AS count FROM public.user_sessions WHERE session_status = 'REVOKED'");
      const blockedDevicesCount = blockedRes.rows[0].count;

      res.status(200).json({
        success: true,
        message: 'Lấy số liệu thống kê bảo mật thành công',
        data: {
          sessionCount,
          deviceCount,
          credentialCount,
          faceProfileCount,
          failedLoginCountToday,
          blockedDevicesCount
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async getAuditLogs(req, res, next) {
    try {
      const page = parseInt(req.query.page || '1', 10);
      const limit = parseInt(req.query.limit || '10', 10);
      const offset = (page - 1) * limit;
      const { keyword, status } = req.query;

      const params = [];
      const countParams = [];
      let whereClauses = [];

      if (status) {
        params.push(status);
        countParams.push(status);
        whereClauses.push(`sl.status = $${params.length}`);
      }

      if (keyword) {
        params.push(`%${keyword}%`);
        countParams.push(`%${keyword}%`);
        whereClauses.push(`(e.full_name ILIKE $${params.length} OR e.employee_code ILIKE $${params.length} OR sl.action ILIKE $${params.length} OR sl.description ILIKE $${params.length})`);
      }

      const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const countRes = await pool.query(`
        SELECT COUNT(*)::int AS total 
        FROM public.system_logs sl
        LEFT JOIN public.employees e ON sl.employee_id = e.employee_id
        ${whereStr}
      `, countParams);

      params.push(limit, offset);
      const dataRes = await pool.query(`
        SELECT 
          sl.log_id as logId, 
          sl.action, 
          sl.description, 
          sl.action_time as actionTime, 
          sl.status,
          sl.ip_address as ipAddress,
          sl.device_fingerprint as deviceFingerprint,
          e.employee_code as employeeCode, 
          e.full_name as fullName,
          a.username,
          r.role_name as role
        FROM public.system_logs sl
        LEFT JOIN public.employees e ON sl.employee_id = e.employee_id
        LEFT JOIN public.accounts a ON sl.account_id = a.account_id
        LEFT JOIN public.roles r ON a.role_id = r.role_id
        ${whereStr}
        ORDER BY sl.log_id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `, params);

      const { getPagination } = require('../utils/pagination');
      res.status(200).json({
        success: true,
        message: 'Lấy nhật ký hệ thống thành công',
        data: {
          items: dataRes.rows,
          pagination: getPagination(page, limit, countRes.rows[0].total)
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async getSystemSettings(req, res, next) {
    try {
      const hcShiftRes = await pool.query(
        "SELECT start_time::text, end_time::text, late_grace_minutes, early_leave_grace_minutes FROM public.work_shifts WHERE shift_code IN ('HC', 'CA_1') OR shift_id = 1 ORDER BY shift_id ASC LIMIT 1"
      );
      if (hcShiftRes.rows.length > 0) {
        systemSettingsInMemory.companyStartTime = hcShiftRes.rows[0].start_time;
        systemSettingsInMemory.companyEndTime = hcShiftRes.rows[0].end_time;
        systemSettingsInMemory.companyLateGraceMinutes = hcShiftRes.rows[0].late_grace_minutes;
        systemSettingsInMemory.companyEarlyLeaveGraceMinutes = hcShiftRes.rows[0].early_leave_grace_minutes;
      }
      res.status(200).json({
        success: true,
        message: 'Lấy cấu hình hệ thống thành công',
        data: systemSettingsInMemory
      });
    } catch (err) {
      next(err);
    }
  }

  async updateSystemSettings(req, res, next) {
    try {
      Object.assign(systemSettingsInMemory, req.body);

      if (req.body.companyStartTime && req.body.companyEndTime) {
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;
        if (!timeRegex.test(req.body.companyStartTime) || !timeRegex.test(req.body.companyEndTime)) {
          return res.status(400).json({ 
            success: false, 
            message: 'Định dạng giờ không hợp lệ. Vui lòng nhập đúng định dạng HH:MM hoặc HH:MM:SS (ví dụ: 08:00:00)' 
          });
        }
        const lateGrace = parseInt(req.body.companyLateGraceMinutes !== undefined ? req.body.companyLateGraceMinutes : 0, 10);
        const earlyGrace = parseInt(req.body.companyEarlyLeaveGraceMinutes !== undefined ? req.body.companyEarlyLeaveGraceMinutes : 0, 10);
        await pool.query(
          `UPDATE public.work_shifts 
           SET start_time = $1, end_time = $2, late_grace_minutes = $3, early_leave_grace_minutes = $4, updated_at = CURRENT_TIMESTAMP 
           WHERE shift_code IN ('HC', 'CA_1') OR shift_id = 1`,
          [req.body.companyStartTime, req.body.companyEndTime, lateGrace, earlyGrace]
        );

        // Auto-recalculate existing attendance logs based on new shift parameters
        const attendanceCalcService = require('../services/attendance-calculation-service');
        const attRes = await pool.query('SELECT * FROM public.attendance');
        const shiftsRes = await pool.query('SELECT * FROM public.work_shifts');
        const shiftsMap = {};
        for (const s of shiftsRes.rows) {
          shiftsMap[s.shift_id] = s;
          shiftsMap[s.shift_code] = s;
        }
        const defaultShift = shiftsMap['CA_1'] || shiftsMap[1] || shiftsRes.rows[0];

        for (const att of attRes.rows) {
          if (!att.check_in_time) continue;
          const shift = shiftsMap[att.shift_id] || defaultShift;
          const checkInTime = new Date(att.check_in_time);
          const workDate = att.work_date;
          const dateStr = workDate ? new Date(workDate).toISOString().substring(0, 10) : new Date().toISOString().substring(0, 10);

          const ciResult = attendanceCalcService.calculateCheckIn(checkInTime, workDate, shift);

          let coResult = {
            scheduledEndTime: new Date(`${dateStr}T${shift.end_time || shift.endTime}+07:00`),
            checkOutStatus: att.check_out_status || 'NORMAL',
            earlyLeaveMinutes: att.early_leave_minutes || 0,
            overtimeMinutes: att.overtime_minutes || 0,
            workedMinutes: att.worked_minutes || 0,
            attendanceStatus: att.attendance_status
          };

          if (att.check_out_time) {
            const checkOutTime = new Date(att.check_out_time);
            coResult = attendanceCalcService.calculateCheckOut(
              checkInTime,
              checkOutTime,
              workDate,
              shift,
              ciResult.checkInStatus,
              []
            );
          }

          if (isNaN(ciResult.scheduledStartTime?.getTime()) || isNaN(coResult.scheduledEndTime?.getTime())) {
            console.error('INVALID DATE DETECTED:', {
              attId: att.attendance_id,
              ciResult,
              coResult,
              shift,
              dateStr,
              workDate
            });
          }

          const safeDate = (d) => (d && d instanceof Date && !isNaN(d.getTime())) ? d : null;

          await pool.query(
            `UPDATE public.attendance
             SET 
               scheduled_start_time = $1,
               scheduled_end_time = $2,
               check_in_status = $3,
               check_out_status = $4,
               late_minutes = $5,
               early_leave_minutes = $6,
               worked_minutes = $7,
               overtime_minutes = $8,
               attendance_status = $9,
               updated_at = CURRENT_TIMESTAMP
             WHERE attendance_id = $10`,
            [
              safeDate(ciResult.scheduledStartTime),
              safeDate(coResult.scheduledEndTime),
              ciResult.checkInStatus,
              coResult.checkOutStatus,
              ciResult.lateMinutes,
              coResult.earlyLeaveMinutes,
              coResult.workedMinutes,
              coResult.overtimeMinutes,
              coResult.attendanceStatus,
              att.attendance_id
            ]
          );
        }
      }

      // Sync leave balance for ALL employees in the database if defaultAnnualLeaveDays is changed
      if (req.body.defaultAnnualLeaveDays !== undefined) {
        const newTotal = parseFloat(req.body.defaultAnnualLeaveDays);
        const year = new Date().getFullYear();
        await pool.query(
          `UPDATE public.leave_balances 
           SET annual_days_total = $1, updated_at = CURRENT_TIMESTAMP 
           WHERE year = $2`,
          [newTotal, year]
        );
      }

      res.status(200).json({
        success: true,
        message: 'Cập nhật cấu hình hệ thống và tính toán lại dữ liệu chấm công thành công',
        data: systemSettingsInMemory
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new DashboardController();
