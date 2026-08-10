const notificationRepository = require('../repositories/notification-repository');

class NotificationService {
  async createNotification(data, dbClient) {
    return notificationRepository.createNotification(data, dbClient);
  }

  async getMyNotifications(recipientId, filters = {}) {
    const page = parseInt(filters.page || '1', 10);
    const limit = parseInt(filters.limit || '10', 10);
    const isRead = filters.isRead !== undefined ? filters.isRead : undefined;

    const result = await notificationRepository.findNotificationsByRecipient(recipientId, { page, limit, isRead });
    const unreadCount = await notificationRepository.getUnreadCount(recipientId);

    return {
      items: result.items,
      total: result.total,
      unreadCount
    };
  }

  async markAsRead(notificationId, recipientId) {
    const updated = await notificationRepository.markAsRead(notificationId, recipientId);
    if (!updated) {
      throw new Error('Không tìm thấy thông báo hoặc bạn không phải người nhận');
    }
    return updated;
  }

  async markAllAsRead(recipientId) {
    return notificationRepository.markAllAsRead(recipientId);
  }

  async getUnreadCount(recipientId) {
    return notificationRepository.getUnreadCount(recipientId);
  }

  async deleteNotification(notificationId, recipientId) {
    const deleted = await notificationRepository.deleteNotification(notificationId, recipientId);
    if (!deleted) {
      throw new Error('Không tìm thấy thông báo hoặc bạn không phải người nhận');
    }
    return deleted;
  }

  async deleteAllNotifications(recipientId) {
    return notificationRepository.deleteAllNotifications(recipientId);
  }
}

module.exports = new NotificationService();
