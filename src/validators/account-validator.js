const { body } = require('express-validator');

const passwordRegex = /^.{6,}$/;
const usernameRegex = /^[a-zA-Z0-9._@-]{3,50}$/;

const createAccountValidator = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Tên đăng nhập không được để trống')
    .isLength({ min: 3, max: 50 })
    .withMessage('Tên đăng nhập phải chứa từ 3 đến 50 ký tự')
    .matches(usernameRegex)
    .withMessage('Tên đăng nhập chỉ được chứa chữ cái, chữ số, và các ký tự . _ - @')
    .toLowerCase(),
  body('password')
    .matches(passwordRegex)
    .withMessage('Mật khẩu phải chứa ít nhất 6 ký tự'),
  body('roleId')
    .isInt()
    .withMessage('ID vai trò phải là số nguyên'),
];

const updateRoleValidator = [
  body('roleId')
    .isInt()
    .withMessage('ID vai trò phải là số nguyên'),
];

const updateAccountStatusValidator = [
  body('isActive')
    .isIn([0, 1])
    .withMessage('Trạng thái chỉ nhận giá trị 0 hoặc 1'),
];

const resetPasswordValidator = [
  body('newPassword')
    .matches(passwordRegex)
    .withMessage('Mật khẩu mới phải chứa ít nhất 6 ký tự'),
];

const updateUsernameValidator = [
  body('newUsername')
    .trim()
    .notEmpty()
    .withMessage('Tên đăng nhập mới không được để trống')
    .isLength({ min: 3, max: 50 })
    .withMessage('Tên đăng nhập mới phải chứa từ 3 đến 50 ký tự')
    .matches(usernameRegex)
    .withMessage('Tên đăng nhập mới chỉ được chứa chữ cái, chữ số, và các ký tự . _ - @')
    .toLowerCase(),
];

module.exports = {
  createAccountValidator,
  updateRoleValidator,
  updateAccountStatusValidator,
  resetPasswordValidator,
  updateUsernameValidator,
};


