const express = require('express');
const roleController = require('../controllers/role-controller');
const authenticate = require('../middlewares/authenticate');
const authorizeMinRole = require('../middlewares/authorizeMinRole');
const ROLE = require('../constants/role.constants');

const router = express.Router();

router.use(authenticate);

router.get('/admin/roles', authorizeMinRole(ROLE.MANAGER), roleController.getRoles);

module.exports = router;
