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

function getTodayStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

describe('Multi-Location Assignment and Shift Selection Integration Tests', () => {
  let dbClient;
  let adminToken, adminAccountId, adminEmployeeId;
  let employeeToken, employeeId, employeeAccountId;
  let testDepartmentId;
  let loc1Id, loc2Id, companyLocId;
  let shiftId;

  beforeAll(async () => {
    dbClient = await pool.connect();

    // 1. Create a test department
    const deptRes = await dbClient.query(`
      INSERT INTO public.departments (department_name, description, status)
      VALUES ('Phòng Thử Nghiệm Đa Địa Điểm', 'Department for multi location testing', 1)
      RETURNING department_id;
    `);
    testDepartmentId = parseInt(deptRes.rows[0].department_id, 10);

    // 2. Hash password
    const hashedPassword = await bcrypt.hash('password123', 12);

    // 3. Get roles
    const rolesRes = await dbClient.query('SELECT role_id, role_name FROM public.roles');
    const adminRoleId = rolesRes.rows.find(r => r.role_name === 'ADMIN').role_id;
    const employeeRoleId = rolesRes.rows.find(r => r.role_name === 'EMPLOYEE').role_id;

    // 4. Create admin account
    const adminEmpRes = await dbClient.query(`
      INSERT INTO public.employees (employee_code, full_name, email, phone, department_id, status)
      VALUES ('ADMIN_MLT', 'Admin Multi Location', 'adminmlt@example.com', '0912123123', $1, 1)
      RETURNING employee_id;
    `, [testDepartmentId]);
    adminEmployeeId = parseInt(adminEmpRes.rows[0].employee_id, 10);

    const adminAccRes = await dbClient.query(`
      INSERT INTO public.accounts (employee_id, username, password_hash, role_id, is_active)
      VALUES ($1, 'adminmlt', $2, $3, 1)
      RETURNING account_id;
    `, [adminEmployeeId, hashedPassword, adminRoleId]);
    adminAccountId = parseInt(adminAccRes.rows[0].account_id, 10);

    // 5. Create employee account
    const empRes = await dbClient.query(`
      INSERT INTO public.employees (employee_code, full_name, email, phone, department_id, status)
      VALUES ('EMP_MLT', 'Employee Multi Location', 'empmlt@example.com', '0912123124', $1, 1)
      RETURNING employee_id;
    `, [testDepartmentId]);
    employeeId = parseInt(empRes.rows[0].employee_id, 10);

    const empAccRes = await dbClient.query(`
      INSERT INTO public.accounts (employee_id, username, password_hash, role_id, is_active)
      VALUES ($1, 'empmlt', $2, $3, 1)
      RETURNING account_id;
    `, [employeeId, hashedPassword, employeeRoleId]);
    employeeAccountId = parseInt(empAccRes.rows[0].account_id, 10);

    // Insert dummy face mesh profile to bypass profile verification
    await dbClient.query(`
      INSERT INTO public.employee_face_profiles (employee_id, embedding, embedding_version, provider, status)
      VALUES ($1, '[0.1, 0.2, 0.3]', 'v1', 'mediapipe', 1);
    `, [employeeId]);

    // 6. Create 2 test work locations + 1 company location
    // Location 1: 10.762622, 106.660172 (allowedRadius: 100m)
    const loc1Res = await dbClient.query(`
      INSERT INTO public.work_locations (location_name, address, latitude, longitude, allowed_radius_meter, is_company_location, status)
      VALUES ('Địa điểm MLT 1', 'Địa chỉ 1', 10.762622, 106.660172, 100, false, 1)
      RETURNING location_id;
    `);
    loc1Id = parseInt(loc1Res.rows[0].location_id, 10);

    // Location 2: 10.773598, 106.680678 (allowedRadius: 100m)
    const loc2Res = await dbClient.query(`
      INSERT INTO public.work_locations (location_name, address, latitude, longitude, allowed_radius_meter, is_company_location, status)
      VALUES ('Địa điểm MLT 2', 'Địa chỉ 2', 10.773598, 106.680678, 100, false, 1)
      RETURNING location_id;
    `);
    loc2Id = parseInt(loc2Res.rows[0].location_id, 10);

    // Company Location: 10.782512, 106.698901 (allowedRadius: 200m)
    const companyRes = await dbClient.query(`
      INSERT INTO public.work_locations (location_name, address, latitude, longitude, allowed_radius_meter, is_company_location, status)
      VALUES ('Công ty MLT Trụ sở', 'Địa chỉ Công ty', 10.782512, 106.698901, 200, true, 1)
      RETURNING location_id;
    `);
    companyLocId = parseInt(companyRes.rows[0].location_id, 10);

    // 7. Get shift CA_1
    const shiftRes = await dbClient.query("SELECT shift_id FROM public.work_shifts WHERE shift_code = 'CA_1' LIMIT 1");
    shiftId = parseInt(shiftRes.rows[0].shift_id, 10);

    // Logins
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .set('x-device-fingerprint', 'admin_fingerprint')
      .send({ username: 'adminmlt', password: 'password123' });
    adminToken = adminLogin.body.data.accessToken;

    const employeeLogin = await request(app)
      .post('/api/auth/login')
      .set('x-device-fingerprint', 'emp_fingerprint')
      .send({ username: 'empmlt', password: 'password123' });
    employeeToken = employeeLogin.body.data.accessToken;
  });

  afterAll(async () => {
    if (dbClient) {
      // Cleanup all records created
      const runQuery = async (label, q, params) => {
        try {
          await dbClient.query(q, params);
          console.log(`[CLEANUP SUCCESS] ${label}`);
        } catch (e) {
          console.error(`[CLEANUP ERROR] ${label}:`, e.message);
        }
      };

      await runQuery('attendance_location_logs', 'DELETE FROM public.attendance_location_logs WHERE employee_id IN ($1, $2)', [employeeId, adminEmployeeId]);
      await runQuery('attendance', 'DELETE FROM public.attendance WHERE employee_id = $1', [employeeId]);
      await runQuery('employee_work_assignments', 'DELETE FROM public.employee_work_assignments WHERE employee_id = $1', [employeeId]);
      await runQuery('employee_face_profiles', 'DELETE FROM public.employee_face_profiles WHERE employee_id = $1', [employeeId]);
      await runQuery('user_sessions', 'DELETE FROM public.user_sessions WHERE employee_id IN ($1, $2)', [employeeId, adminEmployeeId]);
      await runQuery('registered_devices', 'DELETE FROM public.registered_devices WHERE employee_id IN ($1, $2)', [employeeId, adminEmployeeId]);
      await runQuery('system_logs', 'DELETE FROM public.system_logs WHERE employee_id IN ($1, $2)', [employeeId, adminEmployeeId]);
      await runQuery('accounts', 'DELETE FROM public.accounts WHERE employee_id IN ($1, $2)', [employeeId, adminEmployeeId]);
      await runQuery('employees', 'DELETE FROM public.employees WHERE employee_id IN ($1, $2)', [employeeId, adminEmployeeId]);
      await runQuery('departments', 'DELETE FROM public.departments WHERE department_id = $1', [testDepartmentId]);
      await runQuery('work_locations', 'DELETE FROM public.work_locations WHERE location_id IN ($1, $2, $3)', [loc1Id, loc2Id, companyLocId]);
      
      dbClient.release();
    }
  });

  describe('Work Assignment Creation and Multiple Locations', () => {
    let assignmentId;
    const workDate = getTodayStr();

    test('Should create an assignment with multiple locations successfully', async () => {
      const res = await request(app)
        .post('/api/admin/assignments')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', 'admin_fingerprint')
        .send({
          employeeId,
          locationIds: [loc1Id, loc2Id],
          shiftId,
          workDate,
          note: 'Phân công đa địa điểm kiểm thử'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('assignmentId');
      assignmentId = res.body.data.assignmentId;

      // Verify assignment_locations records
      const locationsRes = await dbClient.query(
        'SELECT location_id FROM public.assignment_locations WHERE assignment_id = $1 ORDER BY location_id',
        [assignmentId]
      );
      expect(locationsRes.rows.length).toBe(2);
      expect(parseInt(locationsRes.rows[0].location_id, 10)).toBe(Math.min(loc1Id, loc2Id));
      expect(parseInt(locationsRes.rows[1].location_id, 10)).toBe(Math.max(loc1Id, loc2Id));
    });

    test('Should fail check-in if GPS coordinate is completely out of range', async () => {
      // Try to check in at coordinates: 11.000000, 106.000000 (completely different place)
      const res = await request(app)
        .post('/api/attendance/check-in')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-device-fingerprint', 'emp_fingerprint')
        .field('assignmentId', assignmentId)
        .field('latitude', 11.0)
        .field('longitude', 106.0)
        .field('gpsAccuracy', 10)
        .field('isPwaStandalone', 1)
        .field('capturedAtClient', new Date().toISOString())
        .field('clientRequestId', '550e8400-e29b-41d4-a716-446655440099')
        .attach('photo', Buffer.from('mock_face_bytes'), 'face.jpg');

      if (res.status !== 400) {
        console.log('FAIL test response body:', res.body);
      }
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('ngoài bán kính');
    });

    test('Should check-in successfully at Location 1 and record matched_location_id', async () => {
      // Location 1 coordinates: 10.762622, 106.660172
      const res = await request(app)
        .post('/api/attendance/check-in')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-device-fingerprint', 'emp_fingerprint')
        .field('assignmentId', assignmentId)
        .field('latitude', 10.762625) // very close to location 1
        .field('longitude', 106.660175)
        .field('gpsAccuracy', 10)
        .field('isPwaStandalone', 1)
        .field('capturedAtClient', new Date().toISOString())
        .field('clientRequestId', '550e8400-e29b-41d4-a716-446655440098')
        .attach('photo', Buffer.from('mock_face_bytes'), 'face.jpg');

      if (res.status !== 200) {
        console.log('SUCCESS test response body:', res.body);
      }
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.actualCheckInLocation.locationId).toBe(loc1Id);

      // Verify matched_location_id in database directly
      const dbRecord = await dbClient.query('SELECT matched_location_id FROM public.attendance WHERE assignment_id = $1', [assignmentId]);
      expect(parseInt(dbRecord.rows[0].matched_location_id, 10)).toBe(loc1Id);
    });
  });
});
