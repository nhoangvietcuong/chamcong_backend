const express = require('express');
const healthController = require('../controllers/health-controller');

const router = express.Router();

router.get('/health', healthController.checkHealth);
router.get('/health/database', healthController.checkDatabase);

module.exports = router;
