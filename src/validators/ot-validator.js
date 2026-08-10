const { body } = require('express-validator');

const createRequestValidator = [
  body('workDate')
    .trim()
    .notEmpty().withMessage('Ngày đăng ký tăng ca không được để trống')
    .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Ngày đăng ký tăng ca không đúng định dạng YYYY-MM-DD'),
  body('startTime')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).withMessage('Giờ bắt đầu không đúng định dạng HH:mm:ss'),
  body('endTime')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).withMessage('Giờ kết thúc không đúng định dạng HH:mm:ss'),
  body('reason')
    .trim()
    .notEmpty().withMessage('Lý do đăng ký tăng ca không được để trống')
    .isLength({ min: 5, max: 100 }).withMessage('Lý do đăng ký tăng ca phải từ 5 đến 100 ký tự'),
];

const rejectRequestValidator = [
  body('rejectReason')
    .trim()
    .notEmpty().withMessage('Lý do từ chối không được để trống')
    .isLength({ min: 5, max: 100 }).withMessage('Lý do từ chối phải từ 5 đến 100 ký tự'),
];

module.exports = {
  createRequestValidator,
  rejectRequestValidator,
};
