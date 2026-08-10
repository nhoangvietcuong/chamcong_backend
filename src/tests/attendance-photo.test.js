// Mock MediaPipe Service before importing app
jest.mock('../modules/face-recognition/services/mediapipe.service.js', () => {
  return {
    detectFaceMesh: jest.fn().mockImplementation(async (buffer, filename) => {
      return {
        detected: true,
        faceCount: 1,
        mesh: { landmarks: [] }
      };
    }),
    estimateHeadPose: jest.fn().mockImplementation(() => ({ passed: true, yaw: 0, pitch: 0, roll: 0 })),
    detectEyeBlink: jest.fn().mockImplementation(() => ({ passed: true })),
    detectFaceOrientation: jest.fn().mockImplementation(() => ({ passed: true, label: 'UPRIGHT' })),
    detectOcclusion: jest.fn().mockImplementation(() => ({ passed: true, hasMask: false, hasGlasses: false })),
    detectSpoof: jest.fn().mockImplementation(() => ({ passed: true, type: 'REAL', confidence: 1.0 })),
    evaluateLiveness: jest.fn().mockImplementation(() => ({ passed: true, reason: null, confidence: 1.0 })),
    recognizeFace: jest.fn().mockImplementation(async () => ({ success: true, match: true, distance: 0.1 })),
  };
});

// Mock Identity Verification Service
jest.mock('../modules/face-recognition/services/identity-verification.service.js', () => {
  return {
    verifyIdentity: jest.fn().mockImplementation(async () => {
      return { success: true, match: true, similarity: 0.95 };
    }),
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
const uuid = require('uuid');

describe('Attendance Photo History Integration Tests', () => {
  let dbClient;
  let employeeToken;
  let adminToken;
  let empFingerprint = 'fingerprint_emp_photo_tests';
  let adminFingerprint = 'fingerprint_admin_photo_tests';
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

    // Create a default department
    const deptRes = await dbClient.query(`
      INSERT INTO public.departments (department_name, description, status)
      VALUES ('HR', 'Human Resources', 1)
      RETURNING department_id
    `);
    testDepartmentId = deptRes.rows[0].department_id;

    // Create shift HC
    const shiftRes = await dbClient.query(`
      INSERT INTO public.work_shifts (shift_code, shift_name, start_time, end_time, late_grace_minutes, early_leave_grace_minutes, minimum_work_minutes, is_active)
      VALUES ('HC', 'Hành chính', '08:00:00', '17:00:00', 5, 5, 480, 1)
      ON CONFLICT (shift_code) DO UPDATE SET is_active = 1
      RETURNING shift_id
    `);
    testShiftId = shiftRes.rows[0].shift_id;

    // Create employee & account
    const empRes = await dbClient.query(`
      INSERT INTO public.employees (employee_code, full_name, email, phone, department_id, status)
      VALUES ('EMP501', 'John Worker', 'john.worker@example.com', '0123456786', $1, 1)
      RETURNING employee_id
    `, [testDepartmentId]);
    testEmployeeId = empRes.rows[0].employee_id;

    await dbClient.query(`
      INSERT INTO public.accounts (employee_id, username, password_hash, role_id, is_active)
      VALUES ($1, 'johnworker', $2, $3, 1)
    `, [testEmployeeId, hashedPassword, testRoleIdEmployee]);

    // Log in as employee
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'johnworker', password: 'password123' })
      .set('x-device-fingerprint', empFingerprint);
    employeeToken = loginRes.body.data.accessToken;

    // Create admin user & account
    const adminEmp = await dbClient.query(`
      INSERT INTO public.employees (employee_code, full_name, email, phone, department_id, status)
      VALUES ('ADM501', 'Admin Auditor', 'admin.audit@example.com', '0123456787', $1, 1)
      RETURNING employee_id
    `, [testDepartmentId]);
    await dbClient.query(`
      INSERT INTO public.accounts (employee_id, username, password_hash, role_id, is_active)
      VALUES ($1, 'adminauditor', $2, $3, 1)
    `, [adminEmp.rows[0].employee_id, hashedPassword, testRoleIdAdmin]);

    const adminLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'adminauditor', password: 'password123' })
      .set('x-device-fingerprint', adminFingerprint);
    adminToken = adminLoginRes.body.data.accessToken;

    // Create active face profile
    await dbClient.query(`
      INSERT INTO public.employee_face_profiles (employee_id, embedding, embedding_version, provider, status)
      VALUES ($1, '[0.1, 0.2, 0.3]', 'v1', 'mediapipe', 1)
    `, [testEmployeeId]);

    // Create work location
    const locRes = await dbClient.query(`
      INSERT INTO public.work_locations (location_name, address, latitude, longitude, allowed_radius_meter, status)
      VALUES ('HCM Office', 'District 1, HCMC', 10.762622, 106.660172, 100, 1)
      RETURNING location_id
    `);
    testLocationId = locRes.rows[0].location_id;

    // Create assignment for today
    const todayStr = new Date().toISOString().substring(0, 10);
    const assignRes = await dbClient.query(`
      INSERT INTO public.employee_work_assignments (employee_id, location_id, shift_id, work_date, status)
      VALUES ($1, $2, $3, $4, 'ASSIGNED')
      RETURNING assignment_id
    `, [testEmployeeId, testLocationId, testShiftId, todayStr]);
    testAssignmentId = assignRes.rows[0].assignment_id;
  });

  test('1. Check-in successfully creates FACE_CAPTURE and CHECK_IN_FINAL photo records', async () => {
    const checkInRes = await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('x-device-fingerprint', empFingerprint)
      .attach('photo', dummyBuffer, 'checkin.jpg')
      .field('assignmentId', testAssignmentId)
      .field('latitude', 10.762622)
      .field('longitude', 106.660172)
      .field('gpsAccuracy', 15)
      .field('capturedAtClient', new Date().toISOString())
      .field('clientRequestId', uuid.v4())
      .field('isPwaStandalone', 1);

    expect(checkInRes.status).toBe(200);
    const attendanceId = checkInRes.body.data.attendanceId;

    // Query database directly to see if photo is logged
    const photosRes = await dbClient.query(
      'SELECT * FROM public.attendance_photos WHERE attendance_id = $1 ORDER BY photo_type ASC',
      [attendanceId]
    );

    // Expecting 2 records: FACE_CAPTURE and CHECK_IN_FINAL
    expect(photosRes.rows.length).toBe(2);
    expect(photosRes.rows[0].photo_type).toBe('CHECK_IN_FINAL');
    expect(photosRes.rows[1].photo_type).toBe('FACE_CAPTURE');
  });

  test('2. Check-in with verificationPhoto creates LOCATION_CAPTURE, FACE_CAPTURE and CHECK_IN_FINAL records', async () => {
    const checkInRes = await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('x-device-fingerprint', empFingerprint)
      .attach('photo', dummyBuffer, 'checkin.jpg')
      .attach('verificationPhoto', dummyBuffer, 'location_evidence.jpg')
      .field('assignmentId', testAssignmentId)
      .field('latitude', 10.762622)
      .field('longitude', 106.660172)
      .field('gpsAccuracy', 15)
      .field('capturedAtClient', new Date().toISOString())
      .field('clientRequestId', uuid.v4())
      .field('isPwaStandalone', 1);

    expect(checkInRes.status).toBe(200);
    const attendanceId = checkInRes.body.data.attendanceId;

    const photosRes = await dbClient.query(
      'SELECT * FROM public.attendance_photos WHERE attendance_id = $1 ORDER BY photo_type ASC',
      [attendanceId]
    );

    // Expecting 3 records: CHECK_IN_FINAL, FACE_CAPTURE, and LOCATION_CAPTURE
    expect(photosRes.rows.length).toBe(3);
    expect(photosRes.rows[0].photo_type).toBe('CHECK_IN_FINAL');
    expect(photosRes.rows[1].photo_type).toBe('FACE_CAPTURE');
    expect(photosRes.rows[2].photo_type).toBe('LOCATION_CAPTURE');
  });

  test('3. Check-out successfully creates FACE_CAPTURE and CHECK_OUT_FINAL photo records', async () => {
    // 1. Perform check-in first
    await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('x-device-fingerprint', empFingerprint)
      .attach('photo', dummyBuffer, 'checkin.jpg')
      .field('assignmentId', testAssignmentId)
      .field('latitude', 10.762622)
      .field('longitude', 106.660172)
      .field('gpsAccuracy', 15)
      .field('capturedAtClient', new Date().toISOString())
      .field('clientRequestId', uuid.v4())
      .field('isPwaStandalone', 1);

    // 2. Perform check-out
    const checkOutRes = await request(app)
      .post('/api/attendance/check-out')
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('x-device-fingerprint', empFingerprint)
      .attach('photo', dummyBuffer, 'checkout.jpg')
      .field('assignmentId', testAssignmentId)
      .field('latitude', 10.762622)
      .field('longitude', 106.660172)
      .field('gpsAccuracy', 10)
      .field('capturedAtClient', new Date().toISOString())
      .field('clientRequestId', uuid.v4())
      .field('isPwaStandalone', 1);

    expect(checkOutRes.status).toBe(200);
    const attendanceId = checkOutRes.body.data.attendanceId;

    const photosRes = await dbClient.query(
      'SELECT * FROM public.attendance_photos WHERE attendance_id = $1 ORDER BY photo_type ASC',
      [attendanceId]
    );

    // 2 for Check-in + 2 for Check-out = 4 records in total
    expect(photosRes.rows.length).toBe(4);
    const checkOutPhotos = photosRes.rows.filter(p => p.photo_type.startsWith('CHECK_OUT'));
    expect(checkOutPhotos.length).toBe(1);
    expect(checkOutPhotos[0].photo_type).toBe('CHECK_OUT_FINAL');
  });

  test('4. Admin can query photo details, Employee cannot (Authorization Check)', async () => {
    // 1. Check-in
    const checkInRes = await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('x-device-fingerprint', empFingerprint)
      .attach('photo', dummyBuffer, 'checkin.jpg')
      .field('assignmentId', testAssignmentId)
      .field('latitude', 10.762622)
      .field('longitude', 106.660172)
      .field('gpsAccuracy', 15)
      .field('capturedAtClient', new Date().toISOString())
      .field('clientRequestId', uuid.v4())
      .field('isPwaStandalone', 1);

    const attendanceId = checkInRes.body.data.attendanceId;

    // 2. Admin calls API - Expects 200 SUCCESS
    const adminRes = await request(app)
      .get(`/api/admin/attendance/${attendanceId}/photos`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-device-fingerprint', adminFingerprint);

    expect(adminRes.status).toBe(200);
    expect(adminRes.body.success).toBe(true);
    expect(adminRes.body.data.length).toBe(2); // FACE_CAPTURE & CHECK_IN_FINAL

    // 3. Employee calls API - Expects 403 FORBIDDEN
    const employeeRes = await request(app)
      .get(`/api/admin/attendance/${attendanceId}/photos`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('x-device-fingerprint', empFingerprint);

    expect(employeeRes.status).toBe(403);
  });

  test('5. Photo soft delete flags is_deleted properly', async () => {
    // 1. Save directly using repository
    const attendancePhotoService = require('../services/attendance-photo-service');
    const photo = await attendancePhotoService.savePhoto({
      employeeId: testEmployeeId,
      photoType: 'ADMIN_UPLOAD',
      photoUrl: '/uploads/admin.jpg',
      capturedAt: new Date(),
    });

    const photoId = photo.photo_id;

    // 2. Soft delete using service
    await attendancePhotoService.softDeletePhoto(photoId, { role: 'ADMIN' });

    // 3. Direct query reveals is_deleted = 1
    const dbRes = await dbClient.query(
      'SELECT is_deleted FROM public.attendance_photos WHERE photo_id = $1',
      [photoId]
    );
    expect(dbRes.rows[0].is_deleted).toBe(1);
  });

  test('6. Rollback transaction still saves failed attempt photos as FAILED without attendanceId', async () => {
    // Induce a distance error during check-in (coordinates far away)
    const checkInRes = await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('x-device-fingerprint', empFingerprint)
      .attach('photo', dummyBuffer, 'checkin.jpg')
      .field('assignmentId', testAssignmentId)
      .field('latitude', 11.762622) // far away from 10.762622
      .field('longitude', 107.660172)
      .field('gpsAccuracy', 15)
      .field('capturedAtClient', new Date().toISOString())
      .field('clientRequestId', uuid.v4())
      .field('isPwaStandalone', 1);

    expect(checkInRes.status).toBe(400); // Bad Request (OUTSIDE Geofence)

    // Verify failed check-in photos are stored in public.attendance_photos
    const photosRes = await dbClient.query(
      'SELECT * FROM public.attendance_photos WHERE employee_id = $1 ORDER BY photo_type ASC',
      [testEmployeeId]
    );
    expect(photosRes.rows.length).toBe(2); // FACE_CAPTURE + CHECK_IN_FINAL (since no verificationPhoto attached)
    expect(photosRes.rows[0].photo_type).toBe('CHECK_IN_FINAL');
    expect(photosRes.rows[0].verification_result).toBe('FAILED');
    expect(photosRes.rows[0].attendance_id).toBeNull();
    
    expect(photosRes.rows[1].photo_type).toBe('FACE_CAPTURE');
    expect(photosRes.rows[1].verification_result).toBe('FAILED');
    expect(photosRes.rows[1].attendance_id).toBeNull();
  });

  test('7. Early validation errors (e.g. duplicate check-in) still save uploaded photos as FAILED', async () => {
    // 1st check-in: Success
    const firstCheckIn = await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('x-device-fingerprint', empFingerprint)
      .attach('photo', dummyBuffer, 'checkin_first.jpg')
      .field('assignmentId', testAssignmentId)
      .field('latitude', 10.762622)
      .field('longitude', 106.660172)
      .field('gpsAccuracy', 15)
      .field('capturedAtClient', new Date().toISOString())
      .field('clientRequestId', uuid.v4())
      .field('isPwaStandalone', 1);

    expect(firstCheckIn.status).toBe(200);

    // Clear photos database before duplicate attempt to verify failed attempt writes
    await dbClient.query('DELETE FROM public.attendance_photos');

    // 2nd check-in: Fails early with 400 (Already checked in)
    const duplicateRes = await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('x-device-fingerprint', empFingerprint)
      .attach('photo', dummyBuffer, 'duplicate_checkin.jpg')
      .field('assignmentId', testAssignmentId)
      .field('latitude', 10.762622)
      .field('longitude', 106.660172)
      .field('gpsAccuracy', 15)
      .field('capturedAtClient', new Date().toISOString())
      .field('clientRequestId', uuid.v4())
      .field('isPwaStandalone', 1);

    expect(duplicateRes.status).toBe(400);

    // Verify duplicate attempt photos are stored in public.attendance_photos
    const photosRes = await dbClient.query(
      'SELECT * FROM public.attendance_photos WHERE employee_id = $1 ORDER BY photo_type ASC',
      [testEmployeeId]
    );
    expect(photosRes.rows.length).toBe(2); // FACE_CAPTURE + CHECK_IN_FINAL
    expect(photosRes.rows[0].photo_type).toBe('CHECK_IN_FINAL');
    expect(photosRes.rows[0].verification_result).toBe('FAILED');
    expect(photosRes.rows[0].attendance_id).toBeNull();
    
    expect(photosRes.rows[1].photo_type).toBe('FACE_CAPTURE');
    expect(photosRes.rows[1].verification_result).toBe('FAILED');
    expect(photosRes.rows[1].attendance_id).toBeNull();
  });
});
