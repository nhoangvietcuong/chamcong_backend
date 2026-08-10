// Mock MediaPipe Service before importing app
jest.mock('../modules/face-recognition/services/mediapipe.service.js', () => {
  return {
    detectFaceMesh: jest.fn().mockImplementation(async () => ({ detected: true, faceCount: 1, mesh: { landmarks: [] } })),
    estimateHeadPose: jest.fn().mockImplementation(() => ({ passed: true, yaw: 0, pitch: 0, roll: 0 })),
    detectEyeBlink: jest.fn().mockImplementation(() => ({ passed: true })),
    detectFaceOrientation: jest.fn().mockImplementation(() => ({ passed: true, label: 'UPRIGHT' })),
    detectOcclusion: jest.fn().mockImplementation(() => ({ passed: true, hasMask: false, hasGlasses: false })),
    detectSpoof: jest.fn().mockImplementation(() => ({ passed: true, type: 'REAL', confidence: 1.0 })),
    evaluateLiveness: jest.fn().mockImplementation(() => ({ passed: true, reason: null })),
    recognizeFace: jest.fn().mockImplementation(async () => ({ success: true, match: true, distance: 0.1 })),
  };
});

jest.mock('../modules/face-recognition/services/identity-verification.service.js', () => {
  return {
    verifyIdentity: jest.fn().mockImplementation(async () => ({ success: true, match: true, similarity: 0.92 })),
  };
});

jest.mock('../modules/device-biometric/services/device-biometric.service.js', () => {
  return {
    verifyDevice: jest.fn().mockImplementation(async () => true),
  };
});

const request = require('supertest');
const app = require('../app');
const { pool } = require('../config/db');
const bcrypt = require('bcrypt');

describe('Leave Management & Notifications API Integration Tests', () => {
  let dbClient;
  let employeeToken, employeeId, employeeAccountId;
  let managerToken, managerId, managerAccountId;
  let testDepartmentId;
  let testRoleIdEmployee, testRoleIdManager;

  const empFingerprint = 'fingerprint_emp_leave';
  const mgrFingerprint = 'fingerprint_mgr_leave';

  beforeAll(async () => {
    dbClient = await pool.connect();
    
    // Retrieve roles
    const rolesRes = await dbClient.query('SELECT role_id, role_name FROM public.roles');
    testRoleIdEmployee = rolesRes.rows.find(r => r.role_name === 'EMPLOYEE').role_id;
    testRoleIdManager = rolesRes.rows.find(r => r.role_name === 'MANAGER').role_id;

    // Get or create department
    const deptRes = await dbClient.query(`
      INSERT INTO public.departments (department_name, description, status)
      VALUES ('Phòng Kiểm Thử', 'Department for Integration Testing', 1)
      ON CONFLICT (department_name) DO UPDATE SET department_name = EXCLUDED.department_name
      RETURNING department_id;
    `);
    testDepartmentId = deptRes.rows[0].department_id;

    const hashedPassword = await bcrypt.hash('password123', 12);

    // Create Employee
    const empRes = await dbClient.query(`
      INSERT INTO public.employees (employee_code, full_name, email, phone, department_id, status)
      VALUES ('NV_LEAVE_01', 'Nhan Vien Leave 01', 'nvleave01@example.com', '0999888771', $1, 1)
      RETURNING employee_id;
    `, [testDepartmentId]);
    employeeId = empRes.rows[0].employee_id;

    const empAccRes = await dbClient.query(`
      INSERT INTO public.accounts (employee_id, username, password_hash, role_id, is_active)
      VALUES ($1, 'nvleave01', $2, $3, 1)
      RETURNING account_id;
    `, [employeeId, hashedPassword, testRoleIdEmployee]);
    employeeAccountId = empAccRes.rows[0].account_id;

    // Create Manager
    const mgrRes = await dbClient.query(`
      INSERT INTO public.employees (employee_code, full_name, email, phone, department_id, status)
      VALUES ('NV_LEAVE_MGR', 'Nguyen Van Manager Leave', 'mgrleave@example.com', '0999888772', $1, 1)
      RETURNING employee_id;
    `, [testDepartmentId]);
    managerId = mgrRes.rows[0].employee_id;

    const mgrAccRes = await dbClient.query(`
      INSERT INTO public.accounts (employee_id, username, password_hash, role_id, is_active)
      VALUES ($1, 'mgrleave', $2, $3, 1)
      RETURNING account_id;
    `, [managerId, hashedPassword, testRoleIdManager]);
    managerAccountId = mgrAccRes.rows[0].account_id;

    // Seed Leave Balance for employee for year 2026 (Annual: 12 days total, 0 used)
    await dbClient.query(`
      INSERT INTO public.leave_balances (employee_id, year, annual_days_total, annual_days_used)
      VALUES ($1, 2026, 12.0, 0.0)
      ON CONFLICT (employee_id, year) DO UPDATE SET annual_days_total = 12.0, annual_days_used = 0.0;
    `, [employeeId]);

    // Logins to obtain tokens
    const empLogin = await request(app)
      .post('/api/auth/login')
      .set('x-device-fingerprint', empFingerprint)
      .send({ username: 'nvleave01', password: 'password123' });
    console.log('EMPLOYEE LOGIN STATUS:', empLogin.status, 'BODY:', JSON.stringify(empLogin.body));
    employeeToken = empLogin.body.data.accessToken;

    const mgrLogin = await request(app)
      .post('/api/auth/login')
      .set('x-device-fingerprint', mgrFingerprint)
      .send({ username: 'mgrleave', password: 'password123' });
    console.log('MANAGER LOGIN STATUS:', mgrLogin.status, 'BODY:', JSON.stringify(mgrLogin.body));
    managerToken = mgrLogin.body.data.accessToken;
  });

  afterAll(async () => {
    // Cleanup database records created during test
    await dbClient.query('DELETE FROM public.employee_work_assignments WHERE employee_id IN ($1, $2)', [employeeId, managerId]);
    await dbClient.query('DELETE FROM public.system_logs WHERE employee_id IN ($1, $2)', [employeeId, managerId]);
    await dbClient.query('DELETE FROM public.user_sessions WHERE employee_id IN ($1, $2)', [employeeId, managerId]);
    await dbClient.query('DELETE FROM public.registered_devices WHERE employee_id IN ($1, $2)', [employeeId, managerId]);
    await dbClient.query('DELETE FROM public.notifications WHERE recipient_id IN ($1, $2)', [employeeId, managerId]);
    await dbClient.query('DELETE FROM public.leave_requests WHERE employee_id IN ($1, $2)', [employeeId, managerId]);
    await dbClient.query('DELETE FROM public.leave_balances WHERE employee_id IN ($1, $2)', [employeeId, managerId]);
    await dbClient.query('DELETE FROM public.accounts WHERE employee_id IN ($1, $2)', [employeeId, managerId]);
    await dbClient.query('DELETE FROM public.employees WHERE employee_id IN ($1, $2)', [employeeId, managerId]);
    await dbClient.query('DELETE FROM public.departments WHERE department_id = $1', [testDepartmentId]);
    dbClient.release();
  });

  describe('Employee Submit Leave Request', () => {
    test('Should submit leave request successfully with valid inputs', async () => {
      const res = await request(app)
        .post('/api/leave/requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-device-fingerprint', empFingerprint)
        .send({
          leaveType: 'ANNUAL',
          startDate: '2026-07-20',
          endDate: '2026-07-21',
          reason: 'Giải quyết công việc gia đình'
        });

      console.log('SUBMIT LEAVE RES STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.leaveRequestId).toBeDefined();
      expect(res.body.data.status).toBe('PENDING');
    });

    test('Should fail if startDate > endDate', async () => {
      const res = await request(app)
        .post('/api/leave/requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-device-fingerprint', empFingerprint)
        .send({
          leaveType: 'ANNUAL',
          startDate: '2026-07-22',
          endDate: '2026-07-21',
          reason: 'Lỗi thời gian'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('Should fail due to overlap with existing PENDING/APPROVED request', async () => {
      // Trying to request 2026-07-21 which overlaps with the request in first test
      const res = await request(app)
        .post('/api/leave/requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-device-fingerprint', empFingerprint)
        .send({
          leaveType: 'ANNUAL',
          startDate: '2026-07-21',
          endDate: '2026-07-22',
          reason: 'Giải quyết công việc gia đình'
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('bị trùng');
    });

    test('Should fail if leave balance is exceeded', async () => {
      // Try to request 15 days of annual leave (balance is 12)
      const res = await request(app)
        .post('/api/leave/requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-device-fingerprint', empFingerprint)
        .send({
          leaveType: 'ANNUAL',
          startDate: '2026-08-01',
          endDate: '2026-08-15',
          reason: 'Nghỉ phép dài ngày'
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Số dư phép năm không đủ');
    });
  });

  describe('Manager Review (Approve/Reject) Leave Requests', () => {
    let pendingRequestId;

    beforeEach(async () => {
      // Create a fresh pending leave request
      const insRes = await dbClient.query(`
        INSERT INTO public.leave_requests (employee_id, leave_type, start_date, end_date, reason, status)
        VALUES ($1, 'ANNUAL', '2026-09-01', '2026-09-02', 'Xin nghỉ cá nhân', 'PENDING')
        RETURNING leave_request_id;
      `, [employeeId]);
      pendingRequestId = insRes.rows[0].leave_request_id;
    });

    test('Manager should approve leave request: update status, deduct balance, write logs and trigger notification', async () => {
      const res = await request(app)
        .patch(`/api/admin/leave/requests/${pendingRequestId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .set('x-device-fingerprint', mgrFingerprint)
        .send({ status: 'APPROVED' });

      console.log('APPROVE LEAVE RES STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify leave request status is APPROVED
      const requestRes = await dbClient.query('SELECT status FROM public.leave_requests WHERE leave_request_id = $1', [pendingRequestId]);
      expect(requestRes.rows[0].status).toBe('APPROVED');

      // Verify leave balance was deducted (by 2 days: Sep 01 & Sep 02)
      const balanceRes = await dbClient.query('SELECT annual_days_used FROM public.leave_balances WHERE employee_id = $1 AND year = 2026', [employeeId]);
      expect(parseFloat(balanceRes.rows[0].annual_days_used)).toBe(2.0);

      // Verify notification was created for employee
      const notifRes = await dbClient.query('SELECT * FROM public.notifications WHERE recipient_id = $1 ORDER BY created_at DESC LIMIT 1', [employeeId]);
      expect(notifRes.rows[0].notification_type).toBe('LEAVE_APPROVED');
      expect(notifRes.rows[0].title).toBe('Đơn nghỉ phép đã được phê duyệt');
      expect(notifRes.rows[0].message).toContain('Nguyen Van Manager Leave');
    });

    test('Manager should reject leave request: update status, write logs and trigger notification', async () => {
      const res = await request(app)
        .patch(`/api/admin/leave/requests/${pendingRequestId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .set('x-device-fingerprint', mgrFingerprint)
        .send({ status: 'REJECTED', rejectReason: 'Không đủ người làm việc' });

      console.log('REJECT LEAVE RES STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const requestRes = await dbClient.query('SELECT status, reject_reason FROM public.leave_requests WHERE leave_request_id = $1', [pendingRequestId]);
      expect(requestRes.rows[0].status).toBe('REJECTED');
      expect(requestRes.rows[0].reject_reason).toBe('Không đủ người làm việc');

      // Verify notification was created for employee
      const notifRes = await dbClient.query('SELECT * FROM public.notifications WHERE recipient_id = $1 ORDER BY created_at DESC LIMIT 1', [employeeId]);
      expect(notifRes.rows[0].notification_type).toBe('LEAVE_REJECTED');
      expect(notifRes.rows[0].message).toContain('Không đủ người làm việc');
    });

    test('Rejecting without reason should fail', async () => {
      const res = await request(app)
        .patch(`/api/admin/leave/requests/${pendingRequestId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .set('x-device-fingerprint', mgrFingerprint)
        .send({ status: 'REJECTED', rejectReason: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('Employee cannot approve/reject leave requests', async () => {
      const res = await request(app)
        .patch(`/api/admin/leave/requests/${pendingRequestId}/status`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-device-fingerprint', empFingerprint)
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(403);
    });
  });

  describe('Leave Request Cancellation / Revocation', () => {
    test('Employee can cancel pending request', async () => {
      const insRes = await dbClient.query(`
        INSERT INTO public.leave_requests (employee_id, leave_type, start_date, end_date, reason, status)
        VALUES ($1, 'ANNUAL', '2026-10-01', '2026-10-02', 'Hủy phép pending', 'PENDING')
        RETURNING leave_request_id;
      `, [employeeId]);
      const reqId = insRes.rows[0].leave_request_id;

      const res = await request(app)
        .delete(`/api/leave/requests/${reqId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-device-fingerprint', empFingerprint);

      console.log('CANCEL PENDING RES STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const requestRes = await dbClient.query('SELECT status FROM public.leave_requests WHERE leave_request_id = $1', [reqId]);
      expect(requestRes.rows[0].status).toBe('CANCELLED');
    });

    test('Employee can cancel approved request for future date and get balance refunded', async () => {
      // Start year: 2026
      // Set balance: used = 2.0
      await dbClient.query('UPDATE public.leave_balances SET annual_days_used = 2.0 WHERE employee_id = $1 AND year = 2026', [employeeId]);

      const insRes = await dbClient.query(`
        INSERT INTO public.leave_requests (employee_id, leave_type, start_date, end_date, reason, status)
        VALUES ($1, 'ANNUAL', '2026-11-20', '2026-11-21', 'Hủy phép approved tương lai', 'APPROVED')
        RETURNING leave_request_id;
      `, [employeeId]);
      const reqId = insRes.rows[0].leave_request_id;

      const res = await request(app)
        .delete(`/api/leave/requests/${reqId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-device-fingerprint', empFingerprint);

      console.log('CANCEL APPROVED FUTURE RES STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Status should be CANCELLED
      const requestRes = await dbClient.query('SELECT status FROM public.leave_requests WHERE leave_request_id = $1', [reqId]);
      expect(requestRes.rows[0].status).toBe('CANCELLED');

      // Balance should be refunded by 2 days (back to 0.0)
      const balanceRes = await dbClient.query('SELECT annual_days_used FROM public.leave_balances WHERE employee_id = $1 AND year = 2026', [employeeId]);
      expect(parseFloat(balanceRes.rows[0].annual_days_used)).toBe(0.0);
    });

    test('Employee cannot cancel approved request for past date', async () => {
      const insRes = await dbClient.query(`
        INSERT INTO public.leave_requests (employee_id, leave_type, start_date, end_date, reason, status)
        VALUES ($1, 'ANNUAL', '2026-01-01', '2026-01-02', 'Hủy phép quá khứ', 'APPROVED')
        RETURNING leave_request_id;
      `, [employeeId]);
      const reqId = insRes.rows[0].leave_request_id;

      const res = await request(app)
        .delete(`/api/leave/requests/${reqId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-device-fingerprint', empFingerprint);

      console.log('CANCEL APPROVED PAST RES STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('đã bắt đầu hoặc đã qua');
    });
  });

  describe('Attendance Dynamic Mapping Verification', () => {
    test('Dynamic report mapping should return ON_LEAVE for days without attendance logs during approved leave range', async () => {
      // 1. Create approved leave request for 2026-12-15 to 2026-12-15
      await dbClient.query(`
        INSERT INTO public.leave_requests (employee_id, leave_type, start_date, end_date, reason, status)
        VALUES ($1, 'ANNUAL', '2026-12-15', '2026-12-15', 'Nghỉ phép test report', 'APPROVED')
      `, [employeeId]);

      // 2. Create a shift and work assignment for this date
      const shiftRes = await dbClient.query(`
        INSERT INTO public.work_shifts (shift_code, shift_name, start_time, end_time, late_grace_minutes, early_leave_grace_minutes, minimum_work_minutes, is_active)
        VALUES ('SHIFT_LEAVE', 'Ca Test Leave', '08:00:00', '17:00:00', 5, 5, 480, 1)
        ON CONFLICT (shift_code) DO UPDATE SET is_active = 1
        RETURNING shift_id;
      `);
      const testShiftId = shiftRes.rows[0].shift_id;

      const locRes = await dbClient.query(`
        INSERT INTO public.work_locations (location_name, address, latitude, longitude, allowed_radius_meter, status)
        VALUES ('LOC_LEAVE', 'VP Test Leave', 10.762622, 106.660172, 100, 1)
        RETURNING location_id;
      `);
      const testLocationId = locRes.rows[0].location_id;

      await dbClient.query(`
        INSERT INTO public.employee_work_assignments (employee_id, work_date, location_id, shift_id, status)
        VALUES ($1, '2026-12-15', $2, $3, 'ASSIGNED')
      `, [employeeId, testLocationId, testShiftId]);

      // 3. Query payroll report for 2026-12-15
      const res = await request(app)
        .get('/api/admin/reports/payroll?fromDate=2026-12-15&toDate=2026-12-15')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('x-device-fingerprint', mgrFingerprint);

      console.log('PAYROLL REPORT RES STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
      expect(res.status).toBe(200);
      const employeeReport = res.body.data.items.find(emp => emp.employeeId === employeeId);
      expect(employeeReport).toBeDefined();
      expect(employeeReport.summary.leave).toBe(1);
      expect(employeeReport.days['2026-12-15'].status).toBe('ON_LEAVE');

      // Cleanup shift/location/assignment
      await dbClient.query('DELETE FROM public.employee_work_assignments WHERE employee_id = $1', [employeeId]);
      await dbClient.query('DELETE FROM public.work_shifts WHERE shift_id = $1', [testShiftId]);
      await dbClient.query('DELETE FROM public.work_locations WHERE location_id = $1', [testLocationId]);
    });
  });

  describe('Global Notification Module REST APIs', () => {
    beforeEach(async () => {
      // Clean and seed 2 mock notifications for employee
      await dbClient.query('DELETE FROM public.notifications WHERE recipient_id = $1', [employeeId]);
      await dbClient.query(`
        INSERT INTO public.notifications (recipient_id, module, notification_type, title, message, is_read)
        VALUES 
          ($1, 'LEAVE', 'LEAVE_APPROVED', 'Đơn duyệt 1', 'Nội dung 1', 0),
          ($1, 'LEAVE', 'LEAVE_APPROVED', 'Đơn duyệt 2', 'Nội dung 2', 0)
      `, [employeeId]);
    });

    test('Employee can list their notifications and get correct unreadCount', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-device-fingerprint', empFingerprint);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(2);
      expect(res.body.data.unreadCount).toBe(2);
    });

    test('Employee can mark a specific notification as read', async () => {
      const listRes = await dbClient.query('SELECT notification_id FROM public.notifications WHERE recipient_id = $1 LIMIT 1', [employeeId]);
      const notifId = listRes.rows[0].notification_id;

      const res = await request(app)
        .patch(`/api/notifications/${notifId}/read`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-device-fingerprint', empFingerprint);

      expect(res.status).toBe(200);
      expect(res.body.data.isRead).toBe(1);

      // Verify in DB
      const dbRes = await dbClient.query('SELECT is_read FROM public.notifications WHERE notification_id = $1', [notifId]);
      expect(dbRes.rows[0].is_read).toBe(1);
    });

    test('Employee can mark all notifications as read', async () => {
      const res = await request(app)
        .post('/api/notifications/read-all')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-device-fingerprint', empFingerprint);

      expect(res.status).toBe(200);
      expect(res.body.data.unreadCount).toBe(0);

      // Verify in DB
      const dbRes = await dbClient.query('SELECT COUNT(*)::int AS count FROM public.notifications WHERE recipient_id = $1 AND is_read = 0', [employeeId]);
      expect(dbRes.rows[0].count).toBe(0);
    });
  });
});
