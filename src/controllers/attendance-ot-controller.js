const attendanceOvertimeService = require('../services/attendance-ot-service');
const ROLE = require('../constants/role.constants');
const { ForbiddenError } = require('../errors/app-error');
const ERROR_CODE = require('../constants/error-code.constants');

class AttendanceOvertimeController {
  async checkIn(req, res, next) {
    try {
      if (req.auth.role !== ROLE.EMPLOYEE) {
        throw new ForbiddenError('Chỉ nhân viên mới được phép check-in tăng ca', ERROR_CODE.FORBIDDEN);
      }

      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        sessionId: req.auth.sessionId,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress,
      };

      const result = await attendanceOvertimeService.checkIn(
        req.body,
        req.files || { photo: req.file },
        authContext
      );

      res.status(200).json({
        success: true,
        message: 'Check-in tăng ca thành công',
        data: result,
      });
    } catch (err) {
      const fileStorageService = require('../services/file-storage-service');
      if (req.file && req.file.filename) {
        await fileStorageService.deleteFile(req.file.filename).catch(() => { });
      }
      if (req.files?.photo?.[0]?.filename) {
        await fileStorageService.deleteFile(req.files.photo[0].filename).catch(() => { });
      }
      next(err);
    }
  }

  async checkOut(req, res, next) {
    try {
      if (req.auth.role !== ROLE.EMPLOYEE) {
        throw new ForbiddenError('Chỉ nhân viên mới được phép check-out tăng ca', ERROR_CODE.FORBIDDEN);
      }

      const authContext = {
        employeeId: req.auth.employeeId,
        accountId: req.auth.accountId,
        sessionId: req.auth.sessionId,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip || req.socket.remoteAddress,
      };

      const result = await attendanceOvertimeService.checkOut(
        req.body,
        req.files || { photo: req.file },
        authContext
      );

      res.status(200).json({
        success: true,
        message: 'Check-out tăng ca thành công',
        data: result,
      });
    } catch (err) {
      const fileStorageService = require('../services/file-storage-service');
      if (req.file && req.file.filename) {
        await fileStorageService.deleteFile(req.file.filename).catch(() => { });
      }
      if (req.files?.photo?.[0]?.filename) {
        await fileStorageService.deleteFile(req.files.photo[0].filename).catch(() => { });
      }
      next(err);
    }
  }
}

module.exports = new AttendanceOvertimeController();
