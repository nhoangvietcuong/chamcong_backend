const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const { hashPassword } = require('../utils/password');

async function resetDatabase() {
  const client = await pool.connect();
  try {
    console.log('====================================================');
    console.log('   BẮT ĐẦU RESET HỆ THỐNG - MÔI TRƯỜNG THỰC TẾ (PRODUCTION)');
    console.log('====================================================\n');

    await client.query('BEGIN');

    // 1. Get all user tables in public schema except roles
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name != 'roles';
    `);

    const tableNames = tablesRes.rows.map(r => `public."${r.table_name}"`);

    if (tableNames.length > 0) {
      console.log(`🧹 Đang làm sạch ${tableNames.length} bảng dữ liệu nghiệp vụ...`);
      const truncateSql = `TRUNCATE TABLE ${tableNames.join(', ')} RESTART IDENTITY CASCADE;`;
      await client.query(truncateSql);
      console.log('✓ Đã làm sạch toàn bộ dữ liệu nghiệp vụ và reset ID tự tăng.');
    }

    // 2. Ensure standard roles exist
    console.log('\n⚙️ Đang đảm bảo cấu trúc Roles cố định...');
    await client.query(`
      INSERT INTO public.roles (role_id, role_name, description)
      VALUES 
        (1, 'SUPMANAGER', 'Quản trị viên tối cao'),
        (2, 'ADMIN', 'Quản trị viên hoặc nhân sự'),
        (3, 'MANAGER', 'Quản lý phòng ban'),
        (4, 'EMPLOYEE', 'Nhân viên sử dụng hệ thống chấm công')
      ON CONFLICT (role_name) DO UPDATE SET 
        description = EXCLUDED.description;
    `);
    console.log('✓ Đã xác nhận các vai trò hệ thống: SUPMANAGER, ADMIN, MANAGER, EMPLOYEE.');

    // 3. Create Root Department
    console.log('\n🏢 Đang khởi tạo Phòng ban Quản trị...');
    const deptRes = await client.query(`
      INSERT INTO public.departments (department_name, description, status)
      VALUES ('Ban Giám Đốc', 'Phòng quản trị hệ thống tối cao', 1)
      RETURNING department_id;
    `);
    const departmentId = deptRes.rows[0].department_id;
    console.log(`✓ Đã tạo phòng ban 'Ban Giám Đốc' (ID: ${departmentId}).`);

    // 4. Create Standard Work Shifts (Ca 1, Ca 2)
    console.log('\n⏰ Đang khởi tạo 2 Ca làm việc tiêu chuẩn...');
    const defaultShifts = [
      { code: 'CA_1', name: 'Ca 1 (08:00 - 17:30)', startTime: '08:00:00', endTime: '17:30:00', minWork: 480 },
      { code: 'CA_2', name: 'Ca 2 (13:30 - 21:30)', startTime: '13:30:00', endTime: '21:30:00', minWork: 480 }
    ];

    for (const shift of defaultShifts) {
      await client.query(`
        INSERT INTO public.work_shifts (shift_code, shift_name, start_time, end_time, late_grace_minutes, early_leave_grace_minutes, minimum_work_minutes, is_active)
        VALUES ($1, $2, $3, $4, 5, 5, $5, 1)
        ON CONFLICT (shift_code) DO UPDATE SET
          shift_name = EXCLUDED.shift_name,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          minimum_work_minutes = EXCLUDED.minimum_work_minutes,
          is_active = 1;
      `, [shift.code, shift.name, shift.startTime, shift.endTime, shift.minWork]);
    }
    await client.query(`
      DELETE FROM public.work_shifts WHERE shift_code NOT IN ('CA_1', 'CA_2');
    `);
    console.log('✓ Đã khởi tạo duy nhất 2 Ca làm việc: Ca 1, Ca 2.');

    // 4. Create Master Employee & SUPMANAGER Account
    console.log('\n👤 Đang tạo tài khoản Quản trị viên tối cao (SUPMANAGER)...');
    const masterPasswordHash = await hashPassword('123456');

    const empRes = await client.query(`
      INSERT INTO public.employees (employee_code, full_name, email, phone, department_id, status)
      VALUES ('SUP001', 'Quản Trị Viên Tối Cao', 'supmanager@chamcong.com', '0900000000', $1, 1)
      RETURNING employee_id;
    `, [departmentId]);
    const masterEmpId = empRes.rows[0].employee_id;

    const roleRes = await client.query(`SELECT role_id FROM public.roles WHERE role_name = 'SUPMANAGER';`);
    const supRoleId = roleRes.rows[0].role_id;

    await client.query(`
      INSERT INTO public.accounts (employee_id, username, password_hash, role_id, is_active, require_password_change)
      VALUES ($1, 'supmanager', $2, $3, 1, false);
    `, [masterEmpId, masterPasswordHash, supRoleId]);

    console.log('✓ Đã khởi tạo thành công tài khoản master SUPMANAGER:');
    console.log('   - Tên đăng nhập: supmanager');
    console.log('   - Mật khẩu: 123456');
    console.log('   - Vai trò: SUPMANAGER');

    await client.query('COMMIT');

    // 5. Clean Upload Files
    console.log('\n📁 Đang làm sạch thư mục Uploads...');
    const rootDir = path.resolve(__dirname, '../../');
    const uploadDirs = [
      path.join(rootDir, 'uploads/attendance'),
      path.join(rootDir, 'uploads/avatars'),
      path.join(rootDir, 'uploads/leave')
    ];

    let deletedFilesCount = 0;
    uploadDirs.forEach(dir => {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
          const filePath = path.join(dir, file);
          if (fs.statSync(filePath).isFile() && file !== '.gitkeep') {
            fs.unlinkSync(filePath);
            deletedFilesCount++;
          }
        });
      }
    });
    console.log(`✓ Đã xóa ${deletedFilesCount} file ảnh/tài liệu test trong thư mục uploads.`);

    // 6. Clean Log Files
    console.log('\n📝 Đang làm sạch file Log...');
    const logFiles = [
      path.join(rootDir, 'logs/combined.log'),
      path.join(rootDir, 'logs/error.log')
    ];

    logFiles.forEach(logFile => {
      if (fs.existsSync(logFile)) {
        fs.writeFileSync(logFile, '');
        console.log(`✓ Đã làm sạch file log: ${path.basename(logFile)}`);
      }
    });

    console.log('\n====================================================');
    console.log('   RESET HỆ THỐNG HOÀN TẤT! SẴN SÀNG SỬ DỤNG THỰC TẾ.');
    console.log('====================================================\n');
    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ LỖI TRONG QUÁ TRÌNH RESET HỆ THỐNG:', err);
    process.exit(1);
  } finally {
    client.release();
  }
}

resetDatabase();
