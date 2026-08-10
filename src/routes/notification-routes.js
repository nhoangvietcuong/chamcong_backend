const express = require('express');
const notificationController = require('../controllers/notification-controller');
const pushNotificationService = require('../services/push-notification.service');
const authenticate = require('../middlewares/authenticate');
const authorizeMinRole = require('../middlewares/authorizeMinRole');
const ROLE = require('../constants/role.constants');

const router = express.Router();

// Apply authentication middleware to all endpoints below
router.use(authenticate);

// 1. Web Push Notification endpoints (maintained from original implementation)
router.get('/notification/vapid-key', authorizeMinRole(ROLE.EMPLOYEE), (req, res) => {
  try {
    const publicKey = pushNotificationService.getPublicKey();
    res.status(200).json({
      success: true,
      data: { publicKey }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/notification/subscribe', authorizeMinRole(ROLE.EMPLOYEE), async (req, res, next) => {
  try {
    const { subscription, deviceName, browser } = req.body;
    const subscriptionId = await pushNotificationService.subscribe(
      req.auth.employeeId,
      subscription,
      deviceName,
      browser
    );
    res.status(200).json({
      success: true,
      message: 'Đăng ký thông báo push thành công',
      data: { subscriptionId }
    });
  } catch (err) {
    next(err);
  }
});

router.post('/notification/unsubscribe', authorizeMinRole(ROLE.EMPLOYEE), async (req, res, next) => {
  try {
    const { subscription } = req.body;
    await pushNotificationService.unsubscribe(req.auth.employeeId, subscription);
    res.status(200).json({
      success: true,
      message: 'Hủy đăng ký thông báo push thành công'
    });
  } catch (err) {
    next(err);
  }
});

// 2. In-App Notification endpoints (new features)
router.get('/notifications', authorizeMinRole(ROLE.EMPLOYEE), notificationController.getMyNotifications);
router.patch('/notifications/:id/read', authorizeMinRole(ROLE.EMPLOYEE), notificationController.markAsRead);
router.post('/notifications/read-all', authorizeMinRole(ROLE.EMPLOYEE), notificationController.markAllAsRead);
router.get('/notifications/unread-count', authorizeMinRole(ROLE.EMPLOYEE), notificationController.getUnreadCount);
router.delete('/notifications', authorizeMinRole(ROLE.EMPLOYEE), notificationController.deleteAllNotifications);
router.delete('/notifications/:id', authorizeMinRole(ROLE.EMPLOYEE), notificationController.deleteNotification);

module.exports = router;
