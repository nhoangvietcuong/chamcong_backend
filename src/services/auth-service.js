const { pool } = require('../config/db');
const accountRepository = require('../repositories/account-repository');
const sessionRepository = require('../repositories/session-repository');
const deviceRepository = require('../repositories/device-repository');
const systemLogRepository = require('../repositories/system-log-repository');
const { comparePassword } = require('../utils/password');
const { generateRandomToken } = require('../utils/token');
const { hashRefreshToken } = require('../utils/hash');
const { generateAccessToken } = require('../utils/jwt');
const { UnauthorizedError } = require('../errors/app-error');
const ERROR_CODE = require('../constants/error-code.constants');
const SESSION_STATUS = require('../constants/session-status.constants');

class AuthService {
  async login(loginData, ipAddress) {
    const { username, password, deviceFingerprint, deviceName } = loginData;

    const account = await accountRepository.findByUsername(username);
    if (!account) {
      throw new UnauthorizedError('Tên đăng nhập hoặc mật khẩu không đúng', ERROR_CODE.INVALID_CREDENTIALS);
    }

    if (account.is_active !== 1) {
      throw new UnauthorizedError('Tài khoản đã bị vô hiệu hóa', ERROR_CODE.ACCOUNT_INACTIVE);
    }

    if (account.employee_status !== 1) {
      throw new UnauthorizedError('Nhân viên đã ngừng hoạt động', ERROR_CODE.EMPLOYEE_INACTIVE);
    }

    const isPasswordMatch = await comparePassword(password, account.password_hash);
    if (!isPasswordMatch) {
      throw new UnauthorizedError('Tên đăng nhập hoặc mật khẩu không đúng', ERROR_CODE.INVALID_CREDENTIALS);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await accountRepository.lockAccount(account.account_id, client);

      const activeSession = await sessionRepository.findActiveByAccountId(account.account_id, client);
      if (activeSession) {
        await sessionRepository.deactivateSession(activeSession.session_id, SESSION_STATUS.REPLACED, client);
      }

      await deviceRepository.upsertDevice(account.employee_id, deviceFingerprint, deviceName, client);

      const rawRefreshToken = generateRandomToken();
      const hashedToken = hashRefreshToken(rawRefreshToken);

      const refreshExpiresDays = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS || '30', 10);
      const expiresAt = new Date(Date.now() + refreshExpiresDays * 24 * 60 * 60 * 1000);

      const session = await sessionRepository.createSession({
        accountId: account.account_id,
        employeeId: account.employee_id,
        deviceFingerprint,
        deviceName,
        ipAddress,
        expiresAt,
        refreshTokenHash: hashedToken,
      }, client);

      await systemLogRepository.createLog({
        employeeId: account.employee_id,
        accountId: account.account_id,
        action: 'LOGIN',
        description: 'Đăng nhập thành công',
        deviceFingerprint,
        ipAddress,
        status: 'SUCCESS',
      }, client);

      await client.query('COMMIT');

      const accessToken = generateAccessToken({
        sessionId: session.session_id,
        accountId: account.account_id,
        employeeId: account.employee_id,
        role: account.role_name,
      });

      return {
        accessToken,
        refreshToken: rawRefreshToken,
        requirePasswordChange: !!account.require_password_change,
        user: {
          accountId: parseInt(account.account_id, 10),
          employeeId: parseInt(account.employee_id, 10),
          employeeCode: account.employee_code,
          fullName: account.full_name,
          email: account.email || null,
          phone: account.phone || null,
          avatarUrl: account.avatar_url || null,
          username: account.username,
          role: account.role_name,
          departmentId: parseInt(account.department_id, 10),
          departmentName: account.department_name || null,
          requirePasswordChange: !!account.require_password_change,
        },
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async refreshToken(refreshTokenData) {
    const { refreshToken, deviceFingerprint } = refreshTokenData;
    const hashedToken = hashRefreshToken(refreshToken);

    const session = await sessionRepository.findSessionAndUserByRefreshTokenHash(hashedToken);
    if (!session) {
      throw new UnauthorizedError('Refresh Token không tồn tại hoặc không hợp lệ', ERROR_CODE.REFRESH_TOKEN_INVALID);
    }

    if (session.session_status !== SESSION_STATUS.ACTIVE) {
      throw new UnauthorizedError('Phiên đăng nhập không còn hoạt động', ERROR_CODE.SESSION_NOT_ACTIVE);
    }

    if (new Date(session.expires_at) <= new Date()) {
      throw new UnauthorizedError('Phiên đăng nhập đã hết hạn', ERROR_CODE.REFRESH_TOKEN_EXPIRED);
    }

    if (session.device_fingerprint !== deviceFingerprint) {
      throw new UnauthorizedError('Thiết bị không khớp với phiên đăng nhập', ERROR_CODE.DEVICE_FINGERPRINT_MISMATCH);
    }

    if (session.account_active !== 1) {
      throw new UnauthorizedError('Tài khoản đã bị vô hiệu hóa', ERROR_CODE.ACCOUNT_INACTIVE);
    }

    if (session.employee_status !== 1) {
      throw new UnauthorizedError('Nhân viên đã ngừng hoạt động', ERROR_CODE.EMPLOYEE_INACTIVE);
    }

    await sessionRepository.updateLastActivity(session.session_id);

    const accessToken = generateAccessToken({
      sessionId: session.session_id,
      accountId: session.account_id,
      employeeId: session.employee_id,
      role: session.role_name,
    });

    return { accessToken };
  }

  async logout(authData, ipAddress) {
    const { sessionId, accountId, employeeId, deviceFingerprint } = authData;

    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      return;
    }

    if (session.session_status === SESSION_STATUS.ACTIVE) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await sessionRepository.deactivateSession(sessionId, SESSION_STATUS.LOGGED_OUT, client);

        await systemLogRepository.createLog({
          employeeId,
          accountId,
          action: 'LOGOUT',
          description: 'Đăng xuất thành công',
          deviceFingerprint,
          ipAddress,
          status: 'SUCCESS',
        }, client);

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
  }

  async getCurrentUser(accountId) {
    const account = await accountRepository.findById(accountId);
    if (!account) {
      throw new UnauthorizedError('Tài khoản không tồn tại', ERROR_CODE.INVALID_CREDENTIALS);
    }
    if (account.is_active !== 1) {
      throw new UnauthorizedError('Tài khoản đã bị vô hiệu hóa', ERROR_CODE.ACCOUNT_INACTIVE);
    }
    if (account.employee_status !== 1) {
      throw new UnauthorizedError('Nhân viên đã ngừng hoạt động', ERROR_CODE.EMPLOYEE_INACTIVE);
    }

    return {
      accountId: parseInt(account.account_id, 10),
      employeeId: parseInt(account.employee_id, 10),
      employeeCode: account.employee_code,
      fullName: account.full_name,
      email: account.email,
      phone: account.phone,
      username: account.username,
      role: account.role_name,
      departmentId: parseInt(account.department_id, 10),
      avatarUrl: account.avatar_url || null,
      requirePasswordChange: !!account.require_password_change,
    };
  }
}

module.exports = new AuthService();
