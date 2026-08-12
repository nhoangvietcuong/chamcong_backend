const { body, query, param } = require('express-validator');

const assignmentQueryValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Trang phải là số nguyên lớn hơn hoặc bằng 1'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Số bản ghi mỗi trang phải từ 1 đến 100'),
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
  query('workDate')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Ngày làm việc không đúng định dạng YYYY-MM-DD'),
  query('fromDate')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Ngày bắt đầu không đúng định dạng YYYY-MM-DD'),
  query('toDate')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Ngày kết thúc không đúng định dạng YYYY-MM-DD'),
  query('status')
    .optional()
    .isIn(['ASSIGNED', 'CANCELLED', 'COMPLETED'])
    .withMessage('Trạng thái phân công không hợp lệ'),
  query('sortBy')
    .optional()
    .isIn(['assignmentId', 'assignment_id', 'workDate', 'status', 'createdAt'])
    .withMessage('Trường sắp xếp không hợp lệ'),
  query('sortOrder')
    .optional()
    .isIn(['ASC', 'DESC', 'asc', 'desc'])
    .withMessage('Thứ tự sắp xếp chỉ nhận giá trị ASC hoặc DESC'),
];

const createAssignmentValidator = [
  body('employeeId')
    .notEmpty()
    .withMessage('ID nhân viên là bắt buộc')
    .isInt()
    .withMessage('ID nhân viên phải là số nguyên'),
  body('locationId')
    .optional()
    .isInt()
    .withMessage('ID địa điểm phải là số nguyên'),
  body('locationIds')
    .optional()
    .isArray({ min: 1 })
    .withMessage('locationIds phải là mảng chứa ít nhất 1 địa điểm'),
  body('locationIds.*')
    .optional()
    .isInt()
    .withMessage('ID địa điểm phải là số nguyên'),
  body().custom(reqBody => {
    if (!reqBody.locationId && (!reqBody.locationIds || !Array.isArray(reqBody.locationIds) || reqBody.locationIds.length === 0)) {
      throw new Error('Địa điểm làm việc (locationId hoặc locationIds) là bắt buộc');
    }
    return true;
  }),
  body('shiftId')
    .optional()
    .isInt()
    .withMessage('ID ca làm việc phải là số nguyên'),
  body('workDate')
    .notEmpty()
    .withMessage('Ngày làm việc là bắt buộc')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Ngày làm việc không đúng định dạng YYYY-MM-DD'),
  body('note')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Ghi chú không được quá 255 ký tự'),
];

const updateAssignmentValidator = [
  param('id')
    .isInt()
    .withMessage('ID phân công phải là số nguyên'),
  ...createAssignmentValidator
];

const cancelAssignmentValidator = [
  param('id')
    .isInt()
    .withMessage('ID phân công phải là số nguyên'),
  body('reason')
    .trim()
    .notEmpty()
    .withMessage('Lý do hủy phân công không được để trống'),
];

const employeeAssignmentQueryValidator = [
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
  query('status')
    .optional()
    .isIn(['ASSIGNED', 'CANCELLED', 'COMPLETED'])
    .withMessage('Trạng thái phân công không hợp lệ'),
];

const assignmentIdParamValidator = [
  param('id')
    .isInt()
    .withMessage('ID phân công phải là số nguyên')
];

const calendarQueryValidator = [
  query('year')
    .optional()
    .isInt({ min: 2000, max: 2100 })
    .withMessage('Năm không hợp lệ (2000 - 2100)'),
  query('month')
    .optional()
    .isInt({ min: 1, max: 12 })
    .withMessage('Tháng phải là số nguyên từ 1 đến 12'),
  query('departmentId')
    .optional()
    .isInt()
    .withMessage('ID phòng ban phải là số nguyên'),
  query('locationId')
    .optional()
    .isInt()
    .withMessage('ID địa điểm phải là số nguyên')
];

const bulkCreateAssignmentValidator = [
  body('employeeIds')
    .isArray({ min: 1 })
    .withMessage('employeeIds phải là mảng chứa ít nhất 1 ID nhân viên'),
  body('employeeIds.*')
    .isInt()
    .withMessage('ID nhân viên phải là số nguyên'),
  body('locationId')
    .optional()
    .isInt()
    .withMessage('ID địa điểm phải là số nguyên'),
  body('locationIds')
    .optional()
    .isArray({ min: 1 })
    .withMessage('locationIds phải là mảng chứa ít nhất 1 địa điểm'),
  body('locationIds.*')
    .optional()
    .isInt()
    .withMessage('ID địa điểm phải là số nguyên'),
  body().custom(reqBody => {
    if (!reqBody.locationId && (!reqBody.locationIds || !Array.isArray(reqBody.locationIds) || reqBody.locationIds.length === 0)) {
      throw new Error('Địa điểm làm việc (locationId hoặc locationIds) là bắt buộc');
    }
    return true;
  }),
  body('shiftId')
    .optional()
    .isInt()
    .withMessage('ID ca làm việc phải là số nguyên'),
  body('startDate')
    .notEmpty()
    .withMessage('Ngày bắt đầu là bắt buộc')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Ngày bắt đầu không đúng định dạng YYYY-MM-DD'),
  body('endDate')
    .notEmpty()
    .withMessage('Ngày kết thúc là bắt buộc')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Ngày kết thúc không đúng định dạng YYYY-MM-DD'),
  body('recurrenceType')
    .optional()
    .isIn(['NONE', 'WEEKLY', 'MONTHLY'])
    .withMessage('Kiểu lặp lại không hợp lệ (NONE, WEEKLY, MONTHLY)'),
  body('recurrenceDays')
    .optional()
    .isArray()
    .withMessage('recurrenceDays phải là một mảng'),
  body('note')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Ghi chú không được quá 255 ký tự'),
];

const copyAssignmentValidator = [
  body('sourceStartDate')
    .notEmpty()
    .withMessage('Ngày bắt đầu tuần nguồn là bắt buộc')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Ngày bắt đầu tuần nguồn không đúng định dạng YYYY-MM-DD'),
  body('sourceEndDate')
    .notEmpty()
    .withMessage('Ngày kết thúc tuần nguồn là bắt buộc')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Ngày kết thúc tuần nguồn không đúng định dạng YYYY-MM-DD'),
  body('targetStartDate')
    .notEmpty()
    .withMessage('Ngày bắt đầu tuần đích là bắt buộc')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Ngày bắt đầu tuần đích không đúng định dạng YYYY-MM-DD'),
];

const bulkDeleteAssignmentValidator = [
  body('startDate')
    .notEmpty()
    .withMessage('Ngày bắt đầu là bắt buộc')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Ngày bắt đầu không đúng định dạng YYYY-MM-DD'),
  body('endDate')
    .notEmpty()
    .withMessage('Ngày kết thúc là bắt buộc')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Ngày kết thúc không đúng định dạng YYYY-MM-DD'),
  body('employeeIds')
    .optional()
    .isArray()
    .withMessage('employeeIds phải là mảng'),
  body('employeeIds.*')
    .optional()
    .isInt()
    .withMessage('ID nhân viên phải là số nguyên'),
  body('locationId')
    .optional()
    .isInt()
    .withMessage('ID địa điểm phải là số nguyên'),
];

const bulkUpdateLocationValidator = [
  body('sourceLocationId')
    .notEmpty()
    .withMessage('ID địa điểm nguồn là bắt buộc')
    .isInt()
    .withMessage('ID địa điểm nguồn phải là số nguyên'),
  body('targetLocationId')
    .notEmpty()
    .withMessage('ID địa điểm đích là bắt buộc')
    .isInt()
    .withMessage('ID địa điểm đích phải là số nguyên'),
  body('startDate')
    .notEmpty()
    .withMessage('Ngày bắt đầu là bắt buộc')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Ngày bắt đầu không đúng định dạng YYYY-MM-DD'),
  body('endDate')
    .notEmpty()
    .withMessage('Ngày kết thúc là bắt buộc')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Ngày kết thúc không đúng định dạng YYYY-MM-DD'),
  body('employeeIds')
    .optional()
    .isArray()
    .withMessage('employeeIds phải là mảng'),
  body('employeeIds.*')
    .optional()
    .isInt()
    .withMessage('ID nhân viên phải là số nguyên'),
];

const bulkUpdateSelectedAssignmentsValidator = [
  body('assignmentIds')
    .notEmpty()
    .withMessage('Mảng ID phân công (assignmentIds) là bắt buộc')
    .isArray({ min: 1 })
    .withMessage('assignmentIds phải là mảng chứa ít nhất 1 ID phân công'),
  body('assignmentIds.*')
    .isInt()
    .withMessage('ID phân công phải là số nguyên'),
  body('locationIds')
    .optional()
    .isArray()
    .withMessage('locationIds phải là mảng'),
  body('locationIds.*')
    .optional()
    .isInt()
    .withMessage('ID địa điểm phải là số nguyên'),
  body('shiftId')
    .optional()
    .isInt()
    .withMessage('ID ca làm việc phải là số nguyên'),
  body('note')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Ghi chú không được vượt quá 255 ký tự'),
  body('mode')
    .optional()
    .isIn(['REPLACE', 'APPEND', 'REMOVE', 'CUSTOM'])
    .withMessage('Chế độ địa điểm chỉ nhận REPLACE, APPEND, REMOVE hoặc CUSTOM'),
  body('addLocationIds')
    .optional()
    .isArray()
    .withMessage('addLocationIds phải là mảng'),
  body('addLocationIds.*')
    .optional()
    .isInt()
    .withMessage('ID địa điểm phải là số nguyên'),
  body('removeLocationIds')
    .optional()
    .isArray()
    .withMessage('removeLocationIds phải là mảng'),
  body('removeLocationIds.*')
    .optional()
    .isInt()
    .withMessage('ID địa điểm phải là số nguyên'),
];

const bulkDeleteSelectedAssignmentsValidator = [
  body('assignmentIds')
    .notEmpty()
    .withMessage('Mảng ID phân công (assignmentIds) là bắt buộc')
    .isArray({ min: 1 })
    .withMessage('assignmentIds phải là mảng chứa ít nhất 1 ID phân công'),
  body('assignmentIds.*')
    .isInt()
    .withMessage('ID phân công phải là số nguyên'),
];

module.exports = {
  assignmentQueryValidator,
  createAssignmentValidator,
  updateAssignmentValidator,
  cancelAssignmentValidator,
  employeeAssignmentQueryValidator,
  assignmentIdParamValidator,
  calendarQueryValidator,
  bulkCreateAssignmentValidator,
  copyAssignmentValidator,
  bulkDeleteAssignmentValidator,
  bulkUpdateLocationValidator,
  bulkUpdateSelectedAssignmentsValidator,
  bulkDeleteSelectedAssignmentsValidator
};
