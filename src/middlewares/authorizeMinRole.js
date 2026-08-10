const { ForbiddenError } = require('../errors/app-error');
const ERROR_CODE = require('../constants/error-code.constants');
const { ROLE_LEVEL } = require('../constants/role.constants');

const authorizeMinRole = (minRole) => {
  return (req, res, next) => {
    if (!req.auth || !req.auth.role) {
      return next(new ForbiddenError('Không có quyền truy cập', ERROR_CODE.FORBIDDEN));
    }

    const currentRole = req.auth.role;
    const currentLevel = ROLE_LEVEL[currentRole] || 0;
    const requiredLevel = ROLE_LEVEL[minRole] || 999;

    if (currentLevel < requiredLevel) {
      return next(new ForbiddenError('Không có quyền truy cập', ERROR_CODE.FORBIDDEN));
    }

    next();
  };
};

module.exports = authorizeMinRole;
