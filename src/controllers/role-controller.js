const roleService = require('../services/role-service');

class RoleController {
  async getRoles(req, res, next) {
    try {
      const roles = await roleService.getRoles();
      res.status(200).json({
        success: true,
        message: 'Lấy danh sách vai trò thành công',
        data: roles
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new RoleController();
