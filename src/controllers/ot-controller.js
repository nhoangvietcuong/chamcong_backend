const otService = require('../services/ot-service');
const { getPagination } = require('../utils/pagination');

class OtController {
  async createRequest(req, res, next) {
    try {
      const data = {
        employeeId: req.auth.employeeId,
        workDate: req.body.workDate,
        startTime: req.body.startTime,
        endTime: req.body.endTime,
        reason: req.body.reason,
      };

      const result = await otService.createRequest(data, req.auth);
      res.status(201).json({
        success: true,
        message: 'Gửi đơn đăng ký tăng ca thành công',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async getMyRequests(req, res, next) {
    try {
      const page = parseInt(req.query.page || '1', 10);
      const limit = parseInt(req.query.limit || '10', 10);
      const { status, workDate } = req.query;

      const { items, total } = await otService.getMyRequests(req.auth.employeeId, {
        page,
        limit,
        status,
        workDate,
      });

      res.status(200).json({
        success: true,
        message: 'Lấy danh sách đơn đăng ký tăng ca thành công',
        data: items,
        pagination: getPagination(page, limit, total),
      });
    } catch (err) {
      next(err);
    }
  }

  async cancelRequest(req, res, next) {
    try {
      const { id } = req.params;
      const result = await otService.cancelRequest(id, req.auth);
      res.status(200).json({
        success: true,
        message: 'Hủy đơn đăng ký tăng ca thành công',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async getAdminRequests(req, res, next) {
    try {
      const page = parseInt(req.query.page || '1', 10);
      const limit = parseInt(req.query.limit || '10', 10);
      const { employeeId, status, workDate, departmentId } = req.query;

      const { items, total } = await otService.getAdminRequests(
        {
          page,
          limit,
          employeeId,
          status,
          workDate,
          departmentId,
        },
        req.auth
      );

      res.status(200).json({
        success: true,
        message: 'Lấy danh sách đơn đăng ký tăng ca quản trị thành công',
        data: items,
        pagination: getPagination(page, limit, total),
      });
    } catch (err) {
      next(err);
    }
  }

  async approveRequest(req, res, next) {
    try {
      const { id } = req.params;
      const result = await otService.approveRequest(id, req.auth);
      res.status(200).json({
        success: true,
        message: 'Phê duyệt đơn đăng ký tăng ca thành công',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async rejectRequest(req, res, next) {
    try {
      const { id } = req.params;
      const { rejectReason } = req.body;
      const result = await otService.rejectRequest(id, rejectReason, req.auth);
      res.status(200).json({
        success: true,
        message: 'Từ chối đơn đăng ký tăng ca thành công',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async bulkApprove(req, res, next) {
    try {
      const { otRequestIds } = req.body;
      const result = await otService.bulkApproveOrReject(otRequestIds, 'APPROVED', {}, req.auth);
      res.status(200).json({
        success: true,
        message: `Đã xử lý phê duyệt hàng loạt ${result.successCount} đơn tăng ca thành công`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async bulkReject(req, res, next) {
    try {
      const { otRequestIds, rejectReason } = req.body;
      const result = await otService.bulkApproveOrReject(otRequestIds, 'REJECTED', { rejectReason }, req.auth);
      res.status(200).json({
        success: true,
        message: `Đã xử lý từ chối hàng loạt ${result.successCount} đơn tăng ca`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new OtController();
