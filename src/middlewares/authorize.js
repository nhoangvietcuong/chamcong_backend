const { ForbiddenError } = require('../errors/app-error');
const ERROR_CODE = require('../constants/error-code.constants');

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.auth || !req.auth.role) {
      return next(new ForbiddenError('Không có quyền truy cập', ERROR_CODE.FORBIDDEN));
    }

    if (!allowedRoles.includes(req.auth.role)) {
      return next(new ForbiddenError('Không có quyền truy cập', ERROR_CODE.FORBIDDEN));
    }

    next();
  };
};

module.exports = authorize;
