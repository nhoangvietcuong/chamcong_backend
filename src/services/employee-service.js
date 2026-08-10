const employeeRepository = require('../repositories/employee-repository');
const departmentRepository = require('../repositories/department-repository');
const accountRepository = require('../repositories/account-repository');
const roleRepository = require('../repositories/role-repository');
const sessionRepository = require('../repositories/session-repository');
const systemLogRepository = require('../repositories/system-log-repository');
const { getPagination } = require('../utils/pagination');
const { hashPassword, comparePassword } = require('../utils/password');
const { NotFoundError, ConflictError, ValidationError } = require('../errors/app-error');
const ERROR_CODE = require('../constants/error-code.constants');
const SYSTEM_ACTION = require('../constants/system-action.constants');
const { pool } = require('../config/db');

class EmployeeService {
  async getEmployees(queryParams) {
    const page = parseInt(queryParams.page || '1', 10);
    const limit = parseInt(queryParams.limit || '10', 10);
    const { keyword, departmentId, status, hasAccount, role, sortBy, sortOrder } = queryParams;

    const { items, total } = await employeeRepository.findAndCount({
      keyword,
      departmentId,
      status,
      hasAccount,
      role,
      sortBy,
      sortOrder,
      limit,
      offset: (page - 1) * limit
    });

    const pagination = getPagination(page, limit, total);

    return {
      items,
      pagination
    };
  }


  async getEmployeeById(id) {
    const employee = await employeeRepository.findById(id);
    if (!employee) {
      throw new NotFoundError('Không tìm thấy nhân viên', ERROR_CODE.EMPLOYEE_NOT_FOUND);
    }
    return employee;
  }

  async getNextCode(roleName) {
    return await employeeRepository.getNextCode(roleName);
  }

  async createEmployee(data, authContext) {
    const { employeeCode, fullName, email, phone, departmentId } = data;
    const trimmedCode = (employeeCode && employeeCode.trim()) ? employeeCode.trim() : await this.getNextCode();
    const trimmedName = fullName.trim();
    const trimmedEmail = email ? email.trim().toLowerCase() : null;
    const trimmedPhone = phone ? phone.trim() : null;

    // Check duplicate code
    const existingCode = await employeeRepository.findByCode(trimmedCode);
    if (existingCode) {
      throw new ConflictError('Mã nhân viên đã tồn tại', ERROR_CODE.EMPLOYEE_CODE_EXISTS);
    }

    // Check duplicate email
    if (trimmedEmail) {
      const existingEmail = await employeeRepository.findByEmail(trimmedEmail);
      if (existingEmail) {
        throw new ConflictError('Email nhân viên đã tồn tại', ERROR_CODE.EMPLOYEE_EMAIL_EXISTS);
      }
    }

    // Check duplicate phone
    if (trimmedPhone) {
      const existingPhone = await employeeRepository.findByPhone(trimmedPhone);
      if (existingPhone) {
        throw new ConflictError('Số điện thoại nhân viên đã tồn tại', ERROR_CODE.EMPLOYEE_PHONE_EXISTS);
      }
    }

    // Check department
    const dept = await departmentRepository.findById(departmentId);
    if (!dept) {
      throw new NotFoundError('Phòng ban không tồn tại', ERROR_CODE.DEPARTMENT_NOT_FOUND);
    }
    if (parseInt(dept.status, 10) !== 1) {
      throw new ConflictError('Phòng ban đã bị khóa', ERROR_CODE.DEPARTMENT_NOT_FOUND);
    }

    const employee = await employeeRepository.create({
      employeeCode: trimmedCode,
      fullName: trimmedName,
      email: trimmedEmail,
      phone: trimmedPhone,
      departmentId
    });

    await systemLogRepository.createLog({
      employeeId: authContext.employeeId,
      accountId: authContext.accountId,
      action: SYSTEM_ACTION.CREATE_EMPLOYEE,
      description: `Tạo nhân viên: ${trimmedName} (${trimmedCode})`,
      deviceFingerprint: authContext.deviceFingerprint,
      ipAddress: authContext.ipAddress,
      status: 'SUCCESS'
    });

    return employee;
  }

  async createEmployeeWithAccount(data, authContext) {
    const { employee: empData, account: accData } = data;

    const trimmedCode = (empData.employeeCode && empData.employeeCode.trim()) ? empData.employeeCode.trim() : await this.getNextCode();
    const trimmedName = empData.fullName.trim();
    const trimmedEmail = empData.email ? empData.email.trim().toLowerCase() : null;
    const trimmedPhone = empData.phone ? empData.phone.trim() : null;

    const trimmedUsername = accData.username.trim().toLowerCase();
    const { password, roleId } = accData;

    // Check duplicates before starting transaction
    const existingCode = await employeeRepository.findByCode(trimmedCode);
    if (existingCode) {
      throw new ConflictError('Mã nhân viên đã tồn tại', ERROR_CODE.EMPLOYEE_CODE_EXISTS);
    }

    if (trimmedEmail) {
      const existingEmail = await employeeRepository.findByEmail(trimmedEmail);
      if (existingEmail) {
        throw new ConflictError('Email nhân viên đã tồn tại', ERROR_CODE.EMPLOYEE_EMAIL_EXISTS);
      }
    }

    if (trimmedPhone) {
      const existingPhone = await employeeRepository.findByPhone(trimmedPhone);
      if (existingPhone) {
        throw new ConflictError('Số điện thoại nhân viên đã tồn tại', ERROR_CODE.EMPLOYEE_PHONE_EXISTS);
      }
    }

    const dept = await departmentRepository.findById(empData.departmentId);
    if (!dept) {
      throw new NotFoundError('Phòng ban không tồn tại', ERROR_CODE.DEPARTMENT_NOT_FOUND);
    }
    if (parseInt(dept.status, 10) !== 1) {
      throw new ConflictError('Phòng ban đã bị khóa', ERROR_CODE.DEPARTMENT_NOT_FOUND);
    }

    const existingUser = await accountRepository.findByUsername(trimmedUsername);
    if (existingUser) {
      throw new ConflictError('Tên đăng nhập đã tồn tại', ERROR_CODE.USERNAME_EXISTS);
    }

    const role = await roleRepository.findById(roleId);
    if (!role) {
      throw new NotFoundError('Vai trò không tồn tại', ERROR_CODE.ROLE_NOT_FOUND);
    }

    // Role Hierarchy Rule: Performer cannot create account with higher or equal role (except SUPMANAGER)
    const ROLE = require('../constants/role.constants');
    const { ROLE_LEVEL } = ROLE;
    const { ForbiddenError } = require('../errors/app-error');

    const performerRole = authContext.role;
    const performerLevel = ROLE_LEVEL[performerRole] || 0;
    const targetLevel = ROLE_LEVEL[role.roleName] || 0;

    if (performerLevel < targetLevel) {
      throw new ForbiddenError('Không thể tạo tài khoản có vai trò cao hơn vai trò hiện tại của bạn', ERROR_CODE.FORBIDDEN);
    }
    if (performerLevel === targetLevel && performerRole !== ROLE.SUPMANAGER) {
      throw new ForbiddenError('Không thể tạo tài khoản có vai trò cùng cấp với vai trò hiện tại của bạn', ERROR_CODE.FORBIDDEN);
    }

    // Connect database client for transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Create employee
      const employee = await employeeRepository.create({
        employeeCode: trimmedCode,
        fullName: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone,
        departmentId: empData.departmentId
      }, client);

      // 2. Hash password & Create account
      const passwordHash = await hashPassword(password);
      const account = await accountRepository.create({
        employeeId: employee.employee_id,
        username: trimmedUsername,
        passwordHash,
        roleId
      }, client);

      // 3. Write logs
      await systemLogRepository.createLog({
        employeeId: authContext.employeeId,
        accountId: authContext.accountId,
        action: SYSTEM_ACTION.CREATE_EMPLOYEE,
        description: `Tạo nhân viên (kèm tài khoản): ${trimmedName} (${trimmedCode})`,
        deviceFingerprint: authContext.deviceFingerprint,
        ipAddress: authContext.ipAddress,
        status: 'SUCCESS'
      }, client);

      await systemLogRepository.createLog({
        employeeId: authContext.employeeId,
        accountId: authContext.accountId,
        action: SYSTEM_ACTION.CREATE_ACCOUNT,
        description: `Tạo tài khoản cho nhân viên: ${trimmedUsername}`,
        deviceFingerprint: authContext.deviceFingerprint,
        ipAddress: authContext.ipAddress,
        status: 'SUCCESS'
      }, client);

      await client.query('COMMIT');

      return {
        employeeId: parseInt(employee.employee_id, 10),
        employeeCode: employee.employee_code,
        fullName: employee.full_name,
        email: employee.email,
        phone: employee.phone,
        departmentId: parseInt(employee.department_id, 10),
        status: parseInt(employee.status, 10),
        account: {
          accountId: parseInt(account.account_id, 10),
          username: account.username,
          roleId: parseInt(account.role_id, 10),
          roleName: role.roleName,
          isActive: parseInt(account.is_active, 10)
        }
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateEmployee(id, data, authContext) {
    const { fullName, email, phone, departmentId } = data;
    const trimmedName = fullName.trim();
    const trimmedEmail = email ? email.trim().toLowerCase() : null;
    const trimmedPhone = phone ? phone.trim() : null;

    const employee = await employeeRepository.findById(id);
    if (!employee) {
      throw new NotFoundError('Không tìm thấy nhân viên', ERROR_CODE.EMPLOYEE_NOT_FOUND);
    }

    // Role Hierarchy: Check if performer has rights to modify this employee
    const ROLE = require('../constants/role.constants');
    const { ROLE_LEVEL } = ROLE;
    const { ForbiddenError } = require('../errors/app-error');

    if (employee.account) {
      const performerRole = authContext.role;
      const performerLevel = ROLE_LEVEL[performerRole] || 0;
      const targetRole = employee.account.role;
      const targetLevel = ROLE_LEVEL[targetRole] || 0;

      if (performerLevel < targetLevel) {
        throw new ForbiddenError('Không có quyền thao tác lên nhân viên có vai trò cấp cao hơn', ERROR_CODE.FORBIDDEN);
      }
      if (performerLevel === targetLevel && performerRole !== ROLE.SUPMANAGER) {
        throw new ForbiddenError('Không có quyền thao tác lên nhân viên có vai trò cùng cấp', ERROR_CODE.FORBIDDEN);
      }
    }

    if (trimmedEmail) {
      const existingEmail = await employeeRepository.findByEmail(trimmedEmail);
      if (existingEmail && parseInt(existingEmail.employee_id, 10) !== parseInt(id, 10)) {
        throw new ConflictError('Email nhân viên đã tồn tại', ERROR_CODE.EMPLOYEE_EMAIL_EXISTS);
      }
    }

    if (trimmedPhone) {
      const existingPhone = await employeeRepository.findByPhone(trimmedPhone);
      if (existingPhone && parseInt(existingPhone.employee_id, 10) !== parseInt(id, 10)) {
        throw new ConflictError('Số điện thoại nhân viên đã tồn tại', ERROR_CODE.EMPLOYEE_PHONE_EXISTS);
      }
    }

    const dept = await departmentRepository.findById(departmentId);
    if (!dept) {
      throw new NotFoundError('Phòng ban không tồn tại', ERROR_CODE.DEPARTMENT_NOT_FOUND);
    }
    if (parseInt(dept.status, 10) !== 1) {
      throw new ConflictError('Phòng ban đã bị khóa', ERROR_CODE.DEPARTMENT_NOT_FOUND);
    }

    const updatedEmp = await employeeRepository.update(id, {
      fullName: trimmedName,
      email: trimmedEmail,
      phone: trimmedPhone,
      departmentId
    });

    await systemLogRepository.createLog({
      employeeId: authContext.employeeId,
      accountId: authContext.accountId,
      action: SYSTEM_ACTION.UPDATE_EMPLOYEE,
      description: `Cập nhật thông tin nhân viên ID ${id}`,
      deviceFingerprint: authContext.deviceFingerprint,
      ipAddress: authContext.ipAddress,
      status: 'SUCCESS'
    });

    return updatedEmp;
  }

  async updateEmployeeStatus(id, status, authContext) {
    const employee = await employeeRepository.findById(id);
    if (!employee) {
      throw new NotFoundError('Không tìm thấy nhân viên', ERROR_CODE.EMPLOYEE_NOT_FOUND);
    }

    // Role Hierarchy: Check if performer has rights to modify this employee
    const ROLE = require('../constants/role.constants');
    const { ROLE_LEVEL } = ROLE;
    const { ForbiddenError } = require('../errors/app-error');

    if (employee.account) {
      const performerRole = authContext.role;
      const performerLevel = ROLE_LEVEL[performerRole] || 0;
      const targetRole = employee.account.role;
      const targetLevel = ROLE_LEVEL[targetRole] || 0;

      if (performerLevel < targetLevel) {
        throw new ForbiddenError('Không có quyền thay đổi trạng thái nhân viên có vai trò cấp cao hơn', ERROR_CODE.FORBIDDEN);
      }
      if (performerLevel === targetLevel && performerRole !== ROLE.SUPMANAGER) {
        throw new ForbiddenError('Không có quyền thay đổi trạng thái nhân viên có vai trò cùng cấp', ERROR_CODE.FORBIDDEN);
      }
    }

    const currentStatus = parseInt(employee.status, 10);
    const newStatus = parseInt(status, 10);

    if (currentStatus === newStatus) {
      return employee;
    }

    if (newStatus === 0) {
      // Transaction to deactivate employee, account, and revoke sessions
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Check if employee has a linked account
        if (employee.account) {
          // Verify we aren't deactivating the last active Admin account
          if (employee.account.role === 'ADMIN' && employee.account.isActive === 1) {
            const activeAdmins = await accountRepository.countActiveAdmins(client);
            if (activeAdmins <= 1) {
              throw new ValidationError(
                'Không thể khóa tài khoản ADMIN duy nhất còn hoạt động',
                ERROR_CODE.LAST_ADMIN_ACCOUNT
              );
            }
          }

          // Verify we aren't deactivating the last active SUPMANAGER account
          if (employee.account.role === 'SUPMANAGER' && employee.account.isActive === 1) {
            const activeSups = await accountRepository.countActiveSupmanagers(client);
            if (activeSups <= 1) {
              throw new ValidationError(
                'Không thể khóa tài khoản SUPMANAGER duy nhất còn hoạt động',
                ERROR_CODE.FORBIDDEN
              );
            }
          }

          // Deactivate account
          await accountRepository.updateStatus(employee.account.accountId, 0, client);
          // Revoke sessions
          await sessionRepository.revokeSessionsByAccountId(employee.account.accountId, client);
        }

        // Deactivate employee
        await employeeRepository.updateStatus(id, 0, client);

        await systemLogRepository.createLog({
          employeeId: authContext.employeeId,
          accountId: authContext.accountId,
          action: SYSTEM_ACTION.DEACTIVATE_EMPLOYEE,
          description: `Khóa nhân viên: ${employee.fullName} (${employee.employeeCode})`,
          deviceFingerprint: authContext.deviceFingerprint,
          ipAddress: authContext.ipAddress,
          status: 'SUCCESS'
        }, client);

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      // Re-activating employee: also auto-activate account
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await employeeRepository.updateStatus(id, 1, client);

        if (employee.account) {
          await accountRepository.updateStatus(employee.account.accountId, 1, client);
        }

        await systemLogRepository.createLog({
          employeeId: authContext.employeeId,
          accountId: authContext.accountId,
          action: SYSTEM_ACTION.ACTIVATE_EMPLOYEE,
          description: `Mở khóa nhân viên: ${employee.fullName} (${employee.employeeCode})`,
          deviceFingerprint: authContext.deviceFingerprint,
          ipAddress: authContext.ipAddress,
          status: 'SUCCESS'
        }, client);

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    return employeeRepository.findById(id);
  }

  async updateSelfProfile(employeeId, data) {
    const { email, phone } = data;
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();

    const existingEmail = await employeeRepository.findByEmail(trimmedEmail);
    if (existingEmail && parseInt(existingEmail.employee_id, 10) !== parseInt(employeeId, 10)) {
      throw new ConflictError('Email này đã được sử dụng bởi nhân viên khác', ERROR_CODE.EMPLOYEE_EMAIL_EXISTS);
    }

    await employeeRepository.updateSelfProfile(employeeId, { email: trimmedEmail, phone: trimmedPhone });
    return employeeRepository.findById(employeeId);
  }

  async updateSelfPassword(accountId, oldPassword, newPassword) {
    const passwordHash = await accountRepository.getPasswordHashById(accountId);
    if (!passwordHash) {
      throw new NotFoundError('Tài khoản không tồn tại', ERROR_CODE.INVALID_CREDENTIALS);
    }

    const isMatch = await comparePassword(oldPassword, passwordHash);
    if (!isMatch) {
      throw new ValidationError('Mật khẩu cũ không chính xác', ERROR_CODE.INVALID_CREDENTIALS);
    }

    const newHash = await hashPassword(newPassword);
    await accountRepository.resetPassword(accountId, newHash, false);
  }

  async updateSelfAvatar(employeeId, avatarUrl) {
    await employeeRepository.updateAvatarUrl(employeeId, avatarUrl);
    return employeeRepository.findById(employeeId);
  }

  async bulkDeleteEmployees(employeeIds) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Delete dependent records
      await client.query('DELETE FROM face_profiles WHERE employee_id = ANY($1::int[])', [employeeIds]);
      await client.query('DELETE FROM user_sessions WHERE account_id IN (SELECT account_id FROM accounts WHERE employee_id = ANY($1::int[]))', [employeeIds]);
      await client.query('DELETE FROM webauthn_credentials WHERE account_id IN (SELECT account_id FROM accounts WHERE employee_id = ANY($1::int[]))', [employeeIds]);
      
      await client.query('DELETE FROM attendance WHERE employee_id = ANY($1::int[])', [employeeIds]);
      await client.query('DELETE FROM employee_work_assignments WHERE employee_id = ANY($1::int[])', [employeeIds]);
      await client.query('DELETE FROM leave_requests WHERE employee_id = ANY($1::int[])', [employeeIds]);
      await client.query('DELETE FROM overtime_requests WHERE employee_id = ANY($1::int[])', [employeeIds]);
      
      // Delete system logs related to these accounts or employees
      await client.query('DELETE FROM system_logs WHERE employee_id = ANY($1::int[]) OR account_id IN (SELECT account_id FROM accounts WHERE employee_id = ANY($1::int[]))', [employeeIds]);

      await client.query('DELETE FROM accounts WHERE employee_id = ANY($1::int[])', [employeeIds]);
      
      const result = await client.query('DELETE FROM employees WHERE employee_id = ANY($1::int[])', [employeeIds]);
      
      await client.query('COMMIT');
      return result.rowCount;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new EmployeeService();
