const { body, query, param } = require('express-validator');

const checkInCheckOutValidator = [
  body('assignmentId')
    .notEmpty()
    .withMessage('ID phân công là bắt buộc')
    .isInt()
    .withMessage('ID phân công phải là số nguyên'),
  body('latitude')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: -90, max: 90 })
    .withMessage('Vĩ độ phải nằm trong khoảng từ -90 đến 90'),
  body('longitude')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: -180, max: 180 })
    .withMessage('Kinh độ phải nằm trong khoảng từ -180 đến 180'),
  body('gpsAccuracy')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat()
    .withMessage('Độ chính xác GPS phải là số thực'),
  body('capturedAtClient')
    .notEmpty()
    .withMessage('Thời gian chụp phía client là bắt buộc')
    .isISO8601()
    .withMessage('Thời gian phía client phải ở định dạng ISO 8601'),
  body('clientRequestId')
    .notEmpty()
    .withMessage('clientRequestId là bắt buộc')
    .isUUID()
    .withMessage('clientRequestId phải ở định dạng UUID'),
  body('isPwaStandalone')
    .notEmpty()
    .withMessage('isPwaStandalone là bắt buộc')
    .isInt({ min: 0, max: 1 })
    .withMessage('isPwaStandalone chỉ nhận giá trị 0 hoặc 1'),
];

const attendanceHistoryQueryValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Trang phải là số nguyên lớn hơn hoặc bằng 1'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Số bản ghi mỗi trang phải từ 1 đến 100'),
  query('fromDate')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Ngày bắt đầu không đúng định dạng YYYY-MM-DD'),
  query('toDate')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Ngày kết thúc không đúng định dạng YYYY-MM-DD'),
  query('attendanceStatus')
    .optional()
    .isIn(['IN_PROGRESS', 'COMPLETED', 'INVALID', 'REVIEW_REQUIRED'])
    .withMessage('Trạng thái chấm công không hợp lệ'),
  query('reviewStatus')
    .optional()
    .isIn(['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'])
    .withMessage('Trạng thái duyệt không hợp lệ'),
];

const adminAttendanceQueryValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Trang phải là số nguyên lớn hơn hoặc bằng 1'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100000 })
    .withMessage('Số bản ghi mỗi trang phải từ 1 đến 100000'),
  query('fromDate')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Ngày bắt đầu không đúng định dạng YYYY-MM-DD'),
  query('toDate')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Ngày kết thúc không đúng định dạng YYYY-MM-DD'),
  query('employeeId')
    .optional()
    .isInt()
    .withMessage('ID nhân viên phải là số nguyên'),
  query('departmentId')
    .optional()
    .isInt()
    .withMessage('ID phòng ban phải là số nguyên'),
  query('locationId')
    .optional()
    .isInt()
    .withMessage('ID địa điểm phải là số nguyên'),
  query('attendanceStatus')
    .optional()
    .isIn(['IN_PROGRESS', 'COMPLETED', 'INVALID', 'REVIEW_REQUIRED'])
    .withMessage('Trạng thái chấm công không hợp lệ'),
  query('reviewStatus')
    .optional()
    .isIn(['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'])
    .withMessage('Trạng thái duyệt không hợp lệ'),
  query('isOfflineSync')
    .optional()
    .isIn(['0', '1', 0, 1])
    .withMessage('isOfflineSync chỉ nhận giá trị 0 hoặc 1'),
];

const reviewBodyValidator = [
  param('attendanceId')
    .isInt({ min: 1 })
    .withMessage('attendanceId phải là số nguyên hợp lệ'),
  body('reviewStatus')
    .notEmpty()
    .withMessage('reviewStatus là bắt buộc')
    .isIn(['APPROVED', 'REJECTED'])
    .withMessage('reviewStatus chỉ chấp nhận APPROVED hoặc REJECTED'),
  body('reviewNote')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('reviewNote tối đa 500 ký tự'),
];

const reviewQueueQueryValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Trang phải là số nguyên lớn hơn hoặc bằng 1'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Số bản ghi mỗi trang phải từ 1 đến 100'),
  query('departmentId')
    .optional()
    .isInt()
    .withMessage('ID phòng ban phải là số nguyên'),
  query('locationId')
    .optional()
    .isInt()
    .withMessage('ID địa điểm phải là số nguyên'),
];

const offlineSyncValidator = [
  body('clientRequestId')
    .notEmpty()
    .withMessage('clientRequestId là bắt buộc')
    .isString()
    .withMessage('clientRequestId phải là chuỗi ký tự'),
  body('queueId')
    .optional({ nullable: true }),
  body('assignmentId')
    .optional({ nullable: true }),
  body('type')
    .notEmpty()
    .withMessage('Loại chấm công là bắt buộc')
    .isIn(['check-in', 'check-out', 'ot-check-in', 'ot-check-out'])
    .withMessage('Loại chấm công không hợp lệ'),
  body('capturedAtClient')
    .notEmpty()
    .withMessage('Thời gian chụp phía client là bắt buộc'),
  body('latitude')
    .optional({ nullable: true }),
  body('longitude')
    .optional({ nullable: true }),
  body('gpsAccuracy')
    .optional({ nullable: true }),
  body('isNoGps')
    .optional({ nullable: true }),
];

const offlineReviewQueryValidator = [
  query('page').optional().isInt({ min: 1 }).withMessage('Trang phải lớn hơn hoặc bằng 1'),
  query('limit').optional().isInt({ min: 1 }).withMessage('Giới hạn phải lớn hơn hoặc bằng 1'),
  query('departmentId').optional().isInt().withMessage('ID phòng ban phải là số nguyên'),
  query('locationId').optional().isInt().withMessage('ID địa điểm phải là số nguyên'),
];

const offlineRejectValidator = [
  body('reviewNote')
    .notEmpty()
    .withMessage('Lý do từ chối (reviewNote) là bắt buộc')
    .isString()
    .withMessage('reviewNote phải là chuỗi ký tự')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Lý do từ chối không được để trống'),
];

const offlineApproveValidator = [
  body('reviewNote')
    .optional()
    .isString()
    .withMessage('reviewNote phải là chuỗi ký tự'),
];

const getAttendancePhotosValidator = [
  param('attendanceId')
    .notEmpty()
    .withMessage('ID chấm công là bắt buộc')
    .isInt()
    .withMessage('ID chấm công phải là số nguyên'),
];

const getEmployeePhotosValidator = [
  param('employeeId')
    .notEmpty()
    .withMessage('ID nhân viên là bắt buộc')
    .isInt()
    .withMessage('ID nhân viên phải là số nguyên'),
  query('photoType')
    .optional()
    .isIn([
      'LOCATION_BEFORE_FACE',
      'LOCATION_CAPTURE',
      'FACE_CAPTURE',
      'CHECK_IN_FINAL',
      'CHECK_OUT_FINAL',
      'OFFLINE_SYNC',
      'MANUAL_REVIEW',
      'ADMIN_UPLOAD'
    ])
    .withMessage('Loại ảnh không hợp lệ'),
  query('dateFrom')
    .optional()
    .isISO8601()
    .withMessage('Ngày bắt đầu không đúng định dạng ISO8601'),
  query('dateTo')
    .optional()
    .isISO8601()
    .withMessage('Ngày kết thúc không đúng định dạng ISO8601'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Trang phải là số nguyên lớn hơn hoặc bằng 1'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Số lượng bản ghi mỗi trang phải từ 1 đến 100'),
];

const checkInCheckOutOtValidator = [
  body('otRequestId')
    .notEmpty()
    .withMessage('ID yêu cầu tăng ca là bắt buộc')
    .isInt()
    .withMessage('ID yêu cầu tăng ca phải là số nguyên'),
  body('latitude')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: -90, max: 90 })
    .withMessage('Vĩ độ phải nằm trong khoảng từ -90 đến 90'),
  body('longitude')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: -180, max: 180 })
    .withMessage('Kinh độ phải nằm trong khoảng từ -180 đến 180'),
  body('gpsAccuracy')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat()
    .withMessage('Độ chính xác GPS phải là số thực'),
  body('capturedAtClient')
    .notEmpty()
    .withMessage('Thời gian chụp phía client là bắt buộc')
    .isISO8601()
    .withMessage('Thời gian phía client phải ở định dạng ISO 8601'),
  body('clientRequestId')
    .notEmpty()
    .withMessage('clientRequestId là bắt buộc')
    .isUUID()
    .withMessage('clientRequestId phải ở định dạng UUID'),
  body('isPwaStandalone')
    .notEmpty()
    .withMessage('isPwaStandalone là bắt buộc')
    .isInt({ min: 0, max: 1 })
    .withMessage('isPwaStandalone chỉ nhận giá trị 0 hoặc 1'),
];

module.exports = {
  checkInCheckOutValidator,
  checkInCheckOutOtValidator,
  attendanceHistoryQueryValidator,
  adminAttendanceQueryValidator,
  reviewBodyValidator,
  reviewQueueQueryValidator,
  offlineSyncValidator,
  offlineReviewQueryValidator,
  offlineRejectValidator,
  offlineApproveValidator,
  getAttendancePhotosValidator,
  getEmployeePhotosValidator,
};
