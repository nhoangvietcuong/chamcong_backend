const { body, query } = require('express-validator');

const employeeQueryValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Trang phải là số nguyên lớn hơn hoặc bằng 1'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Số bản ghi mỗi trang phải từ 1 đến 100'),
  query('status')
    .optional()
    .isIn(['0', '1', 0, 1])
    .withMessage('Trạng thái chỉ nhận giá trị 0 hoặc 1'),
  query('sortOrder')
    .optional()
    .isIn(['ASC', 'DESC', 'asc', 'desc'])
    .withMessage('Thứ tự sắp xếp chỉ nhận giá trị ASC hoặc DESC'),
];

const phoneRegexPattern = /^(0|\+84)[0-9]{9,10}$/;

const createEmployeeValidator = [
  body('employeeCode')
    .trim()
    .notEmpty()
    .withMessage('Mã nhân viên không được để trống'),
  body('fullName')
    .trim()
    .notEmpty()
    .withMessage('Họ và tên không được để trống'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email không được để trống')
    .isEmail()
    .withMessage('Email không đúng định dạng')
    .normalizeEmail(),
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Số điện thoại không được để trống')
    .matches(phoneRegexPattern)
    .withMessage('Số điện thoại không hợp lệ (gồm 10-11 chữ số, VD: 0912345678)'),
  body('departmentId')
    .isInt()
    .withMessage('ID phòng ban phải là số nguyên'),
];

const passwordRegex = /^.{6,}$/;

const createEmployeeWithAccountValidator = [
  body('employee.employeeCode')
    .trim()
    .notEmpty()
    .withMessage('Mã nhân viên không được để trống'),
  body('employee.fullName')
    .trim()
    .notEmpty()
    .withMessage('Họ và tên không được để trống'),
  body('employee.email')
    .trim()
    .notEmpty()
    .withMessage('Email không được để trống')
    .isEmail()
    .withMessage('Email không đúng định dạng')
    .normalizeEmail(),
  body('employee.phone')
    .trim()
    .notEmpty()
    .withMessage('Số điện thoại không được để trống')
    .matches(phoneRegexPattern)
    .withMessage('Số điện thoại không hợp lệ (gồm 10-11 chữ số, VD: 0912345678)'),
  body('employee.departmentId')
    .isInt()
    .withMessage('ID phòng ban phải là số nguyên'),
  body('account.username')
    .trim()
    .notEmpty()
    .withMessage('Tên đăng nhập không được để trống')
    .toLowerCase(),
  body('account.password')
    .matches(passwordRegex)
    .withMessage('Mật khẩu phải chứa ít nhất 6 ký tự'),
  body('account.roleId')
    .isInt()
    .withMessage('ID vai trò phải là số nguyên'),
];

const updateEmployeeValidator = [
  body('fullName')
    .trim()
    .notEmpty()
    .withMessage('Họ và tên không được để trống'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email không được để trống')
    .isEmail()
    .withMessage('Email không đúng định dạng')
    .normalizeEmail(),
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Số điện thoại không được để trống')
    .matches(phoneRegexPattern)
    .withMessage('Số điện thoại không hợp lệ (gồm 10-11 chữ số, VD: 0912345678)'),
  body('departmentId')
    .isInt()
    .withMessage('ID phòng ban phải là số nguyên'),
];

const updateEmployeeStatusValidator = [
  body('status')
    .isIn([0, 1])
    .withMessage('Trạng thái chỉ nhận giá trị 0 hoặc 1'),
];

const updateSelfProfileValidator = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email không được để trống')
    .isEmail()
    .withMessage('Email không đúng định dạng')
    .normalizeEmail(),
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Số điện thoại không được để trống')
    .isLength({ min: 10, max: 11 })
    .withMessage('Số điện thoại phải từ 10 đến 11 ký tự'),
];

const changeSelfPasswordValidator = [
  body('oldPassword')
    .notEmpty()
    .withMessage('Vui lòng nhập mật khẩu cũ'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('Mật khẩu mới phải dài từ 8 ký tự trở lên'),
];

module.exports = {
  employeeQueryValidator,
  createEmployeeValidator,
  createEmployeeWithAccountValidator,
  updateEmployeeValidator,
  updateEmployeeStatusValidator,
  updateSelfProfileValidator,
  changeSelfPasswordValidator,
};
