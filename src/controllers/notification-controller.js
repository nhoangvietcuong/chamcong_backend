const notificationService = require('../services/notification-service');
const { getPagination } = require('../utils/pagination');

class NotificationController {
  async getMyNotifications(req, res, next) {
    try {
      const page = parseInt(req.query.page || '1', 10);
      const limit = parseInt(req.query.limit || '10', 10);
      const { isRead } = req.query;

      const result = await notificationService.getMyNotifications(req.auth.employeeId, { page, limit, isRead });
      res.status(200).json({
        success: true,
        message: 'Lấy danh sách thông báo thành công',
        data: {
          items: result.items,
          pagination: getPagination(page, limit, result.total),
          unreadCount: result.unreadCount
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async markAsRead(req, res, next) {
    try {
      const { id } = req.params;
      const result = await notificationService.markAsRead(id, req.auth.employeeId);
      res.status(200).json({
        success: true,
        message: 'Đánh dấu đã đọc thông báo thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async markAllAsRead(req, res, next) {
    try {
      await notificationService.markAllAsRead(req.auth.employeeId);
      const unreadCount = await notificationService.getUnreadCount(req.auth.employeeId);
      res.status(200).json({
        success: true,
        message: 'Đánh dấu tất cả thông báo là đã đọc thành công',
        data: { unreadCount }
      });
    } catch (err) {
      next(err);
    }
  }

  async getUnreadCount(req, res, next) {
    try {
      const count = await notificationService.getUnreadCount(req.auth.employeeId);
      res.status(200).json({
        success: true,
        message: 'Lấy số lượng thông báo chưa đọc thành công',
        data: { unreadCount: count }
      });
    } catch (err) {
      next(err);
    }
  }

  async deleteNotification(req, res, next) {
    try {
      const { id } = req.params;
      const result = await notificationService.deleteNotification(id, req.auth.employeeId);
      res.status(200).json({
        success: true,
        message: 'Xóa thông báo thành công',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async deleteAllNotifications(req, res, next) {
    try {
      await notificationService.deleteAllNotifications(req.auth.employeeId);
      res.status(200).json({
        success: true,
        message: 'Xóa tất cả thông báo thành công'
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new NotificationController();
