const { pool } = require('../config/db');
const pushNotificationService = require('./push-notification.service');
const logger = require('../utils/logger');

class ShiftReminderScheduler {
  /**
   * Scans active shifts and sends push reminders for Check-in (15 mins before / 5 mins retry)
   * and Check-out (after shift end 17:30 / 10 mins retry).
   */
  async run() {
    try {
      const todayStr = new Date().toISOString().substring(0, 10);
      const now = new Date();

      // 1. Check-in Reminders Query: Active assignments for today without attendance
      const checkInQuery = `
        SELECT 
          ewa.assignment_id AS "assignmentId",
          ewa.employee_id AS "employeeId",
          ewa.work_date AS "workDate",
          ws.shift_name AS "shiftName",
          ws.start_time AS "startTime",
          ws.end_time AS "endTime"
        FROM public.employee_work_assignments ewa
        JOIN public.work_shifts ws ON ewa.shift_id = ws.shift_id
        WHERE ewa.work_date = CURRENT_DATE
          AND ewa.status != 'CANCELLED'
          AND NOT EXISTS (
            SELECT 1 FROM public.attendance att 
            WHERE att.assignment_id = ewa.assignment_id
          )
      `;

      const checkInRes = await pool.query(checkInQuery);
      const pendingCheckIns = checkInRes.rows;

      for (const assign of pendingCheckIns) {
        try {
          const startTimeStr = assign.startTime; // e.g. "08:00:00"
          const [hours, minutes, seconds] = startTimeStr.split(':');
          
          const shiftStart = new Date(now);
          shiftStart.setHours(parseInt(hours, 10), parseInt(minutes, 10), parseInt(seconds, 10) || 0, 0);

          const diffMs = shiftStart.getTime() - now.getTime();
          const diffMinutes = diffMs / (1000 * 60);

          const employeeId = assign.employeeId;

          // Initial Check-in Reminder (15 mins before shift start)
          if (diffMinutes >= 0 && diffMinutes <= 16) {
            const hasBeenNotified = await pushNotificationService.hasBeenNotifiedToday(
              employeeId,
              'SHIFT_CHECKIN_REMINDER',
              todayStr
            );

            if (!hasBeenNotified) {
              const recorded = await pushNotificationService.recordNotificationHistory(
                employeeId,
                'SHIFT_CHECKIN_REMINDER',
                todayStr
              );

              if (recorded) {
                logger.info(`Sending check-in reminder to employeeId ${employeeId} for shift: ${assign.shiftName}`);
                await pushNotificationService.sendNotification(
                  employeeId,
                  '🔔 Nhắc nhở vào ca làm việc',
                  `Sắp đến giờ vào ca ${assign.shiftName} (15 phút nữa). Vui lòng chuẩn bị chấm công check-in!`,
                  'attendance-checkin-reminder'
                );
              }
            }
          }

          // Retry Check-in Reminder (5 mins after shift start if still not checked in)
          if (diffMinutes < -4 && diffMinutes >= -15) {
            const hasRetryNotified = await pushNotificationService.hasBeenNotifiedToday(
              employeeId,
              'SHIFT_CHECKIN_RETRY_REMINDER',
              todayStr
            );

            if (!hasRetryNotified) {
              const recorded = await pushNotificationService.recordNotificationHistory(
                employeeId,
                'SHIFT_CHECKIN_RETRY_REMINDER',
                todayStr
              );

              if (recorded) {
                logger.info(`Sending check-in retry reminder to employeeId ${employeeId}`);
                await pushNotificationService.sendNotification(
                  employeeId,
                  '⚠️ Nhắc lại: Bạn chưa Check-in',
                  `Đã quá giờ vào ca ${assign.shiftName} (${startTimeStr.substring(0, 5)}). Vui lòng mở ứng dụng để Check-in ngay!`,
                  'attendance-checkin-reminder'
                );
              }
            }
          }
        } catch (err) {
          logger.error(`Error processing check-in assignmentId ${assign.assignmentId}:`, err.message);
        }
      }

      // 2. Check-out Reminders Query: Checked-in attendance records without check-out time
      const checkOutQuery = `
        SELECT 
          att.attendance_id AS "attendanceId",
          att.employee_id AS "employeeId",
          att.work_date AS "workDate",
          ws.shift_name AS "shiftName",
          ws.end_time AS "endTime"
        FROM public.attendance att
        JOIN public.work_shifts ws ON att.shift_id = ws.shift_id
        WHERE att.work_date = CURRENT_DATE
          AND att.check_in_time IS NOT NULL
          AND att.check_out_time IS NULL
      `;

      const checkOutRes = await pool.query(checkOutQuery);
      const pendingCheckOuts = checkOutRes.rows;

      for (const att of pendingCheckOuts) {
        try {
          const endTimeStr = att.endTime; // e.g. "17:30:00"
          const [hours, minutes, seconds] = endTimeStr.split(':');

          const shiftEnd = new Date(now);
          shiftEnd.setHours(parseInt(hours, 10), parseInt(minutes, 10), parseInt(seconds, 10) || 0, 0);

          const diffMs = now.getTime() - shiftEnd.getTime();
          const diffMinutes = diffMs / (1000 * 60);

          const employeeId = att.employeeId;

          // Initial Check-out Reminder (After shift end / 17:30)
          if (diffMinutes >= 0 && diffMinutes <= 15) {
            const hasBeenNotified = await pushNotificationService.hasBeenNotifiedToday(
              employeeId,
              'SHIFT_CHECKOUT_REMINDER',
              todayStr
            );

            if (!hasBeenNotified) {
              const recorded = await pushNotificationService.recordNotificationHistory(
                employeeId,
                'SHIFT_CHECKOUT_REMINDER',
                todayStr
              );

              if (recorded) {
                logger.info(`Sending check-out reminder to employeeId ${employeeId}`);
                await pushNotificationService.sendNotification(
                  employeeId,
                  '🔔 Nhắc nhở hết ca làm việc',
                  `Đã đến giờ hết ca làm việc ${att.shiftName} (${endTimeStr.substring(0, 5)}). Vui lòng mở ứng dụng để Check-out!`,
                  'attendance-checkout-reminder'
                );
              }
            }
          }
        } catch (err) {
          logger.error(`Error processing check-out attendanceId ${att.attendanceId}:`, err.message);
        }
      }
    } catch (err) {
      logger.error('Failed to run shift reminder scheduler:', err.message);
    }
  }

  /**
   * Initializes periodic cron scheduler checks.
   */
  start(intervalMs = 60000) {
    logger.info(`⏰ Starting Shift Reminder Scheduler (Interval: ${intervalMs}ms)`);
    setInterval(() => this.run(), intervalMs);
  }
}

module.exports = new ShiftReminderScheduler();
