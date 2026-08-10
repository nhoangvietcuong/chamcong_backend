const request = require('supertest');
const app = require('../app');
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');

async function setupTestData() {
  const dbClient = await pool.connect();
  try {
    // Check if HR department exists
    const deptCheck = await dbClient.query("SELECT department_id FROM public.departments WHERE department_name = 'HR' LIMIT 1");
    let deptId;
    if (deptCheck.rows.length > 0) {
      deptId = deptCheck.rows[0].department_id;
    } else {
      const deptRes = await dbClient.query(`
        INSERT INTO public.departments (department_name, description, status)
        VALUES ('HR', 'Human Resources', 1)
        RETURNING department_id
      `);
      deptId = deptRes.rows[0].department_id;
    }

    // Check if employee EMP999 exists
    const empCheck = await dbClient.query("SELECT employee_id FROM public.employees WHERE employee_code = 'EMP999' LIMIT 1");
    let empId;
    if (empCheck.rows.length > 0) {
      empId = empCheck.rows[0].employee_id;
    } else {
      const empRes = await dbClient.query(`
        INSERT INTO public.employees (employee_code, full_name, email, phone, department_id, status)
        VALUES ('EMP999', 'Performance User', 'perf.user@example.com', '0999999999', $1, 1)
        RETURNING employee_id
      `, [deptId]);
      empId = empRes.rows[0].employee_id;

      const hashedPassword = await bcrypt.hash('password123', 12);
      const roleRes = await dbClient.query("SELECT role_id FROM public.roles WHERE role_name = 'EMPLOYEE' LIMIT 1");
      const roleId = roleRes.rows[0].role_id;

      await dbClient.query(`
        INSERT INTO public.accounts (employee_id, username, password_hash, role_id, is_active)
        VALUES ($1, 'perfuser', $2, $3, 1)
      `, [empId, hashedPassword, roleId]);
    }
  } finally {
    dbClient.release();
  }
}

async function runPerformanceTest() {
  console.log('--------------------------------------------------');
  console.log('🚀 Starting Concurrency Performance Benchmark (supertest)...');
  console.log('--------------------------------------------------');

  console.log('Seeding performance test accounts...');
  await setupTestData();

  console.log('Authenticating test user...');
  let token;
  const loginRes = await request(app)
    .post('/api/auth/login')
    .set('x-device-fingerprint', 'fingerprint_perf_test')
    .send({
      username: 'perfuser',
      password: 'password123'
    });

  if (loginRes.status !== 200) {
    console.error('❌ Failed to authenticate:', loginRes.body);
    process.exit(1);
  }
  token = loginRes.body.data.accessToken;
  console.log('Authentication successful.');

  const CONCURRENT_REQUESTS = 50;
  console.log(`Sending ${CONCURRENT_REQUESTS} concurrent GET /api/attendance/today requests...`);

  const startTime = Date.now();
  const requests = Array.from({ length: CONCURRENT_REQUESTS }).map(async (_, idx) => {
    const reqStart = Date.now();
    try {
      const res = await request(app)
        .get('/api/attendance/today')
        .set('Authorization', `Bearer ${token}`)
        .set('x-device-fingerprint', 'fingerprint_perf_test');
      return { success: res.status === 200, latency: Date.now() - reqStart };
    } catch (err) {
      return { success: false, latency: Date.now() - reqStart, error: err.message };
    }
  });

  const results = await Promise.all(requests);
  const totalDuration = Date.now() - startTime;

  const successfulReqs = results.filter(r => r.success);
  const failedReqs = results.filter(r => !r.success);
  const latencies = results.map(r => r.latency);

  const avgLatency = latencies.reduce((sum, val) => sum + val, 0) / CONCURRENT_REQUESTS;
  const minLatency = Math.min(...latencies);
  const maxLatency = Math.max(...latencies);
  const throughput = (CONCURRENT_REQUESTS / (totalDuration / 1000)).toFixed(2);

  console.log('\n--------------------------------------------------');
  console.log('📊 BENCHMARK SUMMARY REPORT');
  console.log('--------------------------------------------------');
  console.log(`Total Requests:      ${CONCURRENT_REQUESTS}`);
  console.log(`Success Rate:        ${((successfulReqs.length / CONCURRENT_REQUESTS) * 100).toFixed(2)}% (${successfulReqs.length} ok, ${failedReqs.length} failed)`);
  console.log(`Total Duration:      ${totalDuration} ms`);
  console.log(`Throughput:          ${throughput} reqs/sec`);
  console.log(`Min Latency:         ${minLatency} ms`);
  console.log(`Max Latency:         ${maxLatency} ms`);
  console.log(`Average Latency:     ${avgLatency.toFixed(2)} ms`);
  console.log('--------------------------------------------------\n');

  if (failedReqs.length > 0) {
    console.warn(`⚠️ Warning: ${failedReqs.length} requests failed. Sample error:`, failedReqs[0].error);
  }

  await pool.end();
}

runPerformanceTest().catch(err => {
  console.error('Fatal error during performance run:', err);
  pool.end();
});
