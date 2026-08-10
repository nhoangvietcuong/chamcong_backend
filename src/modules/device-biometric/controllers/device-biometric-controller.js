const deviceBiometricService = require('../services/device-biometric.service');
const webauthnService = require('../services/webauthn.service');
const challengeService = require('../services/challenge.service');
const employeeRepository = require('../../../repositories/employee-repository');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../../../errors/app-error');
const ERROR_CODE = require('../../../constants/error-code.constants');
const ROLE = require('../../../constants/role.constants');
const deviceBiometricRepository = require('../repositories/device-biometric-repository');
const systemLogRepository = require('../../../repositories/system-log-repository');

class DeviceBiometricController {
  async getAdminCredentials(req, res, next) {
    try {
      if (ROLE.ROLE_LEVEL[req.auth.role] < ROLE.ROLE_LEVEL[ROLE.MANAGER]) {
        throw new ForbiddenError('Không có quyền truy cập danh sách khóa bảo mật', ERROR_CODE.FORBIDDEN);
      }

      const page = parseInt(req.query.page || '1', 10);
      const limit = parseInt(req.query.limit || '10', 10);
      const { keyword, status } = req.query;

      const result = await deviceBiometricRepository.findAndCountAdminCredentials({
        page,
        limit,
        keyword,
        status
      });

      const { getPagination } = require('../../../utils/pagination');
      res.status(200).json({
        success: true,
        message: 'Lấy danh sách khóa WebAuthn thành công',
        data: {
          items: result.items,
          pagination: getPagination(page, limit, result.total)
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async updateStatusAdmin(req, res, next) {
    try {
      if (ROLE.ROLE_LEVEL[req.auth.role] < ROLE.ROLE_LEVEL[ROLE.MANAGER]) {
        throw new ForbiddenError('Không có quyền sửa đổi trạng thái khóa bảo mật', ERROR_CODE.FORBIDDEN);
      }

      const { credentialId } = req.params;
      const { status } = req.body;

      if (status !== 0 && status !== 1) {
        throw new BadRequestError('Trạng thái không hợp lệ (chỉ nhận 0 hoặc 1)', ERROR_CODE.INVALID_INPUT);
      }

      const cred = await deviceBiometricRepository.updateStatusAdmin(credentialId, status);
      if (!cred) {
        throw new NotFoundError('Không tìm thấy khóa bảo mật', ERROR_CODE.CREDENTIAL_NOT_FOUND);
      }

      await systemLogRepository.createLog({
        employeeId: cred.employee_id,
        accountId: req.auth.accountId,
        action: status === 1 ? 'WEBAUTHN_CREDENTIAL_ENABLED' : 'WEBAUTHN_CREDENTIAL_DISABLED',
        description: `${status === 1 ? 'Kích hoạt' : 'Vô hiệu hóa'} khóa WebAuthn ID ${credentialId}`,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip,
        status: 'SUCCESS'
      });

      res.status(200).json({
        success: true,
        message: `${status === 1 ? 'Kích hoạt' : 'Vô hiệu hóa'} khóa bảo mật thành công`,
        data: cred
      });
    } catch (err) {
      next(err);
    }
  }

  async revokeCredentialAdmin(req, res, next) {
    try {
      if (ROLE.ROLE_LEVEL[req.auth.role] < ROLE.ROLE_LEVEL[ROLE.MANAGER]) {
        throw new ForbiddenError('Không có quyền thu hồi khóa bảo mật', ERROR_CODE.FORBIDDEN);
      }

      const { credentialId } = req.params;
      const cred = await deviceBiometricRepository.revokeCredentialAdmin(credentialId);
      if (!cred) {
        throw new NotFoundError('Không tìm thấy khóa bảo mật', ERROR_CODE.CREDENTIAL_NOT_FOUND);
      }

      await systemLogRepository.createLog({
        employeeId: cred.employee_id,
        accountId: req.auth.accountId,
        action: 'WEBAUTHN_CREDENTIAL_REVOKED',
        description: `Thu hồi khóa WebAuthn ID ${credentialId}`,
        deviceFingerprint: req.auth.deviceFingerprint,
        ipAddress: req.ip,
        status: 'SUCCESS'
      });

      res.status(200).json({
        success: true,
        message: 'Thu hồi khóa bảo mật thành công'
      });
    } catch (err) {
      next(err);
    }
  }

  async beginRegistration(req, res, next) {
    try {
      let employeeId = req.auth.employeeId;
      const { attachment } = req.body;
      const targetEmployeeId = req.query.employeeId || req.body.employeeId || req.params.employeeId;
      if (ROLE.ROLE_LEVEL[req.auth.role] >= ROLE.ROLE_LEVEL[ROLE.ADMIN] && targetEmployeeId) {
        employeeId = parseInt(targetEmployeeId, 10);
      }
      const sessionId = req.auth.sessionId;
      const employee = await employeeRepository.findById(employeeId);
      if (!employee) {
        throw new NotFoundError('Nhân viên không tồn tại', ERROR_CODE.EMPLOYEE_NOT_FOUND);
      }

      const username = employee.account ? employee.account.username : employee.employeeCode;

      const options = await webauthnService.generateRegistrationOptions(employeeId, username, attachment);

      // Save challenge to cache
      await challengeService.storeChallenge(sessionId, options.challenge);

      res.status(200).json({
        success: true,
        message: 'Registration options generated successfully',
        data: options,
      });
    } catch (err) {
      next(err);
    }
  }

  async finishRegistration(req, res, next) {
    try {
      let employeeId = req.auth.employeeId;
      const targetEmployeeId = req.query.employeeId || req.body.employeeId || req.params.employeeId;
      if (ROLE.ROLE_LEVEL[req.auth.role] >= ROLE.ROLE_LEVEL[ROLE.ADMIN] && targetEmployeeId) {
        employeeId = parseInt(targetEmployeeId, 10);
      }
      const sessionId = req.auth.sessionId;
      const employee = await employeeRepository.findById(employeeId);
      if (!employee) {
        throw new NotFoundError('Nhân viên không tồn tại', ERROR_CODE.EMPLOYEE_NOT_FOUND);
      }
      const username = employee.account ? employee.account.username : employee.employeeCode;

      const result = await deviceBiometricService.registerCredential(employeeId, username, {
        ...req.body,
        sessionId,
      });

      res.status(200).json({
        success: true,
        message: 'Device registered successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async beginAuthentication(req, res, next) {
    try {
      const { employeeId, sessionId } = req.auth;

      const credentials = await deviceBiometricService.listCredentials(employeeId);
      if (credentials.length === 0) {
        throw new NotFoundError('No credentials registered for employee', ERROR_CODE.CREDENTIAL_NOT_FOUND);
      }

      const options = await webauthnService.generateAuthenticationOptions(employeeId, credentials);

      // Save challenge to cache
      await challengeService.storeChallenge(sessionId, options.challenge);

      res.status(200).json({
        success: true,
        message: 'Authentication options generated successfully',
        data: options,
      });
    } catch (err) {
      next(err);
    }
  }

  async finishAuthentication(req, res, next) {
    try {
      const { employeeId, sessionId } = req.auth;
      const employee = await employeeRepository.findById(employeeId);
      const username = employee.account ? employee.account.username : employee.employeeCode;

      const result = await deviceBiometricService.authenticateCredential(employeeId, username, {
        ...req.body,
        sessionId,
      });

      res.status(200).json({
        success: true,
        message: 'Device authenticated successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async getCredentials(req, res, next) {
    try {
      let employeeId = req.auth.employeeId;
      const targetEmployeeId = req.query.employeeId || req.body.employeeId || req.params.employeeId;
      if (ROLE.ROLE_LEVEL[req.auth.role] >= ROLE.ROLE_LEVEL[ROLE.ADMIN] && targetEmployeeId) {
        employeeId = parseInt(targetEmployeeId, 10);
      }
      const credentials = await deviceBiometricService.listCredentials(employeeId);

      res.status(200).json({
        success: true,
        message: 'Credentials listed successfully',
        data: credentials,
      });
    } catch (err) {
      next(err);
    }
  }

  async deleteCredential(req, res, next) {
    try {
      let employeeId = req.auth.employeeId;
      const targetEmployeeId = req.query.employeeId || req.body.employeeId || req.params.employeeId;
      if (ROLE.ROLE_LEVEL[req.auth.role] >= ROLE.ROLE_LEVEL[ROLE.ADMIN] && targetEmployeeId) {
        employeeId = parseInt(targetEmployeeId, 10);
      }
      const credentialId = req.params.id;

      await deviceBiometricService.deleteCredential(employeeId, credentialId);

      res.status(200).json({
        success: true,
        message: 'Credential deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new DeviceBiometricController();
