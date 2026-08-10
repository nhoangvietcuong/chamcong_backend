const webpush = require('web-push');
const { pool } = require('../config/db');
const logger = require('../utils/logger');

// Generate ephemeral keys if not set in .env to prevent boot crashes
let vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
let vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@example.com';

if (!vapidPublicKey || !vapidPrivateKey) {
  logger.warn('🔑 VAPID keys not found in .env. Generating temporary VAPID keys...');
  const keys = webpush.generateVAPIDKeys();
  vapidPublicKey = keys.publicKey;
  vapidPrivateKey = keys.privateKey;
  logger.info(`VAPID Public Key: ${vapidPublicKey}`);
}

try {
  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
} catch (err) {
  logger.error('Failed to set VAPID details:', err.message);
}

class PushNotificationService {
  getPublicKey() {
    return vapidPublicKey;
  }

  /**
   * Registers or updates a subscription.
   */
  async subscribe(employeeId, subscriptionJson, deviceName, browser) {
    const checkQuery = `
      SELECT subscription_id FROM public.push_subscriptions
      WHERE employee_id = $1 AND subscription_json::text = $2::text
    `;
    const checkRes = await pool.query(checkQuery, [employeeId, JSON.stringify(subscriptionJson)]);

    if (checkRes.rows.length > 0) {
      const subId = checkRes.rows[0].subscription_id;
      await pool.query(
        `UPDATE public.push_subscriptions 
         SET is_active = true, last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, device_name = $2, browser = $3
         WHERE subscription_id = $1`,
        [subId, deviceName, browser]
      );
      return subId;
    }

    const insertQuery = `
      INSERT INTO public.push_subscriptions (employee_id, subscription_json, device_name, browser, is_active, last_seen)
      VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP)
      RETURNING subscription_id AS "subscriptionId"
    `;
    const insertRes = await pool.query(insertQuery, [
      employeeId,
      JSON.stringify(subscriptionJson),
      deviceName,
      browser
    ]);
    return insertRes.rows[0].subscriptionId;
  }

  /**
   * Unsubscribes a specific subscription config.
   */
  async unsubscribe(employeeId, subscriptionJson) {
    const deleteQuery = `
      DELETE FROM public.push_subscriptions
      WHERE employee_id = $1 AND subscription_json::text = $2::text
    `;
    await pool.query(deleteQuery, [employeeId, JSON.stringify(subscriptionJson)]);
  }

  /**
   * Dispatches push message payload to all active subscriptions of an employee.
   */
  async sendNotification(employeeId, title, body, tag = 'attendance-reminder') {
    const queryText = `
      SELECT subscription_id AS "subscriptionId", subscription_json AS "subscriptionJson"
      FROM public.push_subscriptions
      WHERE employee_id = $1 AND is_active = true
    `;
    const res = await pool.query(queryText, [employeeId]);
    const subscriptions = res.rows;

    if (subscriptions.length === 0) {
      return 0;
    }

    let sentCount = 0;
    const payload = JSON.stringify({
      title,
      body,
      tag,
      requireInteraction: true,
      vibratePattern: [1000, 500, 1000, 500, 1000, 500, 1000, 500, 1000, 500]
    });

    for (const sub of subscriptions) {
      try {
        const subJson = typeof sub.subscriptionJson === 'string' 
          ? JSON.parse(sub.subscriptionJson) 
          : sub.subscriptionJson;
        
        await webpush.sendNotification(subJson, payload);
        
        // Update last seen
        await pool.query(
          `UPDATE public.push_subscriptions 
           SET last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
           WHERE subscription_id = $1`,
          [sub.subscriptionId]
        );
        sentCount++;
      } catch (err) {
        logger.warn(`Push failed for subscriptionId ${sub.subscriptionId}: ${err.message}`);
        
        // If 404 or 410, subscription is expired/invalid, mark as inactive
        if (err.statusCode === 410 || err.statusCode === 404) {
          await pool.query(
            `UPDATE public.push_subscriptions 
             SET is_active = false, updated_at = CURRENT_TIMESTAMP 
             WHERE subscription_id = $1`,
            [sub.subscriptionId]
          );
        }
      }
    }

    return sentCount;
  }

  /**
   * Logs a sent notification to prevent duplicate reminders.
   */
  async recordNotificationHistory(employeeId, notificationType, targetDate) {
    try {
      await pool.query(
        `INSERT INTO public.notification_history (employee_id, notification_type, target_date)
         VALUES ($1, $2, $3)
         ON CONFLICT (employee_id, notification_type, target_date) DO NOTHING`,
        [employeeId, notificationType, targetDate]
      );
      return true;
    } catch (err) {
      logger.error('Failed to write notification history:', err.message);
      return false;
    }
  }

  /**
   * Checks if a notification has already been sent today.
   */
  async hasBeenNotifiedToday(employeeId, notificationType, targetDate) {
    const res = await pool.query(
      `SELECT 1 FROM public.notification_history
       WHERE employee_id = $1 AND notification_type = $2 AND target_date = $3`,
      [employeeId, notificationType, targetDate]
    );
    return res.rows.length > 0;
  }
}

module.exports = new PushNotificationService();
