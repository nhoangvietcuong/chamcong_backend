const assignmentService = require('../services/assignment-service');

class AssignmentController {
  async getAssignments(req, res, next) {
    try {
      const result = await assignmentService.getAssignments(req.query);
      res.status(200).json({
        success: true,
        message: 'Lấy danh sách phân công thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async getAssignmentCalendar(req, res, next) {
    try {
      const result = await assignmentService.getAssignmentCalendar(req.query);
      res.status(200).json({
        success: true,
        message: 'Lấy lịch biểu phân công thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async getAssignmentById(req, res, next) {
    try {
      const assignment = await assignmentService.getAssignmentById(req.params.id);
      res.status(200).json({
        success: true,
        message: 'Lấy chi tiết phân công thành công',
        data: assignment
      });
    } catch (err) {
      next(err);
    }
  }

  async createAssignment(req, res, next) {
    try {
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const assignment = await assignmentService.createAssignment(req.body, authContext);
      res.status(201).json({
        success: true,
        message: 'Tạo phân công thành công',
        data: assignment
      });
    } catch (err) {
      next(err);
    }
  }

  async updateAssignment(req, res, next) {
    try {
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const assignment = await assignmentService.updateAssignment(req.params.id, req.body, authContext);
      res.status(200).json({
        success: true,
        message: 'Cập nhật phân công thành công',
        data: assignment
      });
    } catch (err) {
      next(err);
    }
  }

  async cancelAssignment(req, res, next) {
    try {
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const assignment = await assignmentService.cancelAssignment(req.params.id, req.body, authContext);
      res.status(200).json({
        success: true,
        message: 'Hủy phân công thành công',
        data: assignment
      });
    } catch (err) {
      next(err);
    }
  }

  async createBulkAssignments(req, res, next) {
    try {
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const result = await assignmentService.createBulkAssignments(req.body, authContext);
      res.status(201).json({
        success: true,
        message: 'Phân công hàng loạt thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async copyAssignments(req, res, next) {
    try {
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const result = await assignmentService.copyAssignments(req.body, authContext);
      res.status(201).json({
        success: true,
        message: 'Sao chép phân công thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async bulkDeleteAssignments(req, res, next) {
    try {
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const result = await assignmentService.bulkDeleteAssignments(req.body, authContext);
      res.status(200).json({
        success: true,
        message: 'Xóa phân công hàng loạt thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async bulkUpdateLocation(req, res, next) {
    try {
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const result = await assignmentService.bulkUpdateLocation(req.body, authContext);
      res.status(200).json({
        success: true,
        message: 'Chuyển đổi địa điểm hàng loạt thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async bulkUpdateSelected(req, res, next) {
    try {
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const result = await assignmentService.bulkUpdateSelectedAssignments(req.body, authContext);
      res.status(200).json({
        success: true,
        message: 'Cập nhật danh sách phân công được chọn thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async bulkDeleteSelected(req, res, next) {
    try {
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const result = await assignmentService.bulkDeleteSelectedAssignments(req.body, authContext);
      res.status(200).json({
        success: true,
        message: 'Xóa danh sách phân công được chọn thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AssignmentController();
