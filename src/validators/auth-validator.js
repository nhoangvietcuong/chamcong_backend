const { body } = require('express-validator');

const loginValidator = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Tên đăng nhập không được để trống'),
  body('password')
    .notEmpty()
    .withMessage('Mật khẩu không được để trống'),
  body('deviceName')
    .optional()
    .trim(),
];

const refreshTokenValidator = [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh Token không được để trống'),
  body('deviceFingerprint')
    .trim()
    .notEmpty()
    .withMessage('Thiết bị vân tay (device fingerprint) không được để trống'),
];

module.exports = {
  loginValidator,
  refreshTokenValidator,
};
