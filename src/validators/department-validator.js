const { body, query } = require('express-validator');

const departmentQueryValidator = [
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

const createDepartmentValidator = [
  body('departmentName')
    .trim()
    .notEmpty()
    .withMessage('Tên phòng ban không được để trống'),
  body('description')
    .trim()
    .notEmpty()
    .withMessage('Mô tả phòng ban không được để trống'),
];

const updateDepartmentValidator = [
  body('departmentName')
    .trim()
    .notEmpty()
    .withMessage('Tên phòng ban không được để trống'),
  body('description')
    .trim()
    .notEmpty()
    .withMessage('Mô tả phòng ban không được để trống'),
];

const updateDepartmentStatusValidator = [
  body('status')
    .isIn([0, 1])
    .withMessage('Trạng thái chỉ nhận giá trị 0 hoặc 1'),
];

module.exports = {
  departmentQueryValidator,
  createDepartmentValidator,
  updateDepartmentValidator,
  updateDepartmentStatusValidator,
};
