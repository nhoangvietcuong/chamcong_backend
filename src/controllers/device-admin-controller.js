const sessionRepository = require('../repositories/session-repository');
const { pool } = require('../config/db');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../errors/app-error');
const ERROR_CODE = require('../constants/error-code.constants');
const ROLE = require('../constants/role.constants');
const systemLogRepository = require('../repositories/system-log-repository');

class DeviceAdminController {
  async getDevices(req, res, next) {
    try {
      if (ROLE.ROLE_LEVEL[req.auth.role] < ROLE.ROLE_LEVEL[ROLE.MANAGER]) {
        throw new ForbiddenError('Không có quyền truy cập danh sách thiết bị', ERROR_CODE.FORBIDDEN);
      }

      const page = parseInt(req.query.page || '1', 10);
      const limit = parseInt(req.query.limit || '10', 10);
      const { keyword, status } = req.query;

      // Status query mapping to ACTIVE/REVOKED
      let statusFilter = '';
      if (status === '1') statusFilter = 'ACTIVE';
      else if (status === '0') statusFilter = 'REVOKED';

      const result = await sessionRepository.findAndCountDevices({
        page,
        limit,
        keyword,
        status: statusFilter
      });

      const { getPagination } = require('../utils/pagination');
      res.status(200).json({
        success: true,
        message: 'Lấy danh sách thiết bị thành công',
        data: {
          items: result.items,
          pagination: getPagination(page, limit, result.total)
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async updateStatus(req, res, next) {
    try {
      if (ROLE.ROLE_LEVEL[req.auth.role] < ROLE.ROLE_LEVEL[ROLE.MANAGER]) {
        throw new ForbiddenError('Không có quyền sửa đổi trạng thái thiết bị', ERROR_CODE.FORBIDDEN);
      }

      const { sessionId } = req.params;
      const { status } = req.body;

      if (status !== 0 && status !== 1) {
        throw new BadRequestError('Trạng thái không hợp lệ (chỉ nhận 0 hoặc 1)', ERROR_CODE.INVALID_INPUT);
      }

      const session = await sessionRepository.updateSessionStatusAdmin(sessionId, status);
      if (!session) {
        throw new NotFoundError('Không tìm thấy thiết bị/session', ERROR_CODE.SESSION_NOT_FOUND);
      }

      await systemLogRepository.createLog({
        employeeId: session.employee_id,
        accountId: req.auth.accountId,
        action: status === 1 ? 'DEVICE_ENABLED' : 'DEVICE_DISABLED',
        description: `${status === 1 ? 'Kích hoạt' : 'Khóa'} thiết bị (Session ID: ${sessionId})`,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip,
        status: 'SUCCESS'
      });

      res.status(200).json({
        success: true,
        message: `${status === 1 ? 'Kích hoạt' : 'Khóa'} thiết bị thành công`,
        data: session
      });
    } catch (err) {
      next(err);
    }
  }

  async revokeDevice(req, res, next) {
    try {
      if (ROLE.ROLE_LEVEL[req.auth.role] < ROLE.ROLE_LEVEL[ROLE.MANAGER]) {
        throw new ForbiddenError('Không có quyền thu hồi thiết bị', ERROR_CODE.FORBIDDEN);
      }

      const { sessionId } = req.params;
      const session = await sessionRepository.deleteSessionAdmin(sessionId);
      if (!session) {
        throw new NotFoundError('Không tìm thấy thiết bị/session', ERROR_CODE.SESSION_NOT_FOUND);
      }

      await systemLogRepository.createLog({
        employeeId: session.employee_id,
        accountId: req.auth.accountId,
        action: 'DEVICE_REVOKED',
        description: `Thu hồi thiết bị (Session ID: ${sessionId})`,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip,
        status: 'SUCCESS'
      });

      res.status(200).json({
        success: true,
        message: 'Thu hồi thiết bị thành công'
      });
    } catch (err) {
      next(err);
    }
  }

  async getEmployeeDevicesAdmin(req, res, next) {
    try {
      if (ROLE.ROLE_LEVEL[req.auth.role] < ROLE.ROLE_LEVEL[ROLE.MANAGER]) {
        throw new ForbiddenError('Không có quyền truy cập thông tin thiết bị', ERROR_CODE.FORBIDDEN);
      }
      const { employeeId } = req.params;
      const result = await pool.query(`
        SELECT session_id, device_name, device_fingerprint, ip_address, session_status, login_at, last_activity_at
        FROM public.user_sessions
        WHERE employee_id = $1
        ORDER BY login_at DESC
      `, [employeeId]);

      res.status(200).json({
        success: true,
        message: 'Lấy danh sách thiết bị nhân viên thành công',
        data: result.rows.map(row => {
          const deviceName = row.device_name || '';
          let browser = 'Chrome 125.0.0';
          let os = 'Windows 11';
          if (deviceName) {
            const parts = deviceName.split(' on ');
            if (parts.length > 0) browser = parts[0];
            if (parts.length > 1) os = parts[1];
          }
          return {
            deviceId: row.session_id,
            deviceName: row.device_name || 'Thiết bị chưa rõ',
            browser,
            operatingSystem: os,
            fingerprint: row.device_fingerprint || 'N/A',
            registeredTime: row.login_at,
            lastLogin: row.last_activity_at || row.login_at,
            status: row.session_status === 'ACTIVE' ? 1 : 0
          };
        })
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new DeviceAdminController();
