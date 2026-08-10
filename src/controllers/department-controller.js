const departmentService = require('../services/department-service');

class DepartmentController {
  async getDepartments(req, res, next) {
    try {
      const result = await departmentService.getDepartments(req.query);
      res.status(200).json({
        success: true,
        message: 'Lấy danh sách phòng ban thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async getDepartmentById(req, res, next) {
    try {
      const department = await departmentService.getDepartmentById(req.params.id);
      res.status(200).json({
        success: true,
        message: 'Lấy chi tiết phòng ban thành công',
        data: department
      });
    } catch (err) {
      next(err);
    }
  }

  async createDepartment(req, res, next) {
    try {
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const department = await departmentService.createDepartment(req.body, authContext);
      res.status(201).json({
        success: true,
        message: 'Tạo phòng ban thành công',
        data: department
      });
    } catch (err) {
      next(err);
    }
  }

  async updateDepartment(req, res, next) {
    try {
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const department = await departmentService.updateDepartment(req.params.id, req.body, authContext);
      res.status(200).json({
        success: true,
        message: 'Cập nhật phòng ban thành công',
        data: department
      });
    } catch (err) {
      next(err);
    }
  }

  async updateDepartmentStatus(req, res, next) {
    try {
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const department = await departmentService.updateDepartmentStatus(req.params.id, req.body.status, authContext);
      res.status(200).json({
        success: true,
        message: 'Thay đổi trạng thái phòng ban thành công',
        data: department
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new DepartmentController();
