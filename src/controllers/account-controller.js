const accountService = require('../services/account-service');
const ROLE = require('../constants/role.constants');
const { ForbiddenError } = require('../errors/app-error');
const ERROR_CODE = require('../constants/error-code.constants');

class AccountController {
  async getAccounts(req, res, next) {
    try {
      const currentRole = req.auth.role;
      const currentLevel = ROLE.ROLE_LEVEL[currentRole] || 0;
      const minRequiredLevel = ROLE.ROLE_LEVEL[ROLE.MANAGER];

      if (currentLevel < minRequiredLevel) {
        throw new ForbiddenError('Không có quyền truy cập thông tin tài khoản', ERROR_CODE.FORBIDDEN);
      }
      const result = await accountService.getAccountsList(req.query);
      res.status(200).json({
        success: true,
        message: 'Lấy danh sách tài khoản thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async createAccount(req, res, next) {
    try {
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        role: req.auth.role,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const account = await accountService.createAccount(req.params.employeeId, req.body, authContext);
      res.status(201).json({
        success: true,
        message: 'Tạo tài khoản thành công',
        data: account
      });
    } catch (err) {
      next(err);
    }
  }

  async updateAccountRole(req, res, next) {
    try {
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        role: req.auth.role,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const result = await accountService.updateAccountRole(req.params.accountId, req.body.roleId, authContext);
      res.status(200).json({
        success: true,
        message: 'Thay đổi vai trò tài khoản thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async updateAccountStatus(req, res, next) {
    try {
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        role: req.auth.role,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const account = await accountService.updateAccountStatus(req.params.accountId, req.body.isActive, authContext);
      res.status(200).json({
        success: true,
        message: 'Thay đổi trạng thái tài khoản thành công',
        data: account
      });
    } catch (err) {
      next(err);
    }
  }

  async resetPassword(req, res, next) {
    try {
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        role: req.auth.role,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      await accountService.resetPassword(req.params.accountId, req.body.newPassword, authContext);
      res.status(200).json({
        success: true,
        message: 'Đặt lại mật khẩu thành công',
        data: {}
      });
    } catch (err) {
      next(err);
    }
  }

  async updateUsername(req, res, next) {
    try {
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        role: req.auth.role,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const result = await accountService.updateUsername(req.params.accountId, req.body.newUsername, authContext);
      res.status(200).json({
        success: true,
        message: 'Thay đổi tên đăng nhập thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }
}


module.exports = new AccountController();
