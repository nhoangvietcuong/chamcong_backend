const assignmentRepository = require('../repositories/assignment-repository');
const employeeRepository = require('../repositories/employee-repository');
const workLocationRepository = require('../repositories/work-location-repository');
const shiftRepository = require('../repositories/shift-repository');
const attendanceRepository = require('../repositories/attendance-repository');
const systemLogRepository = require('../repositories/system-log-repository');
const { getPagination } = require('../utils/pagination');
const { isValidDateString } = require('../utils/date');
const { NotFoundError, ConflictError, BadRequestError, ValidationError } = require('../errors/app-error');
const ERROR_CODE = require('../constants/error-code.constants');
const SYSTEM_ACTION = require('../constants/system-action.constants');
const ASSIGNMENT_STATUS = require('../constants/assignment-status.constants');
const { pool } = require('../config/db');

class AssignmentService {
  async getAssignments(queryParams) {
    const page = parseInt(queryParams.page || '1', 10);
    const limit = parseInt(queryParams.limit || '10', 10);
    const {
      keyword,
      employeeId,
      departmentId,
      locationId,
      workDate,
      fromDate,
      toDate,
      status,
      sortBy,
      sortOrder
    } = queryParams;

    const { items, total } = await assignmentRepository.findAndCount({
      keyword,
      employeeId,
      departmentId,
      locationId,
      workDate,
      fromDate,
      toDate,
      status,
      sortBy,
      sortOrder,
      limit,
      offset: (page - 1) * limit
    });

    const pagination = getPagination(page, limit, total);

    return {
      items,
      pagination
    };
  }

  async getAssignmentCalendar(queryParams) {
    const now = new Date();
    const year = parseInt(queryParams.year || now.getFullYear(), 10);
    const month = parseInt(queryParams.month || (now.getMonth() + 1), 10);
    const { employeeId, departmentId, locationId } = queryParams;

    const items = await assignmentRepository.findCalendar({
      year,
      month,
      employeeId,
      departmentId,
      locationId
    });

    // Group by workDate
    const days = {};
    for (const item of items) {
      const dateKey = item.workDate;
      if (!days[dateKey]) {
        days[dateKey] = [];
      }
      days[dateKey].push({
        assignmentId: item.assignmentId,
        employeeName: item.employeeName,
        locationName: item.locationName,
        status: item.status
      });
    }

    return {
      year,
      month,
      days
    };
  }

  async getAssignmentById(id) {
    const assignment = await assignmentRepository.findById(id);
    if (!assignment) {
      throw new NotFoundError('Không tìm thấy phân công', ERROR_CODE.ASSIGNMENT_NOT_FOUND);
    }

    const attendance = await attendanceRepository.findByAssignmentId(id);

    return {
      ...assignment,
      attendance: attendance ? {
        attendanceId: parseInt(attendance.attendance_id, 10),
        status: attendance.attendance_status
      } : null
    };
  }

  async createAssignment(data, authContext) {
    const { employeeId, locationId, locationIds, shiftId, workDate, note } = data;

    if (!isValidDateString(workDate)) {
      throw new BadRequestError('Ngày làm việc không đúng định dạng YYYY-MM-DD', ERROR_CODE.INVALID_WORK_DATE);
    }

    const trimmedNote = note ? note.trim().substring(0, 255) : null;

    // Check employee
    const employee = await employeeRepository.findById(employeeId);
    if (!employee) {
      throw new NotFoundError('Nhân viên không tồn tại', ERROR_CODE.EMPLOYEE_NOT_FOUND);
    }
    if (parseInt(employee.status, 10) !== 1) {
      throw new ConflictError('Nhân viên đã bị khóa hoặc ngừng hoạt động', ERROR_CODE.EMPLOYEE_INACTIVE);
    }

    // Check locationIds
    const finalLocationIds = locationIds || (locationId ? [locationId] : []);
    if (!Array.isArray(finalLocationIds) || finalLocationIds.length === 0) {
      throw new BadRequestError('Danh sách địa điểm làm việc không được để trống', ERROR_CODE.INVALID_INPUT);
    }

    for (const locId of finalLocationIds) {
      const location = await workLocationRepository.findById(locId);
      if (!location) {
        throw new NotFoundError(`Địa điểm chấm công ID ${locId} không tồn tại`, ERROR_CODE.WORK_LOCATION_NOT_FOUND);
      }
      if (parseInt(location.status, 10) !== 1) {
        throw new ConflictError(`Địa điểm chấm công ID ${locId} đã bị khóa`, ERROR_CODE.WORK_LOCATION_INACTIVE);
      }
    }

    // Check shift
    let finalShiftId = shiftId;
    if (!finalShiftId) {
      let defaultShift = await shiftRepository.findByCode('HC');
      if (!defaultShift) {
        const shifts = await shiftRepository.findAndCount({ isActive: 1, limit: 1 });
        defaultShift = shifts.items && shifts.items[0];
      }
      if (!defaultShift) {
        throw new NotFoundError('Không tìm thấy ca làm việc mặc định trong hệ thống', ERROR_CODE.SHIFT_NOT_FOUND);
      }
      finalShiftId = defaultShift.shiftId;
    }

    const shift = await shiftRepository.findById(finalShiftId);
    if (!shift) {
      throw new NotFoundError('Ca làm việc không tồn tại', ERROR_CODE.SHIFT_NOT_FOUND);
    }
    if (parseInt(shift.isActive, 10) !== 1) {
      throw new ConflictError('Ca làm việc đã bị vô hiệu hóa', ERROR_CODE.SHIFT_INACTIVE);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check duplicate assignment for employee on the same date
      const existing = await assignmentRepository.findByEmployeeAndDate(employeeId, workDate, client);
      if (existing) {
        throw new ConflictError(
          'Nhân viên đã được phân công địa điểm khác trong ngày này',
          ERROR_CODE.ASSIGNMENT_ALREADY_EXISTS
        );
      }

      let newAssignment;
      try {
        newAssignment = await assignmentRepository.create({
          employeeId,
          locationId: finalLocationIds[0],
          locationIds: finalLocationIds,
          shiftId: finalShiftId,
          workDate,
          note: trimmedNote,
          status: ASSIGNMENT_STATUS.ASSIGNED,
          createdBy: authContext.accountId
        }, client);
      } catch (err) {
        if (err.code === '23505') {
          throw new ConflictError(
            'Nhân viên đã được phân công địa điểm khác trong ngày này',
            ERROR_CODE.ASSIGNMENT_ALREADY_EXISTS
          );
        }
        throw err;
      }

      await systemLogRepository.createLog({
        employeeId: authContext.employeeId,
        accountId: authContext.accountId,
        action: SYSTEM_ACTION.CREATE_ASSIGNMENT,
        description: `Tạo phân công chấm công cho nhân viên ID ${employeeId} tại các địa điểm ID [${finalLocationIds.join(',')}], ca ID ${finalShiftId} ngày ${workDate}`,
        deviceFingerprint: authContext.deviceFingerprint,
        ipAddress: authContext.ipAddress,
        status: 'SUCCESS'
      }, client);

      await client.query('COMMIT');
      return await assignmentRepository.findById(newAssignment.assignment_id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateAssignment(id, data, authContext) {
    const { employeeId, locationId, locationIds, shiftId, workDate, note } = data;

    if (!isValidDateString(workDate)) {
      throw new BadRequestError('Ngày làm việc không đúng định dạng YYYY-MM-DD', ERROR_CODE.INVALID_WORK_DATE);
    }

    const trimmedNote = note ? note.trim().substring(0, 255) : null;

    // Check employee
    const employee = await employeeRepository.findById(employeeId);
    if (!employee) {
      throw new NotFoundError('Nhân viên không tồn tại', ERROR_CODE.EMPLOYEE_NOT_FOUND);
    }
    if (parseInt(employee.status, 10) !== 1) {
      throw new ConflictError('Nhân viên đã bị khóa hoặc ngừng hoạt động', ERROR_CODE.EMPLOYEE_INACTIVE);
    }

    // Check locationIds
    const finalLocationIds = locationIds || (locationId ? [locationId] : []);
    if (!Array.isArray(finalLocationIds) || finalLocationIds.length === 0) {
      throw new BadRequestError('Danh sách địa điểm làm việc không được để trống', ERROR_CODE.INVALID_INPUT);
    }

    for (const locId of finalLocationIds) {
      const location = await workLocationRepository.findById(locId);
      if (!location) {
        throw new NotFoundError(`Địa điểm chấm công ID ${locId} không tồn tại`, ERROR_CODE.WORK_LOCATION_NOT_FOUND);
      }
      if (parseInt(location.status, 10) !== 1) {
        throw new ConflictError(`Địa điểm chấm công ID ${locId} đã bị khóa`, ERROR_CODE.WORK_LOCATION_INACTIVE);
      }
    }

    // Check shift
    let finalShiftId = shiftId;
    if (!finalShiftId) {
      let defaultShift = await shiftRepository.findByCode('HC');
      if (!defaultShift) {
        const shifts = await shiftRepository.findAndCount({ isActive: 1, limit: 1 });
        defaultShift = shifts.items && shifts.items[0];
      }
      if (!defaultShift) {
        throw new NotFoundError('Không tìm thấy ca làm việc mặc định trong hệ thống', ERROR_CODE.SHIFT_NOT_FOUND);
      }
      finalShiftId = defaultShift.shiftId;
    }

    const shift = await shiftRepository.findById(finalShiftId);
    if (!shift) {
      throw new NotFoundError('Ca làm việc không tồn tại', ERROR_CODE.SHIFT_NOT_FOUND);
    }
    if (parseInt(shift.isActive, 10) !== 1) {
      throw new ConflictError('Ca làm việc đã bị vô hiệu hóa', ERROR_CODE.SHIFT_INACTIVE);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const assignment = await assignmentRepository.findById(id, client);
      if (!assignment) {
        throw new NotFoundError('Không tìm thấy phân công để cập nhật', ERROR_CODE.ASSIGNMENT_NOT_FOUND);
      }

      // Check current status
      if (assignment.status !== ASSIGNMENT_STATUS.ASSIGNED) {
        throw new ValidationError('Chỉ cho phép cập nhật phân công ở trạng thái ASSIGNED', ERROR_CODE.ASSIGNMENT_NOT_EDITABLE);
      }

      // Check if attendance exists
      const attendance = await attendanceRepository.findByAssignmentId(id, client);
      if (attendance) {
        throw new ConflictError(
          'Không được sửa phân công đã phát sinh dữ liệu chấm công',
          ERROR_CODE.ASSIGNMENT_ALREADY_HAS_ATTENDANCE
        );
      }

      // Check duplicate assignment for employee on the same date (excluding current assignment)
      const existing = await assignmentRepository.findByEmployeeAndDate(employeeId, workDate, client);
      if (existing && parseInt(existing.assignment_id, 10) !== parseInt(id, 10)) {
        throw new ConflictError(
          'Nhân viên đã được phân công địa điểm khác trong ngày này',
          ERROR_CODE.ASSIGNMENT_ALREADY_EXISTS
        );
      }

      try {
        await assignmentRepository.update(id, {
          employeeId,
          locationId: finalLocationIds[0],
          locationIds: finalLocationIds,
          shiftId: finalShiftId,
          workDate,
          note: trimmedNote
        }, client);
      } catch (err) {
        if (err.code === '23505') {
          throw new ConflictError(
            'Nhân viên đã được phân công địa điểm khác trong ngày này',
            ERROR_CODE.ASSIGNMENT_ALREADY_EXISTS
          );
        }
        throw err;
      }

      await systemLogRepository.createLog({
        employeeId: authContext.employeeId,
        accountId: authContext.accountId,
        action: SYSTEM_ACTION.UPDATE_ASSIGNMENT,
        description: `Cập nhật phân công ID ${id}: đổi sang nhân viên ID ${employeeId}, các địa điểm ID [${finalLocationIds.join(',')}], ca ID ${finalShiftId}, ngày ${workDate}`,
        deviceFingerprint: authContext.deviceFingerprint,
        ipAddress: authContext.ipAddress,
        status: 'SUCCESS'
      }, client);

      await client.query('COMMIT');
      return await assignmentRepository.findById(id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async cancelAssignment(id, data, authContext) {
    const { reason } = data;
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      throw new BadRequestError('Lý do hủy phân công không được để trống', ERROR_CODE.VALIDATION_ERROR);
    }

    const trimmedReason = reason.trim();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const assignment = await assignmentRepository.findById(id, client);
      if (!assignment) {
        throw new NotFoundError('Không tìm thấy phân công để hủy', ERROR_CODE.ASSIGNMENT_NOT_FOUND);
      }

      // Check current status
      if (assignment.status !== ASSIGNMENT_STATUS.ASSIGNED) {
        throw new ValidationError('Chỉ cho phép hủy phân công ở trạng thái ASSIGNED', ERROR_CODE.ASSIGNMENT_NOT_EDITABLE);
      }

      // Check if attendance exists
      const attendance = await attendanceRepository.findByAssignmentId(id, client);
      if (attendance) {
        throw new ConflictError(
          'Không được hủy phân công đã phát sinh dữ liệu chấm công',
          ERROR_CODE.ASSIGNMENT_ALREADY_HAS_ATTENDANCE
        );
      }

      // Construct a new note explaining the cancellation
      const cancellationNote = `[Cancelled] Lý do: ${trimmedReason}`;
      
      await assignmentRepository.updateStatus(id, ASSIGNMENT_STATUS.CANCELLED, cancellationNote, client);

      await systemLogRepository.createLog({
        employeeId: authContext.employeeId,
        accountId: authContext.accountId,
        action: SYSTEM_ACTION.CANCEL_ASSIGNMENT,
        description: `Hủy phân công ID ${id}. Lý do: ${trimmedReason}`,
        deviceFingerprint: authContext.deviceFingerprint,
        ipAddress: authContext.ipAddress,
        status: 'SUCCESS'
      }, client);

      await client.query('COMMIT');
      return await assignmentRepository.findById(id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async createBulkAssignments(data, authContext) {
    const { employeeIds, locationId, locationIds, shiftId, startDate, endDate, recurrenceType, recurrenceDays, note } = data;

    if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
      throw new BadRequestError('Khoảng ngày không đúng định dạng YYYY-MM-DD', ERROR_CODE.INVALID_WORK_DATE);
    }

    const trimmedNote = note ? note.trim().substring(0, 255) : null;

    // Check locationIds
    const finalLocationIds = locationIds || (locationId ? [locationId] : []);
    if (!Array.isArray(finalLocationIds) || finalLocationIds.length === 0) {
      throw new BadRequestError('Danh sách địa điểm làm việc không được để trống', ERROR_CODE.INVALID_INPUT);
    }

    for (const locId of finalLocationIds) {
      const location = await workLocationRepository.findById(locId);
      if (!location) {
        throw new NotFoundError(`Địa điểm chấm công ID ${locId} không tồn tại`, ERROR_CODE.WORK_LOCATION_NOT_FOUND);
      }
      if (parseInt(location.status, 10) !== 1) {
        throw new ConflictError(`Địa điểm chấm công ID ${locId} đã bị khóa`, ERROR_CODE.WORK_LOCATION_INACTIVE);
      }
    }

    // Check shift
    let finalShiftId = shiftId;
    if (!finalShiftId) {
      let defaultShift = await shiftRepository.findByCode('HC');
      if (!defaultShift) {
        const shifts = await shiftRepository.findAndCount({ isActive: 1, limit: 1 });
        defaultShift = shifts.items && shifts.items[0];
      }
      if (!defaultShift) {
        throw new NotFoundError('Không tìm thấy ca làm việc mặc định trong hệ thống', ERROR_CODE.SHIFT_NOT_FOUND);
      }
      finalShiftId = defaultShift.shiftId;
    }
    const shift = await shiftRepository.findById(finalShiftId);
    if (!shift) {
      throw new NotFoundError('Ca làm việc không tồn tại', ERROR_CODE.SHIFT_NOT_FOUND);
    }
    if (parseInt(shift.isActive, 10) !== 1) {
      throw new ConflictError('Ca làm việc đã bị vô hiệu hóa', ERROR_CODE.SHIFT_INACTIVE);
    }

    // Generate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) {
      throw new BadRequestError('Ngày bắt đầu phải trước ngày kết thúc', ERROR_CODE.INVALID_WORK_DATE);
    }

    const dates = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      dates.push(`${year}-${month}-${day}`);
    }

    let filteredDates = dates;
    if (recurrenceType === 'WEEKLY' && recurrenceDays && recurrenceDays.length > 0) {
      const allowedDays = recurrenceDays.map(Number);
      filteredDates = dates.filter(dateStr => {
        const [y, m, dayVal] = dateStr.split('-').map(Number);
        const dateObj = new Date(y, m - 1, dayVal);
        return allowedDays.includes(dateObj.getDay());
      });
    } else if (recurrenceType === 'MONTHLY' && recurrenceDays && recurrenceDays.length > 0) {
      const allowedMonthDates = recurrenceDays.map(Number);
      filteredDates = dates.filter(dateStr => {
        const [, , dayVal] = dateStr.split('-').map(Number);
        return allowedMonthDates.includes(dayVal);
      });
    }

    if (filteredDates.length === 0) {
      throw new BadRequestError('Không có ngày làm việc nào thỏa mãn chu kỳ lặp lại đã chọn', ERROR_CODE.INVALID_WORK_DATE);
    }

    const client = await pool.connect();
    let createdCount = 0;
    let skippedCount = 0;
    const skippedDetails = [];

    try {
      await client.query('BEGIN');

      for (const employeeId of employeeIds) {
        const employee = await employeeRepository.findById(employeeId);
        if (!employee || parseInt(employee.status, 10) !== 1) {
          skippedCount += filteredDates.length;
          skippedDetails.push({
            employeeId,
            employeeName: employee ? employee.fullName : 'Unknown',
            reason: employee ? 'Nhân viên bị khóa hoặc ngừng hoạt động' : 'Nhân viên không tồn tại',
            dates: filteredDates
          });
          continue;
        }

        for (const workDate of filteredDates) {
          // Check existing
          const existing = await assignmentRepository.findByEmployeeAndDate(employeeId, workDate, client);
          if (existing) {
            skippedCount++;
            skippedDetails.push({
              employeeId,
              employeeName: employee.fullName,
              workDate,
              reason: `Nhân viên đã được phân công tại địa điểm khác vào ngày này`
            });
            continue;
          }

          // Create assignment
          await assignmentRepository.create({
            employeeId,
            locationId: finalLocationIds[0],
            locationIds: finalLocationIds,
            shiftId: finalShiftId,
            workDate,
            note: trimmedNote,
            status: ASSIGNMENT_STATUS.ASSIGNED,
            createdBy: authContext.accountId
          }, client);

          createdCount++;
        }
      }

      await systemLogRepository.createLog({
        employeeId: authContext.employeeId,
        accountId: authContext.accountId,
        action: SYSTEM_ACTION.CREATE_ASSIGNMENT,
        description: `Tạo hàng loạt ${createdCount} phân công cho ${employeeIds.length} nhân viên từ ${startDate} đến ${endDate}`,
        deviceFingerprint: authContext.deviceFingerprint,
        ipAddress: authContext.ipAddress,
        status: 'SUCCESS'
      }, client);

      await client.query('COMMIT');

      return {
        totalRequested: employeeIds.length * filteredDates.length,
        totalCreated: createdCount,
        totalSkipped: skippedCount,
        skippedDetails
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async copyAssignments(data, authContext) {
    const { sourceStartDate, sourceEndDate, targetStartDate } = data;

    if (!isValidDateString(sourceStartDate) || !isValidDateString(sourceEndDate) || !isValidDateString(targetStartDate)) {
      throw new BadRequestError('Ngày không đúng định dạng YYYY-MM-DD', ERROR_CODE.INVALID_WORK_DATE);
    }

    const sourceStart = new Date(sourceStartDate);
    const sourceEnd = new Date(sourceEndDate);
    const targetStart = new Date(targetStartDate);

    if (sourceStart > sourceEnd) {
      throw new BadRequestError('Ngày bắt đầu phải trước ngày kết thúc', ERROR_CODE.INVALID_WORK_DATE);
    }

    // Find all active assignments in source range
    const sourceRes = await pool.query(
      `SELECT employee_id, location_id, shift_id, work_date, note
       FROM public.employee_work_assignments
       WHERE work_date >= $1 AND work_date <= $2 AND status = 'ASSIGNED'`,
      [sourceStartDate, sourceEndDate]
    );

    const assignments = sourceRes.rows;
    if (assignments.length === 0) {
      return {
        totalFound: 0,
        totalCopied: 0,
        totalSkipped: 0,
        skippedDetails: []
      };
    }

    const client = await pool.connect();
    let copiedCount = 0;
    let skippedCount = 0;
    const skippedDetails = [];

    try {
      await client.query('BEGIN');

      for (const assign of assignments) {
        // Calculate targetDate = targetStart + (assign.work_date - sourceStart)
        const dateDiffMs = new Date(assign.work_date).getTime() - sourceStart.getTime();
        const targetDateObj = new Date(targetStart.getTime() + dateDiffMs);
        const year = targetDateObj.getFullYear();
        const month = String(targetDateObj.getMonth() + 1).padStart(2, '0');
        const day = String(targetDateObj.getDate()).padStart(2, '0');
        const targetDate = `${year}-${month}-${day}`;

        // Check if employee exists and is active
        const employee = await employeeRepository.findById(assign.employee_id);
        if (!employee || parseInt(employee.status, 10) !== 1) {
          skippedCount++;
          skippedDetails.push({
            employeeId: assign.employee_id,
            workDate: targetDate,
            reason: 'Nhân viên bị khóa hoặc không tồn tại'
          });
          continue;
        }

        // Check target location status
        const location = await workLocationRepository.findById(assign.location_id);
        if (!location || parseInt(location.status, 10) !== 1) {
          skippedCount++;
          skippedDetails.push({
            employeeId: assign.employee_id,
            workDate: targetDate,
            reason: 'Địa điểm đã bị khóa hoặc không tồn tại'
          });
          continue;
        }

        // Check target shift status
        const shift = await shiftRepository.findById(assign.shift_id);
        if (!shift || parseInt(shift.isActive, 10) !== 1) {
          skippedCount++;
          skippedDetails.push({
            employeeId: assign.employee_id,
            workDate: targetDate,
            reason: 'Ca làm việc đã bị vô hiệu hóa hoặc không tồn tại'
          });
          continue;
        }

        // Check duplicate
        const existing = await assignmentRepository.findByEmployeeAndDate(assign.employee_id, targetDate, client);
        if (existing) {
          skippedCount++;
          skippedDetails.push({
            employeeId: assign.employee_id,
            employeeName: employee.fullName,
            workDate: targetDate,
            reason: 'Nhân viên đã được phân công tại địa điểm khác trong ngày này'
          });
          continue;
        }

        // Create copied assignment
        await assignmentRepository.create({
          employeeId: assign.employee_id,
          locationId: assign.location_id,
          shiftId: assign.shift_id,
          workDate: targetDate,
          note: assign.note,
          status: ASSIGNMENT_STATUS.ASSIGNED,
          createdBy: authContext.accountId
        }, client);

        copiedCount++;
      }

      await systemLogRepository.createLog({
        employeeId: authContext.employeeId,
        accountId: authContext.accountId,
        action: SYSTEM_ACTION.CREATE_ASSIGNMENT,
        description: `Sao chép ${copiedCount} phân công từ tuần ${sourceStartDate} sang tuần ${targetStartDate}`,
        deviceFingerprint: authContext.deviceFingerprint,
        ipAddress: authContext.ipAddress,
        status: 'SUCCESS'
      }, client);

      await client.query('COMMIT');

      return {
        totalFound: assignments.length,
        totalCopied: copiedCount,
        totalSkipped: skippedCount,
        skippedDetails
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async bulkDeleteAssignments(data, authContext) {
    const { startDate, endDate, employeeIds, locationId } = data;

    if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
      throw new BadRequestError('Dải ngày không đúng định dạng YYYY-MM-DD', ERROR_CODE.INVALID_WORK_DATE);
    }

    let queryStr = `
      SELECT ewa.assignment_id, ewa.work_date, e.full_name as employee_name,
             EXISTS (
               SELECT 1 FROM public.attendance att 
               WHERE att.assignment_id = ewa.assignment_id
             ) as has_attendance
      FROM public.employee_work_assignments ewa
      JOIN public.employees e ON ewa.employee_id = e.employee_id
      WHERE ewa.work_date >= $1 AND ewa.work_date <= $2 AND ewa.status = 'ASSIGNED'
    `;
    const params = [startDate, endDate];

    if (employeeIds && employeeIds.length > 0) {
      params.push(employeeIds);
      queryStr += ` AND ewa.employee_id = ANY($${params.length})`;
    }

    if (locationId) {
      params.push(locationId);
      queryStr += ` AND ewa.location_id = $${params.length}`;
    }

    const res = await pool.query(queryStr, params);
    const targetAssignments = res.rows;

    if (targetAssignments.length === 0) {
      return {
        totalFound: 0,
        totalDeleted: 0,
        totalSkipped: 0,
        skippedDetails: []
      };
    }

    const client = await pool.connect();
    let deletedCount = 0;
    let skippedCount = 0;
    const skippedDetails = [];

    try {
      await client.query('BEGIN');

      for (const assign of targetAssignments) {
        if (assign.has_attendance) {
          skippedCount++;
          skippedDetails.push({
            assignmentId: assign.assignment_id,
            employeeName: assign.employee_name,
            workDate: assign.work_date,
            reason: 'Phân công đã có dữ liệu chấm công thực tế'
          });
          continue;
        }

        // Physically delete
        await client.query(
          `DELETE FROM public.employee_work_assignments WHERE assignment_id = $1`,
          [assign.assignment_id]
        );

        deletedCount++;
      }

      await systemLogRepository.createLog({
        employeeId: authContext.employeeId,
        accountId: authContext.accountId,
        action: SYSTEM_ACTION.CANCEL_ASSIGNMENT,
        description: `Xóa hàng loạt ${deletedCount} phân công từ ngày ${startDate} đến ${endDate}`,
        deviceFingerprint: authContext.deviceFingerprint,
        ipAddress: authContext.ipAddress,
        status: 'SUCCESS'
      }, client);

      await client.query('COMMIT');

      return {
        totalFound: targetAssignments.length,
        totalDeleted: deletedCount,
        totalSkipped: skippedCount,
        skippedDetails
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async bulkUpdateLocation(data, authContext) {
    const { sourceLocationId, targetLocationId, targetLocationIds, startDate, endDate, employeeIds } = data;

    if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
      throw new BadRequestError('Dải ngày không đúng định dạng YYYY-MM-DD', ERROR_CODE.INVALID_WORK_DATE);
    }

    const finalTargetLocationIds = targetLocationIds || (targetLocationId ? [targetLocationId] : []);
    if (!Array.isArray(finalTargetLocationIds) || finalTargetLocationIds.length === 0) {
      throw new BadRequestError('Danh sách địa điểm đích không được để trống', ERROR_CODE.INVALID_INPUT);
    }

    const primaryTargetLocId = finalTargetLocationIds[0];

    // Verify target locations exist and are active
    for (const locId of finalTargetLocationIds) {
      const targetLoc = await workLocationRepository.findById(locId);
      if (!targetLoc || parseInt(targetLoc.status, 10) !== 1) {
        throw new NotFoundError(`Địa điểm đích ID ${locId} không tồn tại hoặc đã bị khóa`, ERROR_CODE.WORK_LOCATION_NOT_FOUND);
      }
    }

    let queryStr = `
      SELECT ewa.assignment_id, ewa.work_date, ewa.employee_id, e.full_name as employee_name,
             EXISTS (
               SELECT 1 FROM public.attendance att 
               WHERE att.assignment_id = ewa.assignment_id
             ) as has_attendance
      FROM public.employee_work_assignments ewa
      JOIN public.employees e ON ewa.employee_id = e.employee_id
      WHERE ewa.work_date >= $1 AND ewa.work_date <= $2 
        AND ewa.location_id = $3 AND ewa.status = 'ASSIGNED'
    `;
    const params = [startDate, endDate, sourceLocationId];

    if (employeeIds && employeeIds.length > 0) {
      params.push(employeeIds);
      queryStr += ` AND ewa.employee_id = ANY($${params.length})`;
    }

    const res = await pool.query(queryStr, params);
    const targetAssignments = res.rows;

    if (targetAssignments.length === 0) {
      return {
        totalFound: 0,
        totalUpdated: 0,
        totalSkipped: 0,
        skippedDetails: []
      };
    }

    const client = await pool.connect();
    let updatedCount = 0;
    let skippedCount = 0;
    const skippedDetails = [];

    try {
      await client.query('BEGIN');

      for (const assign of targetAssignments) {
        if (assign.has_attendance) {
          skippedCount++;
          skippedDetails.push({
            assignmentId: assign.assignment_id,
            employeeName: assign.employee_name,
            workDate: assign.work_date,
            reason: 'Không thể chuyển đổi vì nhân viên đã chấm công thực tế'
          });
          continue;
        }

        // Check if employee already has another assignment at target location on the same day?
        const dupRes = await client.query(
          `SELECT 1 FROM public.employee_work_assignments
           WHERE employee_id = $1 AND work_date = $2 AND assignment_id <> $3 AND status = 'ASSIGNED'`,
          [assign.employee_id, assign.work_date, assign.assignment_id]
        );
        if (dupRes.rows.length > 0) {
          skippedCount++;
          skippedDetails.push({
            assignmentId: assign.assignment_id,
            employeeName: assign.employee_name,
            workDate: assign.work_date,
            reason: 'Nhân viên đã có lịch phân công khác vào ngày này'
          });
          continue;
        }

        // Execute update location
        await client.query(
          `UPDATE public.employee_work_assignments 
           SET location_id = $1, note = COALESCE(note, '') || ' [Moved from location ID ' || $2 || ']'
           WHERE assignment_id = $3`,
          [primaryTargetLocId, sourceLocationId, assign.assignment_id]
        );

        // Update in assignment_locations table
        await client.query(
          `DELETE FROM public.assignment_locations WHERE assignment_id = $1 AND location_id = $2`,
          [assign.assignment_id, sourceLocationId]
        );

        for (const locId of finalTargetLocationIds) {
          await client.query(
            `INSERT INTO public.assignment_locations (assignment_id, location_id)
             VALUES ($1, $2)
             ON CONFLICT (assignment_id, location_id) DO NOTHING`,
            [assign.assignment_id, locId]
          );
        }

        updatedCount++;
      }

      await systemLogRepository.createLog({
        employeeId: authContext.employeeId,
        accountId: authContext.accountId,
        action: SYSTEM_ACTION.UPDATE_ASSIGNMENT,
        description: `Chuyển hàng loạt ${updatedCount} phân công từ địa điểm ID ${sourceLocationId} sang địa điểm IDs ${finalTargetLocationIds.join(', ')}`,
        deviceFingerprint: authContext.deviceFingerprint,
        ipAddress: authContext.ipAddress,
        status: 'SUCCESS'
      }, client);

      await client.query('COMMIT');

      return {
        totalFound: targetAssignments.length,
        totalUpdated: updatedCount,
        totalSkipped: skippedCount,
        skippedDetails
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async bulkUpdateSelectedAssignments(data, authContext) {
    const { assignmentIds, locationIds, shiftId, note, mode = 'APPEND' } = data;

    if (!Array.isArray(assignmentIds) || assignmentIds.length === 0) {
      throw new BadRequestError('Mảng assignmentIds không được để trống', ERROR_CODE.VALIDATION_ERROR);
    }

    const client = await pool.connect();
    let updatedCount = 0;
    let skippedCount = 0;
    const skippedDetails = [];

    try {
      await client.query('BEGIN');

      for (const id of assignmentIds) {
        const assignment = await assignmentRepository.findById(id, client);
        if (!assignment) {
          skippedCount++;
          skippedDetails.push({ assignmentId: id, reason: 'Không tìm thấy phân công' });
          continue;
        }

        // Allow bulk updating regardless of status (Admin override)

        // Location IDs handling
        let finalLocationIds = assignment.allowedLocations ? assignment.allowedLocations.map(l => l.locationId) : [assignment.location?.locationId];
        if (mode === 'CUSTOM') {
          const { addLocationIds, removeLocationIds } = data;
          if (Array.isArray(removeLocationIds) && removeLocationIds.length > 0) {
            finalLocationIds = finalLocationIds.filter(id => !removeLocationIds.includes(id));
          }
          if (Array.isArray(addLocationIds) && addLocationIds.length > 0) {
            const set = new Set([...finalLocationIds, ...addLocationIds]);
            finalLocationIds = Array.from(set);
          }
          if (finalLocationIds.length === 0) {
            skippedCount++;
            skippedDetails.push({ assignmentId: id, reason: 'Không thể xóa hết địa điểm (phân công phải có ít nhất 1 địa điểm)' });
            continue;
          }
        } else if (Array.isArray(locationIds) && locationIds.length > 0) {
          if (mode === 'REPLACE') {
            finalLocationIds = locationIds;
          } else if (mode === 'REMOVE') {
            finalLocationIds = finalLocationIds.filter(id => !locationIds.includes(id));
            if (finalLocationIds.length === 0) {
              skippedCount++;
              skippedDetails.push({ assignmentId: id, reason: 'Không thể xóa hết địa điểm (phân công phải có ít nhất 1 địa điểm)' });
              continue;
            }
          } else {
            const set = new Set([...finalLocationIds, ...locationIds]);
            finalLocationIds = Array.from(set);
          }
        }

        const finalShiftId = shiftId || (assignment.shift ? assignment.shift.shiftId : null);
        const finalNote = note !== undefined && note !== null ? note.trim() : assignment.note;

        await assignmentRepository.update(id, {
          employeeId: assignment.employee.employeeId,
          locationId: finalLocationIds[0],
          locationIds: finalLocationIds,
          shiftId: finalShiftId,
          workDate: assignment.workDate,
          note: finalNote
        }, client);

        updatedCount++;
      }

      await systemLogRepository.createLog({
        employeeId: authContext.employeeId,
        accountId: authContext.accountId,
        action: SYSTEM_ACTION.UPDATE_ASSIGNMENT,
        description: `Cập nhật hàng loạt ${updatedCount} phân công ID [${assignmentIds.join(', ')}]`,
        deviceFingerprint: authContext.deviceFingerprint,
        ipAddress: authContext.ipAddress,
        status: 'SUCCESS'
      }, client);

      await client.query('COMMIT');
      return {
        totalRequested: assignmentIds.length,
        totalUpdated: updatedCount,
        totalSkipped: skippedCount,
        skippedDetails
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async bulkDeleteSelectedAssignments(data, authContext) {
    const { assignmentIds } = data;

    if (!Array.isArray(assignmentIds) || assignmentIds.length === 0) {
      throw new BadRequestError('Mảng assignmentIds không được để trống', ERROR_CODE.VALIDATION_ERROR);
    }

    const client = await pool.connect();
    let deletedCount = 0;
    let skippedCount = 0;
    const skippedDetails = [];

    try {
      await client.query('BEGIN');

      for (const id of assignmentIds) {
        const attendance = await attendanceRepository.findByAssignmentId(id, client);
        if (attendance) {
          skippedCount++;
          skippedDetails.push({ assignmentId: id, reason: 'Phân công đã có dữ liệu chấm công' });
          continue;
        }

        await client.query(`DELETE FROM public.assignment_locations WHERE assignment_id = $1`, [id]);
        const delRes = await client.query(`DELETE FROM public.employee_work_assignments WHERE assignment_id = $1`, [id]);
        if (delRes.rowCount > 0) {
          deletedCount++;
        }
      }

      await systemLogRepository.createLog({
        employeeId: authContext.employeeId,
        accountId: authContext.accountId,
        action: SYSTEM_ACTION.CANCEL_ASSIGNMENT,
        description: `Xóa hàng loạt ${deletedCount} phân công ID [${assignmentIds.join(', ')}]`,
        deviceFingerprint: authContext.deviceFingerprint,
        ipAddress: authContext.ipAddress,
        status: 'SUCCESS'
      }, client);

      await client.query('COMMIT');
      return {
        totalRequested: assignmentIds.length,
        totalDeleted: deletedCount,
        totalSkipped: skippedCount,
        skippedDetails
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new AssignmentService();
