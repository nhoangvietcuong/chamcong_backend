const express = require('express');
const attendanceAnalyticsController = require('../controllers/attendance-analytics-controller');
const authenticate = require('../middlewares/authenticate');

const router = express.Router();

router.use(authenticate);

router.get('/attendance/analytics', attendanceAnalyticsController.getMonthlyAnalytics);

module.exports = router;
