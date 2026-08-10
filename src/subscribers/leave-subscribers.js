const { eventBus, LEAVE_EVENTS } = require('../events/leave-events');
const notificationService = require('../services/notification-service');
const { pool } = require('../config/db');

// Helper to format date
function formatDateString(dateStr) {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// Map leave type key to Vietnamese label
const LEAVE_TYPE_LABELS = {
  ANNUAL: 'Nghỉ phép năm',
  COMPENSATORY: 'Nghỉ bù',
  SICK: 'Nghỉ bệnh',
  UNPAID: 'Nghỉ không lương',
  MARRIAGE: 'Nghỉ cưới',
  MATERNITY: 'Nghỉ thai sản',
  OTHER: 'Nghỉ khác'
};

// 1. Listen for APPROVED request to create notification
eventBus.on(LEAVE_EVENTS.REQUEST_APPROVED, async (eventData) => {
  const { leaveRequest, managerName } = eventData;
  try {
    const formattedStart = formatDateString(leaveRequest.startDate);
    const formattedEnd = formatDateString(leaveRequest.endDate);
    const typeLabel = LEAVE_TYPE_LABELS[leaveRequest.leaveType] || 'Nghỉ phép';

    await notificationService.createNotification({
      recipientId: leaveRequest.employeeId,
      module: 'LEAVE',
      type: 'LEAVE_APPROVED',
      title: 'Đơn nghỉ phép đã được phê duyệt',
      message: `Loại nghỉ: ${typeLabel}\nKhoảng thời gian: Từ ngày ${formattedStart} đến ngày ${formattedEnd}\nNgười phê duyệt: ${managerName || 'Quản lý'}`
    });
    console.log(`[Notification Service] Created LEAVE_APPROVED notification for employee ${leaveRequest.employeeId}`);
  } catch (err) {
    console.error('Error creating LEAVE_APPROVED notification:', err);
  }
});

// 2. Listen for REJECTED request to create notification
eventBus.on(LEAVE_EVENTS.REQUEST_REJECTED, async (eventData) => {
  const { leaveRequest, managerName, rejectReason } = eventData;
  try {
    const formattedStart = formatDateString(leaveRequest.startDate);
    const formattedEnd = formatDateString(leaveRequest.endDate);

    await notificationService.createNotification({
      recipientId: leaveRequest.employeeId,
      module: 'LEAVE',
      type: 'LEAVE_REJECTED',
      title: 'Đơn nghỉ phép đã bị từ chối',
      message: `Khoảng thời gian: Từ ngày ${formattedStart} đến ngày ${formattedEnd}\nNgười từ chối: ${managerName || 'Quản lý'}\nLý do từ chối: ${rejectReason || 'Không có lý do cụ thể'}`
    });
    console.log(`[Notification Service] Created LEAVE_REJECTED notification for employee ${leaveRequest.employeeId}`);
  } catch (err) {
    console.error('Error creating LEAVE_REJECTED notification:', err);
  }
});

console.log('Leave request subscribers registered successfully.');
