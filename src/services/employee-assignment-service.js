const assignmentRepository = require('../repositories/assignment-repository');
const { getPagination } = require('../utils/pagination');
const { NotFoundError, ForbiddenError } = require('../errors/app-error');
const ERROR_CODE = require('../constants/error-code.constants');
const { getTodayDateString } = require('../utils/date');

class EmployeeAssignmentService {
  async getTodayAssignment(employeeId) {
    const todayStr = getTodayDateString();
    return await assignmentRepository.findTodayAssignment(employeeId, todayStr);
  }

  async getPersonalAssignmentById(id, employeeId) {
    const assignment = await assignmentRepository.findById(id);
    if (!assignment) {
      throw new NotFoundError('Không tìm thấy phân công', ERROR_CODE.ASSIGNMENT_NOT_FOUND);
    }

    if (parseInt(assignment.employee.employeeId, 10) !== parseInt(employeeId, 10)) {
      throw new ForbiddenError('Bạn không có quyền truy cập thông tin phân công của người khác', ERROR_CODE.FORBIDDEN);
    }

    // Only return necessary public info (do not return internal/private details)
    return {
      assignmentId: assignment.assignmentId,
      workDate: assignment.workDate,
      status: assignment.status,
      note: assignment.note,
      location: assignment.location
    };
  }

  async getPersonalAssignmentsHistory(employeeId, queryParams) {
    const page = parseInt(queryParams.page || '1', 10);
    const limit = parseInt(queryParams.limit || '10', 10);
    const { fromDate, toDate, status } = queryParams;

    const { items, total } = await assignmentRepository.findHistory(employeeId, {
      fromDate,
      toDate,
      status,
      limit,
      offset: (page - 1) * limit
    });

    const pagination = getPagination(page, limit, total);

    return {
      items,
      pagination
    };
  }
}

module.exports = new EmployeeAssignmentService();
