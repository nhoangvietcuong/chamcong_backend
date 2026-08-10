const employeeService = require('../services/employee-service');
const { BadRequestError } = require('../errors/app-error');

class EmployeeController {
  async getEmployees(req, res, next) {
    try {
      const result = await employeeService.getEmployees(req.query);
      res.status(200).json({
        success: true,
        message: 'Lấy danh sách nhân viên thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async getEmployeeById(req, res, next) {
    try {
      const employee = await employeeService.getEmployeeById(req.params.id);
      res.status(200).json({
        success: true,
        message: 'Lấy chi tiết nhân viên thành công',
        data: employee
      });
    } catch (err) {
      next(err);
    }
  }

  async getNextCode(req, res, next) {
    try {
      let roleName = req.query.role || req.query.roleName;
      if (!roleName && req.query.roleId) {
        const roleRepository = require('../repositories/role-repository');
        const role = await roleRepository.findById(req.query.roleId);
        if (role) roleName = role.roleName;
      }
      const nextCode = await employeeService.getNextCode(roleName);
      res.status(200).json({
        success: true,
        message: 'Lấy mã nhân viên tiếp theo thành công',
        data: { nextCode }
      });
    } catch (err) {
      next(err);
    }
  }

  async createEmployee(req, res, next) {
    try {
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        role: req.auth.role,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const employee = await employeeService.createEmployee(req.body, authContext);
      res.status(201).json({
        success: true,
        message: 'Tạo nhân viên thành công',
        data: employee
      });
    } catch (err) {
      next(err);
    }
  }

  async createEmployeeWithAccount(req, res, next) {
    try {
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        role: req.auth.role,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const result = await employeeService.createEmployeeWithAccount(req.body, authContext);
      res.status(201).json({
        success: true,
        message: 'Tạo nhân viên kèm tài khoản thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async updateEmployee(req, res, next) {
    try {
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        role: req.auth.role,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const employee = await employeeService.updateEmployee(req.params.id, req.body, authContext);
      res.status(200).json({
        success: true,
        message: 'Cập nhật thông tin nhân viên thành công',
        data: employee
      });
    } catch (err) {
      next(err);
    }
  }

  async updateEmployeeStatus(req, res, next) {
    try {
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        role: req.auth.role,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const employee = await employeeService.updateEmployeeStatus(req.params.id, req.body.status, authContext);
      res.status(200).json({
        success: true,
        message: 'Thay đổi trạng thái hoạt động của nhân viên thành công',
        data: employee
      });
    } catch (err) {
      next(err);
    }
  }

  async updateSelfProfile(req, res, next) {
    try {
      const employeeId = req.auth.employeeId;
      const { email, phone } = req.body;
      const updated = await employeeService.updateSelfProfile(employeeId, { email, phone });
      res.status(200).json({
        success: true,
        message: 'Cập nhật thông tin cá nhân thành công',
        data: updated
      });
    } catch (err) {
      next(err);
    }
  }

  async updateSelfPassword(req, res, next) {
    try {
      const accountId = req.auth.accountId;
      const { oldPassword, newPassword } = req.body;
      await employeeService.updateSelfPassword(accountId, oldPassword, newPassword);
      res.status(200).json({
        success: true,
        message: 'Đổi mật khẩu thành công'
      });
    } catch (err) {
      next(err);
    }
  }

  async updateSelfAvatar(req, res, next) {
    try {
      const employeeId = req.auth.employeeId;
      if (!req.file) {
        throw new BadRequestError('Vui lòng tải lên một tệp ảnh đại diện');
      }
      
      const avatarUrl = `/uploads/avatars/${req.file.filename}`;
      const updated = await employeeService.updateSelfAvatar(employeeId, avatarUrl);
      
      res.status(200).json({
        success: true,
        message: 'Cập nhật ảnh đại diện thành công',
        data: {
          avatarUrl
        }
      });
    } catch (err) {
      next(err);
    }
  }
  async bulkDeleteEmployees(req, res, next) {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        throw new BadRequestError('Vui lòng chọn ít nhất 1 nhân viên để xóa');
      }
      const count = await employeeService.bulkDeleteEmployees(ids);
      res.status(200).json({
        success: true,
        message: `Xóa thành công ${count} nhân viên và các dữ liệu liên quan`
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new EmployeeController();
