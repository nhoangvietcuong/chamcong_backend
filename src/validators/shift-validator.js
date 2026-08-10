const { body, query, param } = require('express-validator');

const shiftQueryValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Trang phải là số nguyên lớn hơn hoặc bằng 1'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Số bản ghi mỗi trang phải từ 1 đến 100'),
  query('keyword')
    .optional()
    .trim()
];

const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;

const createShiftValidator = [
  body('shiftCode')
    .trim()
    .notEmpty()
    .withMessage('Mã ca làm việc là bắt buộc')
    .isLength({ max: 50 })
    .withMessage('Mã ca làm việc không quá 50 ký tự'),
  body('shiftName')
    .trim()
    .notEmpty()
    .withMessage('Tên ca làm việc là bắt buộc')
    .isLength({ max: 100 })
    .withMessage('Tên ca làm việc không quá 100 ký tự'),
  body('startTime')
    .notEmpty()
    .withMessage('Giờ bắt đầu ca là bắt buộc')
    .matches(timeRegex)
    .withMessage('Giờ bắt đầu không đúng định dạng HH:MM hoặc HH:MM:SS'),
  body('endTime')
    .notEmpty()
    .withMessage('Giờ kết thúc ca là bắt buộc')
    .matches(timeRegex)
    .withMessage('Giờ kết thúc không đúng định dạng HH:MM hoặc HH:MM:SS'),
  body('lateGraceMinutes')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Số phút đi trễ cho phép phải là số nguyên không âm'),
  body('earlyLeaveGraceMinutes')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Số phút về sớm cho phép phải là số nguyên không âm'),
  body('minimumWorkMinutes')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Số phút làm tối thiểu phải là số nguyên không âm'),
  body('isActive')
    .optional()
    .isIn([0, 1, '0', '1'])
    .withMessage('Trạng thái hoạt động không hợp lệ')
];

const updateShiftValidator = [
  param('id')
    .isInt()
    .withMessage('ID ca làm việc phải là số nguyên'),
  ...createShiftValidator
];

const shiftIdParamValidator = [
  param('id')
    .isInt()
    .withMessage('ID ca làm việc phải là số nguyên')
];

module.exports = {
  shiftQueryValidator,
  createShiftValidator,
  updateShiftValidator,
  shiftIdParamValidator
};
