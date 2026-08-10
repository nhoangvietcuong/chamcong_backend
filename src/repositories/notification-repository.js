const { pool } = require('../config/db');

class NotificationRepository {
  async createNotification(data, dbClient = pool) {
    const { recipientId, module, type, title, message } = data;
    const queryText = `
      INSERT INTO public.notifications (recipient_id, module, notification_type, title, message, is_read)
      VALUES ($1, $2, $3, $4, $5, 0)
      RETURNING notification_id as "notificationId", recipient_id as "recipientId", module, notification_type as "type", title, message, is_read as "isRead", created_at as "createdAt";
    `;
    const res = await dbClient.query(queryText, [recipientId, module, type, title, message]);
    return res.rows[0];
  }

  async findNotificationsByRecipient(recipientId, filters = {}, dbClient = pool) {
    const { page = 1, limit = 10, isRead } = filters;
    const offset = (page - 1) * limit;
    const params = [recipientId];
    let whereClauses = ['recipient_id = $1'];

    if (isRead !== undefined) {
      params.push(parseInt(isRead, 10));
      whereClauses.push(`is_read = $${params.length}`);
    }

    const whereStr = `WHERE ${whereClauses.join(' AND ')}`;

    // Get count
    const countRes = await dbClient.query(`
      SELECT COUNT(*)::int AS total
      FROM public.notifications
      ${whereStr}
    `, params);

    // Get list
    params.push(limit, offset);
    const listRes = await dbClient.query(`
      SELECT 
        notification_id as "notificationId",
        recipient_id as "recipientId",
        module,
        notification_type as "type",
        title,
        message,
        is_read as "isRead",
        created_at as "createdAt"
      FROM public.notifications
      ${whereStr}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    return {
      items: listRes.rows,
      total: countRes.rows[0].total
    };
  }

  async markAsRead(notificationId, recipientId, dbClient = pool) {
    const queryText = `
      UPDATE public.notifications
      SET is_read = 1, updated_at = CURRENT_TIMESTAMP
      WHERE notification_id = $1 AND recipient_id = $2
      RETURNING notification_id as "notificationId", is_read as "isRead";
    `;
    const res = await dbClient.query(queryText, [notificationId, recipientId]);
    return res.rows[0];
  }

  async markAllAsRead(recipientId, dbClient = pool) {
    const queryText = `
      UPDATE public.notifications
      SET is_read = 1, updated_at = CURRENT_TIMESTAMP
      WHERE recipient_id = $1 AND is_read = 0
      RETURNING notification_id as "notificationId";
    `;
    const res = await dbClient.query(queryText, [recipientId]);
    return res.rows;
  }

  async getUnreadCount(recipientId, dbClient = pool) {
    const queryText = `
      SELECT COUNT(*)::int AS count
      FROM public.notifications
      WHERE recipient_id = $1 AND is_read = 0;
    `;
    const res = await dbClient.query(queryText, [recipientId]);
    return res.rows[0].count;
  }

  async deleteNotification(notificationId, recipientId, dbClient = pool) {
    const queryText = `
      DELETE FROM public.notifications
      WHERE notification_id = $1 AND recipient_id = $2
      RETURNING notification_id as "notificationId";
    `;
    const res = await dbClient.query(queryText, [notificationId, recipientId]);
    return res.rows[0];
  }

  async deleteAllNotifications(recipientId, dbClient = pool) {
    const queryText = `
      DELETE FROM public.notifications
      WHERE recipient_id = $1
      RETURNING notification_id as "notificationId";
    `;
    const res = await dbClient.query(queryText, [recipientId]);
    return res.rows;
  }
}

module.exports = new NotificationRepository();
