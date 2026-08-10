const leaveService = require('../services/leave-service');
const { getPagination } = require('../utils/pagination');

class LeaveController {
  async createRequest(req, res, next) {
    try {
      const evidenceUrl = req.file ? `/uploads/leave/${req.file.filename}` : null;
      const data = {
        employeeId: req.auth.employeeId,
        leaveType: req.body.leaveType,
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        reason: req.body.reason,
        evidenceUrl
      };

      const result = await leaveService.createRequest(data, req.auth);
      res.status(201).json({
        success: true,
        message: 'Tạo đơn xin nghỉ phép thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async getLeaveRequestDetails(req, res, next) {
    try {
      const { id } = req.params;
      const result = await leaveService.getLeaveRequestDetails(id, req.auth);
      res.status(200).json({
        success: true,
        message: 'Lấy thông tin chi tiết đơn nghỉ phép thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async cancelRequest(req, res, next) {
    try {
      const { id } = req.params;
      const result = await leaveService.cancelRequest(id, req.auth);
      res.status(200).json({
        success: true,
        message: 'Hủy đơn xin nghỉ phép thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async approveOrReject(req, res, next) {
    try {
      const { id } = req.params;
      const { status, rejectReason } = req.body;
      const result = await leaveService.approveOrReject(id, status, { rejectReason }, req.auth);
      res.status(200).json({
        success: true,
        message: status === 'APPROVED' ? 'Duyệt đơn nghỉ phép thành công' : 'Từ chối đơn nghỉ phép thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async getMyRequests(req, res, next) {
    try {
      const page = parseInt(req.query.page || '1', 10);
      const limit = parseInt(req.query.limit || '10', 10);
      const { status } = req.query;

      const result = await leaveService.getMyRequests(req.auth.employeeId, { page, limit, status });
      res.status(200).json({
        success: true,
        message: 'Lấy danh sách đơn nghỉ phép cá nhân thành công',
        data: {
          items: result.items,
          pagination: getPagination(page, limit, result.total)
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async getAdminRequests(req, res, next) {
    try {
      const page = parseInt(req.query.page || '1', 10);
      const limit = parseInt(req.query.limit || '10', 10);
      const { status, employeeId, departmentId, leaveType } = req.query;

      const result = await leaveService.getAdminRequests({ page, limit, status, employeeId, departmentId, leaveType }, req.auth);
      res.status(200).json({
        success: true,
        message: 'Lấy danh sách đơn nghỉ phép quản lý thành công',
        data: {
          items: result.items,
          pagination: getPagination(page, limit, result.total)
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async getMyLeaveBalance(req, res, next) {
    try {
      const year = parseInt(req.query.year || new Date().getFullYear(), 10);
      const result = await leaveService.getMyLeaveBalance(req.auth.employeeId, year);
      res.status(200).json({
        success: true,
        message: 'Lấy số dư nghỉ phép thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async getEmployeeLeaveBalance(req, res, next) {
    try {
      const { employeeId } = req.params;
      const year = parseInt(req.query.year || new Date().getFullYear(), 10);
      const result = await leaveService.getEmployeeLeaveBalance(employeeId, year);
      res.status(200).json({
        success: true,
        message: 'Lấy số dư nghỉ phép nhân viên thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async updateTotalLeaveDays(req, res, next) {
    try {
      const { employeeId } = req.params;
      const { annualDaysTotal } = req.body;
      const year = parseInt(req.body.year || new Date().getFullYear(), 10);
      
      if (annualDaysTotal === undefined || annualDaysTotal === null) {
        throw new Error('Vui lòng cung cấp tổng số ngày nghỉ phép');
      }

      const result = await leaveService.updateTotalLeaveDays(employeeId, year, parseFloat(annualDaysTotal));
      res.status(200).json({
        success: true,
        message: 'Cập nhật tổng số ngày nghỉ phép thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async bulkApprove(req, res, next) {
    try {
      const { leaveRequestIds } = req.body;
      const result = await leaveService.bulkApproveOrReject(
        leaveRequestIds,
        'APPROVED',
        {},
        req.auth
      );
      res.status(200).json({
        success: true,
        message: `Duyệt hàng loạt hoàn tất: ${result.successCount} thành công, ${result.failedCount} thất bại`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async bulkReject(req, res, next) {
    try {
      const { leaveRequestIds, rejectReason } = req.body;
      if (!rejectReason || String(rejectReason).trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng cung cấp lý do từ chối khi từ chối hàng loạt',
        });
      }
      const result = await leaveService.bulkApproveOrReject(
        leaveRequestIds,
        'REJECTED',
        { rejectReason: String(rejectReason).trim() },
        req.auth
      );
      res.status(200).json({
        success: true,
        message: `Từ chối hàng loạt hoàn tất: ${result.successCount} thành công, ${result.failedCount} thất bại`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new LeaveController();
