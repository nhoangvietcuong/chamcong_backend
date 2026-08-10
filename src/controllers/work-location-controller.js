const workLocationService = require('../services/work-location-service');

class WorkLocationController {
  async getWorkLocations(req, res, next) {
    try {
      const result = await workLocationService.getWorkLocations(req.query);
      res.status(200).json({
        success: true,
        message: 'Lấy danh sách địa điểm thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async getWorkLocationById(req, res, next) {
    try {
      const location = await workLocationService.getWorkLocationById(req.params.id);
      res.status(200).json({
        success: true,
        message: 'Lấy chi tiết địa điểm thành công',
        data: location
      });
    } catch (err) {
      next(err);
    }
  }

  async createWorkLocation(req, res, next) {
    try {
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const location = await workLocationService.createWorkLocation(req.body, authContext);
      res.status(201).json({
        success: true,
        message: 'Tạo địa điểm thành công',
        data: location
      });
    } catch (err) {
      next(err);
    }
  }

  async updateWorkLocation(req, res, next) {
    try {
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const location = await workLocationService.updateWorkLocation(req.params.id, req.body, authContext);
      res.status(200).json({
        success: true,
        message: 'Cập nhật địa điểm thành công',
        data: location
      });
    } catch (err) {
      next(err);
    }
  }

  async updateWorkLocationStatus(req, res, next) {
    try {
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const location = await workLocationService.updateWorkLocationStatus(req.params.id, req.body.status, authContext);
      res.status(200).json({
        success: true,
        message: 'Thay đổi trạng thái địa điểm thành công',
        data: location
      });
    } catch (err) {
      next(err);
    }
  }

  async bulkDeleteWorkLocations(req, res, next) {
    try {
      const { ids } = req.body;
      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress
      };
      const count = await workLocationService.bulkDeleteWorkLocations(ids, authContext);
      res.status(200).json({
        success: true,
        message: `Đã xóa thành công ${count} địa điểm.`,
        data: { count }
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new WorkLocationController();
