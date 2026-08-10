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

// Mock Identity Verification Service
jest.mock('../modules/face-recognition/services/identity-verification.service.js', () => {
  return {
    verifyIdentity: jest.fn().mockImplementation(async () => ({ success: true, match: true, similarity: 0.92 })),
  };
});

// Mock WebAuthn Device Biometric verification
jest.mock('../modules/device-biometric/services/device-biometric.service.js', () => {
  return {
    verifyDevice: jest.fn().mockImplementation(async () => true),
  };
});

const request = require('supertest');
const app = require('../app');
const { pool } = require('../config/db');
const { cleanAllTables } = require('./setup');
const bcrypt = require('bcrypt');

describe('Attendance Analytics API Integration Tests', () => {
  let dbClient;
  let employeeToken;
  let adminToken;
  let empFingerprint = 'fingerprint_emp_analytics';
  let adminFingerprint = 'fingerprint_admin_analytics';
  let testRoleIdAdmin, testRoleIdEmployee;
  let testDepartmentId;
  let testEmployeeId;
  let secondEmployeeId;
  let testLocationId;
  let testShiftId;
  let hashedPassword;

  beforeAll(async () => {
    dbClient = await pool.connect();
    const rolesRes = await dbClient.query('SELECT role_id, role_name FROM public.roles');
    testRoleIdAdmin = rolesRes.rows.find(r => r.role_name === 'ADMIN').role_id;
    testRoleIdEmployee = rolesRes.rows.find(r => r.role_name === 'EMPLOYEE').role_id;
    hashedPassword = await bcrypt.hash('password123', 12);
  });

  afterAll(async () => {
    dbClient.release();
  });

  beforeEach(async () => {
    await cleanAllTables(dbClient);

    // 1. Create department
    const deptRes = await dbClient.query(`
      INSERT INTO public.departments (department_name, description, status)
      VALUES ('Engineering', 'R&D Dept', 1)
      RETURNING department_id
    `);
    testDepartmentId = deptRes.rows[0].department_id;

    // 2. Create shift
    const shiftRes = await dbClient.query(`
      INSERT INTO public.work_shifts (shift_code, shift_name, start_time, end_time, late_grace_minutes, early_leave_grace_minutes, minimum_work_minutes, is_active)
      VALUES ('HC', 'Hành chính', '08:00:00', '17:00:00', 5, 5, 480, 1)
      ON CONFLICT (shift_code) DO UPDATE SET is_active = 1
      RETURNING shift_id
    `);
    testShiftId = shiftRes.rows[0].shift_id;

    // 3. Create employee & account
    const empRes = await dbClient.query(`
      INSERT INTO public.employees (employee_code, full_name, email, phone, department_id, status)
      VALUES ('EMP601', 'Jane Analyst', 'jane.analyst@example.com', '0123456761', $1, 1)
      RETURNING employee_id
    `, [testDepartmentId]);
    testEmployeeId = empRes.rows[0].employee_id;

    await dbClient.query(`
      INSERT INTO public.accounts (employee_id, username, password_hash, role_id, is_active)
      VALUES ($1, 'janeanalyst', $2, $3, 1)
    `, [testEmployeeId, hashedPassword, testRoleIdEmployee]);

    // Log in employee
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'janeanalyst', password: 'password123' })
      .set('x-device-fingerprint', empFingerprint);
    console.log('LOGIN RES STATUS:', loginRes.status, 'BODY:', loginRes.body);
    employeeToken = loginRes.body.data?.accessToken;

    // 4. Create second employee
    const emp2Res = await dbClient.query(`
      INSERT INTO public.employees (employee_code, full_name, email, phone, department_id, status)
      VALUES ('EMP602', 'John Worker', 'john.worker@example.com', '0123456762', $1, 1)
      RETURNING employee_id
    `, [testDepartmentId]);
    secondEmployeeId = emp2Res.rows[0].employee_id;

    // 5. Create admin
    const adminEmp = await dbClient.query(`
      INSERT INTO public.employees (employee_code, full_name, email, phone, department_id, status)
      VALUES ('ADM601', 'Admin Analytics', 'admin.ana@example.com', '0123456769', $1, 1)
      RETURNING employee_id
    `, [testDepartmentId]);
    await dbClient.query(`
      INSERT INTO public.accounts (employee_id, username, password_hash, role_id, is_active)
      VALUES ($1, 'adminanalytics', $2, $3, 1)
    `, [adminEmp.rows[0].employee_id, hashedPassword, testRoleIdAdmin]);

    const adminLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'adminanalytics', password: 'password123' })
      .set('x-device-fingerprint', adminFingerprint);
    adminToken = adminLoginRes.body.data.accessToken;

    // 6. Create work location
    const locRes = await dbClient.query(`
      INSERT INTO public.work_locations (location_name, address, latitude, longitude, allowed_radius_meter, status)
      VALUES ('HCM Office', 'District 1, HCMC', 10.762622, 106.660172, 100, 1)
      RETURNING location_id
    `);
    testLocationId = locRes.rows[0].location_id;
  });

  test('GET /api/v1/attendance/analytics - Success with default current month dates', async () => {
    // Seed 1 work assignment today
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const assignRes = await dbClient.query(`
      INSERT INTO public.employee_work_assignments (employee_id, work_date, location_id, shift_id, status)
      VALUES ($1, $2, $3, $4, 'ASSIGNED')
      RETURNING assignment_id
    `, [testEmployeeId, todayStr, testLocationId, testShiftId]);
    const assignmentId = assignRes.rows[0].assignment_id;

    // Seed 1 check-in + check-out today (8:00 to 17:00 local time)
    const inDate = new Date(today);
    inDate.setHours(8, 0, 0, 0);
    const outDate = new Date(today);
    outDate.setHours(17, 0, 0, 0);
    
    await dbClient.query(`
      INSERT INTO public.attendance (
        employee_id, assignment_id, work_date, check_in_time, check_out_time, 
        attendance_status, check_in_status, check_out_status, late_minutes, early_leave_minutes, shift_id
      ) VALUES ($1, $2, $3, $4, $5, 'COMPLETED', 'ON_TIME', 'ON_TIME', 0, 0, $6)
    `, [testEmployeeId, assignmentId, todayStr, inDate.toISOString(), outDate.toISOString(), testShiftId]);

    const res = await request(app)
      .get('/api/v1/attendance/analytics')
      .set('x-device-fingerprint', empFingerprint)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('summary');
    expect(res.body.data).toHaveProperty('dailyData');

    const summary = res.body.data.summary;
    expect(summary.totalAssigned).toBe(1);
    expect(summary.totalCompleted).toBe(1);
    expect(summary.totalWorkingHours).toBeCloseTo(9, 1); // 8:00 to 17:00 is 9 hours
    expect(summary.attendanceRate).toBe(100);

    const todayData = res.body.data.dailyData.find(d => d.date === todayStr);
    expect(todayData).toBeDefined();
    expect(todayData.status).toBe('PRESENT');
    expect(todayData.checkInTime).toBe('08:00');
    expect(todayData.checkOutTime).toBe('17:00');
  });

  test('GET /api/v1/attendance/analytics - Filtered range with absent & pending', async () => {
    const today = new Date();
    
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Create yesterday assignment (no attendance -> absent)
    await dbClient.query(`
      INSERT INTO public.employee_work_assignments (employee_id, work_date, location_id, shift_id, status)
      VALUES ($1, $2, $3, $4, 'ASSIGNED')
    `, [testEmployeeId, yesterdayStr, testLocationId, testShiftId]);

    // Create tomorrow assignment (no attendance yet -> pending)
    await dbClient.query(`
      INSERT INTO public.employee_work_assignments (employee_id, work_date, location_id, shift_id, status)
      VALUES ($1, $2, $3, $4, 'ASSIGNED')
    `, [testEmployeeId, tomorrowStr, testLocationId, testShiftId]);

    const res = await request(app)
      .get('/api/v1/attendance/analytics')
      .query({ startDate: yesterdayStr, endDate: tomorrowStr })
      .set('x-device-fingerprint', empFingerprint)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.statusCode).toBe(200);
    const summary = res.body.data.summary;
    expect(summary.totalAssigned).toBe(2);
    expect(summary.absent).toBe(1);
    expect(summary.pendingShift).toBe(1);
    expect(summary.attendanceRate).toBe(0);

    const yesterdayData = res.body.data.dailyData.find(d => d.date === yesterdayStr);
    expect(yesterdayData.status).toBe('ABSENT');

    const tomorrowData = res.body.data.dailyData.find(d => d.date === tomorrowStr);
    expect(tomorrowData.status).toBe('PENDING');
  });

  test('GET /api/v1/attendance/analytics - Admin can inspect employee, other employee blocked', async () => {
    // Admin inspects employee
    const adminRes = await request(app)
      .get('/api/v1/attendance/analytics')
      .query({ employeeId: testEmployeeId })
      .set('x-device-fingerprint', adminFingerprint)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(adminRes.statusCode).toBe(200);

    // Employee inspects another employee (forbidden)
    const empRes = await request(app)
      .get('/api/v1/attendance/analytics')
      .query({ employeeId: secondEmployeeId })
      .set('x-device-fingerprint', empFingerprint)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(empRes.statusCode).toBe(403);
    expect(empRes.body.message).toContain('không có quyền');
  });
});
