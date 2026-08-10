const attendanceService = require('../services/attendance-service');
const ROLE = require('../constants/role.constants');
const { ForbiddenError } = require('../errors/app-error');
const ERROR_CODE = require('../constants/error-code.constants');
const attendancePhotoService = require('../services/attendance-photo-service');

class AttendanceController {
  async checkIn(req, res, next) {
    try {
      // 30. ADMIN không dùng API check-in nếu policy chỉ cho EMPLOYEE
      if (req.auth.role !== ROLE.EMPLOYEE) {
        throw new ForbiddenError('Chỉ nhân viên mới được phép check-in', ERROR_CODE.FORBIDDEN);
      }

      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        sessionId: req.auth.sessionId,
        deviceFingerprint: req.auth.deviceFingerprint,
      };

      const result = await attendanceService.checkIn(
        authContext,
        req.body,
        req.file,
        req.ip || req.socket.remoteAddress,
        req.files?.['verificationPhoto']?.[0]
      );

      res.status(200).json({
        success: true,
        message: 'Check-in thành công',
        data: result,
      });
    } catch (err) {
      const fileStorageService = require('../services/file-storage-service');
      if (!err.keepFiles) {
        if (req.file && req.file.filename) {
          await fileStorageService.deleteFile(req.file.filename).catch(() => { });
        }
        if (req.files && req.files['verificationPhoto'] && req.files['verificationPhoto'][0]) {
          await fileStorageService.deleteFile(req.files['verificationPhoto'][0].filename).catch(() => { });
        }
      }
      next(err);
    }
  }

  async checkOut(req, res, next) {
    try {
      if (req.auth.role !== ROLE.EMPLOYEE) {
        throw new ForbiddenError('Chỉ nhân viên mới được phép check-out', ERROR_CODE.FORBIDDEN);
      }

      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        sessionId: req.auth.sessionId,
        deviceFingerprint: req.auth.deviceFingerprint,
      };

      const result = await attendanceService.checkOut(
        authContext,
        req.body,
        req.file,
        req.ip || req.socket.remoteAddress,
        req.files?.['verificationPhoto']?.[0]
      );

      res.status(200).json({
        success: true,
        message: 'Check-out thành công',
        data: result,
      });
    } catch (err) {
      const fileStorageService = require('../services/file-storage-service');
      if (!err.keepFiles) {
        if (req.file && req.file.filename) {
          await fileStorageService.deleteFile(req.file.filename).catch(() => { });
        }
        if (req.files && req.files['verificationPhoto'] && req.files['verificationPhoto'][0]) {
          await fileStorageService.deleteFile(req.files['verificationPhoto'][0].filename).catch(() => { });
        }
      }
      next(err);
    }
  }

  async getTodayState(req, res, next) {
    try {
      if (req.auth.role !== ROLE.EMPLOYEE) {
        throw new ForbiddenError('Chỉ nhân viên mới được phép xem trạng thái chấm công', ERROR_CODE.FORBIDDEN);
      }

      const employeeId = req.auth.employeeId;
      const result = await attendanceService.getTodayAttendanceState(employeeId);

      res.status(200).json({
        success: true,
        message: 'Lấy trạng thái chấm công hôm nay thành công',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async getHistory(req, res, next) {
    try {
      if (req.auth.role !== ROLE.EMPLOYEE) {
        throw new ForbiddenError('Chỉ nhân viên mới được phép xem lịch sử chấm công', ERROR_CODE.FORBIDDEN);
      }

      const employeeId = req.auth.employeeId;
      const result = await attendanceService.getAttendanceHistory(employeeId, req.query);

      res.status(200).json({
        success: true,
        message: 'Lấy lịch sử chấm công thành công',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async getAdminAttendance(req, res, next) {
    try {
      if (ROLE.ROLE_LEVEL[req.auth.role] < ROLE.ROLE_LEVEL[ROLE.MANAGER]) {
        throw new ForbiddenError('Không có quyền thực hiện hành động này', ERROR_CODE.FORBIDDEN);
      }

      const result = await attendanceService.getAdminAttendanceList(req.query);

      res.status(200).json({
        success: true,
        message: 'Lấy danh sách chấm công toàn hệ thống thành công',
        data: {
          items: result.items,
          pagination: result.pagination,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async getReviewQueue(req, res, next) {
    try {
      if (ROLE.ROLE_LEVEL[req.auth.role] < ROLE.ROLE_LEVEL[ROLE.MANAGER]) {
        throw new ForbiddenError('Không có quyền truy cập hàng đợi kiểm duyệt', ERROR_CODE.FORBIDDEN);
      }
      const result = await attendanceService.getReviewQueue(req.query);
      res.status(200).json({
        success: true,
        message: 'Lấy danh sách kiểm duyệt thành công',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async reviewAttendance(req, res, next) {
    try {
      if (ROLE.ROLE_LEVEL[req.auth.role] < ROLE.ROLE_LEVEL[ROLE.MANAGER]) {
        throw new ForbiddenError('Không có quyền kiểm duyệt', ERROR_CODE.FORBIDDEN);
      }
      const { attendanceId } = req.params;
      const result = await attendanceService.reviewAttendance(
        attendanceId,
        req.body,
        req.auth.accountId
      );
      res.status(200).json({
        success: true,
        message: 'Cập nhật trạng thái kiểm duyệt thành công',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async offlineSync(req, res, next) {
    try {
      if (req.auth.role !== ROLE.EMPLOYEE) {
        throw new ForbiddenError('Chỉ nhân viên mới được phép đồng bộ ngoại tuyến', ERROR_CODE.FORBIDDEN);
      }

      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        sessionId: req.auth.sessionId,
        deviceFingerprint: req.auth.deviceFingerprint,
      };

      const offlineSyncService = require('../services/offline-sync-service');
      const result = await offlineSyncService.syncOfflineRecord(
        authContext,
        req.body,
        req.file,
        req.ip || req.socket.remoteAddress
      );

      res.status(200).json(result);
    } catch (err) {
      const fileStorageService = require('../services/file-storage-service');
      if (req.file && req.file.filename) {
        await fileStorageService.deleteFile(req.file.filename).catch(() => { });
      }
      next(err);
    }
  }

  async getAttendancePhotos(req, res, next) {
    try {
      const attendanceId = parseInt(req.params.attendanceId, 10);
      const result = await attendancePhotoService.getPhotosByAttendanceId(attendanceId, req.auth);
      res.status(200).json({
        success: true,
        message: 'Lấy danh sách ảnh chấm công thành công',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async getEmployeePhotos(req, res, next) {
    try {
      const employeeId = parseInt(req.params.employeeId, 10);
      const result = await attendancePhotoService.getPhotosByEmployee(employeeId, req.query, req.auth);
      res.status(200).json({
        success: true,
        message: 'Lấy lịch sử ảnh nhân viên thành công',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AttendanceController();
