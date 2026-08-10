const request = require('supertest');
const app = require('../app');
const { pool } = require('../config/db');
const { cleanAllTables } = require('./setup');
const bcrypt = require('bcrypt');

describe('Security & Vulnerability Integration Tests', () => {
  let dbClient;
  let employeeToken;
  let adminToken;
  let empFingerprint = 'fingerprint_security_emp';
  let adminFingerprint = 'fingerprint_security_admin';
  let testRoleIdAdmin, testRoleIdEmployee;
  let testDepartmentId;
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

    // Create default department
    const deptRes = await dbClient.query(`
      INSERT INTO public.departments (department_name, description, status)
      VALUES ('HR', 'Human Resources', 1)
      RETURNING department_id
    `);
    testDepartmentId = deptRes.rows[0].department_id;

    // Create employee
    const empRes = await dbClient.query(`
      INSERT INTO public.employees (employee_code, full_name, email, phone, department_id, status)
      VALUES ('EMP800', 'Jane Security', 'jane.sec@example.com', '0123456799', $1, 1)
      RETURNING employee_id
    `, [testDepartmentId]);
    const empId = empRes.rows[0].employee_id;

    await dbClient.query(`
      INSERT INTO public.accounts (employee_id, username, password_hash, role_id, is_active)
      VALUES ($1, 'janesecurity', $2, $3, 1)
    `, [empId, hashedPassword, testRoleIdEmployee]);

    // Log in as employee
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'janesecurity', password: 'password123' })
      .set('x-device-fingerprint', empFingerprint);
    employeeToken = loginRes.body.data.accessToken;

    // Create admin user
    const adminEmp = await dbClient.query(`
      INSERT INTO public.employees (employee_code, full_name, email, phone, department_id, status)
      VALUES ('ADM800', 'Admin Security', 'admin.sec@example.com', '0123456781', $1, 1)
      RETURNING employee_id
    `, [testDepartmentId]);
    await dbClient.query(`
      INSERT INTO public.accounts (employee_id, username, password_hash, role_id, is_active)
      VALUES ($1, 'adminsec', $2, $3, 1)
    `, [adminEmp.rows[0].employee_id, hashedPassword, testRoleIdAdmin]);

    const adminLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'adminsec', password: 'password123' })
      .set('x-device-fingerprint', adminFingerprint);
    adminToken = adminLoginRes.body.data.accessToken;
  });

  describe('Authentication & Authorization Bypass Checks', () => {
    test('Access admin-only endpoint without token should return 401 Unauthorized', async () => {
      const res = await request(app)
        .get('/api/admin/attendance')
        .set('x-device-fingerprint', adminFingerprint);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('Access admin-only endpoint with employee token should return 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/admin/attendance')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-device-fingerprint', empFingerprint);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Không có quyền truy cập');
    });
  });

  describe('SQL Injection Prevention', () => {
    test('SQL Injection payload in employee search should be treated as literal, not executed', async () => {
      const sqlInjectionPayload = "Jane' OR '1'='1";
      const res = await request(app)
        .get('/api/admin/employees')
        .query({ keyword: sqlInjectionPayload })
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // It should return 0 items because no employee has that name literally
      expect(res.body.data.items.length).toBe(0);
    });

    test('SQL Injection payload in creating department name should not corrupt query', async () => {
      const maliciousName = "NewDept'; DROP TABLE public.attendance;--";
      const res = await request(app)
        .post('/api/admin/departments')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({
          departmentName: maliciousName,
          description: 'Malicious payload test'
        });

      // It should succeed or fail gracefully (e.g. naming checks), but not run DROP TABLE!
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      // Verify that public.attendance table still exists
      const tableCheck = await dbClient.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
            AND table_name = 'attendance'
        );
      `);
      expect(tableCheck.rows[0].exists).toBe(true);
    });
  });

  describe('Unrestricted File Upload Checks', () => {
    test('Upload dangerous file extension (.sh) should be rejected', async () => {
      const dangerousBuffer = Buffer.from('echo "malicious script"');
      const res = await request(app)
        .post('/api/attendance/check-in')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-device-fingerprint', empFingerprint)
        .attach('photo', dangerousBuffer, 'exploit.sh')
        .field('assignmentId', 1)
        .field('latitude', 10.762622)
        .field('longitude', 106.660172)
        .field('gpsAccuracy', 10)
        .field('capturedAtClient', new Date().toISOString())
        .field('clientRequestId', '550e8400-e29b-41d4-a716-446655440001')
        .field('isPwaStandalone', 1);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Chỉ chấp nhận ảnh');
    });

    test('Upload dangerous MIME type (application/javascript) should be rejected', async () => {
      const dangerousBuffer = Buffer.from('alert("xss")');
      const res = await request(app)
        .post('/api/attendance/check-in')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-device-fingerprint', empFingerprint)
        .attach('photo', dangerousBuffer, { filename: 'photo.jpg', contentType: 'application/javascript' })
        .field('assignmentId', 1)
        .field('latitude', 10.762622)
        .field('longitude', 106.660172)
        .field('gpsAccuracy', 10)
        .field('capturedAtClient', new Date().toISOString())
        .field('clientRequestId', '550e8400-e29b-41d4-a716-446655440001')
        .field('isPwaStandalone', 1);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Chỉ chấp nhận ảnh');
    });
  });
});
