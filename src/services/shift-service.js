const shiftRepository = require('../repositories/shift-repository');
const systemLogRepository = require('../repositories/system-log-repository');
const { getPagination } = require('../utils/pagination');
const { NotFoundError, ConflictError, BadRequestError } = require('../errors/app-error');
const ERROR_CODE = require('../constants/error-code.constants');
const SYSTEM_ACTION = require('../constants/system-action.constants');
const { pool } = require('../config/db');

class ShiftService {
  async getShifts(queryParams) {
    const page = parseInt(queryParams.page || '1', 10);
    const limit = parseInt(queryParams.limit || '10', 10);
    const { keyword } = queryParams;

    const { items, total } = await shiftRepository.findAndCount({
      keyword,
      limit,
      offset: (page - 1) * limit
    });

    const pagination = getPagination(page, limit, total);

    return {
      items,
      pagination
    };
  }

  async getShiftById(id) {
    const shift = await shiftRepository.findById(id);
    if (!shift) {
      throw new NotFoundError('Không tìm thấy ca làm việc', ERROR_CODE.SHIFT_NOT_FOUND);
    }
    return shift;
  }

  async createShift(data, authContext) {
    const {
      shiftCode,
      shiftName,
      startTime,
      endTime,
      lateGraceMinutes = 0,
      earlyLeaveGraceMinutes = 0,
      minimumWorkMinutes = 0,
      isActive = 1
    } = data;

    const trimmedCode = shiftCode.trim();
    const trimmedName = shiftName.trim();

    // Check duplicate code
    const existing = await shiftRepository.findByCode(trimmedCode);
    if (existing) {
      throw new ConflictError('Mã ca làm việc đã tồn tại', ERROR_CODE.SHIFT_ALREADY_EXISTS);
    }

    const newShift = await shiftRepository.create({
      shiftCode: trimmedCode,
      shiftName: trimmedName,
      startTime,
      endTime,
      lateGraceMinutes: parseInt(lateGraceMinutes, 10),
      earlyLeaveGraceMinutes: parseInt(earlyLeaveGraceMinutes, 10),
      minimumWorkMinutes: parseInt(minimumWorkMinutes, 10),
      isActive: parseInt(isActive, 10)
    });

    await systemLogRepository.createLog({
      employeeId: authContext.employeeId,
      accountId: authContext.accountId,
      action: SYSTEM_ACTION.CREATE_WORK_SHIFT,
      description: `Tạo ca làm việc mới: ${trimmedName} (${trimmedCode})`,
      deviceFingerprint: authContext.deviceFingerprint,
      ipAddress: authContext.ipAddress,
      status: 'SUCCESS'
    });

    return newShift;
  }

  async updateShift(id, data, authContext) {
    const {
      shiftCode,
      shiftName,
      startTime,
      endTime,
      lateGraceMinutes,
      earlyLeaveGraceMinutes,
      minimumWorkMinutes,
      isActive
    } = data;

    const trimmedCode = shiftCode.trim();
    const trimmedName = shiftName.trim();

    const shift = await shiftRepository.findById(id);
    if (!shift) {
      throw new NotFoundError('Không tìm thấy ca làm việc', ERROR_CODE.SHIFT_NOT_FOUND);
    }

    // Check duplicate code excluding current shift
    const existing = await shiftRepository.findByCode(trimmedCode);
    if (existing && parseInt(existing.shiftId, 10) !== parseInt(id, 10)) {
      throw new ConflictError('Mã ca làm việc đã tồn tại', ERROR_CODE.SHIFT_ALREADY_EXISTS);
    }

    const updatedShift = await shiftRepository.update(id, {
      shiftCode: trimmedCode,
      shiftName: trimmedName,
      startTime,
      endTime,
      lateGraceMinutes: parseInt(lateGraceMinutes, 10),
      earlyLeaveGraceMinutes: parseInt(earlyLeaveGraceMinutes, 10),
      minimumWorkMinutes: parseInt(minimumWorkMinutes, 10),
      isActive: parseInt(isActive, 10)
    });

    await systemLogRepository.createLog({
      employeeId: authContext.employeeId,
      accountId: authContext.accountId,
      action: SYSTEM_ACTION.UPDATE_WORK_SHIFT,
      description: `Cập nhật ca làm việc ID ${id} thành: ${trimmedName} (${trimmedCode})`,
      deviceFingerprint: authContext.deviceFingerprint,
      ipAddress: authContext.ipAddress,
      status: 'SUCCESS'
    });

    return updatedShift;
  }

  async deleteShift(id, authContext) {
    const shift = await shiftRepository.findById(id);
    if (!shift) {
      throw new NotFoundError('Không tìm thấy ca làm việc để xóa', ERROR_CODE.SHIFT_NOT_FOUND);
    }

    // Check if there are assignments linked to this shift
    const assignmentCheck = await pool.query(
      'SELECT COUNT(*)::int AS count FROM public.employee_work_assignments WHERE shift_id = $1',
      [id]
    );
    const count = assignmentCheck.rows[0].count;
    if (count > 0) {
      throw new ConflictError(
        'Không thể xóa ca làm việc đang có phân công công việc liên kết',
        ERROR_CODE.VALIDATION_ERROR
      );
    }

    await shiftRepository.delete(id);

    await systemLogRepository.createLog({
      employeeId: authContext.employeeId,
      accountId: authContext.accountId,
      action: SYSTEM_ACTION.DELETE_WORK_SHIFT,
      description: `Xóa ca làm việc ID ${id}: ${shift.shiftName} (${shift.shiftCode})`,
      deviceFingerprint: authContext.deviceFingerprint,
      ipAddress: authContext.ipAddress,
      status: 'SUCCESS'
    });

    return { shiftId: id };
  }
}

module.exports = new ShiftService();
