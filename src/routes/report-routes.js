const express = require('express');
const reportController = require('../controllers/report-controller');
const authenticate = require('../middlewares/authenticate');
const authorizeMinRole = require('../middlewares/authorizeMinRole');
const { query } = require('express-validator');
const validateRequest = require('../middlewares/validate-request');
const ROLE = require('../constants/role.constants');

const router = express.Router();

router.use(authenticate);

const reportQueryValidator = [
  query('fromDate')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Ngày bắt đầu không đúng định dạng YYYY-MM-DD'),
  query('toDate')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Ngày kết thúc không đúng định dạng YYYY-MM-DD'),
];

router.get(
  '/admin/reports/summary',
  authorizeMinRole(ROLE.MANAGER),
  reportQueryValidator,
  validateRequest,
  reportController.getSummary
);

router.get(
  '/admin/reports/payroll',
  authorizeMinRole(ROLE.MANAGER),
  reportQueryValidator,
  validateRequest,
  reportController.getPayrollReport
);

module.exports = router;
