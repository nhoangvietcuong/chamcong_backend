const request = require('supertest');
const app = require('../app');
const { pool } = require('../config/db');
const { cleanAllTables } = require('./setup');
const bcrypt = require('bcrypt');

describe('Data Management System Integration Tests', () => {
  let dbClient;
  let adminToken, supToken;
  let adminFingerprint = 'fingerprint_admin_data';
  let supFingerprint = 'fingerprint_sup_data';
  let testRoleIdAdmin, testRoleIdEmployee, testRoleIdSup;
  let testDepartmentId;
  let testLocationId;
  let testEmployeeId;
  let hashedPassword;

  beforeAll(async () => {
    dbClient = await pool.connect();
    const rolesRes = await dbClient.query('SELECT role_id, role_name FROM public.roles');
    testRoleIdAdmin = rolesRes.rows.find(r => r.role_name === 'ADMIN').role_id;
    testRoleIdEmployee = rolesRes.rows.find(r => r.role_name === 'EMPLOYEE').role_id;
    testRoleIdSup = rolesRes.rows.find(r => r.role_name === 'SUPMANAGER').role_id;
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
      VALUES ('IT_DEP', 'IT Department', 1)
      RETURNING department_id
    `);
    testDepartmentId = deptRes.rows[0].department_id;

    // 2. Create an admin user to perform operations
    const empRes = await dbClient.query(`
      INSERT INTO public.employees (employee_code, full_name, email, phone, department_id, status)
      VALUES ('ADM001', 'Admin User', 'admin@example.com', '0123456780', $1, 1)
      RETURNING employee_id
    `, [testDepartmentId]);
    const adminEmpId = empRes.rows[0].employee_id;

    const accRes = await dbClient.query(`
      INSERT INTO public.accounts (employee_id, username, password_hash, role_id, is_active)
      VALUES ($1, 'adminuser', $2, $3, 1)
      RETURNING account_id
    `, [adminEmpId, hashedPassword, testRoleIdAdmin]);

    // Log in as admin
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'adminuser', password: 'password123' })
      .set('x-device-fingerprint', adminFingerprint);

    adminToken = loginRes.body.data.accessToken;

    // Create a supmanager user to perform operations
    const supEmpRes = await dbClient.query(`
      INSERT INTO public.employees (employee_code, full_name, email, phone, department_id, status)
      VALUES ('SUP001', 'Sup User', 'sup@example.com', '0123456799', $1, 1)
      RETURNING employee_id
    `, [testDepartmentId]);
    const supEmpId = supEmpRes.rows[0].employee_id;

    await dbClient.query(`
      INSERT INTO public.accounts (employee_id, username, password_hash, role_id, is_active)
      VALUES ($1, 'supuser', $2, $3, 1)
    `, [supEmpId, hashedPassword, testRoleIdSup]);

    // Log in as sup
    const supLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'supuser', password: 'password123' })
      .set('x-device-fingerprint', supFingerprint);

    supToken = supLoginRes.body.data.accessToken;

    // 3. Create a default location
    const locRes = await dbClient.query(`
      INSERT INTO public.work_locations (location_name, address, latitude, longitude, allowed_radius_meter, status)
      VALUES ('HCM Office', 'District 1, HCMC', 10.762622, 106.660172, 100, 1)
      RETURNING location_id
    `);
    testLocationId = locRes.rows[0].location_id;

    // 4. Create a default employee
    const defaultEmp = await dbClient.query(`
      INSERT INTO public.employees (employee_code, full_name, email, phone, department_id, status)
      VALUES ('EMP100', 'Test Subject', 'subject@example.com', '0123456781', $1, 1)
      RETURNING employee_id
    `, [testDepartmentId]);
    testEmployeeId = defaultEmp.rows[0].employee_id;

    // Seed default work shift 'HC'
    await dbClient.query(`
      INSERT INTO public.work_shifts (shift_code, shift_name, start_time, end_time, late_grace_minutes, early_leave_grace_minutes, minimum_work_minutes, is_active)
      VALUES ('HC', 'Hành chính', '08:00:00', '17:00:00', 5, 5, 480, 1)
      ON CONFLICT (shift_code) DO NOTHING;
    `);
  });

  describe('Department Management', () => {
    test('Create department successfully', async () => {
      const res = await request(app)
        .post('/api/admin/departments')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({ departmentName: 'Marketing', description: 'Marketing Dept' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.department_name).toBe('Marketing');
    });

    test('Create department fails - Duplicate name (409 Conflict)', async () => {
      const res = await request(app)
        .post('/api/admin/departments')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({ departmentName: 'IT_DEP', description: 'Duplicate name' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    test('Update department details', async () => {
      const res = await request(app)
        .put(`/api/admin/departments/${testDepartmentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({ departmentName: 'IT_DEP_UPDATED', description: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.data.department_name).toBe('IT_DEP_UPDATED');
    });

    test('Lock department (Deactivate empty department)', async () => {
      // Must use an empty department since IT_DEP has employees active, deactivating it will throw Conflict.
      const newDeptRes = await dbClient.query(`
        INSERT INTO public.departments (department_name, description, status)
        VALUES ('EMPTY_DEP', 'Empty Department', 1)
        RETURNING department_id
      `);
      const emptyDeptId = newDeptRes.rows[0].department_id;

      const res = await request(app)
        .patch(`/api/admin/departments/${emptyDeptId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({ status: 0 });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(0);
    });

    test('Department Pagination & Search', async () => {
      const res = await request(app)
        .get('/api/admin/departments?page=1&limit=5&keyword=IT_DEP')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
    });
  });

  describe('Employee Management', () => {
    test('Create Employee with Account successfully', async () => {
      const res = await request(app)
        .post('/api/admin/employees/with-account')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({
          employee: {
            employeeCode: 'EMP002',
            fullName: 'Jane Smith',
            email: 'jane@example.com',
            phone: '0987654321',
            departmentId: parseInt(testDepartmentId, 10),
          },
          account: {
            username: 'janesmith',
            password: 'password123',
            roleId: parseInt(testRoleIdEmployee, 10),
          }
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.employeeCode).toBe('EMP002');
      expect(res.body.data.account.username).toBe('janesmith');
    });

    test('Create Employee with Account Transaction Rollback when Account Fails', async () => {
      // Username 'adminuser' is already taken. Creating employee with this username should fail and rollback employee creation.
      const res = await request(app)
        .post('/api/admin/employees/with-account')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({
          employee: {
            employeeCode: 'EMP003',
            fullName: 'Rollback test',
            email: 'rollback@example.com',
            phone: '0987654322',
            departmentId: parseInt(testDepartmentId, 10),
          },
          account: {
            username: 'adminuser', // DUPLICATE USERNAME
            password: 'password123',
            roleId: parseInt(testRoleIdEmployee, 10),
          }
        });

      expect(res.status).toBe(409);

      // Verify EMP003 employee was NOT created in DB (rolled back)
      const empCheck = await dbClient.query('SELECT * FROM public.employees WHERE employee_code = $1', ['EMP003']);
      expect(empCheck.rows.length).toBe(0);
    });

    test('Create Employee Fails - Duplicate Code (409 Conflict)', async () => {
      const res = await request(app)
        .post('/api/admin/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({
          employeeCode: 'EMP100', // DUPLICATE CODE
          fullName: 'Dupe Subject',
          email: 'dupe@example.com',
          phone: '0123456782',
          departmentId: parseInt(testDepartmentId, 10)
        });

      expect(res.status).toBe(409);
    });

    test('Create Employee Fails - Duplicate Email (409 Conflict)', async () => {
      const res = await request(app)
        .post('/api/admin/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({
          employeeCode: 'EMP101',
          fullName: 'Dupe Email',
          email: 'subject@example.com', // DUPLICATE EMAIL
          phone: '0123456782',
          departmentId: parseInt(testDepartmentId, 10)
        });

      expect(res.status).toBe(409);
    });

    test('Create Employee Fails - Invalid Department ID (404 Not Found)', async () => {
      const res = await request(app)
        .post('/api/admin/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({
          employeeCode: 'EMP102',
          fullName: 'Bad Dept',
          email: 'baddept@example.com',
          phone: '0123456782',
          departmentId: 9999 // INVALID DEPT ID
        });

      expect(res.status).toBe(404);
    });

    test('Lock employee (Deactivate)', async () => {
      const res = await request(app)
        .patch(`/api/admin/employees/${testEmployeeId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({ status: 0 });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(0);
    });

    test('Update employee info', async () => {
      const res = await request(app)
        .put(`/api/admin/employees/${testEmployeeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({
          fullName: 'Test Subject Updated',
          email: 'subject_updated@example.com',
          phone: '0987654321',
          departmentId: parseInt(testDepartmentId, 10)
        });

      expect(res.status).toBe(200);
      expect(res.body.data.full_name).toBe('Test Subject Updated');
    });

    test('Employee Pagination & Filtering', async () => {
      const res = await request(app)
        .get(`/api/admin/employees?page=1&limit=5&departmentId=${testDepartmentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(2); // Admin user and test subject
    });
  });

  describe('Account Management', () => {
    let targetAccountId;

    beforeEach(async () => {
      const acc = await dbClient.query(`
        INSERT INTO public.accounts (employee_id, username, password_hash, role_id, is_active)
        VALUES ($1, 'subjectuser', $2, $3, 1)
        RETURNING account_id
      `, [testEmployeeId, hashedPassword, testRoleIdEmployee]);
      targetAccountId = acc.rows[0].account_id;
    });

    test('Create account fails - Duplicate username (409)', async () => {
      // Creating another account with 'subjectuser' username
      const anotherEmp = await dbClient.query(`
        INSERT INTO public.employees (employee_code, full_name, email, phone, department_id, status)
        VALUES ('EMP105', 'Another', 'another@example.com', '0123456788', $1, 1)
        RETURNING employee_id
      `, [testDepartmentId]);

      const res = await request(app)
        .post(`/api/admin/employees/${anotherEmp.rows[0].employee_id}/account`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({
          username: 'subjectuser', // DUPLICATE
          password: 'password123',
          roleId: parseInt(testRoleIdEmployee, 10)
        });

      expect(res.status).toBe(409);
    });

    test('Change account role', async () => {
      const res = await request(app)
        .patch(`/api/admin/accounts/${targetAccountId}/role`)
        .set('Authorization', `Bearer ${supToken}`)
        .set('x-device-fingerprint', supFingerprint)
        .send({ roleId: parseInt(testRoleIdAdmin, 10) });

      expect(res.status).toBe(200);
      expect(parseInt(res.body.data.roleId, 10)).toBe(parseInt(testRoleIdAdmin, 10));
    });

    test('Lock/Unlock account & Session Revoke', async () => {
      // Lock account
      const resLock = await request(app)
        .patch(`/api/admin/accounts/${targetAccountId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({ isActive: 0 });

      expect(resLock.status).toBe(200);
      expect(resLock.body.data.is_active).toBe(0);

      // Unlock account
      const resUnlock = await request(app)
        .patch(`/api/admin/accounts/${targetAccountId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({ isActive: 1 });

      expect(resUnlock.status).toBe(200);
      expect(resUnlock.body.data.is_active).toBe(1);
    });

    test('Reset Password', async () => {
      const res = await request(app)
        .patch(`/api/admin/accounts/${targetAccountId}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({ newPassword: 'newpassword123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify password was updated
      const acc = await dbClient.query('SELECT password_hash FROM public.accounts WHERE account_id = $1', [targetAccountId]);
      const match = await bcrypt.compare('newpassword123', acc.rows[0].password_hash);
      expect(match).toBe(true);
    });

    test('Last Admin Protection - Prevent deactivating or changing role of the last admin (422)', async () => {
      // Find the admin user account_id (which is adminuser)
      const adminAcc = await dbClient.query("SELECT account_id FROM public.accounts WHERE username = 'adminuser'");
      const adminAccId = adminAcc.rows[0].account_id;

      // Attempt to deactivate the last admin
      const resDeactivate = await request(app)
        .patch(`/api/admin/accounts/${adminAccId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({ isActive: 0 });

      expect(resDeactivate.status).toBe(422);
      expect(resDeactivate.body.message).toContain('Không thể khóa tài khoản ADMIN duy nhất còn hoạt động');

      // Attempt to change role of the last admin
      const resRoleChange = await request(app)
        .patch(`/api/admin/accounts/${adminAccId}/role`)
        .set('Authorization', `Bearer ${supToken}`)
        .set('x-device-fingerprint', supFingerprint)
        .send({ roleId: parseInt(testRoleIdEmployee, 10) });

      expect(resRoleChange.status).toBe(422);
      expect(resRoleChange.body.message).toContain('Không thể hạ quyền tài khoản ADMIN duy nhất còn hoạt động');
    });
  });

  describe('Work Location Management', () => {
    test('Create work location successfully', async () => {
      const res = await request(app)
        .post('/api/admin/work-locations')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({
          locationName: 'Da Nang Office',
          address: 'Hai Chau, Da Nang',
          latitude: 16.0544,
          longitude: 108.2022,
          allowedRadiusMeter: 150
        });

      expect(res.status).toBe(201);
      expect(res.body.data.locationName).toBe('Da Nang Office');
    });

    test('Create work location fails - Invalid coordinates', async () => {
      const res = await request(app)
        .post('/api/admin/work-locations')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({
          locationName: 'Bad GPS',
          address: 'Space',
          latitude: 95.0, // Out of bounds
          longitude: 108.2022,
          allowedRadiusMeter: 150
        });

      expect(res.status).toBe(400);
    });

    test('Create work location fails - Invalid radius', async () => {
      const res = await request(app)
        .post('/api/admin/work-locations')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({
          locationName: 'Negative Radius',
          address: 'Somewhere',
          latitude: 16.0544,
          longitude: 108.2022,
          allowedRadiusMeter: -50 // Negative
        });

      expect(res.status).toBe(400);
    });

    test('Update work location & Lock status', async () => {
      const res = await request(app)
        .put(`/api/admin/work-locations/${testLocationId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({
          locationName: 'HCM Office Updated',
          address: 'District 3, HCMC',
          latitude: 10.7712,
          longitude: 106.6704,
          allowedRadiusMeter: 120
        });

      expect(res.status).toBe(200);
      expect(res.body.data.locationName).toBe('HCM Office Updated');

      // Lock location
      const resLock = await request(app)
        .patch(`/api/admin/work-locations/${testLocationId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({ status: 0 });

      expect(resLock.status).toBe(200);
      expect(resLock.body.data.status).toBe(0);
    });
  });

  describe('Employee Work Assignment', () => {
    test('Create assignment successfully', async () => {
      // Find shift HC
      const shiftHC = await dbClient.query("SELECT shift_id FROM public.work_shifts WHERE shift_code = 'HC'");
      const shiftHCId = shiftHC.rows[0].shift_id;

      const res = await request(app)
        .post('/api/admin/assignments')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({
          employeeId: parseInt(testEmployeeId, 10),
          locationId: parseInt(testLocationId, 10),
          shiftId: parseInt(shiftHCId, 10),
          workDate: new Date().toISOString().substring(0, 10),
          note: 'Assigned HC Shift'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(parseInt(res.body.data.employee.employeeId, 10)).toBe(parseInt(testEmployeeId, 10));
    });

    test('Create duplicate assignment on same date fails (409)', async () => {
      const shiftHC = await dbClient.query("SELECT shift_id FROM public.work_shifts WHERE shift_code = 'HC'");
      const shiftHCId = shiftHC.rows[0].shift_id;
      const todayStr = new Date().toISOString().substring(0, 10);

      // Create 1st
      await dbClient.query(`
        INSERT INTO public.employee_work_assignments (employee_id, location_id, shift_id, work_date, status)
        VALUES ($1, $2, $3, $4, 'ASSIGNED')
      `, [testEmployeeId, testLocationId, shiftHCId, todayStr]);

      // Attempt 2nd
      const res = await request(app)
        .post('/api/admin/assignments')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({
          employeeId: parseInt(testEmployeeId, 10),
          locationId: parseInt(testLocationId, 10),
          shiftId: parseInt(shiftHCId, 10),
          workDate: todayStr,
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('Nhân viên đã được phân công');
    });

    test('Cancel assignment', async () => {
      const shiftHC = await dbClient.query("SELECT shift_id FROM public.work_shifts WHERE shift_code = 'HC'");
      const shiftHCId = shiftHC.rows[0].shift_id;
      const todayStr = new Date().toISOString().substring(0, 10);

      const assign = await dbClient.query(`
        INSERT INTO public.employee_work_assignments (employee_id, location_id, shift_id, work_date, status)
        VALUES ($1, $2, $3, $4, 'ASSIGNED')
        RETURNING assignment_id
      `, [testEmployeeId, testLocationId, shiftHCId, todayStr]);

      const res = await request(app)
        .patch(`/api/admin/assignments/${assign.rows[0].assignment_id}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-device-fingerprint', adminFingerprint)
        .send({ reason: 'Nhân viên xin nghỉ phép có lý do' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CANCELLED');
    });
  });
});
