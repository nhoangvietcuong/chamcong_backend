const { verifyAccessToken } = require('../utils/jwt');
const sessionRepository = require('../repositories/session-repository');
const accountRepository = require('../repositories/account-repository');
const { UnauthorizedError } = require('../errors/app-error');
const ERROR_CODE = require('../constants/error-code.constants');

const authenticate = async (req, res, next) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return next(new UnauthorizedError('Thiếu hoặc sai định dạng Access Token', ERROR_CODE.ACCESS_TOKEN_MISSING));
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return next(new UnauthorizedError('Access Token đã hết hạn', ERROR_CODE.ACCESS_TOKEN_EXPIRED));
      }
      return next(new UnauthorizedError('Access Token không hợp lệ', ERROR_CODE.ACCESS_TOKEN_INVALID));
    }

    const { sessionId, accountId, employeeId, role } = decoded;
    if (!sessionId || !accountId || !employeeId) {
      return next(new UnauthorizedError('Access Token không chứa đầy đủ thông tin định danh', ERROR_CODE.ACCESS_TOKEN_INVALID));
    }

    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      return next(new UnauthorizedError('Không tìm thấy phiên đăng nhập', ERROR_CODE.SESSION_NOT_FOUND));
    }

    if (session.session_status !== 'ACTIVE') {
      return next(new UnauthorizedError('Phiên đăng nhập không còn hoạt động', ERROR_CODE.SESSION_NOT_ACTIVE));
    }

    if (new Date(session.expires_at) <= new Date()) {
      return next(new UnauthorizedError('Phiên đăng nhập đã hết hạn', ERROR_CODE.SESSION_EXPIRED));
    }

    const account = await accountRepository.findById(accountId);
    if (!account) {
      return next(new UnauthorizedError('Tài khoản không tồn tại', ERROR_CODE.INVALID_CREDENTIALS));
    }
    if (account.is_active !== 1) {
      return next(new UnauthorizedError('Tài khoản đã bị vô hiệu hóa', ERROR_CODE.ACCOUNT_INACTIVE));
    }
    if (account.employee_status !== 1) {
      return next(new UnauthorizedError('Nhân viên đã ngừng hoạt động', ERROR_CODE.EMPLOYEE_INACTIVE));
    }

    const deviceFingerprint = req.headers['x-device-fingerprint'];
    const isQueryTokenRequest = !!(req.query && req.query.token);
    if (!deviceFingerprint && !isQueryTokenRequest) {
      return next(new UnauthorizedError('Thiết bị không khớp với phiên đăng nhập', ERROR_CODE.DEVICE_FINGERPRINT_REQUIRED));
    }
    if (deviceFingerprint && deviceFingerprint !== session.device_fingerprint) {
      return res.status(401).json({
        success: false,
        message: 'Thiết bị không khớp với phiên đăng nhập',
        errorCode: ERROR_CODE.DEVICE_FINGERPRINT_MISMATCH,
        errors: []
      });
    }

    req.auth = {
      sessionId,
      accountId,
      employeeId,
      role,
      deviceFingerprint,
    };

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = authenticate;
