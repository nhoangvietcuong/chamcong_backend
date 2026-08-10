const shiftService = require('../services/shift-service');

class ShiftController {
  async getShifts(req, res, next) {
    try {
      const result = await shiftService.getShifts(req.query);
      res.status(200).json({
        success: true,
        message: 'Lấy danh sách ca làm việc thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async getShiftById(req, res, next) {
    try {
      const { id } = req.params;
      const result = await shiftService.getShiftById(id);
      res.status(200).json({
        success: true,
        message: 'Lấy chi tiết ca làm việc thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async createShift(req, res, next) {
    try {
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const result = await shiftService.createShift(req.body, authContext);
      res.status(201).json({
        success: true,
        message: 'Tạo ca làm việc thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async updateShift(req, res, next) {
    try {
      const { id } = req.params;
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const result = await shiftService.updateShift(id, req.body, authContext);
      res.status(200).json({
        success: true,
        message: 'Cập nhật ca làm việc thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async deleteShift(req, res, next) {
    try {
      const { id } = req.params;
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const result = await shiftService.deleteShift(id, authContext);
      res.status(200).json({
        success: true,
        message: 'Xóa ca làm việc thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ShiftController();
