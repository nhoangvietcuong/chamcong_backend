const { eventBus, OT_EVENTS } = require('../events/leave-events');
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

async function getDepartmentManagers(employeeId) {
  const query = `
    SELECT e.employee_id
    FROM public.employees e
    JOIN public.accounts a ON e.employee_id = a.employee_id
    JOIN public.roles r ON a.role_id = r.role_id
    WHERE e.department_id = (
      SELECT department_id FROM public.employees WHERE employee_id = $1
    ) AND r.role_name IN ('MANAGER', 'ADMIN') AND a.is_active = 1;
  `;
  const res = await pool.query(query, [employeeId]);
  return res.rows.map(row => row.employee_id);
}

async function getNotificationRecipients(employeeId) {
  const managers = await getDepartmentManagers(employeeId);
  if (managers.length > 0) return managers;

  const adminQuery = `
    SELECT e.employee_id
    FROM public.employees e
    JOIN public.accounts a ON e.employee_id = a.employee_id
    JOIN public.roles r ON a.role_id = r.role_id
    WHERE r.role_name = 'ADMIN' AND a.is_active = 1;
  `;
  const res = await pool.query(adminQuery);
  return res.rows.map(row => row.employee_id);
}

// 1. Listen for REQUEST_CREATED
eventBus.on(OT_EVENTS.REQUEST_CREATED, async (eventData) => {
  const { otRequest, employeeName } = eventData;
  try {
    const recipients = await getNotificationRecipients(otRequest.employeeId);
    const formattedDate = formatDateString(otRequest.workDate);

    for (const recipientId of recipients) {
      await notificationService.createNotification({
        recipientId,
        module: 'OVERTIME',
        type: 'OT_REQUEST_SUBMITTED',
        title: 'Đăng ký tăng ca mới cần duyệt',
        message: `Nhân viên ${employeeName} đã đăng ký tăng ca ngày ${formattedDate} từ ${otRequest.startTime} đến ${otRequest.endTime}.\nLý do: ${otRequest.reason}`
      });
    }
    console.log(`[Notification Service] Created OT_REQUEST_SUBMITTED notifications for request ${otRequest.otRequestId}`);
  } catch (err) {
    console.error('Error creating OT_REQUEST_SUBMITTED notifications:', err);
  }
});

// 2. Listen for REQUEST_APPROVED
eventBus.on(OT_EVENTS.REQUEST_APPROVED, async (eventData) => {
  const { otRequest, approvedByName } = eventData;
  try {
    const formattedDate = formatDateString(otRequest.workDate);

    await notificationService.createNotification({
      recipientId: otRequest.employeeId,
      module: 'OVERTIME',
      type: 'OT_REQUEST_APPROVED',
      title: 'Yêu cầu tăng ca đã được duyệt',
      message: `Yêu cầu tăng ca ngày ${formattedDate} (${otRequest.startTime} - ${otRequest.endTime}) đã được duyệt bởi ${approvedByName}.`
    });
    console.log(`[Notification Service] Created OT_REQUEST_APPROVED notification for employee ${otRequest.employeeId}`);
  } catch (err) {
    console.error('Error creating OT_REQUEST_APPROVED notification:', err);
  }
});

// 3. Listen for REQUEST_REJECTED
eventBus.on(OT_EVENTS.REQUEST_REJECTED, async (eventData) => {
  const { otRequest, rejectedByName, rejectReason } = eventData;
  try {
    const formattedDate = formatDateString(otRequest.workDate);

    await notificationService.createNotification({
      recipientId: otRequest.employeeId,
      module: 'OVERTIME',
      type: 'OT_REQUEST_REJECTED',
      title: 'Yêu cầu tăng ca đã bị từ chối',
      message: `Yêu cầu tăng ca ngày ${formattedDate} (${otRequest.startTime} - ${otRequest.endTime}) đã bị từ chối bởi ${rejectedByName}.\nLý do từ chối: ${rejectReason}`
    });
    console.log(`[Notification Service] Created OT_REQUEST_REJECTED notification for employee ${otRequest.employeeId}`);
  } catch (err) {
    console.error('Error creating OT_REQUEST_REJECTED notification:', err);
  }
});

console.log('Overtime request subscribers registered successfully.');
