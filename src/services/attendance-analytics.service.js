const attendanceAnalyticsRepository = require('../repositories/attendance-analytics.repository');

function formatDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

class AttendanceAnalyticsService {
  async getEmployeeAnalytics(employeeId, startDate, endDate) {
    const rawData = await attendanceAnalyticsRepository.getEmployeePeriodData(employeeId, startDate, endDate);
    const leaveRepository = require('../repositories/leave-repository');
    
    // Fetch approved leaves and build a Set of YYYY-MM-DD leave dates
    const approvedLeaves = await leaveRepository.findApprovedLeavesForRange(employeeId, startDate, endDate);
    const leaveDates = new Set();
    for (const req of approvedLeaves) {
      let current = new Date(req.startDate);
      const end = new Date(req.endDate);
      while (current.getTime() <= end.getTime()) {
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        const day = String(current.getDate()).padStart(2, '0');
        leaveDates.add(`${year}-${month}-${day}`);
        current.setDate(current.getDate() + 1);
      }
    }
    
    let totalAssigned = 0;
    let totalCompleted = 0;
    let totalOnTime = 0;
    let totalLate = 0;
    let totalEarlyLeave = 0;
    let totalLateEarly = 0;
    let totalWorkingHours = 0;
    let absentCount = 0;
    let leaveCount = 0; // Placeholder
    let pendingCount = 0;

    const todayStr = formatDate(new Date());
    const dailyDataMap = {};

    // Initialize all dates in the range with default values (OFF)
    let current = new Date(startDate);
    const end = new Date(endDate);
    while (current.getTime() <= end.getTime()) {
      const dateStr = formatDate(current);
      dailyDataMap[dateStr] = {
        date: dateStr,
        status: 'OFF',
        workingHours: 0,
        shiftName: null,
        checkInTime: null,
        checkOutTime: null,
        lateMinutes: 0,
        earlyLeaveMinutes: 0
      };
      current.setDate(current.getDate() + 1);
    }

    // Process database records
    for (const row of rawData) {
      const dateStr = formatDate(row.work_date);
      
      if (row.assignment_status === 'CANCELLED') {
        continue;
      }

      totalAssigned++;

      let status = 'PENDING';
      let workingHours = 0;

      // Calculate working hours if checked in & out
      if (row.check_in_time && row.check_out_time) {
        const checkIn = new Date(row.check_in_time);
        const checkOut = new Date(row.check_out_time);
        const diffMs = checkOut.getTime() - checkIn.getTime();
        workingHours = Math.max(0, parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2)));
        totalWorkingHours += workingHours;
      }

      if (row.attendance_id) {
        if (row.attendance_status === 'COMPLETED') {
          totalCompleted++;
        }
        
        const isLate = row.check_in_status === 'LATE';
        const isEarly = row.check_out_status === 'LEFT_EARLY';

        if (row.check_in_status === 'ON_TIME') {
          totalOnTime++;
        } else if (isLate) {
          totalLate++;
        }

        if (isEarly) {
          totalEarlyLeave++;
        }

        if (isLate || isEarly) {
          totalLateEarly++;
        }

        if (row.attendance_status === 'COMPLETED') {
          if (isLate || isEarly) {
            status = isLate ? 'LATE' : 'EARLY_LEAVE';
          } else {
            status = 'PRESENT';
          }
        } else {
          status = 'PRESENT';
        }
      } else {
        if (leaveDates.has(dateStr)) {
          leaveCount++;
          status = 'ON_LEAVE';
        } else if (dateStr < todayStr) {
          absentCount++;
          status = 'ABSENT';
        } else {
          pendingCount++;
          status = 'PENDING';
        }
      }

      if (dailyDataMap[dateStr]) {
        dailyDataMap[dateStr] = {
          date: dateStr,
          status,
          workingHours,
          shiftName: row.shift_name || row.shift_code || 'Ca Làm Việc',
          checkInTime: formatTime(row.check_in_time),
          checkOutTime: formatTime(row.check_out_time),
          lateMinutes: row.late_minutes || 0,
          earlyLeaveMinutes: row.early_leave_minutes || 0
        };
      }
    }

    const attendanceRate = totalAssigned > 0 
      ? Math.round((totalCompleted / totalAssigned) * 100) 
      : 0;

    return {
      summary: {
        totalAssigned,
        totalCompleted,
        totalOnTime,
        totalLate,
        totalEarlyLeave,
        totalLateEarly,
        totalWorkingHours: parseFloat(totalWorkingHours.toFixed(2)),
        attendanceRate,
        absent: absentCount,
        leave: leaveCount,
        pendingShift: pendingCount
      },
      dailyData: Object.values(dailyDataMap)
    };
  }
}

module.exports = new AttendanceAnalyticsService();
