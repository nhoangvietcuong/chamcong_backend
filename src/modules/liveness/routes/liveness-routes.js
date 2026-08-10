const express = require('express');
const multer = require('multer');
const livenessController = require('../controllers/liveness-controller');
const authenticate = require('../../../middlewares/authenticate');

const router = express.Router();

// Multer memory storage configuration for liveness file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Require authentication for all liveness routes
router.use(authenticate);

// standalone verification route
router.post('/liveness/verify', upload.single('photo'), livenessController.verifyLiveness);

// standalone status route
router.get('/liveness/status', livenessController.getStatus);

module.exports = router;
