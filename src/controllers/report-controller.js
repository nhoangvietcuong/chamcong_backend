const reportService = require('../services/report-service');
const ROLE = require('../constants/role.constants');
const { ForbiddenError } = require('../errors/app-error');
const ERROR_CODE = require('../constants/error-code.constants');

class ReportController {
  async getSummary(req, res, next) {
    try {
      if (ROLE.ROLE_LEVEL[req.auth.role] < ROLE.ROLE_LEVEL[ROLE.MANAGER]) {
        throw new ForbiddenError('Không có quyền xem báo cáo', ERROR_CODE.FORBIDDEN);
      }

      const result = await reportService.getReportsSummary(req.query);

      res.status(200).json({
        success: true,
        message: 'Lấy báo cáo tổng hợp thành công',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async getPayrollReport(req, res, next) {
    try {
      if (ROLE.ROLE_LEVEL[req.auth.role] < ROLE.ROLE_LEVEL[ROLE.MANAGER]) {
        throw new ForbiddenError('Không có quyền xem báo cáo', ERROR_CODE.FORBIDDEN);
      }

      const { fromDate, toDate } = req.query;
      
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
      const monthStart = `${currentYear}-${currentMonth}-01`;
      const lastDay = new Date(currentYear, now.getMonth() + 1, 0).getDate();
      const monthEnd = `${currentYear}-${currentMonth}-${String(lastDay).padStart(2, '0')}`;

      const startDate = fromDate || monthStart;
      const endDate = toDate || monthEnd;

      const result = await reportService.getPayrollReport(startDate, endDate, req.query.holidays);

      res.status(200).json({
        success: true,
        message: 'Lấy báo cáo bảng công tính lương thành công',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ReportController();
