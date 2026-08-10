const leaveRepository = require('../repositories/leave-repository');
const systemLogRepository = require('../repositories/system-log-repository');
const { pool } = require('../config/db');
const { NotFoundError, ForbiddenError, ValidationError, BadRequestError } = require('../errors/app-error');
const ROLE = require('../constants/role.constants');
const { eventBus, LEAVE_EVENTS } = require('../events/leave-events');
const systemSettingsInMemory = require('../config/system-settings');

class LeaveService {
  // Helper to calculate days count between two dates (inclusive)
  _calculateDaysCount(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const timeDiff = end.getTime() - start.getTime();
    if (timeDiff < 0) return 0;
    return Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;
  }

  async createRequest(data, authContext) {
    const { employeeId, leaveType, startDate, endDate, reason } = data;

    if (String(authContext.employeeId) !== String(employeeId)) {
      throw new ForbiddenError('Bạn không có quyền tạo đơn xin nghỉ phép cho nhân viên khác');
    }

    if (reason && reason.length > 100) {
      throw new ValidationError('Lý do nghỉ phép không được vượt quá 100 ký tự');
    }

    const daysCount = this._calculateDaysCount(startDate, endDate);
    if (daysCount <= 0) {
      throw new BadRequestError('Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu');
    }

    // 1. Business Rule: Overlap Check
    const isOverlapping = await leaveRepository.checkOverlap(employeeId, startDate, endDate);
    if (isOverlapping) {
      throw new ValidationError('Thời gian xin nghỉ phép bị trùng với một đơn khác đang chờ duyệt hoặc đã được phê duyệt');
    }

    // 2. Business Rule: Balance Check
    const startYear = new Date(startDate).getFullYear();
    const balance = await this.getEmployeeLeaveBalance(employeeId, startYear);
    if (!balance) {
      throw new ValidationError(`Không tìm thấy số dư nghỉ phép cho năm ${startYear}. Vui lòng liên hệ Quản lý.`);
    }

    if (leaveType === 'ANNUAL') {
      const currentUsed = parseFloat(balance.annualDaysUsed || 0);
      const totalAllowed = parseFloat(balance.annualDaysTotal || 0);
      if (currentUsed + daysCount > totalAllowed) {
        throw new ValidationError(`Số dư phép năm không đủ. Bạn chỉ còn lại ${totalAllowed - currentUsed} ngày nghỉ phép năm.`);
      }
    } else if (leaveType === 'SICK') {
      const currentUsed = parseFloat(balance.sickDaysUsed || 0);
      const totalAllowed = parseFloat(systemSettingsInMemory.defaultSickLeaveDays || 10);
      if (currentUsed + daysCount > totalAllowed) {
        throw new ValidationError(`Số ngày nghỉ bệnh vượt quá giới hạn cho phép. Bạn đã dùng ${currentUsed}/${totalAllowed} ngày.`);
      }
    } else if (leaveType === 'MARRIAGE') {
      const currentUsed = parseFloat(balance.marriageDaysUsed || 0);
      const totalAllowed = parseFloat(systemSettingsInMemory.defaultMarriageLeaveDays || 3);
      if (currentUsed + daysCount > totalAllowed) {
        throw new ValidationError(`Số ngày nghỉ cưới vượt quá giới hạn cho phép. Bạn đã dùng ${currentUsed}/${totalAllowed} ngày.`);
      }
    } else if (leaveType === 'MATERNITY') {
      const currentUsed = parseFloat(balance.maternityDaysUsed || 0);
      const totalAllowed = parseFloat(systemSettingsInMemory.defaultMaternityLeaveDays || 180);
      if (currentUsed + daysCount > totalAllowed) {
        throw new ValidationError(`Số ngày nghỉ thai sản vượt quá giới hạn cho phép. Bạn đã dùng ${currentUsed}/${totalAllowed} ngày.`);
      }
    } else if (leaveType === 'OTHER') {
      const currentUsed = parseFloat(balance.otherDaysUsed || 0);
      const totalAllowed = parseFloat(systemSettingsInMemory.defaultOtherLeaveDays || 5);
      if (currentUsed + daysCount > totalAllowed) {
        throw new ValidationError(`Số ngày nghỉ khác vượt quá giới hạn cho phép. Bạn đã dùng ${currentUsed}/${totalAllowed} ngày.`);
      }
    }

    // Insert request
    return leaveRepository.createRequest({
      employeeId,
      leaveType,
      startDate,
      endDate,
      reason,
      evidenceUrl: data.evidenceUrl
    });
  }

  async getLeaveRequestDetails(requestId, authContext) {
    const request = await leaveRepository.findRequestById(requestId);
    if (!request) {
      throw new NotFoundError('Không tìm thấy đơn xin nghỉ phép');
    }

    // Employee can only view their own request
    const userRoleLevel = ROLE.ROLE_LEVEL[authContext.role];
    const isOwner = String(authContext.employeeId) === String(request.employeeId);
    if (userRoleLevel < ROLE.ROLE_LEVEL[ROLE.MANAGER] && !isOwner) {
      throw new ForbiddenError('Bạn không có quyền xem thông tin đơn xin nghỉ phép này');
    }

    return request;
  }

  async cancelRequest(requestId, authContext) {
    const request = await leaveRepository.findRequestById(requestId);
    if (!request) {
      throw new NotFoundError('Không tìm thấy đơn xin nghỉ phép');
    }

    const isOwner = String(authContext.employeeId) === String(request.employeeId);
    const isManagerOrAbove = ROLE.ROLE_LEVEL[authContext.role] >= ROLE.ROLE_LEVEL[ROLE.MANAGER];

    if (!isOwner && !isManagerOrAbove) {
      throw new ForbiddenError('Bạn không có quyền hủy đơn xin nghỉ phép này');
    }

    if (request.status === 'CANCELLED' || request.status === 'REJECTED') {
      throw new ValidationError('Đơn xin nghỉ phép đã được hủy hoặc đã bị từ chối');
    }

    const client = await pool.connect();
    let transactionSuccess = false;
    let updatedRequest = null;

    try {
      await client.query('BEGIN');

      if (request.status === 'PENDING') {
        // Pending requests can be cancelled directly by owner or manager
        updatedRequest = await leaveRepository.updateRequestStatus(requestId, 'CANCELLED', {}, client);
      } else if (request.status === 'APPROVED') {
        // Rules for Approved leave
        const startDateObj = new Date(request.startDate);
        const isFuture = new Date() < startDateObj;

        if (!isFuture && !isManagerOrAbove) {
          throw new ForbiddenError('Đơn nghỉ phép đã bắt đầu hoặc đã qua. Bạn không thể tự hủy, vui lòng liên hệ Quản lý.');
        }

        // Refund leave balance if it is ANNUAL leave
        if (request.leaveType === 'ANNUAL') {
          const startYear = new Date(request.startDate).getFullYear();
          const daysCount = this._calculateDaysCount(request.startDate, request.endDate);
          await leaveRepository.updateLeaveBalance(request.employeeId, startYear, 'ANNUAL', -daysCount, client);
        }

        updatedRequest = await leaveRepository.updateRequestStatus(requestId, 'CANCELLED', {}, client);

        // Ghi log hủy đơn đã phê duyệt
        await systemLogRepository.createLog({
          employeeId: authContext.employeeId,
          accountId: authContext.accountId,
          action: 'LEAVE_CANCELLED',
          description: `Đơn nghỉ phép #${requestId} của nhân viên #${request.employeeId} đã bị hủy.`,
          deviceFingerprint: authContext.deviceFingerprint,
          ipAddress: authContext.ipAddress,
          status: 'SUCCESS'
        }, client);
      }

      await client.query('COMMIT');
      transactionSuccess = true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Publish cancel event (e.g. if we want to log it or notify managers)
    if (transactionSuccess && updatedRequest) {
      eventBus.emit(LEAVE_EVENTS.REQUEST_CANCELLED, { leaveRequest: updatedRequest, cancelledBy: authContext.employeeId });
    }

    return updatedRequest;
  }

  async approveOrReject(requestId, status, approvalData = {}, authContext) {
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      throw new BadRequestError('Trạng thái phê duyệt không hợp lệ');
    }

    const performerRoleLevel = ROLE.ROLE_LEVEL[authContext.role];
    if (performerRoleLevel < ROLE.ROLE_LEVEL[ROLE.ADMIN]) {
      throw new ForbiddenError('Chỉ có Quản trị viên hoặc Quản lý cấp cao mới được thực hiện thao tác phê duyệt đơn nghỉ phép');
    }

    const request = await leaveRepository.findRequestById(requestId);
    if (!request) {
      throw new NotFoundError('Không tìm thấy đơn xin nghỉ phép');
    }

    if (request.status !== 'PENDING') {
      throw new ValidationError('Đơn xin nghỉ phép này đã được xử lý từ trước');
    }

    // Higher Role Protection check
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
        throw new ForbiddenError('Quy tắc bảo vệ cấp bậc: Bạn không được phép phê duyệt/xử lý đơn nghỉ phép của tài khoản có vai trò ngang hàng hoặc cao hơn');
      }
    }

    const client = await pool.connect();
    let transactionSuccess = false;
    let updatedRequest = null;

    try {
      await client.query('BEGIN');

      if (status === 'APPROVED') {
        const daysCount = this._calculateDaysCount(request.startDate, request.endDate);
        const startYear = new Date(request.startDate).getFullYear();

        // 1. Deduct leave balance
        await leaveRepository.updateLeaveBalance(request.employeeId, startYear, request.leaveType, daysCount, client);

        // 2. Update Request Status
        updatedRequest = await leaveRepository.updateRequestStatus(requestId, 'APPROVED', {
          approvedBy: authContext.employeeId
        }, client);

        // 3. Log Audit
        await systemLogRepository.createLog({
          employeeId: authContext.employeeId,
          accountId: authContext.accountId,
          action: 'LEAVE_APPROVE',
          description: `Đơn nghỉ phép #${requestId} của nhân viên #${request.employeeId} đã được phê duyệt.`,
          deviceFingerprint: authContext.deviceFingerprint,
          ipAddress: authContext.ipAddress,
          status: 'SUCCESS'
        }, client);

      } else {
        const { rejectReason } = approvalData;
        if (!rejectReason || rejectReason.trim() === '') {
          throw new BadRequestError('Vui lòng cung cấp lý do từ chối đơn xin nghỉ phép');
        }
        if (rejectReason && rejectReason.length > 100) {
          throw new ValidationError('Lý do từ chối không được vượt quá 100 ký tự');
        }

        // 1. Update Request Status
        updatedRequest = await leaveRepository.updateRequestStatus(requestId, 'REJECTED', {
          approvedBy: authContext.employeeId,
          rejectReason: rejectReason
        }, client);

        // 2. Log Audit
        await systemLogRepository.createLog({
          employeeId: authContext.employeeId,
          accountId: authContext.accountId,
          action: 'LEAVE_REJECT',
          description: `Đơn nghỉ phép #${requestId} của nhân viên #${request.employeeId} bị từ chối. Lý do: ${rejectReason}`,
          deviceFingerprint: authContext.deviceFingerprint,
          ipAddress: authContext.ipAddress,
          status: 'SUCCESS'
        }, client);
      }

      await client.query('COMMIT');
      transactionSuccess = true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Emit event outside of the transaction block (Event-Driven Integration)
    if (transactionSuccess && updatedRequest) {
      // Get manager's full name for notification content
      const managerQuery = await pool.query('SELECT full_name FROM public.employees WHERE employee_id = $1', [authContext.employeeId]);
      const managerName = managerQuery.rows[0]?.full_name || 'Quản lý';

      const eventName = status === 'APPROVED' ? LEAVE_EVENTS.REQUEST_APPROVED : LEAVE_EVENTS.REQUEST_REJECTED;
      eventBus.emit(eventName, {
        leaveRequest: updatedRequest,
        managerName,
        rejectReason: approvalData.rejectReason
      });
    }

    return updatedRequest;
  }

  async getMyRequests(employeeId, filters = {}) {
    return leaveRepository.findRequests({
      ...filters,
      employeeId
    });
  }

  async getAdminRequests(filters = {}, authContext) {
    const userRoleLevel = ROLE.ROLE_LEVEL[authContext.role];
    let departmentId = filters.departmentId;

    // Managers can only see requests within their own department
    if (userRoleLevel === ROLE.ROLE_LEVEL[ROLE.MANAGER]) {
      const deptQuery = await pool.query('SELECT department_id FROM public.employees WHERE employee_id = $1', [authContext.employeeId]);
      departmentId = deptQuery.rows[0]?.department_id;
      if (!departmentId) {
        return { items: [], total: 0 };
      }
    }

    return leaveRepository.findRequests({
      ...filters,
      departmentId
    });
  }

  async getMyLeaveBalance(employeeId, year = new Date().getFullYear()) {
    return this.getEmployeeLeaveBalance(employeeId, year);
  }

  async getEmployeeLeaveBalance(employeeId, year = new Date().getFullYear()) {
    let balance = await leaveRepository.getLeaveBalance(employeeId, year);
    if (!balance) {
      // Seed a default one if not found
      const defaultTotal = parseFloat(systemSettingsInMemory.defaultAnnualLeaveDays || 12.0);
      await pool.query(`
        INSERT INTO public.leave_balances (employee_id, year, annual_days_total, annual_days_used)
        VALUES ($1, $2, $3, 0.0)
        ON CONFLICT (employee_id, year) DO NOTHING;
      `, [employeeId, year, defaultTotal]);
      balance = await leaveRepository.getLeaveBalance(employeeId, year);
    }
    return balance;
  }

  /**
   * Duyệt hoặc từ chối hàng loạt các đơn nghỉ phép (Phương án B: skip lỗi, tiếp tục các đơn hợp lệ).
   * @param {number[]} leaveRequestIds - Mảng ID các đơn cần xử lý
   * @param {'APPROVED'|'REJECTED'} status - Trạng thái phê duyệt
   * @param {object} approvalData - { rejectReason } (bắt buộc nếu REJECTED)
   * @param {object} authContext - Context của người thực hiện
   * @returns {{ successCount, failedCount, results: Array<{id, status, employeeName?, error?}> }}
   */
  async bulkApproveOrReject(leaveRequestIds, status, approvalData = {}, authContext) {
    if (!Array.isArray(leaveRequestIds) || leaveRequestIds.length === 0) {
      throw new BadRequestError('Danh sách ID đơn nghỉ phép không được để trống');
    }
    if (leaveRequestIds.length > 50) {
      throw new BadRequestError('Chỉ được xử lý tối đa 50 đơn nghỉ phép mỗi lần');
    }
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      throw new BadRequestError('Trạng thái phê duyệt không hợp lệ');
    }

    const results = [];

    for (const rawId of leaveRequestIds) {
      const requestId = parseInt(rawId, 10);
      if (isNaN(requestId) || requestId <= 0) {
        results.push({ id: rawId, status: 'FAILED', error: 'ID đơn nghỉ phép không hợp lệ' });
        continue;
      }

      try {
        const updated = await this.approveOrReject(requestId, status, approvalData, authContext);
        results.push({
          id: requestId,
          leaveRequestId: updated.leaveRequestId,
          employeeId: updated.employeeId,
          status: 'OK',
          newStatus: updated.status,
        });
      } catch (err) {
        results.push({
          id: requestId,
          status: 'FAILED',
          error: err.message || 'Xử lý đơn thất bại',
        });
      }
    }

    const successCount = results.filter(r => r.status === 'OK').length;
    const failedCount = results.filter(r => r.status === 'FAILED').length;

    return { successCount, failedCount, results };
  }

  async updateTotalLeaveDays(employeeId, year, annualDaysTotal) {
    let balance = await leaveRepository.getLeaveBalance(employeeId, year);
    if (!balance) {
      const seeded = await pool.query(`
        INSERT INTO public.leave_balances (employee_id, year, annual_days_total, annual_days_used)
        VALUES ($1, $2, $3, 0.0)
        RETURNING leave_balance_id as "leaveBalanceId", annual_days_total as "annualDaysTotal";
      `, [employeeId, year, annualDaysTotal]);
      return seeded.rows[0];
    }

    const res = await pool.query(`
      UPDATE public.leave_balances
      SET annual_days_total = $1, updated_at = CURRENT_TIMESTAMP
      WHERE employee_id = $2 AND year = $3
      RETURNING leave_balance_id as "leaveBalanceId", annual_days_total as "annualDaysTotal";
    `, [annualDaysTotal, employeeId, year]);
    
    return res.rows[0];
  }
}

module.exports = new LeaveService();
