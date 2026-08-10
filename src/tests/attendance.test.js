// Mock MediaPipe Service before importing app
jest.mock('../modules/face-recognition/services/mediapipe.service.js', () => {
  return {
    detectFaceMesh: jest.fn().mockImplementation(async (buffer, filename) => {
      const fn = String(filename).toLowerCase();
      if (fn.includes('no_face')) {
        return { detected: false, faceCount: 0, reason: 'NO_FACE_DETECTED' };
      }
      if (fn.includes('multiple_faces')) {
        return { detected: true, faceCount: 2, reason: 'MULTIPLE_FACES_DETECTED' };
      }
      return {
        detected: true,
        faceCount: 1,
        mesh: { landmarks: [] }
      };
    }),
    estimateHeadPose: jest.fn().mockImplementation((mesh, filename) => {
      const fn = String(filename).toLowerCase();
      if (fn.includes('head_pose_fail')) {
        return { passed: false, yaw: 45, pitch: 0, roll: 0 };
      }
      return { passed: true, yaw: 0, pitch: 0, roll: 0 };
    }),
    detectEyeBlink: jest.fn().mockImplementation((mesh, filename) => {
      const fn = String(filename).toLowerCase();
      if (fn.includes('eye_blink_fail')) {
        return { passed: false };
      }
      return { passed: true };
    }),
    detectFaceOrientation: jest.fn().mockImplementation((mesh, filename) => {
      return { passed: true, label: 'UPRIGHT' };
    }),
    detectOcclusion: jest.fn().mockImplementation((mesh, filename) => {
      return { passed: true, hasMask: false, hasGlasses: false };
    }),
    detectSpoof: jest.fn().mockImplementation((buffer, filename) => {
      return { passed: true, type: 'REAL', confidence: 1.0 };
    }),
    evaluateLiveness: jest.fn().mockImplementation((meshRes, headPoseRes, blinkRes, orientationRes, occlusionRes, spoofRes, filename) => {
      const fn = String(filename).toLowerCase();
      if (!meshRes.detected) return { passed: false, reason: meshRes.reason };
      if (meshRes.faceCount > 1) return { passed: false, reason: meshRes.reason };
      if (!headPoseRes.passed) return { passed: false, reason: 'HEAD_POSE_INVALID' };
      if (!blinkRes.passed) return { passed: false, reason: 'EYE_BLINK_NOT_DETECTED' };
      return { passed: true, reason: null };
    }),
    recognizeFace: jest.fn().mockImplementation(async (buffer, embedding) => {
      return { success: true, match: true, distance: 0.1 };
    }),
  };
});

// Mock Identity Verification Service
jest.mock('../modules/face-recognition/services/identity-verification.service.js', () => {
  return {
    verifyIdentity: jest.fn().mockImplementation(async (employeeId, buffer, filename, activeProfile) => {
      const fn = String(filename).toLowerCase();
      if (fn.includes('face_mismatch')) {
        return { success: true, match: false, similarity: 0.4 };
      }
      return { success: true, match: true, similarity: 0.92 };
    }),
  };
});

// Mock WebAuthn Device Biometric verification
jest.mock('../modules/device-biometric/services/device-biometric.service.js', () => {
  return {
    verifyDevice: jest.fn().mockImplementation(async (employeeId, sessionId, body, client) => {
      return true;
    }),
  };
});

const request = require('supertest');
const app = require('../app');
const { pool } = require('../config/db');
const { cleanAllTables } = require('./setup');
const bcrypt = require('bcrypt');

describe('Attendance System Integration Tests (Online & Offline Sync)', () => {
  let dbClient;
  let employeeToken;
  let adminToken;
  let empFingerprint = 'fingerprint_emp_attendance';
  let adminFingerprint = 'fingerprint_admin_attendance';
  let testRoleIdAdmin, testRoleIdEmployee;
  let testDepartmentId;
  let testLocationId;
  let testEmployeeId;
  let testAssignmentId;
  let testShiftId;
  let hashedPassword;
  let dummyBuffer = Buffer.from('dummy image data');

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

    // 1. Create a default department
    const deptRes = await dbClient.query(`
      INSERT INTO public.departments (department_name, description, status)
      VALUES ('HR', 'Human Resources', 1)
      RETURNING department_id
    `);
    testDepartmentId = deptRes.rows[0].department_id;

    // 2. Create shift HC
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
      VALUES ('EMP500', 'Jane Worker', 'jane.worker@example.com', '0123456785', $1, 1)
      RETURNING employee_id
    `, [testDepartmentId]);
    testEmployeeId = empRes.rows[0].employee_id;

    await dbClient.query(`
      INSERT INTO public.accounts (employee_id, username, password_hash, role_id, is_active)
      VALUES ($1, 'janeworker', $2, $3, 1)
    `, [testEmployeeId, hashedPassword, testRoleIdEmployee]);

    // Log in as employee
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'janeworker', password: 'password123' })
      .set('x-device-fingerprint', empFingerprint);
    employeeToken = loginRes.body.data.accessToken;

    // 4. Create admin user & account
    const adminEmp = await dbClient.query(`
      INSERT INTO public.employees (employee_code, full_name, email, phone, department_id, status)
      VALUES ('ADM500', 'Admin Reviewer', 'admin.rev@example.com', '0123456789', $1, 1)
      RETURNING employee_id
    `, [testDepartmentId]);
    await dbClient.query(`
      INSERT INTO public.accounts (employee_id, username, password_hash, role_id, is_active)
      VALUES ($1, 'adminreviewer', $2, $3, 1)
    `, [adminEmp.rows[0].employee_id, hashedPassword, testRoleIdAdmin]);

    const adminLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'adminreviewer', password: 'password123' })
      .set('x-device-fingerprint', adminFingerprint);
    adminToken = adminLoginRes.body.data.accessToken;

    // 5. Create active face profile
    await dbClient.query(`
      INSERT INTO public.employee_face_profiles (employee_id, embedding, embedding_version, provider, status)
      VALUES ($1, '[0.1, 0.2, 0.3]', 'v1', 'mediapipe', 1)
    `, [testEmployeeId]);

    // 6. Create work location
    const locRes = await dbClient.query(`
      INSERT INTO public.work_locations (location_name, address, latitude, longitude, allowed_radius_meter, status)
      VALUES ('HCM Office', 'District 1, HCMC', 10.762622, 106.660172, 100, 1)
      RETURNING location_id
    `);
    testLocationId = locRes.rows[0].location_id;

    // 7. Create assignment for today
    const todayStr = new Date().toISOString().substring(0, 10);
    const assignRes = await dbClient.query(`
      INSERT INTO public.employee_work_assignments (employee_id, location_id, shift_id, work_date, status)
      VALUES ($1, $2, $3, $4, 'ASSIGNED')
      RETURNING assignment_id
    `, [testEmployeeId, testLocationId, testShiftId, todayStr]);
    testAssignmentId = assignRes.rows[0].assignment_id;
  });

  describe('Online Attendance Check-in / Check-out', () => {
    test('Check-in successfully (Inside allowed radius, liveness pass)', async () => {
      const res = await request(app)
        .post('/api/attendance/check-in')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-device-fingerprint', empFingerprint)
        .attach('photo', dummyBuffer, 'mock_liveness_success.jpg')
        .field('assignmentId', parseInt(testAssignmentId, 10))
        .field('latitude', 10.762622)
        .field('longitude', 106.660172)
        .field('gpsAccuracy', 10)
        .field('capturedAtClient', new Date().toISOString())
        .field('clientRequestId', '550e8400-e29b-41d4-a716-446655440001')
        .field('isPwaStandalone', 1);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.attendanceStatus).toBe('IN_PROGRESS');
    });

    test('Check-in fails - Liveness detection fails (Eye blink invalid)', async () => {
      const res = await request(app)
        .post('/api/attendance/check-in')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-device-fingerprint', empFingerprint)
        .attach('photo', dummyBuffer, 'mock_eye_blink_fail.jpg') // triggers eye blink fail
        .field('assignmentId', parseInt(testAssignmentId, 10))
        .field('latitude', 10.762622)
        .field('longitude', 106.660172)
        .field('gpsAccuracy', 10)
        .field('capturedAtClient', new Date().toISOString())
        .field('clientRequestId', '550e8400-e29b-41d4-a716-446655440002')
        .field('isPwaStandalone', 1);

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Xác thực Liveness thất bại');
    });

    test('Check-in fails - Out of allowed radius', async () => {
      const res = await request(app)
        .post('/api/attendance/check-in')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-device-fingerprint', empFingerprint)
        .attach('photo', dummyBuffer, 'mock_liveness_success.jpg')
        .field('assignmentId', parseInt(testAssignmentId, 10))
        .field('latitude', 11.000000) // Out of bounds coordinates (approx 26km away)
        .field('longitude', 106.660172)
        .field('gpsAccuracy', 10)
        .field('capturedAtClient', new Date().toISOString())
        .field('clientRequestId', '550e8400-e29b-41d4-a716-446655440003')
        .field('isPwaStandalone', 1);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Bạn đang ở ngoài bán kính chấm công cho phép');
    });
  });

  describe('Offline Attendance Queue Synchronization API', () => {
    test('Offline Sync Check-in successfully (AUTO-APPROVED - no risk)', async () => {
      const res = await request(app)
        .post('/api/attendance/offline-sync')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-device-fingerprint', empFingerprint)
        .attach('photo', dummyBuffer, 'mock_liveness_success.jpg')
        .field('clientRequestId', '550e8400-e29b-41d4-a716-446655440004')
        .field('assignmentId', parseInt(testAssignmentId, 10))
        .field('type', 'check-in')
        .field('capturedAtClient', new Date().toISOString())
        .field('latitude', 10.762622)
        .field('longitude', 106.660172)
        .field('gpsAccuracy', 10);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.attendance_status).toBe('IN_PROGRESS');
      expect(res.body.data.review_status).toBe('NOT_REQUIRED');
      expect(parseInt(res.body.data.is_offline_sync, 10)).toBe(1);
    });

    test('Offline Sync Check-in requires Review (RISK - face mismatch)', async () => {
      const res = await request(app)
        .post('/api/attendance/offline-sync')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-device-fingerprint', empFingerprint)
        .attach('photo', dummyBuffer, 'mock_face_mismatch.jpg') // Triggers face mismatch
        .field('clientRequestId', '550e8400-e29b-41d4-a716-446655440005')
        .field('assignmentId', parseInt(testAssignmentId, 10))
        .field('type', 'check-in')
        .field('capturedAtClient', new Date().toISOString())
        .field('latitude', 10.762622)
        .field('longitude', 106.660172)
        .field('gpsAccuracy', 10);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.attendance_status).toBe('REVIEW_REQUIRED');
      expect(res.body.data.review_status).toBe('PENDING');
      expect(res.body.data.risk_level).toBe('HIGH');
    });
  });

  describe('Offline Review Workflow (Admin Approve/Reject)', () => {
    let targetAttendanceId;

    beforeEach(async () => {
      // Create a pending review attendance row
      const todayStr = new Date().toISOString().substring(0, 10);
      const res = await dbClient.query(`
        INSERT INTO public.attendance (
          employee_id,
          assignment_id,
          work_date,
          check_in_time,
          client_check_in_time,
          check_in_latitude,
          check_in_longitude,
          check_in_gps_accuracy,
          check_in_distance_meter,
          check_in_photo_url,
          is_offline_sync,
          location_trust_score,
          risk_level,
          attendance_status,
          review_status,
          shift_id,
          trust_score
        ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 10.762622, 106.660172, 10, 0, 'dummy.jpg', 1, 70, 'HIGH', 'REVIEW_REQUIRED', 'PENDING', $4, 70)
        RETURNING attendance_id
      `, [testEmployeeId, testAssignmentId, todayStr, testShiftId]);
      targetAttendanceId = res.rows[0].attendance_id;
    });

    test('Get review list for admin', async () => {
      const res = await request(app)
        .get('/api/admin/offline-attendance')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    test('Approve offline attendance successfully', async () => {
      const res = await request(app)
        .patch(`/api/admin/offline-attendance/${targetAttendanceId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({ reviewNote: 'Phê duyệt chấm công ngoại tuyến hợp lệ' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.review_status).toBe('APPROVED');
      expect(res.body.data.attendance_status).toBe('IN_PROGRESS'); // Since check-out not done yet
    });

    test('Reject offline attendance successfully', async () => {
      const res = await request(app)
        .patch(`/api/admin/offline-attendance/${targetAttendanceId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({ reviewNote: 'Không khớp khuôn mặt' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.review_status).toBe('REJECTED');
      expect(res.body.data.attendance_status).toBe('INVALID');
    });
  });
});
