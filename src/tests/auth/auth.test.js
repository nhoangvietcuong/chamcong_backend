const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../config/db');
const { cleanAllTables } = require('../setup');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

describe('Authentication & Session Management Integration Tests', () => {
  let dbClient;
  let testDepartmentId;
  let testRoleIdAdmin, testRoleIdManager, testRoleIdEmployee;
  let hashedPassword;

  beforeAll(async () => {
    dbClient = await pool.connect();
    const rolesRes = await dbClient.query('SELECT role_id, role_name FROM public.roles');
    testRoleIdAdmin = rolesRes.rows.find(r => r.role_name === 'ADMIN').role_id;
    testRoleIdManager = rolesRes.rows.find(r => r.role_name === 'MANAGER').role_id;
    testRoleIdEmployee = rolesRes.rows.find(r => r.role_name === 'EMPLOYEE').role_id;
    hashedPassword = await bcrypt.hash('password123', 12);
  });

  afterAll(async () => {
    dbClient.release();
  });

  beforeEach(async () => {
    await cleanAllTables(dbClient);
    
    // Seed department
    const deptRes = await dbClient.query(`
      INSERT INTO public.departments (department_name, description, status)
      VALUES ('IT', 'Information Technology', 1)
      RETURNING department_id
    `);
    testDepartmentId = deptRes.rows[0].department_id;
  });

  const createTestUser = async (username, roleId, status = 1, isActive = 1) => {
    const empRes = await dbClient.query(`
      INSERT INTO public.employees (employee_code, full_name, email, phone, department_id, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING employee_id
    `, ['EMP_' + username, 'Test Employee ' + username, username + '@example.com', '0123456789', testDepartmentId, status]);
    const empId = empRes.rows[0].employee_id;

    const accRes = await dbClient.query(`
      INSERT INTO public.accounts (employee_id, username, password_hash, role_id, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING account_id
    `, [empId, username, hashedPassword, roleId, isActive]);
    
    return { employeeId: empId, accountId: accRes.rows[0].account_id };
  };

  test('1. Login đúng (Successful Login)', async () => {
    await createTestUser('johndoe', testRoleIdEmployee);

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'johndoe',
        password: 'password123',
      })
      .set('x-device-fingerprint', 'fingerprint_test_1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
  });

  test('2. Sai Username', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'nonexistent',
        password: 'password123',
      })
      .set('x-device-fingerprint', 'fingerprint_test_1');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('3. Sai Password', async () => {
    await createTestUser('johndoe', testRoleIdEmployee);

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'johndoe',
        password: 'wrongpassword',
      })
      .set('x-device-fingerprint', 'fingerprint_test_1');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('4. Account Lock (is_active = 0)', async () => {
    await createTestUser('lockeduser', testRoleIdEmployee, 1, 0);

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'lockeduser',
        password: 'password123',
      })
      .set('x-device-fingerprint', 'fingerprint_test_1');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Tài khoản đã bị vô hiệu hóa');
  });

  test('5. Employee Lock (employee.status = 0)', async () => {
    await createTestUser('lockedemp', testRoleIdEmployee, 0, 1);

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'lockedemp',
        password: 'password123',
      })
      .set('x-device-fingerprint', 'fingerprint_test_1');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Nhân viên đã ngừng hoạt động');
  });

  test('6. Thiếu Fingerprint (Authenticating APIs)', async () => {
    const { employeeId } = await createTestUser('emp', testRoleIdEmployee);
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'emp', password: 'password123' })
      .set('x-device-fingerprint', 'fingerprint_test_1');
    
    const accessToken = loginRes.body.data.accessToken;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`); // Missing x-device-fingerprint

    expect(meRes.status).toBe(401);
    expect(meRes.body.success).toBe(false);
    expect(meRes.body.message).toContain('Thiết bị không khớp');
  });

  test('7. Fingerprint sai', async () => {
    const { employeeId } = await createTestUser('emp', testRoleIdEmployee);
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'emp', password: 'password123' })
      .set('x-device-fingerprint', 'fingerprint_test_1');
    
    const accessToken = loginRes.body.data.accessToken;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-device-fingerprint', 'wrong_fingerprint'); // Wrong fingerprint

    expect(meRes.status).toBe(401);
    expect(meRes.body.success).toBe(false);
  });

  test('8. Session ACTIVE check', async () => {
    const { accountId } = await createTestUser('emp', testRoleIdEmployee);
    await request(app)
      .post('/api/auth/login')
      .send({ username: 'emp', password: 'password123' })
      .set('x-device-fingerprint', 'fingerprint_test_1');

    const sessions = await dbClient.query('SELECT * FROM public.user_sessions WHERE account_id = $1', [accountId]);
    expect(sessions.rows.length).toBe(1);
    expect(sessions.rows[0].session_status).toBe('ACTIVE');
  });

  test('9. Login lần hai (Revokes existing active session)', async () => {
    const { accountId } = await createTestUser('emp', testRoleIdEmployee);
    
    // Login 1
    await request(app)
      .post('/api/auth/login')
      .send({ username: 'emp', password: 'password123' })
      .set('x-device-fingerprint', 'fingerprint_test_1');

    // Login 2
    await request(app)
      .post('/api/auth/login')
      .send({ username: 'emp', password: 'password123' })
      .set('x-device-fingerprint', 'fingerprint_test_2');

    const sessions = await dbClient.query('SELECT * FROM public.user_sessions WHERE account_id = $1 ORDER BY created_at ASC', [accountId]);
    expect(sessions.rows.length).toBe(2);
    expect(sessions.rows[0].session_status).toBe('REPLACED');
    expect(sessions.rows[1].session_status).toBe('ACTIVE');
  });

  test('10. Session REPLACED verify', async () => {
    const { accountId } = await createTestUser('emp', testRoleIdEmployee);
    
    // Login 1
    const res1 = await request(app)
      .post('/api/auth/login')
      .send({ username: 'emp', password: 'password123' })
      .set('x-device-fingerprint', 'fingerprint_test_1');
    const token1 = res1.body.data.accessToken;

    // Login 2
    await request(app)
      .post('/api/auth/login')
      .send({ username: 'emp', password: 'password123' })
      .set('x-device-fingerprint', 'fingerprint_test_2');

    // Trying to use token1
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token1}`)
      .set('x-device-fingerprint', 'fingerprint_test_1');

    expect(meRes.status).toBe(401);
    expect(meRes.body.message).toContain('Phiên đăng nhập không còn hoạt động');
  });

  test('11. Token cũ vô hiệu', async () => {
    const { accountId } = await createTestUser('emp', testRoleIdEmployee);
    
    // Login 1
    const res1 = await request(app)
      .post('/api/auth/login')
      .send({ username: 'emp', password: 'password123' })
      .set('x-device-fingerprint', 'fingerprint_test_1');
    const token1 = res1.body.data.accessToken;

    // Login 2
    await request(app)
      .post('/api/auth/login')
      .send({ username: 'emp', password: 'password123' })
      .set('x-device-fingerprint', 'fingerprint_test_2');

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token1}`)
      .set('x-device-fingerprint', 'fingerprint_test_1');

    expect(meRes.status).toBe(401);
  });

  test('12. Refresh Token hợp lệ', async () => {
    await createTestUser('emp', testRoleIdEmployee);
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'emp', password: 'password123' })
      .set('x-device-fingerprint', 'fingerprint_test_1');

    const { refreshToken } = loginRes.body.data;

    const refreshRes = await request(app)
      .post('/api/auth/refresh-token')
      .send({
        refreshToken,
        deviceFingerprint: 'fingerprint_test_1',
      });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.success).toBe(true);
    expect(refreshRes.body.data.accessToken).toBeDefined();
  });

  test('13. Refresh Token sai', async () => {
    const refreshRes = await request(app)
      .post('/api/auth/refresh-token')
      .send({
        refreshToken: 'invalid_refresh_token',
        deviceFingerprint: 'fingerprint_test_1',
      });

    expect(refreshRes.status).toBe(401);
    expect(refreshRes.body.success).toBe(false);
  });

  test('14. Refresh Token hết hạn / sai thiết bị', async () => {
    await createTestUser('emp', testRoleIdEmployee);
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'emp', password: 'password123' })
      .set('x-device-fingerprint', 'fingerprint_test_1');

    const { refreshToken } = loginRes.body.data;

    // Call refresh token with different device fingerprint
    const refreshRes = await request(app)
      .post('/api/auth/refresh-token')
      .send({
        refreshToken,
        deviceFingerprint: 'fingerprint_test_different',
      });

    expect(refreshRes.status).toBe(401);
  });

  test('15. Logout (Session status becomes LOGGED_OUT)', async () => {
    const { accountId } = await createTestUser('emp', testRoleIdEmployee);
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'emp', password: 'password123' })
      .set('x-device-fingerprint', 'fingerprint_test_1');

    const token = loginRes.body.data.accessToken;

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .set('x-device-fingerprint', 'fingerprint_test_1');

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    const sessions = await dbClient.query('SELECT * FROM public.user_sessions WHERE account_id = $1', [accountId]);
    expect(sessions.rows[0].session_status).toBe('LOGGED_OUT');
  });

  test('16. Token sau Logout không sử dụng được', async () => {
    await createTestUser('emp', testRoleIdEmployee);
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'emp', password: 'password123' })
      .set('x-device-fingerprint', 'fingerprint_test_1');

    const token = loginRes.body.data.accessToken;

    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .set('x-device-fingerprint', 'fingerprint_test_1');

    // Use token after logout
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .set('x-device-fingerprint', 'fingerprint_test_1');

    expect(meRes.status).toBe(401);
  });

  test('17. Sai Role (Access control)', async () => {
    // Only ADMIN or MANAGER roles are allowed on certain endpoints (e.g. get departments)
    await createTestUser('emp_user', testRoleIdEmployee);
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'emp_user', password: 'password123' })
      .set('x-device-fingerprint', 'fingerprint_test_1');

    const token = loginRes.body.data.accessToken;

    const deptRes = await request(app)
      .get('/api/admin/departments')
      .set('Authorization', `Bearer ${token}`)
      .set('x-device-fingerprint', 'fingerprint_test_1');

    expect(deptRes.status).toBe(403);
  });

  test('18. EMPLOYEE gọi ADMIN API', async () => {
    await createTestUser('emp_user_2', testRoleIdEmployee);
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'emp_user_2', password: 'password123' })
      .set('x-device-fingerprint', 'fingerprint_test_1');

    const token = loginRes.body.data.accessToken;

    const res = await request(app)
      .post('/api/admin/departments')
      .set('Authorization', `Bearer ${token}`)
      .set('x-device-fingerprint', 'fingerprint_test_1')
      .send({ departmentName: 'Failed' });

    expect(res.status).toBe(403);
  });

  test('19. MANAGER gọi ADMIN API', async () => {
    await createTestUser('mgr_user', testRoleIdManager);
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'mgr_user', password: 'password123' })
      .set('x-device-fingerprint', 'fingerprint_test_1');

    const token = loginRes.body.data.accessToken;

    const res = await request(app)
      .post('/api/admin/departments')
      .set('Authorization', `Bearer ${token}`)
      .set('x-device-fingerprint', 'fingerprint_test_1')
      .send({ departmentName: 'Marketing' });

    expect(res.status).toBe(403);
  });

  test('20. Token giả', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer fake_token')
      .set('x-device-fingerprint', 'fingerprint_test_1');

    expect(res.status).toBe(401);
  });
});
