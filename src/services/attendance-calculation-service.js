class AttendanceCalculationService {
  /**
   * Định dạng ngày thành chuỗi YYYY-MM-DD
   * @param {Date|string} dateVal 
   * @returns {string}
   */
  _formatDate(dateVal) {
    if (!dateVal) return null;
    if (typeof dateVal === 'string') {
      return dateVal.substring(0, 10);
    }
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return null;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Tính toán thông số check-in
   * @param {Date} checkInTime - Thời gian check-in thực tế
   * @param {Date|string} workDate - Ngày làm việc
   * @param {object} shift - Đối tượng Ca làm việc
   */
  calculateCheckIn(checkInTime, workDate, shift) {
    const startTimeStr = shift.startTime || shift.start_time;
    const lateGrace = parseInt(shift.lateGraceMinutes !== undefined ? shift.lateGraceMinutes : (shift.late_grace_minutes || 0), 10);
    
    const dateStr = this._formatDate(workDate) || new Date().toISOString().substring(0, 10);
    const scheduledStart = new Date(`${dateStr}T${startTimeStr}+07:00`);
    const diffMs = checkInTime.getTime() - scheduledStart.getTime();
    const diffMinutes = Math.round(diffMs / 60000);

    let checkInStatus = 'ON_TIME';
    let lateMinutes = 0;

    if (diffMinutes > lateGrace) {
      checkInStatus = 'LATE';
      lateMinutes = diffMinutes - lateGrace;
    }

    return {
      scheduledStartTime: scheduledStart,
      checkInStatus,
      lateMinutes
    };
  }

  /**
   * Tính toán thông số check-out và tổng kết ca
   * @param {Date} checkInTime - Thời gian check-in thực tế
   * @param {Date} checkOutTime - Thời gian check-out thực tế
   * @param {Date|string} workDate - Ngày làm việc
   * @param {object} shift - Đối tượng Ca làm việc
   * @param {string} checkInStatus - Trạng thái check-in đã tính trước đó
   */
  calculateCheckOut(checkInTime, checkOutTime, workDate, shift, checkInStatus, approvedOtRequests = []) {
    const startTimeStr = shift.startTime || shift.start_time;
    const endTimeStr = shift.endTime || shift.end_time;
    const earlyLeaveGrace = parseInt(shift.earlyLeaveGraceMinutes !== undefined ? shift.earlyLeaveGraceMinutes : (shift.early_leave_grace_minutes || 0), 10);

    const dateStr = this._formatDate(workDate) || new Date().toISOString().substring(0, 10);
    const scheduledStart = new Date(`${dateStr}T${startTimeStr}+07:00`);
    let scheduledEnd = new Date(`${dateStr}T${endTimeStr}+07:00`);

    // Xử lý ca qua đêm (End time nhỏ hơn Start time)
    if (endTimeStr < startTimeStr) {
      scheduledEnd = new Date(`${this._getNextDay(dateStr)}T${endTimeStr}+07:00`);
    }

    const workedMs = checkOutTime.getTime() - checkInTime.getTime();
    const workedMinutes = Math.max(0, Math.round(workedMs / 60000));

    let checkOutStatus = 'NORMAL';
    let earlyLeaveMinutes = 0;
    let overtimeMinutes = 0;

    // Tính toán khoảng cách so với giờ ra ca dự kiến
    const diffEndMs = checkOutTime.getTime() - scheduledEnd.getTime();
    const diffEndMinutes = Math.round(diffEndMs / 60000); // Dương là về sau giờ làm, âm là về trước giờ làm

    if (diffEndMinutes < 0) {
      // Về sớm
      const earlyMins = Math.abs(diffEndMinutes);
      if (earlyMins > earlyLeaveGrace) {
        checkOutStatus = 'LEFT_EARLY';
        earlyLeaveMinutes = earlyMins;
      }
    } else {
      // Về trễ / Tăng ca
      const otMins = diffEndMinutes;
      if (otMins > earlyLeaveGrace) { // Sử dụng earlyLeaveGrace làm ngưỡng tối thiểu để bắt đầu tính tăng ca
        if (approvedOtRequests && approvedOtRequests.length > 0) {
          let totalApprovedOtMins = 0;
          for (const ot of approvedOtRequests) {
            const otStartStr = ot.start_time || ot.startTime;
            const otEndStr = ot.end_time || ot.endTime;
            const approvedStart = new Date(`${dateStr}T${otStartStr}+07:00`);
            let approvedEnd = new Date(`${dateStr}T${otEndStr}+07:00`);
            if (otEndStr < otStartStr) {
              approvedEnd = new Date(`${this._getNextDay(dateStr)}T${otEndStr}+07:00`);
            }
            
            // Tìm phần giao giữa [scheduledEnd, checkOutTime] và [approvedStart, approvedEnd]
            const intersectStart = new Date(Math.max(scheduledEnd.getTime(), approvedStart.getTime()));
            const intersectEnd = new Date(Math.min(checkOutTime.getTime(), approvedEnd.getTime()));
            
            if (intersectStart.getTime() < intersectEnd.getTime()) {
              totalApprovedOtMins += Math.round((intersectEnd.getTime() - intersectStart.getTime()) / 60000);
            }
          }
          
          if (totalApprovedOtMins > 0) {
            checkOutStatus = 'OVERTIME';
            overtimeMinutes = totalApprovedOtMins;
          }
        }
      }
    }

    // Xác định trạng thái chấm công tổng thể (attendance_status)
    let attendanceStatus = 'NORMAL';
    if (checkInStatus === 'LATE' && checkOutStatus === 'LEFT_EARLY') {
      attendanceStatus = 'LATE_AND_LEFT_EARLY';
    } else if (checkInStatus === 'LATE') {
      attendanceStatus = 'LATE';
    } else if (checkOutStatus === 'LEFT_EARLY') {
      attendanceStatus = 'LEFT_EARLY';
    } else if (checkOutStatus === 'OVERTIME') {
      attendanceStatus = 'OVERTIME';
    }

    return {
      scheduledEndTime: scheduledEnd,
      checkOutStatus,
      earlyLeaveMinutes,
      overtimeMinutes,
      workedMinutes,
      attendanceStatus
    };
  }

  _getNextDay(dateStr) {
    const d = new Date(`${dateStr}T12:00:00+07:00`);
    d.setDate(d.getDate() + 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

module.exports = new AttendanceCalculationService();
