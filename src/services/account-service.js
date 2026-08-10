const accountRepository = require('../repositories/account-repository');
const employeeRepository = require('../repositories/employee-repository');
const roleRepository = require('../repositories/role-repository');
const sessionRepository = require('../repositories/session-repository');
const systemLogRepository = require('../repositories/system-log-repository');
const { hashPassword } = require('../utils/password');
const { NotFoundError, ConflictError, ValidationError } = require('../errors/app-error');
const ERROR_CODE = require('../constants/error-code.constants');
const SYSTEM_ACTION = require('../constants/system-action.constants');
const { pool } = require('../config/db');

class AccountService {
  async createAccount(employeeId, data, authContext) {
    const { username, password, roleId } = data;
    const trimmedUsername = username.trim().toLowerCase();
    const ROLE = require('../constants/role.constants');
    const { ROLE_LEVEL } = ROLE;
    const { ForbiddenError } = require('../errors/app-error');

    // Check employee
    const employee = await employeeRepository.findById(employeeId);
    if (!employee) {
      throw new NotFoundError('Không tìm thấy nhân viên', ERROR_CODE.EMPLOYEE_NOT_FOUND);
    }
    if (parseInt(employee.status, 10) !== 1) {
      throw new ValidationError('Nhân viên đã ngừng hoạt động', ERROR_CODE.EMPLOYEE_INACTIVE);
    }

    // Check if account already exists
    const existingEmpAcc = await accountRepository.findByEmployeeId(employeeId);
    if (existingEmpAcc) {
      throw new ConflictError('Nhân viên đã có tài khoản', ERROR_CODE.ACCOUNT_ALREADY_EXISTS);
    }

    // Check username duplicate
    const existingUser = await accountRepository.findByUsername(trimmedUsername);
    if (existingUser) {
      throw new ConflictError('Tên đăng nhập đã tồn tại', ERROR_CODE.USERNAME_EXISTS);
    }

    // Check role
    const role = await roleRepository.findById(roleId);
    if (!role) {
      throw new NotFoundError('Vai trò không tồn tại', ERROR_CODE.ROLE_NOT_FOUND);
    }

    // Role Hierarchy Rule: Performer cannot create account with higher or equal role (except SUPMANAGER)
    const performerRole = authContext.role;
    const performerLevel = ROLE_LEVEL[performerRole] || 0;
    const targetLevel = ROLE_LEVEL[role.roleName] || 0;

    if (performerLevel < targetLevel) {
      throw new ForbiddenError('Không thể tạo tài khoản có vai trò cao hơn vai trò hiện tại của bạn', ERROR_CODE.FORBIDDEN);
    }
    if (performerLevel === targetLevel && performerRole !== ROLE.SUPMANAGER) {
      throw new ForbiddenError('Không thể tạo tài khoản có vai trò cùng cấp với vai trò hiện tại của bạn', ERROR_CODE.FORBIDDEN);
    }

    const passwordHash = await hashPassword(password);
    const account = await accountRepository.create({
      employeeId,
      username: trimmedUsername,
      passwordHash,
      roleId
    });

    await systemLogRepository.createLog({
      employeeId: authContext.employeeId,
      accountId: authContext.accountId,
      action: SYSTEM_ACTION.CREATE_ACCOUNT,
      description: `Tạo tài khoản: ${trimmedUsername} cho nhân viên ID ${employeeId}`,
      deviceFingerprint: authContext.deviceFingerprint,
      ipAddress: authContext.ipAddress,
      status: 'SUCCESS'
    });

    return {
      accountId: parseInt(account.account_id, 10),
      employeeId: parseInt(account.employee_id, 10),
      username: account.username,
      roleId: parseInt(account.role_id, 10),
      roleName: role.roleName,
      isActive: parseInt(account.is_active, 10)
    };
  }

  async updateAccountRole(accountId, roleId, authContext) {
    const ROLE = require('../constants/role.constants');
    const { ROLE_LEVEL } = ROLE;
    const { ForbiddenError } = require('../errors/app-error');

    const account = await accountRepository.findById(accountId);
    if (!account) {
      throw new NotFoundError('Không tìm thấy tài khoản', ERROR_CODE.ACCOUNT_NOT_FOUND);
    }

    const role = await roleRepository.findById(roleId);
    if (!role) {
      throw new NotFoundError('Vai trò không tồn tại', ERROR_CODE.ROLE_NOT_FOUND);
    }

    // Role Hierarchy: Check permissions over the target account
    const performerRole = authContext.role;
    const performerLevel = ROLE_LEVEL[performerRole] || 0;
    const oldTargetRole = account.role_name;
    const oldTargetLevel = ROLE_LEVEL[oldTargetRole] || 0;
    const newTargetLevel = ROLE_LEVEL[role.roleName] || 0;

    if (performerLevel < oldTargetLevel) {
      throw new ForbiddenError('Không có quyền thay đổi vai trò tài khoản cấp cao hơn', ERROR_CODE.FORBIDDEN);
    }
    if (performerLevel === oldTargetLevel && performerRole !== ROLE.SUPMANAGER) {
      throw new ForbiddenError('Không có quyền thay đổi vai trò tài khoản cùng cấp', ERROR_CODE.FORBIDDEN);
    }

    // Role Hierarchy: Check if performer is trying to elevate target beyond their own level
    if (performerLevel < newTargetLevel) {
      throw new ForbiddenError('Không thể nâng quyền tài khoản vượt quá cấp bậc của bạn', ERROR_CODE.FORBIDDEN);
    }
    if (performerLevel === newTargetLevel && performerRole !== ROLE.SUPMANAGER) {
      throw new ForbiddenError('Không thể nâng quyền tài khoản lên cùng cấp với bạn', ERROR_CODE.FORBIDDEN);
    }

    // Rule: Don't downgrade the last ADMIN active account
    if (account.role_name === 'ADMIN' && role.roleName !== 'ADMIN') {
      const activeAdmins = await accountRepository.countActiveAdmins();
      if (activeAdmins <= 1) {
        throw new ValidationError(
          'Không thể hạ quyền tài khoản ADMIN duy nhất còn hoạt động',
          ERROR_CODE.LAST_ADMIN_ACCOUNT
        );
      }
    }

    // Rule: Don't downgrade the last SUPMANAGER active account
    if (account.role_name === 'SUPMANAGER' && role.roleName !== 'SUPMANAGER') {
      const activeSups = await accountRepository.countActiveSupmanagers();
      if (activeSups <= 1) {
        throw new ValidationError(
          'Không thể hạ quyền tài khoản SUPMANAGER duy nhất còn hoạt động',
          ERROR_CODE.FORBIDDEN
        );
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updated = await accountRepository.updateRole(accountId, roleId, client);
      await sessionRepository.revokeSessionsByAccountId(accountId, client);

      await systemLogRepository.createLog({
        employeeId: authContext.employeeId,
        accountId: authContext.accountId,
        action: SYSTEM_ACTION.CHANGE_ACCOUNT_ROLE,
        description: `Thay đổi vai trò tài khoản: ${account.username} sang ${role.roleName}`,
        deviceFingerprint: authContext.deviceFingerprint,
        ipAddress: authContext.ipAddress,
        status: 'SUCCESS'
      }, client);

      await client.query('COMMIT');

      return {
        accountId: parseInt(updated.account_id, 10),
        employeeId: parseInt(updated.employee_id, 10),
        username: updated.username,
        roleId: parseInt(updated.role_id, 10),
        roleName: role.roleName,
        isActive: parseInt(updated.is_active, 10)
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateAccountStatus(accountId, isActive, authContext) {
    const ROLE = require('../constants/role.constants');
    const { ROLE_LEVEL } = ROLE;
    const { ForbiddenError } = require('../errors/app-error');

    const account = await accountRepository.findById(accountId);
    if (!account) {
      throw new NotFoundError('Không tìm thấy tài khoản', ERROR_CODE.ACCOUNT_NOT_FOUND);
    }

    // Role Hierarchy: Check permissions over target account
    const performerRole = authContext.role;
    const performerLevel = ROLE_LEVEL[performerRole] || 0;
    const targetRole = account.role_name;
    const targetLevel = ROLE_LEVEL[targetRole] || 0;

    if (performerLevel < targetLevel) {
      throw new ForbiddenError('Không có quyền thay đổi trạng thái tài khoản cấp cao hơn', ERROR_CODE.FORBIDDEN);
    }
    if (performerLevel === targetLevel && performerRole !== ROLE.SUPMANAGER && String(authContext.accountId) !== String(accountId)) {
      throw new ForbiddenError('Không có quyền thay đổi trạng thái tài khoản cùng cấp', ERROR_CODE.FORBIDDEN);
    }

    const currentStatus = parseInt(account.is_active, 10);
    const newStatus = parseInt(isActive, 10);

    if (currentStatus === newStatus) {
      return account;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (newStatus === 0) {
        // Deactivate: Verify we aren't deactivating the last active Admin/Supmanager account
        if (account.role_name === 'ADMIN') {
          const activeAdmins = await accountRepository.countActiveAdmins(client);
          if (activeAdmins <= 1) {
            throw new ValidationError(
              'Không thể khóa tài khoản ADMIN duy nhất còn hoạt động',
              ERROR_CODE.LAST_ADMIN_ACCOUNT
            );
          }
        }

        if (account.role_name === 'SUPMANAGER') {
          const activeSups = await accountRepository.countActiveSupmanagers(client);
          if (activeSups <= 1) {
            throw new ValidationError(
              'Không thể khóa tài khoản SUPMANAGER duy nhất còn hoạt động',
              ERROR_CODE.FORBIDDEN
            );
          }
        }

        await accountRepository.updateStatus(accountId, 0, client);
        await sessionRepository.revokeSessionsByAccountId(accountId, client);

        await systemLogRepository.createLog({
          employeeId: authContext.employeeId,
          accountId: authContext.accountId,
          action: SYSTEM_ACTION.DEACTIVATE_ACCOUNT,
          description: `Khóa tài khoản: ${account.username}`,
          deviceFingerprint: authContext.deviceFingerprint,
          ipAddress: authContext.ipAddress,
          status: 'SUCCESS'
        }, client);
      } else {
        // Activate: Only allowed if employee is active
        if (account.employee_status !== 1) {
          throw new ValidationError(
            'Không thể mở khóa tài khoản của nhân viên đang bị khóa',
            ERROR_CODE.EMPLOYEE_INACTIVE
          );
        }

        await accountRepository.updateStatus(accountId, 1, client);

        await systemLogRepository.createLog({
          employeeId: authContext.employeeId,
          accountId: authContext.accountId,
          action: SYSTEM_ACTION.ACTIVATE_ACCOUNT,
          description: `Mở khóa tài khoản: ${account.username}`,
          deviceFingerprint: authContext.deviceFingerprint,
          ipAddress: authContext.ipAddress,
          status: 'SUCCESS'
        }, client);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return accountRepository.findById(accountId);
  }

  async resetPassword(accountId, newPassword, authContext) {
    const ROLE = require('../constants/role.constants');
    const { ROLE_LEVEL } = ROLE;
    const { ForbiddenError } = require('../errors/app-error');

    const account = await accountRepository.findById(accountId);
    if (!account) {
      throw new NotFoundError('Không tìm thấy tài khoản', ERROR_CODE.ACCOUNT_NOT_FOUND);
    }

    // Role Hierarchy: Check permissions over the target account
    const performerRole = authContext.role;
    const performerLevel = ROLE_LEVEL[performerRole] || 0;
    const targetRole = account.role_name;
    const targetLevel = ROLE_LEVEL[targetRole] || 0;

    if (performerLevel < targetLevel) {
      throw new ForbiddenError('Không có quyền đặt lại mật khẩu cho tài khoản cấp cao hơn', ERROR_CODE.FORBIDDEN);
    }
    if (performerLevel === targetLevel && performerRole !== ROLE.SUPMANAGER && String(authContext.accountId) !== String(accountId)) {
      throw new ForbiddenError('Không có quyền đặt lại mật khẩu cho tài khoản cùng cấp', ERROR_CODE.FORBIDDEN);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const passwordHash = await hashPassword(newPassword);
      await accountRepository.resetPassword(accountId, passwordHash, true, client);
      await sessionRepository.revokeSessionsByAccountId(accountId, client);

      await systemLogRepository.createLog({
        employeeId: authContext.employeeId,
        accountId: authContext.accountId,
        action: SYSTEM_ACTION.RESET_ACCOUNT_PASSWORD,
        description: `Đặt lại mật khẩu cho tài khoản: ${account.username}`,
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

  async updateUsername(accountId, newUsername, authContext) {
    const ROLE = require('../constants/role.constants');
    const { ROLE_LEVEL } = ROLE;
    const { ForbiddenError, ValidationError } = require('../errors/app-error');

    const account = await accountRepository.findById(accountId);
    if (!account) {
      throw new NotFoundError('Không tìm thấy tài khoản', ERROR_CODE.ACCOUNT_NOT_FOUND);
    }

    const trimmedUsername = newUsername.trim().toLowerCase();

    // Check if new username is different from current username
    if (account.username.toLowerCase() === trimmedUsername) {
      throw new ValidationError('Tên đăng nhập mới phải khác tên đăng nhập hiện tại', ERROR_CODE.VALIDATION_ERROR);
    }

    // Check duplicate username
    const existingUser = await accountRepository.findByUsername(trimmedUsername);
    if (existingUser && String(existingUser.account_id) !== String(accountId)) {
      throw new ConflictError('Tên đăng nhập đã tồn tại', ERROR_CODE.USERNAME_EXISTS);
    }

    // Role Hierarchy: Check permissions over the target account
    const performerRole = authContext.role;
    const performerLevel = ROLE_LEVEL[performerRole] || 0;
    const targetRole = account.role_name;
    const targetLevel = ROLE_LEVEL[targetRole] || 0;

    if (performerLevel < targetLevel) {
      throw new ForbiddenError('Không có quyền đổi tên đăng nhập cho tài khoản cấp cao hơn', ERROR_CODE.FORBIDDEN);
    }
    if (performerLevel === targetLevel && performerRole !== ROLE.SUPMANAGER && String(authContext.accountId) !== String(accountId)) {
      throw new ForbiddenError('Không có quyền đổi tên đăng nhập cho tài khoản cùng cấp', ERROR_CODE.FORBIDDEN);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updated = await accountRepository.updateUsername(accountId, trimmedUsername, client);

      // Revoke all active sessions so user must log in again with new username
      await sessionRepository.revokeSessionsByAccountId(accountId, client);

      await systemLogRepository.createLog({
        employeeId: authContext.employeeId,
        accountId: authContext.accountId,
        action: SYSTEM_ACTION.UPDATE_ACCOUNT_USERNAME,
        description: `Đổi tên đăng nhập tài khoản ID ${accountId}: tên cũ "${account.username}" -> tên mới "${trimmedUsername}"`,
        deviceFingerprint: authContext.deviceFingerprint,
        ipAddress: authContext.ipAddress,
        status: 'SUCCESS'
      }, client);

      await client.query('COMMIT');

      return {
        accountId: parseInt(updated.account_id, 10),
        employeeId: parseInt(updated.employee_id, 10),
        username: updated.username,
        roleId: parseInt(updated.role_id, 10),
        isActive: parseInt(updated.is_active, 10)
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }



  async getAccountsList(queryParams) {
    const page = parseInt(queryParams.page || '1', 10);
    const limit = parseInt(queryParams.limit || '10', 10);
    const offset = (page - 1) * limit;

    const { items, total } = await accountRepository.findAndCount({ limit, offset });
    const { getPagination } = require('../utils/pagination');
    const pagination = getPagination(page, limit, total);
    return {
      items,
      pagination
    };
  }
}

module.exports = new AccountService();
