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
const attendanceCalculationService = require('../services/attendance-calculation-service');

describe('Overtime Request API Integration Tests', () => {
  let dbClient;
  let employeeToken, employeeId, employeeAccountId;
  let employee2Token, employee2Id, employee2AccountId;
  let managerToken, managerId, managerAccountId;
  let testDepartmentId;
  let testRoleIdEmployee, testRoleIdManager;
  let defaultShiftId, testLocationId;

  const empFingerprint = 'fingerprint_emp_ot';
  const emp2Fingerprint = 'fingerprint_emp2_ot';
  const mgrFingerprint = 'fingerprint_mgr_ot';

  beforeAll(async () => {
    dbClient = await pool.connect();

    // Retrieve roles
    const rolesRes = await dbClient.query('SELECT role_id, role_name FROM public.roles');
    testRoleIdEmployee = rolesRes.rows.find(r => r.role_name === 'EMPLOYEE').role_id;
    testRoleIdManager = rolesRes.rows.find(r => r.role_name === 'MANAGER').role_id;

    // Get or create department
    const deptRes = await dbClient.query(`
      INSERT INTO public.departments (department_name, description, status)
      VALUES ('Phòng Thử Nghiệm OT', 'Department for Overtime Testing', 1)
      ON CONFLICT (department_name) DO UPDATE SET department_name = EXCLUDED.department_name
      RETURNING department_id;
    `);
    testDepartmentId = deptRes.rows[0].department_id;

    const hashedPassword = await bcrypt.hash('password123', 12);

    // Create Employee 1
    const empRes = await dbClient.query(`
      INSERT INTO public.employees (employee_code, full_name, email, phone, department_id, status)
      VALUES ('NV_OT_01', 'Nhan Vien OT 01', 'nvot01@example.com', '0988111222', $1, 1)
      RETURNING employee_id;
    `, [testDepartmentId]);
    employeeId = empRes.rows[0].employee_id;

    const empAccRes = await dbClient.query(`
      INSERT INTO public.accounts (employee_id, username, password_hash, role_id, is_active)
      VALUES ($1, 'nvot01', $2, $3, 1)
      RETURNING account_id;
    `, [employeeId, hashedPassword, testRoleIdEmployee]);
    employeeAccountId = empAccRes.rows[0].account_id;

    // Create Employee 2 (equal role comparison test)
    const emp2Res = await dbClient.query(`
      INSERT INTO public.employees (employee_code, full_name, email, phone, department_id, status)
      VALUES ('NV_OT_02', 'Nhan Vien OT 02', 'nvot02@example.com', '0988111223', $1, 1)
      RETURNING employee_id;
    `, [testDepartmentId]);
    employee2Id = emp2Res.rows[0].employee_id;

    const emp2AccRes = await dbClient.query(`
      INSERT INTO public.accounts (employee_id, username, password_hash, role_id, is_active)
      VALUES ($1, 'nvot02', $2, $3, 1)
      RETURNING account_id;
    `, [employee2Id, hashedPassword, testRoleIdEmployee]);
    employee2AccountId = emp2AccRes.rows[0].account_id;

    // Create Manager
    const mgrRes = await dbClient.query(`
      INSERT INTO public.employees (employee_code, full_name, email, phone, department_id, status)
      VALUES ('NV_OT_MGR', 'Manager OT', 'mgrot@example.com', '0988111224', $1, 1)
      RETURNING employee_id;
    `, [testDepartmentId]);
    managerId = mgrRes.rows[0].employee_id;

    const mgrAccRes = await dbClient.query(`
      INSERT INTO public.accounts (employee_id, username, password_hash, role_id, is_active)
      VALUES ($1, 'mgrot', $2, $3, 1)
      RETURNING account_id;
    `, [managerId, hashedPassword, testRoleIdManager]);
    managerAccountId = mgrAccRes.rows[0].account_id;

    // Retrieve default shift (Hành chính - 08:00 to 17:00)
    const shiftRes = await dbClient.query("SELECT shift_id FROM public.work_shifts WHERE shift_code = 'HC'");
    defaultShiftId = shiftRes.rows[0].shift_id;

    // Create work location
    const locRes = await dbClient.query(`
      INSERT INTO public.work_locations (location_name, latitude, longitude, allowed_radius_meter, status)
      VALUES ('Van Phong OT Test', 10.762622, 106.660172, 100, 1)
      RETURNING location_id;
    `);
    testLocationId = locRes.rows[0].location_id;

    // Logins to obtain tokens
    const empLogin = await request(app)
      .post('/api/auth/login')
      .set('X-Device-Fingerprint', empFingerprint)
      .send({ username: 'nvot01', password: 'password123', deviceName: 'Emp Device' });
    employeeToken = empLogin.body.data.accessToken;

    const emp2Login = await request(app)
      .post('/api/auth/login')
      .set('X-Device-Fingerprint', emp2Fingerprint)
      .send({ username: 'nvot02', password: 'password123', deviceName: 'Emp 2 Device' });
    employee2Token = emp2Login.body.data.accessToken;

    const mgrLogin = await request(app)
      .post('/api/auth/login')
      .set('X-Device-Fingerprint', mgrFingerprint)
      .send({ username: 'mgrot', password: 'password123', deviceName: 'Mgr Device' });
    managerToken = mgrLogin.body.data.accessToken;
  });

  afterAll(async () => {
    if (dbClient) {
      await dbClient.query('DELETE FROM public.ot_requests WHERE employee_id IN ($1, $2, $3)', [employeeId, employee2Id, managerId]);
      await dbClient.query('DELETE FROM public.employee_work_assignments WHERE employee_id IN ($1, $2, $3)', [employeeId, employee2Id, managerId]);
      await dbClient.query('DELETE FROM public.leave_requests WHERE employee_id IN ($1, $2, $3)', [employeeId, employee2Id, managerId]);
      await dbClient.query('DELETE FROM public.system_logs WHERE employee_id IN ($1, $2, $3)', [employeeId, employee2Id, managerId]);
      await dbClient.query('DELETE FROM public.system_logs WHERE account_id IN (SELECT account_id FROM public.accounts WHERE employee_id IN ($1, $2, $3))', [employeeId, employee2Id, managerId]);
      await dbClient.query('DELETE FROM public.user_sessions WHERE employee_id IN ($1, $2, $3)', [employeeId, employee2Id, managerId]);
      await dbClient.query('DELETE FROM public.user_sessions WHERE account_id IN (SELECT account_id FROM public.accounts WHERE employee_id IN ($1, $2, $3))', [employeeId, employee2Id, managerId]);
      await dbClient.query('DELETE FROM public.registered_devices WHERE employee_id IN ($1, $2, $3)', [employeeId, employee2Id, managerId]);
      await dbClient.query('DELETE FROM public.accounts WHERE employee_id IN ($1, $2, $3)', [employeeId, employee2Id, managerId]);
      await dbClient.query('DELETE FROM public.employees WHERE employee_id IN ($1, $2, $3)', [employeeId, employee2Id, managerId]);
      await dbClient.query('DELETE FROM public.departments WHERE department_id = $1', [testDepartmentId]);
      await dbClient.query('DELETE FROM public.work_locations WHERE location_id = $1', [testLocationId]);
      dbClient.release();
    }
  });

  describe('Employee Submit Overtime Request', () => {
    const testDate = '2026-12-10';

    beforeEach(async () => {
      // Clear OT requests and assignments before each test
      await dbClient.query('DELETE FROM public.ot_requests WHERE employee_id = $1', [employeeId]);
      await dbClient.query('DELETE FROM public.employee_work_assignments WHERE employee_id = $1', [employeeId]);
      await dbClient.query('DELETE FROM public.leave_requests WHERE employee_id = $1', [employeeId]);
    });

    test('Should submit OT request successfully with valid inputs and active assignment', async () => {
      // 1. Create active assignment for NV01 on testDate
      await dbClient.query(`
        INSERT INTO public.employee_work_assignments (employee_id, work_date, location_id, shift_id, status)
        VALUES ($1, $2, $3, $4, 'ASSIGNED')
      `, [employeeId, testDate, testLocationId, defaultShiftId]);

      // 2. Submit OT Request
      const res = await request(app)
        .post('/api/ot/requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('X-Device-Fingerprint', empFingerprint)
        .send({
          workDate: testDate,
          startTime: '18:00:00',
          endTime: '20:30:00',
          reason: 'Làm thêm để hoàn thành kế hoạch năm'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PENDING');
      expect(parseFloat(res.body.data.durationHours)).toBe(2.5);
    });

    test('Should fail if no assignment exists for that day', async () => {
      const res = await request(app)
        .post('/api/ot/requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('X-Device-Fingerprint', empFingerprint)
        .send({
          workDate: testDate,
          startTime: '18:00:00',
          endTime: '20:00:00',
          reason: 'Làm thêm không phép'
        });

      expect(res.status).toBe(422);
      expect(res.body.message).toContain('Chỉ được đăng ký tăng ca nếu có lịch phân công làm việc trong ngày');
    });

    test('Should fail if start time is before shift end time (17:00:00)', async () => {
      // 1. Create active assignment
      await dbClient.query(`
        INSERT INTO public.employee_work_assignments (employee_id, work_date, location_id, shift_id, status)
        VALUES ($1, $2, $3, $4, 'ASSIGNED')
      `, [employeeId, testDate, testLocationId, defaultShiftId]);

      // 2. Submit OT starting at 16:30:00 (HC shift ends at 17:00)
      const res = await request(app)
        .post('/api/ot/requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('X-Device-Fingerprint', empFingerprint)
        .send({
          workDate: testDate,
          startTime: '16:30:00',
          endTime: '19:00:00',
          reason: 'Làm thêm trùng ca'
        });

      expect(res.status).toBe(422);
      expect(res.body.message).toContain('Giờ bắt đầu tăng ca phải lớn hơn hoặc bằng giờ kết thúc ca làm việc');
    });

    test('Should fail if an APPROVED leave request exists on that day', async () => {
      // 1. Create active assignment
      await dbClient.query(`
        INSERT INTO public.employee_work_assignments (employee_id, work_date, location_id, shift_id, status)
        VALUES ($1, $2, $3, $4, 'ASSIGNED')
      `, [employeeId, testDate, testLocationId, defaultShiftId]);

      // 2. Create APPROVED leave request
      await dbClient.query(`
        INSERT INTO public.leave_requests (employee_id, leave_type, start_date, end_date, reason, status)
        VALUES ($1, 'ANNUAL', $2, $2, 'Xin nghỉ việc gia đình', 'APPROVED')
      `, [employeeId, testDate]);

      // 3. Try to register OT
      const res = await request(app)
        .post('/api/ot/requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('X-Device-Fingerprint', empFingerprint)
        .send({
          workDate: testDate,
          startTime: '18:00:00',
          endTime: '20:00:00',
          reason: 'Làm thêm dù đã xin nghỉ phép'
        });

      expect(res.status).toBe(422);
      expect(res.body.message).toContain('Không được đăng ký tăng ca khi đang có đơn nghỉ phép đã được phê duyệt cùng ngày');
    });

    test('Should fail if OT duration exceeds maximum allowed hours (4.0 hours)', async () => {
      // 1. Create active assignment
      await dbClient.query(`
        INSERT INTO public.employee_work_assignments (employee_id, work_date, location_id, shift_id, status)
        VALUES ($1, $2, $3, $4, 'ASSIGNED')
      `, [employeeId, testDate, testLocationId, defaultShiftId]);

      // 2. Register 5 hours of OT
      const res = await request(app)
        .post('/api/ot/requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('X-Device-Fingerprint', empFingerprint)
        .send({
          workDate: testDate,
          startTime: '17:00:00',
          endTime: '22:30:00',
          reason: 'Làm thêm 5.5 tiếng vượt quota'
        });

      expect(res.status).toBe(422);
      expect(res.body.message).toContain('Thời gian đăng ký tăng ca vượt quá số giờ tối đa cho phép');
    });

    test('Should fail if registering OT for a past date', async () => {
      const pastDate = '2026-01-01'; // Past date

      // 1. Create active assignment
      await dbClient.query(`
        INSERT INTO public.employee_work_assignments (employee_id, work_date, location_id, shift_id, status)
        VALUES ($1, $2, $3, $4, 'ASSIGNED')
      `, [employeeId, pastDate, testLocationId, defaultShiftId]);

      // 2. Submit OT
      const res = await request(app)
        .post('/api/ot/requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('X-Device-Fingerprint', empFingerprint)
        .send({
          workDate: pastDate,
          startTime: '18:00:00',
          endTime: '20:00:00',
          reason: 'Tăng ca ngày hôm qua'
        });

      expect(res.status).toBe(422);
      expect(res.body.message).toContain('Không được đăng ký tăng ca cho ngày đã kết thúc');
    });

    test('Should fail if time overlaps with an existing pending/approved OT request', async () => {
      // 1. Create active assignment
      await dbClient.query(`
        INSERT INTO public.employee_work_assignments (employee_id, work_date, location_id, shift_id, status)
        VALUES ($1, $2, $3, $4, 'ASSIGNED')
      `, [employeeId, testDate, testLocationId, defaultShiftId]);

      // 2. Register first OT request (18:00 - 20:00)
      await request(app)
        .post('/api/ot/requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('X-Device-Fingerprint', empFingerprint)
        .send({
          workDate: testDate,
          startTime: '18:00:00',
          endTime: '20:00:00',
          reason: 'Đăng ký ca 1'
        });

      // 3. Register overlapping OT request (19:30 - 21:00)
      const res = await request(app)
        .post('/api/ot/requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('X-Device-Fingerprint', empFingerprint)
        .send({
          workDate: testDate,
          startTime: '19:30:00',
          endTime: '21:00:00',
          reason: 'Đăng ký ca 2 bị trùng'
        });

      expect(res.status).toBe(422);
      expect(res.body.message).toContain('Thời gian đăng ký tăng ca bị trùng với một đơn khác đang chờ duyệt hoặc đã được phê duyệt');
    });
  });

  describe('Manager Review OT Requests', () => {
    const testDate = '2026-12-11';
    let otRequestId;

    beforeEach(async () => {
      await dbClient.query('DELETE FROM public.ot_requests WHERE employee_id = $1', [employeeId]);
      await dbClient.query('DELETE FROM public.employee_work_assignments WHERE employee_id = $1', [employeeId]);

      // Create active assignment
      const assRes = await dbClient.query(`
        INSERT INTO public.employee_work_assignments (employee_id, work_date, location_id, shift_id, status)
        VALUES ($1, $2, $3, $4, 'ASSIGNED')
        RETURNING assignment_id;
      `, [employeeId, testDate, testLocationId, defaultShiftId]);

      // Create pending OT request
      const otRes = await dbClient.query(`
        INSERT INTO public.ot_requests (employee_id, assignment_id, work_date, start_time, end_time, duration_hours, reason, status)
        VALUES ($1, $2, $3, '18:00:00', '20:00:00', 2.0, 'Đăng ký test review', 'PENDING')
        RETURNING ot_request_id;
      `, [employeeId, assRes.rows[0].assignment_id, testDate]);
      otRequestId = otRes.rows[0].ot_request_id;
    });

    test('Manager should approve OT request, write audit logs, and trigger notification', async () => {
      const res = await request(app)
        .patch(`/api/admin/ot/requests/${otRequestId}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-Device-Fingerprint', mgrFingerprint)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('APPROVED');

      // Verify notification is created
      const notifRes = await dbClient.query('SELECT * FROM public.notifications WHERE recipient_id = $1 ORDER BY created_at DESC LIMIT 1', [employeeId]);
      expect(notifRes.rows.length).toBe(1);
      expect(notifRes.rows[0].notification_type).toBe('OT_REQUEST_APPROVED');

      // Verify audit log is written
      const logRes = await dbClient.query("SELECT * FROM public.system_logs WHERE action = 'OT_REQUEST_APPROVE' ORDER BY action_time DESC LIMIT 1");
      expect(logRes.rows.length).toBe(1);
    });

    test('Manager should reject OT request with reason', async () => {
      const res = await request(app)
        .patch(`/api/admin/ot/requests/${otRequestId}/reject`)
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-Device-Fingerprint', mgrFingerprint)
        .send({ rejectReason: 'Không cần tăng ca trong ngày này' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('REJECTED');

      // Verify notification
      const notifRes = await dbClient.query('SELECT * FROM public.notifications WHERE recipient_id = $1 ORDER BY created_at DESC LIMIT 1', [employeeId]);
      expect(notifRes.rows.length).toBe(1);
      expect(notifRes.rows[0].notification_type).toBe('OT_REQUEST_REJECTED');
      expect(notifRes.rows[0].message).toContain('Không cần tăng ca trong ngày này');
    });

    test('Employee cannot approve/reject OT requests', async () => {
      const res = await request(app)
        .patch(`/api/admin/ot/requests/${otRequestId}/approve`)
        .set('Authorization', `Bearer ${employee2Token}`)
        .set('X-Device-Fingerprint', emp2Fingerprint)
        .send();

      expect(res.status).toBe(403); // Min role MANAGER check
    });
  });

  describe('Employee Cancel OT Request', () => {
    const testDate = '2026-12-12';

    beforeEach(async () => {
      await dbClient.query('DELETE FROM public.ot_requests WHERE employee_id = $1', [employeeId]);
      await dbClient.query('DELETE FROM public.employee_work_assignments WHERE employee_id = $1', [employeeId]);
    });

    test('Should cancel PENDING OT request successfully', async () => {
      // 1. Create active assignment
      const assRes = await dbClient.query(`
        INSERT INTO public.employee_work_assignments (employee_id, work_date, location_id, shift_id, status)
        VALUES ($1, $2, $3, $4, 'ASSIGNED')
        RETURNING assignment_id;
      `, [employeeId, testDate, testLocationId, defaultShiftId]);

      // 2. Create pending OT request
      const otRes = await dbClient.query(`
        INSERT INTO public.ot_requests (employee_id, assignment_id, work_date, start_time, end_time, duration_hours, reason, status)
        VALUES ($1, $2, $3, '18:00:00', '20:00:00', 2.0, 'Đăng ký hủy đơn', 'PENDING')
        RETURNING ot_request_id;
      `, [employeeId, assRes.rows[0].assignment_id, testDate]);
      const otId = otRes.rows[0].ot_request_id;

      // 3. Cancel request
      const res = await request(app)
        .delete(`/api/ot/requests/${otId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('X-Device-Fingerprint', empFingerprint)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CANCELLED');
    });

    test('Should fail to cancel if status is already APPROVED', async () => {
      // 1. Create active assignment
      const assRes = await dbClient.query(`
        INSERT INTO public.employee_work_assignments (employee_id, work_date, location_id, shift_id, status)
        VALUES ($1, $2, $3, $4, 'ASSIGNED')
        RETURNING assignment_id;
      `, [employeeId, testDate, testLocationId, defaultShiftId]);

      // 2. Create APPROVED OT request
      const otRes = await dbClient.query(`
        INSERT INTO public.ot_requests (employee_id, assignment_id, work_date, start_time, end_time, duration_hours, reason, status)
        VALUES ($1, $2, $3, '18:00:00', '20:00:00', 2.0, 'Đơn đã duyệt', 'APPROVED')
        RETURNING ot_request_id;
      `, [employeeId, assRes.rows[0].assignment_id, testDate]);
      const otId = otRes.rows[0].ot_request_id;

      // 3. Try to cancel request
      const res = await request(app)
        .delete(`/api/ot/requests/${otId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('X-Device-Fingerprint', empFingerprint)
        .send();

      expect(res.status).toBe(422);
    });
  });

  describe('Attendance Integration - Overtime Calculation on Check-out', () => {
    const testDate = '2026-12-12';
    const shift = { startTime: '08:00:00', endTime: '17:00:00', earlyLeaveGraceMinutes: 15 };

    test('Should calculate 120 minutes of overtime when checkout is after approved OT range', () => {
      const checkInTime = new Date(`${testDate}T08:00:00+07:00`);
      const checkOutTime = new Date(`${testDate}T20:30:00+07:00`);
      const approvedOtRequests = [
        { start_time: '18:00:00', end_time: '20:00:00' }
      ];

      const result = attendanceCalculationService.calculateCheckOut(
        checkInTime,
        checkOutTime,
        testDate,
        shift,
        'ON_TIME',
        approvedOtRequests
      );

      expect(result.checkOutStatus).toBe('OVERTIME');
      expect(result.overtimeMinutes).toBe(120);
    });

    test('Should calculate 0 minutes of overtime when checkout is late but NO approved OT exists', () => {
      const checkInTime = new Date(`${testDate}T08:00:00+07:00`);
      const checkOutTime = new Date(`${testDate}T20:30:00+07:00`);
      const approvedOtRequests = [];

      const result = attendanceCalculationService.calculateCheckOut(
        checkInTime,
        checkOutTime,
        testDate,
        shift,
        'ON_TIME',
        approvedOtRequests
      );

      expect(result.checkOutStatus).toBe('NORMAL');
      expect(result.overtimeMinutes).toBe(0);
    });
  });
});
