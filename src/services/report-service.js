const reportRepository = require('../repositories/report-repository');
const { pool } = require('../config/db');

class ReportService {
  /**
   * Lấy báo cáo tổng hợp toàn hệ thống
   */
  async getReportsSummary(queryParams) {
    const { fromDate, toDate } = queryParams;
    const filters = { fromDate, toDate };

    // Chạy song song tất cả các query để tối ưu tốc độ
    const [
      attendanceSummary,
      byDepartment,
      byLocation,
      faceStats,
      webauthnStats,
      absentData,
      dailyTrend,
    ] = await Promise.all([
      reportRepository.getAttendanceSummary(filters),
      reportRepository.getStatsByDepartment(filters),
      reportRepository.getStatsByLocation(filters),
      reportRepository.getFaceVerificationStats(filters),
      reportRepository.getWebAuthnStats(filters),
      reportRepository.getAbsentCount(filters),
      reportRepository.getDailyTrend(filters),
    ]);

    // Tính tỷ lệ % Face Recognition
    const faceTotal = parseInt(faceStats.total_attempts, 10) || 0;
    const faceSuccess = parseInt(faceStats.success_count, 10) || 0;
    const faceSuccessRate = faceTotal > 0
      ? parseFloat(((faceSuccess / faceTotal) * 100).toFixed(1))
      : null;

    // Tính tỷ lệ % WebAuthn
    const webauthnTotal = parseInt(webauthnStats.total_attempts, 10) || 0;
    const webauthnSuccess = parseInt(webauthnStats.success_count, 10) || 0;
    const webauthnSuccessRate = webauthnTotal > 0
      ? parseFloat(((webauthnSuccess / webauthnTotal) * 100).toFixed(1))
      : null;

    // Tính tỷ lệ % hoàn thành chấm công tổng hợp
    const total = parseInt(attendanceSummary.total_records, 10) || 0;
    const completed = parseInt(attendanceSummary.completed, 10) || 0;
    const completionRate = total > 0
      ? parseFloat(((completed / total) * 100).toFixed(1))
      : null;

    return {
      period: {
        fromDate: fromDate || null,
        toDate: toDate || null,
      },
      attendance: {
        totalRecords: total,
        completed,
        inProgress: parseInt(attendanceSummary.in_progress, 10) || 0,
        invalid: parseInt(attendanceSummary.invalid, 10) || 0,
        reviewRequired: parseInt(attendanceSummary.review_required, 10) || 0,
        checkedOut: parseInt(attendanceSummary.checked_out, 10) || 0,
        notCheckedOut: parseInt(attendanceSummary.not_checked_out, 10) || 0,
        completionRate,
        absentCount: parseInt(absentData.absent_count, 10) || 0,
        offlineSyncCount: parseInt(attendanceSummary.offline_sync_count, 10) || 0,
      },
      review: {
        pending: parseInt(attendanceSummary.review_pending, 10) || 0,
        approved: parseInt(attendanceSummary.review_approved, 10) || 0,
        rejected: parseInt(attendanceSummary.review_rejected, 10) || 0,
      },
      risk: {
        high: parseInt(attendanceSummary.high_risk_count, 10) || 0,
        medium: parseInt(attendanceSummary.medium_risk_count, 10) || 0,
        low: parseInt(attendanceSummary.low_risk_count, 10) || 0,
      },
      faceVerification: {
        totalAttempts: faceTotal,
        successCount: faceSuccess,
        failedCount: parseInt(faceStats.failed_count, 10) || 0,
        successRate: faceSuccessRate,
      },
      webauthn: {
        totalAttempts: webauthnTotal,
        successCount: webauthnSuccess,
        failedCount: parseInt(webauthnStats.failed_count, 10) || 0,
        successRate: webauthnSuccessRate,
      },
      byDepartment: byDepartment.map(row => ({
        departmentId: parseInt(row.department_id, 10),
        departmentName: row.department_name,
        total: parseInt(row.total, 10),
        completed: parseInt(row.completed, 10),
        offlineSync: parseInt(row.offline_sync, 10),
        reviewPending: parseInt(row.review_pending, 10),
        completionRate: parseInt(row.total, 10) > 0
          ? parseFloat(((parseInt(row.completed, 10) / parseInt(row.total, 10)) * 100).toFixed(1))
          : 0,
      })),
      byLocation: byLocation.map(row => ({
        locationId: parseInt(row.location_id, 10),
        locationName: row.location_name,
        total: parseInt(row.total, 10),
        completed: parseInt(row.completed, 10),
        offlineSync: parseInt(row.offline_sync, 10),
      })),
      dailyTrend: dailyTrend.map(row => ({
        date: row.date,
        total: parseInt(row.total, 10),
        completed: parseInt(row.completed, 10),
        offlineSync: parseInt(row.offline_sync, 10),
      })),
    };
  }

  async getPayrollReport(startDate, endDate, holidaysParam = null) {
    const rawRows = await reportRepository.getPayrollReportData(startDate, endDate);
    
    // Extract target month and year from endDate for summary metrics filtering
    const targetDateObj = new Date(endDate + 'T12:00:00+07:00');
    const targetMonth = targetDateObj.getMonth();
    const targetYear = targetDateObj.getFullYear();

    let configuredHolidays = [];
    if (holidaysParam) {
      try {
        configuredHolidays = JSON.parse(holidaysParam);
      } catch (e) {
        console.error('Failed to parse holidaysParam', e);
      }
    }

    const getMatchingHoliday = (dateStr) => {
      const d = new Date(dateStr + 'T12:00:00+07:00');
      const year = d.getFullYear();
      const month = d.getMonth() + 1; // 1-12
      const date = d.getDate();
      const dayOfWeek = d.getDay() === 0 ? 8 : d.getDay() + 1; // 2 for Monday, 8 for Sunday
      
      for (const h of configuredHolidays) {
        if (h.status === 'inactive') continue;
        if (!h.isAnnual && h.year !== year) continue;
        
        if (h.calendarType === 'solar') {
          if (h.repeatType === 'all') return h;
          if (h.repeatType === 'weekly') {
            if (h.selectedDays.includes(dayOfWeek)) return h;
          }
          if (h.repeatType === 'monthly') {
            if (Number(h.month) === month && h.selectedDays.includes(date)) return h;
          }
        } else if (h.calendarType === 'lunar') {
          if (h.month === 3 && h.selectedDays.includes(10) && dateStr === '2026-04-26') return h;
          if (h.month === 1 && dateStr >= '2026-02-16' && dateStr <= '2026-02-20') return h;
        }
      }
      
      const monthDay = dateStr.slice(5); // "MM-DD"
      const standardHolidays = ['01-01', '04-30', '05-01', '09-02', '09-03'];
      const specificHolidays2026 = ['2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-04-26'];
      if (standardHolidays.includes(monthDay) || specificHolidays2026.includes(dateStr)) {
        return { name: 'Ngày lễ', multiplier: 2 };
      }
      return null;
    };

    // Fetch all approved leaves for the query date range, including leave_type
    const approvedLeaves = await pool.query(`
      SELECT employee_id, start_date::text as start_date, end_date::text as end_date, leave_type, reason
      FROM public.leave_requests
      WHERE status = 'APPROVED'
        AND NOT (end_date < $1 OR start_date > $2)
    `, [startDate, endDate]);

    // Build a map of employeeId -> Map of leave date -> leaveType
    const leaveMap = new Map();
    for (const req of approvedLeaves.rows) {
      const empId = String(req.employee_id);
      if (!leaveMap.has(empId)) {
        leaveMap.set(empId, new Map());
      }
      const leaveSet = leaveMap.get(empId);

      const startStr = req.start_date.split('T')[0];
      const endStr = req.end_date.split('T')[0];

      let cur = new Date(startStr + 'T12:00:00');
      const endD = new Date(endStr + 'T12:00:00');

      while (cur.getTime() <= endD.getTime()) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const d = String(cur.getDate()).padStart(2, '0');
        const curDateStr = `${y}-${m}-${d}`;

        leaveSet.set(curDateStr, { leaveType: req.leave_type, reason: req.reason });
        cur.setDate(cur.getDate() + 1);
      }
    }

    // Fetch approved/completed overtime attendance for the query date range
    const overtimeAttendance = await pool.query(`
      SELECT 
        ewa.employee_id,
        ewa.work_date::text as work_date,
        ao.check_in_time,
        ao.check_out_time,
        ao.approved_minutes,
        ao.actual_minutes,
        otr.reason
      FROM public.attendance_overtime ao
      JOIN public.employee_work_assignments ewa ON ao.assignment_id = ewa.assignment_id
      LEFT JOIN public.ot_requests otr ON ao.ot_request_id = otr.ot_request_id
      WHERE ewa.work_date >= $1 AND ewa.work_date <= $2
        AND ao.attendance_status = 'COMPLETED'
    `, [startDate, endDate]);

    // Build a map of employeeId -> map of date -> { overtimeHours, reason }
    const otMap = new Map();
    for (const row of overtimeAttendance.rows) {
      const empId = String(row.employee_id);
      const dateStr = row.work_date;
      
      let minutes = 0;
      if (row.approved_minutes && row.approved_minutes > 0) {
        minutes = row.approved_minutes;
      } else if (row.actual_minutes && row.actual_minutes > 0) {
        minutes = row.actual_minutes;
      } else if (row.check_in_time && row.check_out_time) {
        const otDiffMs = new Date(row.check_out_time) - new Date(row.check_in_time);
        minutes = Math.max(1, Math.round(otDiffMs / 60000));
      }

      let otHours = minutes > 0 ? parseFloat((minutes / 60).toFixed(4)) : 0;
      if (otHours === 0 && row.check_in_time && row.check_out_time) {
        otHours = 0.01;
      }
      
      const otCheckIn = row.check_in_time ? new Date(row.check_in_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: process.env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh' }) : null;
      const otCheckOut = row.check_out_time ? new Date(row.check_out_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: process.env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh' }) : null;

      if (!otMap.has(empId)) {
        otMap.set(empId, new Map());
      }

      const dateMap = otMap.get(empId);
      const existing = dateMap.get(dateStr);

      if (existing) {
        existing.overtimeHours = parseFloat((existing.overtimeHours + otHours).toFixed(4));
        if (otCheckIn && !existing.otCheckInTime) existing.otCheckInTime = otCheckIn;
        if (otCheckOut) existing.otCheckOutTime = otCheckOut;
        if (row.reason && !existing.reason) existing.reason = row.reason;
      } else {
        dateMap.set(dateStr, { 
          overtimeHours: otHours, 
          reason: row.reason || null,
          otCheckInTime: otCheckIn,
          otCheckOutTime: otCheckOut
        });
      }
    }

    // Build the date array in range
    const dates = [];
    let current = new Date(startDate);
    const end = new Date(endDate);
    while (current.getTime() <= end.getTime()) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const day = String(current.getDate()).padStart(2, '0');
      dates.push(`${year}-${month}-${day}`);
      current.setDate(current.getDate() + 1);
    }

    const employeeMap = {};

    for (const row of rawRows) {
      const empId = row.employee_id;
      if (!employeeMap[empId]) {
        employeeMap[empId] = {
          employeeId: empId,
          employeeCode: row.employee_code,
          fullName: row.full_name,
          departmentName: row.department_name || 'N/A',
          summary: {
            totalAssigned: 0,
            totalCompleted: 0,
            totalOnTime: 0,
            totalLate: 0,
            totalEarlyLeave: 0,
            totalLateEarly: 0,
            totalWorkingHours: 0,
            absent: 0,
            pending: 0,
            leave: 0,
            annualLeave: 0,
            compensatoryLeave: 0,
            holidayLeave: 0,
            totalOvertimeHours: 0,
            totalOvertimeDays: 0
          },
          days: {}
        };
        // Initialize days: Sunday is OFF, other days are PENDING, holidays are HOLIDAY, leaves are ON_LEAVE / COMPENSATORY_LEAVE
        for (const dateStr of dates) {
          const dayOfWeek = new Date(dateStr + 'T12:00:00+07:00').getDay();
          const isSunday = dayOfWeek === 0;
          
          const matchingHoliday = getMatchingHoliday(dateStr);
          const isHoliday = matchingHoliday !== null;

          const empLeaves = leaveMap.get(String(empId));
          const leaveObj = empLeaves ? empLeaves.get(dateStr) : null;
          const leaveType = leaveObj ? leaveObj.leaveType : null;
          const leaveReason = leaveObj ? leaveObj.reason : null;
          
          let initStatus = 'PENDING';
          if (isHoliday) {
            initStatus = 'HOLIDAY';
          } else if (leaveType) {
            initStatus = leaveType === 'COMPENSATORY' ? 'COMPENSATORY_LEAVE' : 'ON_LEAVE';
          } else if (isSunday) {
            initStatus = 'OFF';
          }

          employeeMap[empId].days[dateStr] = {
            status: initStatus,
            workingHours: null,
            overtimeHours: 0,
            nightHours: 0,
            leaveReason: leaveReason || null
          };

          if (isHoliday) {
            employeeMap[empId].summary.holidayLeave++;
          } else if (leaveType) {
            employeeMap[empId].summary.leave++;
            if (leaveType === 'COMPENSATORY') {
              employeeMap[empId].summary.compensatoryLeave++;
            } else {
              employeeMap[empId].summary.annualLeave++;
            }
          }
        }
      }

      if (!row.work_date) continue;

      const dateStr = row.work_date;
      const emp = employeeMap[empId];

      if (row.assignment_status === 'CANCELLED') {
        continue;
      }

      emp.summary.totalAssigned++;

      let status = 'PENDING';
      let hours = null;
      let leaveReason = null;

      if (row.attendance_id) {
        if (!row.check_out_time) {
          hours = 0;
        } else {
          let workedMinutes = 0;
          if (row.check_in_time && row.check_out_time) {
            const diffMs = new Date(row.check_out_time) - new Date(row.check_in_time);
            workedMinutes = Math.max(0, Math.round(diffMs / 60000));
          } else if (row.worked_minutes) {
            workedMinutes = parseInt(row.worked_minutes, 10);
          }
          
          hours = parseFloat((workedMinutes / 60).toFixed(2));
        }
      }
      
      if (hours !== null) {
        emp.summary.totalWorkingHours += hours;
      }

      if (row.attendance_id) {
        if (row.attendance_status !== 'INVALID') {
          emp.summary.totalCompleted++;
        }

        let isLate = row.check_in_status === 'LATE';
        if (!isLate && row.check_in_time) {
          const timeStr = new Date(row.check_in_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
          if (timeStr > '08:00') {
            isLate = true;
          }
        }

        if (isLate) {
          emp.summary.totalLate++;
        } else {
          emp.summary.totalOnTime++;
        }

        if (row.check_out_status === 'LEFT_EARLY') {
          emp.summary.totalEarlyLeave++;
        }
        if (isLate || row.check_out_status === 'LEFT_EARLY') {
          emp.summary.totalLateEarly++;
        }

        if (!row.check_out_time) {
          status = isLate ? 'LATE' : 'PRESENT';
        } else if (row.attendance_status === 'INVALID') {
          status = 'KP';
        } else {
          status = isLate ? 'LATE' : 'PRESENT';
        }
      } else {
        const empLeaves = leaveMap.get(String(empId));
        const leaveObj = empLeaves ? empLeaves.get(dateStr) : null;
        const leaveType = leaveObj ? leaveObj.leaveType : null;
        leaveReason = leaveObj ? leaveObj.reason : null;

        if (leaveType) {
          if (leaveType === 'COMPENSATORY') {
            status = 'COMPENSATORY_LEAVE';
          } else {
            status = 'ON_LEAVE';
          }
        } else if (emp.days[dateStr]?.status === 'HOLIDAY') {
          status = 'HOLIDAY';
        } else if (emp.days[dateStr]?.status === 'OFF') {
          status = 'OFF';
        } else {
          const todayStr = new Date().toISOString().split('T')[0];
          if (dateStr < todayStr) {
            emp.summary.absent++;
            status = 'KP';
          } else {
            emp.summary.pending++;
            status = 'PENDING';
          }
        }
      }

      // TODO: Tích hợp module Ngày lễ ở Backend để tự động chuyển status sang 'HOLIDAY' nếu trùng ngày lễ.
      // TODO: Tích hợp ca đêm ở Backend để trả về số giờ làm ca đêm nightHours.

      // Get overtime info for this date
      const empOt = otMap.get(String(empId));
      const otObj = empOt ? empOt.get(dateStr) : null;
      const otHours = otObj ? otObj.overtimeHours : 0;
      const otReason = otObj ? otObj.reason : null;

      // Holiday handling logic
      const matchingHoliday = getMatchingHoliday(dateStr);
      const isHoliday = matchingHoliday !== null;

      if (isHoliday) {
        const multiplier = matchingHoliday.multiplier || 2;
        if (row.attendance_id) {
          if (hours !== null) {
            hours = hours * multiplier;
          }
        } else {
          status = 'HOLIDAY';
          hours = null;
        }
      }

      // Recalculate totalWorkingHours if hours was modified by holiday logic
      if (isHoliday && hours !== null && row.attendance_id) {
        const multiplier = matchingHoliday.multiplier || 2;
        emp.summary.totalWorkingHours += (hours - (hours / multiplier));
      }

      emp.days[dateStr] = {
        status,
        workingHours: hours,
        checkInTime: row.check_in_time ? new Date(row.check_in_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: process.env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh' }) : null,
        checkOutTime: row.check_out_time ? new Date(row.check_out_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: process.env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh' }) : null,
        overtimeHours: otHours,
        otCheckInTime: otObj ? otObj.otCheckInTime : null,
        otCheckOutTime: otObj ? otObj.otCheckOutTime : null,
        nightHours: 0,
        leaveReason: leaveReason || null,
        otReason: otReason || null
      };
    }

    // Format totalWorkingHours and calculate overtime totals
    const items = Object.values(employeeMap).map(emp => {
      emp.summary.totalWorkingHours = parseFloat(emp.summary.totalWorkingHours.toFixed(2));
      
      let totalOvertimeHours = 0;
      let totalOvertimeDays = 0;
      for (const dateStr of dates) {
        const day = emp.days[dateStr];
        if (day && day.overtimeHours > 0) {
          totalOvertimeHours += day.overtimeHours;
          totalOvertimeDays++;
        }
      }
      emp.summary.totalOvertimeHours = parseFloat(totalOvertimeHours.toFixed(2));
      emp.summary.totalOvertimeDays = totalOvertimeDays;
      
      return emp;
    });

    return {
      dates,
      items
    };
  }
}

module.exports = new ReportService();
