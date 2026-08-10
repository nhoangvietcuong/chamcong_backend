const otRepository = require('../repositories/ot-repository');
const systemLogRepository = require('../repositories/system-log-repository');
const { pool } = require('../config/db');
const { NotFoundError, ForbiddenError, ValidationError, BadRequestError } = require('../errors/app-error');
const ROLE = require('../constants/role.constants');
const { eventBus, OT_EVENTS } = require('../events/leave-events');
const { getTodayDateString } = require('../utils/date');

class OtService {
  _calculateDuration(startTime, endTime) {
    const [startH, startM, startS] = startTime.split(':').map(Number);
    const [endH, endM, endS] = endTime.split(':').map(Number);
    const startMs = (startH * 3600 + startM * 60 + (startS || 0)) * 1000;
    const endMs = (endH * 3600 + endM * 60 + (endS || 0)) * 1000;
    const diffMs = endMs - startMs;
    if (diffMs <= 0) return 0;
    return parseFloat((diffMs / (1000 * 3600)).toFixed(2));
  }

  async createRequest(data, authContext) {
    let { employeeId, workDate, startTime, endTime, reason } = data;

    if (String(authContext.employeeId) !== String(employeeId)) {
      throw new ForbiddenError('Bạn không có quyền đăng ký tăng ca cho nhân viên khác');
    }

    if (!reason || reason.trim() === '') {
      throw new ValidationError('Lý do đăng ký tăng ca là bắt buộc');
    }

    if (reason.length > 100) {
      throw new ValidationError('Lý do đăng ký tăng ca không được vượt quá 100 ký tự');
    }

    // 1. Business Rule: No past date registration
    const todayStr = getTodayDateString();
    if (workDate < todayStr) {
      throw new ValidationError('Không được đăng ký tăng ca cho ngày đã kết thúc');
    }

    // 2. Business Rule: Assignment Required
    const assignment = await otRepository.getAssignmentForDate(employeeId, workDate);
    if (!assignment) {
      throw new ValidationError('Chỉ được đăng ký tăng ca nếu có lịch phân công làm việc trong ngày');
    }

    // Default startTime and endTime if not provided by user
    if (!startTime) {
      startTime = assignment.shiftEndTime || '17:30:00';
    }
    if (!endTime) {
      const [sh, sm] = startTime.split(':').map(Number);
      const endH = Math.min((sh || 17) + 4, 23);
      endTime = `${String(endH).padStart(2, '0')}:${String(sm || 0).padStart(2, '0')}:00`;
    }

    if (startTime.length === 5) startTime += ':00';
    if (endTime.length === 5) endTime += ':00';

    // 3. Business Rule: OT Time vs Shift End
    if (assignment.shiftEndTime && startTime < assignment.shiftEndTime) {
      throw new ValidationError(`Giờ bắt đầu tăng ca phải lớn hơn hoặc bằng giờ kết thúc ca làm việc (${assignment.shiftEndTime})`);
    }

    // 4. Business Rule: No Leave Overlap
    const hasLeaveConflict = await otRepository.checkLeaveConflict(employeeId, workDate);
    if (hasLeaveConflict) {
      throw new ValidationError('Không được đăng ký tăng ca khi đang có đơn nghỉ phép đã được phê duyệt cùng ngày');
    }

    // 5. Business Rule: OT Overlap Protection
    const isOverlapping = await otRepository.checkOverlap(employeeId, workDate, startTime, endTime);
    if (isOverlapping) {
      throw new ValidationError('Thời gian đăng ký tăng ca bị trùng với một đơn khác đang chờ duyệt hoặc đã được phê duyệt');
    }

    // 6. Business Rule: Max OT Hours Constraint
    const durationHours = this._calculateDuration(startTime, endTime);
    if (durationHours <= 0) {
      throw new ValidationError('Giờ kết thúc phải lớn hơn giờ bắt đầu tăng ca');
    }

    const maxOtHoursPerDay = parseFloat(process.env.MAX_OT_HOURS_PER_DAY || '4');
    if (durationHours > maxOtHoursPerDay) {
      throw new ValidationError(`Thời gian đăng ký tăng ca vượt quá số giờ tối đa cho phép (${maxOtHoursPerDay} giờ/ngày)`);
    }

    const client = await pool.connect();
    let transactionSuccess = false;
    let otRequest = null;

    try {
      await client.query('BEGIN');

      // Create OT request record
      otRequest = await otRepository.createRequest({
        employeeId,
        assignmentId: assignment.assignmentId,
        workDate,
        startTime,
        endTime,
        durationHours,
        reason
      }, client);

      // Log Audit inside transaction
      await systemLogRepository.createLog({
        employeeId: authContext.employeeId,
        accountId: authContext.accountId,
        action: 'OT_REQUEST_CREATE',
        description: `Tạo đơn đăng ký tăng ca #${otRequest.otRequestId} ngày ${workDate} (${startTime} - ${endTime})`,
        deviceFingerprint: authContext.deviceFingerprint,
        ipAddress: authContext.ipAddress,
        status: 'SUCCESS'
      }, client);

      await client.query('COMMIT');
      transactionSuccess = true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Emit event post-commit (Event-Driven)
    if (transactionSuccess && otRequest) {
      const empQuery = await pool.query('SELECT full_name FROM public.employees WHERE employee_id = $1', [employeeId]);
      const employeeName = empQuery.rows[0]?.full_name || 'Nhân viên';

      eventBus.emit(OT_EVENTS.REQUEST_CREATED, {
        otRequest,
        employeeName
      });
    }

    return otRequest;
  }

  async getMyRequests(employeeId, filters = {}) {
    return otRepository.findRequests({
      ...filters,
      employeeId
    });
  }

  async cancelRequest(requestId, authContext) {
    const request = await otRepository.findRequestById(requestId);
    if (!request) {
      throw new NotFoundError('Không tìm thấy đơn đăng ký tăng ca');
    }

    const isOwner = String(authContext.employeeId) === String(request.employeeId);
    if (!isOwner) {
      throw new ForbiddenError('Bạn không có quyền hủy đơn đăng ký tăng ca của nhân viên khác');
    }

    // 1. Business Rule: Only PENDING requests can be cancelled
    if (request.status !== 'PENDING') {
      throw new ValidationError('Chỉ được phép hủy đơn đăng ký tăng ca khi đang ở trạng thái chờ duyệt (PENDING)');
    }

    const client = await pool.connect();
    let transactionSuccess = false;
    let updatedRequest = null;

    try {
      await client.query('BEGIN');

      updatedRequest = await otRepository.updateRequestStatus(requestId, 'CANCELLED', {}, client);

      await systemLogRepository.createLog({
        employeeId: authContext.employeeId,
        accountId: authContext.accountId,
        action: 'OT_REQUEST_CANCEL',
        description: `Hủy đơn đăng ký tăng ca #${requestId} ngày ${request.workDate}`,
        deviceFingerprint: authContext.deviceFingerprint,
        ipAddress: authContext.ipAddress,
        status: 'SUCCESS'
      }, client);

      await client.query('COMMIT');
      transactionSuccess = true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    if (transactionSuccess && updatedRequest) {
      const empQuery = await pool.query('SELECT full_name FROM public.employees WHERE employee_id = $1', [request.employeeId]);
      const employeeName = empQuery.rows[0]?.full_name || 'Nhân viên';

      eventBus.emit(OT_EVENTS.REQUEST_CANCELLED, {
        otRequest: updatedRequest,
        employeeName
      });
    }

    return updatedRequest;
  }

  async getAdminRequests(filters = {}, authContext) {
    const userRoleLevel = ROLE.ROLE_LEVEL[authContext.role];
    let departmentId = filters.departmentId;

    if (userRoleLevel === ROLE.ROLE_LEVEL[ROLE.MANAGER]) {
      const deptQuery = await pool.query('SELECT department_id FROM public.employees WHERE employee_id = $1', [authContext.employeeId]);
      departmentId = deptQuery.rows[0]?.department_id;
      if (!departmentId) {
        return { items: [], total: 0 };
      }
    }

    return otRepository.findRequests({
      ...filters,
      departmentId
    });
  }

  async approveRequest(requestId, authContext) {
    const request = await otRepository.findRequestById(requestId);
    if (!request) {
      throw new NotFoundError('Không tìm thấy đơn đăng ký tăng ca');
    }

    if (request.status !== 'PENDING') {
      throw new ValidationError('Chỉ phê duyệt được đơn đăng ký tăng ca đang ở trạng thái chờ duyệt (PENDING)');
    }

    // Role verification
    const performerRoleLevel = ROLE.ROLE_LEVEL[authContext.role];
    if (performerRoleLevel < ROLE.ROLE_LEVEL[ROLE.MANAGER]) {
      throw new ForbiddenError('Chỉ Quản lý hoặc Quản trị viên mới có quyền phê duyệt đơn tăng ca');
    }

    // Hierarchy protection
    const employeeRoleQuery = await pool.query(`
      SELECT r.role_name
      FROM public.accounts a
      JOIN public.roles r ON a.role_id = r.role_id
      WHERE a.employee_id = $1
    `, [request.employeeId]);

    if (employeeRoleQuery.rows.length > 0) {
      const employeeRole = employeeRoleQuery.rows[0].role_name;
      const targetRoleLevel = ROLE.ROLE_LEVEL[employeeRole];
      if (performerRoleLevel <= targetRoleLevel) {
        throw new ForbiddenError('Quy tắc bảo vệ cấp bậc: Bạn không được phép phê duyệt đơn tăng ca của tài khoản có vai trò ngang hàng hoặc cao hơn');
      }
    }

    const client = await pool.connect();
    let transactionSuccess = false;
    let updatedRequest = null;

    try {
      await client.query('BEGIN');

      updatedRequest = await otRepository.updateRequestStatus(requestId, 'APPROVED', {
        approvedBy: authContext.employeeId
      }, client);

      await systemLogRepository.createLog({
        employeeId: authContext.employeeId,
        accountId: authContext.accountId,
        action: 'OT_REQUEST_APPROVE',
        description: `Phê duyệt đơn đăng ký tăng ca #${requestId} của nhân viên #${request.employeeId}`,
        deviceFingerprint: authContext.deviceFingerprint,
        ipAddress: authContext.ipAddress,
        status: 'SUCCESS'
      }, client);

      await client.query('COMMIT');
      transactionSuccess = true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    if (transactionSuccess && updatedRequest) {
      const managerQuery = await pool.query('SELECT full_name FROM public.employees WHERE employee_id = $1', [authContext.employeeId]);
      const approvedByName = managerQuery.rows[0]?.full_name || 'Quản lý';

      eventBus.emit(OT_EVENTS.REQUEST_APPROVED, {
        otRequest: updatedRequest,
        approvedByName
      });
    }

    return updatedRequest;
  }

  async rejectRequest(requestId, rejectReason, authContext) {
    const request = await otRepository.findRequestById(requestId);
    if (!request) {
      throw new NotFoundError('Không tìm thấy đơn đăng ký tăng ca');
    }

    if (request.status !== 'PENDING') {
      throw new ValidationError('Chỉ từ chối được đơn đăng ký tăng ca đang ở trạng thái chờ duyệt (PENDING)');
    }

    if (!rejectReason || rejectReason.trim() === '') {
      throw new BadRequestError('Vui lòng cung cấp lý do từ chối đơn đăng ký tăng ca');
    }

    if (rejectReason.length > 100) {
      throw new ValidationError('Lý do từ chối không được vượt quá 100 ký tự');
    }

    // Role verification
    const performerRoleLevel = ROLE.ROLE_LEVEL[authContext.role];
    if (performerRoleLevel < ROLE.ROLE_LEVEL[ROLE.MANAGER]) {
      throw new ForbiddenError('Chỉ Quản lý hoặc Quản trị viên mới có quyền từ chối đơn tăng ca');
    }

    // Hierarchy protection
    const employeeRoleQuery = await pool.query(`
      SELECT r.role_name
      FROM public.accounts a
      JOIN public.roles r ON a.role_id = r.role_id
      WHERE a.employee_id = $1
    `, [request.employeeId]);

    if (employeeRoleQuery.rows.length > 0) {
      const employeeRole = employeeRoleQuery.rows[0].role_name;
      const targetRoleLevel = ROLE.ROLE_LEVEL[employeeRole];
      if (performerRoleLevel <= targetRoleLevel) {
        throw new ForbiddenError('Quy tắc bảo vệ cấp bậc: Bạn không được phép xử lý đơn tăng ca của tài khoản có vai trò ngang hàng hoặc cao hơn');
      }
    }

    const client = await pool.connect();
    let transactionSuccess = false;
    let updatedRequest = null;

    try {
      await client.query('BEGIN');

      updatedRequest = await otRepository.updateRequestStatus(requestId, 'REJECTED', {
        approvedBy: authContext.employeeId,
        rejectReason
      }, client);

      await systemLogRepository.createLog({
        employeeId: authContext.employeeId,
        accountId: authContext.accountId,
        action: 'OT_REQUEST_REJECT',
        description: `Từ chối đơn đăng ký tăng ca #${requestId} của nhân viên #${request.employeeId}. Lý do: ${rejectReason}`,
        deviceFingerprint: authContext.deviceFingerprint,
        ipAddress: authContext.ipAddress,
        status: 'SUCCESS'
      }, client);

      await client.query('COMMIT');
      transactionSuccess = true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    if (transactionSuccess && updatedRequest) {
      const managerQuery = await pool.query('SELECT full_name FROM public.employees WHERE employee_id = $1', [authContext.employeeId]);
      const rejectedByName = managerQuery.rows[0]?.full_name || 'Quản lý';

      eventBus.emit(OT_EVENTS.REQUEST_REJECTED, {
        otRequest: updatedRequest,
        rejectedByName,
        rejectReason
      });
    }

    return updatedRequest;
  }

  /**
   * Duyệt hoặc từ chối hàng loạt các đơn đăng ký tăng ca.
   * @param {number[]} otRequestIds - Mảng ID các đơn cần xử lý
   * @param {'APPROVED'|'REJECTED'} status - Trạng thái phê duyệt
   * @param {object} approvalData - { rejectReason } (bắt buộc nếu REJECTED)
   * @param {object} authContext - Context của người thực hiện
   * @returns {{ successCount, failedCount, results: Array<{id, status, employeeId?, error?}> }}
   */
  async bulkApproveOrReject(otRequestIds, status, approvalData = {}, authContext) {
    if (!Array.isArray(otRequestIds) || otRequestIds.length === 0) {
      throw new BadRequestError('Danh sách ID đơn đăng ký tăng ca không được để trống');
    }
    if (otRequestIds.length > 50) {
      throw new BadRequestError('Chỉ được xử lý tối đa 50 đơn tăng ca mỗi lần');
    }
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      throw new BadRequestError('Trạng thái phê duyệt không hợp lệ');
    }

    const results = [];

    for (const rawId of otRequestIds) {
      const requestId = parseInt(rawId, 10);
      if (isNaN(requestId) || requestId <= 0) {
        results.push({ id: rawId, status: 'FAILED', error: 'ID đơn tăng ca không hợp lệ' });
        continue;
      }

      try {
        let updated;
        if (status === 'APPROVED') {
          updated = await this.approveRequest(requestId, authContext);
        } else {
          updated = await this.rejectRequest(requestId, approvalData.rejectReason, authContext);
        }

        results.push({
          id: requestId,
          otRequestId: updated.otRequestId,
          employeeId: updated.employeeId,
          status: 'OK',
          newStatus: updated.status,
        });
      } catch (err) {
        results.push({
          id: requestId,
          status: 'FAILED',
          error: err.message || 'Xử lý đơn tăng ca thất bại',
        });
      }
    }

    const successCount = results.filter(r => r.status === 'OK').length;
    const failedCount = results.filter(r => r.status === 'FAILED').length;

    return { successCount, failedCount, results };
  }
}

module.exports = new OtService();
