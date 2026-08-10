const attendanceAnalyticsService = require('../services/attendance-analytics.service');
const ROLE = require('../constants/role.constants');
const { ForbiddenError, BadRequestError } = require('../errors/app-error');

class AttendanceAnalyticsController {
  async getMonthlyAnalytics(req, res, next) {
    try {
      let employeeId = req.auth.employeeId;

      // If admin/manager, allow inspecting other employees
      if (req.query.employeeId) {
        if (ROLE.ROLE_LEVEL[req.auth.role] < ROLE.ROLE_LEVEL[ROLE.MANAGER]) {
          throw new ForbiddenError('Bạn không có quyền xem thống kê của nhân viên khác');
        }
        employeeId = parseInt(req.query.employeeId, 10);
        if (isNaN(employeeId)) {
          throw new BadRequestError('ID nhân viên không hợp lệ');
        }
      }

      if (!employeeId) {
        throw new BadRequestError('Không tìm thấy thông tin nhân viên');
      }

      // Fallback range of current month using native Date
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
      
      const currentMonthStart = `${currentYear}-${currentMonth}-01`;
      const lastDay = new Date(currentYear, now.getMonth() + 1, 0).getDate();
      const currentMonthEnd = `${currentYear}-${currentMonth}-${String(lastDay).padStart(2, '0')}`;

      const startDate = req.query.startDate || currentMonthStart;
      const endDate = req.query.endDate || currentMonthEnd;

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
        throw new BadRequestError('Định dạng ngày không hợp lệ. Vui lòng sử dụng YYYY-MM-DD.');
      }

      const startMs = new Date(startDate).getTime();
      const endMs = new Date(endDate).getTime();
      if (isNaN(startMs) || isNaN(endMs)) {
        throw new BadRequestError('Giá trị ngày không hợp lệ.');
      }

      if (startMs > endMs) {
        throw new BadRequestError('Ngày bắt đầu không được sau ngày kết thúc.');
      }

      const analyticsData = await attendanceAnalyticsService.getEmployeeAnalytics(
        employeeId,
        startDate,
        endDate
      );

      res.status(200).json({
        success: true,
        message: 'Lấy thống kê điểm danh thành công',
        data: analyticsData
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AttendanceAnalyticsController();
