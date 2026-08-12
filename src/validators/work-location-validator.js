const { body, query, param } = require('express-validator');

const workLocationQueryValidator = [
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
  query('sortBy')
    .optional()
    .isIn(['locationId', 'location_id', 'locationName', 'address', 'latitude', 'longitude', 'allowedRadiusMeter', 'status', 'createdAt'])
    .withMessage('Trường sắp xếp không hợp lệ'),
  query('sortOrder')
    .optional()
    .isIn(['ASC', 'DESC', 'asc', 'desc'])
    .withMessage('Thứ tự sắp xếp chỉ nhận giá trị ASC hoặc DESC'),
];

const createWorkLocationValidator = [
  body('locationName')
    .trim()
    .notEmpty()
    .withMessage('Tên địa điểm không được để trống'),
  body('address')
    .trim()
    .notEmpty()
    .withMessage('Địa chỉ chi tiết không được để trống'),
  body('latitude')
    .notEmpty()
    .withMessage('Vĩ độ là bắt buộc')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Vĩ độ phải từ -90 đến 90'),
  body('longitude')
    .notEmpty()
    .withMessage('Kinh độ là bắt buộc')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Kinh độ phải từ -180 đến 180'),
  body('allowedRadiusMeter')
    .notEmpty()
    .withMessage('Bán kính cho phép là bắt buộc')
    .isInt({ min: 1 })
    .withMessage('Bán kính phải là số nguyên lớn hơn 0'),
  body('isCompanyLocation')
    .optional()
    .isBoolean()
    .withMessage('isCompanyLocation phải là boolean'),
];

const updateWorkLocationValidator = [
  param('id')
    .isInt()
    .withMessage('ID địa điểm phải là số nguyên'),
  ...createWorkLocationValidator
];

const updateWorkLocationStatusValidator = [
  param('id')
    .isInt()
    .withMessage('ID địa điểm phải là số nguyên'),
  body('status')
    .isIn([0, 1])
    .withMessage('Trạng thái chỉ nhận giá trị 0 hoặc 1'),
];

const locationIdParamValidator = [
  param('id')
    .isInt()
    .withMessage('ID địa điểm phải là số nguyên')
];

module.exports = {
  workLocationQueryValidator,
  createWorkLocationValidator,
  updateWorkLocationValidator,
  updateWorkLocationStatusValidator,
  locationIdParamValidator
};
