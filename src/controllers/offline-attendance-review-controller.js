const offlineAttendanceReviewService = require('../services/offline-attendance-review-service');

class OfflineAttendanceReviewController {
  /**
   * GET /api/admin/offline-attendance
   */
  async getReviewList(req, res, next) {
    try {
      const result = await offlineAttendanceReviewService.getReviewList(req.query);
      res.status(200).json({
        success: true,
        message: 'Lấy danh sách kiểm duyệt ngoại tuyến thành công',
        data: result.items,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/admin/offline-attendance/:attendanceId
   */
  async getReviewDetail(req, res, next) {
    try {
      const { attendanceId } = req.params;
      const parsedId = parseInt(attendanceId, 10);
      const result = await offlineAttendanceReviewService.getReviewDetail(parsedId);
      res.status(200).json({
        success: true,
        message: 'Lấy chi tiết kiểm duyệt ngoại tuyến thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/admin/offline-attendance/:attendanceId/approve
   */
  async approveAttendance(req, res, next) {
    try {
      const { attendanceId } = req.params;
      const parsedId = parseInt(attendanceId, 10);
      const reviewedBy = req.auth.accountId;
      const { reviewNote } = req.body;

      const result = await offlineAttendanceReviewService.approveAttendance(parsedId, reviewedBy, reviewNote);
      res.status(200).json({
        success: true,
        message: 'Duyệt chấm công ngoại tuyến thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/admin/offline-attendance/:attendanceId/reject
   */
  async rejectAttendance(req, res, next) {
    try {
      const { attendanceId } = req.params;
      const parsedId = parseInt(attendanceId, 10);
      const reviewedBy = req.auth.accountId;
      const { reviewNote } = req.body;

      const result = await offlineAttendanceReviewService.rejectAttendance(parsedId, reviewedBy, reviewNote);
      res.status(200).json({
        success: true,
        message: 'Từ chối chấm công ngoại tuyến thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new OfflineAttendanceReviewController();
